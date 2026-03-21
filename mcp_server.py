"""MCP Server with FastAPI for email operations — sends real emails via Gmail API."""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from email.mime.text import MIMEText
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Request, status
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("MCP_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "MCP_API_KEY environment variable is not set. "
        "Add  MCP_API_KEY=<your-key>  to your .env file before starting the server."
    )

GMAIL_TOKEN_PATH = os.getenv("GMAIL_TOKEN_PATH", "token.json")
GMAIL_CREDENTIALS_PATH = os.getenv("GMAIL_CREDENTIALS_PATH", "credentials.json")
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

app = FastAPI(title="MCP Email Server", version="0.2.0")

# Regex for basic email validation
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

# Cached Gmail service — built once, reused across requests
_gmail_service = None

# Rate limiting — track failed auth attempts per IP
_failed_auth: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60   # seconds
_RATE_MAX = 5       # max failures per window


def _redact_email(address: str) -> str:
    """Return a redacted form: first 3 chars + hash suffix."""
    if not address or "@" not in address:
        return "***"
    local, _, domain = address.partition("@")
    hashed = hashlib.sha256(address.encode()).hexdigest()[:6]
    return f"{local[:3]}***@{domain} [{hashed}]"


_KEYRING_SERVICE  = "ai_employee"
_KEYRING_USERNAME = "gmail_oauth_token"


def _load_creds_from_keyring() -> Credentials | None:
    """Try to load OAuth token from Windows Credential Manager."""
    if sys.platform != "win32":
        return None
    try:
        import keyring
        token_json = keyring.get_password(_KEYRING_SERVICE, _KEYRING_USERNAME)
        if token_json:
            logger.info("Gmail token loaded from Windows Credential Manager")
            return Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
    except Exception as e:
        logger.warning(f"keyring load failed in MCP server ({e}) — falling back to file")
    return None


def _save_creds_to_keyring(creds: Credentials) -> None:
    """Persist refreshed token back to Windows Credential Manager + file."""
    token_json = creds.to_json()
    if sys.platform == "win32":
        try:
            import keyring
            keyring.set_password(_KEYRING_SERVICE, _KEYRING_USERNAME, token_json)
        except Exception as e:
            logger.warning(f"keyring save failed in MCP server ({e})")
    # Always keep file copy in sync
    from pathlib import Path
    tmp = Path(GMAIL_TOKEN_PATH).with_suffix(".tmp")
    tmp.write_text(token_json, encoding="utf-8")
    os.replace(str(tmp), GMAIL_TOKEN_PATH)


def get_gmail_service():
    """Return authenticated Gmail API service, refreshing token if needed."""
    global _gmail_service

    # Return cached service if already built
    if _gmail_service is not None:
        return _gmail_service

    # Try Windows Credential Manager first, then fall back to file
    creds = _load_creds_from_keyring()
    if creds is None:
        if not os.path.exists(GMAIL_TOKEN_PATH):
            raise RuntimeError(
                f"Gmail token not found at '{GMAIL_TOKEN_PATH}'. "
                "Run the gmail_watcher once to complete OAuth login first."
            )
        creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_PATH, SCOPES)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            logger.info("Refreshing expired Gmail token...")
            creds.refresh(GoogleRequest())
            _save_creds_to_keyring(creds)
            _gmail_service = None
        else:
            raise RuntimeError(
                "Gmail token is invalid and cannot be refreshed. "
                "Delete token.json and re-run the gmail_watcher to re-authenticate."
            )

    _gmail_service = build("gmail", "v1", credentials=creds)
    return _gmail_service


class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str


class EmailResponse(BaseModel):
    success: bool
    message: str


def verify_api_key(api_key: Optional[str], client_ip: str) -> None:
    """Verify API key using timing-safe comparison with per-IP rate limiting."""
    now = time.time()
    attempts = _failed_auth[client_ip]
    # Purge expired entries
    _failed_auth[client_ip] = [t for t in attempts if now - t < _RATE_WINDOW]

    if len(_failed_auth[client_ip]) >= _RATE_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed authentication attempts — try again later",
        )

    provided = (api_key or "").encode()
    expected = API_KEY.encode()
    if not hmac.compare_digest(provided, expected):
        _failed_auth[client_ip].append(now)
        logger.warning(f"Rejected request — invalid or missing API key from {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def _validate_email_request(email: EmailRequest) -> None:
    """Validate email fields — reject malformed addresses and header injection attempts."""
    # Strip and check for newlines (MIME header injection)
    if "\n" in email.to or "\r" in email.to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid recipient: newline characters not allowed")
    if "\n" in email.subject or "\r" in email.subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid subject: newline characters not allowed")

    # Validate email format
    clean_to = email.to.strip()
    if not _EMAIL_RE.match(clean_to):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid recipient email address: {_redact_email(email.to)}")

    # Enforce field length limits
    if len(email.subject) > 998:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Subject exceeds maximum length")
    if len(email.body) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Body exceeds maximum size")


@app.post("/send-email", response_model=EmailResponse)
async def send_email(
    request: Request,
    email: EmailRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> EmailResponse:
    """Send a real email via Gmail API."""
    client_ip = request.client.host if request.client else "unknown"
    verify_api_key(x_api_key, client_ip)
    _validate_email_request(email)

    logger.info(f"Sending email to: {_redact_email(email.to)}")
    logger.info(f"Subject: {email.subject[:60]}{'...' if len(email.subject) > 60 else ''}")

    try:
        service = get_gmail_service()

        # Sanitize: strip any stray whitespace from headers
        safe_to      = email.to.strip()
        safe_subject = email.subject.strip()

        mime_message = MIMEText(email.body)
        mime_message["to"] = safe_to
        mime_message["subject"] = safe_subject

        raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

        result = service.users().messages().send(
            userId="me",
            body={"raw": raw},
        ).execute()

        msg_id = result.get("id", "unknown")
        logger.info(f"Email sent successfully — Gmail message ID: {msg_id}")

        return EmailResponse(
            success=True,
            message=f"Email sent to {email.to} — Gmail ID: {msg_id}",
        )

    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}",
        )


@app.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
