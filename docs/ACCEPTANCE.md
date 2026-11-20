# 验收清单

## SQLite

- [ ] `npm run build` 成功
- [ ] `python -m tushare_engine.cli catalog`（`PYTHONPATH=engine`）输出含 `label` / `dailyRecommended`
- [ ] DSH 安装后左侧出现「Tushare 同步」
- [ ] Onboarding：Token + SQLite 测活通过；「范围」步可勾选可用数据集
- [ ] 试跑产生 run 记录；进度步骤为中文名
- [ ] 数据覆盖可查询（记录数 / 起始 / 截至 / 最近更新）
- [ ] 调度启用后 meta.json 中 `schedule.enabled=true`，重启仍在

## 权限目录

- [ ] `probe_permission` 后权限条显示有效档 / 频次 / 探测时间；积分提示标明「仅展示」
- [ ] 低积分 Token：高门槛接口「积分不足」且不可勾选；`start_run` 越权失败
- [ ] ≈2000 档：日更推荐包可全选并跑通
- [ ] 换 Token 后需重探；勾选按指纹分桶；覆盖表仍可读
- [ ] 空勾选无法启动；`coming_soon` 不可进运行队列
- [ ] 独立权限项「我已开通」后触发重探
- [ ] catalog 含 `doc_id`；阶梯含 3000（`stock_st`）

## 同步 / 监控 / 历史回填

- [ ] 侧栏日常页有「同步 / 拉取 / 定时 / 监控」Tab；权限条置顶共用
- [ ] 同步 Tab：可勾选；拉取 Tab：增量 / 历史回填；缺起止日时历史按钮禁用
- [ ] 定时 Tab：可编辑 cron；监控 Tab：无勾选写入；覆盖 / 任务 / 调度只读；拉取与监控均可取消任务
- [ ] `start_run` mode=range 缺日期被服务端拒绝；与增量同一权限闸
- [ ] 探测超时后仍可切 Tab、刷新覆盖

## 扩展接口（除 stk_mins）

- [ ] 5000 档可勾选 stock_st / index_* / fund_* / 财务四表
- [ ] `index_daily` 仅白名单指数；财务/持仓按 period（VIP）
- [ ] 水位表名与中文标签对齐（含 daily_quotes）
- [ ] `stk_mins` 仍不可进队列
- [ ] 日更推荐包仍为原 6 步

## Scaffold

- [ ] `python -m tushare_engine.cli scaffold-adapter --id stk_mins` 生成 stub
- [ ] stub 不在 `run-pipeline` 导入路径中

## PostgreSQL

- [ ] 驱动切换为 postgresql，测活通过（会建表）
- [ ] 至少完成交易日历 + 股票列表写入
- [ ] 覆盖查询正常

## Tools / HTTP

- [ ] `tushare_sync_configure` / `run` / `status` / `cancel`
- [ ] `tushare_sync_probe_permission` / `get_catalog` / `save_selection`
- [ ] `tushare_schedule_upsert` / `list`
- [ ] 二次 `run` 在运行中返回 `already_running`

## 堵塞检修

- [ ] 完全退出 Desktop 后重开：左侧或「更多」可见「Tushare 同步」并可打开
- [ ] 错误/卡住的 python：探测约 45s 内返回 `timeout`，面板仍可点「刷新覆盖」
- [ ] 故意写坏 cron：插件仍加载（回退默认表达式）
- [ ] 跑批日志密集时面板仍可响应
- [ ] 自动探测显示「权限探测中…」，不全局锁死其它按钮
