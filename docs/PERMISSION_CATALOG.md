# 权限模型与接口目录

## 四层架构

| 层 | 内容 | 真源 |
|----|------|------|
| 1. 规则与规范 | `min_points` / `independent` / `pull` / `implemented`；日更推荐包 | [`api_catalog.json`](../engine/tushare_engine/catalog/api_catalog.json) |
| 2. Token 范围清单 | 探测后的 `apis[]`（可用/锁定/即将支持） | **`probe_permission` 返回**（Meta 可缓存） |
| 3. 官网接口对应 | `api`、`doc_id`、`min_points`（「权限：N积分起」） | [Tushare 数据接口](https://tushare.pro/document/2)（离线写入 catalog，**不**运行时爬站） |
| 4. 下载代码 | `implemented=true` → pipeline；`coming_soon` → CLI scaffold 草稿 | 开发期启用，不自动挂日更 |

运行时开闸、勾选、同步：**只信返回清单** `apis[].status` / `selected_allowed`。`pointsHint` 仅展示。

## Token vs Catalog 冲突

| 冲突点 | 谁为准 |
|--------|--------|
| 插件里有哪些接口 | **Catalog** |
| 该 Token 能否用某已收录接口 | **Token 探测返回** |
| `pointsHint` vs 实测 | **返回状态** |
| `implemented=false` | **Catalog**（不可同步） |

一句话：Catalog 定「有什么 / 是否已实现」；Token 返回定「你能用什么」。

## UI：同步 / 拉取 / 定时 / 监控

同一侧栏面板四 Tab，**同一份** `permissionSnapshot`：

| | 同步 | 拉取 | 定时 | 监控 |
|--|------|------|------|------|
| 清单 | 可勾选 | 只读已选摘要 | 只读已选摘要 | 只读已选 |
| 主操作 | 改勾选 | 增量 / 历史回填 | 编辑并保存 cron | 刷新覆盖 |
| 调度 | — | — | 可编辑 | 只读 |
| 取消任务 | — | 可以 | — | 可以 |

## 定档方式

阶梯实测：120（`daily`）→ 2000（`daily_basic`）→ **3000（`stock_st`）** → 5000（`fund_portfolio`）。权限失败即停。

频次建议：`120→50/分`，`2000/3000→200/分`，`5000→500/分`。

独立权限：`independent: true` 默认锁定，用户「我已开通」后再探测。

## 有效档 → 可开接口（catalog 摘要）

| 有效档≥ | 已实现可开（示例） |
|---------|-------------------|
| 0 | 交易日历、股票列表 |
| 120 | + 日线、后复权 |
| 2000 | + 每日指标、资金流向、指数/基金列表与净值、财务 VIP 等 |
| 3000 | + ST 列表 |
| 5000 | + 基金持仓；财务按报告期走 `*_vip` |

日更推荐包仍为 6 步；其余需在「同步」Tab 勾选。`stk_mins` 仍需单独开通且未实现。

未实现项即使积分够也显示「即将支持」，不可进 `startRun`。

## 目录字段

每条：`id` / `api` / `label` / `domain_label` / `min_points` / `doc_id` / `pull` / `implemented` / …

状态：`available`→可用，`locked_points`→积分不足，`locked_independent`→需单独开通，`coming_soon`→即将支持。

## CLI

```bash
cd engine
$env:PYTHONPATH="engine"   # PowerShell
python -m tushare_engine.cli catalog
python -m tushare_engine.cli probe-permission --config probe.json
python -m tushare_engine.cli scaffold-adapter --id income
```

## HTTP / Tools

- `probe_permission` / `get_catalog` / `save_selection` / `mark_independent`
- `start_run`：`mode=incremental|range`，历史回填传 `startDate`/`endDate`（YYYYMMDD）

## 验收

- 换 Token 后清单状态变化；勾选/同步只跟返回清单
- 同步 Tab 可增量与历史回填；监控 Tab 不改勾选
- 低权限不可越权；未实现不可进队列
- scaffold 只生成 stub，不自动进 pipeline
