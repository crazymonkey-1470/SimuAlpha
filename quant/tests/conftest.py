import os
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# Keep third-party libs from chatting during tests
os.environ.setdefault("NO_COLOR", "1")
os.environ.setdefault("TERM", "dumb")
