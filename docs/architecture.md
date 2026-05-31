# AI Employee — System Architecture

## Overview

The AI Employee is an autonomous agent system that monitors communication channels
(Gmail, WhatsApp), processes incoming tasks, routes them through a human approval
workflow, and executes actions (send emails, publish social posts, manage Odoo accounting).

The system is built around four layers:

```
┌──────────────────────────────────────────────────────────────┐
│  PERCEPTION LAYER                                            │
│  Gmail Watcher · WhatsApp Watcher · Scheduler                │
└───────────────────────────┬──────────────────────────────────┘
                            │  raw messages → Inbox/
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  REASONING LAYER                                             │
│  Claude Code + Skills (.claude/skills/)                      │
│  Task Processor · Run Watcher                                │
└───────────────────────────┬──────────────────────────────────┘
                            │  PLAN_*.md → Pending_Approval/
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  HUMAN-IN-THE-LOOP (HITL) LAYER                              │
│  Pending Approval Watcher  (terminal Y/N prompt)             │
└───────────────────────────┬──────────────────────────────────┘
                            │  → Approved/ or Rejected/
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ACTION LAYER                                                │
│  Approved Watcher · Email MCP · Odoo MCP · Social MCP        │
│  LinkedIn Publisher (Playwright)                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Inventory

### Watchers (`watchers/`)

| Component | File | Role |
|-----------|------|------|
| Main Launcher | `main.py` | Spawns all processes; single-instance lock; watchdog restart |
| Gmail Watcher | `gmail_watcher.py` | Polls Gmail every 30 s; writes raw emails to `Inbox/email/` |
| WhatsApp Watcher | `whatsapp_watcher.py` | Monitors WhatsApp Web via Chrome; writes to `Inbox/whatsapp/` |
| WhatsApp Inbox Watcher | `whatsapp_inbox_watcher.py` | Picks up new files in `Inbox/whatsapp/` |
| Run Watcher | `run_watcher.py` | Detects new files in `Inbox/` and promotes them to `Needs_Action/` |
| Task Processor | `task_processor.py` | Invokes Claude skill for files in `Needs_Action/` |
| Approved Watcher | `approved_watcher.py` | Executes tasks from `Approved/` (email, social, Odoo) |
| Pending Approval Watcher | `pending_approval_watcher.py` | Prompts human Y/N for each file in `Pending_Approval/` |
| Scheduler | `scheduler.py` | Cron: daily LinkedIn post (09:00), weekly CEO briefing (Mon 08:00), log cleanup (Mon 07:00) |
| Retry Handler | `retry_handler.py` | `@with_retry` decorator — exponential backoff, max 3 attempts |
| Audit Logger | `audit_logger.py` | `log_action()` — writes JSONL to `Logs/YYYY-MM-DD.json` |

### MCP Servers

| Server | Transport | Port | Purpose |
|--------|-----------|------|---------|
| Email MCP (`mcp_server.py`) | HTTP (FastAPI) | 8001 | Send emails via Gmail API |
| Odoo MCP (`mcp_servers/odoo_mcp/`) | stdio (MCP protocol) | N/A | Read/draft invoices, query Odoo |
| Social MCP (`mcp_servers/social_mcp/`) | stdio (MCP protocol) | N/A | Post to Facebook Page + Instagram |

### Claude Skills (`.claude/skills/`)

| Skill | File | Trigger |
|-------|------|---------|
| `gmail_handler` | `gmail_handler/skill.md` | `TASK_*.md` in `Needs_Action/email/` |
| `whatsapp_handler` | `whatsapp_handler/whatsapp_task_handler.md` | `TASK_*.md` in `Needs_Action/whatsapp/` |
| `odoo_handler` | `odoo_handler/skill.md` | `TASK_odoo_*.md` in `Needs_Action/odoo/` or `Approved/odoo/` |
| `facebook_instagram_poster` | `facebook_instagram_poster/skill.md` | User request or `SOCIAL_POST_*.md` |
| `linkedin_post_creator` | `linkedin_post_creator/skill.md` | User request or scheduler 09:00 |
| `linkedin_publisher` | `linkedin_publisher/skill.md` | Approved LinkedIn file — Playwright browser |
| `send_email` | `send_email/skill.md` | `TASK_*.md` in `Approved/email/` |
| `process_approved` | `process_approved/skill.md` | Non-LinkedIn task in `Approved/` |
| `generate_plan` | `generate_plan/skill.md` | Any task needing a PLAN file |
| `weekly_audit` | `weekly_audit/skill.md` | Monday 08:00 or manual CEO briefing request |

### Vault (`vault/AI_Employee_Vault/`)

The vault is the central file-based state store. All components communicate by
reading and writing files in the vault. No shared memory or message queues.

```
vault/AI_Employee_Vault/
├── Inbox/
│   ├── email/              <- Raw incoming emails (written by gmail_watcher)
│   └── whatsapp/           <- Raw WhatsApp messages
├── Needs_Action/
│   ├── email/              <- Emails awaiting AI reasoning
│   ├── whatsapp/           <- WhatsApp messages awaiting AI reasoning
│   ├── odoo/               <- Odoo tasks awaiting AI reasoning
│   └── social/             <- Social media tasks awaiting AI reasoning
├── Plans/
│   ├── email/              <- PLAN_*.md for email tasks
│   ├── linkedin/           <- PLAN_*.md for LinkedIn posts
│   ├── social/             <- PLAN_*.md for social posts
│   └── odoo/               <- PLAN_*.md for Odoo actions
├── Pending_Approval/
│   ├── email/              <- Email drafts waiting for human Y/N
│   ├── linkedin/           <- LinkedIn posts waiting for human Y/N
│   ├── social/             <- Facebook/Instagram posts waiting for human Y/N
│   └── odoo/               <- Odoo actions (invoices, payments) waiting for human Y/N
├── Approved/               <- Human-approved tasks ready to execute
│   ├── email/
│   ├── linkedin/
│   ├── social/
│   └── odoo/
├── Rejected/               <- Human-rejected tasks (archived, not deleted)
├── Done/                   <- Completed tasks (one subfolder per domain)
│   ├── email/
│   ├── linkedin/
│   ├── social/
│   └── odoo/
├── Briefings/              <- Weekly CEO briefings (YYYY-MM-DD_Monday_Briefing.md)
├── Logs/
│   ├── log_YYYY-MM-DD.md   <- Human-readable daily logs
│   └── YYYY-MM-DD.json     <- JSONL audit logs (90-day retention)
├── Dashboard.md            <- Live status dashboard (appended by every action)
├── Business_Goals.md       <- Revenue targets, KPIs, subscription audit rules
└── Company_Handbook.md     <- Permission boundaries and operating rules
```

---

## Data Flow

### Full pipeline (all domains)

```
External World
      │
      │  email arrives / WhatsApp message received
      ▼
