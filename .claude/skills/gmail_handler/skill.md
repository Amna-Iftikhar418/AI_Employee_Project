---
name: gmail_handler
description: Process email tasks from Needs_Action into Plans and route to Pending_Approval with a complete Proposed Response for human review.
---

# Skill: Gmail Task Handler

## Purpose
Process email tasks from Needs_Action → Plans → Pending_Approval, producing complete plan files that include a **Proposed Response** section. All email replies require human approval.

---
## 🚨 HARD VALIDATION RULE

If the generated Plan does NOT contain:

- from: <email>
- subject: <subject>
- ## Proposed Response section

THEN:
- DELETE the plan
- REGENERATE it
- DO NOT SAVE invalid plans

This is mandatory for email sending to work.

---
## Trigger
When a TASK file with `type: email_task` or `source: gmail` appears in `Needs_Action/`.

---

## CRITICAL RULE — READ FIRST

The `send_email_executor.py` script reads the Plan file and looks for a section called `## Proposed Response` to extract the email body. If this section is missing, the entire pipeline fails and no email is ever sent.

**You MUST write `## Proposed Response` in every Plan file. No exceptions.**

---

## PROCEDURE (STRICT ORDER)

### Step 1 — Scan Needs_Action for pending email tasks

- Glob all files matching `vault/AI_Employee_Vault/Needs_Action/email/TASK_*.md`
- Filter to those with `type: email_task` or `source: gmail` in frontmatter
- Process each one in order

---

### Step 2 — For each task: Read and extract

Open the task file. Extract:
- `sender` → from `**From:**` line in body
- `sender_email` → the raw email address inside `< >` or the full From value
- `subject` → from `**Subject:**` line
- `body` → email content after `## Body`
- `task_name` → filename with `TASK_` prefix stripped (keep full name including .txt)
- `original_file` → from frontmatter
- `created` → from frontmatter

Detect keywords present in subject + body:
`["invoice", "payment", "money", "urgent", "asap", "reply", "respond", "action required"]`

---

### Step 3 — Determine intent

- **Reply needed** → sender is asking a question, requesting action, or expects a response
- **Info only** → FYI email, newsletter, notification — no reply needed

---

### Step 4 — Write the Plan file (BLOCKING — must complete before anything else)

**File:** `vault/AI_Employee_Vault/Plans/email/PLAN_<task_name>.md`

- If file already exists AND contains `## Proposed Response` → skip to Step 5
- If file already exists but is MISSING `## Proposed Response` → DELETE it and recreate
- Otherwise → create new file (create the `email/` subdirectory if it does not exist)

**WRITE EXACTLY THIS FORMAT** (fill in all `<placeholders>`):

```
# Plan: <task_name>

---
type: email_task
source: gmail
original_file: <original_file>
from: <sender_email_address>
subject: <subject>
keywords: [<comma separated detected keywords or empty>]
priority: <high or normal>
created: <ISO timestamp>
status: pending
---

## Objective
<One sentence: who sent it, what they want, why it matters>

## Extracted Data
- type: email_task
- sender: <Full Name and email>
- intent: <reply_needed or info_only>
- key info: <invoice numbers, amounts, dates, or None>
- urgency: <High or Normal with reason>
- keywords: <list of detected keywords>

## Action Plan
- [ ] <step 1>
- [ ] <step 2>
- [ ] <step 3>

## Proposed Response

Dear <sender first name>,

<Write a complete, professional email reply that directly addresses what the sender asked. Minimum 3 sentences. Must be specific to this email — do NOT use generic filler.>

Best regards,
Amna Iftikhar

## Approval Required
Yes — email reply requires human approval before sending.

## Expected Outcome
<What success looks like>

## Compliance Notes
- All email replies require Pending_Approval before sending
- Financial/billing emails require additional scrutiny

## Status
pending
```

### ⚠ SELF-CHECK BEFORE SAVING THE PLAN FILE:

Before writing the file, verify all of the following are present:
1. `from: <email>` in frontmatter (must be actual email address, not empty)
2. `## Proposed Response` section exists
3. The response body under `## Proposed Response` is NOT empty and NOT a placeholder
4. The response is addressed to the sender by first name

If ANY of the above is missing → **do NOT save the file** → fix it first → then save.

---

### Step 5 — Route task to Pending_Approval

After the Plan file is saved and verified:

1. Update task frontmatter:
```yaml
status: awaiting_approval
reason: email_reply_requires_approval
detected_keywords: [<keywords>]
plan_reference: Plans/email/PLAN_<task_name>.md
```

2. Move file:
```
vault/AI_Employee_Vault/Needs_Action/email/TASK_<task_name>.md
→
vault/AI_Employee_Vault/Pending_Approval/email/TASK_<task_name>.md
```

3. Write log entry to `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md` (append):
```
## <ISO timestamp> — <task_name> [PENDING APPROVAL]

- Task: TASK_<task_name>.md
- Plan: PLAN_<task_name>.md (created)
- From: <sender>
- Subject: <subject>
- Status: awaiting_approval
- Detected Keywords: [<keywords>]
- Action: Moved to Pending_Approval
- Note: Email reply requires human approval
```

---

### Step 5b — Info-only emails (no reply needed)

If intent is `info_only`:
- Still create Plan file with a `## Proposed Response` section that says "No reply needed — informational email only."
- Update task status to `processed`
- Move task to `vault/AI_Employee_Vault/Done/`
- Append to `Dashboard.md`:
```
- Email logged (no reply): <task_name> — From: <sender> — Subject: <subject> — Date: YYYY-MM-DD
```

---

## OUTPUT GUARANTEE

After this skill runs, for EVERY email task processed:

- ✅ `Plans/email/PLAN_<task_name>.md` exists with `## Proposed Response` section
- ✅ `from:` frontmatter field contains the sender's email address
- ✅ Task moved out of `Needs_Action/`
- ✅ Log entry written

If the Plan file does not contain `## Proposed Response` → the task is NOT complete → fix and retry.
