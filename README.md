# Personal AI Employee — Silver Tier

> **An autonomous AI employee** built on Claude Code, Python watchers, and an Obsidian vault.
> Monitors Gmail and WhatsApp in real-time, reasons over incoming messages, writes structured plans,
> routes every action through a human approval gate, sends emails via a local MCP server,
> and auto-publishes LinkedIn posts on a daily schedule — all without touching a browser.

---

## Table of Contents

- [What It Does](#what-it-does)
- [How It Works](#how-it-works)
- [Agent Skills](#agent-skills)
- [Watchers](#watchers)
- [MCP Email Server](#mcp-email-server)
- [Vault Structure](#vault-structure)
- [Human Approval Workflow](#human-approval-workflow)
- [Setup](#setup)
- [Key Design Decisions](#key-design-decisions)
- [Compliance Rules](#compliance-rules)

---

## What It Does

| Channel | What happens automatically |
|---|---|
| **Gmail** | Polls every 30 s → reads email → creates task → drafts reply → routes to approval → sends |
| **WhatsApp** | Listens live → receives message → creates task → drafts reply → routes to approval |
| **LinkedIn** | Daily 09:00 → AI generates post → awaits approval → Playwright publishes automatically |
| **Email (MCP)** | Sends real Gmail via a local FastAPI server using OAuth 2.0 |
| **Scheduler** | Daily LinkedIn post + Monday CEO briefing, auto-generated on a cron schedule |

---

## How It Works

Every action in the system follows the same pipeline — no shortcuts, no direct sends:

```
  Gmail / WhatsApp
        │
        ▼
  Python Watchers                    ← poll / listen for new messages
        │
        ▼
  Inbox/  (raw .txt files)
        │
        ▼
  Needs_Action/  (TASK_*.md)         ← filesystem watcher creates structured task
        │
        ▼
  Claude Agent Skills                ← reads task → generates PLAN_*.md
        │
        ▼
  Plans/  (PLAN_*.md)                ← mandatory — every action requires a plan
        │
        ▼
  Pending_Approval/                  ← human reviews proposed response
        │
     approve?
    ┌────┴────┐
   YES        NO
    │          │
    ▼          ▼
Approved/   Rejected/
    │
    ▼
approved_watcher auto-executes       ← send email or publish LinkedIn post
    │
    ▼
  Done/                              ← task archived
    │
    ▼
  Dashboard.md + Logs/ updated       ← append-only audit trail
```

**LinkedIn-specific flow:**

```
  Scheduler (09:00 daily)
        │
        ▼
  linkedin_post_creator skill
        │
        ▼
  Plans/linkedin/PLAN_LINKEDIN_*.md  ← plan created first
        │
        ▼
  Pending_Approval/linkedin/         ← awaits human approval
        │
        ▼
  Approved/linkedin/                 ← human moves file here
        │
        ▼
  approved_watcher → linkedin_executor.py + linkedin_post.js
        │
        ▼
  LinkedIn post published via Playwright
        │
        ▼
  Done/linkedin/
```

---

## Agent Skills

All AI logic lives in `.claude/skills/` — never in Python scripts.
`CLAUDE.md` defines exactly when each skill auto-triggers.

| Skill | Triggers when… |
|---|---|
| `gmail_handler` | `TASK_*.md` with `type: email_task` appears in `Needs_Action/email/` |
| `whatsapp_handler` | `TASK_*.md` with `type: whatsapp_task` appears in `Needs_Action/whatsapp/` |
| `generate_plan` | Any task needs a structured `PLAN_*.md` before action |
| `file_handler` | General file task appears in `Needs_Action/` |
| `send_email` | Approved email task appears in `Approved/email/` |
| `process_approved` | Any non-LinkedIn approved task |
| `linkedin_post_creator` | User request or daily scheduler trigger |
| `linkedin_publisher` | Fully automated — triggered by `approved_watcher.py`, never invoked manually |

> **Rule:** Every AI action goes through a skill. Ad-hoc code execution is forbidden.

---

## Watchers

All watchers inherit from `BaseWatcher` and are started by `main.py`.
Any crashed child process is automatically restarted.

| Watcher | Role |
|---|---|
| `gmail_watcher.py` | Polls Gmail every 30 s → writes raw email to `Inbox/email/` |
| `filesystem_watcher.py` | Watches `Inbox/email/` → creates `TASK_*.md` in `Needs_Action/email/` |
| `task_processor.py` | Scans `Needs_Action/` → invokes Claude skills → routes to `Pending_Approval/` |
| `whatsapp_watcher.py` | Node.js WhatsApp client → writes messages to `Inbox/whatsapp/` |
| `whatsapp_inbox_watcher.py` | Watches `Inbox/whatsapp/` → creates `TASK_*.md` in `Needs_Action/whatsapp/` |
| `approved_watcher.py` | Watches `Approved/linkedin/` → invokes `linkedin_executor.py` to publish |
| `scheduler.py` | Cron: daily 09:00 LinkedIn post, Monday 08:00 CEO Briefing |
| `run_watcher.py` | Launcher wrapper for `filesystem_watcher.py` |

---

## MCP Email Server

Local **FastAPI** server running at `http://127.0.0.1:8001`.
Claude's `send_email` skill calls this server — never Gmail directly.

| Endpoint | Purpose |
|---|---|
| `POST /send-email` | Sends real email via Gmail OAuth 2.0 |
| `GET /health` | Health check |

**Security hardening:**

- `X-API-Key` header authentication using `hmac.compare_digest` (timing-safe)
- Per-IP rate limiting — 5 failures per 60-second window
- Email address regex validation before any send
- MIME header injection prevention (newline stripping on all fields)
- Field length limits: subject ≤ 998 chars, body ≤ 10 MB

---

## Vault Structure

All system state lives in plain Markdown files — inspectable, editable, and version-controlled.

```
vault/AI_Employee_Vault/
├── Inbox/
│   ├── email/                  ← raw Gmail messages (.txt)
│   └── whatsapp/               ← raw WhatsApp messages (.txt)
├── Needs_Action/
│   ├── email/                  ← TASK_*.md files awaiting Claude
│   └── whatsapp/               ← TASK_*.md files awaiting Claude
├── Plans/
│   ├── email/                  ← PLAN_*.md — mandatory, auto-generated
│   ├── whatsapp/               ← PLAN_*.md
│   └── linkedin/               ← PLAN_LINKEDIN_*.md
├── Pending_Approval/           ← awaiting human review
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Approved/                   ← human approved — ready for execution
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Rejected/                   ← human rejected — archived
├── Done/                       ← completed tasks
│   ├── email/
│   ├── whatsapp/
│   └── linkedin/
├── Logs/                       ← daily audit log: log_YYYY-MM-DD.md
├── Briefings/                  ← auto-generated Monday CEO briefings
├── Dashboard.md                ← live append-only activity feed
└── Company_Handbook.md         ← operating rules enforced by all skills
```

---

## Human Approval Workflow

Claude **never** sends an email or publishes a LinkedIn post without a file in `Approved/`.
This is enforced at the skill level — not optional.

```
Step 1 — Claude creates PLAN_*.md
         └── Proposed response is written inside the plan
         └── Task file moves to Pending_Approval/

Step 2 — You review
         └── Open Pending_Approval/ in Obsidian or any editor
         └── Read the plan and proposed response

Step 3 — You decide
         ├── Move to Approved/   → approved_watcher executes automatically
         └── Move to Rejected/   → task archived, logged, no action taken
```

No approval = no action. Always.

---

## Setup

### 1. Install dependencies

```bash
uv sync       # Python dependencies
npm install   # Node.js (WhatsApp + Playwright)
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `MCP_API_KEY` | ✅ | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GMAIL_CREDENTIALS_PATH` | ✅ | Download `credentials.json` from Google Cloud Console |
| `GEMINI_API_KEY` | ✅ one of | Free at [aistudio.google.com](https://aistudio.google.com) |
| `GROQ_API_KEY` | ✅ one of | Free at [console.groq.com](https://console.groq.com) |
| `DRY_RUN` | Optional | Set `true` to test without sending real emails |

### 3. Authorize Gmail (first run only)

```bash
uv run watchers/gmail_watcher.py
# Browser opens → authorize Google account → token.json saved automatically
```

### 4. Log in to LinkedIn (for auto-publishing)

```bash
node linkedin_login.js
# Browser opens → log in manually → Playwright session saved for future runs
```

### 5. Start the full system

```bash
uv run watchers/main.py
```

Starts all services in order:

1. MCP email server — port 8001
2. Gmail watcher — polls every 30 s
3. Inbox → Needs_Action converter
4. Task processor (Claude skill runner)
5. WhatsApp watcher + inbox watcher
6. LinkedIn approved watcher
7. Daily scheduler (09:00 post, 08:00 Monday briefing)

Press `Ctrl+C` to stop everything gracefully.

### 6. Start Claude Code (second terminal)

```bash
claude
```

Claude loads `CLAUDE.md` automatically and has access to all 8 skills.

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| **Vault-first architecture** | All state is plain Markdown — inspectable, editable, and diff-able in git |
| **Human-in-the-loop mandatory** | No email or post ever executes without a file physically present in `Approved/` |
| **Plan before every action** | Every task requires a `PLAN_*.md` with `## Proposed Response` — enforced by skill contracts |
| **Skills, not scripts** | All AI logic lives in `.claude/skills/` — Python watchers only move files, never reason |
| **FileLock on shared files** | `Dashboard.md` and logs are written by multiple processes — `filelock` prevents corruption |
| **Atomic writes** | All JSON state files use write-to-.tmp + `os.replace()` — safe against crashes mid-write |
| **Auto-restart loop** | `main.py` detects any crashed child process and restarts it automatically |
| **Dedup by message ID** | WhatsApp uses `message.id`, not content hash — identical messages at different times both arrive |

---

## Compliance Rules

These rules are enforced at the skill level and cannot be bypassed:

- **Never skip plan creation** — every action requires a `PLAN_*.md` with `## Proposed Response`
- **Never send emails without approval** — all outbound communication goes through `Pending_Approval/`
- **Never post to LinkedIn without approval** — posts always require explicit human sign-off
- **Always append to logs and Dashboard** — existing entries are never overwritten
- **Always follow `Company_Handbook.md`** — all skills operate within its defined rules
- **Financial and communication actions require approval** — no exceptions, no overrides
