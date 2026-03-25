
# Personal AI Employee — Silver Tier

> An autonomous AI Employee built with **Claude Code**, **Python watchers**, and an **Obsidian vault**.
> Monitors Gmail and WhatsApp, reasons over incoming messages, writes structured plans,
> routes every action through a **human approval gate**, sends emails via a local MCP server,
> and auto-publishes LinkedIn posts on a daily schedule.

---

## Live Activity — 2026-03-25

Tasks completed today in production:

| Time | Channel | Task | Result |
|---|---|---|---|
| 09:44 | Email | Reply to Amna — Subject: invoice | Sent via MCP |
| 09:52 | WhatsApp | Reply to Amna — "Hello" | Completed |
| 09:53 | LinkedIn | Post: "The future of no-code tools" | Published (Playwright) |
| 12:05 | Email | Reply to Amna — Subject: Create LinkedIn Post on AI Automation | Sent via MCP |
| 12:02 | WhatsApp | Reply to Amna — 12:00 PM message | Completed |
| 12:12 | LinkedIn | Post: "How I stay consistent in coding every day" | Published (Playwright) |
| 15:29 | WhatsApp | Reply to Amna — 03:00 PM message | Completed |
| 15:29 | Email | Reply to Amna — Subject: payment | Sent via MCP |
| 15:33 | LinkedIn | Post: "Lessons from building AI systems" | Published (Playwright) |
| 16:32 | Email | Reply to Amna — Subject: business | Sent via MCP |
| 16:32 | WhatsApp | 3× batch replies to Amna (04:06 PM) | Completed |

**3 LinkedIn posts published · 4 emails sent · 7 WhatsApp replies sent**

---

## What It Does

| Channel | Capability |
|---|---|
| **Gmail** | Polls every 30 s → reads emails → creates task → drafts reply → Windows dialog approval → sends |
| **WhatsApp** | Listens live → receives messages → creates task → drafts reply → Windows dialog approval → replies |
| **LinkedIn** | Daily 09:00 auto-generates post via AI → manual Obsidian approval → publishes via Playwright |
| **Email (MCP)** | Sends real emails through a local FastAPI MCP server using Gmail OAuth |
| **Approval UI** | Native Windows Yes/No dialog pops for every email/WhatsApp task — no Obsidian needed |
| **Scheduler** | Daily LinkedIn post + Monday CEO Briefing auto-generated |

---

## Architecture

```
Gmail ──────────────────────────────────────────────────────────────────┐
                                                                        │
WhatsApp ───────────────────────────────────────────────────────────────┤
                                                                        ▼
                                                            Python Watchers
                                                                        │
                                                   vault/AI_Employee_Vault/Inbox/
                                                                        │
                                                    Needs_Action/   ◄── FileSystem Watcher
                                                                        │
                                               Claude (Agent Skills)   ─┘
                                                   reads task → invokes skill
                                                                        │
                                                         Plans/   ◄── PLAN_*.md (MANDATORY)
                                                                        │
                                                   Pending_Approval/  ◄── pending_approval_watcher
                                                                        │            (Windows Yes/No dialog)
                                                         Approved/   ◄── dialog Yes / manual move
                                                                        │
                                              approved_watcher auto-executes
                                                                        │
                                                             Done/   ◄── task complete
                                                                        │
                                                   Dashboard.md + Logs/ updated
```

```
Scheduler (09:00 daily)
    └── linkedin_post_creator skill → PLAN + POST → Pending_Approval/linkedin/
                                                    │
                                            human approves
                                                    │
                                         Approved/linkedin/
                                                    │
                                   approved_watcher → linkedin_executor.py
                                                    │
                                         LinkedIn post published
                                                    │
                                            Done/linkedin/
```

---

## Agent Skills (`.claude/skills/`)

All AI logic is implemented as **Agent Skills** — Claude Code's native skill format.
`CLAUDE.md` defines when each skill is triggered automatically.

| Skill | Trigger |
|---|---|
| `gmail_handler` | `TASK_*.md` with `type: email_task` appears in `Needs_Action/email/` |
| `whatsapp_handler` | `TASK_*.md` with `type: whatsapp_task` appears in `Needs_Action/whatsapp/` |
| `generate_plan` | Any task that needs a structured `PLAN_*.md` before action |
| `file_handler` | General file tasks in `Needs_Action/` |
| `send_email` | Approved email tasks in `Approved/email/` |
| `process_approved` | Any non-LinkedIn approved task |
| `linkedin_post_creator` | User request or daily scheduler trigger |
| `linkedin_publisher` | Fully automated via `approved_watcher.py` — never invoked manually |

