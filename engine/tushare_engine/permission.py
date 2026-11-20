from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from tushare_engine.catalog import daily_recommended_ids, get_api, list_apis, tier_probes
from tushare_engine.tushare_client import TushareClient

STATUS_AVAILABLE = "available"
STATUS_LOCKED_POINTS = "locked_points"
STATUS_LOCKED_INDEPENDENT = "locked_independent"
STATUS_COMING_SOON = "coming_soon"
STATUS_PROBE_ERROR = "probe_error"

TIER_RATE: dict[int, int] = {0: 50, 120: 50, 2000: 200, 3000: 200, 5000: 500}


def suggested_interval_sec(tier: int) -> float:
    rate = TIER_RATE.get(tier) or 50
    return round(60.0 / max(rate, 1), 3)


def _is_permission_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    needles = ("没有权限", "权限", "积分", "2002", "permission", "privilege", "not authorized")
    return any(n in msg for n in needles)


def _sum_points_hint(user_rows: list[dict[str, Any]]) -> Optional[int]:
    total = 0
    found = False
    now = datetime.now(timezone.utc)
    for row in user_rows:
        exp = str(row.get("end_date") or row.get("expire") or row.get("到期时间") or "")
        pts = row.get("point")
        if pts is None:
            pts = row.get("points")
        if pts is None:
            pts = row.get("积分")
        try:
            value = int(float(pts))
        except (TypeError, ValueError):
            continue
        if exp:
            try:
                raw = exp.replace("/", "-").strip()
                if len(raw) == 8 and raw.isdigit():
                    end = datetime.strptime(raw, "%Y%m%d").replace(tzinfo=timezone.utc)
                else:
                    end = datetime.fromisoformat(raw[:10]).replace(tzinfo=timezone.utc)
                if end.date() < now.date():
                    continue
            except Exception:
                pass
        total += value
        found = True
    return total if found else None


def _probe_api(client: TushareClient, api: str, params: dict[str, Any]) -> tuple[bool, Optional[str]]:
    try:
        df = client.query(api, **params)
        _ = len(df)
        return True, None
    except Exception as e:
        if _is_permission_error(e):
            return False, "permission"
        return False, str(e)


def _status_for_api(
    meta: dict[str, Any],
    *,
    effective_tier: int,
    flags: dict[str, bool],
    targeted: dict[str, dict[str, Any]],
    client: TushareClient,
) -> tuple[str, str, bool]:
    implemented = bool(meta.get("implemented"))
    if not implemented:
        return STATUS_COMING_SOON, "即将支持", False

    if bool(meta.get("independent")):
        api_id = str(meta["id"])
        if not flags.get(api_id):
            return STATUS_LOCKED_INDEPENDENT, "需单独开通", False
        probe = targeted.get(api_id)
        if probe is None:
            api_name = str(meta.get("api") or api_id)
            ok, err = _probe_api(
                client,
                api_name,
                {
                    "ts_code": "000001.SZ",
                    "start_date": "20240102",
                    "end_date": "20240102",
                    "freq": "1min",
                },
            )
            probe = {"ok": ok, "error": err}
            targeted[api_id] = probe
        if probe.get("ok"):
            return STATUS_AVAILABLE, "可用", True
        if probe.get("error") == "permission":
            return STATUS_LOCKED_INDEPENDENT, "需单独开通", False
        return STATUS_PROBE_ERROR, "探测失败", False

    need = int(meta.get("min_points") or 0)
    if need > 0 and effective_tier < need:
        return STATUS_LOCKED_POINTS, f"积分不足(需≥{need})", False
    return STATUS_AVAILABLE, "可用", True


def probe_permission(
    token: str,
    *,
    api_min_interval_sec: float = 0.35,
    independent_flags: Optional[dict[str, bool]] = None,
    probe_api_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    """阶梯实测定档 + 静态目录闸；pro.user 仅作积分提示。"""
    flags = {str(k): bool(v) for k, v in (independent_flags or {}).items()}
    client = TushareClient(token, api_min_interval_sec)

    points_hint: Optional[int] = None
    user_error: Optional[str] = None
    try:
        user_df = client.user()
        if user_df is not None and not user_df.empty:
            points_hint = _sum_points_hint(user_df.to_dict(orient="records"))
    except Exception as e:
        user_error = str(e)

    effective_tier = 0
    ladder: list[dict[str, Any]] = []
    for item in sorted(tier_probes(), key=lambda x: int(x.get("tier") or 0)):
        tier = int(item.get("tier") or 0)
        api = str(item.get("api") or "")
        params = dict(item.get("params") or {})
        ok, err = _probe_api(client, api, params)
        ladder.append({"tier": tier, "api": api, "ok": ok, "error": err})
        if ok:
            effective_tier = max(effective_tier, tier)
        else:
            break

    targeted: dict[str, dict[str, Any]] = {}
    for api_id in probe_api_ids or []:
        meta = get_api(api_id)
        if not meta:
            continue
        api_name = str(meta.get("api") or api_id)
        if api_name == "stk_mins":
            params = {
                "ts_code": "000001.SZ",
                "start_date": "20240102",
                "end_date": "20240102",
                "freq": "1min",
            }
        else:
            params = {"limit": 1}
        ok, err = _probe_api(client, api_name, params)
        targeted[api_id] = {"ok": ok, "error": err}

    apis_out: list[dict[str, Any]] = []
    for meta in list_apis():
        status, status_label, allowed = _status_for_api(
            meta,
            effective_tier=effective_tier,
            flags=flags,
            targeted=targeted,
            client=client,
        )
        apis_out.append(
            {
                "id": meta["id"],
                "api": meta.get("api"),
                "label": meta.get("label"),
                "domain": meta.get("domain"),
                "domain_label": meta.get("domain_label"),
                "min_points": int(meta.get("min_points") or 0),
                "doc_id": meta.get("doc_id"),
                "independent": bool(meta.get("independent")),
                "implemented": bool(meta.get("implemented")),
                "vip_api": meta.get("vip_api"),
                "pull": meta.get("pull"),
                "page_size": meta.get("page_size"),
                "est_calls_daily": meta.get("est_calls_daily"),
                "volume_hint": meta.get("volume_hint"),
                "status": status,
                "status_label": status_label,
                # 运行时开闸只信本字段；pointsHint / min_points 不单独开闸
                "selected_allowed": allowed,
            }
        )

    return {
        "ok": True,
        "pointsHint": points_hint,
        "pointsHintError": user_error,
        "effectiveTier": effective_tier,
        "suggestedRatePerMin": TIER_RATE.get(effective_tier) or TIER_RATE.get(120, 50),
        "suggestedApiMinIntervalSec": suggested_interval_sec(effective_tier if effective_tier else 120),
        "ladder": ladder,
        "dailyRecommended": daily_recommended_ids(),
        "apis": apis_out,
        "probedAt": datetime.now(timezone.utc).isoformat(),
    }


def catalog_static() -> dict[str, Any]:
    apis = []
    for meta in list_apis():
        coming = not meta.get("implemented")
        apis.append(
            {
                **meta,
                "status": STATUS_COMING_SOON if coming else "unknown",
                "status_label": "即将支持" if coming else "未探测",
                "selected_allowed": False,
            }
        )
    return {
        "ok": True,
        "dailyRecommended": daily_recommended_ids(),
        "apis": apis,
    }
