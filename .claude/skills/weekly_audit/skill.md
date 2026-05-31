---
name: weekly_audit
description: Generate the Monday CEO briefing by auditing completed tasks, pulling Odoo revenue data, detecting bottlenecks, and flagging subscriptions. Saves output to vault/AI_Employee_Vault/Briefings/YYYY-MM-DD_Monday_Briefing.md.
---

# Skill: Weekly Audit (CEO Briefing Generator)

## Purpose
Produce a comprehensive Monday CEO briefing by:
1. Reading business goals from `Business_Goals.md`
2. Counting completed tasks per category from `Done/`
3. Pulling live revenue and invoice data from Odoo MCP
4. Identifying task bottlenecks (open longer than 7 days)
5. Detecting flagged subscriptions using audit rules
6. Writing the briefing to `Briefings/YYYY-MM-DD_Monday_Briefing.md`

NEVER overwrite an existing briefing. ALWAYS append to logs and Dashboard after writing.

---

## When to Invoke
- Triggered automatically by `scheduler.py` every Monday at 08:00
- Can be triggered manually: `claude -p "Run the weekly_audit skill to generate today's CEO briefing"`

---

## Dependencies
- Odoo MCP server (`odoo` in `.mcp.json`) — required for revenue/invoice data
- Vault directory `Briefings/` must exist (create if missing)
- `vault/AI_Employee_Vault/Business_Goals.md` must exist

---

## PROCEDURE (STRICT ORDER)

### Step 1 — Pre-flight

1. Compute `today_date` = today's date as `YYYY-MM-DD`
2. Set `briefing_path` = `vault/AI_Employee_Vault/Briefings/{today_date}_Monday_Briefing.md`
3. If `briefing_path` already exists → STOP. Report:
   ```
   Briefing already exists for {today_date}. Skipping to avoid overwrite.
   ```
4. Read `vault/AI_Employee_Vault/Business_Goals.md`
   - Extract: monthly revenue target, current MTD, key metrics, active projects, subscriptions table, subscription audit rules, upcoming deadlines

---

### Step 2 — Count Completed Tasks

Glob `vault/AI_Employee_Vault/Done/**/*.md` — collect all done files.

Build counts per category:
```
email_done    = files where parent dir name == "email" OR filename contains "email"
whatsapp_done = files where parent dir name == "whatsapp" OR filename contains "whatsapp"
linkedin_done = files where parent dir name == "linkedin" OR filename contains "linkedin"
odoo_done     = files where parent dir name == "odoo" OR filename contains "odoo"
social_done   = files where parent dir name == "social" OR filename contains "social"
total_done    = count of all files in Done/
```

Also count:
```
pending_count  = count of all files in Pending_Approval/**/*.md
rejected_count = count of all files in Rejected/**/*.md
```

---

### Step 3 — Pull Revenue and Invoice Data from Odoo MCP

**Try** to call the Odoo MCP to get invoice data:

```
Tool: mcp__odoo__execute_method
  model: "account.move"
  method: "search_read"
  args_json: '[[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "!=", "cancel"]]]'
  kwargs_json: '{"fields": ["name", "partner_id", "amount_total", "state", "invoice_date", "invoice_date_due", "payment_state"], "limit": 100}'
```

From the results, compute:
- `invoices_this_week` = invoices with `invoice_date` in the last 7 days
- `revenue_this_week` = sum of `amount_total` for paid invoices this week (state == "posted" AND payment_state == "paid")
- `revenue_mtd` = sum of `amount_total` for paid invoices in the current calendar month
- `invoices_posted` = invoices with state == "posted" (confirmed)
- `invoices_draft` = invoices with state == "draft"
- `invoices_overdue` = invoices where `invoice_date_due` < today AND payment_state != "paid" AND state == "posted"
- `payment_rate` = (paid invoices / total posted invoices * 100) if total posted > 0, else "N/A"

**If Odoo MCP is unreachable:**
- Set all revenue fields to "N/A (Odoo offline)"
- Write to log: `[weekly_audit] WARNING: Odoo unreachable — revenue data unavailable`
- Continue briefing generation with available data

---

### Step 4 — Identify Bottlenecks

A task is a **bottleneck** if it has been in `Needs_Action/` or `Pending_Approval/` for more than 7 days.

For each file in `Needs_Action/**/*.md` and `Pending_Approval/**/*.md`:
1. Read the file's frontmatter (`created:` field)
2. If no `created:` field, use file modification time
3. Compute age in days: `today - created`
4. If age > 7 days → add to bottlenecks list

For each bottleneck, record:
- File path (relative to vault)
- Age in days
- Category (email/whatsapp/linkedin/odoo/social/other)
- Status (needs_action / pending_approval)

---

### Step 5 — Detect Flagged Subscriptions

For each row in the `Current Subscriptions` table read from `Business_Goals.md`:

Apply audit rules:
1. **Inactivity check:** If `Last Active` column contains a date AND that date is > 30 days ago → FLAG
2. **Cost spike check:** If cost has increased >20% vs. prior month (compare manually noted changes) → FLAG
3. **Duplicate check:** If any two services have the same `Category` → FLAG both for review

Build `flagged_subscriptions[]` list with: service name, monthly cost, reason for flag.

---

### Step 6 — Generate Executive Summary

Write a 3–5 sentence executive summary covering:
- Overall system health (how many tasks completed vs. pending)
- Revenue status (vs. monthly target)
- Any critical bottlenecks or flags
- One forward-looking sentence about the week ahead

---

### Step 7 — Write Briefing File

