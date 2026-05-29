"""Gmail watcher that monitors inbox and creates email files in Inbox folder.

This script only feeds the Inbox folder and does not modify the Bronze pipeline.
"""

import base64
import json
import logging
import logging.handlers
import os
import re
import socket
from datetime import datetime
from pathlib import Path
from time import sleep
import sys

# FIX: Load .env before any other import that may need env vars
from dotenv import load_dotenv

load_dotenv()

# FIX: filelock prevents race conditions on processed_emails.json
from filelock import FileLock

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ------------------------------------------------------------------
# Structured rotating logger — prevents unbounded log file growth
# FIX: Replaced bare basicConfig with RotatingFileHandler
# ------------------------------------------------------------------
_file_handler = logging.handlers.RotatingFileHandler(
    str(Path(__file__).parent.parent / "gmail_watcher.log"),
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=3,              # keep 3 rotated backups
)
_stream_handler = logging.StreamHandler()
_fmt = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
_file_handler.setFormatter(_fmt)
_stream_handler.setFormatter(_fmt)

logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
logger = logging.getLogger(__name__)

# FIX: Set a global socket timeout so Gmail API calls can never hang forever
socket.setdefaulttimeout(30)

# Gmail API scope — read and modify (to mark as read)
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

# FIX: Retry budget for transient API errors (rate-limit / server errors)
MAX_API_RETRIES = 3


