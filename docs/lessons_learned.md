# Lessons Learned — AI Employee Project

## Project Summary

Built an autonomous AI Employee system from scratch: Gmail + WhatsApp monitoring,
structured planning, human approval workflow, and action execution across five domains
(email, WhatsApp, LinkedIn, Facebook/Instagram, Odoo accounting). All AI logic lives
in Claude Code skills; all state lives in a file-based vault.

---

## What Worked Well

### 1. File-based vault as the communication bus
Using the filesystem as a shared state store (instead of a database or message queue)
made the system extremely transparent and debuggable. At any moment you can `ls` a
folder to see exactly what the AI is thinking. Inspecting a Plan file shows the full
reasoning before any action fires. This dramatically reduced debugging time.

### 2. Skill-based architecture
Keeping all AI logic in `.claude/skills/` markdown files made it easy to extend the
system domain by domain. Adding Facebook/Instagram took a new skill file + a new MCP
server, without touching any existing code. Skills also serve as documentation — reading
`skill.md` tells you exactly what the AI will do.

### 3. Human-in-the-loop (HITL) as a first-class constraint
Designing HITL from day one (not bolted on later) meant every action executor was built
with `_assert_in_approved()` guards. The physical terminal prompt in
`pending_approval_watcher.py` is intentionally simple — there is no way to accidentally
auto-approve a batch. The Y/N prompt forces a conscious decision for every action.

### 4. MCP servers as clean API boundaries
Wrapping Gmail, Odoo, and Meta Graph API behind MCP servers gave Claude Code a clean,
tool-call interface. Each MCP server handles its own authentication and error formats,
so skill code never deals with raw HTTP or OAuth flow — it just calls a tool.

### 5. `watchers/main.py` as a single launch point
A single `uv run watchers/main.py` command starts everything. The watchdog loop
auto-restarts crashed children. Startup checks (OneDrive detection, port cleanup, write
permissions) surface environment problems before they cause confusing failures later.

### 6. Exponential backoff as the default retry strategy
The `@with_retry` decorator in `retry_handler.py` with `max_attempts=3, base_delay=1,
max_delay=60` covered ~90% of transient failures (Gmail rate limits, Odoo timeouts,
Meta API hiccups) without any extra code per caller.

---

## What Was Challenging

### 1. WhatsApp automation is brittle
WhatsApp Web via Chrome requires keeping a browser window alive, managing
`SingletonLock` files, and handling session expiry. Any Chrome update or WhatsApp Web
change can break the watcher silently. Future projects should use the official WhatsApp
Business API (Cloud API) instead of browser automation.

### 2. Meta Graph API token expiry
Facebook long-lived Page Access Tokens expire after 60 days. The system has no
automatic token refresh — a token expiry silently fails. A production system needs
a cron job to refresh tokens 7 days before expiry and alert the operator.

### 3. Odoo requires manual startup
Odoo Community must be running on port 8069 before the MCP can connect. This is an
external dependency that `main.py` cannot manage. Documenting this clearly (and adding
a startup check) prevented confusion, but it remains a friction point for first-time setup.

### 4. OneDrive sync and file locking
Running the project inside a OneDrive-synced folder caused intermittent `PermissionError`
on `.write_test` files and `.processed_*.json` lock files. The fix (move to
`C:\AI_Employee_Project`) was simple, but discovering the root cause took time. The
OneDrive detection warning in `main.py` was added specifically to surface this faster.

### 5. LinkedIn Playwright automation vs. API
LinkedIn's public API is heavily restricted. Using Playwright (browser automation) works
but is fragile — DOM selectors break with LinkedIn UI updates, and the approach requires
a logged-in browser session. A proper LinkedIn API integration would be more stable.

### 6. Scheduler relies on `claude -p` availability
The headless `claude -p` invocations from `scheduler.py` require Claude Code CLI to be
installed, authenticated, and on the system PATH. If Claude Code is updated and the
`-p` flag changes behavior, scheduled tasks silently fail. A healthcheck on scheduled
invocations would help catch this.

---

## Key Design Decisions

### Decision: vault files over database
**Why:** Maximum transparency and zero infrastructure. Every state transition is a file
move — easy to inspect, replay, and audit. The cost is no indexing or querying, but for
a single-operator system the file approach is far simpler.

**Trade-off:** Does not scale beyond ~1000 tasks/day without performance degradation
from filesystem listing. A production multi-tenant system would need a database.

### Decision: Claude Code skills (markdown) over Python modules
**Why:** Keeping AI reasoning in markdown skill files means the prompt and the code
are co-located. Claude reads the skill file at runtime, so the prompt is always
up to date. Python modules would require maintaining parallel sync between prompt and
code.

**Trade-off:** Skills are harder to unit test than Python functions. Testing requires
running the full Claude Code loop.

### Decision: Permission guards in executors, not in approval watcher
**Why:** Defense in depth. Even if someone manually places a file in `Approved/`
or the watcher has a bug, the executor-level `_assert_in_approved()` check prevents
unauthorized execution. The approval watcher is the UX layer; the executor is the
safety layer.

### Decision: Three separate MCP servers instead of one
**Why:** Each domain (email, Odoo, social) has different authentication, rate limits,
and error handling. Separating them means an Odoo outage does not affect email sending,
and adding a new integration does not require touching existing MCP code.

---

## What to Do Differently Next Time

1. **Start with a real WhatsApp API** — browser automation works for demos but not
   for production. The WhatsApp Business Cloud API (Meta) is free up to 1,000
   conversations/month.

2. **Build token rotation from day one** — Meta tokens, Gmail OAuth refresh tokens,
   and any API key should have automated rotation before expiry, not as an afterthought.

3. **Add a healthcheck dashboard endpoint** — a simple `GET /health` that returns the
   status of all watchers, last action timestamp, and queue depths would make monitoring
   much easier than grepping log files.

4. **Use structured task IDs** — task filenames like `TASK_email_001.md` are readable
   but not sortable by priority or deadline. A structured ID scheme (e.g.,
   `TASK-{domain}-{priority}-{timestamp}.md`) would make queue management easier.

5. **Write integration tests before the full system exists** — testing individual MCP
   servers and skill outputs in isolation would have caught several edge cases (empty
   inbox, duplicate task files, malformed Odoo responses) before they surfaced in
   production runs.

6. **Document env vars per-component, not just in `.env.example`** — each component
   that reads a specific env var should have a one-line comment explaining what breaks
   if the var is missing. Finding which process broke because `META_IG_USER_ID` was
   unset took more digging than it should.

---

## Metrics (as of 2026-05-31)

| Metric | Value |
|--------|-------|
| Total tasks implemented | 61 subtasks across 12 task groups |
| Domains supported | Email, WhatsApp, LinkedIn, Facebook, Instagram, Odoo |
| MCP servers | 3 (Email HTTP, Odoo stdio, Social stdio) |
| Claude Code skills | 10 |
| Lines of Python | ~2,500 across watchers + executors + MCP servers |
| Lines of skill markdown | ~800 across 10 skill files |
| Error recovery mechanisms | Retry with backoff, auth pause, watchdog restart, payment guard |
| Audit trail | JSONL per day, 90-day retention |