┌─────────────────┐
│  Inbox/         │  Raw message file: TASK_*.md or EMAIL_*.md
└────────┬────────┘
         │  run_watcher promotes file
         ▼
┌─────────────────┐
│  Needs_Action/  │  task_processor.py detects → invokes claude skill
└────────┬────────┘
         │  skill reads file, reasons, writes plan
         ▼
┌─────────────────┐
│  Plans/         │  PLAN_*.md with Objective / Action Steps / Proposed Response
└────────┬────────┘
         │  skill routes to Pending_Approval/
         ▼
┌────────────────────────┐
│  Pending_Approval/     │  pending_approval_watcher.py prompts human in terminal
└──────────┬─────────────┘
           │
    ┌──────┴──────┐
    │ Y           │ N
    ▼             ▼
┌──────────┐  ┌──────────┐
│ Approved/│  │ Rejected/│
└────┬─────┘  └──────────┘
     │  approved_watcher.py detects
     ▼
┌──────────────────────────────┐
│  Execute Action              │
│  · Email: POST /send-email   │
│  · Social: Meta Graph API    │
│  · LinkedIn: Playwright      │
│  · Odoo: XML-RPC             │
└────────────┬─────────────────┘
             │  log_action() writes JSONL; Dashboard updated
             ▼
┌──────────┐
│  Done/   │  Task file moved here; audit trail preserved
└──────────┘
```

---

## Domain-Specific Flows

### Email

```
Gmail Inbox
    │  gmail_watcher polls every 30 s via Gmail API
    ▼
Inbox/email/EMAIL_*.md
    │  run_watcher + task_processor → gmail_handler skill
    ▼
Plans/email/PLAN_*.md  +  Pending_Approval/email/PLAN_*.md
    │  human approves
    ▼
Approved/email/ → approved_watcher → POST http://localhost:8001/send-email
    │  Email MCP sends via Gmail API
    ▼
Done/email/
```

**Error handling:**
- Gmail API down → failed IDs queued in `.failed_email_queue.json`, retried next cycle
- Auth token expired → `AuthError` raised, Gmail paused 30 min, alert written to Logs/

---

### WhatsApp

```
WhatsApp Web (Chrome)
    │  whatsapp_watcher monitors via browser automation
    ▼
