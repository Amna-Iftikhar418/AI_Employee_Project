# Skill: Basic File Handler

## Purpose
Process tasks from the Needs_Action folder using the REQUIRED Bronze Tier pipeline:

```
Needs_Action → Plans → [Sensitive Check] → (branch)
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
              Keywords found                                        No keywords
           (email/linkedin/money)                                         │
                    │                                                   │
                    ▼                                                   ▼
           Pending_Approval                                       Execution
                    │                                                   │
         (After approval)                                               │
                    │                                                   │
                    └────────────────→ Resume Execution ←───────────────┘
                                              │
                                              ▼
                                    Dashboard → Logs → Done
```

---

## Trigger
When a new task file appears in the Needs_Action folder.

---

## Input
Task file with metadata:
- type
- source
- original_file
- priority
- status
- created

---

## Execution Rule (CRITICAL)

You MUST create actual files in the vault.

Do NOT simulate, describe, or explain actions.

You MUST strictly follow execution order. No exceptions.

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
- Open task file from /Needs_Action
- Extract task_name from filename:
  Remove prefix "TASK_" and file extension

---

### Step 2 — Understand Task
- Read task content
- Identify intent
- Determine priority

---

### Step 3 — Create Plan (MANDATORY — BLOCKING STEP)

This step MUST complete BEFORE ANY OTHER ACTION.

If Plan is not created → STOP execution.

#### File Path:
Plans/PLAN_<task_name>.md

#### Rules:
- If file exists → DO NOT overwrite → continue
- Otherwise → CREATE new file using `.claude/skills/generate_plan.md`

#### HOW TO GENERATE THE PLAN:

Follow `.claude/skills/generate_plan.md` exactly.

The plan MUST contain all of these sections:

```markdown
# Plan: <task_name>

---
type: file_task
source: inbox
original_file: <filename>
created: <ISO timestamp>
status: pending
---

## Objective
(What this file requires — specific, not generic)

## Extracted Data
- type: file_task
- sender: (if identifiable from content)
- intent: (what action the file implies)
- key info: (any data found in file content)
- urgency: Normal
- keywords: (any detected)

## Action Plan
- [ ] <Specific step 1>
- [ ] <Specific step 2>
- [ ] <Specific step 3>

## Proposed Response
N/A — no external reply needed for this file task.

(If file content requires a response after review, update this section.)

## Approval Required
<yes/no + reason>

## Expected Outcome
<What success looks like>

## Compliance Notes
- Follow Company_Handbook.md

## Status
pending
```

**FAIL CONDITION: If `## Proposed Response` is missing → do NOT save plan → STOP**

---

### Step 4 — Sensitive Task Check (MANDATORY GATE)

After Plan creation, check if task involves sensitive operations:

**Sensitive keywords:**
- `email`
- `linkedin`
- `money`

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

   Format:
   ```markdown
   ## <ISO timestamp> — <task_name> [PENDING APPROVAL]

   - Task: <task_filename>
   - Plan: PLAN_<task_name>.md (already created)
   - Status: awaiting_approval
   - Detected Keywords: [keywords found]
   - Action: Moved to Pending_Approval
   - Note: Task requires human approval before execution
   ```
4. **STOP** — Do NOT proceed to execution

#### IF task appears in Approved folder:

1. **Resume workflow** from Step 5 (Execution/Dashboard)
2. **Update task metadata:**
   ```yaml
   status: approved
   approved_at: <ISO timestamp>
   ```
3. **Write Log Entry:**

   File: `Logs/YYYY-MM-DD.md`

   Format:
   ```markdown
   ## <ISO timestamp> — <task_name> [APPROVED]

   - Task: <task_filename>
   - Status: approved
   - Approved At: <timestamp>
   - Action: Resuming workflow for execution
   ```

#### IF NO sensitive keywords:
- Continue to Step 5 (Execution)

---

### Step 5 — Execution & Dashboard Update

Execute task actions and append to Dashboard.md:

```markdown
## Recent Activity

- Task detected: <task_name>
- Plan created: PLAN_<task_name>.md
- Status: executed
- Date: YYYY-MM-DD
```

Rules:
- Append only (do NOT overwrite full file)
- Preserve existing content

---

### Step 6 — Write Log Entry (AFTER DASHBOARD)

#### File:
Logs/YYYY-MM-DD.md

#### Rules:
- If file exists → append
- If not → create
- NEVER overwrite

#### Format:

```markdown
## <ISO timestamp> — <task_name>

- Task: <task_filename>
- Plan Reference: PLAN_<task_name>.md
- Actions Performed:
  - Plan created
  - Dashboard updated
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
2. Write log entry with:

- Status: failed
- Error: <description>

3. DO NOT continue

---

## ENFORCEMENT RULES (STRICT)

Execution MUST follow EXACT order:

1. Read Task
2. Understand Task
3. Create Plan  ← HARD GATE (ALWAYS FIRST - cannot skip)
4. Sensitive Task Check  ← HARD GATE (blocks sensitive tasks after plan)
5. Execution & Dashboard Update
6. Write Logs
7. Update Task
8. Move to Done

**Sensitive Task Flow:**
- Plan created first (Step 3)
- If keywords detected → Move to Pending_Approval → STOP (after plan)
- If task in Approved folder → Resume from Step 5 (Execution)

If Plan step is skipped → SYSTEM IS INVALID

---

## OUTPUT GUARANTEE

After execution, the system MUST produce:

**Normal Tasks:**
- ✅ Plan file in /Plans
- ✅ Dashboard updated
- ✅ Log entry in /Logs
- ✅ Task marked processed
- ✅ Task moved to /Done

**Sensitive Tasks (awaiting approval):**
- ✅ Plan file in /Plans (created BEFORE check)
- ✅ Task moved to /Pending_Approval
- ✅ Log entry in /Logs
- ✅ Task marked awaiting_approval
- ✅ Reason logged with detected keywords

**Approved Tasks (resumed):**
- ✅ Plan already exists in /Plans
- ✅ Dashboard updated
- ✅ Log entry in /Logs (approval + completion)
- ✅ Task marked approved
- ✅ Task moved to /Done

Failure to produce ANY of the above = NON-COMPLIANT SYSTEM
