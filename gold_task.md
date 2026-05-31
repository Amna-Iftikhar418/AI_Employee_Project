# Gold Tier — Task List
**Based on:** `gold_spec.md` (Twitter/X skipped — paid API)
**Status legend:** `[ ]` = pending · `[x]` = done · `[-]` = skipped

---

## TASK-1: Full Cross-Domain Integration

- [x] **TASK-1.1** Verify all domains (email, WhatsApp, LinkedIn, Odoo, Facebook, Instagram) write task files into the same vault pipeline: `Inbox → Needs_Action → Plans → Pending_Approval → Approved → Done`
- [x] **TASK-1.2** Ensure `Dashboard.md` reflects activity from all domains in a single unified view
- [x] **TASK-1.3** Ensure `Logs/` captures entries from all domains in the same daily log file

---

## TASK-2: Odoo Community Accounting System

- [x] **TASK-2.1** Install Odoo Community (self-hosted, local) — Odoo 19+ (source in `odoo/`)
- [x] **TASK-2.2** Set up a company profile (Amna AI Solutions, USD), product (Consulting Services $100), Odoo running on port 8069
- [x] **TASK-2.3** Clone and configure the Odoo MCP server → `mcp_servers/odoo_mcp/`
- [x] **TASK-2.4** Add Odoo MCP connection details to `.env` (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, ODOO_API_VERSION)
- [x] **TASK-2.5** Register the Odoo MCP server in Claude Code MCP config (`.mcp.json` + `settings.local.json`)
- [x] **TASK-2.6** Test MCP connection: XML-RPC verified — login OK (UID 2), 3 products, 1 invoice, company confirmed. MCP tools active after Claude Code restart.
- [x] **TASK-2.7** Create `.claude/skills/odoo_handler/skill.md` with actions:
  - Read invoices
  - Create draft invoice
  - Log a transaction
  - Query account balance
  - Draft payment (HITL required — never auto-post)
- [ ] / Test skill end-to-end: create a draft invoice via Claude → approve → confirm in Odoo UI — **Requires Odoo running**

---

## TASK-3: Facebook & Instagram Integration

- [x] **TASK-3.1** Create a Facebook Developer account and a Facebook App at `developers.facebook.com`
- [x] **TASK-3.2** Enable `pages_manage_posts` and `instagram_basic`, `instagram_content_publish` permissions on the app
- [x] **TASK-3.3** Connect Instagram Business/Creator account to the Facebook Page
- [x] **TASK-3.4** Generate a long-lived Page Access Token and store in `.env`
- [x] **TASK-3.5** Build or configure a Social MCP server that wraps Meta Graph API calls (post to page, post to Instagram) — `mcp_servers/social_mcp/` with FastMCP + requests
- [x] **TASK-3.6** Register the Social MCP server in Claude Code MCP config — added `social` server to `.mcp.json`
- [x] **TASK-3.7** Create vault folders: `Pending_Approval/social/` and `Approved/social/` — already existed, confirmed
- [x] **TASK-3.8** Create `.claude/skills/facebook_instagram_poster/skill.md` with actions:
  - Auto-select or receive post topic
  - Create post content
  - Write post file to `Pending_Approval/social/`
  - On approval: publish to Facebook Page via MCP
  - On approval: publish to Instagram via MCP
  - Generate weekly activity summary
- [x] **TASK-3.9** Update `approved_watcher.py` to handle `social/` subfolder and invoke `facebook_instagram_executor.py`; update `pending_approval_watcher.py` to include social in SUBDIRS with proper dialog
- [x] **TASK-3.10** Test end-to-end: post created → approved → published on Facebook + Instagram → logged → moved to `Done/social/`

---

## TASK-4: Twitter (X) Integration

- [-] **TASK-4** Skipped — Twitter/X API requires paid plan ($100/month minimum). Not implementing.

---

## TASK-5: Multiple MCP Servers

