---
name: whatsapp_handler
description: Process WhatsApp messages from Inbox into TASK files, generate Plans, and route to Pending_Approval for human review before sending any reply.
---

# Skill: WhatsApp Task Handler

## Purpose
Automatically process WhatsApp messages from Inbox → Needs_Action → Plan → [Pending Approval] → Done, producing **clear, actionable, purpose-driven content** in all files.

---

## Trigger
When a new WhatsApp message file appears in the `Inbox` folder.

---

## Input
Each WhatsApp message file should contain:
- sender
- message text
- keywords (if detected)
- timestamp

---

## Execution Rule
- Must follow Bronze-tier pipeline **exactly**.
- Must create Plan files before executing any action.
- Must not overwrite existing files.

---

## Procedure

### Step 1 — Read Task
- Open WhatsApp file from `Inbox`.
- Extract:
  - `sender`
  - `message_text`
  - `timestamp`
  - `task_name` (from filename)
- Detect **keywords** from:  
  `KEYWORDS = ["urgent", "invoice", "payment", "asap", "help"]`.

---

### Step 2 — Understand Task
- Determine task **priority**:
  - High → keywords like `"urgent"`, `"payment"`, `"asap"`.
  - Normal → no keywords.
- Identify **purpose**:
  - e.g., `"Payment request"`, `"Support needed"`, `"Invoice alert"`.

---

### Step 3 — Create Plan (MANDATORY)
- File: `Plans/whatsapp/PLAN_<task_name>.md`
- If exists → DO NOT overwrite
- Format:
```yaml
---
type: whatsapp_task
source: inbox
sender: <sender>
message: "<message_text>"
keywords: [<keywords_detected>]
priority: <priority>
original_file: Inbox/whatsapp/<task_filename>
created: <ISO timestamp>
status: pending
---

## Purpose
A precise, actionable goal derived from WhatsApp message content.

## Suggested Action
- Notify relevant team or user
- Log task in Needs_Action
- Prepare auto-response if approved

## Execution Plan
1. Analyze message content
2. Execute required actions
3. Update Dashboard
4. Complete task

## Compliance Notes
Follow Company_Handbook.md

## Proposed Response
<Write the full response or action to take when this task is approved.
This section is required — process_approved_executor reads it at execution time.>

## Status
pending
```

---

### Step 4 — Sensitive Task Check
Scan the message for sensitive content before routing:
- **Sensitive keywords**: `["password", "account", "bank", "transfer", "login", "secret", "confidential"]`
- If sensitive keyword found → add `sensitive: true` to Plan frontmatter and flag for manual review in the Purpose section.
- If NOT sensitive → continue to Step 5.

---

### Step 5 — Move to Pending Approval
- Create a `TASK_<task_name>.md` file in `Needs_Action/whatsapp/` if not already present.
- Move or copy the Plan to `Pending_Approval/whatsapp/TASK_<task_name>.md` so the approval watcher can surface it to the human reviewer.
- The `pending_approval_watcher.py` will show a dialog; human clicks Yes → file moves to `Approved/whatsapp/`.

---

### Step 6 — Dashboard Update
Append to `vault/AI_Employee_Vault/Dashboard.md` (NEVER overwrite):
```
## Recent Activity

- WhatsApp task received: <task_name>
- From: <sender>
- Priority: <priority>
- Status: pending_approval
- Date: <ISO timestamp>
```

---

### Step 7 — Log Entry
Append to `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md` (NEVER overwrite):
```
## <ISO timestamp> — <task_name> [WHATSAPP TASK CREATED]

- Task: TASK_<task_name>.md
- Status: pending_approval
- Actions Performed:
  - Inbox file read: <original_filename>
  - Plan created: Plans/whatsapp/PLAN_<task_name>.md
  - Routed to: Pending_Approval/whatsapp/
```

---

### Step 8 — Completion
- Confirm `Plans/whatsapp/PLAN_<task_name>.md` exists with a `## Proposed Response` section.
- Confirm task file is in `Pending_Approval/whatsapp/`.
- Report back: task name, plan path, and pending approval status.