"""
odoo_executor.py

Called by approved_watcher.py when a TASK_odoo_*.md file lands in Approved/odoo/.
Reads the task file, creates a draft invoice in Odoo via XML-RPC, then moves the
task to Done/odoo/ and writes to the log and dashboard.

Never calls action_post — invoice stays in draft state always.
"""

import re
import shutil
import socket
import sys
import xmlrpc.client
from datetime import datetime
from pathlib import Path

ROOT  = Path(__file__).parent
VAULT = ROOT / "vault" / "AI_Employee_Vault"

ODOO_URL      = "http://localhost:8069"
ODOO_DB       = "odoo"
ODOO_USERNAME = "admin"
ODOO_PASSWORD = "admin"

# TASK-7.2 / TASK-7.4: retry + alert utilities
_WATCHERS_DIR = ROOT / "watchers"
if str(_WATCHERS_DIR) not in sys.path:
    sys.path.insert(0, str(_WATCHERS_DIR))
from retry_handler import TransientError, with_retry, write_log_alert  # noqa: E402
from audit_logger import log_action  # noqa: E402  TASK-8.4

# Actions that MUST NOT be auto-retried (TASK-7.4 — payment safety)
PAYMENT_ACTIONS = frozenset({"post_payment", "register_payment", "action_post"})

# Actions that the AI Employee is NEVER permitted to call (TASK-10.2)
_FORBIDDEN_ACTIONS = frozenset({"action_post", "action_register_payment"})

APPROVED_ODOO = ROOT / "vault" / "AI_Employee_Vault" / "Approved" / "odoo"


def _assert_in_approved(file_path: Path) -> None:
    """Raise PermissionError if file_path is not inside Approved/odoo/. TASK-10.2."""
    try:
        file_path.resolve().relative_to(APPROVED_ODOO.resolve())
    except ValueError:
        raise PermissionError(
            f"Permission boundary violation: Odoo write actions require a file in "
            f"Approved/odoo/ — got {file_path}"
        )


# ── Odoo RPC helpers (TASK-7.2 / TASK-7.4) ───────────────────────────────────

def _raw_odoo_rpc(models, db: str, uid: int, password: str,
                  model: str, method: str, args: list, kwargs: dict | None = None) -> object:
    """Raw execute_kw wrapper. Raises TransientError on timeout/connection failure."""
    try:
        return models.execute_kw(db, uid, password, model, method, args, kwargs or {})
    except socket.timeout as exc:
        raise TransientError(f"Odoo timeout on {model}.{method}: {exc}") from exc
    except (ConnectionRefusedError, OSError) as exc:
        raise TransientError(f"Odoo connection error on {model}.{method}: {exc}") from exc


_odoo_rpc_with_retry = with_retry(
    max_attempts=3,
    base_delay=1.0,
    max_delay=60.0,
    retryable=(TransientError,),
    log_domain="odoo",
)(_raw_odoo_rpc)


def odoo_rpc(models, db: str, uid: int, password: str,
             model: str, method: str, args: list,
             kwargs: dict | None = None, action: str = "") -> object:
    """Route Odoo RPC through exponential-backoff retry for non-payment actions.

    TASK-7.4: Payment actions are never retried automatically — a timeout
    writes an alert to Logs/ and raises so the caller can fail safely.
    TASK-10.2: Forbidden actions (action_post) raise immediately — the AI
    Employee must never post invoices or validate payments autonomously.
    """
    if method in _FORBIDDEN_ACTIONS or action in _FORBIDDEN_ACTIONS:
        raise PermissionError(
            f"Permission boundary violation: '{method or action}' on {model} is "
            "not permitted for the AI Employee. Post invoices manually in Odoo UI."
        )
    if action in PAYMENT_ACTIONS:
        try:
            return _raw_odoo_rpc(models, db, uid, password, model, method, args, kwargs)
        except TransientError as exc:
            msg = (
                f"Odoo PAYMENT action '{action}' timed out on {model}.{method} — "
                "manual review required. NOT retrying automatically."
            )
            write_log_alert(msg, domain="odoo")
            raise RuntimeError(msg) from exc
    return _odoo_rpc_with_retry(models, db, uid, password, model, method, args, kwargs)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_frontmatter(path: Path) -> dict:
    meta: dict = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        if not lines or lines[0].strip() != "---":
            return meta
        for line in lines[1:]:
            if line.strip() == "---":
                break
            if ":" in line:
                k, _, v = line.partition(":")
                meta[k.strip()] = v.strip()
    except Exception:
        pass
    return meta


def _parse_table_field(text: str, field: str) -> str:
    """Extract a value from the markdown table by row label."""
    pattern = rf"\|\s*{re.escape(field)}\s*\|\s*(.+?)\s*\|"
    m = re.search(pattern, text, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _append_log(message: str) -> None:
    today    = datetime.now().strftime("%Y-%m-%d")
    log_file = VAULT / "Logs" / f"log_{today}.md"
    ts       = datetime.now().strftime("%H:%M:%S")
    entry    = f"\n[{ts}] [odoo] {message}\n"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry)


def _update_dashboard(message: str) -> None:
    dashboard = VAULT / "Dashboard.md"
    today     = datetime.now().strftime("%Y-%m-%d")
    entry     = f"\n| Odoo | {message} | {today} |\n"
    text      = dashboard.read_text(encoding="utf-8")
    text      = re.sub(
        r"(\| Odoo \|).*?(\| \d{4}-\d{2}-\d{2} \|)",
        f"| Odoo | {message} | {today} |",
        text,
    )
    dashboard.write_text(text, encoding="utf-8")


# ── Main executor ─────────────────────────────────────────────────────────────

