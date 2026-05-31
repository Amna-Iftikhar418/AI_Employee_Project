---
type: odoo_task
action: create_invoice
partner_name: Test Customer
partner_email: testcustomer@example.com
amount: 100.00
product: Consulting Services
created: 2026-05-29T12:00:00
status: pending
---

# Plan: Create Draft Invoice

## Objective
Create a draft invoice in Odoo for "Test Customer" for Consulting Services at $100.00.
This is a test run to verify the Odoo MCP connection and invoice creation workflow.

## Steps
1. Look up or create partner "Test Customer" in Odoo (`res.partner`)
2. Look up product "Consulting Services" in Odoo (`product.product`)
3. Create a draft invoice (`account.move`, `move_type=out_invoice`) with one line item
4. Leave invoice in **draft** state — do NOT post
5. Log result and move task to Done

## Constraints
- Never call `action_post` — invoice stays in draft
- Requires human approval before MCP execution
