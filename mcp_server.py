"""MCP Server with FastAPI for email operations — sends real emails via Gmail API."""

import base64
import logging
import os
from email.mime.text import MIMEText
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException, status
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("MCP_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "MCP_API_KEY environment variable is not set. "
        "Add  MCP_API_KEY=<your-key>  to your .env file before starting the server."
    )

GMAIL_TOKEN_PATH = os.getenv("GMAIL_TOKEN_PATH", "token.json")
GMAIL_CREDENTIALS_PATH = os.getenv("GMAIL_CREDENTIALS_PATH", "credentials.json")
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

app = FastAPI(title="MCP Email Server", version="0.2.0")

# Cached Gmail service — built once, reused across requests
_gmail_service = None


def get_gmail_service():
    """Return authenticated Gmail API service, refreshing token if needed."""
    global _gmail_service

    if not os.path.exists(GMAIL_TOKEN_PATH):
        raise RuntimeError(
            f"Gmail token not found at '{GMAIL_TOKEN_PATH}'. "
            "Run the gmail_watcher once to complete OAuth login first."
        )

    creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_PATH, SCOPES)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            logger.info("Refreshing expired Gmail token...")
            creds.refresh(Request())
            # Save refreshed token
            with open(GMAIL_TOKEN_PATH, "w") as f:
                f.write(creds.to_json())
        else:
            raise RuntimeError(
                "Gmail token is invalid and cannot be refreshed. "
                "Delete token.json and re-run the gmail_watcher to re-authenticate."
            )

    _gmail_service = build("gmail", "v1", credentials=creds)
    return _gmail_service


class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str


class EmailResponse(BaseModel):
    success: bool
    message: str


def verify_api_key(api_key: Optional[str]) -> None:
    if api_key != API_KEY:
        logger.warning("Rejected request — invalid or missing API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


@app.post("/send-email", response_model=EmailResponse)
async def send_email(
    email: EmailRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> EmailResponse:
    """Send a real email via Gmail API."""
    verify_api_key(x_api_key)

    logger.info(f"Sending email to: {email.to}")
    logger.info(f"Subject: {email.subject}")

    try:
        service = get_gmail_service()

        mime_message = MIMEText(email.body)
        mime_message["to"] = email.to
        mime_message["subject"] = email.subject

        raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

        result = service.users().messages().send(
            userId="me",
            body={"raw": raw},
        ).execute()

        msg_id = result.get("id", "unknown")
        logger.info(f"Email sent successfully — Gmail message ID: {msg_id}")

        return EmailResponse(
            success=True,
            message=f"Email sent to {email.to} — Gmail ID: {msg_id}",
        )

    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}",
        )


@app.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
