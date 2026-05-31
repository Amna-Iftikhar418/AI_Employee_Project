# AI Employee Project

An autonomous AI Employee that monitors Gmail and WhatsApp, processes incoming
messages, creates structured plans, routes tasks through a human-approval workflow,
sends emails, publishes LinkedIn and social media posts, and manages Odoo accounting.

See also: [Architecture](docs/architecture.md) · [Lessons Learned](docs/lessons_learned.md)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Install via [uv](https://github.com/astral-sh/uv) |
| uv | latest | `pip install uv` or `winget install astral-sh.uv` |
| Node.js | 18+ | Required for Playwright MCP (LinkedIn automation) |
| Claude Code CLI | latest | `npm install -g @anthropic-ai/claude-code` |
| Git | any | For cloning and version control |

**External services required:**

| Service | Purpose | How to obtain |
|---------|---------|---------------|
| Google Cloud project | Gmail API | [console.cloud.google.com](https://console.cloud.google.com) → enable Gmail API → download `credentials.json` |
| Meta Developer App | Facebook & Instagram | [developers.facebook.com](https://developers.facebook.com) → create app → add `pages_manage_posts`, `instagram_content_publish` permissions → generate long-lived Page Access Token |
| Odoo Community | Accounting | Self-hosted on port 8069. Install via `python odoo/odoo-bin -c odoo.conf` or Docker |
| Anthropic API key | Claude Code | [console.anthropic.com](https://console.anthropic.com) → create API key → `claude auth login` |

---

## Setup

### 1. Clone and install dependencies

```powershell
git clone <repo-url>
cd AI_Employee_Project
uv sync
npm install
```

### 2. Configure environment variables

```powershell
copy .env.example .env
# Edit .env and fill in all values (see .env.example for field descriptions)
```

**Required values in `.env`:**
- `MCP_API_KEY` — generate with: `python -c "import secrets; print(secrets.token_hex(32))"`
- `GMAIL_CREDENTIALS_PATH` — path to `credentials.json` from Google Cloud Console
- `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID` — from Facebook Developer portal
- `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` — your local Odoo instance
- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/botfather) on Telegram (for alerts)

### 3. Authenticate Gmail (first time only)

```powershell
uv run watchers/gmail_watcher.py
```

Follow the OAuth prompt in your browser. A `token.json` file will be saved in the
project root. This step is required only once; the token auto-refreshes after that.

### 4. Authenticate Claude Code (first time only)

```powershell
claude auth login
```

### 5. Start Odoo (if using accounting features)

```powershell
python odoo/odoo-bin -c odoo.conf
# Odoo must be running on port 8069 before the Odoo MCP can connect
```

### 6. Start the AI Employee

```powershell
uv run watchers/main.py
```

---

## How to Start

```powershell
uv run watchers/main.py
```

This single command starts **all** components:

| Component | Description |
|-----------|-------------|
| `mcp_server.py` | Email MCP server (port 8001) |
| `gmail_watcher.py` | Polls Gmail for new messages |
| `whatsapp_watcher.py` | Monitors WhatsApp via WhatsApp Web |
| `whatsapp_inbox_watcher.py` | Processes WhatsApp inbox files |
| `run_watcher.py` | Monitors for new task files |
| `task_processor.py` | Processes Needs_Action tasks |
| `approved_watcher.py` | Executes approved tasks |
| `pending_approval_watcher.py` | Prompts human for approval |
| `scheduler.py` | Daily LinkedIn posts, weekly briefings |

---

## MCP Servers

The system uses three MCP (Model Context Protocol) servers:

### 1. Email MCP

| Property | Value |
|----------|-------|
| **Name** | Email MCP |
| **Transport** | HTTP (FastAPI + uvicorn) |
| **Port** | `8001` |
| **Purpose** | Send emails via Gmail API on behalf of the AI Employee |
| **Entry point** | `mcp_server.py` |
| **Endpoint** | `POST http://localhost:8001/send-email` |
| **Health check** | `GET http://localhost:8001/health` |

**How to start manually:**
```powershell
uv run mcp_server.py
```

**Required env vars:**
```
MCP_API_KEY=<strong random key>
GMAIL_TOKEN_PATH=token.json
GMAIL_CREDENTIALS_PATH=credentials.json
```

**Auto-start:** Started automatically by `watchers/main.py`. Restarted automatically
if it crashes (via `_watch_loop`). Port 8001 is freed at startup if anything else is using it.
The launcher polls `/health` for up to 30 seconds before proceeding.

---

### 2. Odoo MCP

| Property | Value |
|----------|-------|
| **Name** | Odoo MCP |
| **Transport** | stdio (MCP protocol) |
| **Port** | N/A — communicates over stdin/stdout |
| **Purpose** | Read invoices, create draft invoices, query account balances, draft payments in Odoo Community |
| **Entry point** | `mcp_servers/odoo_mcp/` |
| **Config** | `.mcp.json` → `"odoo"` server block |

**How to start manually:**
```powershell
uv --directory mcp_servers/odoo_mcp run odoo-mcp
```

**Required env vars:**
```
ODOO_URL=http://localhost:8069
ODOO_DB=odoo
ODOO_USERNAME=admin
ODOO_PASSWORD=admin
ODOO_API_VERSION=json-rpc
```

**Auto-start:** Claude Code starts this server automatically when you open the project,
via the `"odoo"` entry in `.mcp.json`. No manual start needed during normal use.

> **Note:** Odoo Community must be running on port 8069 before the MCP can connect.
> Start Odoo with: `python odoo/odoo-bin -c odoo.conf`

---

### 3. Social MCP

| Property | Value |
|----------|-------|
| **Name** | Social MCP |
| **Transport** | stdio (MCP protocol) |
| **Port** | N/A — communicates over stdin/stdout |
| **Purpose** | Post to Facebook Pages and Instagram via Meta Graph API |
| **Entry point** | `mcp_servers/social_mcp/` |
| **Config** | `.mcp.json` → `"social"` server block |

**How to start manually:**
```powershell
uv --directory mcp_servers/social_mcp run social-mcp
```

**Required env vars:**
```
META_PAGE_ACCESS_TOKEN=<long-lived page access token>
META_PAGE_ID=<numeric page id>
META_IG_USER_ID=<instagram business user id>
META_GRAPH_API_VERSION=v21.0
```

**Auto-start:** Claude Code starts this server automatically via the `"social"` entry
in `.mcp.json`. No manual start needed during normal use.

---

## Vault Folder Structure

```
vault/AI_Employee_Vault/
├── Inbox/
│   ├── email/          <- Raw incoming emails
│   └── whatsapp/       <- Raw incoming WhatsApp messages
├── Needs_Action/
│   ├── email/          <- Tasks awaiting AI processing
│   ├── whatsapp/       <- WhatsApp tasks awaiting processing
│   ├── odoo/           <- Odoo tasks awaiting processing
│   └── social/         <- Social media tasks
├── Plans/              <- PLAN_*.md files (one per task)
├── Pending_Approval/
│   ├── email/          <- Drafts awaiting human approval
│   ├── linkedin/       <- LinkedIn posts awaiting approval
│   ├── social/         <- Facebook/Instagram posts awaiting approval
│   └── odoo/           <- Odoo actions awaiting approval
├── Approved/           <- Human-approved tasks ready to execute
├── Rejected/           <- Human-rejected tasks
├── Done/               <- Completed tasks (archived)
├── Logs/               <- Daily log files (log_YYYY-MM-DD.md)
└── Dashboard.md        <- Live status dashboard
```

---

## Human-in-the-Loop (HITL) Approval

Every AI action goes through human approval before execution:

```
Inbox -> Needs_Action -> [AI creates Plan] -> Pending_Approval
                                                     |
                                           Human reviews (Y/N)
                                                     |
                              Approved/ -> Execute -> Done/
                              Rejected/ -> Archive
```

`pending_approval_watcher.py` prompts you in the terminal for each pending task.
Press `Y` to approve, `N` to reject.

**Rules that are never bypassed:**
- Emails are never sent without a file in `Approved/email/`
- LinkedIn posts are never published without a file in `Approved/linkedin/`
- Facebook/Instagram posts are never published without a file in `Approved/social/`
- Odoo invoices/payments are never posted without a file in `Approved/odoo/`

---

## Agent Skills

All AI logic lives in `.claude/skills/`. Skills are invoked by Claude Code:

| Skill | Trigger |
|-------|---------|
| `gmail_handler` | New `TASK_*.md` in `Needs_Action/email/` |
| `whatsapp_handler` | New `TASK_*.md` in `Needs_Action/whatsapp/` |
| `odoo_handler` | New `TASK_odoo_*.md` in `Needs_Action/odoo/` or `Approved/odoo/` |
| `facebook_instagram_poster` | User request or `SOCIAL_POST_*.md` in `Needs_Action/social/` |
| `linkedin_post_creator` | User request or daily scheduler (09:00) |
| `linkedin_publisher` | Approved LinkedIn post — publishes via Playwright MCP |
| `send_email` | Approved email task in `Approved/email/` |
| `process_approved` | Any non-LinkedIn task in `Approved/` |
| `generate_plan` | Any task needing a structured PLAN file |
| `weekly_audit` | Every Monday 08:00 or manual CEO briefing request |

---

## Troubleshooting

### "Another instance is already running"
A stale PID lock exists. Delete `.ai_employee.pid` in the project root, then restart:
```powershell
Remove-Item .ai_employee.pid -ErrorAction SilentlyContinue
uv run watchers/main.py
```

### "Port 8001 is in use"
`main.py` auto-kills the holding process on startup. If it still fails, free it manually:
```powershell
netstat -ano | findstr :8001
taskkill /F /PID <PID>
```

### Gmail watcher not picking up emails
1. Check `token.json` exists — if missing, re-run `uv run watchers/gmail_watcher.py` to re-authenticate.
2. Check `vault/AI_Employee_Vault/Logs/log_<today>.md` for `[AuthError]` entries.
3. Verify `GMAIL_CREDENTIALS_PATH` and `GMAIL_TOKEN_PATH` in `.env` point to the right files.

### OneDrive permission errors
Move the project out of OneDrive-synced folders:
```powershell
xcopy /E /I /H /Y "C:\Users\<you>\OneDrive\AI_Employee_Project" "C:\AI_Employee_Project"
cd C:\AI_Employee_Project
uv run watchers/main.py
```

### Odoo MCP not connecting
1. Confirm Odoo is running: open [http://localhost:8069](http://localhost:8069) in browser.
2. Verify `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` in `.env`.
3. Restart Claude Code to reload the MCP server from `.mcp.json`.

### Facebook/Instagram posts not publishing
1. Check `META_PAGE_ACCESS_TOKEN` is still valid (tokens expire after 60 days).
2. Regenerate at [developers.facebook.com](https://developers.facebook.com) → your app → Access Token Tool.
3. Confirm `META_PAGE_ID` and `META_IG_USER_ID` match your page/account.

---

## Further Reading

- [Architecture](docs/architecture.md) — component diagram, data flow, domain-specific pipelines
- [Lessons Learned](docs/lessons_learned.md) — what worked, what was hard, what to do differently
