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
- File: `Plans/PLAN_<task_name>.md`
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
original_file: Inbox/<task_filename>
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

## Status
pending