Inbox/whatsapp/TASK_*.md
    │  whatsapp_inbox_watcher + task_processor → whatsapp_handler skill
    ▼
Pending_Approval/whatsapp/
    │  human approves
    ▼
Approved/whatsapp/ → approved_watcher → (reply or action)
    ▼
Done/whatsapp/
```

---

### LinkedIn

```
Scheduler (09:00 daily)  or  User request
    │  invokes linkedin_post_creator skill via claude -p
    ▼
Pending_Approval/linkedin/PLAN_*.md   (post content inside)
    │  pending_approval_watcher shows post to human
    │
    ├── YES → Approved/linkedin/ → linkedin_publisher skill (Playwright MCP)
    │         opens linkedin.com in browser, types post, submits
    │         → Done/linkedin/
    │
    └── NO  → Rejected/linkedin/
```

---

### Facebook & Instagram

```
User request  or  SOCIAL_POST_*.md in Needs_Action/social/
    │  facebook_instagram_poster skill
    ▼
Pending_Approval/social/SOCIAL_POST_*.md
    │  human approves
    ▼
Approved/social/ → approved_watcher → facebook_instagram_executor.py
    │  POST to Meta Graph API (Facebook Page + Instagram)
    ▼
Done/social/
```

**Permission guard:** `_assert_in_approved()` raises `PermissionError` if file is not
in `Approved/social/` — prevents any accidental auto-publish.

---

### Odoo Accounting

```
User request  or  TASK_odoo_*.md in Needs_Action/odoo/
    │  odoo_handler skill (read-only: executes immediately)
    │  odoo_handler skill (write: creates plan, routes to Pending_Approval)
    ▼
Pending_Approval/odoo/   (for write actions only)
    │  human approves
    ▼
Approved/odoo/ → odoo_executor.py → Odoo XML-RPC
    ▼
Done/odoo/
```

**Payment guard:** `_FORBIDDEN_ACTIONS` frozenset in `odoo_executor.py` raises
`PermissionError` if `action_post` or `action_register_payment` is ever called
directly — payments always require HITL.

---

### Weekly CEO Briefing

```
scheduler.py  (Monday 08:00)
    │  invokes weekly_audit skill via claude -p
    ▼
weekly_audit skill reads:
    · Business_Goals.md  (revenue targets, KPIs)
    · Done/ task counts per domain
    · Odoo MCP  (invoice/revenue data)
    · Pending_Approval/  (bottleneck detection: tasks open > 7 days)
    ▼
Briefings/YYYY-MM-DD_Monday_Briefing.md
    (Executive Summary · Revenue · Completed Tasks · Bottlenecks · Suggestions)
```

---

## Error Recovery & Resilience

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Gmail API down | `@with_retry` (3 attempts, exponential backoff) | Queue IDs to `.failed_email_queue.json` |
| Gmail auth expired | `AuthError` in `_authenticate()` | Pause Gmail 30 min, alert to Logs + Dashboard |
| Email MCP crash | `_watch_loop()` detects exit code | Auto-restart after 10 s |
| WhatsApp crash | `_watch_loop()` detects exit code | Auto-restart after 30 s |
| Odoo API timeout | `@with_retry` + `_raw_odoo_rpc` | Write alert to Logs/; payment actions NOT retried |
| Port 8001 in use | `_ensure_port_free()` on startup | Kill holding process, free port |
| OneDrive sync | `_check_onedrive()` on startup | Warn user, suggest move to C:\AI_Employee_Project |
| Duplicate instance | PID lock file `.ai_employee.pid` | Exit with error message |

---

## Audit Trail

Every action writes a JSONL entry to `vault/AI_Employee_Vault/Logs/YYYY-MM-DD.json`:

```json
{
  "timestamp": "2026-05-31T09:15:42Z",
  "action_type": "email_sent",
  "actor": "AI_Employee",
  "target": "recipient@example.com",
  "parameters": {"subject": "Re: Invoice"},
  "approval_status": "approved",
  "approved_by": "human",
  "result": "success"
}
```

Log files older than 90 days are deleted automatically every Monday at 07:00
by `cleanup_audit_logs()` in `scheduler.py`.

---

## Security Model

All actions that affect the external world require:
1. A file to exist in `Approved/` (can't be faked — watcher checks the path)
2. Human to have pressed `Y` in the terminal (physical HITL step)
3. The action executor to call `_assert_in_approved()` before any API call

The only fully autonomous actions are:
- Reading email/WhatsApp (no side effects)
- Writing draft files to vault (no external effects)
- Generating plans and proposals (no external effects)
- Generating the CEO briefing (write-only to local vault)
