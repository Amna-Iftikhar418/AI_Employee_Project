tell me what this whole project does in steps                                                                                                                 

● Here's what the AI Employee system does, end to end:
                                                                                                                                             
  ---
  What It Is

  An autonomous AI assistant that acts like a human employee — it monitors your communications, processes requests, gets your approval before acting, then
  executes tasks automatically.

  ---
  How It Works — Step by Step

  1. Perception (Watching for input)

  Background watchers run 24/7 and listen for incoming work:
  - Gmail watcher — polls your inbox every few minutes
  - WhatsApp watcher — monitors a WhatsApp session via a headless Chrome browser
  - When a message arrives, it writes a structured TASK_*.md file into vault/AI_Employee_Vault/Inbox/

  2. Triage (Moving to action queue)

  The inbox watcher picks up new task files and moves them to Needs_Action/ under the right category (email/, whatsapp/, odoo/, social/, browser/)

  3. Planning (Claude reads and plans)

  Claude Code (running autonomously via claude -p) reads the task file and invokes the appropriate skill:
  - Writes a PLAN_*.md describing exactly what it intends to do
  - Routes the plan to Pending_Approval/ and stops

  4. Human Approval (You decide)

  A dialog box pops up showing the plan. You click Yes or No:
  - Yes → file moves to Approved/
  - No → file moves to Rejected/

  5. Execution (Claude acts)

  The approved watcher detects the file in Approved/ and triggers the action:
  - Email → sends via Gmail API through the Email MCP server
  - LinkedIn → opens LinkedIn in a browser via Playwright MCP and publishes the post
  - Facebook/Instagram → calls Meta Graph API via Social MCP
  - Odoo → creates/reads invoices via Odoo MCP (XML-RPC)
  - Browser tasks → navigates web portals, fills forms, takes screenshots via Browser MCP

  6. Logging & Cleanup

  After every action:
  - Result appended to vault/AI_Employee_Vault/Dashboard.md (unified activity feed)
  - Entry written to vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md (human-readable)
  - JSON audit entry written to Logs/YYYY-MM-DD.json (machine-readable)
  - Task file moved to Done/

  7. Scheduled Tasks (Autonomous triggers)

  The scheduler fires automatically without any message needed:
  - Daily at 09:00 → Claude generates a LinkedIn post and asks for approval
  - Every Monday at 08:00 → Claude reads business goals + Odoo revenue data and writes a CEO briefing to Briefings/

  8. Error Recovery

  If anything crashes:
  - The watchdog (main.py) detects the dead process and restarts it
  - Gmail API failures queue failed emails and retry next cycle
  - Auth token expiry pauses Gmail calls for 30 min and alerts you
  - All external calls use exponential backoff (3 attempts max)

  ---
  The Safety Rule (HITL)

  Claude never sends, posts, pays, or submits anything without a file in Approved/. Every write action goes through the Pending_Approval/ → human click →
  Approved/ gate. Read-only actions (navigate, read page, screenshot) run without approval.

  ---

  The scheduler fires automatically without any message needed:
  - Daily at 09:00 → Claude generates a LinkedIn post and asks for approval
  - Every Monday at 08:00 → Claude reads business goals + Odoo revenue data and writes a CEO briefing to Briefings/

  8. Error Recovery

  If anything crashes:
  - The watchdog (main.py) detects the dead process and restarts it
  - Gmail API failures queue failed emails and retry next cycle
  - Auth token expiry pauses Gmail calls for 30 min and alerts you
  - All external calls use exponential backoff (3 attempts max)

  ---
  The Safety Rule (HITL)

  Claude never sends, posts, pays, or submits anything without a file in Approved/. Every write action goes through the Pending_Approval/ → human click →
  Approved/ gate. Read-only actions (navigate, read page, screenshot) run without approval.

  ---
  The 4 MCP Servers (Claude's "hands")

  ┌─────────────┬─────────────────────────────────────────────────────────────────────┐
  │   Server    │                            What it does                             │
  ├─────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Email MCP   │ Sends emails via Gmail API                                          │
  ├─────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Odoo MCP    │ Reads/creates invoices in your accounting system                    │
  ├─────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Social MCP  │ Posts to Facebook + Instagram via Meta Graph API                    │
  ├─────────────┼─────────────────────────────────────────────────────────────────────┤
  │ Browser MCP │ Controls a real browser — navigates, fills forms, takes screenshots │
  └─────────────┴─────────────────────────────────────────────────────────────────────┘