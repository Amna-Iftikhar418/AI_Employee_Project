---
name: linkedin_post_creator
description: Generate a high-quality LinkedIn post on AI, automation, or business topics. Creates a PLAN file and saves the post to Pending_Approval for human review before publishing.
---

# Skill: LinkedIn Post Creator

## Purpose
Generate a high-quality LinkedIn post on AI, programming, automation, or business insights.
Creates a PLAN file and saves the post to `Pending_Approval/` for human review.

NEVER posts directly. NEVER skips plan creation. ALWAYS routes to Pending_Approval.

---

## Dependencies
- No external tools required — pure file operations + AI content generation
- Vault directories must exist (all exist by default — no setup needed)

---

## Trigger
When the operator requests a LinkedIn post creation, OR when the daily scheduler triggers.

---

## GLOBAL CONSTRAINTS

- NEVER skip Plan creation — Plan MUST exist before post file is written
- NEVER overwrite existing files — if file exists, STOP with error
- ALWAYS write `## Proposed Response` in Plan file (system-wide hard requirement)
- ALWAYS append to logs and Dashboard — never overwrite
- Max 5 posts per day unless `--force` is passed
- Max 3 hashtags, max 3 emojis in post content
- NEVER generate duplicate topics from the last 7 days
- **NEVER ask the user for a topic, title, or any input before starting.** Begin Step 0 immediately. If no topic was provided, auto-select from the rotation list in Step 1 — do not pause to ask.

---

## PROCEDURE (STRICT ORDER)

### Step 0 — Pre-flight Gates (HARD STOP if any gate fires)

