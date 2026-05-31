#!/usr/bin/env python3
"""
scheduler.py
Time-based task scheduler for the AI Employee system.

Schedules:
  - Every day at 09:00 → invoke linkedin_post_creator skill via Claude CLI
  - Every Monday at 08:00 → generate CEO Briefing in vault/Briefings/
"""

import logging
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import schedule

ROOT  = Path(__file__).parent.parent
VAULT = ROOT / "vault" / "AI_Employee_Vault"

# ── Logger ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] Scheduler — %(message)s",
)
logger = logging.getLogger("Scheduler")


def run_linkedin_post():
    """Auto-generate a LinkedIn post via the linkedin_post_creator skill."""
    logger.info("Running daily LinkedIn post generation via linkedin_post_creator skill...")
    try:
        result = subprocess.run(
            'claude -p "The daily scheduler has triggered. Run the linkedin_post_creator skill to auto-select a topic and create today\'s LinkedIn post." --allowedTools all',
            cwd=str(ROOT),
            capture_output=False,
            timeout=300,
            shell=True,
        )
        if result.returncode == 0:
            logger.info("linkedin_post_creator skill completed.")
        else:
            logger.warning(f"linkedin_post_creator skill exited with code {result.returncode}.")
    except Exception as e:
        logger.exception(f"Error running linkedin_post_creator skill: {e}")


def generate_ceo_briefing():
    """Invoke the weekly_audit skill via Claude CLI to generate the Monday CEO briefing."""
    logger.info("Generating Monday CEO Briefing via weekly_audit skill...")
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        briefings_dir = VAULT / "Briefings"
        briefings_dir.mkdir(parents=True, exist_ok=True)
        briefing_path = briefings_dir / f"{today}_Monday_Briefing.md"

        if briefing_path.exists():
            logger.info(f"Briefing already exists for {today}, skipping.")
            return

        prompt = (
            f"The Monday scheduler has triggered. "
            f"Run the weekly_audit skill to generate today's CEO briefing for {today}. "
            f"Save the output to vault/AI_Employee_Vault/Briefings/{today}_Monday_Briefing.md"
        )
        result = subprocess.run(
            f'claude -p "{prompt}" --allowedTools all',
            cwd=str(ROOT),
            capture_output=False,
            timeout=600,
            shell=True,
        )
        if result.returncode == 0:
            logger.info("weekly_audit skill completed successfully.")
        else:
            logger.warning(f"weekly_audit skill exited with code {result.returncode}.")
    except Exception as e:
        logger.exception(f"Error running weekly_audit skill: {e}")


def cleanup_audit_logs():
    """TASK-8.5: Delete JSON audit logs older than 90 days (runs weekly)."""
    logs_dir = VAULT / "Logs"
    if not logs_dir.exists():
        return
    cutoff = datetime.now() - timedelta(days=90)
    deleted = 0
    for json_file in logs_dir.glob("*.json"):
        try:
            file_date = datetime.strptime(json_file.stem, "%Y-%m-%d")
            if file_date < cutoff:
                json_file.unlink()
                deleted += 1
                logger.info(f"Deleted old audit log: {json_file.name}")
        except ValueError:
            pass  # skip files not named YYYY-MM-DD.json
    if deleted:
        logger.info(f"Audit log cleanup: removed {deleted} file(s) older than 90 days.")


# ── Schedule definitions ──────────────────────────────────────────────────────

schedule.every().day.at("09:00").do(run_linkedin_post)
schedule.every().monday.at("08:00").do(generate_ceo_briefing)
schedule.every().monday.at("07:00").do(cleanup_audit_logs)  # TASK-8.5

logger.info("Started.")
logger.info("  - LinkedIn post:     daily at 09:00")
logger.info("  - CEO Briefing:      every Monday at 08:00")
logger.info("  - Audit log cleanup: every Monday at 07:00 (90-day retention)")

# ── Startup catch-up: run missed jobs if not yet done today ──────────────────
_now = datetime.now()
_today_str = _now.strftime("%Y%m%d")  # e.g. 20260325 — matches LINKEDIN_POST_ filenames

# LinkedIn post catch-up: if 09:00 has already passed and no post exists for today
if _now.hour >= 9:
    _linkedin_dirs = [
        VAULT / "Pending_Approval" / "linkedin",
        VAULT / "Approved" / "linkedin",
        VAULT / "Done" / "linkedin",
    ]
    _post_exists_today = any(
        list(d.glob(f"LINKEDIN_POST_{_today_str}*.md"))
        for d in _linkedin_dirs
        if d.exists()
    )
    if not _post_exists_today:
        logger.info("Startup catch-up — 09:00 passed with no LinkedIn post today. Generating now...")
        run_linkedin_post()
    else:
        logger.info("Startup catch-up — LinkedIn post already exists for today. Skipping.")

# CEO Briefing catch-up: Mondays only
if _now.weekday() == 0:  # 0 = Monday
    _today = _now.strftime("%Y-%m-%d")
    _briefing_path = VAULT / "Briefings" / f"{_today}_Monday_Briefing.md"
    if not _briefing_path.exists():
        logger.info("Monday detected on startup — running missed CEO Briefing now.")
        generate_ceo_briefing()

while True:
    try:
        schedule.run_pending()
    except Exception as e:
        logger.exception(f"Unexpected error in scheduler loop: {e}")
    time.sleep(60)
