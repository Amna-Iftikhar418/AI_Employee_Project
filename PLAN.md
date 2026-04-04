# Personal AI Employee Hackathon 0 — Master Plan
**Project:** AI Employee (Digital FTE)
**Date:** 2026-03-30
**Current Status:** Silver Tier — COMPLETE

---

## Objective

Build a fully autonomous Digital FTE (Full-Time Equivalent) that monitors Gmail and WhatsApp,
processes incoming messages, writes structured plans, routes tasks through a human approval
workflow, sends emails via MCP server, and publishes LinkedIn posts automatically — all
locally-first, agent-driven, and human-in-the-loop.

---

## Hackathon Tier Roadmap

```
[COMPLETE] Bronze  →  [COMPLETE] Silver  →  [IN PROGRESS] Gold  →  [ ] Platinum
```

---

## Tier 1: Bronze — Foundation (COMPLETE)

**Target:** 8–12 hours | **Status:** Done

| Deliverable | Status | Implementation |
|---|---|---|
| Obsidian vault with `Dashboard.md` and `Company_Handbook.md` | ✅ | `vault/AI_Employee_Vault/` |
| One working Watcher script (Gmail OR filesystem) | ✅ | `watchers/gmail_watcher.py` |
| Claude Code reading/writing to vault | ✅ | All 8 agent skills use vault |
| Basic folder structure: `/Inbox`, `/Needs_Action`, `/Done` | ✅ | Full vault hierarchy exists |
| All AI logic implemented as Agent Skills | ✅ | `.claude/skills/` (8 skills) |

---

## Tier 2: Silver — Functional Assistant (COMPLETE)

**Target:** 20–30 hours | **Status:** Done

| Deliverable | Status | Implementation |
|---|---|---|
| Gmail Watcher | ✅ | `watchers/gmail_watcher.py` — polls every 30s |
| WhatsApp Watcher | ✅ | `watchers/whatsapp_watcher.py` — live Node.js listener |
| LinkedIn daily auto-posting | ✅ | `watchers/scheduler.py` → `linkedin_post_creator` skill → Playwright |
| Claude reasoning loop with `PLAN_*.md` files | ✅ | `generate_plan` skill — MANDATORY before every action |
| MCP server for email sending | ✅ | FastAPI on `http://localhost:8001` — Gmail OAuth |
| Human-in-the-Loop approval workflow | ✅ | Windows dialog (`pending_approval_watcher.py`) + Obsidian |
| Basic scheduling (cron-style) | ✅ | `scheduler.py` — 09:00 daily, Monday 08:00 briefing |
| All AI logic as Agent Skills | ✅ | `gmail_handler`, `whatsapp_handler`, `send_email`, `process_approved`, `linkedin_post_creator` |

### Silver Architecture (Running Now)

```
Gmail/WhatsApp
      ↓
  Inbox/email|whatsapp/          ← raw .txt files
      ↓
  Needs_Action/email|whatsapp/   ← TASK_*.md (frontmatter + body)
      ↓
  [Claude generates PLAN_*.md]   ← generate_plan skill (MANDATORY)
      ↓
  Pending_Approval/              ← Windows dialog or Obsidian review
      ↓   (human approves)
  Approved/
      ↓
  [send_email | linkedin_executor]  ← MCP / Playwright
      ↓
  Done/  +  Logs/  +  Dashboard.md
```

### Current Activity Log (as of 2026-03-25)
- 2 LinkedIn posts published (automated)
- 1 email sent (MCP — Gmail OAuth)
- 2 WhatsApp replies processed
- 6 emails in `Pending_Approval` awaiting human decision
- All watchers running with process supervision and auto-restart

---

## Tier 3: Gold — Autonomous Employee (NEXT TARGET)

**Target:** 40+ hours | **Status:** Not Started

### Gold Requirements Checklist

| # | Feature | Priority | Notes |
|---|---|---|---|
| 1 | All Silver requirements | ✅ Done | — |
| 2 | Full cross-domain integration (Personal + Business) | 🔲 | Wire business goals into CEO Briefing |
| 3 | Odoo Community (self-hosted) + MCP integration | 🔲 | JSON-RPC API via `mcp-odoo-adv` |
| 4 | Facebook + Instagram posting + summary | 🔲 | Playwright or Meta Graph API |
| 5 | Twitter (X) posting + summary | 🔲 | X API v2 or Playwright |
| 6 | Multiple MCP servers for different action types | 🔲 | Calendar, Browser, Social |
| 7 | Weekly Business + Accounting Audit with CEO Briefing | 🔲 | `scheduler.py` Monday trigger |
| 8 | Error recovery and graceful degradation | 🔲 | Retry queues, dead-letter folder |
| 9 | Comprehensive audit logging | 🔲 | Structured JSON logs in `/Logs/` |
| 10 | Ralph Wiggum loop (autonomous multi-step task completion) | 🔲 | Stop hook pattern |
| 11 | Architecture documentation + lessons learned | 🔲 | Extend README.md |
| 12 | All AI logic as Agent Skills | 🔲 | New skills for Odoo, social media |

