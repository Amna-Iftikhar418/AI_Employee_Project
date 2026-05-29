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

- [ ] **TASK-2.1** Install Odoo Community (self-hosted, local) — Odoo 19+
- [ ] **TASK-2.2** Set up a company profile, chart of accounts, and at least one product/service in Odoo
- [ ] **TASK-2.3** Clone and configure the Odoo MCP server (`https://github.com/AlanOgic/mcp-odoo-adv`)
- [ ] **TASK-2.4** Add Odoo MCP connection details to `.env` (host, port, database, username, password/API key)
- [ ] **TASK-2.5** Register the Odoo MCP server in Claude Code MCP config
- [ ] **TASK-2.6** Test MCP connection: query invoices and account balances from Claude
- [ ] **TASK-2.7** Create `.claude/skills/odoo_handler/skill.md` with actions:
  - Read invoices
  - Create draft invoice
  - Log a transaction
  - Query account balance
  - Draft payment (HITL required — never auto-post)
- [ ] **TASK-2.8** Test skill end-to-end: create a draft invoice via Claude → approve → confirm in Odoo UI

---

## TASK-3: Facebook & Instagram Integration

- [ ] **TASK-3.1** Create a Facebook Developer account and a Facebook App at `developers.facebook.com`
- [ ] **TASK-3.2** Enable `pages_manage_posts` and `instagram_basic`, `instagram_content_publish` permissions on the app
- [ ] **TASK-3.3** Connect Instagram Business/Creator account to the Facebook Page
- [ ] **TASK-3.4** Generate a long-lived Page Access Token and store in `.env`
- [ ] **TASK-3.5** Build or configure a Social MCP server that wraps Meta Graph API calls (post to page, post to Instagram)
- [ ] **TASK-3.6** Register the Social MCP server in Claude Code MCP config
- [ ] **TASK-3.7** Create vault folders: `Pending_Approval/social/` and `Approved/social/`
- [ ] **TASK-3.8** Create `.claude/skills/facebook_instagram_poster/skill.md` with actions:
  - Auto-select or receive post topic
  - Create post content
  - Write post file to `Pending_Approval/social/`
  - On approval: publish to Facebook Page via MCP
  - On approval: publish to Instagram via MCP
  - Generate weekly activity summary
- [ ] **TASK-3.9** Update `approved_watcher.py` to handle `social/` subfolder and invoke the skill
- [ ] **TASK-3.10** Test end-to-end: post created → approved → published on Facebook + Instagram → logged → moved to `Done/social/`

---

## TASK-4: Twitter (X) Integration

- [-] **TASK-4** Skipped — Twitter/X API requires paid plan ($100/month minimum). Not implementing.

---

## TASK-5: Multiple MCP Servers

- [ ] **TASK-5.1** Confirm Email MCP (`mcp_server.py`) is running and documented
- [ ] **TASK-5.2** Confirm Odoo MCP server is running (from TASK-2)
- [ ] **TASK-5.3** Confirm Social MCP server is running (from TASK-3)
- [ ] **TASK-5.4** Document all MCP servers in `README.md` — name, port, purpose, how to start
- [ ] **TASK-5.5** Ensure all MCP servers start automatically with the AI Employee system (`watchers/main.py` or a startup script)

---

## TASK-6: Weekly CEO Briefing Upgrade

- [ ] **TASK-6.1** Create `vault/AI_Employee_Vault/Business_Goals.md` with the required schema:
  - Revenue target (monthly goal + current MTD)
  - Key metrics table (response time, invoice payment rate, software costs)
  - Active projects list
  - Subscription audit rules (30-day inactivity, >20% cost increase, duplicate tools)
- [ ] **TASK-6.2** Create `.claude/skills/weekly_audit/skill.md` with actions:
  - Read `Business_Goals.md`
  - Count completed tasks per category from `Done/`
  - Pull revenue/invoice data from Odoo MCP
  - Identify bottlenecks (tasks open longer than expected)
  - Detect flagged subscriptions using subscription audit rules
  - Generate briefing using the required schema
- [ ] **TASK-6.3** Update `scheduler.py` `generate_ceo_briefing()` to invoke the `weekly_audit` skill via `claude -p` (instead of writing static content directly)
- [ ] **TASK-6.4** Verify generated briefing contains all required sections:
  - Executive Summary
  - Revenue (this week + MTD + trend)
  - Completed Tasks table
  - Bottlenecks table
  - Proactive Suggestions (cost optimization + upcoming deadlines)
- [ ] **TASK-6.5** Test: run briefing manually on a Monday, confirm output file appears in `Briefings/`

---

## TASK-7: Error Recovery & Graceful Degradation

- [ ] **TASK-7.1** Create `watchers/retry_handler.py` with exponential backoff decorator:
  - `max_attempts=3`, `base_delay=1`, `max_delay=60`
  - Handles `TransientError` class
- [ ] **TASK-7.2** Apply `@with_retry` decorator to all external API calls:
  - Gmail API calls in `gmail_watcher.py`
  - MCP HTTP calls in `approved_watcher.py`
  - Odoo MCP calls
  - Social MCP calls
- [ ] **TASK-7.3** Implement graceful degradation in `gmail_watcher.py`:
  - Gmail API down → queue failed emails to a local file, retry on next cycle
- [ ] **TASK-7.4** Implement graceful degradation for Odoo:
  - Odoo API timeout → write alert to `Logs/`, do NOT retry payment actions automatically
- [ ] **TASK-7.5** Implement watchdog process — add health check in `watchers/main.py`:
  - Detect if any watcher subprocess has crashed
  - Auto-restart crashed watcher
  - Write restart event to `Logs/`
