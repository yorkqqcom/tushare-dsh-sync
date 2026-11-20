from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from tushare_engine.adapters.factory import create_store
from tushare_engine.jsonl import emit
from tushare_engine.permission import catalog_static, probe_permission
from tushare_engine.pipeline.daily import run_pipeline, waterline
from tushare_engine.scaffold import scaffold_adapter
from tushare_engine.tushare_client import TushareClient


def _ensure_utf8_stdio() -> None:
    """Windows 下避免 print(JSON) 走 GBK 导致 Node 读成乱码。"""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def print_json(payload: dict[str, Any]) -> None:
    """CLI 结果一律 ASCII-safe JSON（\\uXXXX），跨编码管道无损。"""
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def load_config(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cmd_test_connection(config: dict[str, Any]) -> int:
    try:
        client = TushareClient(config.get("token") or "", float(config.get("api_min_interval_sec") or 0.35))
        df = client.trade_cal("20240101", "20240105")
        store = create_store(config.get("db") or {})
        try:
            store.ensure_schema()
            store.ping()
        finally:
            store.close()
        print_json({"ok": True, "trade_cal_rows": int(len(df))})
        return 0
    except Exception as e:
        print_json({"ok": False, "error": str(e)})
        return 1


def cmd_waterline(config: dict[str, Any]) -> int:
    try:
        store = create_store(config.get("db") or {})
        try:
            wl = waterline(store)
        finally:
            store.close()
        print_json({"ok": True, "waterline": wl})
        return 0
    except Exception as e:
        print_json({"ok": False, "error": str(e)})
        return 1


def cmd_run_pipeline(config: dict[str, Any]) -> int:
    store = create_store(config.get("db") or {})
    client = TushareClient(config.get("token") or "", float(config.get("api_min_interval_sec") or 0.35))
    try:
        return run_pipeline(config, store, client)
    finally:
        store.close()


def cmd_catalog() -> int:
    print_json(catalog_static())
    return 0


def cmd_probe_permission(config: dict[str, Any]) -> int:
    try:
        result = probe_permission(
            str(config.get("token") or ""),
            api_min_interval_sec=float(config.get("api_min_interval_sec") or 0.35),
            independent_flags=dict(config.get("independent_flags") or {}),
            probe_api_ids=list(config.get("probe_api_ids") or []),
        )
        print_json(result)
        return 0
    except Exception as e:
        print_json({"ok": False, "error": str(e)})
        return 1


def cmd_scaffold_adapter(api_id: str, force: bool = False) -> int:
    result = scaffold_adapter(api_id, force=force)
    print_json(result)
    return 0 if result.get("ok") else 1


def main(argv: list[str] | None = None) -> int:
    _ensure_utf8_stdio()
    parser = argparse.ArgumentParser(prog="tushare_engine")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_test = sub.add_parser("test-connection")
    p_test.add_argument("--config", required=True)

    p_wl = sub.add_parser("waterline")
    p_wl.add_argument("--config", required=True)

    p_run = sub.add_parser("run-pipeline")
    p_run.add_argument("--config", required=True)

    sub.add_parser("catalog")

    p_probe = sub.add_parser("probe-permission")
    p_probe.add_argument("--config", required=True)

    p_scaf = sub.add_parser("scaffold-adapter", help="Generate coming_soon stub (not wired to pipeline)")
    p_scaf.add_argument("--id", required=True, help="catalog api id, e.g. income")
    p_scaf.add_argument("--force", action="store_true")

    args = parser.parse_args(argv)
    if args.cmd == "catalog":
        return cmd_catalog()
    if args.cmd == "scaffold-adapter":
        return cmd_scaffold_adapter(args.id, force=bool(args.force))
    config = load_config(args.config)
    if args.cmd == "test-connection":
        return cmd_test_connection(config)
    if args.cmd == "waterline":
        return cmd_waterline(config)
    if args.cmd == "run-pipeline":
        return cmd_run_pipeline(config)
    if args.cmd == "probe-permission":
        return cmd_probe_permission(config)
    emit({"type": "error", "message": f"unknown cmd {args.cmd}"})
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
