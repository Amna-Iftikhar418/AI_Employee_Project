# Skill: browser_handler

## Purpose
Automate web portal interactions — navigate to a URL, fill forms, read page data,
and capture screenshots. Designed for payment portals, client dashboards, and
any web task that requires browser automation.

## MCP Server
- Name: `browser`
- Tools: `browser_navigate`, `browser_get_content`, `browser_click`,
  `browser_fill_field`, `browser_screenshot`, `browser_check_element`,
  `browser_get_text`, `browser_select_option`, `browser_close_session`

## CRITICAL: HITL Rules
- **NEVER submit a payment form** without a corresponding file in `Approved/browser/`
- **NEVER enter credentials** unless the task file explicitly includes them (approved)
- All portal write actions (form submit, payment confirm, data entry) must flow through:
  `Pending_Approval/browser/` → human approves → `Approved/browser/` → execute
- Read-only actions (navigate, screenshot, read content) do NOT require approval

## Trigger Conditions
- A `TASK_browser_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/browser/`
- A file appears in `vault/AI_Employee_Vault/Approved/browser/`
- User explicitly asks to open a website, fill a form, or automate a portal

## Workflow

### Read-only tasks (no approval needed)
```
TASK file in Needs_Action/browser/
  → navigate to URL
  → read content / take screenshot
  → write result to Plans/browser/
  → update Dashboard.md and Logs/
  → move task to Done/browser/
```

### Write tasks (form fill / payment)
```
TASK file in Needs_Action/browser/
  → generate PLAN_browser_*.md in Plans/browser/
  → write approval request to Pending_Approval/browser/
  → STOP and wait for human

File moved to Approved/browser/
  → read PLAN for URL, selectors, values
  → navigate → fill fields → screenshot before submit
  → submit only if Approved/ file is present
  → screenshot after submit
  → update Dashboard.md and Logs/
  → move to Done/browser/
```

## Step-by-Step Execution

### 1. Read the task file
```
vault/AI_Employee_Vault/Needs_Action/browser/TASK_browser_*.md
```
Extract: `url`, `action`, `fields` (dict of selector → value), `requires_approval`

### 2. For write actions — create PLAN and route to Pending_Approval
```markdown
---
type: browser_task
url: <url>
action: <fill_form | submit_payment | read_data>
fields:
  - selector: <css_selector>
    value: <value>
requires_approval: true
status: pending
---

## Objective
<what needs to be done on the portal>

## Proposed Actions
1. Navigate to <url>
2. Fill <field> with <value>
3. [If payment] Submit — REQUIRES HUMAN APPROVAL
4. Screenshot before and after

## Approval Required
Move this file to Approved/browser/ to proceed.
```

### 3. Execute (after approval for write tasks)
```python
# Navigate
browser_navigate(url=task["url"])

# Fill fields (if any)
for field in task.get("fields", []):
    browser_fill_field(selector=field["selector"], value=field["value"])

# Screenshot before submit
browser_screenshot(filename=f"before_{task_id}")

# Click submit (only if approved)
browser_click(selector=task.get("submit_selector", ""))

# Screenshot after
browser_screenshot(filename=f"after_{task_id}")

# Close when done
browser_close_session()
```

### 4. Update Dashboard and Logs
Append to `vault/AI_Employee_Vault/Dashboard.md`:
```
- [HH:MM] Browser: <action> on <url> — <success/failed>
```

Append to `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md`:
```
[HH:MM] [browser] <action> on <url> | result: <success/failed> | screenshots: before_<id>.png, after_<id>.png
```

### 5. Move files
```
Needs_Action/browser/TASK_*.md  →  Done/browser/TASK_*.md
Plans/browser/PLAN_*.md         →  Done/browser/PLAN_*.md
Approved/browser/TASK_*.md      →  Done/browser/TASK_*.md
```

## Setup (first time only)
After `uv run watchers/main.py` installs browser_mcp, install the Chromium binary:
```bash
uv --directory mcp_servers/browser_mcp run playwright install chromium
```

## Environment Variables
| Variable          | Default | Description                              |
|-------------------|---------|------------------------------------------|
| BROWSER_HEADLESS  | true    | Set to "false" to show browser window    |
| BROWSER_TIMEOUT   | 30000   | Page/element timeout in milliseconds     |
| VAULT_ROOT        | auto    | Override vault root path                 |

## Error Handling
- Navigation timeout → log error, do NOT retry automatically, alert human
- Element not found → log error, take screenshot of current state, move to Rejected/
- Payment submission fails → log error, do NOT retry, require fresh human approval
