---
type: odoo_task
source: dashboard
action: create_invoice
triggered_by: dashboard
timestamp: 2026-06-01T20:30:22.469Z
partner_name: "Rida"
product: "goods"
partner_email: "rida@gmail.com"
amount: 40
unit_price: 40
status: awaiting_approval
---

# Trigger: odoo

Triggered manually from the AI Employee Dashboard at 02/06/2026, 1:30:22 am.

## Invoice Details

| Field | Value |
|-------|-------|
| Customer | Rida |
| Email | rida@gmail.com |
| Product | goods |
| Quantity | 1 |
| Unit Price | 40 |
| Total | 40 |
| Invoice Date | 2026-06-01 |

## Payload

```json
{
  "customer": "Rida",
  "email": "rida@gmail.com",
  "product": "goods",
  "quantity": 1,
  "unit_price": 40,
  "total": 40
}
```