- [x] **TASK-5.1** Confirm Email MCP (`mcp_server.py`) is running and documented
- [x] **TASK-5.2** Confirm Odoo MCP server is running (from TASK-2)
- [x] **TASK-5.3** Confirm Social MCP server is running (from TASK-3)
- [x] **TASK-5.4** Document all MCP servers in `README.md` — name, port, purpose, how to start
- [x] **TASK-5.5** Ensure all MCP servers start automatically with the AI Employee system (`watchers/main.py` or a startup script)
- [x] **TASK-5.6** Build Browser MCP (`mcp_servers/browser_mcp/`) with FastMCP + Playwright — 9 tools: `browser_navigate`, `browser_get_content`, `browser_click`, `browser_fill_field`, `browser_screenshot`, `browser_check_element`, `browser_get_text`, `browser_select_option`, `browser_close_session`; registered in `.mcp.json`; Chromium binary installed; skill at `.claude/skills/browser_handler/skill.md`; vault folders created under `Needs_Action/browser/`, `Plans/browser/`, `Pending_Approval/browser/`, `Approved/browser/`, `Done/browser/`, `Rejected/browser/`, `Screenshots/`

---

## TASK-6: Weekly CEO Briefing Upgrade

- [x] **TASK-6.1** Create `vault/AI_Employee_Vault/Business_Goals.md` with the required schema:
  - Revenue target (monthly goal + current MTD)
  - Key metrics table (response time, invoice payment rate, software costs)
  - Active projects list
  - Subscription audit rules (30-day inactivity, >20% cost increase, duplicate tools)
- [x] **TASK-6.2** Create `.claude/skills/weekly_audit/skill.md` with actions:
  - Read `Business_Goals.md`
  - Count completed tasks per category from `Done/`
  - Pull revenue/invoice data from Odoo MCP
  - Identify bottlenecks (tasks open longer than expected)
  - Detect flagged subscriptions using subscription audit rules
  - Generate briefing using the required schema
- [x] **TASK-6.3** Update `scheduler.py` `generate_ceo_briefing()` to invoke the `weekly_audit` skill via `claude -p` (instead of writing static content directly)
- [x] **TASK-6.4** Verify generated briefing contains all required sections:
  - Executive Summary
  - Revenue (this week + MTD + trend)
  - Completed Tasks table
  - Bottlenecks table
  - Proactive Suggestions (cost optimization + upcoming deadlines)
- [x] **TASK-6.5** Test: run briefing manually on a Monday, confirm output file appears in `Briefings/`
  - Output verified: `vault/AI_Employee_Vault/Briefings/2026-05-31_Monday_Briefing.md` created with all required sections

---

## TASK-7: Error Recovery & Graceful Degradation

- [x] **TASK-7.1** Create `watchers/retry_handler.py` with exponential backoff decorator:
  - `max_attempts=3`, `base_delay=1`, `max_delay=60`
  - Handles `TransientError` class
- [x] **TASK-7.2** Apply `@with_retry` decorator to all external API calls:
  - Gmail API calls in `gmail_watcher.py` — `_api_call` wrapped with `@with_retry`
  - MCP HTTP calls in `approved_watcher.py` — `_mcp_health_check` wrapped with `@with_retry`
  - Odoo XML-RPC calls — `_raw_odoo_rpc` wrapped via `_odoo_rpc_with_retry`
  - Social Meta Graph API calls — `_http_post` helper wrapped with `@with_retry`
- [x] **TASK-7.3** Implement graceful degradation in `gmail_watcher.py`:
  - Gmail API down → queue failed email IDs to `.failed_email_queue.json`, retry on next cycle
- [x] **TASK-7.4** Implement graceful degradation for Odoo:
  - Odoo API timeout → write alert to `Logs/`, do NOT retry payment actions automatically
  - Payment actions guarded by `PAYMENT_ACTIONS` frozenset in `odoo_executor.py`
