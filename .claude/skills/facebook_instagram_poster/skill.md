---
name: facebook_instagram_poster
description: Create and publish social media posts to Facebook Pages and Instagram via Meta Graph API. Always routes through Pending_Approval/social/ → Approved/social/ — never auto-publishes.
---

# Skill: facebook_instagram_poster

## Purpose
Create social media post content and publish approved posts to Facebook Pages and Instagram via the Social MCP server (`mcp__social__*` tools).

## When to Invoke
- User asks to create or schedule a Facebook or Instagram post
- A `SOCIAL_POST_*.md` file appears in `vault/AI_Employee_Vault/Needs_Action/social/`
- `approved_watcher.py` detects a file in `Approved/social/` and routes to `facebook_instagram_executor.py`

## MCP Server
- **Server name:** `social` (registered in `.mcp.json`)
- **Transport:** STDIO — started automatically by Claude Code
- **Tools:** `post_to_facebook_page`, `post_to_instagram`, `get_facebook_page_info`, `get_instagram_account_info`
- **Executor:** `facebook_instagram_executor.py` (called directly by `approved_watcher.py`)

---

## Pipeline

```
User request / Needs_Action/social/
        ↓
  [Step 1] Generate post content
        ↓
  [Step 2] Write PLAN file → Plans/social/
        ↓
  [Step 3] Write SOCIAL_POST_*.md → Pending_Approval/social/
        ↓
  Human reviews via Windows dialog (pending_approval_watcher.py)
        ↓
     YES → Approved/social/
        ↓
  approved_watcher.py → facebook_instagram_executor.py
        ↓
  Meta Graph API → Facebook / Instagram
        ↓
  Done/social/ + Log + Dashboard
```

---

## Actions

### ACTION-1: Create Social Post (Content Generation)

**Step 1 — Generate post content:**
- Write high-quality, engaging copy for the target platform(s)
- Facebook: 1–3 paragraphs, optional link, can be text-only
- Instagram: requires image URL + caption (max 2200 chars, hashtags OK)

**Step 2 — Write plan file:**
```
vault/AI_Employee_Vault/Plans/social/PLAN_SOCIAL_{TIMESTAMP}.md
```
Frontmatter:
```yaml
---
type: social_post
platforms: facebook, instagram
topic: <post topic>
created: <ISO timestamp>
status: pending
---
```

**Step 3 — Write post file to Pending_Approval:**
```
vault/AI_Employee_Vault/Pending_Approval/social/SOCIAL_POST_{TIMESTAMP}.md
```
Frontmatter:
```yaml
---
type: social_post
platforms: facebook, instagram
message: <full post text for Facebook>
caption: <caption for Instagram (can differ from Facebook message)>
image_url: <public HTTPS image URL — REQUIRED for Instagram>
link: <optional URL for Facebook link preview>
created: <ISO timestamp>
status: pending
---
```
Body: Include a preview of the full post content for human review.

**CRITICAL — STOP HERE. Do NOT call AskUserQuestion or ask the user for approval.**
The `pending_approval_watcher.py` will automatically detect the file and show a Windows Yes/No dialog.
If the user clicks Yes → file moves to `Approved/social/` → `approved_watcher.py` auto-publishes → Done.
After writing the file, just tell the user: "Post saved to Pending_Approval/social/ — a Windows approval dialog will appear shortly."

---

### ACTION-2: Publish Approved Post (Execution)

This action is performed automatically by `facebook_instagram_executor.py` when a file lands in `Approved/social/`. Do NOT call MCP tools directly for this step.

If manually invoked (e.g., for testing):

**Facebook Page:**
```
Tool: mcp__social__post_to_facebook_page
  message: <post text>
  link: <optional URL>
  image_url: <optional image URL>
```

**Instagram:**
```
Tool: mcp__social__post_to_instagram
  image_url: <public HTTPS image URL>
  caption: <caption text with hashtags>
```

After publishing:
- Append to log: `[HH:MM:SS] [social] FACEBOOK_POST: Published — post_id=... — Status: success`
- Append to Dashboard: `| Social | Post published: <summary> | YYYY-MM-DD |`
- Move task file to `Done/social/`

---

### ACTION-3: Read Page / Account Info

```
Tool: mcp__social__get_facebook_page_info
Tool: mcp__social__get_instagram_account_info
```

Read-only — no approval required.

---

## Permission Boundaries

| Action | Auto-execute | Requires Approval |
|--------|-------------|-------------------|
| Get page/account info | ✅ Yes | No |
| Generate post content + write to Pending_Approval | ✅ Yes | No |
| Publish to Facebook or Instagram | ❌ No | Always — file in Approved/social/ |

---

## Post Content Guidelines

**Facebook:**
- Conversational, professional tone
- 150–300 words for engagement posts
- Include a clear call-to-action
- Optional: relevant link, image URL

**Instagram:**
- 125–150 words visible before "more"
- Include 5–10 relevant hashtags at the end
- Requires a publicly accessible image URL
- Caption max: 2200 characters

---

## Vault Pipeline

```
Needs_Action/social/  →  Plans/social/  →  Pending_Approval/social/
                                                     ↓
                                           Human reviews in vault
                                                     ↓
                                              Approved/social/
                                                     ↓
                                   facebook_instagram_executor.py
                                          (Meta Graph API)
                                                     ↓
                                               Done/social/
```

---

## Logging & Dashboard

Every action must write to:

1. **Log:** `vault/AI_Employee_Vault/Logs/log_YYYY-MM-DD.md`
   ```
   [HH:MM:SS] [social] ACTION: {description} — Status: {success/failed}
   ```

2. **Dashboard:** `vault/AI_Employee_Vault/Dashboard.md`
   ```
   | Social | {action}: {summary} | {YYYY-MM-DD} |
   ```

---

## Error Handling

- **Token not set:** Log `[social] ERROR: META_PAGE_ACCESS_TOKEN not configured — add to .env`. Do not retry.
- **API error (token expired):** Log error with code, update Dashboard, pause social operations.
- **Instagram — no image_url:** Log `[social] INSTAGRAM_POST: SKIPPED — image_url required`. Post Facebook only if included in platforms.
- **Network error:** Log error, leave file in Approved/ for retry on next cycle.

---

## Environment Variables Required

```
META_PAGE_ACCESS_TOKEN   — Long-lived Page Access Token from developers.facebook.com
META_PAGE_ID             — Numeric Facebook Page ID
META_IG_USER_ID          — Instagram Business/Creator User ID linked to the Page
META_GRAPH_API_VERSION   — Graph API version (default: v21.0)
```
