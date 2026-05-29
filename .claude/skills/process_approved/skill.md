---
name: process_approved
description: Execute any approved non-LinkedIn task from Approved folder. Reads the existing Plan, performs the action, updates Dashboard and Logs, then moves the file to Done.
---

# Skill: Process Approved Task

## Purpose
Execute tasks that have been approved by the human operator. Handles the transition from `Approved/` → Execution → Dashboard → Logs → `Done/`. This skill reads the existing Plan and executes it — it does NOT create a new plan.

---

## Trigger
When a TASK file appears in the `Approved/` folder (moved there by the operator from `Pending_Approval/`).

---

## Input
Task file previously in `Pending_Approval/`, now in `Approved/`.

Must have:
- A corresponding `PLAN_<task_name>.md` already in `Plans/<type>/` (e.g., `Plans/email/`, `Plans/whatsapp/`, `Plans/linkedin/`)
- `status: awaiting_approval` or `status: approved`
- `plan_reference` pointing to the plan file

---

## Execution Rule (CRITICAL)

You MUST execute the actual intended action defined in the Plan.

Do NOT re-create the Plan — it already exists.

Do NOT simulate, describe, or explain actions — execute them.

---

## GLOBAL CONSTRAINTS

- NEVER re-create an existing Plan
- ALWAYS read and follow the existing Plan before executing
- ALWAYS verify Plan exists before proceeding
- NEVER overwrite existing Log entries
- ALL actions must comply with Company_Handbook.md
- ALL AI logic must stay within this skill

---

## PROCEDURE (STRICT ORDER)

### Step 1 — Read Approved Task
- Open task file from `Approved/`
- Extract:
  - `task_name` (strip `TASK_` prefix from filename)
  - `type` (email_task / whatsapp_task / file_task)
  - `plan_reference` (which PLAN file to use)
  - `original intent` from task body

---

### Step 2 — Verify Plan Exists (MANDATORY HARD GATE)

Check: `Plans/<type>/PLAN_<task_name>.md` (where `<type>` matches the task type: `email`, `whatsapp`, or `linkedin`)

#### IF Plan does NOT exist:
1. Write failure log:
   ```markdown
   ## <ISO timestamp> — <task_name> [FAILURE]

   - Task: <task_filename>
   - Error: Plan file missing — cannot execute without plan
   - Status: failed
   - Action: Manual intervention required
   ```
2. **STOP** — Do NOT proceed

#### IF Plan exists:
- Read the full Plan content
- Understand the Objective, Proposed Actions, and Steps
- Continue to Step 3

---

### Step 3 — Execute Task Per Plan

Execute the action defined in the Plan based on task type:

**For email_task:**
- Record the proposed email response (from Plan's "Proposed Response" section)
- Log that the response was approved and is ready to send
- Note: Actual sending is done externally via email tool/MCP server

**For whatsapp_task:**
- Record the approved action/reply (from Plan's "Suggested Action" section)
- Log that action is approved and ready

**For file_task / general task:**
- Execute the steps listed in Plan's "Steps" section
- Create any output files required by the plan
- Record what was done

**Document all actions taken.** Be specific — what exactly was done or recorded.

---

### Step 4 — Update Task Metadata

Modify task file:

```yaml
status: completed
approved_at: <ISO timestamp of approval>
executed_at: <ISO timestamp now>
executed_by: claude_skill_process_approved
```

---

### Step 5 — Update Dashboard

Append to `Dashboard.md`:

```markdown
## Recent Activity

- Task approved and executed: <task_name>
- Type: <task type>
- Plan followed: Plans/<type>/PLAN_<task_name>.md
- Execution: <brief description of what was done>
- Date: YYYY-MM-DD
```

Rules:
- Append only (do NOT overwrite full file)
- Preserve existing content

---

### Step 6 — Write Log Entry

#### File:
`Logs/YYYY-MM-DD.md`

#### Rules:
- If file exists → append
- If not → create
- NEVER overwrite existing entries

#### Format:

```markdown
## <ISO timestamp> — <task_name> [EXECUTED]

- Task: <task_filename>
- Plan Reference: Plans/<type>/PLAN_<task_name>.md
- Approval: confirmed by operator
- Actions Performed:
  - <List each specific action taken>
- Dashboard Update: confirmed
- Status: completed
```

---

### Step 7 — Move Task to Done (MANDATORY)

Move file:

```
Approved/<task_file> → Done/<task_file>
```

Rules:
- MUST move file
- MUST NOT leave completed files in Approved/

---

## FAILURE HANDLING

If ANY step fails:

1. STOP execution
2. Write log entry:
   ```markdown
   ## <ISO timestamp> — <task_name> [FAILURE]

   - Task: <task_filename>
   - Step Failed: <step number and name>
   - Error: <description>
   - Status: failed
   ```
3. DO NOT move task to Done
4. DO NOT continue

---

## ENFORCEMENT RULES (STRICT)

Execution MUST follow EXACT order:

1. Read Approved Task
2. Verify Plan Exists ← HARD GATE (STOP if missing)
3. Execute Task Per Plan
4. Update Task Metadata
5. Update Dashboard
6. Write Log Entry
7. Move to Done

If Plan is missing → SYSTEM IS IN INVALID STATE — do not proceed

---

## OUTPUT GUARANTEE

After execution, the system MUST produce:

- ✅ Plan was read (not re-created)
- ✅ Actual action executed and documented per Plan
- ✅ Task metadata updated (status: completed)
- ✅ Dashboard updated with execution record
- ✅ Log entry written with specific actions performed
- ✅ Task moved to /Done

Failure to produce ANY of the above = NON-COMPLIANT SYSTEM
