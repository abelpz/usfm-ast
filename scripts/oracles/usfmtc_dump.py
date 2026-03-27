"""Write USJ (JSON) and USX (XML) for a USFM file using usfmtc (pip install usfmtc)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import usfmtc


def main() -> None:
    if len(sys.argv) != 4:
        print("usage: usfmtc_dump.py <input.usfm> <out.usj.json> <out.usx>", file=sys.stderr)
        sys.exit(2)
    inf, usj_path, usx_path = sys.argv[1:4]
    root = usfmtc.readFile(inf)
    Path(usj_path).write_text(
        json.dumps(root.outUsj(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    Path(usx_path).write_text(root.outUsx(), encoding="utf-8")


if __name__ == "__main__":
    main()
