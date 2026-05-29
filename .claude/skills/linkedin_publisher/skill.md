---
name: linkedin_publisher
description: Publish approved LinkedIn posts to LinkedIn via Playwright browser automation. Reads from Approved/linkedin, posts, updates logs and Dashboard, then moves file to Done.
---

# Skill: LinkedIn Publisher

## Purpose
Orchestrate and execute the LinkedIn post publishing pipeline.

This skill combines two responsibilities:
1. **Handler** — scans the vault, routes work, and reports state
2. **Publisher** — publishes approved posts to LinkedIn via Playwright browser MCP

NEVER generates post content — that is the `linkedin_post_creator` skill.
NEVER posts without human approval and a verified Plan file.

---

## Dependencies
- **Browser MCP (Playwright-based)** — `mcp__playwright__*` tools required for publishing
- **Active LinkedIn session** — must be logged in before running publish steps
- Vault directories must exist (all exist by default)

---

## MCP Tool Mapping

All browser actions use these EXACT tool names:

| Action | MCP Tool |
|--------|----------|
| Navigate to URL | `mcp__playwright__browser_navigate` |
| Read DOM state | `mcp__playwright__browser_snapshot` |
| Click element | `mcp__playwright__browser_click` |
| Type text | `mcp__playwright__browser_type` |
| Press key | `mcp__playwright__browser_press_key` |
| Wait for element | `mcp__playwright__browser_wait_for` |
| Take screenshot | `mcp__playwright__browser_take_screenshot` |
| Run JS in browser | `mcp__playwright__browser_evaluate` |

---

## Trigger
When a `LINKEDIN_POST_*.md` file appears in `vault/AI_Employee_Vault/Approved/linkedin/`
or when the operator requests LinkedIn post publishing.

---

## GLOBAL CONSTRAINTS

- NEVER post without a verified Plan file
- NEVER move file to Done/ if posting failed
- ALWAYS write a log entry regardless of success or failure
- ALWAYS leave file in Approved/ if any step fails (allows retry without re-approval)
- NEVER retry more than once — fail gracefully after 2 attempts
- NEVER post if daily limit already reached (unless --force)
- NEVER auto-generate post content — delegate to linkedin_post_creator skill

---

## PROCEDURE — PHASE 1: HANDLER (Scan and Route)

### Step 1 — Scan Approved/ for ALL LinkedIn Post Files

```
Glob: vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_*.md
```

**If files found:**
- Count them: `<n>` files
- Sort by filename timestamp (oldest first)
- Report to operator:
  ```
  Found <n> approved LinkedIn post(s) — processing all (oldest first):
    1. LINKEDIN_POST_<ts1>.md — Topic: <topic1>
    2. LINKEDIN_POST_<ts2>.md — Topic: <topic2>
    ...
  ```
- For each file (one at a time, in order): run PHASE 2 (Publisher Steps 0–11)
- Record result: success / failed / rate-limited
- After processing all files → report summary (see Step 5 output format)
- Continue to Step 5 (log entry) even if some files failed

**If no files found in Approved/ → skip to Step 2**

---

### Step 2 — Scan Pending_Approval/ for LinkedIn Post Files

*(Only reached if Step 1 found nothing in Approved/)*

```
Glob: vault/AI_Employee_Vault/Pending_Approval/linkedin/LINKEDIN_POST_*.md
```

**If files found:**
- List each with topic and creation date
- Report:
  ```
  ⏳ Pending Approval: <n> LinkedIn post(s) waiting for your review

  Files:
    1. LINKEDIN_POST_<ts>.md
       Topic:   <topic>
       Created: <date>

  Actions:
  → To approve: move file to Approved/ then re-run linkedin_publisher skill
  → To reject:  move file to Rejected/
  ```
- STOP — do NOT create a new post while one is queued
- Continue to Step 5 (log entry)

**If no files found in Pending_Approval/ → skip to Step 3**

---

### Step 3 — Check Daily Limit

*(Only reached if Steps 1 and 2 found nothing)*

- Read today's log: `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md`
- Search for `[LINKEDIN POST CREATED]` or `[LINKEDIN POST PUBLISHED]`
- If found → STOP
  Report:
  ```
  ✅ Daily LinkedIn post already processed today (<YYYY-MM-DD>).

  Use linkedin_post_creator skill with --force to create an additional post.
  ```
- Continue to Step 5 (log entry)

---

### Step 4 — No Posts Queued or Published Today

