import subprocess
import time

# MCP email server — must start first so task_processor can reach it
subprocess.Popen(["uv", "run", "mcp_server.py"])

# Give MCP server a moment to bind port 8000 before watchers start
time.sleep(6)

# Start Gmail → Inbox watcher (fetches emails from Gmail into Inbox folder)
subprocess.Popen(["uv", "run", "watchers/gmail_watcher.py"])

# Start Inbox → Needs_Action watcher (converts inbox files to task files)
subprocess.Popen(["uv", "run", "watchers/run_watcher.py"])

# Start Needs_Action → processing loop (Plans → Sensitive Check → Execution → Done)
subprocess.Popen(["uv", "run", "watchers/task_processor.py"])

# WhatsApp pipeline (parallel to Gmail, independent)
subprocess.Popen(["uv", "run", "watchers/whatsapp_watcher.py"])
subprocess.Popen(["uv", "run", "watchers/whatsapp_inbox_watcher.py"])

print("AI Employee System Running...")