- [ ] **TASK-7.6** Add authentication error handling across all watchers:
  - Expired token → write alert to `Logs/`, pause that watcher's operations, notify via Dashboard
- [ ] **TASK-7.7** Test each error category: simulate failure and confirm recovery behavior

---

## TASK-8: Comprehensive JSON Audit Logging

- [ ] **TASK-8.1** Create `watchers/audit_logger.py` with a function `log_action(action_type, actor, target, parameters, approval_status, approved_by, result)`
- [ ] **TASK-8.2** Output format must match required schema:
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
- [ ] **TASK-8.3** Write JSON logs to `vault/AI_Employee_Vault/Logs/YYYY-MM-DD.json` (one file per day, append each entry as a new line — JSONL format)
- [ ] **TASK-8.4** Integrate `log_action()` into all action points:
  - Email sent (`approved_watcher.py`)
  - LinkedIn post published (`approved_watcher.py`)
  - Facebook/Instagram post published
  - Odoo invoice/payment drafted
  - Any file approved/rejected (HITL decision)
- [ ] **TASK-8.5** Implement 90-day log retention: add a cleanup function in `scheduler.py` that deletes `.json` log files older than 90 days (run weekly)
- [ ] **TASK-8.6** Test: trigger an email send, confirm a valid JSON entry appears in today's `.json` log

---

## TASK-9: Ralph Wiggum Loop (Stop Hook)

- [ ] **TASK-9.1** Create a Stop hook file at `.claude/hooks/stop_hook.py` (or the appropriate Claude Code hooks path)
- [ ] **TASK-9.2** Implement file-movement completion strategy:
  - Hook checks if the current task file exists in `Done/`
  - If YES → allow Claude to exit
  - If NO → block exit and re-inject the original prompt
- [ ] **TASK-9.3** Add max-iterations guard (default: 10) to prevent infinite loops
- [ ] **TASK-9.4** Register the Stop hook in Claude Code settings (`.claude/settings.json` or `CLAUDE.md`)
- [ ] **TASK-9.5** Test with a multi-step task: confirm Claude loops until the task file lands in `Done/`, then exits cleanly

---

## TASK-10: Permission Boundaries

- [ ] **TASK-10.1** Document permission boundaries in `Company_Handbook.md`:
  - Email: auto-approve known contacts, always require approval for new contacts/bulk
  - Payments: auto-approve <$50 recurring, always require approval for new payees or >$100
  - Social posts: auto-approve scheduled posts, always require approval for replies/DMs
  - Odoo: auto-approve read/draft, always require approval for posting invoices/payments
  - Files: auto-approve create/read, always require approval for delete/move outside vault
- [ ] **TASK-10.2** Enforce payment boundary in Odoo skill: never call `account.move` `action_post` without a file in `Approved/`
- [ ] **TASK-10.3** Enforce social boundary: never publish a post without a file in `Approved/social/`

---

## TASK-11: Documentation

- [ ] **TASK-11.1** Update `README.md` with:
  - Full prerequisites and setup instructions
  - How to start the system (`uv run watchers/main.py`)
  - How to start all MCP servers
  - Folder structure explanation
  - How HITL approval works
- [ ] **TASK-11.2** Write an architecture document (`docs/architecture.md` or section in README) covering:
  - All components (watchers, MCP servers, skills, vault, scheduler)
  - Data flow diagram (Perception → Reasoning → HITL → Action)
  - How each domain (email, WhatsApp, LinkedIn, Facebook/Instagram, Odoo) flows through the system
- [ ] **TASK-11.3** Write a lessons learned section in README or a separate `docs/lessons_learned.md`
- [ ] **TASK-11.4** Record a demo video (5–10 minutes) covering:
  - Email received → processed → approved → sent
  - LinkedIn post auto-generated → approved → published
  - Facebook/Instagram post → approved → published
  - CEO briefing generated on Monday
  - Odoo invoice drafted via AI Employee

---

## TASK-12: New Agent Skills Summary

- [ ] **TASK-12.1** `.claude/skills/odoo_handler/skill.md` — created in TASK-2.7
- [ ] **TASK-12.2** `.claude/skills/facebook_instagram_poster/skill.md` — created in TASK-3.8
- [ ] **TASK-12.3** `.claude/skills/weekly_audit/skill.md` — created in TASK-6.2
- [ ] **TASK-12.4** Update `CLAUDE.md` to register all new skills with their trigger conditions

---

## Progress Tracker

| Task Group | Total | Done | Remaining |
|------------|-------|------|-----------|
| TASK-1: Cross-domain integration | 3 | 0 | 3 |
| TASK-2: Odoo setup + MCP + skill | 8 | 0 | 8 |
| TASK-3: Facebook & Instagram | 10 | 0 | 10 |
| TASK-4: Twitter/X | 1 | 0 | 1 (skipped) |
| TASK-5: Multiple MCP servers | 5 | 0 | 5 |
| TASK-6: CEO Briefing upgrade | 5 | 0 | 5 |
| TASK-7: Error recovery | 7 | 0 | 7 |
| TASK-8: JSON audit logging | 6 | 0 | 6 |
| TASK-9: Ralph Wiggum loop | 5 | 0 | 5 |
| TASK-10: Permission boundaries | 3 | 0 | 3 |
| TASK-11: Documentation | 4 | 0 | 4 |
| TASK-12: New skills registration | 4 | 0 | 4 |
| **TOTAL** | **61** | **0** | **60 active** |
