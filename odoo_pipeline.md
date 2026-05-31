give me oddo pipeline how it work from start to end                                                                              

● Odoo Pipeline — Start to End

  ┌─────────────────────────────────────────────────────────────┐
  │                      TRIGGER                                │
  │  • User asks: "create invoice for X"                        │
  │  • Watcher detects TASK_odoo_*.md in Needs_Action/odoo/     │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   STEP 1 — PLAN                             │
  │  Claude writes:                                             │
  │  Plans/odoo/PLAN_ODOO_INVOICE_{TIMESTAMP}.md                │
  │                                                             │
  │  Contains: partner, amount, product, action, constraints    │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │               STEP 2 — PENDING APPROVAL                     │
  │  Claude writes:                                             │
  │  Pending_Approval/odoo/TASK_odoo_invoice_{TIMESTAMP}.md     │
  │                                                             │
  │  Approval popup shown to user (AskUserQuestion dialog)      │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
          USER APPROVES           USER REJECTS
                │                       │
                ▼                       ▼
       Approved/odoo/            Rejected/odoo/
                                    (pipeline ends)
                │
                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │               STEP 3 — EXECUTE via MCP/XML-RPC              │
  │                                                             │
  │  CREATE DRAFT INVOICE:                                      │
  │  1. Look up / create partner in res.partner                 │
  │  2. Look up product in product.product                      │
  │  3. Call account.move.create() → invoice in DRAFT state     │
  │                                                             │
  │  ⛔ NEVER call action_post — stays draft                    │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │               STEP 4 — LOG & DONE                           │
  │  • Task file moved to Done/odoo/                            │
  │  • Entry appended to Logs/log_YYYY-MM-DD.md                 │
  │  • Dashboard.md updated                                     │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           STEP 5 — HUMAN POSTS IN ODOO UI (manual)         │
  │  http://localhost:8069 → Accounting → Invoices              │
  │  Human reviews draft → clicks Confirm/Post                  │
  │  → state: posted, journal entries created, ledger updated   │
  └─────────────────────────────────────────────────────────────┘

  ---
  Vault Folder Flow

  Needs_Action/odoo/        ← task arrives here
        ↓
  Plans/odoo/               ← plan written here (always first)
        ↓
  Pending_Approval/odoo/    ← waits for human approval
        ↓
  Approved/odoo/            ← approved tasks land here
        ↓
  [MCP / XML-RPC executes]
        ↓
  Done/odoo/                ← completed tasks archived here
        ↓
  Rejected/odoo/            ← rejected tasks archived here

  ---
  Which Actions Need Approval

  ┌───────────────────────┬──────────────┬────────────────┐
  │        Action         │ Auto-execute │ Needs Approval │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Read invoices         │ Yes          │ No             │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Query account balance │ Yes          │ No             │
  Approved/odoo/            ← approved tasks land here
        ↓
  [MCP / XML-RPC executes]
        ↓
  Done/odoo/                ← completed tasks archived here
        ↓
  Rejected/odoo/            ← rejected tasks archived here

  ---
  Which Actions Need Approval

  ┌───────────────────────┬──────────────┬────────────────┐
  │        Action         │ Auto-execute │ Needs Approval │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Read invoices         │ Yes          │ No             │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Query account balance │ Yes          │ No             │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Create draft invoice  │ No           │ Yes            │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Log transaction       │ No           │ Yes            │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Draft payment         │ No           │ Yes            │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Post invoice          │ Never        │ Not allowed    │
  ├───────────────────────┼──────────────┼────────────────┤
  │ Validate payment      │ Never        │ Not allowed    │
  └───────────────────────┴──────────────┴────────────────┘

✻ Baked for 19s

❯  "create invoice for X"    x mean here what i give to claude?                                                                    

● X means the invoice details you provide. You tell Claude:

  - Who — the customer name (and optionally their email)
  - What — the product or service
  - How much — the amount
  - When — due date (optional, defaults to today)

  ---
  Examples of what you'd type:

  create invoice for Ali Hassan, Consulting Services, $500

  create invoice for customer Zara Ltd, product: Website Design, amount: 1200

  create invoice for Sarah, Web Development, $300, due June 15

  ---
  Minimum required:

  ┌─────────────────┬──────────┬─────────────────────────────────────┐
  │      Field      │ Required │               Example               │
  ├─────────────────┼──────────┼─────────────────────────────────────┤
  │ Customer name   │ Yes      │ "Ali Hassan"                        │
  ├─────────────────┼──────────┼─────────────────────────────────────┤
  │ Product/Service │ Yes      │ "Consulting Services"               │
  ├─────────────────┼──────────┼─────────────────────────────────────┤
  │ Amount          │ Yes      │ $500                                │
  ├─────────────────┼──────────┼─────────────────────────────────────┤
  │ Due date        │ No       │ defaults to today                   │
  ├─────────────────┼──────────┼─────────────────────────────────────┤
  │ Email           │ No       │ used if partner needs to be created │
  └─────────────────┴──────────┴─────────────────────────────────────┘

  Claude will look up the customer in Odoo — if they don't exist, it creates them automatically before making the invoice.

✻ Cooked for 6s