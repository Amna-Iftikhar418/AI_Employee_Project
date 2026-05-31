"""
watchers/retry_handler.py
Central retry + alert utilities for the AI Employee system.

Provides:
  - TransientError / AuthError exception classes
  - with_retry() decorator — exponential backoff, max_attempts=3, base=1s, cap=60s
  - write_log_alert()      — appends an ALERT line to today's vault log
  - write_dashboard_alert()— appends an ALERT row to Dashboard.md
"""

from __future__ import annotations

import functools
import logging
import random
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Tuple, Type

ROOT  = Path(__file__).parent.parent
VAULT = ROOT / "vault" / "AI_Employee_Vault"

log = logging.getLogger("retry_handler")


# ── Exception hierarchy ───────────────────────────────────────────────────────

class TransientError(Exception):
    """Transient external API failure: network timeout, 5xx, connection refused.
    Safe to retry automatically."""


class AuthError(Exception):
    """Expired or invalid credentials.
    The watcher must pause operations and notify the operator — do NOT retry."""


# ── Vault alert helpers ───────────────────────────────────────────────────────

def write_log_alert(message: str, domain: str = "system") -> None:
    """Append an ALERT entry to today's vault Logs/ file."""
    today    = datetime.now().strftime("%Y-%m-%d")
    log_file = VAULT / "Logs" / f"log_{today}.md"
    ts       = datetime.now().strftime("%H:%M:%S")
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"\n[{ts}] [{domain}] ALERT: {message}\n")
    except OSError as exc:
        log.error("Could not write log alert: %s", exc)


def write_dashboard_alert(domain: str, message: str) -> None:
    """Append an ALERT row to Dashboard.md."""
    dashboard = VAULT / "Dashboard.md"
    today     = datetime.now().strftime("%Y-%m-%d")
    try:
        with open(dashboard, "a", encoding="utf-8") as f:
            f.write(f"\n| {domain} | ALERT: {message} | {today} |\n")
    except OSError as exc:
        log.error("Could not write dashboard alert: %s", exc)


# ── Retry decorator ───────────────────────────────────────────────────────────

def with_retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable: Tuple[Type[Exception], ...] = (TransientError,),
    jitter: bool = True,
    log_domain: str = "retry",
) -> Callable:
    """Exponential-backoff retry decorator.

    Retries only on exceptions listed in `retryable`; all other exceptions
    propagate immediately without retrying.  After all attempts are exhausted,
    writes an ALERT to the vault log and re-raises the last exception.

    Default settings: max_attempts=3, base_delay=1s, max_delay=60s.
    Actual delays: 1s → 2s (with ±10% jitter when jitter=True).
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retryable as exc:
                    last_exc = exc
                    if attempt >= max_attempts:
                        break
                    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                    if jitter:
                        delay *= 1.0 + random.uniform(0, 0.1)
                    log.warning(
                        "%s: attempt %d/%d failed (%s: %s) — retrying in %.1fs",
                        func.__name__, attempt, max_attempts,
                        type(exc).__name__, exc, delay,
                    )
                    time.sleep(delay)
            final_msg = (
                f"{func.__name__}: all {max_attempts} attempts exhausted — "
                f"{type(last_exc).__name__}: {last_exc}"
            )
            log.error(final_msg)
            write_log_alert(final_msg, domain=log_domain)
            raise last_exc  # type: ignore[misc]
        return wrapper
    return decorator
