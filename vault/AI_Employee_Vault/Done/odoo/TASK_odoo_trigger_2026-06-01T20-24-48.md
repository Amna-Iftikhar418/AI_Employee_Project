---
type: odoo_task
source: dashboard
action: create_invoice
triggered_by: dashboard
timestamp: 2026-06-01T20:24:48.662Z
partner_name: "Test Customer"
product: "Consulting Services"
partner_email: "test@example.com"
amount: 10000
quantity: 2
unit_price: 5000
status: awaiting_approval
---

# Trigger: odoo

Triggered manually from the AI Employee Dashboard at 02/06/2026, 1:24:48 am.

## Invoice Details

| Field | Value |
|-------|-------|
| Customer | Test Customer |
| Email | test@example.com |
| Product | Consulting Services |
| Quantity | 2 |
| Unit Price | 5000 |
| Total | 10000 |
| Invoice Date | 2026-06-01 |

## Payload

```json
{
  "customer": "Test Customer",
  "email": "test@example.com",
  "product": "Consulting Services",
  "quantity": 2,
  "unit_price": 5000,
  "total": 10000
}
```