---

## Watchers (`watchers/`)

All watchers are started and supervised by `main.py`:

| Watcher | Purpose |
|---|---|
| `gmail_watcher.py` | Polls Gmail every 30 s → writes emails to `Inbox/email/` |
| `run_watcher.py` | Filesystem watcher: `Inbox/email/` → creates `TASK_*.md` in `Needs_Action/email/` |
| `task_processor.py` | Scans `Needs_Action/` → auto-generates plans → routes to `Pending_Approval/` |
| `whatsapp_watcher.py` | Node.js WhatsApp client → writes messages to `Inbox/whatsapp/` |
| `whatsapp_inbox_watcher.py` | Watches `Inbox/whatsapp/` → creates `TASK_*.md` in `Needs_Action/whatsapp/` |
| `approved_watcher.py` | Watches `Approved/` → auto-executes emails, WhatsApp, LinkedIn tasks |
| `pending_approval_watcher.py` | Watches `Pending_Approval/email/` and `Pending_Approval/whatsapp/` → shows Windows Yes/No dialog → moves approved tasks to `Approved/` automatically |
| `scheduler.py` | Daily 09:00 LinkedIn post + Monday 08:00 CEO Briefing |

**Startup order** (`main.py` starts these in sequence):
1. `mcp_server.py` — waits 6 s before next
2. `gmail_watcher.py`
3. `run_watcher.py`
4. `task_processor.py`
5. `whatsapp_watcher.py`
6. `whatsapp_inbox_watcher.py`
7. `approved_watcher.py`
8. `pending_approval_watcher.py`
9. `scheduler.py`

---

## MCP Server (`mcp_server.py`)

Local **FastAPI** server on `http://127.0.0.1:8001`.

| Endpoint | Purpose |
|---|---|
| `POST /send-email` | Sends real email via Gmail API — requires `X-API-Key` header |
| `GET /health` | Health check — polled by `approved_watcher.py` before every email send |

---

## Security

### Secrets Management

| Item | Implementation |
|---|---|
| All API keys | Stored in `.env` — never hardcoded |
| `.env` exclusion | Listed in `.gitignore` alongside `token.json`, `credentials.json`, `.wwebjs_auth/` |
| OAuth tokens | Stored in Windows Credential Manager via `keyring`; file fallback at `token.json` (mode 0o600) |
| Token refresh | Auto-refreshed on expiry via `google.auth.transport.requests.Request` |
| Key rotation | Rotate `MCP_API_KEY` and `GROQ_API_KEY` every 90 days — update `.env` and restart |

> **Never commit `.env` to git.** Use `.env.example` as the safe template.

### MCP Server Hardening

| Protection | Detail |
|---|---|
| API key auth | `X-API-Key` header required on every request |
| Timing-safe comparison | `hmac.compare_digest()` — prevents timing-based key extraction |
| Per-IP rate limiting | Max 5 failed auth attempts per 60 s window — temporary block on breach |
| Email validation | Regex `^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$` |
| Header injection | Newline characters (`\n`, `\r`) stripped from `To`, `Subject` fields |
| Field length limits | Subject ≤ 998 chars, body ≤ 10 MB |
| Socket timeout | Global 30 s timeout via `socket.setdefaulttimeout(30)` |

### Path & File Safety

| Protection | Detail |
|---|---|
| Path traversal | `..`, `/`, `\` stripped from sender names before building file paths (`gmail_watcher.py`) |
| File locking | `FileLock` (10 s timeout) on all vault writes — prevents concurrent corruption |
| Atomic writes | JSON state files written to `.tmp` then renamed with `os.replace()` — crash-safe |
| Single instance | PID file at `.ai_employee.pid` — prevents duplicate process launches |

### Sandbox / Development Mode

| Flag | Scope | Behavior |
|---|---|---|
| `DRY_RUN=true` | Email sending | Skips HTTP call to MCP server — logs `[DRY RUN]` instead |
| `DEV_MODE=true` | LinkedIn posting | Skips browser automation — logs `[DEV MODE]` instead |

Set either flag in `.env` when testing to prevent real emails or posts from being sent.

---

## Error Handling

### Retry Logic

| Component | Retries | Backoff | Behavior on max retries |
|---|---|---|---|
| Gmail API | 3 | Exponential (`2^n` s: 2 s, 4 s) | Raises error, task stays in `Needs_Action/` |
| Email send | 3 | None (retry on next watcher cycle) | Task moved to `Failed/email/` automatically |
| LinkedIn post | 2 | 5 s before attempt 2 | Task stays in `Approved/` for manual retry |

**Terminal errors** (LinkedIn) skip retries immediately:
- `NOT_LOGGED_IN` — session expired, requires manual login
- `node is not installed` — environment issue
- `All text entry methods failed` — LinkedIn UI changed
- `Missing --content-file` — script invocation error

### Exception Handling

| Exception type | Handling |
|---|---|
| `HttpError` (429/500/503) | Retried with exponential backoff |
| `socket.timeout` | Retried with backoff |
| `FileNotFoundError` | Raised immediately — plan/task file missing |
| `ValueError` | Raised immediately — invalid data (e.g. no recipient) |
| `subprocess.TimeoutExpired` | Caught — treated as fatal, task logged as failed |
| Any uncaught exception | Caught at loop level — logs stack trace, sleeps 10 s, continues |

### MCP Health Check

`approved_watcher.py` pings `http://localhost:8001/health` (3 s timeout) **before** every email send.
If MCP is unreachable, the email task is skipped — not burned through retries — and retried on the next watcher cycle.

