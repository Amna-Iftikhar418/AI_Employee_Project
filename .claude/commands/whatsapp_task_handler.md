# Skill: WhatsApp Task Handler

## Purpose
Automatically process WhatsApp messages from Needs_Action → Plan → [Pending Approval] → Done, producing **clear, actionable, purpose-driven content** in all files.

---

## Trigger
When a new WhatsApp TASK file appears in the `Needs_Action` folder (type: whatsapp_task).

---

## Input
Task file frontmatter contains:
- `type: whatsapp_task`
- `source: whatsapp`
- `original_file` (whatsapp_*.txt)
- `created` (ISO timestamp)
- `priority`
- `status: pending`

Body contains:
- **From:** sender name/number
- **Body:** message text

---

## Execution Rule
- Must follow Bronze-tier pipeline **exactly**.
- Must create Plan files before executing any action.
- Must not overwrite existing files.
- You MUST create actual files in the vault — do NOT simulate or describe actions.

---

## GLOBAL CONSTRAINTS

- NEVER skip Plan creation
- NEVER execute task before Plan exists
- NEVER overwrite existing files (Plans, Logs)
- ALWAYS maintain traceability
- ALL actions must follow Company_Handbook.md
- ALL AI logic must stay within this skill

---

## PROCEDURE (STRICT ORDER)

### Step 1 — Read Task
- Open WhatsApp TASK file from `Needs_Action/`
- Extract:
  - `sender` (from **From:** field)
  - `message_text` (from **Body:** section)
  - `timestamp` (from `created` frontmatter)
  - `task_name` (from filename: strip `TASK_` prefix)
- Detect **keywords** from message text:
  `KEYWORDS = ["urgent", "invoice", "payment", "asap", "help"]`

---

### Step 2 — Understand Task
- Determine task **priority**:
  - High → keywords like `"urgent"`, `"payment"`, `"asap"`
  - Normal → no keywords
- Identify **purpose**:
  - e.g., `"Payment request"`, `"Support needed"`, `"Invoice alert"`, `"General inquiry"`

---

### Step 3 — Create Plan (MANDATORY — BLOCKING STEP)

This step MUST complete BEFORE ANY OTHER ACTION.

If Plan is not created → STOP execution.

#### File Path:
`Plans/PLAN_<task_name>.md`

#### Rules:
- If file exists → DO NOT overwrite → continue to Step 4
- Otherwise → CREATE new file using `.claude/skills/generate_plan.md`

#### HOW TO GENERATE THE PLAN:

Follow `.claude/skills/generate_plan.md` exactly.

The plan MUST contain all of these sections:

```markdown
# Plan: <task_name>

---
type: whatsapp_task
source: whatsapp
sender: <sender>
message: "<first 100 chars of message>"
keywords: [<keywords_detected>]
priority: <priority>
original_file: <original_file>
created: <ISO timestamp>
status: pending
---

## Objective
(Specific goal — who, what, why)

## Extracted Data
- type: whatsapp_task
- sender: <name or number>
- intent: <real intent — payment request / support / greeting / etc.>
- key info: <invoice #, amounts, deadlines — or "None">
- urgency: <High / Normal + reason>
- keywords: <detected keywords>

## Action Plan
- [ ] <Specific step 1>
- [ ] <Specific step 2>
- [ ] <Specific step 3>

## Proposed Response
(MANDATORY — real WhatsApp reply draft, conversational tone)

Hi <name>! 👋
<Direct response addressing their exact request>

## Approval Required
<yes/no + reason>

## Expected Outcome
<What success looks like>

## Compliance Notes
Follow Company_Handbook.md

## Status
pending
```

**FAIL CONDITION: If `## Proposed Response` is missing → do NOT save plan → STOP**

---

### Step 4 — Sensitive Task Check (MANDATORY GATE)

After Plan creation, check if task involves sensitive operations:

**Sensitive keywords for WhatsApp:**
- `invoice`
- `payment`
- `money`
- `urgent`
- `asap`

#### IF sensitive keywords found:

1. **Move task to Pending_Approval:**
   ```
   Needs_Action/<task_file> → Pending_Approval/<task_file>
   ```
2. **Update task metadata:**
   ```yaml
   status: awaiting_approval
   reason: sensitive_keywords_detected
   detected_keywords: [list of found keywords]
   plan_reference: PLAN_<task_name>.md
   ```
3. **Write Log Entry:**

   File: `Logs/YYYY-MM-DD.md`

   ```markdown
   ## <ISO timestamp> — <task_name> [PENDING APPROVAL]

   - Task: <task_filename>
   - Plan: PLAN_<task_name>.md (created)
   - Status: awaiting_approval
   - Detected Keywords: [keywords found]
   - Sender: <sender>
   - Action: Moved to Pending_Approval
   - Note: Task requires human approval before execution
   ```
4. **STOP** — Do NOT proceed to execution

#### IF NO sensitive keywords:
- Continue to Step 5 (Execution)

---

### Step 5 — Execution & Dashboard Update

Record the action taken and append to `Dashboard.md`:

```markdown
## Recent Activity

- WhatsApp task processed: <task_name>
- Sender: <sender>
- Plan created: PLAN_<task_name>.md
- Action taken: <brief description>
- Date: YYYY-MM-DD
```

Rules:
- Append only (do NOT overwrite full file)
- Preserve existing content

---

### Step 6 — Write Log Entry (AFTER DASHBOARD)

#### File:
`Logs/YYYY-MM-DD.md`

#### Rules:
- If file exists → append
- If not → create
- NEVER overwrite

#### Format:

```markdown
## <ISO timestamp> — <task_name>

- Task: <task_filename>
- Sender: <sender>
- Plan Reference: PLAN_<task_name>.md
- Actions Performed:
  - Plan created
  - Dashboard updated
  - Task processed
- Dashboard Update: confirmed
- Status: processed
```

---

### Step 7 — Update Task Status

Modify task metadata:

```yaml
status: processed
```

---

### Step 8 — Move Task to Done (MANDATORY)

Move file:

```
Needs_Action/<task_file> → Done/<task_file>
```

Rules:
- MUST move file
- MUST NOT leave processed files in Needs_Action

---

## FAILURE HANDLING

If ANY step fails:

1. STOP execution
2. Write log entry:
   - Status: failed
   - Error: <description>
3. DO NOT continue

---

## ENFORCEMENT RULES (STRICT)

Execution MUST follow EXACT order:

1. Read Task
2. Understand Task
3. Create Plan ← HARD GATE (ALWAYS FIRST - cannot skip)
4. Sensitive Task Check ← HARD GATE (blocks sensitive tasks after plan)
5. Execution & Dashboard Update
6. Write Logs
7. Update Task
8. Move to Done

If Plan step is skipped → SYSTEM IS INVALID

---

## OUTPUT GUARANTEE

After execution, the system MUST produce:

**Normal Tasks:**
- ✅ Plan file in /Plans (with real content, not generic template)
- ✅ Dashboard updated with WhatsApp task entry
- ✅ Log entry in /Logs
- ✅ Task marked processed
- ✅ Task moved to /Done

**Sensitive Tasks (awaiting approval):**
- ✅ Plan file in /Plans (created BEFORE check)
- ✅ Task moved to /Pending_Approval
- ✅ Log entry in /Logs
- ✅ Task marked awaiting_approval
- ✅ Detected keywords logged

Failure to produce ANY of the above = NON-COMPLIANT SYSTEM
