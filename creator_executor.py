#!/usr/bin/env python3
"""
creator_executor.py
Python automation of /linkedin_post_creator.md skill.
Uses Google Gemini Flash OR Groq Llama 3.3 (free) for AI content generation.

Usage:
    uv run creator_executor.py                        # auto-select topic
    uv run creator_executor.py "your topic"           # specific topic
    uv run creator_executor.py "your topic" --force   # bypass daily limit

One-time setup:
    1. Get a free API key:
       - Gemini: https://aistudio.google.com  → set GEMINI_API_KEY
       - Groq:   https://console.groq.com     → set GROQ_API_KEY
    2. Install libs: uv add google-genai groq
"""

import os
import random
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Load .env file so API keys persist across sessions
from dotenv import load_dotenv
from filelock import FileLock
load_dotenv(Path(__file__).parent / ".env")

# ── AI provider imports (try both, use whichever is available) ────────────────

GEMINI_AVAILABLE = False
GROQ_AVAILABLE   = False

try:
    from google import genai as google_genai
    GEMINI_AVAILABLE = True
except ImportError:
    pass

try:
    from groq import Groq as GroqClient
    GROQ_AVAILABLE = True
except ImportError:
    pass

if not GEMINI_AVAILABLE and not GROQ_AVAILABLE:
    print("[ERROR] No AI provider installed.")
    print("  Run:  uv add google-genai groq")
    print("  Then set GEMINI_API_KEY or GROQ_API_KEY environment variable.")
    sys.exit(1)

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT      = Path(__file__).parent
VAULT     = ROOT / "vault" / "AI_Employee_Vault"
PENDING   = VAULT / "Pending_Approval" / "linkedin"
APPROVED  = VAULT / "Approved"         / "linkedin"
DONE      = VAULT / "Done"             / "linkedin"
PLANS     = VAULT / "Plans"            / "linkedin"
LOGS      = VAULT / "Logs"
DASHBOARD = VAULT / "Dashboard.md"