### Gold Action Steps

#### Step G1 — CEO Monday Briefing (Cross-Domain Audit)
- [ ] Create `vault/AI_Employee_Vault/Business_Goals.md` with Q2 2026 targets, KPIs, and subscription rules
- [ ] Create `vault/AI_Employee_Vault/Bank_Transactions.md` template for manual/API transaction imports
- [ ] Write `ceo_briefing` Agent Skill in `.claude/skills/ceo_briefing/skill.md`
  - Reads `Business_Goals.md`, scans `Done/` for completed week tasks, reads `Bank_Transactions.md`
  - Generates `vault/AI_Employee_Vault/Briefings/YYYY-MM-DD_Monday_Briefing.md`
  - Outputs: Revenue, Bottlenecks, Subscription Audit, Upcoming Deadlines, Proactive Suggestions
- [ ] Wire `scheduler.py` Monday 08:00 trigger to call `ceo_briefing` skill via `claude -p`
- [ ] Test end-to-end with sample data

#### Step G2 — Ralph Wiggum Persistence Loop
- [ ] Add Stop hook to `~/.claude/settings.json`:
  ```json
  {
    "hooks": {
      "Stop": [{
        "matcher": "",
        "hooks": [{"type": "command", "command": "python watchers/ralph_wiggum.py"}]
      }]
    }
  }
  ```
- [ ] Create `watchers/ralph_wiggum.py`:
  - Check if task state file exists in `/Done/`
  - If NOT done → re-inject prompt, block exit
  - If done → allow exit
  - Max iterations: 10 (configurable via `.env`)
- [ ] Test with a multi-step WhatsApp task requiring 3+ agent iterations

#### Step G3 — Additional MCP Servers
- [ ] **Calendar MCP**: Create `watchers/calendar_mcp.py` (Google Calendar API)
  - Endpoints: `POST /create-event`, `GET /upcoming-events`
  - Add to `CLAUDE.md` as new skill trigger
- [ ] **Browser MCP**: Configure `@anthropic/browser-mcp` in `.mcp.json`
  - Use for payment portal automation (draft-only, HITL required)
- [ ] Update `.claude/settings.json` MCP config with new servers

#### Step G4 — Social Media Expansion
- [ ] **Facebook/Instagram** Agent Skill (`.claude/skills/facebook_poster/skill.md`):
  - Uses `meta_graph_mcp.py` or Playwright fallback
  - Same approval workflow as LinkedIn
  - Deduplication: check last 7 days of topics
- [ ] **Twitter/X** Agent Skill (`.claude/skills/twitter_poster/skill.md`):
  - Uses X API v2 (`tweepy`) or Playwright
  - Character limit awareness (280 chars)
  - Same PLAN + Pending_Approval + Approved pipeline
- [ ] Add daily/weekly social post scheduling to `scheduler.py`
- [ ] Create `vault/AI_Employee_Vault/Social_Media_Log.md` for cross-platform tracking

#### Step G5 — Odoo Community Integration
- [ ] Deploy Odoo Community 19+ locally (Docker recommended)
- [ ] Configure `mcp-odoo-adv` MCP server pointing at local Odoo instance
- [ ] Create `odoo_handler` Agent Skill:
  - Draft invoices, create customers, log transactions
  - ALL financial writes require `Pending_Approval` → human approval → `Approved`
- [ ] Add Odoo summary to Monday CEO Briefing skill
- [ ] Document JSON-RPC API endpoints used

#### Step G6 — Enhanced Error Recovery
- [ ] Add `/Failed/` folder handling to all watchers with 3-retry policy (already partially done for email)
- [ ] Implement exponential backoff in `task_processor.py` for Claude API failures
- [ ] Add dead-letter queue: tasks that fail 3 times → `Failed/` + alert in `Dashboard.md`
- [ ] Test graceful degradation: kill MCP server while email is queued — verify queue behavior
- [ ] Add structured JSON audit log in `/Logs/YYYY-MM-DD.json` (supplement existing `.md` logs)

