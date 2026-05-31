"""
facebook_instagram_executor.py

Called by approved_watcher.py when a SOCIAL_POST_*.md file lands in Approved/social/.
Reads the post file, publishes to Facebook and/or Instagram via Meta Graph API,
then moves the file to Done/social/ and updates log and Dashboard.

Never publishes without a file in Approved/social/ — HITL is enforced by the watcher.
"""

import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import requests
import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT  = Path(__file__).parent
VAULT = ROOT / "vault" / "AI_Employee_Vault"

# TASK-7.2: retry utilities
_WATCHERS_DIR = ROOT / "watchers"
if str(_WATCHERS_DIR) not in sys.path:
    sys.path.insert(0, str(_WATCHERS_DIR))
from retry_handler import TransientError, with_retry, write_log_alert  # noqa: E402
from audit_logger import log_action  # noqa: E402  TASK-8.4

GRAPH_BASE          = "https://graph.facebook.com"
META_API_VERSION    = os.getenv("META_GRAPH_API_VERSION", "v21.0")
META_PAGE_TOKEN     = os.getenv("META_PAGE_ACCESS_TOKEN", "")
META_PAGE_ID        = os.getenv("META_PAGE_ID", "")
META_IG_USER_ID     = os.getenv("META_IG_USER_ID", "")

APPROVED_SOCIAL = VAULT / "Approved" / "social"