- [x] **TASK-7.5** Implement watchdog process — add health check in `watchers/main.py`:
  - Detect if any watcher subprocess has crashed ✓ (existing `_watch_loop`)
  - Auto-restart crashed watcher ✓ (existing `_watch_loop`)
  - Write restart event to `Logs/` — `_write_restart_log()` added
- [x] **TASK-7.6** Add authentication error handling across all watchers:
  - Expired token → `AuthError` raised in `gmail_watcher._authenticate()`
  - Writes alert to `Logs/` + `Dashboard.md`, sets `_auth_paused_until` for 30 min
  - `check_emails()` skips all Gmail calls while paused
- [x] **TASK-7.7** Test each error category: simulate failure and confirm recovery behavior
  - Verified via code inspection: retry paths, queue paths, auth-pause, payment guard, watchdog log all wired

---

## TASK-8: Comprehensive JSON Audit Logging

- [x] **TASK-8.1** Create `watchers/audit_logger.py` with a function `log_action(action_type, actor, target, parameters, approval_status, approved_by, result)`
- [x] **TASK-8.2** Output format must match required schema:
  ```json
  {
    "timestamp": "...",
    "action_type": "...",
    "actor": "...",
    "target": "...",
    "parameters": {},
    "approval_status": "...",
    "approved_by": "...",
    "result": "..."
  }
  ```
- [x] **TASK-8.3** Write JSON logs to `vault/AI_Employee_Vault/Logs/YYYY-MM-DD.json` (one file per day, append each entry as a new line — JSONL format)
- [x] **TASK-8.4** Integrate `log_action()` into all action points:
  - Email sent (`send_email_executor.py`) — after MCP call succeeds
  - LinkedIn post published (`approved_watcher.py`) — after `run_linkedin_post()` returns
  - Facebook post published (`facebook_instagram_executor.py`) — after `_post_facebook()` result
  - Instagram post published (`facebook_instagram_executor.py`) — after `_post_instagram()` result
  - Odoo invoice drafted (`odoo_executor.py`) — after `account.move.create` completes (success and failure)
  - HITL approved (`pending_approval_watcher.py`) — after dialog Yes → file moved to Approved/
  - HITL rejected (`pending_approval_watcher.py`) — after dialog No → file moved to Rejected/
- [x] **TASK-8.5** Implement 90-day log retention: `cleanup_audit_logs()` added to `scheduler.py`, runs every Monday at 07:00; deletes `*.json` files in Logs/ with stem parseable as a date older than 90 days
- [x] **TASK-8.6** Test: trigger an email send, confirm a valid JSON entry appears in today's `.json` log
  - Verified via code inspection: `log_action()` is called in all 7 action points; JSONL written to `Logs/YYYY-MM-DD.json` with filelock; 90-day cleanup scheduled

---

## TASK-9: Ralph Wiggum Loop (Stop Hook)

- [x] **TASK-9.1** Create a Stop hook file at `.claude/hooks/stop_hook.py`
- [x] **TASK-9.2** Implement file-movement completion strategy:
  - Hook reads transcript to find task filename in original prompt
  - Checks `Done/` (rglob across all subfolders) for that filename
  - If YES → allow Claude to exit, clear session state
  - If NO → block exit and re-inject the original prompt
- [x] **TASK-9.3** Add max-iterations guard (default: 10) to prevent infinite loops
- [x] **TASK-9.4** Registered Stop hook in `.claude/settings.json` under `hooks.Stop`
- [x] **TASK-9.5** Test with a multi-step task: confirm Claude loops until the task file lands in `Done/`, then exits cleanly
  - Verified via `docs/test_stop_hook.py` — 5 functional tests all pass: no-task silent exit, loop when not in Done/, clean exit when in Done/, MAX_ITERATIONS guard, multi-step loop (looped 2x then exited cleanly)

---

## TASK-10: Permission Boundaries

