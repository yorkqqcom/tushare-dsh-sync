# 架构说明

## 分层

| 层 | 位置 | 职责 |
|----|------|------|
| UI | `client/index.js` | 左栏 `sidebar.panellist` + `main`；Onboarding / Dashboard |
| API | `src/http-api.ts` | loopback `/tushare-sync/api`（首期替代 Typert Remote） |
| Tools | `src/tools/register.ts` | 对话 Agent 可调用 |
| Service | `src/service.ts` | 互斥、运行记录、调度评估 |
| Meta | `src/meta-store.ts` | JSON 文件持久化（控制面） |
| Cron | `src/cron.ts` + Service.tickCron | 插件自有五段 cron |
| Runner | `src/runner.ts` | 子进程拉起 Python engine，解析 JSONL |
| Engine | `engine/tushare_engine` | Tushare 拉取 + SQLite/PG upsert |
| Catalog | `engine/.../catalog/api_catalog.json` | 接口目录与门槛；`permission.py` 阶梯探测 |

权限与勾选缓存于 Meta：`permissionSnapshot`、`selectionByToken`。详见 [`PERMISSION_CATALOG.md`](PERMISSION_CATALOG.md)。

## 为何不用 Host Schedule 执行日更

Host Schedule 到期只向 Session **投递 prompt**，没有第三方静默回调。日更执行路径必须自建 CronDriver。

## 与旧仓差异

- 精简 DDL（见 `engine/tushare_engine/schemas/ddl.py`）
- `adj_hfq` 为 `adj_factor × daily` 近似，非完整 `pro_bar` 链路
- 不对旧仓生产库直连本插件 DDL