---

## Tier 4: Platinum — Always-On Cloud FTE (FUTURE)

**Target:** 60+ hours | **Status:** Not Started

| Feature | Description |
|---|---|
| Cloud VM (Oracle/AWS free tier) | Run watchers + task_processor 24/7 |
| Work-Zone Specialization | Cloud: email triage, draft replies, social drafts. Local: approvals, WhatsApp, payments |
| Vault sync via Git | `/Needs_Action/`, `/Plans/`, `/Pending_Approval/` synced between Cloud and Local |
| Claim-by-move rule | First agent to move task to `/In_Progress/<agent>/` owns it |
| Secrets isolation | `.env`, tokens, WhatsApp sessions NEVER sync to Cloud |
| Odoo on Cloud VM | HTTPS + backups + health monitoring + MCP integration |
| A2A Upgrade (Phase 2) | Direct agent-to-agent messages, vault as audit record |
| Platinum Demo Gate | Email arrives while Local offline → Cloud drafts → Local approves → MCP sends |

### Platinum Action Steps (High Level)
- [ ] Provision Oracle Cloud Free VM (Ubuntu 22.04 LTS, 4 OCPU, 24GB RAM)
- [ ] Deploy `gmail_watcher.py` + `task_processor.py` + `scheduler.py` on Cloud VM
- [ ] Set up Git-based vault sync (GitHub private repo + `git pull/push` hooks)
- [ ] Configure Cloud-only skills (email triage, social drafts — NO send/post permissions)
- [ ] Deploy Odoo Community on Cloud VM with HTTPS (`nginx` + Let's Encrypt)
- [ ] Wire Odoo MCP to Cloud agent (draft-only: no `POST /invoices/post` without Local approval)
- [ ] Test offline scenario: Local machine off → Cloud drafts → vault syncs → Local approves → MCP sends

---

## Current Architecture (Silver — Fully Running)

```
┌─────────────────────────────────────────────────────────┐
│               EXTERNAL SOURCES                          │
│   Gmail (OAuth)  │  WhatsApp (wwebjs)  │  Scheduler     │
└────────┬─────────┴─────────┬───────────┴──────┬─────────┘
         ↓                   ↓                  ↓
┌─────────────────────────────────────────────────────────┐
│               PERCEPTION LAYER (Watchers)               │
│  gmail_watcher.py │ whatsapp_watcher.py │ scheduler.py  │
│  run_watcher.py   │ whatsapp_inbox_watcher.py           │
│       main.py (supervisor — auto-restarts all above)    │
└───────────────────────────┬─────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│          OBSIDIAN VAULT (Local Markdown State)          │
│  Inbox/ → Needs_Action/ → Plans/ → Pending_Approval/   │
│  Approved/ → Done/    Logs/    Dashboard.md             │
└───────────────────────────┬─────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              REASONING LAYER (Claude Code)              │
│  task_processor.py → calls `claude -p` headlessly       │
│  Skills: gmail_handler, whatsapp_handler,               │
│          generate_plan, linkedin_post_creator           │
└──────────────┬────────────────────────────┬─────────────┘
               ↓                            ↓
┌──────────────────────────┐  ┌─────────────────────────────┐
│  HUMAN-IN-THE-LOOP       │  │       ACTION LAYER          │
│  pending_approval_watcher│  │  approved_watcher.py        │
│  Windows Yes/No dialog   │→ │  send_email skill (MCP)     │
│  Obsidian for LinkedIn   │  │  linkedin_executor.py       │
└──────────────────────────┘  │  (Playwright browser auto)  │
                              └─────────────────────────────┘
```

---

## Tech Stack

| Component | Tool | Status |
|---|---|---|
| Reasoning Engine | Claude Code (`claude-sonnet-4-6`) | Active |
| Knowledge Base / GUI | Obsidian (local Markdown vault) | Active |
| Watchers (Perception) | Python 3.13 + Node.js v24 | Active (12 scripts) |
| Email MCP | FastAPI (`mcp_server.py`) on port 8001 | Active |
| Browser Automation | Playwright (Python + Node.js) | Active (LinkedIn) |
| Process Supervision | `main.py` custom supervisor | Active |
| WhatsApp | `whatsapp-web.js` (Node.js) | Active |
| Package Manager | `uv` (Python), `npm` (Node.js) | Active |
| Version Control | Git + GitHub Desktop | Active |
| Secrets | `.env` file (gitignored) | Active |

**Planned (Gold):**
| Odoo ERP | Odoo Community 19+ | Not started |
| Calendar | Google Calendar API | Not started |
| Social (FB/IG/X) | Meta Graph API / X API v2 | Not started |

---

## Security Architecture

| Category | Implementation | Status |
|---|---|---|
| Credential storage | `.env` file, never in vault, gitignored | ✅ |
| MCP API authentication | `X-API-Key` with `hmac.compare_digest` | ✅ |
| Rate limiting | 5 failed attempts/60s per IP | ✅ |
| Email validation | Regex + field length limits | ✅ |
| Header injection protection | Newline stripping on all fields | ✅ |
| HITL for sensitive actions | All emails/payments require approval file | ✅ |
| Audit logging | Daily `log_YYYY-MM-DD.md` + `Dashboard.md` | ✅ |
| Path traversal protection | Vault path validation in watchers | ✅ |
| Process isolation | PID lock prevents duplicate watchers | ✅ |
| Secrets never sync | `.gitignore` covers `.env`, `token.json`, sessions | ✅ |

---

## Judging Criteria — Self-Assessment

| Criterion | Weight | Current Score | Notes |
|---|---|---|---|
| Functionality | 30% | 28/30 | Gmail + WhatsApp + LinkedIn + MCP fully working |
| Innovation | 25% | 20/25 | File-based HITL, Windows dialog approval, vault-first |
| Practicality | 20% | 18/20 | Runs 24/7, real emails sent, real LinkedIn posts published |
| Security | 15% | 14/15 | MCP auth, HITL, audit logs, secrets management |
| Documentation | 10% | 9/10 | README.md (20KB), CLAUDE.md, skills documented |
| **Total** | 100% | **89/100** | **Solid Silver → approaching Gold** |

---

## Submission Checklist

- [ ] GitHub repository (public or private with judge access)
- [ ] README.md with setup instructions and architecture overview
- [ ] Demo video (5–10 minutes) showing key features:
  - [ ] Gmail email arrives → task created → plan generated → Windows approval dialog → email sent
  - [ ] WhatsApp message → task → plan → approval → reply sent
  - [ ] LinkedIn post scheduled → generated → approved via Obsidian → published via Playwright
  - [ ] Dashboard.md showing live activity feed
- [ ] Security disclosure: `.env` structure, `hmac` auth, gitignore
- [ ] Tier declaration: **Silver** (with Gold in progress)
- [ ] Submit form: https://forms.gle/JR9T1SJq5rmQyGkGA

---

## Resources

| Topic | URL |
|---|---|
| Claude Code Fundamentals | https://agentfactory.panaversity.org/docs/AI-Tool-Landscape/claude-code-features-and-workflows |
| Agent Skills Docs | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| MCP Introduction | https://modelcontextprotocol.io/introduction |
| Ralph Wiggum Pattern | https://github.com/anthropics/claude-code/tree/main/.claude/plugins/ralph-wiggum |
| Odoo JSON-RPC API | https://www.odoo.com/documentation/19.0/developer/reference/external_api.html |
| mcp-odoo-adv | https://github.com/AlanOgic/mcp-odoo-adv |
| Research Meeting (Zoom) | https://us06web.zoom.us/j/87188707642 — Every Wednesday 10:00 PM |
| Panaversity YouTube | https://www.youtube.com/@panaversity |
| Cloud FTE Architecture | https://docs.google.com/document/d/15GuwZwIOQy_g1XsIJjQsFNHCTQTWoXQhWGVMhiH0swc/edit |

---

## Key Design Decisions

1. **Vault-first state machine** — Every task is a file. State changes are folder moves. No database needed.
2. **Approval via file movement** — HITL is implemented by watching `/Approved/` instead of in-process callbacks.
3. **Skills as instruction files** — All Claude logic lives in `.claude/skills/*.md`, not in Python.
4. **Headless Claude invocation** — Watchers call `claude -p "<skill prompt>"` as a subprocess — no interactive session required.
5. **FileLock on shared resources** — `Dashboard.md` and log files use `filelock` to prevent race conditions from concurrent watchers.
6. **Process supervision without PM2** — `main.py` implements a custom supervisor loop with PID tracking and auto-restart, avoiding Node.js dependency for Python processes.

---

*Generated: 2026-03-30 | Architecture: Silver Tier Complete → Gold Tier Next*