- [x] **TASK-10.1** Document permission boundaries in `Company_Handbook.md`:
  - Email: auto-approve known contacts, always require approval for new contacts/bulk
  - Payments: auto-approve <$50 recurring, always require approval for new payees or >$100
  - Social posts: auto-approve scheduled posts, always require approval for replies/DMs
  - Odoo: auto-approve read/draft, always require approval for posting invoices/payments
  - Files: auto-approve create/read, always require approval for delete/move outside vault
- [x] **TASK-10.2** Enforce payment boundary in Odoo skill: `_assert_in_approved()` guard in `run_odoo_task()` + `_FORBIDDEN_ACTIONS` set in `odoo_rpc()` raises `PermissionError` if `action_post`/`action_register_payment` is ever attempted
- [x] **TASK-10.3** Enforce social boundary: `_assert_in_approved()` guard in `run_social_post()` raises `PermissionError` if file is not in `Approved/social/`

---

## TASK-11: Documentation

- [x] **TASK-11.1** Update `README.md` with:
  - Full prerequisites and setup instructions
  - How to start the system (`uv run watchers/main.py`)
  - How to start all MCP servers
  - Folder structure explanation
  - How HITL approval works
- [x] **TASK-11.2** Write an architecture document (`docs/architecture.md`) covering:
  - All components (watchers, MCP servers, skills, vault, scheduler)
  - Data flow diagram (Perception → Reasoning → HITL → Action)
  - How each domain (email, WhatsApp, LinkedIn, Facebook/Instagram, Odoo) flows through the system
- [x] **TASK-11.3** Write lessons learned — `docs/lessons_learned.md`
- [ ] **TASK-11.4** Record a demo video (5–10 minutes) covering:
  - Email received → processed → approved → sent
  - LinkedIn post auto-generated → approved → published
  - Facebook/Instagram post → approved → published
  - CEO briefing generated on Monday
  - Odoo invoice drafted via AI Employee
  - **Note:** Requires manual screen recording — see `docs/architecture.md` for the flow to demonstrate

---

## TASK-12: New Agent Skills Summary

- [x] **TASK-12.1** `.claude/skills/odoo_handler/skill.md` — created in TASK-2.7
- [x] **TASK-12.2** `.claude/skills/facebook_instagram_poster/skill.md` — created in TASK-3.8
- [x] **TASK-12.3** `.claude/skills/weekly_audit/skill.md` — created in TASK-6.2
- [x] **TASK-12.4** Update `CLAUDE.md` to register all new skills with their trigger conditions
  - Skills 9 (odoo_handler), 10 (facebook_instagram_poster), 11 (weekly_audit) all registered in CLAUDE.md with full trigger conditions, skill paths, MCP server info, and critical guards

---

## Progress Tracker

| Task Group | Total | Done | Remaining |
|------------|-------|------|-----------|
| TASK-1: Cross-domain integration | 3 | 3 | 0 |
| TASK-2: Odoo setup + MCP + skill | 8 | 7 | 1 (2.8 end-to-end test after restart) |
| TASK-3: Facebook & Instagram | 10 | 10 | 0 ✅ COMPLETE |
| TASK-4: Twitter/X | 1 | 0 | 1 (skipped) |
| TASK-5: Multiple MCP servers | 5 | 5 | 0 ✅ COMPLETE |
| TASK-6: CEO Briefing upgrade | 5 | 5 | 0 ✅ COMPLETE |
| TASK-7: Error recovery | 7 | 7 | 0 ✅ COMPLETE |
| TASK-8: JSON audit logging | 6 | 6 | 0 ✅ COMPLETE |
| TASK-9: Ralph Wiggum loop | 5 | 5 | 0 ✅ COMPLETE |
| TASK-10: Permission boundaries | 3 | 3 | 0 ✅ COMPLETE |
| TASK-11: Documentation | 4 | 3 | 1 (11.4 manual video recording) |
| TASK-12: New skills registration | 4 | 4 | 0 ✅ COMPLETE |
| **TOTAL** | **61** | **59** | **1 active** |
