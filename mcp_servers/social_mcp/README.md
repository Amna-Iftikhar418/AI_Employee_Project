# Social MCP Server

MCP server for posting to Facebook Pages and Instagram via Meta Graph API.

## Tools

| Tool | Description |
|------|-------------|
| `post_to_facebook_page` | Post text/link/image to Facebook Page feed |
| `post_to_instagram` | Post image + caption to Instagram (2-step container API) |
| `get_facebook_page_info` | Read Page name, fans, followers |
| `get_instagram_account_info` | Read IG username, followers, media count |

## Configured Accounts

| Account | Value |
|---------|-------|
| Facebook Page | **Pro Services** (`1202062302981620`) |
| Instagram | **@_manooo_0808** (`17841467517702495`) |
| Graph API Version | `v21.0` |

## Setup

### 1. Facebook Developer Setup (one-time)

1. Go to [developers.facebook.com](https://developers.facebook.com) → Create App → Business type
2. Add **Facebook Login** product to your app
3. Under App Permissions, add:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `instagram_basic`
   - `instagram_content_publish`
4. Connect your Instagram Business/Creator account to your Facebook Page:
   - Facebook Page Settings → Instagram → Connect Account
5. Generate a **long-lived User Access Token**:
   - Graph API Explorer → select your app → generate token with required permissions
   - **Tip:** Use `debug_token` to extract your Page ID and IG User ID from `granular_scopes`

### 2. Get Your IDs (alternative method)

```bash
# Inspect token to find Page ID and IG User ID from granular_scopes
GET https://graph.facebook.com/v21.0/debug_token?input_token={TOKEN}&access_token={TOKEN}

# Verify Facebook Page
GET https://graph.facebook.com/v21.0/{page-id}?fields=id,name,fan_count&access_token={TOKEN}

# Verify Instagram account
GET https://graph.facebook.com/v21.0/{ig-user-id}?fields=id,username,followers_count&access_token={TOKEN}
```

### 3. Environment Variables

Add to your `.env` file (never commit `.env` to version control):

```
META_PAGE_ACCESS_TOKEN=<your_long_lived_access_token>
META_PAGE_ID=1202062302981620
META_IG_USER_ID=17841467517702495
META_GRAPH_API_VERSION=v21.0
```

These are already configured in `.env` for this project.

## Running

```bash
# Start via uv (registered in .mcp.json)
uv --directory mcp_servers/social_mcp run social-mcp

# Install dependencies first (one-time)
cd mcp_servers/social_mcp
uv pip install -e .
```

## Instagram Limitations

- Instagram does **not** support text-only posts via the Graph API
- Posts require a publicly accessible `image_url` (HTTPS)
- Caption max: 2200 characters
- Reels/video: not implemented in this version
