"""
conftest.py — pytest path setup.
Adds project root and watchers/ to sys.path so all test modules can import
project code without installing the package.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "watchers"))
sys.path.insert(0, str(ROOT / ".claude" / "commands"))
