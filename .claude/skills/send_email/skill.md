---
name: send_email
description: Send an approved email reply via the MCP server. Reads the PLAN file for recipient and body, calls MCP on port 8001, updates logs and Dashboard, then moves task to Done.
---

# Skill: Send Email via MCP

## Purpose

Execute the final email-send step for approved email tasks.

Reads an approved `email_task` file from `Approved/`, extracts the proposed reply
from the corresponding `PLAN_*.md` file, calls the MCP email server at
`http://localhost:8001/send-email`, logs the result, and moves the task to `Done/`.

This skill is the **action layer** — it runs AFTER human approval and AFTER
the plan with a proposed response already exists.

---

## Position in Pipeline

```
Inbox → Needs_Action → Plans → Pending_Approval
                                       ↓
                              (Human reviews + approves)
                                       ↓
                                  Approved/
                                       ↓
                            ┌── send_email skill ──┐
                            │  1. Read task + plan  │
                            │  2. Call MCP server   │
                            │  3. Log result        │
                            │  4. Move → Done/      │
                            └───────────────────────┘
                                       ↓
                                    Done/
```

---

## Prerequisites

Before this skill can run, ALL of the following must be true:

| # | Requirement |
|---|-------------|
| 1 | Task file exists in `Approved/` with `type: email_task` |
| 2 | Corresponding `Plans/PLAN_<task_name>.md` exists |
| 3 | Plan contains a `## Proposed Response` section |
| 4 | Plan frontmatter has `from:` field (recipient email address) |
| 5 | `MCP_API_KEY` is set in `.env` |
| 6 | MCP server is running: `uv run mcp_server.py` |

---

## Inputs

### Task File (`Approved/TASK_*.md`)

```markdown
---
type: email_task
source: gmail
original_file: email_john.txt
created: 2026-03-19T10:00:00
priority: high
status: awaiting_approval
plan_reference: PLAN_email_john.txt.md
---

## Email Task

**From:** john.doe@example.com
**Subject:** Invoice #1234 Payment

## Body

Hi, please find invoice #1234 attached...
```

### Plan File (`Plans/PLAN_*.md`)

```markdown
# Plan: email_john.txt

---
type: email_task
from: john.doe@example.com
subject: Invoice #1234 Payment
priority: high
status: pending
---

## Objective
Reply to John confirming receipt of invoice #1234 and payment timeline.

## Proposed Response
Dear John,

Thank you for sending invoice #1234. We have received it and will process
payment within 5 business days.

Best regards,
The Team

## Required Actions
- [ ] Review proposed response
- [ ] Approve or modify reply
- [ ] Send reply (only after approval)
```

---

## Outputs

### On Success

1. **Email sent** via MCP server to recipient
2. **Task metadata updated** in `Approved/TASK_*.md`:
   ```yaml
   status: completed
   executed_at: 2026-03-19T10:05:00
   executed_by: send_email_skill
   sent_to: john.doe@example.com
   sent_subject: Re: Invoice #1234 Payment
   dry_run: false
   ```
3. **Log entry appended** to `Logs/YYYY-MM-DD.md`
4. **Dashboard updated** in `Dashboard.md`
5. **Task moved** to `Done/TASK_*.md`

### On Failure

1. **No file is moved** — task stays in `Approved/`
2. **Failure log written** to `Logs/YYYY-MM-DD.md`
3. **Exit code 1** returned to Claude

---

## DRY_RUN Mode

Set `DRY_RUN=true` in `.env` to test the full pipeline without sending a real email.

```bash
# .env
DRY_RUN=true
```

In DRY_RUN mode:
- All file operations (log, dashboard, move) execute normally
- HTTP call to MCP server is **skipped**
- Log entries are marked `[DRY RUN]`
- Dashboard entry is marked `[DRY RUN]`
- Task is moved to `Done/` as normal

This lets you validate the full pipeline safely before enabling real sending.

---

## Error Handling

| Error | Behaviour |
|-------|-----------|
| Task file missing | Hard stop — failure logged, nothing moved |
| Wrong task type (not email_task) | Hard stop — clear error message |
| Plan file missing | Hard stop — failure logged, task stays in Approved/ |
| No Proposed Response in plan | Hard stop — failure logged |
| No recipient (empty `from:`) | Falls back to `From:` field in task body |
| MCP server not running | Connection error logged, task stays in Approved/ |
| MCP returns 401 (bad API key) | Clear error: "invalid API key" — check .env |
| MCP returns non-200 | Full HTTP response logged for debugging |

---

## MCP Server Reference

**Endpoint:** `POST http://localhost:8001/send-email`

**Headers:**
```
X-API-Key: <MCP_API_KEY from .env>
Content-Type: application/json
```

**Request body:**
```json
{
  "to": "john.doe@example.com",
  "subject": "Re: Invoice #1234 Payment",
  "body": "Dear John,\n\nThank you for..."
}
```

**Success response:**
```json
{
  "success": true,
  "message": "Email to john.doe@example.com simulated successfully"
}
```

**Start server:**
```bash
uv run mcp_server.py
# or
uvicorn mcp_server:app --port 8001
```

---

## Executor Script

The actual logic lives in `.claude/commands/send_email_executor.py`.

```bash
# Normal run
python .claude/commands/send_email_executor.py TASK_email_john_doe.txt.md

# Dry run
DRY_RUN=true python .claude/commands/send_email_executor.py TASK_email_john_doe.txt.md

# Custom MCP server URL
MCP_SERVER_URL=http://192.168.1.10:8001 python .claude/commands/send_email_executor.py TASK_email_john.txt.md
```

The executor outputs a JSON result to stdout:
```json
{
  "success": true,
  "task": "TASK_email_john_doe.txt.md",
  "to": "john.doe@example.com",
  "subject": "Re: Invoice #1234 Payment",
  "mcp_message": "Email to john.doe@example.com simulated successfully",
  "dry_run": false,
  "moved_to": "Done/TASK_email_john_doe.txt.md"
}
```