*(Only reached if Steps 1, 2, and 3 found nothing)*

- Report:
  ```
  📭 No LinkedIn posts queued or published today (<YYYY-MM-DD>).

  Ready to create a new post.

  To generate a post: invoke the linkedin_post_creator skill
  After creating, the post will wait in Pending_Approval/ for your review.
  Move it to Approved/ and re-run linkedin_publisher to publish.
  ```
- Handler does NOT auto-generate content here

---

### Step 5 — Write Handler Run Log Entry (always runs)

File: `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md`
Append (create if not exists):

```
## <ISO timestamp> — linkedin_publisher [HANDLER RUN]

- Approved found: <n>
- Approved processed: <n>
- Pending found: <n>
- Published today: <n>
- Outcome: <published_all | partial_published | notified_pending | limit_reached | nothing_to_do>
- Notes: <any relevant notes>
```

---

## PROCEDURE — PHASE 2: PUBLISHER (Execute Posting)

### Step 0 — Locate Approved Post File (HARD GATE)

**If filename argument provided:**
- Look for: `vault/AI_Employee_Vault/Approved/<filename>`
- If not found → STOP: "File <filename> not found in Approved/"

**If no argument provided:**
- Glob: `vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_*.md`
- If none found → STOP: "No LinkedIn post files found in Approved/linkedin/"
- If multiple found → use the OLDEST one (sort by filename timestamp, ascending)

**Read the file and extract:**
- Confirm `type: linkedin_post` in frontmatter (if not → STOP: "Wrong file type")
- Confirm `status:` is NOT `completed` (if already completed → STOP: "Already published")
- Extract: `post_content` (full text under `## Post Content`)
- Extract: `plan_reference` (from frontmatter)
- Extract: `topic` (from frontmatter)
- Extract: `created` (from frontmatter)

---

### Step 0b — Rate-Limit Check (HARD GATE)

- Read today's log: `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md`
- Count occurrences of `[LINKEDIN POST PUBLISHED]` in the log
- If count >= 5 AND `--force` was NOT passed → STOP
  Report:
  ```
  Daily publish limit reached — 5 posts already published today (<YYYY-MM-DD>).
  File remains in Approved/ — no changes made.
  ```

---

### Step 1 — Verify Plan File (HARD GATE)

- Check: `vault/AI_Employee_Vault/Plans/<plan_reference>`
- If Plan does NOT exist → write failure log → STOP
- If Plan exists: read it and confirm `## Proposed Post` section is present and non-empty

---

### Step 2 — Navigate to LinkedIn

```
mcp__playwright__browser_navigate → https://www.linkedin.com
mcp__playwright__browser_snapshot → read current page DOM
```

**Check session status from snapshot:**
- Logged-IN: "Start a post" visible, home feed, or profile photo in nav
- Logged-OUT: "Sign in", "Join now", or login form visible

**If logged OUT:**
- Write failure log with `reason: linkedin_session_expired`
- DO NOT move the file — STOP

---

### Step 3 — Open Post Composer

Try selectors in this order:
1. `mcp__playwright__browser_click` with `aria-label="Start a post"`
2. `mcp__playwright__browser_click` with text match "Start a post"
3. `mcp__playwright__browser_snapshot` → re-read DOM → identify and click element

After click:
```
mcp__playwright__browser_wait_for → text area or contenteditable div
mcp__playwright__browser_snapshot → confirm composer modal is open
```

---

### Step 4 — Type Post Content

```
mcp__playwright__browser_click → text area inside the post composer
mcp__playwright__browser_type → <post_content>
mcp__playwright__browser_snapshot → verify text appeared
```

**If `browser_type` fails:**
- Fallback: clipboard injection:
  ```
  mcp__playwright__browser_evaluate → navigator.clipboard.writeText('<post_content>')
  mcp__playwright__browser_press_key → Control+v
  mcp__playwright__browser_snapshot → verify text appeared
  ```

---

### Step 5 — Submit Post (with 1 Retry)

Try Post button selectors in this order:
1. `mcp__playwright__browser_click` with `button[aria-label="Post"]` inside composer
2. `mcp__playwright__browser_click` with text match "Post"
3. `mcp__playwright__browser_snapshot` → re-read DOM → find Post button → click

Handle multi-step modal:
- After clicking, check if audience picker appeared → find final "Post" button → click

```
mcp__playwright__browser_wait_for → success confirmation (15 second timeout)
```

