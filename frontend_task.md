# Frontend Dashboard — Task List
**Stack:** Next.js 15 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query v5 · Recharts
**Theme:** Midnight navy (#0a0f1e) + glassmorphism cards + vivid domain gradients
**Location:** `frontend/` at project root → runs on `localhost:3000`
**Status legend:** `[ ]` = pending · `[x]` = done · `[-]` = skipped

---

## TASK-1: Project Scaffold & Setup

- [ ] **TASK-1.1** Create `frontend/` directory at project root and scaffold with:
  `npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint`
- [ ] **TASK-1.2** Install core dependencies:
  `npm install @tanstack/react-query gray-matter recharts react-markdown date-fns lucide-react`
- [ ] **TASK-1.3** Initialize shadcn/ui with dark theme, zinc base:
  `npx shadcn@latest init` → select Dark, zinc, CSS variables
- [ ] **TASK-1.4** Add shadcn/ui components:
  `npx shadcn@latest add card badge button dialog table textarea tabs select`
- [ ] **TASK-1.5** Configure `next.config.ts` — add `serverExternalPackages: ['gray-matter']` so gray-matter runs server-side only
- [ ] **TASK-1.6** Create `src/lib/constants.ts` — define `VAULT_ROOT` as absolute path to `C:/Project/AI_Employee_Project/vault/AI_Employee_Vault`, `DOMAIN_COLORS`, `STATUS_COLORS` maps
- [ ] **TASK-1.7** Set up global CSS in `src/app/globals.css` — midnight navy background `#0a0f1e`, gradient orb decorations, glassmorphism card variables
- [ ] **TASK-1.8** Configure root layout `src/app/layout.tsx` — Geist font, dark background, sidebar + main layout shell, TanStack Query provider
- [ ] **TASK-1.9** Verify `npm run dev` starts on `localhost:3000` with no errors

---

## TASK-2: Core Library Layer (`src/lib/`)

- [ ] **TASK-2.1** Create `src/lib/vault.ts`:
  - `readVaultFile(relativePath)` — reads file with `fs.readFile`
  - `scanVaultFolder(folderPath)` — lists `.md` files in a directory
  - `listDomain(domain, stage)` — returns array of files in `{stage}/{domain}/`
  - `countByStage(domain)` — counts files per pipeline stage for one domain
- [ ] **TASK-2.2** Create `src/lib/parse.ts`:
  - `parseFrontmatter(content)` — uses `gray-matter` to extract YAML + body
  - `parseLogLine(line)` — regex parser for `[HH:MM:SS] [domain] ACTION: result` format
  - `parseLogFile(content)` — splits log file into array of `ParsedLogEntry` objects
- [ ] **TASK-2.3** Create `src/lib/odoo.ts`:
  - XML-RPC client using `http.request` (no external dep) to call Odoo at `ODOO_URL`
  - `odooLogin()` — authenticates and returns UID
  - `odooCall(model, method, args)` — generic XML-RPC call
  - `listInvoices()` — fetches `account.move` records (name, partner, amount_total, state, invoice_date)
- [ ] **TASK-2.4** Create `src/lib/api.ts` — client-side fetch wrappers:
  - `fetchPending()`, `fetchTasks()`, `fetchLogs(date?)`, `fetchBriefing()`, `fetchGoals()`
  - `fetchDomain(domain)`, `fetchOdooInvoices()`, `fetchHealth()`
  - `approvePending(filepath, content?)`, `rejectPending(filepath)`
  - `triggerAction(action, payload?)` — POST to `/api/trigger/[action]`

---

## TASK-3: API Routes (`src/app/api/`)

- [ ] **TASK-3.1** `GET /api/vault/pending` — scan all `Pending_Approval/{domain}/` folders, parse frontmatter of each file, return JSON array with `{domain, filename, filepath, frontmatter, body, createdAt}`
- [ ] **TASK-3.2** `GET /api/vault/tasks` — return pipeline matrix: for each domain × each stage, return file count and last-modified timestamp
- [ ] **TASK-3.3** `GET /api/vault/domain/[domain]` — return all task files for a given domain across all stages (Needs_Action, Plans, Pending_Approval, Approved, Done, Rejected)
- [ ] **TASK-3.4** `GET /api/vault/logs?date=YYYY-MM-DD` — read `Logs/log_{date}.md`, parse into `ParsedLogEntry[]`, return JSON
- [ ] **TASK-3.5** `GET /api/vault/briefing` — find latest file in `Briefings/` by filename date sort, return `{filename, date, content}`
- [ ] **TASK-3.6** `GET /api/vault/goals` — read and parse `Business_Goals.md` with gray-matter, return structured JSON
- [ ] **TASK-3.7** `GET /api/vault/screenshots` — list all `.png` files in `Screenshots/`, return paths as URL-safe strings for `<img>` src
- [ ] **TASK-3.8** `POST /api/approve` — body: `{filepath, content?}` — if content provided, rewrite file; then `fs.rename` from `Pending_Approval/` to `Approved/`; return `{success: true}`
- [ ] **TASK-3.9** `POST /api/reject` — body: `{filepath}` — `fs.rename` from `Pending_Approval/` to `Rejected/`; return `{success: true}`
- [ ] **TASK-3.10** `POST /api/trigger/[action]` — handle actions: `linkedin`, `briefing`, `social`, `browser`, `odoo` — write a structured trigger `.md` file to the correct `Needs_Action/{domain}/` folder with timestamp in filename
- [ ] **TASK-3.11** `GET /api/odoo/invoices` — call `odooLogin()` + `listInvoices()` from `lib/odoo.ts`, return invoice array; return `{error, connected: false}` gracefully if Odoo is down
- [ ] **TASK-3.12** `GET /api/health` — HTTP GET `http://127.0.0.1:8001/health`; return `{mcp: 'ok'|'down', timestamp}`

---

## TASK-4: Shared UI Components (`src/components/`)

- [ ] **TASK-4.1** `Sidebar.tsx` — left nav (w-64, indigo-950/60, backdrop-blur-xl):
  - Logo / "AI Employee" title with gradient text
  - Nav links: Dashboard, Pending (with live count badge), Gmail, WhatsApp, LinkedIn, Social, Odoo, Browser, Scheduler, Briefing, Logs, Goals
  - Each link: domain color dot, hover highlight, active state
  - Pending count auto-refreshes every 15s via TanStack Query
- [ ] **TASK-4.2** `KpiCard.tsx` — glassmorphism card (bg-white/5, border-white/10, backdrop-blur-md):
  - Props: `title`, `value`, `subtitle`, `icon`, `gradientFrom`, `gradientTo`
  - Left border: 3px gradient stripe in domain color
  - Value: large bold white text; subtitle: slate-400
- [ ] **TASK-4.3** `RevenueBar.tsx` — labelled progress bar:
  - Gradient fill: emerald-500 → teal-600
  - Shows: "PKR X / PKR Y (Z%)" with percentage on the right
  - Animated fill on mount
- [ ] **TASK-4.4** `DomainStatusGrid.tsx` — 4×2 grid of domain tiles:
  - Each tile: glassmorphism, domain icon + name, last action text, task count, live status dot (green/amber/red)
  - Domains: Gmail, WhatsApp, LinkedIn, Facebook, Instagram, Odoo, Browser, Scheduler
- [ ] **TASK-4.5** `ActivityFeed.tsx` — scrollable timeline list:
  - Each entry: colored domain dot, domain badge, action text, relative timestamp (`date-fns` formatDistanceToNow)
  - Color per domain from `DOMAIN_COLORS`
  - Auto-refresh every 30s
- [ ] **TASK-4.6** `ApprovalCard.tsx` — pending task card:
  - Domain icon + badge + task type header
  - "Waiting X minutes" timestamp in amber
  - Editable `<textarea>` showing full proposed content (auto-resize)
  - `[✓ Approve]` emerald gradient button + `[✗ Reject]` rose gradient button
  - Loading spinner on button click; card fades out on success (optimistic UI)
- [ ] **TASK-4.7** `DomainTaskTable.tsx` — reusable data table:
  - Columns: filename, status badge, created, last modified, actions (expand)
  - Click row → expandable panel showing full file content
  - Filter tabs: All | Pending | Done | Rejected
- [ ] **TASK-4.8** `LogViewer.tsx` — terminal-style panel (bg-black/40, font-mono):
  - Renders `ParsedLogEntry[]` with domain color per line
  - Auto-scrolls to bottom on new entries
  - Auto-refresh every 10s
  - Search input to filter by domain or keyword
- [ ] **TASK-4.9** `BriefingRenderer.tsx` — styled markdown renderer:
  - Uses `react-markdown` with custom component overrides
  - Tables: dark glass styling
  - Headings: gradient text
  - Highlighted metric rows (revenue, bottleneck) in amber/emerald
- [ ] **TASK-4.10** `TriggerButton.tsx` — reusable action button:
  - Props: `action`, `label`, `icon`, `payload?`
  - Shows loading spinner on POST; success toast on completion; error state
- [ ] **TASK-4.11** `OdooInvoiceTable.tsx` — invoice data table:
  - Columns: Invoice #, Customer, Amount, State, Date
  - State badge colors: Draft=slate, Posted=blue, Paid=emerald, Overdue=rose
  - Summary row: Total invoiced, Total paid, Outstanding
- [ ] **TASK-4.12** `BrowserTaskCard.tsx` — browser automation card:
  - Shows: URL, action type badge, status, screenshot thumbnails (from `/api/vault/screenshots`)
  - Screenshot thumbnails open full-size in dialog on click

---

## TASK-5: Home Dashboard Page (`/`)

- [ ] **TASK-5.1** Build `src/app/page.tsx` with metadata: `title: 'AI Employee Dashboard'`, description, JSON-LD structured data
- [ ] **TASK-5.2** KPI row — 8 `KpiCard` components (Gmail, WhatsApp, LinkedIn, Facebook, Instagram, Odoo, Browser, Scheduler), each fetching counts from `/api/vault/tasks`
- [ ] **TASK-5.3** Revenue progress bar — fetch from `/api/vault/goals`, extract MTD + target, render `RevenueBar`
- [ ] **TASK-5.4** Pending approvals banner — fetch count from `/api/vault/pending`; show amber banner with count + link if count > 0
- [ ] **TASK-5.5** Domain status grid — `DomainStatusGrid` component with data from `/api/vault/tasks`
- [ ] **TASK-5.6** Activity feed — `ActivityFeed` component fetching from `/api/vault/logs`
- [ ] **TASK-5.7** System health row — fetch `/api/health`, show green "MCP Online" or red "MCP Down" chip

---

## TASK-6: Gmail Page (`/gmail`)

- [ ] **TASK-6.1** Page metadata + h1 heading "Gmail — Email Tasks"
- [ ] **TASK-6.2** KPI strip: Processed today, Approved, Rejected, Pending
- [ ] **TASK-6.3** `DomainTaskTable` with email domain data from `/api/vault/domain/email`
- [ ] **TASK-6.4** Expand row → full email body + proposed reply rendered in panel
- [ ] **TASK-6.5** Filter tabs: All | Needs Action | Pending Approval | Approved | Done | Rejected

---

## TASK-7: WhatsApp Page (`/whatsapp`)

- [ ] **TASK-7.1** Page metadata + h1 "WhatsApp — Message Tasks"
- [ ] **TASK-7.2** KPI strip: Messages today, Pending, Done, Rejected
- [ ] **TASK-7.3** `DomainTaskTable` with whatsapp domain data
- [ ] **TASK-7.4** Expand row → full message + proposed reply
- [ ] **TASK-7.5** Filter tabs: All | Pending | Done | Rejected

---

## TASK-8: LinkedIn Page (`/linkedin`)

- [ ] **TASK-8.1** Page metadata + h1 "LinkedIn — Post Management"
- [ ] **TASK-8.2** `TriggerButton` — "Create LinkedIn Post Now" → POST `/api/trigger/linkedin`
- [ ] **TASK-8.3** Post cards grid: topic badge, 3-line preview, status, published timestamp
- [ ] **TASK-8.4** Click card → full post text in shadcn `Dialog` modal
- [ ] **TASK-8.5** Published history table: topic, date, word count, hashtag count
- [ ] **TASK-8.6** Filter: All | Pending | Approved | Published | Rejected

---

## TASK-9: Social Media Page (`/social`)

- [ ] **TASK-9.1** Page metadata + h1 "Social Media — Facebook & Instagram"
- [ ] **TASK-9.2** Two `Tabs`: Facebook | Instagram (shadcn Tabs component)
- [ ] **TASK-9.3** `TriggerButton` — "Create Social Post Now" → POST `/api/trigger/social`
- [ ] **TASK-9.4** Post cards per platform: preview text, image URL display, status badge, timestamp
- [ ] **TASK-9.5** Published history table per active tab (facebook / instagram filtered)

---

## TASK-10: Odoo Page (`/odoo`)

- [ ] **TASK-10.1** Page metadata + h1 "Odoo — Accounting & Invoices"
- [ ] **TASK-10.2** Revenue summary cards: Total Invoiced, Total Paid, Outstanding (from `/api/odoo/invoices`)
- [ ] **TASK-10.3** `OdooInvoiceTable` — live data from Odoo XML-RPC via `/api/odoo/invoices`; graceful "Odoo Offline" state if connection fails
- [ ] **TASK-10.4** "Draft Invoice" button → opens shadcn `Dialog` form: Customer name, Email, Product, Quantity, Unit Price → POST `/api/trigger/odoo` → writes TASK_odoo_*.md to Needs_Action/odoo/
- [ ] **TASK-10.5** Recent Odoo tasks table — `DomainTaskTable` filtered for odoo domain
- [ ] **TASK-10.6** Overdue invoice rows highlighted in rose-500/20 background

---

## TASK-11: Browser Automation Page (`/browser`)

- [ ] **TASK-11.1** Page metadata + h1 "Browser — Web Automation"
- [ ] **TASK-11.2** KPI strip: Automations today, Pending, Done, Failed
- [ ] **TASK-11.3** "New Browser Task" button → opens form dialog: URL, Action (navigate/fill-form/scrape/submit), Description → POST `/api/trigger/browser`
- [ ] **TASK-11.4** Task cards list — `BrowserTaskCard` components from `/api/vault/domain/browser`
- [ ] **TASK-11.5** Screenshot gallery — thumbnails from `/api/vault/screenshots` in a grid; click to open full-size in dialog
- [ ] **TASK-11.6** Filter: All | Read-only (no approval) | Write (requires approval) | Done | Rejected

---

## TASK-12: Scheduler Page (`/scheduler`)

- [ ] **TASK-12.1** Page metadata + h1 "Scheduler — Automated Jobs"
- [ ] **TASK-12.2** Upcoming jobs table with columns: Job Name, Schedule (cron human-readable), Next Fire, Last Run, Status
  - LinkedIn Post: Daily 09:00
  - CEO Briefing: Every Monday 08:00
  - Log Cleanup: Every Monday 07:00
- [ ] **TASK-12.3** Manual trigger buttons row:
  - `TriggerButton` "Generate LinkedIn Post Now" → `/api/trigger/linkedin`
  - `TriggerButton` "Generate CEO Briefing Now" → `/api/trigger/briefing`
  - `TriggerButton` "Run Log Cleanup Now" → `/api/trigger/cleanup`
- [ ] **TASK-12.4** Scheduler history — parse `Logs/` for scheduler-related entries, display as timeline

---

## TASK-13: Pending Approval Page (`/pending`)

- [ ] **TASK-13.1** Page metadata + h1 "Pending Approvals" + live count badge
- [ ] **TASK-13.2** Fetch all pending files from `/api/vault/pending`, auto-refresh every 15s (TanStack Query)
- [ ] **TASK-13.3** Group cards by domain: Gmail | WhatsApp | LinkedIn | Facebook | Instagram | Odoo | Browser
- [ ] **TASK-13.4** Render `ApprovalCard` for each file with editable content, Approve + Reject buttons
- [ ] **TASK-13.5** Approve action: send edited content + filepath to POST `/api/approve`; optimistic removal of card
- [ ] **TASK-13.6** Reject action: send filepath to POST `/api/reject`; optimistic removal of card
- [ ] **TASK-13.7** Empty state: "No pending approvals — all clear!" with green checkmark illustration

---

## TASK-14: CEO Briefing Page (`/briefing`)

- [ ] **TASK-14.1** Page metadata + h1 "CEO Briefing"
- [ ] **TASK-14.2** Date selector dropdown — list all files in `Briefings/` by date, default to latest
- [ ] **TASK-14.3** `BriefingRenderer` — render selected briefing markdown with styled tables and metric highlights
- [ ] **TASK-14.4** `TriggerButton` "Generate Now" → POST `/api/trigger/briefing`; success toast: "Briefing task queued"
- [ ] **TASK-14.5** Revenue section: highlight MTD value in emerald if on-track, rose if below 70%

---

## TASK-15: Logs Page (`/logs`)

- [ ] **TASK-15.1** Page metadata + h1 "System Logs"
- [ ] **TASK-15.2** Date picker (default today) — fetches `/api/vault/logs?date=YYYY-MM-DD`
- [ ] **TASK-15.3** `LogViewer` component — terminal panel, color-coded lines per domain
- [ ] **TASK-15.4** Domain filter chips: All | Gmail | WhatsApp | LinkedIn | Odoo | Social | Browser | Scheduler | Error
- [ ] **TASK-15.5** Search input — client-side filter of rendered log lines
- [ ] **TASK-15.6** Auto-refresh every 10s when viewing today's date

---

## TASK-16: Business Goals Page (`/goals`)

- [ ] **TASK-16.1** Page metadata + h1 "Business Goals & Metrics"
- [ ] **TASK-16.2** Revenue targets table with inline `RevenueBar` per row
- [ ] **TASK-16.3** Key Metrics table with Target vs Current vs Status badge
- [ ] **TASK-16.4** Active Projects table: name, status badge, due date, days remaining (highlight overdue in rose)
- [ ] **TASK-16.5** Subscriptions table: flagged rows (inactive >30 days or cost spike) in amber-500/10 background
- [ ] **TASK-16.6** Upcoming Deadlines sorted ascending, overdue items in rose

---

## TASK-17: SEO & Accessibility

- [ ] **TASK-17.1** Add `export const metadata: Metadata` to every page with unique title + description
- [ ] **TASK-17.2** Add Open Graph tags to root layout (og:title, og:description, og:type)
- [ ] **TASK-17.3** Add JSON-LD structured data (`SoftwareApplication`) to home page
- [ ] **TASK-17.4** Audit heading hierarchy on every page — h1 → h2 → h3 only, no skips
- [ ] **TASK-17.5** Wrap all timestamps in `<time dateTime="ISO-8601">` tags
- [ ] **TASK-17.6** Add `aria-label` to sidebar `<nav>`, all icon-only buttons, and status indicators
- [ ] **TASK-17.7** Verify keyboard navigation works on Approve/Reject buttons and all forms

---

## TASK-18: Final QA & Verification

- [ ] **TASK-18.1** `npm run build` — zero TypeScript errors, zero missing modules
- [ ] **TASK-18.2** Home dashboard loads with real vault data (KPI counts match actual files)
- [ ] **TASK-18.3** `/pending` — approve a real pending file; confirm it moves to `Approved/` on disk
- [ ] **TASK-18.4** `/pending` — reject a real pending file; confirm it moves to `Rejected/` on disk
- [ ] **TASK-18.5** Edit content in ApprovalCard, approve — confirm rewritten file content in `Approved/`
- [ ] **TASK-18.6** Trigger LinkedIn post from `/linkedin` — confirm trigger file appears in `Needs_Action/linkedin/`
- [ ] **TASK-18.7** `/odoo` — invoices load from Odoo (or shows graceful offline state)
- [ ] **TASK-18.8** `/logs` — today's log entries display with domain color coding
- [ ] **TASK-18.9** `/briefing` — latest Monday briefing renders correctly
- [ ] **TASK-18.10** System health chip shows correct MCP server status
- [ ] **TASK-18.11** All 13 pages navigable from sidebar without errors

---

## Progress Tracker

| Task Group | Total | Done | Remaining |
|------------|-------|------|-----------|
| TASK-1: Scaffold & Setup | 9 | 0 | 9 |
| TASK-2: Library layer | 4 | 0 | 4 |
| TASK-3: API routes | 12 | 0 | 12 |
| TASK-4: Shared components | 12 | 0 | 12 |
| TASK-5: Home dashboard | 7 | 0 | 7 |
| TASK-6: Gmail page | 5 | 0 | 5 |
| TASK-7: WhatsApp page | 5 | 0 | 5 |
| TASK-8: LinkedIn page | 6 | 0 | 6 |
| TASK-9: Social page | 5 | 0 | 5 |
| TASK-10: Odoo page | 6 | 0 | 6 |
| TASK-11: Browser page | 6 | 0 | 6 |
| TASK-12: Scheduler page | 4 | 0 | 4 |
| TASK-13: Pending page | 7 | 0 | 7 |
| TASK-14: Briefing page | 5 | 0 | 5 |
| TASK-15: Logs page | 6 | 0 | 6 |
| TASK-16: Goals page | 6 | 0 | 6 |
| TASK-17: SEO & Accessibility | 7 | 0 | 7 |
| TASK-18: QA & Verification | 11 | 0 | 11 |
| **TOTAL** | **128** | **0** | **128** |
