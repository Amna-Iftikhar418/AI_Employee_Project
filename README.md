# Personal AI Employee — Silver Tier

> An autonomous AI Employee built with **Claude Code**, **Python watchers**, and an **Obsidian vault**.
> Monitors Gmail and WhatsApp, reasons over incoming messages, writes structured plans,
> routes every action through a **human approval gate**, sends emails via a local MCP server,
> and auto-publishes LinkedIn posts on a daily schedule.

---

## What It Does

| Channel | Capability |
|---|---|
| **Gmail** | Polls every 30 s → reads emails → creates task → drafts reply → awaits approval → sends |
| **WhatsApp** | Listens live → receives messages → creates task → drafts reply → awaits approval |
| **LinkedIn** | Daily 09:00 auto-generates post via AI → awaits approval → publishes via Playwright |
| **Email (MCP)** | Sends real emails through a local FastAPI MCP server using Gmail OAuth |
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
                                                   Pending_Approval/  ◄── human reviews
                                                                        │
                                                         Approved/   ◄── human approves
                                                                        │
                                              approved_watcher auto-executes
                                                                        │
                                                             Done/   ◄── task complete
                                                                        │
                                                   Dashboard.md + Logs/ updated
```

```
Scheduler (09:00 daily)
    └── creator_executor.py → PLAN + POST → Pending_Approval/linkedin/
                                                    │
                                            human approves
                                                    │
                                         Approved/linkedin/
                                                    │
                                   approved_watcher → linkedin_executor
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
| `linkedin_publisher` | `LINKEDIN_POST_*.md` appears in `Approved/linkedin/` |

---

## Watchers (`watchers/`)

All watchers inherit from `BaseWatcher` (abstract base class) and are started automatically by `main.py`:

| Watcher | Purpose |
|---|---|
| `gmail_watcher.py` | Polls Gmail every 30 s → writes emails to `Inbox/email/` |
| `filesystem_watcher.py` | Watches `Inbox/email/` → creates `TASK_*.md` in `Needs_Action/email/` |
| `run_watcher.py` | Launcher for filesystem_watcher |
| `task_processor.py` | Scans `Needs_Action/` → auto-generates plans → routes to `Pending_Approval/` |
| `whatsapp_watcher.py` | Node.js WhatsApp client → writes messages to `Inbox/whatsapp/` |
| `whatsapp_inbox_watcher.py` | Watches `Inbox/whatsapp/` → creates `TASK_*.md` in `Needs_Action/whatsapp/` |
| `approved_watcher.py` | Watches `Approved/linkedin/` → auto-publishes via Playwright |
| `scheduler.py` | Daily 09:00 LinkedIn post + Monday 08:00 CEO Briefing |

---

## MCP Server (`mcp_server.py`)

Local **FastAPI** server on `http://127.0.0.1:8001`.

| Endpoint | Purpose |
|---|---|
| `POST /send-email` | Sends real email via Gmail API — requires `X-API-Key` header |
| `GET /health` | Health check |

**Security features:**
- `X-API-Key` header authentication (timing-safe `hmac.compare_digest`)
- Per-IP rate limiting (5 failures / 60 s window)
- Email address regex validation
- MIME header injection prevention (newline stripping)
- Field length limits (subject ≤ 998 chars, body ≤ 10 MB)

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

## Human Approval Workflow

Claude **never** sends emails or publishes LinkedIn posts without explicit human approval:

```
1. Claude creates PLAN_*.md  →  task moves to Pending_Approval/
2. You review the plan and proposed response
3. Move file to Approved/    →  approved_watcher auto-executes
   OR
   Move file to Rejected/    →  task archived, logged
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

Edit `.env` with your keys:

| Variable | Required | Notes |
|---|---|---|
| `MCP_API_KEY` | ✅ | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GMAIL_CREDENTIALS_PATH` | ✅ | Download from Google Cloud Console |
| `GEMINI_API_KEY` | ✅ (one of) | Free at [aistudio.google.com](https://aistudio.google.com) |
| `GROQ_API_KEY` | ✅ (one of) | Free at [console.groq.com](https://console.groq.com) |
| `DRY_RUN` | Optional | Set `true` to test without sending real emails |

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

Starts in order:
1. MCP email server (port 8001)
2. Gmail watcher
3. Inbox → Needs_Action converter
4. Task processor
5. WhatsApp watcher + inbox watcher
6. LinkedIn approved watcher
7. Scheduler

Press `Ctrl+C` to stop everything gracefully.

### 6. Start Claude Code (second terminal)

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
| **Auto-restart** | `main.py` watch loop restarts any crashed child process automatically |
| **Dedup by message ID** | WhatsApp uses `message.id` (not content hash) — identical messages at different times both arrive |

---

## Compliance Rules

- **NEVER skip plan creation** — every action requires a `PLAN_*.md` first
- **NEVER send emails without approval** — all communication goes through `Pending_Approval/`
- **NEVER post to LinkedIn without approval** — posts always require human sign-off
- **ALWAYS append to logs and Dashboard** — never overwrite existing entries
- **ALWAYS follow `Company_Handbook.md`** — all skills operate within defined rules
- **Financial and communication actions require approval** — no exceptions