**Gate 0a — Daily limit check:**
- Read today's log file: `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md`
  (replace YYYY-MM-DD with today's actual date)
- Count occurrences of `[LINKEDIN POST CREATED]` and `[LINKEDIN POST PUBLISHED]` in the log
- If total count >= 5 AND `--force` was NOT passed → STOP immediately
  Report:
  ```
  Daily limit reached — 5 LinkedIn posts already processed today (YYYY-MM-DD).
  Use /linkedin_post_creator <topic> --force to override.
  ```
- If found AND `--force` WAS passed → continue (note override in log later)
- If not found or count < 5 → continue

**Gate 0b — Queue occupancy check:**
- Glob: `vault/AI_Employee_Vault/Pending_Approval/linkedin/LINKEDIN_POST_*.md`
- Glob: `vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_*.md`
- If ANY file found in either location → STOP
  Report:
  ```
  A LinkedIn post is already queued:
    Location: [Pending_Approval / Approved]
    File: <filename>
  Publish or reject it before creating a new post.
  To approve: move file to Approved/ then run /linkedin_post_handler
  To reject:  move file to Rejected/
  ```

**Gate 0c — Duplicate topic detection:**
- Read log files for the last 7 days (glob `Logs/log_*.md`, filter by date)
- Scan each for lines containing `Topic:` under `[LINKEDIN POST CREATED]` entries
- Also glob `vault/AI_Employee_Vault/Done/LINKEDIN_POST_*.md` and read `topic:` from frontmatter
- Build `recent_topics[]` list from all found topics

---

### Step 1 — Select Topic

**If operator provided a topic:**
- Use that topic exactly
- Check if it overlaps significantly with any item in `recent_topics[]`
- If overlap found → warn operator but continue (operator-specified topic takes precedence):
  ```
  ⚠ Warning: Similar topic posted recently: "<recent_topic>"
  Continuing with your specified topic: "<provided_topic>"
  ```

**If NO topic provided:**
- Use this rotation list — pick the FIRST one NOT in `recent_topics[]`:
  ```
  1. "AI automation in business"
  2. "Python productivity tips"
  3. "Lessons from building AI systems"
  4. "The future of no-code tools"
  5. "Business automation mistakes to avoid"
  6. "What I learned building AI employees"
  7. "Prompt engineering for real work"
  8. "Why most automations fail"
  9. "Building with Claude API — what actually works"
  10. "The hidden cost of manual processes"
  ```
- If ALL topics appear in recent history → use the least-recent one and warn:
  ```
  ⚠ All rotation topics used recently — reusing least-recent: "<topic>"
  ```

---

### Step 2 — Generate Timestamp

- Capture current datetime as ISO: `YYYY-MM-DDThh:mm:ss.ffffff`
- Build filename timestamp: `YYYYMMDDhhmmss_RRRRRR`
  where RRRRRR = random 6-digit number (ensures uniqueness even on same second)
- Set:
  - `plan_filename` = `PLAN_LINKEDIN_<timestamp>.md`
  - `post_filename` = `LINKEDIN_POST_<timestamp>.md`
  - `today_date` = `YYYY-MM-DD` (for log file name)

---

### Step 3 — Generate Post Content

Write a LinkedIn post following ALL standards below:

**Structure:**
- **Line 1 (Hook):** Bold claim, surprising stat, or counterintuitive statement
  - MUST be provocative or surprising — not a greeting, not a question
  - Examples: "Most automation projects fail before they start."
               "I wasted 3 months building the wrong thing."
- **Lines 2–12 (Story/Idea):** Specific, concrete narrative
  - Real scenario, numbered lessons, or step-by-step breakdown
  - NO generic filler ("In today's fast-paced world...", "I'm excited to share...")
- **Lines 13–15 (Insight):** The practical takeaway — one actionable rule or lesson
- **Final line (Question):** Genuine question for the audience
  - Must be specific to the post content, not generic ("What do you think?")

**Format rules:**
- 150–300 words total
- Max 2–3 emojis (place naturally within text — never forced)
- Exactly 3 hashtags on the final line, separated by spaces
- Use short paragraphs (1–3 lines each) — LinkedIn rewards white space

**Quality self-check — ALL must pass before proceeding:**
- [ ] Line 1 is a hook (not a greeting, not a question, not "I'm excited")
- [ ] Post contains a specific story, scenario, or concrete example
- [ ] At least one sentence with an actionable insight or rule
- [ ] Final line ends with a genuine question (not rhetorical)
- [ ] Emoji count is 2 or 3
- [ ] Hashtag count is exactly 3 (at very end)
- [ ] Post length is 150–300 words
- [ ] No sentence starts with "I'm excited to share" or "In today's"

**If any checklist item fails → REGENERATE the post before continuing.**

---

### Step 4 — CREATE PLAN FILE (MANDATORY — BLOCKING)

**This step MUST complete successfully before any other file is written.**

**File:** `vault/AI_Employee_Vault/Plans/linkedin/PLAN_LINKEDIN_<timestamp>.md`

- If file already exists → DO NOT overwrite → STOP with error: "Plan file already exists"
- Otherwise → CREATE the file now

**WRITE EXACTLY THIS FORMAT:**

```
---
type: linkedin_post
status: pending
created: <ISO timestamp>
topic: <topic>
post_filename: LINKEDIN_POST_<timestamp>.md
---

# Plan: LINKEDIN_<timestamp>

## Objective
Post about <topic> to build professional brand on LinkedIn and provide value to audience.

## Content Strategy
- Hook: <exact first line of the post>
- Story/Idea: <1-sentence summary of main content>
- Insight: <the key takeaway or rule>
- CTA Question: <the exact ending question>
- Emoji count: <n>
- Hashtag count: <n>
- Word count: <n>

## Proposed Post

<full post content — identical to what will appear in the post file>

## Proposed Response
N/A — this is a LinkedIn post, not an email reply.
Content is in ## Proposed Post above.

## Approval Required
Yes — LinkedIn posts always require human approval before publishing.

## Expected Outcome
Professional LinkedIn post published. Audience engagement via comments.

## Compliance Notes
- LinkedIn posts are always sensitive — always route to Pending_Approval
- Max 1 post per day unless --force override
- No duplicate topics within 7 days

## Status
pending
```

**SELF-CHECK before saving Plan file:**
1. `## Proposed Response` section exists (REQUIRED — system will fail without it)
2. `## Proposed Post` section contains the full generated post (not empty)
3. `topic:` frontmatter field is populated
4. `post_filename:` frontmatter field references the correct LINKEDIN_POST filename
5. `created:` frontmatter field contains the ISO timestamp

**If ANY check fails → fix it → THEN save. Do NOT save an invalid plan.**

---

### Step 5 — CREATE POST FILE

**Only execute this step AFTER Plan file is confirmed saved.**

**File:** `vault/AI_Employee_Vault/Pending_Approval/linkedin/LINKEDIN_POST_<timestamp>.md`

- If file already exists → DO NOT overwrite → STOP with error
- Otherwise → CREATE the file now (create the `linkedin/` subdirectory if it does not exist)

**WRITE EXACTLY THIS FORMAT:**

```
---
type: linkedin_post
status: pending
created: <ISO timestamp>
topic: <topic>
plan_reference: PLAN_LINKEDIN_<timestamp>.md
---

## Post Content

<generated post — exactly as written in Step 3, unchanged>

## Purpose

<1–2 sentences explaining why this topic is valuable for the audience right now>
```

---

### Step 6 — Update Dashboard (append only)

Append to `vault/AI_Employee_Vault/Dashboard.md`:

```
## Recent Activity

- LinkedIn post created: LINKEDIN_POST_<timestamp>.md
- Topic: <topic>
- Plan: PLAN_LINKEDIN_<timestamp>.md
- Status: awaiting_approval
- Date: <YYYY-MM-DD>
```

---

### Step 7 — Write Log Entry (append only)

File: `vault/AI_Employee_Vault/Logs/log_<YYYY-MM-DD>.md`
If file does not exist → create it. Otherwise → append.

```
## <ISO timestamp> — LINKEDIN_<timestamp> [LINKEDIN POST CREATED]

- Post File: LINKEDIN_POST_<timestamp>.md
- Plan File: Plans/linkedin/PLAN_LINKEDIN_<timestamp>.md (created)
- Topic: <topic>
- Hook: <first line of post>
- Word Count: <n>
- Status: awaiting_approval
- Action: Moved to Pending_Approval/
- Daily limit: <count>/5 used<if --force: " (--force override active)">
- Note: LinkedIn posts always require human approval before publishing
```

---

### Step 8 — Show Post & Ask for Approval

**On success, display the full post content to the operator and ask for approval:**

Output EXACTLY this format (replace placeholders with actual values):

```
✅ LinkedIn Post Ready — Please Review

Topic:      <topic>
Word Count: <n> words
Plan File:  Plans/linkedin/PLAN_LINKEDIN_<timestamp>.md

---

<full generated post content — exactly as it will appear on LinkedIn>

---

Can I post it?
```

**Do NOT add any other instructions, file paths, or "next steps" text. Just show the post and ask the single question: "Can I post it?"**

---

### Step 9 — Handle Operator Response

**This step executes ONLY after the operator responds to the "Can I post it?" question.**

**If operator says YES (any of: yes, y, post it, go ahead, approved, approve, do it):**
1. Move the post file from `Pending_Approval/linkedin/` to `Approved/linkedin/`:
   - Source: `vault/AI_Employee_Vault/Pending_Approval/linkedin/LINKEDIN_POST_<timestamp>.md`
   - Destination: `vault/AI_Employee_Vault/Approved/linkedin/LINKEDIN_POST_<timestamp>.md`
   - Use PowerShell `Move-Item` on Windows
2. Immediately invoke the `linkedin_publisher` skill to publish via Playwright MCP.
   The skill will:
   - Navigate to linkedin.com using `mcp__playwright__browser_navigate`
   - Verify session is active (logged in)
   - Open post composer and type the post content
   - Submit the post and confirm success
   - Update file metadata, write log entry, update Dashboard
   - Move file from `Approved/linkedin/` to `Done/linkedin/`
3. Do NOT wait for `approved_watcher.py` — publishing happens immediately in this session.

**If operator says NO (any of: no, n, reject, cancel, don't post):**
1. Move the post file to `Rejected/linkedin/` (create folder if needed):
   - Source: `vault/AI_Employee_Vault/Pending_Approval/linkedin/LINKEDIN_POST_<timestamp>.md`
   - Destination: `vault/AI_Employee_Vault/Rejected/linkedin/LINKEDIN_POST_<timestamp>.md`
2. Confirm to operator:
   ```
   Post rejected and moved to Rejected/linkedin/.
   ```

**If operator wants edits:**
- Apply the requested changes directly to the post content
- Update both the Pending_Approval post file AND the Plan file with the revised content
- Re-display the updated post and ask "Can I post it?" again

**On daily limit (no --force):**
```
⏸ Daily Limit Reached

1 LinkedIn post already processed today (<YYYY-MM-DD>).
Use /linkedin_post_creator <topic> --force to override.
```

**On queue occupied:**
```
⏸ Queue Occupied

A LinkedIn post is already waiting in [Pending_Approval / Approved].
File: <filename>
Publish or reject it before creating a new post.
```

---

## FAILURE HANDLING

If any step fails:
1. STOP — do not continue
2. Do NOT create partial files
3. Write failure log entry:
```
## <ISO timestamp> — LINKEDIN_<timestamp> [FAILURE]

- Step Failed: <step name>
- Error: <description>
- Status: failed
- Action: No files created — manual intervention may be required
```
4. Report clearly to operator with actionable fix

---

## ENFORCEMENT RULES (STRICT ORDER)

1. Pre-flight gates (daily limit → queue check → duplicate check) ← HARD STOP
2. Select topic
3. Generate timestamp
4. Generate post content + quality checklist ← REGENERATE if fails
5. CREATE PLAN FILE ← BLOCKING GATE
6. CREATE POST FILE ← only after plan confirmed
7. Update Dashboard (append)
8. Write log entry (append)
9. Show post to operator and ask "Can I post it?" ← NO confirmation before this point
10. On operator YES → move file to Approved/linkedin/ → immediately invoke linkedin_publisher skill (Playwright MCP)
11. On operator NO → move file to Rejected/linkedin/

Do NOT ask the operator for a topic, title, or any clarifying input — start immediately.
Do NOT interrupt or ask for confirmation during steps 1–8.
Do NOT skip Step 5 (Plan creation).
Do NOT create post file if Plan creation failed.
Do NOT write `## Proposed Response` as empty — write N/A explicitly.
Do NOT tell operator to manually move files — Claude moves it on their behalf.

---

## OUTPUT GUARANTEE

After this skill runs successfully:

- ✅ `Plans/linkedin/PLAN_LINKEDIN_<timestamp>.md` exists with `## Proposed Response` section
- ✅ `Pending_Approval/LINKEDIN_POST_<timestamp>.md` exists with post content
- ✅ Log entry written to `Logs/log_<YYYY-MM-DD>.md`
- ✅ Dashboard updated
- ✅ Post NOT sent to LinkedIn (human approval required)
