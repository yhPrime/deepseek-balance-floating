/**
 * dsh-balance-floating 浏览器端 bundle(单文件,经 __ModuleLoader__ 加载)。
 *
 * 在侧边栏左下角(sidebar.footer.action)渲染:
 *  - 红色血条环:DeepSeek 账户余额(满血 ¥100,点击立即刷新官方余额);
 *  - 蓝色环:估算剩余 token(满蓝 = ¥100 额度的 token,按当前模型混合单价折算);
 *  - 今日消耗横条(文字在条上方,文字颜色用 mix-blend-mode:difference
 *    相对实际背景逐像素自动反色)。
 *
 * 数据通道:remote.costMeter.*(Typert RPC,由 dsh-cost-meter 插件挂载),
 * 与 dsh-cost-meter 自身 UI 同一取数通道。
 * 前置依赖:dsh-cost-meter 插件必须已安装并运行。
 */

window.__ModuleLoader__.load({
  id: 'dsh-balance-floating',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const inject = ['timer']

    // ── 常量 ───────────────────────────────────────────────────────────────
    const BALANCE_CAP = 100 // 血条满血额度(¥)
    const BLEND_INPUT = 0.7 // 混合单价权重:输入(cacheMiss)
    const BLEND_OUTPUT = 0.3 // 混合单价权重:输出

    const FALLBACK = {
      red: '#e5484d',
      blue: '#2f6bff',
      track: 'rgba(128,128,128,0.2)',
      bg: '#ffffff',
      border: 'rgba(0,0,0,0.12)',
      shadow: '0 2px 10px rgba(0,0,0,0.16)',
      value: '#17181c',
      label: '#4b4f55',
    }

    const CSS = [
      '.bfl-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}',
      '.bfl-panel{display:flex;align-items:center;justify-content:center;padding:6px 8px;border-radius:12px;user-select:none}',
      '.bfl-col{display:flex;flex-direction:column;align-items:center;gap:8px}',
      '.bfl-ring{position:relative;width:40px;height:40px;flex:none}',
      '.bfl-ring.clickable{cursor:pointer}',
      '.bfl-svg{display:block}',
      '.bfl-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}',
      '.bfl-value{font-size:9.5px;line-height:1.15;font-weight:700;white-space:nowrap}',
      '.bfl-label{font-size:7.5px;line-height:1.2;font-weight:600}',
      '.bfl-today{display:flex;flex-direction:column;align-items:center;gap:3px}',
      '.bfl-hbar{width:72px;height:6px;border-radius:3px;overflow:hidden}',
      '.bfl-hbar-fill{height:100%;border-radius:3px}',
      '.bfl-hbar-label{font-size:8px;line-height:1.2;white-space:nowrap;mix-blend-mode:difference;color:#ffffff}',
      '.bfl-err{font-size:10px;max-width:150px;text-align:center}',
    ].join('')

    // ── 工具 ───────────────────────────────────────────────────────────────
    const num = (o, k, d) => (o && typeof o[k] === 'number' && Number.isFinite(o[k])) ? o[k] : d
    const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v))

    const fmtMoney = (v, symbol, decimals) => {
      const d = Math.min(4, Math.max(0, decimals))
      return symbol + v.toFixed(d)
    }
    const fmtShort = (v, symbol) => {
      if (!Number.isFinite(v)) return '—'
      if (v >= 100) return symbol + String(Math.round(v))
      if (v >= 10) return symbol + v.toFixed(1)
      return symbol + v.toFixed(2)
    }
    const fmtTokens = (v) => {
      if (!Number.isFinite(v) || v <= 0) return '0'
      if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿'
      if (v >= 1e4) return String(Math.round(v / 1e4)) + '万'
      return String(Math.round(v))
    }

    // 从成本账本快照中提取本插件所需字段(最小化数据面)
    const snapshotOf = (state) => {
      const b = state && state.balance
      const t = state && state.today
      const cfg = state && state.config
      const budget = cfg && cfg.budget
      return {
        balance: {
          status: (b && b.status) || 'off',
          message: (b && b.message) || '',
          fetchedAt: (b && b.fetchedAt) || 0,
          currency: (b && b.currency) || '',
          totalBalance: num(b, 'totalBalance', 0),
          grantedBalance: num(b, 'grantedBalance', 0),
          toppedUpBalance: num(b, 'toppedUpBalance', 0),
        },
        today: {
          cost: num(t, 'cost', 0),
          calls: num(t, 'calls', 0),
          input: num(t, 'input', 0),
          output: num(t, 'output', 0),
          cacheRead: num(t, 'cacheRead', 0),
          cacheWrite: num(t, 'cacheWrite', 0),
        },
        config: {
          symbol: (cfg && typeof cfg.symbol === 'string' && cfg.symbol.length > 0) ? cfg.symbol : '¥',
          decimals: (cfg && Number.isFinite(cfg.decimals)) ? cfg.decimals : 4,
          exchangeRate: (cfg && Number.isFinite(cfg.exchangeRate)) ? cfg.exchangeRate : 7.2,
          budgetEnabled: !!(budget && budget.enabled),
          budgetAmount: (budget && Number.isFinite(budget.amount)) ? budget.amount : 100,
          budgetPeriod: (budget && budget.period) || 'month',
        },
        currentModel: (state && state.currentModel) || 'deepseek-v4-flash',
        prices: (state && state.prices && typeof state.prices === 'object') ? state.prices : null,
        dayKey: (state && state.meta && state.meta.dayKey) || '',
        now: (state && state.meta && state.meta.now) || 0,
      }
    }

    // 当前模型价格条目(精确 → default → 内置回退)
    const priceEntry = (snap) => {
      const p = snap.prices
      if (p && p.models) {
        const hit = p.models[snap.currentModel]
        if (hit !== null && typeof hit === 'object') return hit
        if (p.default !== null && typeof p.default === 'object') return p.default
      }
      return { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 }
    }
    const blendedUsdPerM = (entry) => BLEND_INPUT * (entry.cacheMiss || 0) + BLEND_OUTPUT * (entry.output || 0)

    // 读取 body 上当前主题已解析出的语义颜色(具体色值,随主题亮/暗/覆盖实时变化)
    const readPalette = () => {
      try {
        if (typeof document === 'undefined' || document.body === null) return FALLBACK
        const cs = getComputedStyle(document.body)
        const tok = (name, fb) => {
          try {
            const v = cs.getPropertyValue(name)
            if (typeof v === 'string') {
              const t = v.trim()
              if (t.length > 0 && t !== 'inherit' && t !== 'initial' && t.indexOf('var(') !== 0) return t
            }
          } catch (e) { /* 忽略 */ }
          return fb
        }
        const value = tok('--dsw-alias-label-primary', FALLBACK.value)
        return {
          red: tok('--dsw-alias-state-error-primary', FALLBACK.red),
          blue: tok('--dsw-alias-state-business-primary', FALLBACK.blue),
          track: 'color-mix(in srgb, ' + value + ' 15%, transparent)',
          bg: tok('--dsw-alias-bg-overlay', FALLBACK.bg),
          border: tok('--dsw-alias-border-l2', FALLBACK.border),
          shadow: tok('--dsw-shadow-lv2', FALLBACK.shadow),
          value: value,
          label: tok('--dsw-alias-label-secondary', FALLBACK.label),
        }
      } catch (e) {
        return FALLBACK
      }
    }

    const detectDark = () => {
      try {
        if (typeof document !== 'undefined' && document.body !== null) {
          if (document.body.hasAttribute('data-ds-dark-theme')) return true
        }
      } catch (e) { /* 忽略 */ }
      return false
    }

    // ── 组件 ───────────────────────────────────────────────────────────────
    function Ring(props) {
      const size = 40, stroke = 4.5
      const r = (size - stroke) / 2
      const c = 2 * Math.PI * r
      const f = clamp01(props.fraction)
      const base = { cx: size / 2, cy: size / 2, r, fill: 'none', strokeWidth: stroke }
      return React.createElement('div', {
        className: 'bfl-ring' + (props.onClick ? ' clickable' : ''),
        title: props.title,
        onClick: props.onClick,
      },
        React.createElement('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, className: 'bfl-svg' },
          React.createElement('circle', Object.assign({}, base, { stroke: props.track })),
          React.createElement('circle', Object.assign({}, base, {
            stroke: props.color,
            strokeLinecap: 'round',
            strokeDasharray: (f * c).toFixed(2) + ' ' + c.toFixed(2),
            transform: 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')',
          })),
        ),
        React.createElement('div', { className: 'bfl-center' },
          React.createElement('div', { className: 'bfl-value', style: { color: props.c.value } }, props.value),
          React.createElement('div', { className: 'bfl-label', style: { color: props.c.label } }, props.label),
        ),
      )
    }

    function RingsPanel(props, ctx, fetchSnapshot, refreshBalance) {
      const wide = props.wide !== false
      const [C, setC] = React.useState(readPalette)
      const [dark, setDark] = React.useState(detectDark)
      const [snap, setSnap] = React.useState(null)
      const [status, setStatus] = React.useState('loading')
      const [message, setMessage] = React.useState('')
      const refreshTheme = React.useCallback(() => { setC(readPalette()); setDark(detectDark()) }, [])
      // MutationObserver 监听 body 主题属性变化(应用切主题的真实机制)
      React.useEffect(() => {
        let mo = null
        try {
          if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body !== null) {
            mo = new MutationObserver(() => { refreshTheme() })
            mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          }
        } catch (e) { /* 忽略 */ }
        return () => { if (mo !== null) mo.disconnect() }
      }, [refreshTheme])
      // theme/change 事件(兜底)
      React.useEffect(() => {
        const off = ctx.on('theme/change', () => { refreshTheme() })
        return off
      }, [refreshTheme])
      React.useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const s = await fetchSnapshot()
            if (!alive) return
            setSnap(s)
            setStatus('ready')
            setMessage('')
          } catch (e) {
            if (!alive) return
            setStatus('error')
            setMessage(String((e && e.message) || e))
          }
        }
        load()
        const dispose = ctx.interval(() => { load(); refreshTheme() }, 60000)
        return () => { alive = false; dispose() }
      }, [fetchSnapshot, refreshTheme])
      const refresh = async () => {
        try {
          const s = await refreshBalance()
          if (s !== null) setSnap(s)
        } catch (e) { /* 静默 */ }
      }
      if (!wide) return null
      let rings = null
      let today = null
      if (status === 'error') {
        rings = React.createElement('div', { className: 'bfl-err', style: { color: C.label }, title: message }, '费用数据不可用')
      } else if (!snap) {
        rings = React.createElement('div', { className: 'bfl-err', style: { color: C.label } }, '加载中…')
      } else {
        const symbol = snap.config.symbol
        const decimals = snap.config.decimals
        const bal = snap.balance
        const balFrac = bal.status === 'ok' ? bal.totalBalance / BALANCE_CAP : 0
        const balValue = bal.status === 'ok' ? fmtShort(bal.totalBalance, symbol)
          : (bal.status === 'error' ? '!' : '—')
        const balTitle = bal.status === 'ok'
          ? ('余额 ' + fmtMoney(bal.totalBalance, symbol, decimals)
            + (bal.currency ? ' ' + bal.currency : '')
            + ' · 赠送 ' + fmtMoney(bal.grantedBalance, symbol, decimals)
            + ' · 充值 ' + fmtMoney(bal.toppedUpBalance, symbol, decimals)
            + ' · 满血 ¥100 · 点击刷新')
          : (bal.status === 'error' ? ('余额查询失败: ' + (bal.message || '')) : '余额显示未开启')
        const entry = priceEntry(snap)
        const usdPerM = blendedUsdPerM(entry)
        const rate = snap.config.exchangeRate
        const fullTokens = usdPerM > 0 ? (BALANCE_CAP / rate) / (usdPerM / 1e6) : 0
        let remainTokens = 0
        if (bal.status === 'ok' && usdPerM > 0) {
          remainTokens = ((bal.totalBalance / rate) / (usdPerM / 1e6))
        }
        const blueFrac = fullTokens > 0 ? remainTokens / fullTokens : 0
        const blueValue = bal.status === 'ok' ? fmtTokens(remainTokens) : (bal.status === 'error' ? '!' : '—')
        const blueTitle = bal.status === 'ok'
          ? ('估算剩余 ≈ ' + fmtTokens(remainTokens) + ' token(按 ' + snap.currentModel + ' 混合价 $' + usdPerM.toFixed(4) + '/M 估算,满蓝 = ¥100 ≈ ' + fmtTokens(fullTokens) + ' token)')
          : (bal.status === 'error' ? ('余额查询失败: ' + (bal.message || '')) : '余额显示未开启')
        const todayTokens = snap.today.input + snap.today.output + snap.today.cacheRead + snap.today.cacheWrite
        const todayFrac = fullTokens > 0 ? todayTokens / fullTokens : 0
        const todayTitle = '今日已用 ' + fmtTokens(todayTokens) + ' token(输入 ' + fmtTokens(snap.today.input)
          + ' · 输出 ' + fmtTokens(snap.today.output)
          + ' · 缓存读 ' + fmtTokens(snap.today.cacheRead)
          + ' · 缓存写 ' + fmtTokens(snap.today.cacheWrite)
          + ' · ' + snap.today.calls + ' 次调用)'
        rings = React.createElement('div', { className: 'bfl-col' },
          React.createElement(Ring, {
            c: C, color: C.red, track: C.track, fraction: balFrac,
            value: balValue, label: '余额', title: balTitle, onClick: refresh,
          }),
          React.createElement(Ring, {
            c: C, color: C.blue, track: C.track, fraction: blueFrac,
            value: blueValue, label: '剩余', title: blueTitle,
          }),
        )
        // 今日消耗:文字在条上方,文字颜色 mix-blend-mode:difference 相对实际背景自动反色
        today = React.createElement('div', { className: 'bfl-today', title: todayTitle },
          React.createElement('div', { className: 'bfl-hbar-label' }, '今日 ' + fmtTokens(todayTokens)),
          React.createElement('div', { className: 'bfl-hbar', style: { background: C.track } },
            React.createElement('div', { className: 'bfl-hbar-fill', style: { width: (todayFrac * 100).toFixed(1) + '%', background: C.blue } }),
          ),
        )
        return React.createElement('div', { className: 'bfl-wrap' },
          React.createElement('div', {
            className: 'bfl-panel',
            style: { background: C.bg, border: '1px solid ' + C.border, boxShadow: C.shadow },
          }, rings),
          today,
        )
      }
      return React.createElement('div', {
        className: 'bfl-panel',
        style: { background: C.bg, border: '1px solid ' + C.border, boxShadow: C.shadow },
      }, rings)
    }

    // ── 插件主体 ───────────────────────────────────────────────────────────
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      // 样式注入(随插件生命周期清理)
      let styleDispose = () => {}
      try {
        if (typeof document !== 'undefined' && document.head !== null) {
          const tag = document.createElement('style')
          tag.id = 'dsh-balance-floating-css'
          tag.dataset.plugin = 'dsh-balance-floating'
          tag.textContent = CSS
          document.head.appendChild(tag)
          styleDispose = () => { if (tag.parentNode !== null) tag.parentNode.removeChild(tag) }
        }
      } catch (e) { /* 忽略 */ }
      ctx.effect(() => () => { styleDispose() }, 'dsh-balance-floating: styles')

      // 数据通道:remote.costMeter(Typert RPC,由 dsh-cost-meter 客户端挂载)。
      // 每次调用重新解析,以便 cost-meter 后加载时自动恢复。
      const fetchSnapshot = async () => {
        const cm = ctx.get('remote.costMeter')
        if (cm !== undefined && typeof cm.getState === 'function') {
          const r = await cm.getState()
          if (r !== null && typeof r === 'object' && r.ok === true && r.value !== null && typeof r.value === 'object') {
            return snapshotOf(r.value)
          }
        }
        throw new Error('dsh-cost-meter 服务不可用(请先安装并启用 dsh-cost-meter)')
      }
      const refreshBalance = async () => {
        const cm = ctx.get('remote.costMeter')
        if (cm !== undefined && typeof cm.refreshBalance === 'function') {
          const r = await cm.refreshBalance()
          if (r !== null && typeof r === 'object' && r.ok === true && r.value !== null && typeof r.value === 'object'
            && r.value.state !== null && typeof r.value.state === 'object') {
            return snapshotOf(r.value.state)
          }
        }
        return null
      }

      const renderPanel = (props) => RingsPanel(props, ctx, fetchSnapshot, refreshBalance)

      // 血条面板:footer 动作行第一个格子(负 order),由 shell 布局放到左下角,
      // 自动把 cordis-panel 按钮和设置按钮挤到右边,不再被悬浮层遮挡。
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'balance-floating', order: -10 },
        renderPanel,
      ))

      // 复用 dsh-cost-meter 的 cell id 并渲染空:隐藏其在左下角的「当日费用/余额」显示
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'cost-meter', order: 0 },
        () => null,
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
