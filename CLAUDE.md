# AI Employee — Claude Code Project Instructions

## What This Project Is

An autonomous AI Employee that monitors Gmail and WhatsApp, processes incoming
messages, writes structured plans, routes tasks through a human approval workflow,
sends emails via MCP server, and publishes LinkedIn posts automatically.

All vault files live in: `vault/AI_Employee_Vault/`
System is started with: `uv run watchers/main.py`

---

## Agent Skills — Use These for All AI Tasks

IMPORTANT: Every AI action in this project must go through the appropriate skill below.
Do NOT write ad-hoc code or perform actions outside of these skills.

### 1. gmail_handler
**When to use:** A TASK_*.md file with `type: email_task` or `source: gmail`
appears in `vault/AI_Employee_Vault/Needs_Action/email/`
**Skill:** `.claude/skills/gmail_handler/skill.md`

### 2. whatsapp_handler
**When to use:** A TASK_*.md file with `type: whatsapp_task` or `source: whatsapp`
appears in `vault/AI_Employee_Vault/Needs_Action/whatsapp/`
**Skill:** `.claude/skills/whatsapp_handler/whatsapp_task_handler.md`

### 3. generate_plan
**When to use:** Any task needs a structured PLAN_*.md file written before action
**Skill:** `.claude/skills/generate_plan/skill.md`

### 4. file_handler
**When to use:** A general file task appears in `vault/AI_Employee_Vault/Needs_Action/`
**Skill:** `.claude/skills/file_handler/basic_file_handler.md`

### 5. send_email
**When to use:** An approved email task appears in `vault/AI_Employee_Vault/Approved/email/`
**Skill:** `.claude/skills/send_email/skill.md`

### 6. process_approved
**When to use:** Any non-LinkedIn task file appears in `vault/AI_Employee_Vault/Approved/`
**Skill:** `.claude/skills/process_approved/skill.md`

### 7. linkedin_post_creator
**When to use:** User asks to create a LinkedIn post, OR daily scheduler triggers
**Skill:** `.claude/skills/linkedin_post_creator/skill.md`

### 8. linkedin_publisher
**When to use:** Automatically invoked by `linkedin_post_creator` skill immediately after the user approves a post ("yes" answer). Uses Playwright MCP (`mcp__playwright__browser_*` tools) to open LinkedIn in the browser, type the post, and submit it in real time. Do NOT call `linkedin_executor.py` or `linkedin_post.js` — Playwright MCP is the publishing path.

### 9. odoo_handler
**When to use:** A `TASK_odoo_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/odoo/`, OR a file appears in `vault/AI_Employee_Vault/Approved/odoo/`. Actions: read invoices, create draft invoice, log transaction, query account balance, draft payment.
**Skill:** `.claude/skills/odoo_handler/skill.md`
**MCP Server:** `odoo` (registered in `.mcp.json`, runs via `uv --directory mcp_servers/odoo_mcp run odoo-mcp`)
**CRITICAL:** NEVER auto-post invoices or confirm payments. Always route write actions through `Pending_Approval/odoo/` → `Approved/odoo/` first.

### 10. facebook_instagram_poster
**When to use:** User asks to create a Facebook or Instagram post, OR a `SOCIAL_POST_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/social/` or `Approved/social/`.
**Skill:** `.claude/skills/facebook_instagram_poster/skill.md`
**MCP Server:** `social` (registered in `.mcp.json`, runs via `uv --directory mcp_servers/social_mcp run social-mcp`)
**Executor:** `facebook_instagram_executor.py` (called directly by `approved_watcher.py`)
**CRITICAL:** NEVER publish to Facebook or Instagram without a file in `Approved/social/`. Always route through `Pending_Approval/social/` → human approval → `Approved/social/` first.
**Required env vars:** `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID`

### 11. weekly_audit
**When to use:** Every Monday at 08:00 (triggered by `scheduler.py`), OR manually when the user requests a CEO briefing.
**Skill:** `.claude/skills/weekly_audit/skill.md`
**Actions:** Read `Business_Goals.md`, count completed tasks per category, pull revenue/invoice data from Odoo MCP, identify bottlenecks (open > 7 days), detect flagged subscriptions, generate CEO briefing.
**Output:** `vault/AI_Employee_Vault/Briefings/YYYY-MM-DD_Monday_Briefing.md`
**Required sections:** Executive Summary, Revenue, Completed Tasks table, Bottlenecks table, Proactive Suggestions.

### 12. browser_handler
**When to use:** A `TASK_browser_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/browser/`, OR a file appears in `vault/AI_Employee_Vault/Approved/browser/`, OR user asks to open a website, fill a form, or automate a portal.
**Skill:** `.claude/skills/browser_handler/skill.md`
**MCP Server:** `browser` (registered in `.mcp.json`, runs via `uv --directory mcp_servers/browser_mcp run browser-mcp`)
**Tools:** `browser_navigate`, `browser_get_content`, `browser_click`, `browser_fill_field`, `browser_screenshot`, `browser_check_element`, `browser_get_text`, `browser_select_option`, `browser_close_session`
**CRITICAL:** NEVER submit payment forms or destructive portal actions without a file in `Approved/browser/`. Read-only actions (navigate, screenshot, read content) do NOT require approval. Always route write actions through `Pending_Approval/browser/` → human approval → `Approved/browser/` first.
**First-time setup:** Run `uv --directory mcp_servers/browser_mcp run playwright install chromium` once to install the Chromium binary.

---

## Pipeline Overview

```
Gmail/WhatsApp → Inbox/ → Needs_Action/ → [skill creates Plan] → Pending_Approval/
                                                                        ↓
                                                              Human reviews & approves
                                                                        ↓
                                                                   Approved/
                                                                        ↓
                                              [send_email / process_approved / linkedin_publisher skill]
                                                                        ↓
                                                                      Done/
```

### LinkedIn-specific pipeline

```
linkedin_post_creator skill → Pending_Approval/linkedin/
         ↓
   "Can I post it?" shown to user
         ↓
   YES → move to Approved/linkedin/ → linkedin_publisher skill (Playwright MCP) → Done/
   NO  → move to Rejected/linkedin/
```

## Autonomous Skill Invocation

Skills are invoked in two ways:
1. **Manually** — You open Claude Code and run the skill yourself (gmail, whatsapp, email tasks)
2. **Automatically** — Background watchers call `claude -p` to invoke skills headlessly:
   - `scheduler.py` at 09:00 daily → invokes `linkedin_post_creator` skill
   - `scheduler.py` every Monday at 08:00 → invokes `weekly_audit` skill to generate CEO briefing

The `claude` CLI runs autonomously — no interactive session needed. It must be installed and authenticated once (`claude auth login`).

## Key Rules
- NEVER send emails or post to LinkedIn/Facebook/Instagram without a file in Approved/
- ALWAYS create a PLAN file before any action
- ALWAYS append to logs and Dashboard — never overwrite
- Vault path: `vault/AI_Employee_Vault/`
- MCP server runs on: `http://localhost:8001`
- ALL AI logic lives in `.claude/skills/` — never in Python scripts directly
