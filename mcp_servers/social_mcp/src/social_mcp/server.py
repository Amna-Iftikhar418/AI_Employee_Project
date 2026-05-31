"""
Social MCP Server — Facebook & Instagram posting via Meta Graph API.

Tools:
  post_to_facebook_page   — Post text/link/image to a Facebook Page feed
  post_to_instagram       — Post image+caption to Instagram (2-step container API)
  get_facebook_page_info  — Read Page name, fans, followers
  get_instagram_account_info — Read IG username, followers, media count

Environment variables (from .env or MCP server env block):
  META_PAGE_ACCESS_TOKEN   — Long-lived Page Access Token
  META_PAGE_ID             — Numeric Facebook Page ID
  META_IG_USER_ID          — Instagram Business/Creator User ID (linked to the Page)
  META_GRAPH_API_VERSION   — Graph API version, e.g. "v21.0" (default: v21.0)
"""

import os
from typing import Optional

import requests
from fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

mcp = FastMCP(
    "social-mcp",
    instructions=(
        "Social MCP server for posting to Facebook Pages and Instagram. "
        "Always route write actions through the vault Pending_Approval/social/ → "
        "Approved/social/ pipeline — never post without human approval."
    ),
)

GRAPH_BASE = "https://graph.facebook.com"


def _api_version() -> str:
    return os.getenv("META_GRAPH_API_VERSION", "v21.0")


def _page_token() -> str:
    token = os.getenv("META_PAGE_ACCESS_TOKEN", "")
    if not token:
        raise ValueError(
            "META_PAGE_ACCESS_TOKEN is not set. "
            "Generate a long-lived Page Access Token from developers.facebook.com "
            "and add it to your .env file."
        )
    return token


def _page_id() -> str:
    pid = os.getenv("META_PAGE_ID", "")
    if not pid:
        raise ValueError("META_PAGE_ID is not set in environment.")
    return pid


def _ig_user_id() -> str:
    uid = os.getenv("META_IG_USER_ID", "")
    if not uid:
        raise ValueError("META_IG_USER_ID is not set in environment.")
    return uid


def _graph_url(path: str) -> str:
    return f"{GRAPH_BASE}/{_api_version()}/{path}"


# ── Tools ─────────────────────────────────────────────────────────────────────


@mcp.tool(
    description=(
        "Post a text message (optionally with a link or image) to the configured "
        "Facebook Page feed. Returns the new post ID on success."
    )
)
def post_to_facebook_page(
    message: str,
    link: Optional[str] = None,
    image_url: Optional[str] = None,
) -> dict:
    """
    Publish a post to the Facebook Page.

    Args:
        message:   The text body of the post.
        link:      Optional URL to attach as a link preview.
        image_url: Optional public image URL to attach as a photo post.
                   When provided, `link` is ignored.

    Returns:
        {"success": True, "post_id": "...", "url": "..."}
        {"success": False, "error": "...", "details": {...}}
    """
    token   = _page_token()
    page_id = _page_id()

    if image_url:
        # Photo post
        url    = _graph_url(f"{page_id}/photos")
        params = {
            "url":          image_url,
            "caption":      message,
            "access_token": token,
            "published":    "true",
        }
    else:
        # Text / link post
        url    = _graph_url(f"{page_id}/feed")
        params = {
            "message":      message,
            "access_token": token,
        }
        if link:
            params["link"] = link

    try:
        resp = requests.post(url, data=params, timeout=30)
        data = resp.json()
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    if "error" in data:
        return {"success": False, "error": data["error"].get("message", "Unknown error"), "details": data["error"]}

    post_id = data.get("post_id") or data.get("id", "")
    page_url = f"https://www.facebook.com/{page_id}/posts/{post_id.split('_')[-1]}" if post_id else ""
    return {"success": True, "post_id": post_id, "url": page_url}


@mcp.tool(
    description=(
        "Post an image with a caption to Instagram using the two-step Media Container API. "
        "Requires a public image URL. Returns the Instagram media ID on success."
    )
)
def post_to_instagram(
    image_url: str,
    caption: str,
) -> dict:
    """
    Publish an image post to Instagram.

    Instagram requires a publicly accessible image URL. Text-only posts are not
    supported by the Graph API without a video/reel.

    Args:
        image_url: Publicly accessible HTTPS URL of the image.
        caption:   Caption text (up to 2200 characters; hashtags allowed).

    Returns:
        {"success": True, "media_id": "...", "creation_id": "..."}
        {"success": False, "error": "...", "details": {...}}
    """
    token     = _page_token()
    ig_user   = _ig_user_id()

    # Step 1: Create media container
    container_url    = _graph_url(f"{ig_user}/media")
    container_params = {
        "image_url":    image_url,
        "caption":      caption,
        "access_token": token,
    }

    try:
        r1   = requests.post(container_url, data=container_params, timeout=30)
        d1   = r1.json()
    except Exception as exc:
        return {"success": False, "error": f"Container creation failed: {exc}"}

    if "error" in d1:
        return {"success": False, "error": d1["error"].get("message", "Container error"), "details": d1["error"]}

    creation_id = d1.get("id")
    if not creation_id:
        return {"success": False, "error": "No creation_id returned from media container step."}

    # Step 2: Publish the container
    publish_url    = _graph_url(f"{ig_user}/media_publish")
    publish_params = {
        "creation_id":  creation_id,
        "access_token": token,
    }

    try:
        r2   = requests.post(publish_url, data=publish_params, timeout=30)
        d2   = r2.json()
    except Exception as exc:
        return {"success": False, "error": f"Publish failed: {exc}", "creation_id": creation_id}

    if "error" in d2:
        return {"success": False, "error": d2["error"].get("message", "Publish error"), "details": d2["error"], "creation_id": creation_id}

    media_id = d2.get("id", "")
    return {"success": True, "media_id": media_id, "creation_id": creation_id}


@mcp.tool(description="Read basic info (name, fan count, followers) for the configured Facebook Page.")
def get_facebook_page_info() -> dict:
    """Return Page name, fan_count, followers_count, and page link."""
    token   = _page_token()
    page_id = _page_id()
    url     = _graph_url(page_id)
    params  = {
        "fields":       "id,name,fan_count,followers_count,link,category",
        "access_token": token,
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        data = resp.json()
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    if "error" in data:
        return {"success": False, "error": data["error"].get("message", "API error"), "details": data["error"]}

    return {"success": True, **data}


@mcp.tool(description="Read basic info (username, followers count, media count) for the configured Instagram Business account.")
def get_instagram_account_info() -> dict:
    """Return IG username, followers_count, media_count, and profile picture URL."""
    token   = _page_token()
    ig_user = _ig_user_id()
    url     = _graph_url(ig_user)
    params  = {
        "fields":       "id,username,followers_count,media_count,profile_picture_url",
        "access_token": token,
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        data = resp.json()
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    if "error" in data:
        return {"success": False, "error": data["error"].get("message", "API error"), "details": data["error"]}

    return {"success": True, **data}
