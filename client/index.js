/**
 * 侧栏「Tushare 同步」——权限目录 + 数据覆盖优先（A 股习惯）+ 调度。
 * ModuleLoader factory 格式（对齐官方 client 产物 / fanqie 插件）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-tushare-sync',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')
    var PANEL_ID = 'tushare-sync'
    var useState = React.useState
    var useEffect = React.useEffect
    var useCallback = React.useCallback
    var useRef = React.useRef

    function h(type, props) {
      var children = Array.prototype.slice.call(arguments, 2)
      return React.createElement.apply(React, [type, props].concat(children))
    }

    var WATERLINE_LABELS = {
      trade_cal: '交易日历',
      stock_basic: '股票列表',
      daily: '日线行情',
      daily_quotes: '日线行情',
      daily_basic: '每日指标',
      moneyflow: '个股资金流向',
      adj_hfq: '后复权行情',
      adj_quotes: '后复权行情',
      stock_st: 'ST股票列表',
      income: '利润表',
      balancesheet: '资产负债表',
      cashflow: '现金流量表',
      fina_indicator: '财务指标',
      fund_basic: '基金列表',
      fund_nav: '基金净值',
      fund_portfolio: '基金持仓',
      index_basic: '指数列表',
      index_daily: '指数日线',
      index_member_all: '指数成分（申万等）',
      stk_mins: '股票分钟行情',
    }

    var DOMAIN_LABELS = {
      basic: '基础信息',
      daily: '日行情',
      moneyflow: '资金流向',
      adj: '复权',
      fina: '财务',
      fund: '基金',
      index: '指数',
      mins: '分钟行情',
    }

    var STATUS_LABELS = {
      available: '可用',
      locked_points: '积分不足',
      locked_independent: '需单独开通',
      coming_soon: '即将支持',
      probe_error: '探测失败',
      unknown: '未探测',
    }

    var STEP_LABELS = Object.assign({}, WATERLINE_LABELS)

    var STATUS_ZH = {
      queued: '排队',
      running: '进行中',
      completed: '完成',
      success: '完成',
      failed: '失败',
      cancelled: '已取消',
      pending: '等待',
      skipped: '跳过',
    }

    function SyncIcon(props) {
      var size = (props && props.size) || 20
      var active = !!(props && props.active)
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 2 : 1.75,
          'aria-hidden': true,
        },
        h('path', { d: 'M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }),
        h('path', { d: 'M14 3v5h5' }),
        h('path', { d: 'M8 13h8M8 17h5' }),
      )
    }

    function api(action, payload) {
      return fetch('/tushare-sync/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      }).then(function (res) {
        return res
          .json()
          .catch(function () {
            return { ok: false, error: 'invalid json' }
          })
          .then(function (data) {
            if (!res.ok && data && data.ok !== false) data.ok = false
            if (!res.ok && !data.error) data.error = 'HTTP ' + res.status
            return data
          })
      })
    }

    var S = {
      root: {
        padding: '16px 18px 36px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        color: 'var(--ds-color-text, inherit)',
        maxWidth: 960,
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'auto',
      },
      h1: { fontSize: 18, fontWeight: 650, margin: '0 0 4px' },
      lead: { fontSize: 13, opacity: 0.78, margin: '0 0 12px', lineHeight: 1.5 },
      err: {
        color: '#b91c1c',
        fontSize: 13,
        marginBottom: 10,
        padding: '8px 10px',
        borderRadius: 4,
        background: 'rgba(185,28,28,0.08)',
      },
      ok: {
        color: 'var(--ds-color-text, inherit)',
        fontSize: 13,
        marginBottom: 10,
        padding: '8px 10px',
        borderRadius: 4,
        border: '1px solid rgba(127,127,127,0.28)',
        background: 'rgba(127,127,127,0.06)',
      },
      card: {
        padding: '12px 14px',
        borderRadius: 6,
        border: '1px solid var(--ds-color-border, rgba(127,127,127,0.28))',
        background: 'var(--ds-color-bg-soft, rgba(127,127,127,0.04))',
        marginBottom: 12,
      },
      row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
      label: { fontSize: 13, minWidth: 88, opacity: 0.8 },
      input: {
        flex: 1,
        minWidth: 140,
        padding: '6px 8px',
        borderRadius: 4,
        border: '1px solid var(--ds-color-border, rgba(127,127,127,0.35))',
        background: 'transparent',
        color: 'inherit',
        fontSize: 13,
      },
      btn: {
        border: '1px solid var(--ds-color-border, rgba(127,127,127,0.35))',
        background: 'transparent',
        borderRadius: 4,
        padding: '5px 10px',
        cursor: 'pointer',
        fontSize: 13,
        color: 'inherit',
      },
      primary: {
        border: 'none',
        background: 'var(--ds-color-accent, #2563eb)',
        color: '#fff',
        borderRadius: 4,
        padding: '7px 14px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
      },
      muted: { fontSize: 12, opacity: 0.65, lineHeight: 1.5 },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
      th: {
        textAlign: 'left',
        padding: '5px 6px',
        borderBottom: '1px solid rgba(127,127,127,0.25)',
        opacity: 0.75,
        whiteSpace: 'nowrap',
      },
      td: { padding: '5px 6px', borderBottom: '1px solid rgba(127,127,127,0.12)', verticalAlign: 'top' },
      log: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        maxHeight: 160,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        background: 'rgba(0,0,0,0.18)',
        padding: 8,
        borderRadius: 4,
      },
      steps: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
      chip: {
        padding: '3px 9px',
        borderRadius: 4,
        fontSize: 12,
        border: '1px solid rgba(127,127,127,0.3)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      chipOn: { background: 'rgba(37,99,235,0.12)', borderColor: '#2563eb' },
      badge: {
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 11,
        border: '1px solid rgba(127,127,127,0.3)',
      },
      apiSub: { fontSize: 11, opacity: 0.55 },
      domainH: { fontWeight: 600, fontSize: 13, margin: '10px 0 4px', opacity: 0.9 },
    }

    function statusTone(st) {
      if (st === 'failed' || st === 'cancelled') return '#b91c1c'
      if (st === 'running' || st === 'queued') return '#2563eb'
      return 'inherit'
    }

    function permBadgeStyle(status) {
      if (status === 'available') return { borderColor: 'rgba(37,99,235,0.45)' }
      if (status === 'coming_soon') return { opacity: 0.7 }
      if (status === 'locked_points' || status === 'locked_independent') {
        return { borderColor: 'rgba(185,28,28,0.35)', opacity: 0.85 }
      }
      return {}
    }

    function zhStatus(st) {
      return STATUS_ZH[st] || st || '—'
    }

    function datasetLabel(id) {
      return WATERLINE_LABELS[id] || id
    }

    function looksGarbled(s) {
      if (s == null || s === '') return true
      return /[\uFFFD\uFFFE\uFFFF]/.test(String(s)) || /�/.test(String(s))
    }

    function apiDisplayLabel(a) {
      if (!a) return '—'
      var local = WATERLINE_LABELS[a.id]
      if (local) return local
      if (a.label && !looksGarbled(a.label)) return a.label
      return a.id
    }

    function domainDisplayLabel(a) {
      if (!a) return '其他'
      var local = DOMAIN_LABELS[a.domain]
      if (local) return local
      if (a.domain_label && !looksGarbled(a.domain_label)) return a.domain_label
      return a.domain || '其他'
    }

    function statusDisplayLabel(a) {
      if (!a) return '—'
      if (a.status_label && !looksGarbled(a.status_label)) return a.status_label
      if (a.status === 'locked_points' && a.min_points) {
        return '积分不足(需≥' + a.min_points + ')'
      }
      return STATUS_LABELS[a.status] || a.status || '—'
    }

    function SyncPanel() {
      var _desc = useState(null)
      var desc = _desc[0]
      var setDesc = _desc[1]
      var _err = useState('')
      var err = _err[0]
      var setErr = _err[1]
      var _msg = useState('')
      var msg = _msg[0]
      var setMsg = _msg[1]
      var _busy = useState(false)
      var busy = _busy[0]
      var setBusy = _busy[1]
      var _probing = useState(false)
      var probing = _probing[0]
      var setProbing = _probing[1]
      var formHydrated = useRef(false)
      var formEditing = useRef(false)
      var _wizard = useState(false)
      var forceWizard = _wizard[0]
      var setForceWizard = _wizard[1]
      var _step = useState(0)
      var step = _step[0]
      var setStep = _step[1]
      var _form = useState({
        token: '',
        dbDriver: 'sqlite',
        sqlitePath: '',
        pgHost: '127.0.0.1',
        pgPort: 5432,
        pgUser: 'postgres',
        pgPassword: '',
        pgDatabase: 'tushare_sync',
        apiMinIntervalSec: 0.35,
        defaultAdjType: 'hfq',
        cronEnabled: false,
        cronExpression: '30 18 * * 1-5',
        timeZone: 'Asia/Shanghai',
      })
      var form = _form[0]
      var setForm = _form[1]
      var _water = useState(null)
      var water = _water[0]
      var setWater = _water[1]
      var _runs = useState([])
      var runs = _runs[0]
      var setRuns = _runs[1]
      var _active = useState(null)
      var active = _active[0]
      var setActive = _active[1]
      var _permission = useState(null)
      var permission = _permission[0]
      var setPermission = _permission[1]
      var _selection = useState([])
      var selection = _selection[0]
      var setSelection = _selection[1]
      var _filter = useState('all')
      var filter = _filter[0]
      var setFilter = _filter[1]
      var _collapsed = useState({})
      var collapsed = _collapsed[0]
      var setCollapsed = _collapsed[1]
      var _panelTab = useState('sync')
      var panelTab = _panelTab[0]
      var setPanelTab = _panelTab[1]
      var _histStart = useState('')
      var histStart = _histStart[0]
      var setHistStart = _histStart[1]
      var _histEnd = useState('')
      var histEnd = _histEnd[0]
      var setHistEnd = _histEnd[1]
      var probedOnce = useRef(false)

      var refresh = useCallback(function () {
        return api('describe')
          .then(function (d) {
            setDesc(d)
            if (d && d.connection && (!formHydrated.current || !formEditing.current)) {
              formHydrated.current = true
              setForm(function (prev) {
                return Object.assign({}, prev, {
                  dbDriver: d.connection.dbDriver || 'sqlite',
                  sqlitePath: d.connection.sqlitePath || prev.sqlitePath,
                  pgHost: d.connection.pgHost || prev.pgHost,
                  pgPort: d.connection.pgPort || prev.pgPort,
                  pgUser: d.connection.pgUser || prev.pgUser,
                  pgDatabase: d.connection.pgDatabase || prev.pgDatabase,
                  apiMinIntervalSec: d.connection.apiMinIntervalSec || prev.apiMinIntervalSec,
                  defaultAdjType: d.connection.defaultAdjType || prev.defaultAdjType,
                  cronEnabled: !!(d.schedule && d.schedule.enabled),
                  cronExpression: (d.schedule && d.schedule.cronExpression) || prev.cronExpression,
                  timeZone: (d.schedule && d.schedule.timeZone) || prev.timeZone,
                })
              })
            }
            if (d && Array.isArray(d.selection)) setSelection(d.selection)
            if (d && d.permissionSnapshot) setPermission(d.permissionSnapshot)
            return api('list_runs', { limit: 15 })
          })
          .then(function (r) {
            if (r && r.runs) setRuns(r.runs)
            var aid = r && r.activeRunId
            if (aid) {
              return api('get_run', { runId: aid }).then(function (gr) {
                if (gr && gr.run) setActive(gr.run)
              })
            }
            setActive(null)
          })
          .catch(function (e) {
            setErr(String(e && e.message ? e.message : e))
          })
      }, [])

      useEffect(function () {
        var cancelled = false
        var timer = null
        function tick() {
          if (cancelled) return
          refresh().finally(function () {
            if (cancelled) return
            var ms = 8000
            api('list_runs', { limit: 1 })
              .then(function (r) {
                if (r && r.activeRunId) ms = 3000
              })
              .catch(function () {})
              .finally(function () {
                if (!cancelled) timer = setTimeout(tick, ms)
              })
          })
        }
        tick()
        return function () {
          cancelled = true
          if (timer) clearTimeout(timer)
        }
      }, [refresh])

      // 首次进入日常页且无 snapshot：静默探测（不全局 busy）
      useEffect(function () {
        if (!desc || !desc.configured || forceWizard) return
        if (probedOnce.current) return
        if (desc.permissionReady && desc.permissionSnapshot) {
          setPermission(desc.permissionSnapshot)
          if (Array.isArray(desc.selection)) setSelection(desc.selection)
          probedOnce.current = true
          return
        }
        if (!desc.connection || !desc.connection.tokenConfigured) return
        probedOnce.current = true
        setProbing(true)
        api('probe_permission', { force: false })
          .then(function (d) {
            if (d && d.ok && d.permission) {
              setPermission(d.permission)
              if (Array.isArray(d.selection)) setSelection(d.selection)
            } else if (d && d.permission) {
              setPermission(d.permission)
              if (d.error) setErr(String(d.error))
            } else if (d && d.error) {
              setErr(String(d.error))
            }
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e && e.message ? e.message : e))
          })
          .finally(function () {
            setProbing(false)
          })
      }, [desc, forceWizard, refresh])

      function setField(key, value) {
        formEditing.current = true
        setForm(function (prev) {
          var next = Object.assign({}, prev)
          next[key] = value
          return next
        })
      }

      function saveConnection() {
        setBusy(true)
        setErr('')
        setMsg('')
        return api('save_connection', {
          token: form.token || undefined,
          dbDriver: form.dbDriver,
          sqlitePath: form.sqlitePath,
          pgHost: form.pgHost,
          pgPort: Number(form.pgPort),
          pgUser: form.pgUser,
          pgPassword: form.pgPassword || undefined,
          pgDatabase: form.pgDatabase,
          apiMinIntervalSec: Number(form.apiMinIntervalSec),
          defaultAdjType: form.defaultAdjType,
        })
          .then(function (d) {
            if (d && d.ok === false) throw new Error(d.error || 'save failed')
            setMsg('连接已保存')
            setForm(function (prev) {
              return Object.assign({}, prev, { token: '', pgPassword: '' })
            })
            probedOnce.current = false
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function testConnection() {
        setBusy(true)
        setErr('')
        setMsg('')
        return api('test_connection', {
          token: form.token || undefined,
          dbDriver: form.dbDriver,
          sqlitePath: form.sqlitePath,
          pgHost: form.pgHost,
          pgPort: Number(form.pgPort),
          pgUser: form.pgUser,
          pgPassword: form.pgPassword || undefined,
          pgDatabase: form.pgDatabase,
        })
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || 'test failed')
            setMsg('连通性正常' + (d.trade_cal_rows != null ? '（交易日历样例 ' + d.trade_cal_rows + ' 行）' : ''))
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function probePermission(force) {
        setProbing(true)
        setErr('')
        setMsg('')
        return api('probe_permission', { force: force !== false })
          .then(function (d) {
            if (d && d.permission) setPermission(d.permission)
            if (d && Array.isArray(d.selection)) setSelection(d.selection)
            if (!d || !d.ok) {
              throw new Error((d && d.error) || '探测失败')
            }
            setMsg('权限已更新' + (d.fromCache ? '（缓存）' : ''))
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setProbing(false)
          })
      }

      function persistSelection(nextIds) {
        setSelection(nextIds)
        return api('save_selection', { ids: nextIds }).then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '保存勾选失败')
          if (Array.isArray(d.selection)) setSelection(d.selection)
          return d
        })
      }

      function startRun(trigger) {
        if (!selection || !selection.length) {
          setErr('请先勾选可用数据集')
          return Promise.resolve()
        }
        setBusy(true)
        setErr('')
        setMsg('')
        return api('start_run', { mode: 'incremental', trigger: trigger || 'manual' })
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || 'start failed')
            setMsg('已启动增量同步 ' + d.runId)
            setForceWizard(false)
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function startHistoryRun() {
        var start = String(histStart || '').trim()
        var end = String(histEnd || '').trim()
        if (!selection || !selection.length) {
          setErr('请先勾选可用数据集')
          return Promise.resolve()
        }
        if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
          setErr('历史回填需填写起止交易日 YYYYMMDD')
          return Promise.resolve()
        }
        if (start > end) {
          setErr('起始交易日不能晚于结束交易日')
          return Promise.resolve()
        }
        setBusy(true)
        setErr('')
        setMsg('')
        return api('start_run', {
          mode: 'range',
          startDate: start,
          endDate: end,
          trigger: 'manual',
        })
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || 'start failed')
            setMsg('已启动历史回填 ' + d.runId + '（' + start + '–' + end + '）')
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function cancelRun() {
        setBusy(true)
        return api('cancel_run', {})
          .then(refresh)
          .finally(function () {
            setBusy(false)
          })
      }

      function loadWaterline() {
        setBusy(true)
        return api('waterline')
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || '覆盖查询失败')
            setWater(d.waterline || {})
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function saveSchedule() {
        setBusy(true)
        return api('upsert_schedule', {
          enabled: !!form.cronEnabled,
          cronExpression: form.cronExpression,
          timeZone: form.timeZone || 'Asia/Shanghai',
        })
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || 'schedule failed')
            setMsg('定时已保存')
            return refresh()
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function toggleSelect(id, allowed) {
        if (!allowed) return
        var set = {}
        selection.forEach(function (x) {
          set[x] = true
        })
        if (set[id]) delete set[id]
        else set[id] = true
        var next = Object.keys(set)
        setBusy(true)
        persistSelection(next)
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function selectAvailable() {
        var apis = (permission && permission.apis) || []
        var next = apis.filter(function (a) {
          return a.selected_allowed && a.implemented
        }).map(function (a) {
          return a.id
        })
        setBusy(true)
        persistSelection(next)
          .then(function () {
            setMsg('已全选可用数据集')
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function selectDailyRecommended() {
        var rec = (permission && permission.dailyRecommended) || Object.keys(STEP_LABELS)
        var allowed = {}
        ;((permission && permission.apis) || []).forEach(function (a) {
          if (a.selected_allowed && a.implemented) allowed[a.id] = true
        })
        var next = rec.filter(function (id) {
          return allowed[id]
        })
        setBusy(true)
        persistSelection(next)
          .then(function () {
            setMsg('已勾选日更推荐包')
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function clearSelection() {
        setBusy(true)
        persistSelection([])
          .then(function () {
            setMsg('已清空勾选')
          })
          .catch(function (e) {
            setErr(String(e.message || e))
          })
          .finally(function () {
            setBusy(false)
          })
      }

      function markOpened(apiId) {
        setBusy(true)
        return api('mark_independent', { apiId: apiId, opened: true })
          .then(function (d) {
            if (!d || !d.ok) throw new Error((d && d.error) || '标记失败')
            return probePermission(true)
          })
          .catch(function (e) {
            setErr(String(e.message || e))
            setBusy(false)
          })
      }

      var configured = !!(desc && desc.configured)
      var showWizard = forceWizard || !configured
      var apis = (permission && permission.apis) || []
      var selectedSet = {}
      selection.forEach(function (id) {
        selectedSet[id] = true
      })

      function filteredApis() {
        return apis.filter(function (a) {
          if (filter === 'available') return a.status === 'available'
          if (filter === 'implemented') return !!a.implemented
          return true
        })
      }

      function groupByDomain(list) {
        var order = []
        var map = {}
        list.forEach(function (a) {
          var key = domainDisplayLabel(a)
          if (!map[key]) {
            map[key] = []
            order.push(key)
          }
          map[key].push(a)
        })
        return { order: order, map: map }
      }

      function renderCatalog(compact, readOnly) {
        var list = readOnly
          ? apis.filter(function (a) {
              return !!selectedSet[a.id]
            })
          : filteredApis()
        var grouped = groupByDomain(list)
        var nodes = []
        if (!readOnly) {
          nodes.push(
            h(
              'div',
              { style: S.row },
              h(
                'button',
                { type: 'button', style: S.btn, disabled: busy || !permission, onClick: selectAvailable },
                '全选可用',
              ),
              h(
                'button',
                { type: 'button', style: S.btn, disabled: busy || !permission, onClick: selectDailyRecommended },
                '日更推荐',
              ),
              h(
                'button',
                { type: 'button', style: S.btn, disabled: busy, onClick: clearSelection },
                '清空',
              ),
              h(
                'span',
                { style: Object.assign({}, S.muted, { marginLeft: 4 }) },
                '筛选',
              ),
              ['all', 'available', 'implemented'].map(function (f) {
                var label = f === 'all' ? '全部' : f === 'available' ? '仅可用' : '已实现'
                return h(
                  'button',
                  {
                    key: f,
                    type: 'button',
                    style: Object.assign({}, S.chip, filter === f ? S.chipOn : null),
                    onClick: function () {
                      setFilter(f)
                    },
                  },
                  label,
                )
              }),
            ),
          )
        } else {
          nodes.push(
            h(
              'p',
              { style: S.muted },
              '只读：当前已选 ' + selection.length + ' 项（改勾选请到「同步」Tab）',
            ),
          )
        }
        if (!permission) {
          nodes.push(h('p', { style: S.muted }, '尚未探测权限，请先「重新探测」。'))
          return nodes
        }
        if (readOnly && !list.length) {
          nodes.push(h('p', { style: S.muted }, '尚未勾选数据集'))
          return nodes
        }
        var implAll = 0
        apis.forEach(function (a) {
          if (a.implemented) implAll += 1
        })
        if (!readOnly) {
          nodes.push(
            h(
              'p',
              { style: Object.assign({}, S.muted, { marginTop: 0 }) },
              '目录：已实现 ' + implAll + ' / 共 ' + apis.length + ' 个接口（默认收起，点击域名展开）',
            ),
          )
        }
        grouped.order.forEach(function (domain) {
          // 默认收起：未写入 collapsed 或 true 为收起；显式 false 为展开
          var isCollapsed = collapsed[domain] !== false
          var domainAll = apis.filter(function (a) {
            return domainDisplayLabel(a) === domain
          })
          var domainImpl = 0
          domainAll.forEach(function (a) {
            if (a.implemented) domainImpl += 1
          })
          var countText = ' · 已实现 ' + domainImpl + '/' + domainAll.length
          nodes.push(
            h(
              'div',
              {
                key: 'h-' + domain,
                style: Object.assign({}, S.domainH, { cursor: 'pointer' }),
                onClick: function () {
                  setCollapsed(function (prev) {
                    var n = Object.assign({}, prev)
                    var nowCollapsed = prev[domain] !== false
                    n[domain] = nowCollapsed ? false : true
                    return n
                  })
                },
              },
              (isCollapsed ? '▶ ' : '▼ ') + domain + countText,
            ),
          )
          if (isCollapsed) return
          nodes.push(
            h(
              'table',
              { key: 't-' + domain, style: S.table },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  readOnly ? null : h('th', { style: S.th }, '勾选'),
                  h('th', { style: S.th }, '数据集'),
                  compact ? null : h('th', { style: S.th }, '接口'),
                  h('th', { style: S.th }, '状态'),
                ),
              ),
              h(
                'tbody',
                null,
                grouped.map[domain].map(function (a) {
                  var can = !!a.selected_allowed
                  return h(
                    'tr',
                    { key: a.id, style: can ? null : { opacity: 0.72 } },
                    readOnly
                      ? null
                      : h(
                          'td',
                          { style: S.td },
                          h('input', {
                            type: 'checkbox',
                            checked: !!selectedSet[a.id],
                            disabled: !can || busy,
                            onChange: function () {
                              toggleSelect(a.id, can)
                            },
                          }),
                        ),
                    h(
                      'td',
                      { style: S.td },
                      apiDisplayLabel(a),
                      a.volume_hint && !compact && !looksGarbled(a.volume_hint)
                        ? h('div', { style: S.apiSub }, a.volume_hint)
                        : null,
                    ),
                    compact
                      ? null
                      : h('td', { style: S.td }, h('span', { style: S.apiSub }, a.api || a.id)),
                    h(
                      'td',
                      { style: S.td },
                      h(
                        'span',
                        { style: Object.assign({}, S.badge, permBadgeStyle(a.status)) },
                        statusDisplayLabel(a),
                      ),
                      !readOnly && a.independent && a.status === 'locked_independent'
                        ? h(
                            'button',
                            {
                              type: 'button',
                              style: Object.assign({}, S.btn, { marginLeft: 6, padding: '2px 6px', fontSize: 11 }),
                              disabled: busy,
                              onClick: function () {
                                markOpened(a.id)
                              },
                            },
                            '我已开通',
                          )
                        : null,
                    ),
                  )
                }),
              ),
            ),
          )
        })
        return nodes
      }

      var children = []
      children.push(
        h(
          'div',
          { style: S.row },
          h('h1', { style: Object.assign({}, S.h1, { flex: 1, margin: 0 }) }, 'Tushare 同步'),
          h(
            'button',
            {
              type: 'button',
              style: S.btn,
              disabled: busy,
              onClick: function () {
                refresh()
                loadWaterline()
              },
            },
            '刷新',
          ),
          configured
            ? h(
                'button',
                {
                  type: 'button',
                  style: S.btn,
                  onClick: function () {
                    setForceWizard(true)
                    setStep(0)
                  },
                },
                '重新配置连接',
              )
            : null,
        ),
      )
      children.push(
        h(
          'p',
          { style: S.lead },
          showWizard
            ? '首次配置：连接 Tushare 与数据库，按权限选择数据集后试跑。'
            : '同步勾选 · 拉取执行 · 定时编辑 · 监控覆盖；开闸只信 Token 返回清单。',
        ),
      )
      if (err) children.push(h('div', { style: S.err }, err))
      if (msg) children.push(h('div', { style: S.ok }, msg))

      if (showWizard) {
        children.push(
          h(
            'div',
            { style: S.steps },
            ['连接', '范围', '试跑'].map(function (label, i) {
              return h(
                'button',
                {
                  key: label,
                  type: 'button',
                  style: Object.assign({}, S.chip, i === step ? S.chipOn : null),
                  onClick: function () {
                    setStep(i)
                  },
                },
                i + 1 + '. ' + label,
              )
            }),
          ),
        )

        if (step === 0) {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 8 } }, '连接'),
              h('div', { style: S.row }, h('span', { style: S.label }, 'Token'), h('input', {
                style: S.input,
                type: 'password',
                placeholder: desc && desc.connection && desc.connection.tokenConfigured ? '已配置（留空不改）' : 'Tushare Pro Token',
                value: form.token,
                onChange: function (e) {
                  setField('token', e.target.value)
                },
              })),
              h(
                'div',
                { style: S.row },
                h('span', { style: S.label }, '数据库'),
                h(
                  'select',
                  {
                    style: S.input,
                    value: form.dbDriver,
                    onChange: function (e) {
                      setField('dbDriver', e.target.value)
                    },
                  },
                  h('option', { value: 'sqlite' }, 'SQLite'),
                  h('option', { value: 'postgresql' }, 'PostgreSQL'),
                ),
              ),
              form.dbDriver === 'sqlite'
                ? h('div', { style: S.row }, h('span', { style: S.label }, 'SQLite 路径'), h('input', {
                    style: S.input,
                    value: form.sqlitePath,
                    onChange: function (e) {
                      setField('sqlitePath', e.target.value)
                    },
                  }))
                : h(
                    'div',
                    null,
                    h('div', { style: S.row }, h('span', { style: S.label }, 'Host'), h('input', {
                      style: S.input,
                      value: form.pgHost,
                      onChange: function (e) {
                        setField('pgHost', e.target.value)
                      },
                    })),
                    h('div', { style: S.row }, h('span', { style: S.label }, 'Port'), h('input', {
                      style: S.input,
                      value: form.pgPort,
                      onChange: function (e) {
                        setField('pgPort', e.target.value)
                      },
                    })),
                    h('div', { style: S.row }, h('span', { style: S.label }, 'User'), h('input', {
                      style: S.input,
                      value: form.pgUser,
                      onChange: function (e) {
                        setField('pgUser', e.target.value)
                      },
                    })),
                    h('div', { style: S.row }, h('span', { style: S.label }, 'Password'), h('input', {
                      style: S.input,
                      type: 'password',
                      value: form.pgPassword,
                      onChange: function (e) {
                        setField('pgPassword', e.target.value)
                      },
                    })),
                    h('div', { style: S.row }, h('span', { style: S.label }, 'Database'), h('input', {
                      style: S.input,
                      value: form.pgDatabase,
                      onChange: function (e) {
                        setField('pgDatabase', e.target.value)
                      },
                    })),
                  ),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 8 } },
                h(
                  'button',
                  { type: 'button', style: S.btn, disabled: busy, onClick: testConnection },
                  '测活',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.primary,
                    disabled: busy,
                    onClick: function () {
                      saveConnection().then(function () {
                        setStep(1)
                        return probePermission(true)
                      })
                    },
                  },
                  '保存并下一步',
                ),
              ),
            ),
          )
        } else if (step === 1) {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 8 } }, '同步范围'),
              h(
                'p',
                { style: S.muted },
                '默认勾选「日更推荐 ∩ 当前可用」。无权限项不可勾选。',
              ),
              h(
                'button',
                {
                  type: 'button',
                  style: Object.assign({}, S.btn, { marginBottom: 8 }),
                  disabled: busy,
                  onClick: function () {
                    return probePermission(true)
                  },
                },
                '重新探测权限',
              ),
              renderCatalog(true),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 12 } },
                h(
                  'button',
                  { type: 'button', style: S.btn, onClick: function () { setStep(0) } },
                  '上一步',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.primary,
                    disabled: busy || !selection.length,
                    onClick: function () {
                      setStep(2)
                    },
                  },
                  '下一步',
                ),
              ),
            ),
          )
        } else {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 8 } }, '试跑'),
              h(
                'p',
                { style: S.muted },
                '将按已勾选且可用的数据集做一次增量同步（Asia/Shanghai）。',
              ),
              h(
                'p',
                { style: S.muted },
                '已选：' +
                  (selection.length
                    ? selection.map(datasetLabel).join('、')
                    : '无（请返回上一步勾选）'),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 8 } },
                h(
                  'button',
                  { type: 'button', style: S.btn, onClick: function () { setStep(1) } },
                  '上一步',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.primary,
                    disabled: busy || !selection.length,
                    onClick: function () {
                      startRun('onboarding')
                    },
                  },
                  '立即试跑',
                ),
              ),
            ),
          )
        }
      } else {
        // Dashboard：同步 / 监控 双 Tab，共用 permissionSnapshot
        var schedule = (desc && desc.schedule) || {}
        var pointsText =
          permission && permission.pointsHint != null
            ? '≈' + permission.pointsHint
            : '未知'
        var tierText = permission ? String(permission.effectiveTier || 0) : '—'
        var rateText = permission ? String(permission.suggestedRatePerMin || '—') + '次/分' : '—'
        var probedAt = permission && permission.probedAt ? String(permission.probedAt).replace('T', ' ').slice(0, 19) : '—'
        var histReady = /^\d{8}$/.test(String(histStart || '').trim()) && /^\d{8}$/.test(String(histEnd || '').trim())

        function renderActiveRunBlock() {
          if (!active) return h('p', { style: S.muted }, '当前无运行中任务')
          return h(
            'div',
            null,
            h(
              'div',
              { style: { marginBottom: 8 } },
              '当前：',
              h('span', { style: { color: statusTone(active.status), fontWeight: 600 } }, zhStatus(active.status)),
              ' · ',
              active.mode === 'range' ? '历史回填' : '增量',
              ' · ',
              active.id,
            ),
            h(
              'table',
              { style: S.table },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { style: S.th }, '步骤'),
                  h('th', { style: S.th }, '状态'),
                  h('th', { style: S.th }, '行数'),
                  h('th', { style: S.th }, '说明'),
                ),
              ),
              h(
                'tbody',
                null,
                (active.stepStates || []).map(function (st) {
                  return h(
                    'tr',
                    { key: st.id },
                    h('td', { style: S.td }, STEP_LABELS[st.id] || st.id),
                    h(
                      'td',
                      { style: Object.assign({}, S.td, { color: statusTone(st.status) }) },
                      zhStatus(st.status),
                    ),
                    h('td', { style: S.td }, st.rows != null ? String(st.rows) : '—'),
                    h('td', { style: S.td }, st.message || ''),
                  )
                }),
              ),
            ),
            h(
              'div',
              { style: Object.assign({}, S.log, { marginTop: 8 }) },
              (active.logTail || []).slice(-40).join('\n') || '(无日志)',
            ),
          )
        }

        children.push(
          h(
            'div',
            { style: S.card },
            h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '账号权限'),
            h(
              'div',
              { style: S.muted },
              'Token：' +
                (desc.connection && desc.connection.tokenConfigured ? '已配置' : '未配置') +
                ' · 积分提示 ' +
                pointsText +
                '（仅展示） · 有效档 ' +
                tierText +
                ' · ' +
                rateText +
                ' · 探测于 ' +
                probedAt +
                (probing ? ' · 权限探测中…' : ''),
            ),
            h(
              'div',
              { style: Object.assign({}, S.row, { marginTop: 8, marginBottom: 0 }) },
              h(
                'button',
                {
                  type: 'button',
                  style: S.btn,
                  disabled: probing,
                  onClick: function () {
                    return probePermission(true)
                  },
                },
                probing ? '探测中…' : '重新探测',
              ),
            ),
          ),
        )

        children.push(
          h(
            'div',
            { style: Object.assign({}, S.steps, { marginBottom: 12 }) },
            [
              { id: 'sync', label: '同步' },
              { id: 'pull', label: '拉取' },
              { id: 'schedule', label: '定时' },
              { id: 'monitor', label: '监控' },
            ].map(function (tab) {
              return h(
                'button',
                {
                  key: tab.id,
                  type: 'button',
                  style: Object.assign({}, S.chip, panelTab === tab.id ? S.chipOn : null),
                  onClick: function () {
                    setPanelTab(tab.id)
                  },
                },
                tab.label,
              )
            }),
          ),
        )

        if (panelTab === 'sync') {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '同步范围（可勾选）'),
              h(
                'p',
                { style: S.muted },
                '仅 selected_allowed ∩ implemented 可勾选；与拉取/定时/监控共用同一份返回清单。已选 ' +
                  selection.length +
                  ' 项。域名默认收起。',
              ),
              renderCatalog(false, false),
            ),
          )
        } else if (panelTab === 'pull') {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '拉取已选数据集'),
              h(
                'p',
                { style: S.muted },
                '当前已选 ' +
                  selection.length +
                  ' 项' +
                  (selection.length
                    ? '：' + selection.map(datasetLabel).join('、')
                    : '（请先到「同步」Tab 勾选）') +
                  '。财务/持仓/指数日线耗时较长，建议先小区间试跑。',
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' } },
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.primary,
                    disabled: busy || !selection.length,
                    onClick: function () {
                      startRun('manual')
                    },
                  },
                  '增量同步已选',
                ),
                h(
                  'button',
                  { type: 'button', style: S.btn, disabled: busy || !active, onClick: cancelRun },
                  '取消任务',
                ),
              ),
              h('div', { style: { fontWeight: 600, fontSize: 13, margin: '8px 0 6px' } }, '历史回填'),
              h(
                'p',
                { style: S.muted },
                'mode=range，起止交易日 YYYYMMDD（Asia/Shanghai）；权限闸与增量相同。',
              ),
              h(
                'div',
                { style: S.row },
                h('span', { style: S.label }, '起始'),
                h('input', {
                  style: S.input,
                  placeholder: 'YYYYMMDD',
                  value: histStart,
                  onChange: function (e) {
                    setHistStart(e.target.value)
                  },
                }),
                h('span', { style: S.label }, '结束'),
                h('input', {
                  style: S.input,
                  placeholder: 'YYYYMMDD',
                  value: histEnd,
                  onChange: function (e) {
                    setHistEnd(e.target.value)
                  },
                }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  style: S.primary,
                  disabled: busy || !selection.length || !histReady,
                  onClick: startHistoryRun,
                  title: !histReady ? '请填写起止 YYYYMMDD' : '',
                },
                '历史回填已选',
              ),
              active ? h('div', { style: { marginTop: 12 } }, renderActiveRunBlock()) : null,
            ),
          )
        } else if (panelTab === 'schedule') {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '定时（收盘后 · 可编辑）'),
              h(
                'p',
                { style: S.muted },
                '按「同步」Tab 已勾选数据集做增量同步；示例：交易日 18:30（30 18 * * 1-5，上海）。',
              ),
              h(
                'p',
                { style: S.muted },
                '当前已选 ' + selection.length + ' 项（改勾选请到「同步」）。',
              ),
              h(
                'div',
                { style: S.row },
                h(
                  'label',
                  { style: S.label },
                  h('input', {
                    type: 'checkbox',
                    checked: !!form.cronEnabled,
                    onChange: function (e) {
                      setField('cronEnabled', e.target.checked)
                    },
                  }),
                  ' 启用',
                ),
              ),
              h('div', { style: S.row }, h('span', { style: S.label }, 'Cron'), h('input', {
                style: S.input,
                value: form.cronExpression,
                onChange: function (e) {
                  setField('cronExpression', e.target.value)
                },
              })),
              h('div', { style: S.row }, h('span', { style: S.label }, '时区'), h('input', {
                style: S.input,
                value: form.timeZone,
                onChange: function (e) {
                  setField('timeZone', e.target.value)
                },
              })),
              h(
                'p',
                { style: S.muted },
                '下次：' + (schedule.nextRunAt || '—') + ' · 上次：' + (schedule.lastRunAt || '—'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  style: S.primary,
                  disabled: busy,
                  onClick: function () {
                    formEditing.current = false
                    saveSchedule()
                  },
                },
                '保存定时',
              ),
            ),
          )
        } else {
          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '数据覆盖'),
              h(
                'div',
                { style: Object.assign({}, S.row, { marginBottom: 6 }) },
                h(
                  'button',
                  { type: 'button', style: S.primary, disabled: busy, onClick: loadWaterline },
                  water ? '刷新覆盖' : '加载覆盖',
                ),
                h('span', { style: S.muted }, '交易日 Asia/Shanghai'),
              ),
              water
                ? h(
                    'table',
                    { style: S.table },
                    h(
                      'thead',
                      null,
                      h(
                        'tr',
                        null,
                        h('th', { style: S.th }, '数据集'),
                        h('th', { style: S.th }, '记录数'),
                        h('th', { style: S.th }, '起始交易日'),
                        h('th', { style: S.th }, '截至交易日'),
                        h('th', { style: S.th }, '最近更新'),
                      ),
                    ),
                    h(
                      'tbody',
                      null,
                      Object.keys(water).map(function (k) {
                        var row = water[k] || {}
                        if (typeof row === 'string' || row == null) {
                          return h(
                            'tr',
                            { key: k },
                            h('td', { style: S.td }, datasetLabel(k)),
                            h('td', { style: S.td }, '—'),
                            h('td', { style: S.td }, '—'),
                            h('td', { style: S.td }, row || '—'),
                            h('td', { style: S.td }, '—'),
                          )
                        }
                        return h(
                          'tr',
                          { key: k },
                          h('td', { style: S.td }, datasetLabel(k)),
                          h('td', { style: S.td }, row.count != null ? String(row.count) : '—'),
                          h('td', { style: S.td }, row.start_date || '—'),
                          h('td', { style: S.td }, row.end_date || '—'),
                          h('td', { style: S.td }, row.updated_at || '—'),
                        )
                      }),
                    ),
                  )
                : h('p', { style: S.muted }, '点击加载覆盖'),
            ),
          )

          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '已选清单（只读）'),
              renderCatalog(true, true),
            ),
          )

          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '任务'),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 10 } },
                h(
                  'button',
                  { type: 'button', style: S.btn, disabled: busy || !active, onClick: cancelRun },
                  '取消任务',
                ),
              ),
              renderActiveRunBlock(),
            ),
          )

          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '定时（只读）'),
              h(
                'p',
                { style: S.muted },
                (schedule.enabled ? '已启用' : '未启用') +
                  ' · ' +
                  (schedule.cronExpression || '—') +
                  ' · ' +
                  (schedule.timeZone || 'Asia/Shanghai'),
              ),
              h(
                'p',
                { style: S.muted },
                '下次：' + (schedule.nextRunAt || '—') + ' · 上次：' + (schedule.lastRunAt || '—'),
              ),
              h('p', { style: S.muted }, '修改定时请到「定时」Tab'),
            ),
          )

          children.push(
            h(
              'div',
              { style: S.card },
              h('div', { style: { fontWeight: 650, marginBottom: 6 } }, '运行历史'),
              h(
                'table',
                { style: S.table },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', { style: S.th }, '时间'),
                    h('th', { style: S.th }, '模式'),
                    h('th', { style: S.th }, '触发'),
                    h('th', { style: S.th }, '状态'),
                    h('th', { style: S.th }, 'ID'),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  (runs || []).slice(0, 12).map(function (r) {
                    return h(
                      'tr',
                      { key: r.id },
                      h('td', { style: S.td }, (r.createdAt || '').replace('T', ' ').slice(0, 19)),
                      h('td', { style: S.td }, r.mode === 'range' ? '回填' : '增量'),
                      h('td', { style: S.td }, r.trigger || '—'),
                      h(
                        'td',
                        { style: Object.assign({}, S.td, { color: statusTone(r.status) }) },
                        zhStatus(r.status),
                      ),
                      h('td', { style: S.td }, r.id),
                    )
                  }),
                ),
              ),
            ),
          )
        }
      }

      return h('div', { style: S.root }, children)
    }

    // 对齐官方 / fanqie：panellist 图标 + 同 id 的 main 面板，缺一不可
    var inject = ['slots']

    function apply(ctx) {
      if (!ctx.slots) {
        console.warn('[dsh-tushare-sync] ctx.slots unavailable; sidebar panel skipped')
        return
      }
      ctx.effect(function* () {
        yield ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 14, label: 'Tushare 同步' },
            SyncIcon,
          )
        })
        yield ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: PANEL_ID }, SyncPanel)
        })
      }, 'tushare-sync: panellist')
    }

    exports.PANEL_ID = PANEL_ID
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
