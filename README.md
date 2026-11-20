# dsh-tushare-sync

DeepSeek Harness 插件：Tushare **日更下载管理**（SQLite / PostgreSQL、步骤化 Web 控制台、插件自有定时任务）。

> 独立仓库；不依赖已 Deprecated 的 `tusharestockForPostgreSQL` 运行时。表结构为精简 DDL，**不**与旧仓 ORM 一一兼容。

## 功能

- **按账号权限的全量接口目录**：探测 Token 档位后勾选可同步数据集（详见 [`docs/PERMISSION_CATALOG.md`](docs/PERMISSION_CATALOG.md)）
- 日更推荐包：交易日历 / 股票列表 / 日线 / 每日指标 / 资金流向 / 后复权
- 可勾选扩展（需积分）：ST、指数、基金、财务、基金持仓等（不含分钟）
- 业务库可选 **SQLite** 或 **PostgreSQL**
- 左栏主面板：**同步 / 拉取 / 定时 / 监控** 四 Tab（共用 Token 返回清单）；拉取面增量 + 历史回填（`range`）
- Agent Tools：`tushare_sync_*` / `tushare_schedule_*`（含 probe / catalog / selection）
- UI API：loopback `POST /tushare-sync/api`
- 定时：插件自有 CronDriver（默认 `30 18 * * 1-5`，`Asia/Shanghai`）；与手动同步共用勾选与权限闸
- coming_soon 接口可用 CLI `scaffold-adapter` 生成 stub（不进日更热路径）

## 如何安装

### 依赖

- Node.js ≥ 22.12
- DeepSeek Harness ≥ 0.2.2-rc.1
- Python ≥ 3.10

### 从 npm 安装（推荐）

包已发布：[dsh-tushare-sync](https://www.npmjs.com/package/dsh-tushare-sync)

在 DeepSeek Harness「添加插件」输入框填：

```text
dsh-tushare-sync
```

或命令行：

```bash
dsh plugin --profile web add dsh-tushare-sync
```

安装后 **必须** 安装 Python engine 依赖（包内仅含 `engine` 源码，不含 wheel）：

```bash
# 插件装入 profile 后，在其包目录下执行，例如：
#   ~/.dsh/profiles/web/node_modules/dsh-tushare-sync/engine
# Windows 常见：
#   %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-tushare-sync\engine
cd <plugin-install-dir>/engine
python -m pip install -r requirements.txt
```

重启 `dsh web`，打开 Web UI 左侧 **「Tushare 同步」**。

### 备选：GitHub Release `.tgz`

预构建包也在 [Releases](https://github.com/yorkqqcom/tushare-dsh-sync/releases)：

```bash
dsh plugin --profile web add https://github.com/yorkqqcom/tushare-dsh-sync/releases/download/v0.1.0/dsh-tushare-sync-0.1.0.tgz
```

### 附录：开发者本地路径安装

```bash
# 在本仓库根目录
npm install
npm run build
python -m pip install -r engine/requirements.txt

dsh plugin --profile <your-profile> add /absolute/path/to/tushare-dsh-sync
```

本地联调（需绝对路径）：

```bash
pnpm dsh web --patch ./profiles/demo/cordis.patch.yml
```

### 附录：打安装包（维护者）

```bash
npm run pack:release   # 产出 dsh-tushare-sync-<version>.tgz
```

推送 tag `vX.Y.Z`（须与 `package.json` 的 `version` 一致）后，GitHub Actions 会自动创建 Release 并上传该 `.tgz`。
## 验收（SQLite）

1. 侧栏打开「Tushare 同步」→ Onboarding 填入 Token，选择 SQLite → 测活 → 保存并探测权限
2. 「范围」步勾选日更推荐（仅可用项）→ 试跑；进度表显示中文步骤名
3. 「监控」Tab 加载覆盖；「同步」Tab 增量 / 历史回填（填起止 YYYYMMDD）
4. 低积分 Token 下高门槛项不可勾；空选或历史缺日期无法启动
5. 调度在同步 Tab 保存后 meta 中 `schedule.enabled=true`，重启仍在

## 验收（PostgreSQL）

同上，驱动选 PostgreSQL，填写 host/port/user/password/database；`test-connection` 会 `ensure_schema`。

## Agent 示例

```
用 tushare_sync_configure 保存 sqlite 连接，然后 tushare_sync_run 增量日更，再用 tushare_sync_status 查看进度。
```

## 目录

```
src/                 Host 插件（service / tools / http-api / cron）
client/              Web 左栏控制台
engine/              Python 下载引擎
packages/            monorepo 角色占位（实现收敛在根包，便于 dsh.client 附着）
profiles/demo/       本地 patch 示例
docs/                补充说明
```

## 安全说明

- Token / DB 密码存于工作区 `.tushare-dsh-sync/meta.json`（可配置 `metaDir`）
- HTTP API 仅 loopback
- 全局单飞：同时只允许一个日更 job

## License

MIT