def run_odoo_task(file_path: Path) -> bool:
    """
    Process an approved Odoo task file.
    Returns True on success, False on failure.
    """
    print(f"[ODOO] Processing: {file_path.name}")

    # TASK-10.2: enforce permission boundary — file must be in Approved/odoo/
    try:
        _assert_in_approved(file_path)
    except PermissionError as e:
        print(f"[ODOO] PERMISSION DENIED: {e}")
        _append_log(f"PERMISSION_DENIED: {e}")
        return False

    meta    = _read_frontmatter(file_path)
    content = file_path.read_text(encoding="utf-8")
    action  = meta.get("action", "").strip()

    if action != "create_invoice":
        print(f"[ODOO] Unsupported action '{action}' — skipping")
        return False

    # Parse invoice details from markdown table
    partner_name = _parse_table_field(content, "Customer") or meta.get("partner_name", "")
    partner_email = _parse_table_field(content, "Email") or meta.get("partner_email", "")
    product_name = _parse_table_field(content, "Product") or meta.get("product", "")
    amount_raw   = _parse_table_field(content, "Unit Price") or meta.get("amount", "0")
    invoice_date = _parse_table_field(content, "Invoice Date") or datetime.now().strftime("%Y-%m-%d")

    # Clean amount — strip $ and commas
    amount = float(re.sub(r"[^\d.]", "", amount_raw) or "0")

    if not partner_name or not product_name or amount <= 0:
        print(f"[ODOO] Missing required fields — partner={partner_name}, product={product_name}, amount={amount}")
        _append_log(f"CREATE_DRAFT_INVOICE: FAILED — missing fields (partner={partner_name}, product={product_name}, amount={amount})")
        return False

    print(f"[ODOO] Partner={partner_name}, Product={product_name}, Amount={amount}, Date={invoice_date}")

    try:
        common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        try:
            uid = with_retry(
                max_attempts=3, base_delay=1.0, max_delay=60.0,
                retryable=(TransientError,), log_domain="odoo",
            )(lambda: common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}))()
        except TransientError as exc:
            print(f"[ODOO] Authentication failed after retries: {exc}")
            _append_log(f"CREATE_DRAFT_INVOICE: FAILED — Odoo auth error: {exc}")
            return False
        if not uid:
            print("[ODOO] Authentication failed — invalid credentials")
            _append_log("CREATE_DRAFT_INVOICE: FAILED — Odoo authentication failed")
            return False

        models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

        # Look up or create partner
        partners = odoo_rpc(models, ODOO_DB, uid, ODOO_PASSWORD,
            "res.partner", "search_read",
            [[["name", "=", partner_name]]],
            {"fields": ["id", "name"], "limit": 1},
        )
        if partners:
            partner_id = partners[0]["id"]
            print(f"[ODOO] Found partner ID: {partner_id}")
        else:
            vals = {"name": partner_name, "customer_rank": 1}
            if partner_email:
                vals["email"] = partner_email
            partner_id = odoo_rpc(models, ODOO_DB, uid, ODOO_PASSWORD,
                "res.partner", "create", [vals]
            )
            print(f"[ODOO] Created partner ID: {partner_id}")

        # Look up product
        products = odoo_rpc(models, ODOO_DB, uid, ODOO_PASSWORD,
            "product.product", "search_read",
            [[["name", "ilike", product_name]]],
            {"fields": ["id", "name"], "limit": 1},
        )
        product_id = products[0]["id"] if products else None

        # Build invoice line
        if product_id:
            line = [0, 0, {"product_id": product_id, "quantity": 1, "price_unit": amount}]
        else:
            line = [0, 0, {"name": product_name, "quantity": 1, "price_unit": amount}]

        # Create draft invoice — NEVER call action_post (enforced by PAYMENT_ACTIONS guard)
        invoice_id = odoo_rpc(models, ODOO_DB, uid, ODOO_PASSWORD,
            "account.move", "create",
            [{
                "move_type": "out_invoice",
                "partner_id": partner_id,
                "invoice_date": invoice_date,
                "invoice_line_ids": [line],
            }],
        )
        print(f"[ODOO] Draft invoice created: ID={invoice_id}")

    except Exception as e:
        print(f"[ODOO] XML-RPC error: {e}")
        _append_log(f"CREATE_DRAFT_INVOICE: FAILED — {e}")
        log_action(  # TASK-8.4
            action_type="odoo_invoice_drafted",
            actor="odoo_executor",
            target=file_path.name,
            parameters={"partner": partner_name, "product": product_name, "amount": amount},
            approval_status="approved",
            approved_by="human",
            result=f"failed: {e}",
        )
        return False

    log_action(  # TASK-8.4
        action_type="odoo_invoice_drafted",
        actor="odoo_executor",
        target=file_path.name,
        parameters={
            "partner": partner_name,
            "partner_id": partner_id,
            "product": product_name,
            "amount": amount,
            "invoice_date": invoice_date,
            "invoice_id": invoice_id,
        },
        approval_status="approved",
        approved_by="human",
        result=f"success — invoice_id={invoice_id}",
    )

    # Move to Done/
    done_dir = VAULT / "Done" / "odoo"
    done_dir.mkdir(parents=True, exist_ok=True)
    dest = done_dir / file_path.name
    shutil.move(str(file_path), str(dest))
    print(f"[ODOO] Moved to Done/odoo/: {file_path.name}")

    # Log and dashboard
    log_msg = (
        f"CREATE_DRAFT_INVOICE: Partner \"{partner_name}\" (ID: {partner_id}) "
        f"draft invoice ID: {invoice_id}, amount: ${amount:.2f}, "
        f"product: {product_name}, date: {invoice_date} — Status: success"
    )
    _append_log(log_msg)
    _update_dashboard(f"Draft invoice created: {partner_name} ${amount:.2f}")

    print(f"[ODOO] Done.")
    return True
