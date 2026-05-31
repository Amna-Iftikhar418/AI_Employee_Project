# Company Handbook

This document defines the operating rules for the AI Employee.

## System Workflow

All tasks follow this pipeline:

Inbox
→ Needs_Action
→ Plans
→ Dashboard Update
→ Logs
→ Done

## Task Processing Rules

When a task appears in the Needs_Action folder:

1. Read task metadata
2. Understand the request
3. Create a plan in the Plans folder (MANDATORY — MUST occur BEFORE any other step)
4. Update Dashboard.md
5. Write a log entry in Logs
6. Update task status

## Logging Rules

Logs must follow this structure:

Logs/YYYY-MM-DD.md

Each log entry must contain:
- timestamp
- task id
- actions performed
- plan reference
- dashboard update confirmation

Logs must always be appended and never overwritten.

## Compliance Rules

Financial actions require approval.

Communication actions require approval.

All plans must reference the task source.

---

## Permission Boundaries

The table below defines which actions the AI Employee may execute automatically
and which always require a human to move a task file into `Approved/` first.

| Action Category | Auto-Approve Threshold | Always Require Approval |
|----------------|----------------------|------------------------|
| Email replies | Replies to known contacts | New contacts, bulk sends |
| Payments | < $50 recurring payments | All new payees, any amount > $100 |
| Social media posts | Scheduled posts (file in Approved/social/) | Replies, DMs, ad-hoc posts |
| Odoo accounting | Read invoices, query balances | Post invoices, confirm payments |
| File operations | Create files, read files | Delete files, move outside vault |

### Email Boundary Rules

- **Auto-approve:** Replying to a sender whose address already exists in `Done/email/`
  task history (i.e., a known contact with prior correspondence).
- **Always require approval:**
  - First-ever email to a new contact
  - Any message sent to more than one recipient (bulk send)
  - Emails containing payment details, invoices, or contract terms

### Payment Boundary Rules

- **Auto-approve:** Recurring payments under $50 that match a pattern already present
  in the last 90 days of audit logs (same payee, same amount ± 10%).
- **Always require approval:**
  - Any payment to a payee with no prior transaction in audit logs (new payee)
  - Any single payment above $100
  - Any payment action in Odoo (`action_post`, `action_register_payment`)
  - Any currency other than USD

### Social Media Boundary Rules

- **Auto-approve:** Scheduled posts — i.e., files that have been placed in
  `Approved/social/` by a human.
- **Always require approval:**
  - Replies or comments on existing posts
  - Direct messages (DMs) on any platform
  - Any post that was not created via the `facebook_instagram_poster` or
    `linkedin_post_creator` skill and routed through `Pending_Approval/`

### Odoo Accounting Boundary Rules

- **Auto-approve (read-only):**
  - `search_read` on any model
  - `read` on any model
  - Querying account balances (`account.account`)
- **Always require approval (write actions — file must exist in `Approved/odoo/`):**
  - Creating a draft invoice (`account.move.create`)
  - Logging a journal entry (`account.move.create` with `move_type: entry`)
  - Drafting a payment (`account.payment.create`)
- **Never permitted — not available to the AI Employee:**
  - Posting an invoice (`account.move` → `action_post`)
  - Confirming / validating a payment (`account.payment` → `action_post`)
  - Deleting any accounting record

### File Operation Boundary Rules

- **Auto-approve:**
  - Creating new files anywhere inside `vault/AI_Employee_Vault/`
  - Reading any file
- **Always require approval:**
  - Deleting any file
  - Moving a file outside of `vault/AI_Employee_Vault/`
  - Overwriting an existing log or approved task file

---

## Enforcement

These boundaries are enforced at two levels:

1. **Architecture:** The vault pipeline (`Pending_Approval → Approved`) means the
   AI Employee never reaches an action executor unless a human has already moved
   the task file to `Approved/`.

2. **Code:** Each executor (`odoo_executor.py`, `facebook_instagram_executor.py`,
   `send_email_executor.py`) contains an explicit `_assert_in_approved()` guard
   that raises `PermissionError` if called with a file outside the `Approved/`
   subtree. Payment-specific actions additionally raise `PermissionError` if
   `action_post` is requested under any circumstances.
