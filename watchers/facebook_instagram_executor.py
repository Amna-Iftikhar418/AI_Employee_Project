"""
facebook_instagram_executor.py  (watchers shim — NOT the implementation)

The canonical executor lives at the project root:
    <project_root>/facebook_instagram_executor.py

This shim exists only so that `from facebook_instagram_executor import run_social_post`
resolves to the SAME implementation no matter whether the project root or the
watchers/ directory ends up first on sys.path. Do not add publishing logic here —
edit the root module instead.
"""

import importlib.util
from pathlib import Path

_ROOT_FILE = Path(__file__).parent.parent / "facebook_instagram_executor.py"

_spec = importlib.util.spec_from_file_location("facebook_instagram_executor_root", _ROOT_FILE)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive
    raise ImportError(f"Cannot load canonical executor at {_ROOT_FILE}")

_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

# Re-export the public entry point used by approved_watcher.py
run_social_post = _mod.run_social_post