**RETRY LOGIC (if first attempt fails):**
- `mcp__playwright__browser_snapshot` → re-read DOM
- Repeat Steps 3–5 with fallback selectors
- If Attempt 2 also fails → write failure log → DO NOT move file → STOP

---

### Step 6 — Confirm Success

```
mcp__playwright__browser_snapshot → check page state
mcp__playwright__browser_take_screenshot → capture proof of success
```

Check for at least ONE success indicator:
- Toast containing "shared" or "posted"
- Composer modal is gone and feed is visible
- Post text visible at top of feed

**If NO success indicator after 15 seconds → trigger RETRY (Step 5 retry path)**

---

### Step 7 — Update File Metadata

Update frontmatter in `vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_<timestamp>.md`:

```yaml
status: completed
published_at: <current ISO timestamp>
executed_by: claude_skill_linkedin_publisher
attempts: <1 or 2>
```

---

### Step 8 — Update Dashboard (append only)

Append to `vault/AI_Employee_Vault/Dashboard.md`:

```
## Recent Activity

- LinkedIn post published: LINKEDIN_POST_<timestamp>.md
- Topic: <topic>
- Plan followed: <plan_reference>
- Published at: <ISO timestamp>
- Date: <YYYY-MM-DD>
```

---

### Step 9 — Write Log Entry (append only)

File: `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md`

```
## <ISO timestamp> — LINKEDIN_<timestamp> [LINKEDIN POST PUBLISHED]

- Post File: LINKEDIN_POST_<timestamp>.md
- Plan Reference: <plan_reference>
- Topic: <topic>
- Published At: <ISO timestamp>
- Attempts: <1 or 2>
- Browser Actions:
  - Navigated to linkedin.com ✓
  - Session verified: active ✓
  - Post composer opened ✓
  - Content typed: <word count> words ✓
  - Post submitted ✓
  - Success confirmed ✓
  - Screenshot captured ✓
- Dashboard Update: confirmed
- Status: completed
```

---

### Step 10 — Move File to Done (MANDATORY)

```
vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_<timestamp>.md
→
vault/AI_Employee_Vault/Done/linkedin/LINKEDIN_POST_<timestamp>.md
```

Verify: file is in `Done/` and NOT in `Approved/`.

---

### Step 11 — Demo Output (print to terminal)

```
═══════════════════════════════════════════════
  LinkedIn Publisher — Execution Log
═══════════════════════════════════════════════
[1/6] ✓ Approved file located: LINKEDIN_POST_<timestamp>.md
[2/6] ✓ Plan verified: <plan_reference>
[3/6] ✓ Browser opened LinkedIn — session active
[4/6] ✓ Post composer opened
[5/6] ✓ Content typed (<word_count> words)
[6/6] ✓ Post submitted — success confirmed

Post moved to:  Done/LINKEDIN_POST_<timestamp>.md
Log written:    Logs/<YYYY-MM-DD>.md ✓
Dashboard:      Updated ✓
═══════════════════════════════════════════════
```

---

## FAILURE HANDLING

For every failure mode, the file STAYS in `Approved/` (retryable without re-approval):

| Failure | Log Reason | Action |
|---------|-----------|--------|
| Session expired | `linkedin_session_expired` | Log in manually + retry |
| Plan file missing | `plan_file_missing` | Create plan or check Plans/ folder |
| Composer did not open | `composer_open_failed` | Retry once, then stop |
| Post submission failed | `post_submission_failed_after_retry` | Check LinkedIn manually |
| No success confirmation | `post_confirmation_not_received` | Check LinkedIn manually |
| Daily limit | `daily_limit_reached` | Wait until tomorrow or use --force |

**Failure log format:**
```
## <ISO timestamp> — LINKEDIN_<timestamp> [FAILURE]

- Post File: LINKEDIN_POST_<timestamp>.md
- Step Failed: <step name>
- Error: <description>
- Reason Code: <reason from table above>
- Status: failed
- File Location: Approved/ (unchanged — retryable)
- Action: <specific instruction for operator>
```

---

## OUTPUT GUARANTEE

**On success:**
- ✅ Post published to LinkedIn
- ✅ File metadata updated (status: completed, published_at, executed_by)
- ✅ Log entry written: `[LINKEDIN POST PUBLISHED]`
- ✅ Dashboard updated
- ✅ File moved from Approved/ to Done/

**On failure:**
- ✅ Failure log entry written
- ✅ File remains in Approved/ (not lost, retryable)
- ✅ Clear error message with specific fix instructions