### Failed Task Routing

```
Email task fails 3 times
        │
        ▼
status: failed
        │
        ▼
Auto-moved to: vault/AI_Employee_Vault/Failed/email/
        │
        ▼
Manual review required (check logs for root cause)
```

---

## Resilience

### Process Management (`main.py`)

| Feature | Detail |
|---|---|
| Auto-restart | Watch loop polls child processes every 5 s — restarts on exit |
| Restart delays | WhatsApp watcher: 30 s; all others: 10 s |
| Single instance | PID lock file prevents duplicate launches |
| Graceful shutdown | `SIGINT`/`SIGTERM` handlers — 5 s terminate timeout, then force-kill; PID cleaned up |
| Port recovery | Auto-frees port 8001 if held by a stale process at startup |
| Vault write check | Tests write access to all vault directories before any watcher starts |
| OneDrive warning | Detects if project is in a OneDrive-synced folder (causes permission conflicts) |

### WhatsApp Watcher Circuit Breaker

```python
MAX_RESTARTS = 5         # give up after 5 rapid crashes
RESTART_DELAY = 12       # seconds before each restart
MIN_HEALTHY_UPTIME = 60  # reset crash counter if running ≥ 60 s
```

After 5 consecutive crashes the watcher stops restarting to prevent an infinite crash loop.
Stale Chrome `SingletonLock` files are auto-deleted before each restart.

### Scheduler Catch-Up

If `scheduler.py` starts after 09:00 and no LinkedIn post exists for today → generates one immediately.
If it starts on Monday and no CEO Briefing exists for this week → generates one immediately.

---

## Audit Logging

Every action is logged to `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md` (one file per day).

### Log entry fields

| Field | Example |
|---|---|
| Timestamp | `2026-03-25T09:38:07.249333` |
| Action type | `[PENDING APPROVAL]`, `[EMAIL SENT]`, `[LINKEDIN POST PUBLISHED]`, `[FAILURE]`, `[COMPLETED]`, `[REJECTED]` |
| Task identity | `TASK_email_john_doe_20260325_093807.txt.md` |
| Actor / source | `From: John Doe <john@example.com>` |
| Target | Subject, recipients, post topic |
| Approval status | `awaiting_approval`, `completed`, `failed`, `rejected` |
| Result | Success details, error messages, attempt counts |

### Example log entry

```markdown
## 2026-03-25T09:38:07.249333 — email_john_doe_20260325_093807 [PENDING APPROVAL]

- Task: TASK_email_john_doe_20260325_093807.txt.md
- Plan: PLAN_email_john_doe_20260325_093807.txt.md (created)
- From: John Doe <john@example.com>
- Subject: Project update
- Status: awaiting_approval
- Action: Moved to Pending_Approval
- Note: Email reply requires human approval
```

All log writes use `FileLock` to prevent concurrent corruption from multiple watcher processes.

---

## Human Approval Workflow

Claude **never** sends emails or publishes LinkedIn posts without explicit human approval:

```
1. Claude creates PLAN_*.md  →  task moves to Pending_Approval/
2a. pending_approval_watcher detects file → pops Windows Yes/No dialog
      Yes  →  file auto-moved to Approved/   →  approved_watcher executes within 5 s
      No   →  file stays in Pending_Approval/ (manual move still available)
   OR
2b. Manually move file to Approved/   →  approved_watcher auto-executes within 5 s
   OR
2c. Manually move file to Rejected/   →  task archived, logged
```

**Approval is enforced structurally** — `task_processor.py` has `require_approval_for_all = True` hardcoded.
There is no code path that executes from `Needs_Action/` or `Pending_Approval/` directly.

