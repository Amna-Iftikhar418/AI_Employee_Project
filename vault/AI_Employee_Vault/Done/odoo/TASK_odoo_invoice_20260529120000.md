---
type: odoo_task
action: create_invoice
status: pending_approval
created: 2026-05-29T12:00:00
plan: Plans/odoo/PLAN_ODOO_INVOICE_20260529120000.md
---

# Odoo Draft Invoice — Pending Approval

## Invoice Details

| Field        | Value                  |
|--------------|------------------------|
| Customer     | Test Customer          |
| Email        | testcustomer@example.com |
| Product      | Consulting Services    |
| Quantity     | 1                      |
| Unit Price   | $100.00                |
| Total        | $100.00                |
| Invoice Date | 2026-05-29             |
| State        | Draft (will NOT be posted) |

## Proposed Action

1. Search Odoo for partner "Test Customer" — create if not found
2. Search Odoo for product "Consulting Services" — use first match
3. Call `mcp__odoo__execute_method`:
   - model: `account.move`
   - method: `create`
   - Invoice will remain in **draft** state

## To Approve
Move this file to: `vault/AI_Employee_Vault/Approved/odoo/`

## To Reject
Move this file to: `vault/AI_Employee_Vault/Rejected/odoo/`
