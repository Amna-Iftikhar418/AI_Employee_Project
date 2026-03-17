# Skill: Basic File Handler

## Purpose
Process tasks from the Needs_Action folder using the REQUIRED Bronze Tier pipeline:

Needs_Action → Plans → Dashboard → Logs → Done

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
- Otherwise → CREATE new file

#### REQUIRED FORMAT:

# Plan: <task_name>

---
created: <ISO timestamp>
status: pending
source: Needs_Action/<task_filename>
---

## Objective
<clear description of task goal>

## Steps
- [ ] Analyze task
- [ ] Execute required actions
- [ ] Update system records

## Compliance Notes
- Follow Company_Handbook.md

## Status
pending

---

### Step 4 — Update Dashboard (AFTER PLAN ONLY)

Append to Dashboard.md:

## Recent Activity

- Task detected: <task_name>
- Plan created: PLAN_<task_name>.md
- Status: pending
- Date: YYYY-MM-DD

Rules:
- Append only (do NOT overwrite full file)
- Preserve existing content

---

### Step 5 — Write Log Entry (AFTER DASHBOARD)

#### File:
Logs/YYYY-MM-DD.md

#### Rules:
- If file exists → append
- If not → create
- NEVER overwrite

#### Format:

## <ISO timestamp> — <task_name>

- Task: <task_filename>
- Actions:
  - Plan created: PLAN_<task_name>.md
  - Dashboard updated
- Status: processed

---

### Step 6 — Update Task Status

Modify task metadata:

status: processed

---

### Step 7 — Move Task to Done (MANDATORY)

Move file:

Needs_Action/<task_file> → Done/<task_file>

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
3. Create Plan  ← HARD GATE (cannot skip)
4. Update Dashboard
5. Write Logs
6. Update Task
7. Move to Done

If Plan step is skipped → SYSTEM IS INVALID

---

## OUTPUT GUARANTEE

After execution, the system MUST produce:

- ✅ Plan file in /Plans
- ✅ Dashboard updated
- ✅ Log entry in /Logs
- ✅ Task marked processed
- ✅ Task moved to /Done

Failure to produce ANY of the above = NON-COMPLIANT SYSTEM