### Windows Approval Dialog

`pending_approval_watcher.py` shows a native Windows dialog for every new email/WhatsApp task:

| Field shown | Source |
|---|---|
| File name | `TASK_*.md` filename |
| From | `sender` / `from` frontmatter field |
| Subject | `subject` frontmatter field (email only) |

- Dialog pops as always-on-top (`MB_SYSTEMMODAL`) — won't get buried behind other windows
- Each file is asked **once** — state persisted in `Pending_Approval/.processed_pending_review.json`
- LinkedIn tasks are **not** shown in the dialog — handled manually via Obsidian

---

## Vault Structure (`vault/AI_Employee_Vault/`)

```
vault/AI_Employee_Vault/
├── Inbox/
│   ├── email/              ← Gmail emails land here (raw .txt)
│   └── whatsapp/           ← WhatsApp messages land here (raw .txt)
├── Needs_Action/
│   ├── email/              ← TASK_*.md waiting for Claude
│   └── whatsapp/           ← TASK_*.md waiting for Claude
├── Plans/
│   ├── email/              ← PLAN_*.md (auto-generated, mandatory)
│   ├── whatsapp/           ← PLAN_*.md
│   └── linkedin/           ← PLAN_LINKEDIN_*.md
├── Pending_Approval/       ← Awaiting human review
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Approved/               ← Human approved — ready for execution
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Rejected/               ← Human rejected
├── Failed/                 ← Tasks that exhausted all retries
│   └── email/
├── Done/                   ← Completed tasks
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Logs/                   ← Daily audit log: log_YYYY-MM-DD.md
├── Briefings/              ← Auto-generated Monday CEO briefings
├── Dashboard.md            ← Live activity feed (append-only)
└── Company_Handbook.md     ← Operating rules all skills must follow
```

---

## Setup

### 1. Install dependencies

```bash
uv sync
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `MCP_API_KEY` | Yes | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GMAIL_CREDENTIALS_PATH` | Yes | Download `credentials.json` from Google Cloud Console |
| `GROQ_API_KEY` | Yes | Free at [console.groq.com](https://console.groq.com) |
| `GEMINI_API_KEY` | Optional | Alternative LLM at [aistudio.google.com](https://aistudio.google.com) |
| `DRY_RUN` | Optional | `true` to skip real email sends (testing) |
| `DEV_MODE` | Optional | `true` to skip real LinkedIn posts (development) |

### 3. Gmail OAuth (first run only)

```bash
uv run watchers/gmail_watcher.py
# Browser opens → authorize → token.json saved automatically
```

### 4. LinkedIn login (for auto-publishing)

```bash
node linkedin_login.js
# Browser opens → log in manually → session saved for Playwright
```

### 5. Start the full system

```bash
uv run watchers/main.py
```

Press `Ctrl+C` to stop all processes gracefully.

### 6. Open Claude Code (second terminal)

```bash
claude
```

Claude loads `CLAUDE.md` automatically and knows all 8 skills.

---

## Key Design Decisions

| Decision | Why |
|---|---|
| **Vault-first architecture** | All state is in plain markdown files — inspectable, editable, version-controllable |
| **Human-in-the-loop mandatory** | No email or LinkedIn post ever executes without a file in `Approved/` |
| **Plan before action** | Every task requires a `PLAN_*.md` with `## Proposed Response` — enforced by skills |
| **FileLock on shared files** | `Dashboard.md` and daily logs are written by multiple processes — `filelock` prevents corruption |
| **Atomic writes** | All JSON state files use write-to-.tmp + `os.replace()` — crash-safe |
| **Auto-restart** | `main.py` watch loop restarts any crashed child process within 5–30 s |
| **MCP health check** | `approved_watcher.py` pings `/health` before each email send — avoids burning retries when server is down |
| **Failed task routing** | Email tasks that exhaust 3 retries are moved to `Failed/email/` — `Approved/` stays clean |
| **Dedup by message ID** | Gmail and WhatsApp use message IDs (not content hash) — identical messages at different times both arrive |

---

## Compliance Rules

- **NEVER skip plan creation** — every action requires a `PLAN_*.md` first
- **NEVER send emails without approval** — all communication goes through `Pending_Approval/`
- **NEVER post to LinkedIn without approval** — posts always require human sign-off
- **ALWAYS append to logs and Dashboard** — never overwrite existing entries
- **ALWAYS follow `Company_Handbook.md`** — all skills operate within defined rules
- **Financial and communication actions require approval** — no exceptions
