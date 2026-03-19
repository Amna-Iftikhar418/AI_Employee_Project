# Skill: Send Email

## Purpose
Send approved email replies via the MCP server.

Runs AFTER human approval — reads the task from `Approved/`, extracts the
proposed reply from the corresponding `PLAN` file, calls the MCP email server,
logs the result, and moves the task to `Done/`.

---

## Trigger
When the operator runs `/send_email` and one or more `email_task` files exist
in `vault/AI_Employee_Vault/Approved/`.

---

## GLOBAL CONSTRAINTS

- NEVER send an email that has not been approved (task must be in Approved/)
- NEVER skip Plan verification — Plan must contain `## Proposed Response`
- NEVER move a task to Done/ if the MCP call failed
- ALWAYS write a log entry regardless of success or failure
- ALWAYS check MCP server is reachable before processing multiple tasks
- NEVER modify the Plan file — it is read-only at this stage

---

## PROCEDURE (STRICT ORDER)

### Step 0 — Pre-flight Checks

Before processing any task:

1. **Check MCP server health:**
   ```bash
   python -c "import requests; r=requests.get('http://localhost:8000/health', timeout=5); print(r.json())"
   ```
   - If connection refused → STOP and tell the operator:
     ```
     MCP server is not running.
     Start it with:  uv run mcp_server.py
     Then re-run /send_email
     ```
   - If healthy → continue

2. **Scan Approved/ for email tasks:**
   List all `TASK_*.md` files in `vault/AI_Employee_Vault/Approved/`.
   Filter for files that contain `type: email_task` in their frontmatter.

   - If none found → report: "No approved email tasks found in Approved/"
   - If found → list them and confirm before processing

---

### Step 1 — Read Approved Task

For each approved email task file:

- Read `vault/AI_Employee_Vault/Approved/<task_file>`
- Extract from frontmatter:
  - `task_name` — filename stem with `TASK_` prefix removed
  - `type` — must be `email_task` (skip if not)
  - `plan_reference` — name of the Plan file
  - `status` — must NOT be `completed` already (skip if it is)
- Extract from body:
  - `original_sender` — value after `**From:**`
  - `original_subject` — value after `**Subject:**`

---

### Step 2 — Verify Plan Exists (HARD GATE)

Check: `vault/AI_Employee_Vault/Plans/PLAN_<task_name>.md`

**IF Plan does NOT exist:**
1. Write failure log (see Failure Handling below)
2. STOP — do NOT send email, do NOT move task
3. Report to operator: "Plan missing for <task_name> — cannot send without approved plan"

**IF Plan exists:**
- Read the full Plan file
- Confirm `## Proposed Response` section is present and non-empty
- If section missing → treat as Plan missing (same failure path)
- Extract:
  - `to` — from Plan frontmatter `from:` field (the original sender we reply to)
  - `subject` — prepend "Re: " if Plan frontmatter `subject:` doesn't start with "Re:"
  - `body` — full text content of the `## Proposed Response` section

---

### Step 3 — Run Executor Script

Execute the Python executor for each task:

```bash
python skills/send_email_executor.py <task_filename>
```

**DRY_RUN support:**
- Check if `DRY_RUN=true` is set in `.env`
- If yes, inform operator: "Running in DRY_RUN mode — email will NOT be sent"
- The executor handles DRY_RUN internally; no change to command needed

**Parse the JSON output:**
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

- If `success: true` → continue to Step 4
- If `success: false` → go to Failure Handling, do NOT continue

Note: The executor already handles log writing, dashboard update, and moving to
Done/. Steps 4–6 below are for Claude to confirm and report results only.

---

### Step 4 — Confirm Vault State

After executor runs, verify:

1. Task file is **no longer** in `Approved/`
2. Task file **exists** in `Done/`
3. Log entry **exists** in `Logs/YYYY-MM-DD.md` for this task
4. `Dashboard.md` was updated

If any check fails, report the discrepancy to the operator.

---

### Step 5 — Report to Operator

Report the result clearly:

**On success:**
```
✅ Email Sent Successfully

Task:    TASK_email_john_doe.txt.md
To:      john.doe@example.com
Subject: Re: Invoice #1234 Payment
Plan:    PLAN_email_john_doe.txt.md
Status:  Completed
Moved:   Done/TASK_email_john_doe.txt.md
Log:     Logs/YYYY-MM-DD.md ✓
```

**On DRY_RUN:**
```
🔁 DRY RUN — Email was NOT sent

Task:    TASK_email_john_doe.txt.md
To:      john.doe@example.com  (would have sent)
Subject: Re: Invoice #1234 Payment
Status:  Completed (dry run)
Moved:   Done/TASK_email_john_doe.txt.md
Note:    Remove DRY_RUN=true from .env to send for real
```

**On failure:**
```
❌ Email Send Failed

Task:    TASK_email_john_doe.txt.md
Error:   <error message from executor>
Status:  Task remains in Approved/ — no changes made
Log:     Failure entry written to Logs/YYYY-MM-DD.md
Action:  Check error above and fix before retrying
```

---

## FAILURE HANDLING

If ANY step fails:

1. **STOP** — do not continue to next task
2. **Do NOT move** the task file (leave it in Approved/)
3. **Write failure log entry:**

```markdown
## <ISO timestamp> — <task_name> [FAILURE]

- Task: <task_filename>
- Step Failed: <step name>
- Error: <description>
- Status: failed
- Action: Manual intervention required — task remains in Approved/
```

4. **Report clearly** to operator with actionable fix

---

## ENFORCEMENT RULES (STRICT ORDER)

1. Pre-flight: health check + scan Approved/  ← STOP if MCP server down
2. Read approved task
3. Verify Plan + Proposed Response            ← HARD GATE (stop if missing)
4. Run executor script
5. Confirm vault state
6. Report result to operator

Do NOT skip Step 3 (Plan verification).
Do NOT move task to Done/ if executor returns `success: false`.

---

## OUTPUT GUARANTEE

After execution, the system MUST produce:

**On success:**
- ✅ Email dispatched to MCP server
- ✅ Task metadata updated (status: completed, sent_to, sent_subject)
- ✅ Log entry in Logs/YYYY-MM-DD.md
- ✅ Dashboard updated
- ✅ Task moved to Done/

**On failure:**
- ✅ Failure log entry written
- ✅ Task remains in Approved/ (not lost, not moved)
- ✅ Clear error message reported to operator

**On DRY_RUN:**
- ✅ All vault operations complete (log, dashboard, Done/)
- ✅ No real email sent
- ✅ Entries clearly marked [DRY RUN]

---

## Example: Full Session

```
Operator: /send_email

Claude: Checking MCP server...
        ✓ MCP server healthy at localhost:8000

        Found 1 approved email task:
          - TASK_email_john_doe.txt.md (john.doe@example.com — Invoice #1234)

        Processing TASK_email_john_doe.txt.md...
        ✓ Plan found: PLAN_email_john_doe.txt.md
        ✓ Proposed Response section found (247 chars)
        ✓ Executor ran successfully

        ✅ Email Sent Successfully
        To:      john.doe@example.com
        Subject: Re: Invoice #1234 Payment
        Moved:   Done/TASK_email_john_doe.txt.md
        Log:     Logs/2026-03-19.md ✓
```
