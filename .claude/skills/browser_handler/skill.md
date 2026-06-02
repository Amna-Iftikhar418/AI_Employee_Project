# Skill: browser_handler

## Purpose
Automate web portal interactions — navigate to a URL, fill forms, read page data,
and capture screenshots. Designed for payment portals, client dashboards, and
any web task that requires browser automation.

## MCP Server
- Name: `browser`
- Tools (grouped):
  - **Navigation:** `browser_navigate` (open a URL), `browser_back` (go back),
    `browser_forward` (go forward), `browser_reload` (reload current page),
    `browser_wait_for` (wait for a selector/state before continuing)
  - **Reading:** `browser_get_content` (full page text/HTML), `browser_get_text`
    (text of one element), `browser_get_attribute` (read an attribute of an element),
    `browser_get_links` (collect links on the page), `browser_check_element`
    (test whether an element exists/is visible), `browser_screenshot` (capture image)
  - **Interaction:** `browser_click` (click an element), `browser_hover` (hover an
    element), `browser_scroll` (scroll the page/element), `browser_press_key`
    (send a keyboard key), `browser_evaluate` (run JS in page context)
  - **Forms:** `browser_fill_field` (set an input's value in one shot),
    `browser_type` (type text key-by-key into a field), `browser_select_option`
    (choose a `<select>` option), `browser_set_checkbox` (check/uncheck a box),
    `browser_upload_file` (attach a file to a file input)
  - **Tabs & dialogs:** `browser_list_tabs` (enumerate open tabs),
    `browser_switch_tab` (focus a tab), `browser_new_tab` (open a tab),
    `browser_handle_dialog` (accept/dismiss alert/confirm/prompt dialogs)
  - **Session:** `browser_close_session` (close the browser and free resources)

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

## Full Capability Reference
The `browser` MCP server exposes a complete real-browser surface (JavaScript runs;
this is NOT a static HTML fetcher). Use the right tool for the job:

| Tool                    | Purpose                                          | Key args                          |
|-------------------------|--------------------------------------------------|-----------------------------------|
| `browser_navigate`      | Open a URL                                        | `url`                             |
| `browser_back`          | Navigate back in history                          | —                                 |
| `browser_forward`       | Navigate forward in history                       | —                                 |
| `browser_reload`        | Reload the current page                           | —                                 |
| `browser_wait_for`      | Wait for a selector/state before continuing       | `selector`, `state`, `timeout`    |
| `browser_get_content`   | Get full page text/HTML                           | —                                 |
| `browser_get_text`      | Get text of a single element                      | `selector`                        |
| `browser_get_attribute` | Read an attribute value of an element             | `selector`, `attribute`           |
| `browser_get_links`     | Collect links (href/text) on the page             | `selector` (optional)             |
| `browser_check_element` | Test if an element exists / is visible            | `selector`                        |
| `browser_screenshot`    | Capture a screenshot                              | `filename`, `selector` (optional) |
| `browser_click`         | Click an element                                  | `selector`                        |
| `browser_hover`         | Hover over an element                             | `selector`                        |
| `browser_scroll`        | Scroll the page or an element                     | `selector`/`x`/`y`                |
| `browser_press_key`     | Send a single keyboard key                        | `key`, `selector` (optional)      |
| `browser_evaluate`      | Run JavaScript in the page context                | `script`                          |
| `browser_fill_field`    | Set an input's value in one shot                  | `selector`, `value`               |
| `browser_type`          | Type text key-by-key into a field                 | `selector`, `text`                |
| `browser_select_option` | Choose an option in a `<select>`                  | `selector`, `value`               |
| `browser_set_checkbox`  | Check or uncheck a checkbox                        | `selector`, `checked`             |
| `browser_upload_file`   | Attach a file to a file input                     | `selector`, `path`                |
| `browser_handle_dialog` | Accept/dismiss alert/confirm/prompt dialogs       | `action`, `text` (optional)       |
| `browser_list_tabs`     | Enumerate open tabs                               | —                                 |
| `browser_switch_tab`    | Focus a specific tab                              | `index`/`id`                      |
| `browser_new_tab`       | Open a new tab                                     | `url` (optional)                  |
| `browser_close_session` | Close the browser and free resources              | —                                 |

Notes:
- Prefer `browser_fill_field` for simple value-setting; use `browser_type` when the
  page needs per-keystroke input events (autocomplete, validation-on-keyup).
- `browser_evaluate` runs arbitrary JS — never use it to bypass the HITL/approval
  rules above (no submitting payment forms or destructive actions without an
  `Approved/browser/` file).