TOPIC_ROTATION = [
    "AI automation in business",
    "Python productivity tips",
    "Lessons from building AI systems",
    "The future of no-code tools",
    "Business automation mistakes to avoid",
    "What I learned building AI employees",
    "Prompt engineering for real work",
    "Why most automations fail",
    "Building with Claude API — what actually works",
    "The hidden cost of manual processes",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")

def _count_emojis(text: str) -> int:
    count = 0
    for ch in text:
        cp = ord(ch)
        if (0x1F300 <= cp <= 0x1F9FF or
                0x2600 <= cp <= 0x26FF or
                0x2700 <= cp <= 0x27BF or
                0xFE00 <= cp <= 0xFE0F or
                0x1F1E0 <= cp <= 0x1F1FF):
            count += 1
    return count

def _count_hashtags(text: str) -> int:
    return len(re.findall(r'(?<!\w)#\w+', text))

def _count_words(text: str) -> int:
    return len(text.split())

def _quality_check(post: str) -> list:
    """Return list of failed checks. Empty = all passed."""
    failures = []
    non_empty = [l.strip() for l in post.strip().splitlines() if l.strip()]
    first = non_empty[0] if non_empty else ""

    bad_starts = ("I'm excited", "In today's", "Hello,", "Hi ", "Greetings", "Welcome")
    if any(first.startswith(b) for b in bad_starts):
        failures.append(f"Line 1 is a filler opening: '{first[:40]}'")
    if first.endswith("?"):
        failures.append("Line 1 is a question — must be a bold statement hook")

    wc = _count_words(post)
    if not (150 <= wc <= 300):
        failures.append(f"Word count {wc} is outside 150-300 range")

    ec = _count_emojis(post)
    if not (2 <= ec <= 3):
        failures.append(f"Emoji count {ec} not in 2-3 range")

    hc = _count_hashtags(post)
    if hc != 3:
        failures.append(f"Hashtag count {hc} must be exactly 3")

    last = non_empty[-1] if non_empty else ""
    if not last.startswith("#") and not last.endswith("?"):
        failures.append("Last line must be hashtags OR a question")

    return failures

def _build_recent_topics() -> list:
    """Collect topics posted in the last 7 days from logs + Done/ frontmatter."""
    recent = []
    today = datetime.now()

    for i in range(7):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        log_file = LOGS / f"log_{day}.md"
        if not log_file.exists():
            continue
        text = log_file.read_text(encoding="utf-8", errors="ignore")
        in_block = False
        for line in text.splitlines():
            if "[LINKEDIN POST CREATED]" in line or "[LINKEDIN POST PUBLISHED]" in line:
                in_block = True
            elif line.startswith("## ") and "LINKEDIN" not in line:
                in_block = False
            elif in_block and line.strip().startswith("- Topic:"):
                t = line.strip()[len("- Topic:"):].strip()
                if t:
                    recent.append(t)

    for f in DONE.glob("LINKEDIN_POST_*.md"):
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
            if text.startswith("---"):
                end = text.find("---", 3)
                if end != -1:
                    for line in text[3:end].splitlines():
                        if line.strip().startswith("topic:"):
                            t = line.strip()[len("topic:"):].strip()
                            if t:
                                recent.append(t)
                            break
        except Exception:
            pass

    return recent

def _is_duplicate(topic: str, recent: list):
    """Return matching recent topic string if duplicate, else None."""
    t = topic.lower()
    for rt in recent:
        if t == rt.lower() or t in rt.lower() or rt.lower() in t:
            return rt
    return None

def _read_daily_count() -> int:
    """Count only CREATED entries — publishing doesn't consume a slot."""
    log_file = LOGS / f"log_{_today()}.md"
    if not log_file.exists():
        return 0
    text = log_file.read_text(encoding="utf-8", errors="ignore")
    return text.count("[LINKEDIN POST CREATED]")

def _append_dashboard(block: str):
    DASHBOARD.parent.mkdir(parents=True, exist_ok=True)
    lock_path = str(DASHBOARD.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(DASHBOARD, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")

def _append_log(block: str):
    LOGS.mkdir(parents=True, exist_ok=True)
    log_file = LOGS / f"log_{_today()}.md"
    lock_path = str(log_file.resolve()) + ".lock"
    with FileLock(lock_path, timeout=10):
        with open(log_file, "a", encoding="utf-8") as f:
            f.write("\n" + block + "\n")

# ── Content generation ────────────────────────────────────────────────────────

BASE_PROMPT = """Write a high-quality LinkedIn post about: "{topic}"

STRICT REQUIREMENTS:
- Line 1 (Hook): A bold claim, surprising stat, or counterintuitive statement.
  NOT a greeting. NOT a question. NOT "I'm excited to share".
- Lines 2-12 (Story): A specific, concrete narrative — real scenario, numbered lessons, or step-by-step breakdown.
  NO filler phrases like "In today's fast-paced world" or "I'm thrilled to announce".
- Lines 13-15 (Insight): One clear actionable rule or lesson the reader can apply immediately.
- Second-to-last paragraph (Question): A genuine, specific question for the audience.
  NOT generic like "What do you think?" — make it specific to the post content.
- Very last line: Exactly 3 hashtags separated by spaces. Example: #AI #automation #productivity

FORMAT RULES:
- Total length: 150 to 300 words (STRICTLY enforced)
- Exactly 2 or 3 emojis placed naturally in the text (never forced at the end)
- Short paragraphs of 1-3 lines with a blank line between each paragraph
- Hashtags ONLY on the very last line — nowhere else in the post

Output ONLY the post text. No labels, no "Here is your post:", no explanation."""


def _call_gemini(prompt: str, api_key: str) -> str:
    client = google_genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=prompt,
    )
    return response.text.strip()


def _call_groq(prompt: str, api_key: str) -> str:
    client = GroqClient(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
    )
    return response.choices[0].message.content.strip()


def _generate_post(topic: str) -> str:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    groq_key   = os.environ.get("GROQ_API_KEY",   "").strip()

    # Determine provider
    if gemini_key and GEMINI_AVAILABLE:
        provider = "Gemini Flash"
    elif groq_key and GROQ_AVAILABLE:
        provider = "Groq Llama 3.3"
    else:
        print("\n[ERROR] No API key found.")
        print("  Set one of:")
        print("    $env:GEMINI_API_KEY='key'   # https://aistudio.google.com")
        print("    $env:GROQ_API_KEY='key'     # https://console.groq.com (free)")
        sys.exit(1)

    print(f"[CREATOR] Using provider: {provider}")

    base = BASE_PROMPT.format(topic=topic)
    prompt = base
    last_post = ""

    for attempt in range(3):
        print(f"[CREATOR] Generating post (attempt {attempt + 1}/3)...")
        try:
            if provider == "Gemini Flash":
                try:
                    post = _call_gemini(prompt, gemini_key)
                except Exception as e:
                    print(f"[CREATOR] Gemini error: {e}")
                    if groq_key and GROQ_AVAILABLE:
                        print("[CREATOR] Falling back to Groq...")
                        provider = "Groq Llama 3.3"
                        post = _call_groq(prompt, groq_key)
                    else:
                        raise
            else:
                post = _call_groq(prompt, groq_key)
        except Exception as e:
            print(f"[ERROR] AI API error: {e}")
            sys.exit(1)

        last_post = post
        failures = _quality_check(post)

        if not failures:
            print(f"[CREATOR] ✓ Quality check passed on attempt {attempt + 1}")
            return post

        print(f"[CREATOR] Quality issues: {' | '.join(failures)}")
        if attempt < 2:
            print("[CREATOR] Regenerating with feedback...")
            prompt = (
                base
                + "\n\nYOUR PREVIOUS ATTEMPT HAD THESE PROBLEMS — FIX ALL OF THEM:\n"
                + "\n".join(f"- {f}" for f in failures)
                + "\n\nWrite a completely new post that fixes every issue above."
            )

    print("[CREATOR] Warning: using best attempt after 3 tries. Review before approving.")
    return last_post

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    force = "--force" in args
    args = [a for a in args if a != "--force"]
    provided_topic = args[0].strip() if args else None
    today = _today()

    print("[CREATOR] LinkedIn Post Creator starting...")
    print(f"[CREATOR] Date: {today} | Force: {force}")

    # ── Gate 0a — Daily limit (counts only CREATED, not published) ────────────
    daily_count = _read_daily_count()
    if daily_count >= 5 and not force:
        print(f"\n⏸ Daily Limit Reached\n")
        print(f"  5 LinkedIn posts already created today ({today}).")
        print(f"  Use: uv run creator_executor.py [topic] --force")
        sys.exit(0)
    if force and daily_count >= 5:
        print(f"[CREATOR] --force override active. Current count: {daily_count}/5")

    # ── Gate 0b — Queue occupancy ─────────────────────────────────────────────
    pending_files = sorted(PENDING.glob("LINKEDIN_POST_*.md"))
    approved_files = sorted(APPROVED.glob("LINKEDIN_POST_*.md"))

    if pending_files:
        f = pending_files[0]
        print(f"\n⏸ Queue Occupied\n")
        print(f"  A post is waiting in Pending_Approval/: {f.name}")
        print(f"  → To approve: move to Approved/  (watcher auto-publishes)")
        print(f"  → To reject:  move to Rejected/")
        sys.exit(0)
    if approved_files:
        f = approved_files[0]
        print(f"\n⏸ Queue Occupied\n")
        print(f"  A post is in Approved/ (being published): {f.name}")
        sys.exit(0)

    # ── Gate 0c — Recent topic scan ───────────────────────────────────────────
    print("[CREATOR] Scanning recent topics (last 7 days)...")
    recent_topics = _build_recent_topics()

    # ── Step 1 — Select topic ─────────────────────────────────────────────────
    if provided_topic:
        dup = _is_duplicate(provided_topic, recent_topics)
        if dup:
            print(f'⚠  Warning: Similar topic posted recently: "{dup}"')
            print(f'   Continuing with your topic: "{provided_topic}"')
        topic = provided_topic
    else:
        topic = None
        for t in TOPIC_ROTATION:
            if not _is_duplicate(t, recent_topics):
                topic = t
                break
        if not topic:
            topic = TOPIC_ROTATION[0]
            print(f'⚠  All rotation topics used recently — reusing: "{topic}"')
        print(f'[CREATOR] Auto-selected topic: "{topic}"')

    # ── Step 2 — Generate timestamp ───────────────────────────────────────────
    now = datetime.now()
    iso_ts = now.isoformat()
    ts = now.strftime("%Y%m%d%H%M%S") + f"_{random.randint(100000, 999999)}"
    plan_filename = f"PLAN_LINKEDIN_{ts}.md"
    post_filename = f"LINKEDIN_POST_{ts}.md"

    # ── Step 3 — Generate post content ────────────────────────────────────────
    post_content = _generate_post(topic)

    non_empty = [l.strip() for l in post_content.splitlines() if l.strip()]
    hook          = non_empty[0] if non_empty else ""
    word_count    = _count_words(post_content)
    emoji_count   = _count_emojis(post_content)
    hashtag_count = _count_hashtags(post_content)
    cta = next((l for l in reversed(non_empty) if l.endswith("?") and not l.startswith("#")), "")

    print(f"[CREATOR] Post: {word_count} words | {emoji_count} emojis | {hashtag_count} hashtags")

    # ── Step 4 — Create Plan file (BLOCKING gate) ─────────────────────────────
    PLANS.mkdir(parents=True, exist_ok=True)
    plan_path = PLANS / plan_filename

    if plan_path.exists():
        print(f"[ERROR] Plan file already exists: {plan_filename}")
        sys.exit(1)

    plan_content = f"""---
type: linkedin_post
status: pending
created: {iso_ts}
topic: {topic}
post_filename: {post_filename}
---

# Plan: LINKEDIN_{ts}

## Objective
Post about {topic} to build professional brand on LinkedIn and provide value to audience.

## Content Strategy
- Hook: {hook}
- Story/Idea: Concrete narrative with specific examples related to {topic}
- Insight: Actionable rule or lesson embedded in the post
- CTA Question: {cta}
- Emoji count: {emoji_count}
- Hashtag count: {hashtag_count}
- Word count: {word_count}

## Proposed Post

{post_content}

## Proposed Response
N/A — this is a LinkedIn post, not an email reply.
Content is in ## Proposed Post above.

## Approval Required
Yes — LinkedIn posts always require human approval before publishing.

## Expected Outcome
Professional LinkedIn post published. Audience engagement via comments.

## Compliance Notes
- LinkedIn posts are always sensitive — always route to Pending_Approval
- Max 5 posts per day unless --force override
- No duplicate topics within 7 days

## Status
pending
"""

    plan_path.write_text(plan_content, encoding="utf-8")
    print(f"[CREATOR] ✓ Plan created: {plan_filename}")

    # ── Step 5 — Create Post file ─────────────────────────────────────────────
    PENDING.mkdir(parents=True, exist_ok=True)
    post_path = PENDING / post_filename

    if post_path.exists():
        plan_path.unlink()   # rollback plan
        print(f"[ERROR] Post file already exists: {post_filename}")
        sys.exit(1)

    post_file_content = f"""---
type: linkedin_post
status: pending
created: {iso_ts}
topic: {topic}
plan_reference: {plan_filename}
---

## Post Content

{post_content}

## Purpose

This post delivers actionable insights on {topic} to developers, founders, and professionals looking for practical knowledge they can apply immediately.
"""

    post_path.write_text(post_file_content, encoding="utf-8")
    print(f"[CREATOR] ✓ Post created: {post_filename}")

    # ── Step 6 — Update Dashboard ─────────────────────────────────────────────
    _append_dashboard(
        f"## Recent Activity\n\n"
        f"- LinkedIn post created: {post_filename}\n"
        f"- Topic: {topic}\n"
        f"- Plan: {plan_filename}\n"
        f"- Generated by: {_provider_name()}\n"
        f"- Status: awaiting_approval\n"
        f"- Date: {today}\n"
    )

    # ── Step 7 — Write Log Entry ──────────────────────────────────────────────
    new_count = daily_count + 1
    force_note = " (--force override active)" if force else ""
    _append_log(
        f"## {iso_ts} — LINKEDIN_{ts} [LINKEDIN POST CREATED]\n\n"
        f"- Post File: {post_filename}\n"
        f"- Plan File: {plan_filename} (created)\n"
        f"- Topic: {topic}\n"
        f"- Hook: \"{hook}\"\n"
        f"- Word Count: {word_count}\n"
        f"- Generated By: {_provider_name()} (creator_executor.py)\n"
        f"- Status: awaiting_approval\n"
        f"- Action: Moved to Pending_Approval/\n"
        f"- Daily limit: {new_count}/5 used{force_note}\n"
        f"- Note: LinkedIn posts always require human approval before publishing\n"
    )

    # ── Step 8 — Report ───────────────────────────────────────────────────────
    print(f"""
✅ LinkedIn Post Created — Awaiting Your Approval
═══════════════════════════════════════════════════
Post File:  Pending_Approval/{post_filename}
Plan File:  Plans/{plan_filename}
Topic:      {topic}
Word Count: {word_count} words
Generated:  {_provider_name()}

Next steps:
→ Review: vault/AI_Employee_Vault/Pending_Approval/{post_filename}
→ Approve: move file to Approved/  ← watcher auto-publishes
→ Reject:  move file to Rejected/

Daily limit: {new_count}/5 used today
═══════════════════════════════════════════════════
""")


def _provider_name() -> str:
    """Return which provider is active (for log labels)."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    groq_key   = os.environ.get("GROQ_API_KEY",   "").strip()
    if gemini_key and GEMINI_AVAILABLE:
        return "Gemini Flash"
    if groq_key and GROQ_AVAILABLE:
        return "Groq Llama 3.3"
    return "Unknown"


if __name__ == "__main__":
    main()
