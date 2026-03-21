# AI Employee — Claude Code Project Instructions

## What This Project Is

An autonomous AI Employee that monitors Gmail and WhatsApp, processes incoming
messages, writes structured plans, routes tasks through a human approval workflow,
sends emails via MCP server, and publishes LinkedIn posts automatically.

All vault files live in: `vault/AI_Employee_Vault/`
System is started with: `uv run watchers/main.py`

---

## Agent Skills — Use These for All AI Tasks

IMPORTANT: Every AI action in this project must go through the appropriate skill below.
Do NOT write ad-hoc code or perform actions outside of these skills.

### 1. gmail_handler
**When to use:** A TASK_*.md file with `type: email_task` or `source: gmail`
appears in `vault/AI_Employee_Vault/Needs_Action/email/`
**Skill:** `.claude/skills/gmail_handler/skill.md`

### 2. whatsapp_handler
**When to use:** A TASK_*.md file with `type: whatsapp_task` or `source: whatsapp`
appears in `vault/AI_Employee_Vault/Needs_Action/whatsapp/`
**Skill:** `.claude/skills/whatsapp_handler/whatsapp_task_handler.md`

### 3. generate_plan
**When to use:** Any task needs a structured PLAN_*.md file written before action
**Skill:** `.claude/skills/generate_plan/skill.md`

### 4. file_handler
**When to use:** A general file task appears in `vault/AI_Employee_Vault/Needs_Action/`
**Skill:** `.claude/skills/file_handler/basic_file_handler.md`

### 5. send_email
**When to use:** An approved email task appears in `vault/AI_Employee_Vault/Approved/email/`
**Skill:** `.claude/skills/send_email/skill.md`

### 6. process_approved
**When to use:** Any non-LinkedIn task file appears in `vault/AI_Employee_Vault/Approved/`
**Skill:** `.claude/skills/process_approved/skill.md`

### 7. linkedin_post_creator
**When to use:** User asks to create a LinkedIn post, OR daily scheduler triggers
**Skill:** `.claude/skills/linkedin_post_creator/skill.md`

### 8. linkedin_publisher
**When to use:** A LINKEDIN_POST_*.md file appears in `vault/AI_Employee_Vault/Approved/linkedin/`
**Skill:** `.claude/skills/linkedin_publisher/skill.md`

---

## Pipeline Overview

```
Gmail/WhatsApp → Inbox/ → Needs_Action/ → [skill creates Plan] → Pending_Approval/
                                                                        ↓
                                                              Human reviews & approves
                                                                        ↓
                                                                   Approved/
                                                                        ↓
                                                         [send_email or process_approved skill]
                                                                        ↓
                                                                      Done/
```

## Key Rules
- NEVER send emails or post to LinkedIn without a file in Approved/
- ALWAYS create a PLAN file before any action
- ALWAYS append to logs and Dashboard — never overwrite
- Vault path: `vault/AI_Employee_Vault/`
- MCP server runs on: `http://localhost:8001`
