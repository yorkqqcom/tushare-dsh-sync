from __future__ import annotations

import json
import sys
from typing import Any


def emit(event: dict[str, Any]) -> None:
    """向 stdout 写一行 JSON（Host runner 解析）。

    ensure_ascii=True：管道仅 ASCII，避免 Windows 默认 GBK 与 Node UTF-8 解码冲突。
    """
    sys.stdout.write(json.dumps(event, ensure_ascii=True) + "\n")
    sys.stdout.flush()
