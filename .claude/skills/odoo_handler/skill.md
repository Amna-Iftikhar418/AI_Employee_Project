# Skill: odoo_handler

## Purpose
Perform Odoo accounting actions via the Odoo MCP server. All write/payment actions require a file in `Approved/odoo/` — never auto-post invoices or payments.

## When to Invoke
- A `TASK_odoo_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/odoo/`
- User requests an accounting action: read invoices, create draft invoice, log transaction, query balance, draft payment
- `approved_watcher.py` detects a file in `Approved/odoo/` and routes it here

## MCP Server
- **Server name:** `odoo` (registered in `.mcp.json`)
- **Transport:** STDIO — started automatically by Claude Code
- **Tools:** `execute_method`, `batch_execute`
- **Odoo URL:** `http://localhost:8069`

---

## Actions

### ACTION-1: Read Invoices
Query existing invoices from Odoo.

```
Tool: mcp__odoo__execute_method
  model: "account.move"
  method: "search_read"
  args_json: '[[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "!=", "cancel"]]]'
  kwargs_json: '{"fields": ["name", "partner_id", "amount_total", "state", "invoice_date", "invoice_date_due"], "limit": 50}'
```

After reading:
- Write results summary to `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md`
- Append to `Dashboard.md`: `- [odoo] Invoices read: N records — YYYY-MM-DD`

---

### ACTION-2: Create Draft Invoice

**HITL required** — always write to `Pending_Approval/odoo/` first.

**Step 1 — Create plan file:**
```
vault/AI_Employee_Vault/Plans/odoo/PLAN_ODOO_INVOICE_{TIMESTAMP}.md
```
Frontmatter:
```yaml
---
type: odoo_task
action: create_invoice
partner_name: <customer name>
partner_email: <email>
amount: <amount>
product: <product/service>
created: <ISO timestamp>
status: pending
---
```

**Step 2 — Write task to Pending_Approval:**
```
vault/AI_Employee_Vault/Pending_Approval/odoo/TASK_odoo_invoice_{TIMESTAMP}.md
```
Include: partner info, line items, amount, due date, proposed action.

**Step 3 — On approval (file moves to Approved/odoo/):**
```
Tool: mcp__odoo__execute_method
  model: "account.move"
  method: "create"
  args_json: '[{"move_type": "out_invoice", "partner_id": <id>, "invoice_line_ids": [[0, 0, {"product_id": <id>, "quantity": 1, "price_unit": <amount>}]], "invoice_date": "<YYYY-MM-DD>"}]'
```
**Never call `action_post`** — leave invoice in draft state.

**Step 4 — Log and move to Done:**
- Append to log: `[odoo] Draft invoice created: {invoice_name} for {partner} — $X — YYYY-MM-DD`
- Move task file to `Done/odoo/`

---

### ACTION-3: Log a Transaction
Record a journal entry (informational only — no auto-posting).

```
Tool: mcp__odoo__execute_method
  model: "account.move"
  method: "create"
  args_json: '[{"move_type": "entry", "journal_id": <journal_id>, "line_ids": [[0, 0, {"account_id": <debit_account>, "debit": <amount>, "credit": 0, "name": "<description>"}], [0, 0, {"account_id": <credit_account>, "debit": 0, "credit": <amount>, "name": "<description>"}]]}]'
```

Always requires a file in `Approved/odoo/` before executing.

---

### ACTION-4: Query Account Balance
Read account balances from the chart of accounts.

```
Tool: mcp__odoo__execute_method
  model: "account.account"
  method: "search_read"
  args_json: '[[["deprecated", "=", false]]]'
  kwargs_json: '{"fields": ["code", "name", "account_type", "current_balance"], "limit": 100}'
```

Write a summary to the log. No approval required for read actions.

---

### ACTION-5: Draft Payment
Create a payment record in draft state. **Never confirm/validate automatically.**

**HITL required** — always route through `Pending_Approval/odoo/` first.

```
Tool: mcp__odoo__execute_method
  model: "account.payment"
  method: "create"
  args_json: '[{"payment_type": "outbound", "partner_type": "supplier", "partner_id": <id>, "amount": <amount>, "currency_id": <currency_id>, "journal_id": <journal_id>, "date": "<YYYY-MM-DD>", "memo": "<description>"}]'
```

**Never call `action_post` on a payment.** The human must confirm in Odoo UI.

---

## Permission Boundaries

| Action | Auto-execute | Requires Approval |
|--------|-------------|-------------------|
| Read invoices | ✅ Yes | No |
| Query account balance | ✅ Yes | No |
| Create draft invoice | ❌ No | Always — file in Approved/odoo/ |
| Log transaction | ❌ No | Always — file in Approved/odoo/ |
| Draft payment | ❌ No | Always — file in Approved/odoo/ |
| Post invoice (`action_post`) | ❌ Never | Not available to AI Employee |
| Validate payment | ❌ Never | Not available to AI Employee |

---

## Vault Pipeline

```
Needs_Action/odoo/  →  Plans/odoo/  →  Pending_Approval/odoo/
                                              ↓
                                    Human reviews in vault
                                              ↓
                                       Approved/odoo/
                                              ↓
                              odoo_handler executes via MCP
                                              ↓
                                         Done/odoo/
```

---

## Logging & Dashboard

Every action must write to:

1. **Log:** `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md`
   ```
   [HH:MM:SS] [odoo] ACTION: {description} — Status: {success/failed}
   ```

2. **Dashboard:** `vault/AI_Employee_Vault/Dashboard.md`
   ```
   - [odoo] {action}: {summary} — {YYYY-MM-DD}
   ```

---

## Error Handling

- **Odoo not running:** Write `[odoo] ERROR: Odoo unreachable at http://localhost:8069 — start with: python odoo/odoo-bin --config=odoo/odoo.conf` to the log. Do not retry payment actions automatically.
- **Authentication failed:** Write alert to log, pause operations, update Dashboard status.
- **Model/field errors:** Log the error verbatim (Odoo errors are self-explanatory), move task to `Rejected/odoo/`.