def _assert_in_approved(file_path: Path) -> None:
    """Raise PermissionError if file_path is not inside Approved/social/. TASK-10.3."""
    try:
        file_path.resolve().relative_to(APPROVED_SOCIAL.resolve())
    except ValueError:
        raise PermissionError(
            f"Permission boundary violation: social posts require a file in "
            f"Approved/social/ — got {file_path}"
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _graph_url(path: str) -> str:
    return f"{GRAPH_BASE}/{META_API_VERSION}/{path}"


def _read_frontmatter(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            return {}
        end = text.find("\n---", 3)
        if end == -1:
            return {}
        fm_text = text[3:end].strip()
        parsed = yaml.safe_load(fm_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _append_log(message: str) -> None:
    today    = datetime.now().strftime("%Y-%m-%d")
    log_file = VAULT / "Logs" / f"log_{today}.md"
    ts       = datetime.now().strftime("%H:%M:%S")
    entry    = f"\n[{ts}] [social] {message}\n"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        print(f"[WARN] Could not write log: {e}")


def _update_dashboard(message: str) -> None:
    dashboard = VAULT / "Dashboard.md"
    today     = datetime.now().strftime("%Y-%m-%d")
    entry     = f"\n| Social | {message} | {today} |\n"
    try:
        with open(dashboard, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        print(f"[WARN] Could not update dashboard: {e}")


# ── Retried HTTP helper (TASK-7.2) ────────────────────────────────────────────

@with_retry(
    max_attempts=3,
    base_delay=1.0,
    max_delay=60.0,
    retryable=(TransientError,),
    log_domain="social",
)
def _http_post(url: str, data: dict, timeout: int = 30) -> dict:
    """HTTP POST to Meta Graph API with exponential-backoff retry."""
    try:
        resp = requests.post(url, data=data, timeout=timeout)
        return resp.json()
    except requests.ConnectionError as exc:
        raise TransientError(f"Social API connection error: {exc}") from exc
    except requests.Timeout as exc:
        raise TransientError(f"Social API timeout: {exc}") from exc


# ── Facebook API ──────────────────────────────────────────────────────────────

def _post_facebook(message: str, link: str = "", image_url: str = "") -> dict:
    if not META_PAGE_TOKEN or not META_PAGE_ID:
        return {"success": False, "error": "META_PAGE_ACCESS_TOKEN or META_PAGE_ID not set in .env"}

    if image_url:
        url    = _graph_url(f"{META_PAGE_ID}/photos")
        params = {"url": image_url, "caption": message, "access_token": META_PAGE_TOKEN, "published": "true"}
    else:
        url    = _graph_url(f"{META_PAGE_ID}/feed")
        params = {"message": message, "access_token": META_PAGE_TOKEN}
        if link:
            params["link"] = link

    try:
        data = _http_post(url, params)
    except TransientError as exc:
        write_log_alert(f"Facebook POST failed after retries: {exc}", domain="social")
        return {"success": False, "error": str(exc)}

    if "error" in data:
        return {"success": False, "error": data["error"].get("message", "Unknown error")}

    post_id = data.get("post_id") or data.get("id", "")
    return {"success": True, "post_id": post_id}


# ── Instagram API ─────────────────────────────────────────────────────────────

def _post_instagram(image_url: str, caption: str) -> dict:
    if not META_PAGE_TOKEN or not META_IG_USER_ID:
        return {"success": False, "error": "META_PAGE_ACCESS_TOKEN or META_IG_USER_ID not set in .env"}

    if not image_url:
        return {"success": False, "error": "Instagram requires image_url — text-only posts are not supported"}

    # Step 1: create media container
    try:
        d1 = _http_post(
            _graph_url(f"{META_IG_USER_ID}/media"),
            {"image_url": image_url, "caption": caption, "access_token": META_PAGE_TOKEN},
        )
    except TransientError as exc:
        write_log_alert(f"Instagram container creation failed after retries: {exc}", domain="social")
        return {"success": False, "error": f"Container creation failed: {exc}"}

    if "error" in d1:
        return {"success": False, "error": d1["error"].get("message", "Container error")}

    creation_id = d1.get("id")
    if not creation_id:
        return {"success": False, "error": "No creation_id from media container step"}

    # Step 2: publish container
    try:
        d2 = _http_post(
            _graph_url(f"{META_IG_USER_ID}/media_publish"),
            {"creation_id": creation_id, "access_token": META_PAGE_TOKEN},
        )
    except TransientError as exc:
        write_log_alert(f"Instagram publish failed after retries: {exc}", domain="social")
        return {"success": False, "error": f"Publish failed: {exc}"}

    if "error" in d2:
        return {"success": False, "error": d2["error"].get("message", "Publish error")}

    return {"success": True, "media_id": d2.get("id", ""), "creation_id": creation_id}


# ── Main executor ─────────────────────────────────────────────────────────────

def run_social_post(file_path: Path) -> bool:
    """
    Process an approved social post file.
    Returns True on success, False on failure.
    """
    print(f"[SOCIAL] Processing: {file_path.name}")

    # TASK-10.3: enforce permission boundary — file must be in Approved/social/
    try:
        _assert_in_approved(file_path)
    except PermissionError as e:
        print(f"[SOCIAL] PERMISSION DENIED: {e}")
        _append_log(f"PERMISSION_DENIED: {e}")
        return False

    meta    = _read_frontmatter(file_path)
    content = file_path.read_text(encoding="utf-8")

    # Extract fields from frontmatter
    platforms_raw = meta.get("platforms", meta.get("platform", "facebook")).lower()
    platforms     = [p.strip() for p in re.split(r"[,\s]+", platforms_raw) if p.strip()]
    message       = meta.get("message", "")
    caption       = meta.get("caption", message)
    image_url     = meta.get("image_url", "")
    link          = meta.get("link", "")

    # Fall back to body content if message not in frontmatter
    if not message:
        # Strip YAML front-matter and use first non-empty paragraph
        body = re.sub(r"^---.*?---\s*", "", content, flags=re.DOTALL).strip()
        message = body.split("\n\n")[0].strip() if body else ""
        caption = message

    if not message:
        print("[SOCIAL] No message content found — skipping")
        _append_log(f"SOCIAL_POST: FAILED — no message content in {file_path.name}")
        return False

    results = []

    # ── Facebook ──────────────────────────────────────────────────────────────
    if "facebook" in platforms:
        print("[SOCIAL] Posting to Facebook...")
        fb_result = _post_facebook(message, link=link, image_url=image_url)
        if fb_result["success"]:
            print(f"[SOCIAL] Facebook: OK — post_id={fb_result.get('post_id')}")
            _append_log(f"FACEBOOK_POST: Published — post_id={fb_result.get('post_id')} — Status: success")
            results.append("Facebook: OK")
        else:
            print(f"[SOCIAL] Facebook: FAILED — {fb_result['error']}")
            _append_log(f"FACEBOOK_POST: FAILED — {fb_result['error']}")
            results.append(f"Facebook: FAILED ({fb_result['error']})")
        log_action(  # TASK-8.4
            action_type="facebook_post_published",
            actor="facebook_instagram_executor",
            target=file_path.name,
            parameters={"post_id": fb_result.get("post_id", ""), "image_url": image_url},
            approval_status="approved",
            approved_by="human",
            result="success" if fb_result["success"] else f"failed: {fb_result.get('error', '')}",
        )

    # ── Instagram ─────────────────────────────────────────────────────────────
    if "instagram" in platforms:
        if not image_url:
            print("[SOCIAL] Instagram skipped — image_url required but not provided")
            _append_log("INSTAGRAM_POST: SKIPPED — image_url not provided")
            results.append("Instagram: SKIPPED (no image_url)")
        else:
            print("[SOCIAL] Posting to Instagram...")
            ig_result = _post_instagram(image_url, caption)
            if ig_result["success"]:
                print(f"[SOCIAL] Instagram: OK — media_id={ig_result.get('media_id')}")
                _append_log(f"INSTAGRAM_POST: Published — media_id={ig_result.get('media_id')} — Status: success")
                results.append("Instagram: OK")
            else:
                print(f"[SOCIAL] Instagram: FAILED — {ig_result['error']}")
                _append_log(f"INSTAGRAM_POST: FAILED — {ig_result['error']}")
                results.append(f"Instagram: FAILED ({ig_result['error']})")
            log_action(  # TASK-8.4
                action_type="instagram_post_published",
                actor="facebook_instagram_executor",
                target=file_path.name,
                parameters={"media_id": ig_result.get("media_id", ""), "image_url": image_url},
                approval_status="approved",
                approved_by="human",
                result="success" if ig_result["success"] else f"failed: {ig_result.get('error', '')}",
            )

    summary = " | ".join(results) if results else "No platforms processed"

    # Move to Done/social/
    done_dir = VAULT / "Done" / "social"
    done_dir.mkdir(parents=True, exist_ok=True)
    dest = done_dir / file_path.name
    shutil.move(str(file_path), str(dest))
    print(f"[SOCIAL] Moved to Done/social/: {file_path.name}")

    _update_dashboard(f"Social post published: {summary}")
    print(f"[SOCIAL] Done. Results: {summary}")

    # Return True if at least one platform succeeded
    return any("OK" in r for r in results) or not results