class GmailInboxWatcher:
    """Watcher for Gmail that creates email files in Inbox folder."""

    def __init__(
        self,
        credentials_path: str = None,
        token_path: str = None,
        inbox_path: str = None,
        processed_file: str = None,
    ):
        # FIX: Load all paths from env so they are configurable without code changes
        self.credentials_path = Path(
            credentials_path
            or os.getenv("GMAIL_CREDENTIALS_PATH", "credentials.json")
        )
        self.token_path = Path(
            token_path or os.getenv("GMAIL_TOKEN_PATH", "token.json")
        )
        self.inbox_path = Path(
            inbox_path
            or os.getenv("INBOX_PATH", "vault/AI_Employee_Vault/Inbox/email")
        )
        self.processed_file = Path(
            processed_file
            or os.getenv("PROCESSED_EMAILS_PATH", "processed_emails.json")
        )
        self.service = None

        # FIX: Lock file prevents two processes corrupting processed_emails.json
        self._lock = FileLock(str(self.processed_file) + ".lock")

        # FIX: Validate environment before starting — fail fast with clear errors
        self._check_startup()

        # Load processed email IDs
        self.processed_ids = self._load_processed_ids()

    # ------------------------------------------------------------------
    # Startup validation
    # ------------------------------------------------------------------

    def _check_startup(self):
        """Validate paths and permissions on startup."""
        # Ensure inbox is writable
        self.inbox_path.mkdir(parents=True, exist_ok=True)
        test = self.inbox_path / ".write_test"
        try:
            test.touch()
            test.unlink()
        except OSError as e:
            raise RuntimeError(
                f"Inbox path is not writable: {self.inbox_path}\nError: {e}"
            ) from e

        if not self.credentials_path.exists():
            logger.warning(
                f"Gmail credentials not found: {self.credentials_path}. "
                "Download from Google Cloud Console — OAuth will fail at auth time."
            )

    # ------------------------------------------------------------------
    # Processed-set persistence (locked + atomic)
    # ------------------------------------------------------------------

    def _load_processed_ids(self) -> set:
        """Load previously processed email IDs from JSON file."""
        with self._lock:
            if self.processed_file.exists():
                try:
                    with open(self.processed_file, "r") as f:
                        data = json.load(f)
                        return set(data.get("processed_ids", []))
                except (json.JSONDecodeError, IOError) as e:
                    logger.error(f"Error loading processed emails (starting fresh): {e}")
                    return set()
        return set()

    def _save_processed_id(self, email_id: str):
        """Atomically save a processed email ID to prevent duplicate processing.

        FIX: write-to-temp + os.replace() — crash-safe, no half-written files.
        FIX: Acquired under lock to prevent concurrent writes from two processes.
        """
        self.processed_ids.add(email_id)
        with self._lock:
            try:
                data = {"processed_ids": list(self.processed_ids)}
                tmp = self.processed_file.with_suffix(".tmp")
                with open(tmp, "w") as f:
                    json.dump(data, f, indent=2)
                os.replace(str(tmp), str(self.processed_file))
            except IOError as e:
                logger.error(f"Error saving processed email ID: {e}")

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    # ── Keyring helpers ───────────────────────────────────────────────────────

    _KEYRING_SERVICE  = "ai_employee"
    _KEYRING_USERNAME = "gmail_oauth_token"

    def _save_token(self, creds: Credentials) -> None:
        """Save OAuth token.

        Strategy (most secure first):
          1. Windows  → Windows Credential Manager (DPAPI-encrypted, user-scoped)
                        + file copy as fallback
          2. Unix     → file at token_path with 0o600 permissions
        """
        token_json = creds.to_json()

        if sys.platform == "win32":
            try:
                import keyring
                keyring.set_password(self._KEYRING_SERVICE, self._KEYRING_USERNAME, token_json)
                logger.info("Token saved to Windows Credential Manager (DPAPI-encrypted)")
                # Keep a file copy so mcp_server.py can also load it on restart
                self._write_token_file(token_json)
                return
            except Exception as e:
                logger.warning(f"keyring save failed ({e}) — saving to file only")

        self._write_token_file(token_json)
        try:
            os.chmod(str(self.token_path), 0o600)
            logger.info(f"Token saved to {self.token_path} (permissions: 0600)")
        except OSError:
            logger.warning("Could not set token permissions to 0600 (Windows) — token is still saved")

    def _write_token_file(self, token_json: str) -> None:
        """Atomically write token JSON to file."""
        tmp_token = self.token_path.with_suffix(".tmp")
        tmp_token.write_text(token_json, encoding="utf-8")
        os.replace(str(tmp_token), str(self.token_path))

    def _load_token(self) -> Credentials | None:
        """Load OAuth token — Windows Credential Manager first, then file."""
        if sys.platform == "win32":
            try:
                import keyring
                token_json = keyring.get_password(self._KEYRING_SERVICE, self._KEYRING_USERNAME)
                if token_json:
                    logger.info("Token loaded from Windows Credential Manager")
                    return Credentials.from_authorized_user_info(
                        json.loads(token_json), SCOPES
                    )
            except Exception as e:
                logger.warning(f"keyring load failed ({e}) — trying file")

        if self.token_path.exists():
            logger.info("Loaded existing OAuth token from file")
            return Credentials.from_authorized_user_file(str(self.token_path), SCOPES)

        return None

    def _authenticate(self) -> Credentials:
        """Authenticate with Gmail API using OAuth."""
        creds = self._load_token()

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                logger.info("Refreshing expired token")
                creds.refresh(Request())
            else:
                if not self.credentials_path.exists():
                    raise FileNotFoundError(
                        f"Credentials file not found: {self.credentials_path}\n"
                        "Download it from Google Cloud Console."
                    )
                logger.info("Running OAuth flow for new token")
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.credentials_path), SCOPES
                )
                creds = flow.run_local_server(port=0)

            self._save_token(creds)

        return creds

    def _get_service(self):
        """Get Gmail API service instance (cached after first call)."""
        if self.service is None:
            creds = self._authenticate()
            self.service = build("gmail", "v1", credentials=creds)
        return self.service

    # ------------------------------------------------------------------
    # Email body extraction
    # ------------------------------------------------------------------

    def _extract_body(self, payload: dict) -> str:
        """Extract readable body from email payload.

        FIX: Prefers plain text; falls back to HTML → plain-text conversion
        via BeautifulSoup so HTML-only emails are not silently dropped.
        """
        plain = self._extract_mime(payload, "text/plain")
        if plain:
            return plain

        # FIX: Fallback to HTML extraction
        html = self._extract_mime(payload, "text/html")
        if html:
            return self._html_to_text(html)

        return "[No content found]"

    def _extract_mime(self, payload: dict, mime_type: str) -> str:
        """Recursively extract a specific MIME type from email payload."""
        if payload.get("mimeType") == mime_type:
            data = payload.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")

        for part in payload.get("parts", []):
            result = self._extract_mime(part, mime_type)
            if result:
                return result

        return ""

    def _html_to_text(self, html: str) -> str:
        """Convert HTML email body to plain text.

        FIX: Uses BeautifulSoup for robust HTML stripping.
        Falls back to regex if bs4 is not installed.
        """
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            # Remove script and style noise
            for tag in soup(["script", "style"]):
                tag.decompose()
            text = soup.get_text(separator="\n")
            # Collapse excessive blank lines
            lines = [line.strip() for line in text.splitlines()]
            return "\n".join(line for line in lines if line)
        except ImportError:
            logger.warning(
                "beautifulsoup4 not installed — stripping HTML tags with regex. "
                "Run: uv add beautifulsoup4"
            )
            return re.sub(r"<[^>]+>", "", html).strip()

    # ------------------------------------------------------------------
    # Filename helpers
    # ------------------------------------------------------------------

    def _sanitize_sender(self, sender: str) -> str:
        """Extract readable name from 'Name <email>' or plain email format.

        FIX: Removes path-traversal characters (.. / \\) in addition to
        special chars so filenames cannot escape the inbox directory.
        """
        match = re.match(r'^"?([^"<]+)"?\s*<', sender)
        if match:
            name = match.group(1).strip()
        else:
            email_match = re.search(r"[\w.+-]+@", sender)
            name = email_match.group(0).rstrip("@") if email_match else sender

        # Remove non-word characters
        clean = re.sub(r"[^\w\s-]", "", name)
        clean = re.sub(r"[\s_]+", "_", clean).strip("_")
        # FIX: Explicitly block path-traversal sequences
        clean = clean.replace("..", "").replace("/", "").replace("\\", "")
        return clean[:25] or "unknown"

    def _unique_inbox_path(self, base_name: str) -> Path:
        """Return a guaranteed-unique inbox path using a datetime stamp.

        FIX: Always include a timestamp so the same sender's emails never
        reuse a filename that is already in .processed_inbox.json (which
        caused new emails from repeat senders to be silently skipped).
        """
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        return self.inbox_path / f"email_{base_name}_{ts}.txt"

    # ------------------------------------------------------------------
    # API call wrapper with retry + timeout
    # ------------------------------------------------------------------

    def _api_call(self, request_builder):
        """Execute a Gmail API request with exponential-backoff retry.

        FIX: Retries on rate-limit (429) and transient server errors (5xx).
        Socket timeout is already enforced globally (socket.setdefaulttimeout).
        """
        for attempt in range(1, MAX_API_RETRIES + 1):
            try:
                return request_builder.execute()
            except HttpError as e:
                status_code = int(e.resp.status)
                if status_code in (429, 500, 503) and attempt < MAX_API_RETRIES:
                    wait = 2 ** attempt  # 2 s, 4 s
                    logger.warning(
                        f"Gmail API error {status_code} — "
                        f"retry {attempt}/{MAX_API_RETRIES} in {wait}s"
                    )
                    sleep(wait)
                else:
                    raise
            except socket.timeout:
                if attempt < MAX_API_RETRIES:
                    wait = 2 ** attempt
                    logger.warning(
                        f"Gmail API call timed out — "
                        f"retry {attempt}/{MAX_API_RETRIES} in {wait}s"
                    )
                    sleep(wait)
                else:
                    raise

    # ------------------------------------------------------------------
    # Email check + process
    # ------------------------------------------------------------------

    def _get_filter_query(self) -> str:
        """Build Gmail search query for unread emails."""
        return "is:unread newer_than:7d"

    def check_emails(self) -> list:
        """Check for unread emails matching filter criteria."""
        try:
            service = self._get_service()
            query = self._get_filter_query()
            logger.info(f"Checking emails with query: {query}")

            # FIX: Wrapped in retry helper
            results = self._api_call(
                service.users().messages().list(userId="me", q=query)
            )

            messages = results.get("messages", [])
            new_emails = [m for m in messages if m["id"] not in self.processed_ids]

            if new_emails:
                logger.info(f"Found {len(new_emails)} new email(s)")
            else:
                logger.debug("No new emails found")

            return new_emails

        except Exception as e:
            # FIX: logger.exception captures full traceback — not just message
            logger.exception(f"Error checking emails: {e}")
            return []

    def process_email(self, message: dict):
        """Process a single email — extract data and create file.

        FIX: Mark email as processed on disk BEFORE writing the inbox file.
        This is the 'mark-then-process' pattern: if the process crashes after
        marking but before writing, the email is skipped on restart (acceptable
        loss) rather than being written twice (duplicate processing).
        """
        msg_id = message["id"]
        try:
            service = self._get_service()

            # Guard: skip if this Gmail ID was already processed (in-memory check)
            # This catches restarts where processed_emails.json was preserved but
            # _mark_as_read() had previously failed (email still shows as unread)
            if msg_id in self.processed_ids:
                logger.debug(f"Skipping already-processed email: {msg_id[:8]}...")
                return

            # FIX: Persist ID first — prevents duplicate processing on restart
            self._save_processed_id(msg_id)

            # FIX: Wrapped in retry helper
            msg_detail = self._api_call(
                service.users().messages().get(userId="me", id=msg_id)
            )

            headers = msg_detail["payload"].get("headers", [])
            subject = "No Subject"
            sender = "Unknown"

            for header in headers:
                if header["name"] == "Subject":
                    subject = header["value"]
                elif header["name"] == "From":
                    sender = header["value"]

            body = self._extract_body(msg_detail["payload"])

            # FIX: Sanitize sender before using in file path
            safe_sender = self._sanitize_sender(sender)
            filepath = self._unique_inbox_path(safe_sender)

            content = f"""From: {sender}
Subject: {subject}

Body:
{body}
"""
            filepath.write_text(content, encoding="utf-8")
            logger.info(f"Created email file: {filepath}")

            self._mark_as_read(msg_id)

        except Exception as e:
            logger.exception(f"Error processing email {msg_id}: {e}")

    def _mark_as_read(self, msg_id: str):
        """Mark email as read by removing UNREAD label."""
        try:
            service = self._get_service()
            self._api_call(
                service.users().messages().modify(
                    userId="me",
                    id=msg_id,
                    body={"removeLabelIds": ["UNREAD"]},
                )
            )
            logger.info(f"Marked email {msg_id[:8]}... as read")
        except Exception as e:
            logger.exception(f"Error marking email as read: {e}")

    def run(self):
        """Run the watcher continuously."""
        # FIX: Check interval is configurable via env — no code change needed
        check_interval = int(os.getenv("GMAIL_CHECK_INTERVAL", "30"))

        logger.info("=" * 50)
        logger.info("Gmail Inbox Watcher Started")
        logger.info(f"Inbox folder: {self.inbox_path}")
        logger.info(f"Check interval: {check_interval}s")
        logger.info("=" * 50)

        try:
            while True:
                emails = self.check_emails()

                for email in emails:
                    self.process_email(email)

                sleep(check_interval)

        except KeyboardInterrupt:
            logger.info("Watcher stopped by user")
        except Exception as e:
            logger.exception(f"Watcher fatal error: {e}")


def main():
    """Main entry point."""
    watcher = GmailInboxWatcher()
    watcher.run()


# Alias so run_gmail.py can import GmailWatcher
GmailWatcher = GmailInboxWatcher


if __name__ == "__main__":
    main()
