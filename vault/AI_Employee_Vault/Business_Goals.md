---
type: business_goals
version: 1.0
last_updated: 2026-05-31
---

# Business Goals — Amna AI Solutions

## Revenue Targets

| Period | Target (USD) | Current MTD | Gap |
|--------|-------------|-------------|-----|
| Monthly | $5,000 | $0 | $5,000 |
| Weekly | $1,250 | $0 | $1,250 |

> Update `Current MTD` each time an invoice is paid or a sale is closed.
> The `weekly_audit` skill reads this table to populate the Revenue section of the CEO briefing.

---

## Key Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Email response time | < 4 hours | — | — |
| Invoice payment rate | > 80% within 30 days | — | — |
| Monthly software costs | < $200/month | — | — |
| Task completion rate (weekly) | > 90% | — | — |
| LinkedIn post frequency | ≥ 5 posts/week | — | — |
| Facebook/Instagram post frequency | ≥ 3 posts/week | — | — |

---

## Active Projects

| Project | Status | Due Date | Owner | Priority |
|---------|--------|----------|-------|----------|
| AI Employee v1 (gold tier) | In Progress | 2026-06-30 | Amna | High |
| Client onboarding automation | Planned | TBD | Amna | Medium |
| Odoo invoice workflow | In Progress | 2026-06-15 | Amna | High |

---

## Subscription Audit Rules

The `weekly_audit` skill applies these rules to every subscription in the table below.
A subscription is **flagged** if it meets ANY of the following criteria:

1. **Inactivity rule** — No usage logged in the past 30 days → flag for cancellation review
2. **Cost spike rule** — Monthly cost increased by >20% vs. prior month → flag for renegotiation
3. **Duplicate tool rule** — Two or more tools serve the same primary function → flag the cheaper/worse-value one for cancellation review

### Current Subscriptions

| Service | Monthly Cost (USD) | Category | Last Active | Notes |
|---------|-------------------|----------|-------------|-------|
| Claude API (Anthropic) | varies | AI/LLM | Active | Core system dependency |
| GitHub | $0 (free) | Dev tools | Active | Source control |
| Odoo Community | $0 (self-hosted) | Accounting | Active | Self-hosted on port 8069 |
| Meta (Facebook/Instagram) | $0 (free tier) | Social media | Active | Graph API, free tier |

> Add new subscriptions to this table whenever a new tool or SaaS service is onboarded.
> Remove cancelled subscriptions promptly so the audit stays accurate.

---

## Upcoming Deadlines

| Deadline | Item | Owner | Priority |
|----------|------|-------|----------|
| 2026-06-15 | Odoo invoice workflow complete | Amna | High |
| 2026-06-30 | AI Employee v1 gold tier complete | Amna | High |

---

## Notes

- This file is read by the `weekly_audit` skill every Monday at 08:00.
- Update revenue MTD manually after each invoice payment is confirmed.
- The audit skill will flag subscriptions automatically based on the rules above.