**File:** `vault/AI_Employee_Vault/Briefings/{today_date}_Monday_Briefing.md`

Create the `Briefings/` directory if it does not exist.

**WRITE EXACTLY THIS FORMAT:**

```markdown
---
type: ceo_briefing
generated: {ISO timestamp}
week_start: {today_date}
odoo_connected: {true|false}
---

# Monday CEO Briefing — {today_date}

Generated by the `weekly_audit` skill at {HH:MM}.

---

## Executive Summary

{3–5 sentence summary from Step 6}

---

## Revenue

| Metric | Value |
|--------|-------|
| Monthly target | ${monthly_target} |
| Revenue this week | ${revenue_this_week} |
| Revenue MTD | ${revenue_mtd} |
| MTD vs. target | {% of target reached, e.g. "40% ($2,000 / $5,000)"} |
| Trend | {Up / Flat / Down — compare this week vs. last week if data available} |

### Invoice Detail

| Status | Count | Notes |
|--------|-------|-------|
| Draft | {n} | Awaiting confirmation in Odoo |
| Posted (unpaid) | {n} | Sent to clients |
| Paid | {n} | Revenue recognized |
| Overdue | {n} | Past due date |

**Invoice payment rate:** {payment_rate}%

---

## Completed Tasks (This Week)

| Category | Completed This Week | All-Time Total |
|----------|--------------------:|---------------:|
| Email | {email_done_week} | {email_done} |
| WhatsApp | {whatsapp_done_week} | {whatsapp_done} |
| LinkedIn Posts | {linkedin_done_week} | {linkedin_done} |
| Odoo | {odoo_done_week} | {odoo_done} |
| Social (FB/IG) | {social_done_week} | {social_done} |
| **Total** | **{total_week}** | **{total_done}** |

**Pending Approval:** {pending_count} item(s) awaiting your review.
**Rejected (all-time):** {rejected_count} items.

---

## Bottlenecks

{If no bottlenecks: "No tasks have been open longer than 7 days."}

{If bottlenecks exist:}
| Task File | Category | Age (days) | Stage |
|-----------|----------|------------|-------|
| {filename} | {category} | {age} | {Needs_Action / Pending_Approval} |

---

## Flagged Subscriptions

{If no flags: "No subscriptions flagged this week."}

{If flags exist:}
| Service | Monthly Cost | Flag Reason |
|---------|-------------|-------------|
| {service} | ${cost} | {reason} |

---

## Active Projects Status

| Project | Status | Due Date | Days Remaining |
|---------|--------|----------|---------------|
| {project} | {status} | {due_date} | {n} |

---

## Proactive Suggestions

### Cost Optimization
{List any flagged subscriptions with a specific recommendation, e.g.:
- Cancel [Service X] — not used in 30+ days, saves $Y/month
- Renegotiate [Service Y] — cost up 25% since last month}
{If none: "No cost optimization actions needed this week."}

### Upcoming Deadlines
{List items from Business_Goals.md with due dates in the next 14 days:
- [Item] — due {date} ({n} days)
}
{If none: "No deadlines in the next 14 days."}

### Other Recommendations
1. Review `Pending_Approval/` — {pending_count} item(s) need your decision.
2. Check `Logs/` for any errors or anomalies from the past week.
3. {If any invoices overdue: "Follow up on {n} overdue invoice(s)."}

---

*Generated by the AI Employee weekly_audit skill. Data sources: vault Done/ folder, Odoo MCP, Business_Goals.md.*
```

**SELF-CHECK before saving:**
- [ ] `## Executive Summary` section exists and is not empty
- [ ] `## Revenue` section contains all table rows
- [ ] `## Completed Tasks` section contains the full table
- [ ] `## Bottlenecks` section exists (even if "No bottlenecks")
- [ ] `## Proactive Suggestions` section contains Cost Optimization and Upcoming Deadlines sub-sections
- [ ] File path uses today's date
- [ ] Frontmatter `generated:` field is an ISO timestamp

**If any check fails → fix before saving.**

---

### Step 8 — Update Log (append only)

File: `vault/AI_Employee_Vault/Logs/log_{YYYY-MM-DD}.md`

```
## {ISO timestamp} — weekly_audit [CEO BRIEFING GENERATED]

- Briefing: Briefings/{today_date}_Monday_Briefing.md
- Tasks done (total): {total_done}
- Revenue MTD: ${revenue_mtd}
- Bottlenecks detected: {n}
- Subscriptions flagged: {n}
- Odoo connected: {true|false}
- Status: success
```

---

### Step 9 — Update Dashboard (append only)

Append to `vault/AI_Employee_Vault/Dashboard.md`:

```
## Recent Activity

- CEO Briefing generated: {today_date}_Monday_Briefing.md
- Revenue MTD: ${revenue_mtd} / ${monthly_target} target
- Tasks completed (all-time): {total_done}
- Bottlenecks: {n} task(s) open >7 days
- Date: {today_date}
```

---

## FAILURE HANDLING

If any step fails:
1. STOP — do not write a partial briefing file
2. Write failure log entry:
   ```
   ## {ISO timestamp} — weekly_audit [FAILURE]

   - Step Failed: {step name}
   - Error: {description}
   - Action: No briefing written — investigate and re-run manually
   ```
3. Report clearly with actionable fix

---

## OUTPUT GUARANTEE

After successful execution:
- ✅ `Briefings/{today_date}_Monday_Briefing.md` exists with all required sections
- ✅ Log entry written to `Logs/log_{YYYY-MM-DD}.md`
- ✅ Dashboard updated
- ✅ No existing files overwritten
