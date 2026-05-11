import { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend, Cell,
} from 'recharts'

const TARGET_STORAGE_KEY = 'sheet_target_tracker_v1'

const DEFAULT_CONFIG = {
  monthlyTarget: 30000000, // 3 Cr default
  selectedMonth: '',
  includeSundays: true,
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(TARGET_STORAGE_KEY)
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
  } catch (e) {}
  return DEFAULT_CONFIG
}

function saveConfig(cfg) {
  try { localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(cfg)) } catch (e) {}
}

function normalizeDate(dateStr) {
  if (!dateStr) return ''
  const d = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const slash = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (slash) {
    let day = slash[1].padStart(2, '0')
    let month = slash[2].padStart(2, '0')
    let year = parseInt(slash[3])
    if (year < 100) year += 2000
    if (year < 2000) year = 2026
    return `${year}-${month}-${day}`
  }
  const text = d.match(/^(\d{1,2})\s+(\w+)/)
  if (text) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const m = months[text[2].toLowerCase().slice(0, 3)]
    if (m) return `2026-${m}-${text[1].padStart(2, '0')}`
  }
  return ''
}

function getCurrentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getDaysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function isSunday(monthKey, day) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, day).getDay() === 0
}

function formatINR(num) {
  if (!num || isNaN(num)) return '0'
  return Math.round(num).toLocaleString('en-IN')
}

function formatINRShort(num) {
  if (!num) return '₹0'
  const n = Math.abs(num)
  if (n >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`
  if (n >= 100000) return `₹${(num / 100000).toFixed(2)} L`
  if (n >= 1000) return `₹${(num / 1000).toFixed(1)}K`
  return `₹${num}`
}

export default function TargetTracker({ data }) {
  const [config, setConfig] = useState(loadConfig)
  const [editingTarget, setEditingTarget] = useState(false)
  const [tempTarget, setTempTarget] = useState('')

  useEffect(() => { saveConfig(config) }, [config])

  const selectedMonth = config.selectedMonth || getCurrentMonthKey()
  const isCurrentMonth = selectedMonth === getCurrentMonthKey()

  // === Available months from data ===
  const availableMonths = useMemo(() => {
    const set = new Set()
    data.forEach((r) => {
      const nd = normalizeDate(r.date)
      if (nd) set.add(nd.slice(0, 7))
    })
    set.add(getCurrentMonthKey())
    return [...set].sort().reverse()
  }, [data])

  // === Month orders filter ===
  const monthOrders = useMemo(() => {
    return data.filter((r) => {
      const nd = normalizeDate(r.date)
      return nd && nd.startsWith(selectedMonth)
    })
  }, [data, selectedMonth])

  // === Core stats ===
  const stats = useMemo(() => {
    const today = new Date()
    const [y, m] = selectedMonth.split('-').map(Number)
    const totalDays = getDaysInMonth(selectedMonth)

    // Working days (count Sundays if includeSundays = true)
    let workingDays = 0
    for (let d = 1; d <= totalDays; d++) {
      if (config.includeSundays || !isSunday(selectedMonth, d)) workingDays++
    }

    // Days passed
    let daysPassed = 0
    if (isCurrentMonth) {
      const currDay = today.getDate()
      for (let d = 1; d <= currDay; d++) {
        if (config.includeSundays || !isSunday(selectedMonth, d)) daysPassed++
      }
    } else {
      const monthEnd = new Date(y, m - 1, totalDays)
      daysPassed = monthEnd < today ? workingDays : 0
    }
    const daysLeft = Math.max(0, workingDays - daysPassed)

    const achieved = monthOrders.reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
    const achievedPrepay = monthOrders.reduce((s, r) => s + (parseFloat(r.prepayAmount) || 0), 0)
    const achievedCOD = monthOrders.reduce((s, r) => s + (parseFloat(r.codAmount) || 0), 0)
    const remaining = Math.max(0, config.monthlyTarget - achieved)
    const progressPct = config.monthlyTarget > 0 ? (achieved / config.monthlyTarget) * 100 : 0

    // Daily targets
    const idealDaily = workingDays > 0 ? config.monthlyTarget / workingDays : 0
    const actualDailyAvg = daysPassed > 0 ? achieved / daysPassed : 0
    const requiredDaily = daysLeft > 0 ? remaining / daysLeft : 0

    // Today's revenue
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const todayRevenue = monthOrders
      .filter((r) => normalizeDate(r.date) === todayKey)
      .reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
    const todayOrders = monthOrders.filter((r) => normalizeDate(r.date) === todayKey).length

    // Pace status
    const idealAchievedByNow = idealDaily * daysPassed
    const paceDiff = achieved - idealAchievedByNow
    const pacePct = idealAchievedByNow > 0 ? ((achieved - idealAchievedByNow) / idealAchievedByNow) * 100 : 0
    let paceStatus = 'on-track'
    if (pacePct < -5) paceStatus = 'behind'
    else if (pacePct > 5) paceStatus = 'ahead'

    // Projection
    const projection = actualDailyAvg * workingDays
    const projectedShortfall = config.monthlyTarget - projection

    // Order count stats
    const totalOrderCount = monthOrders.length
    const avgOrderValue = totalOrderCount > 0 ? achieved / totalOrderCount : 0
    const repeatCount = monthOrders.filter((r) => (r.orderType || '').toLowerCase().includes('repeat')).length
    const repeatPct = totalOrderCount > 0 ? (repeatCount / totalOrderCount) * 100 : 0
    const fullPrepayCount = monthOrders.filter((r) => !parseFloat(r.codAmount)).length
    const prepayPct = totalOrderCount > 0 ? (fullPrepayCount / totalOrderCount) * 100 : 0

    // Orders needed
    const ordersNeededDaily = avgOrderValue > 0 ? Math.ceil(requiredDaily / avgOrderValue) : 0

    return {
      totalDays, workingDays, daysPassed, daysLeft,
      achieved, achievedPrepay, achievedCOD, remaining, progressPct,
      idealDaily, actualDailyAvg, requiredDaily,
      todayRevenue, todayOrders, todayKey,
      paceStatus, paceDiff, pacePct,
      projection, projectedShortfall,
      totalOrderCount, avgOrderValue, repeatCount, repeatPct,
      fullPrepayCount, prepayPct, ordersNeededDaily,
    }
  }, [monthOrders, config, selectedMonth, isCurrentMonth])

  // === Daily revenue chart data ===
  const dailyChartData = useMemo(() => {
    const map = new Map()
    monthOrders.forEach((r) => {
      const nd = normalizeDate(r.date)
      if (!nd) return
      if (!map.has(nd)) map.set(nd, { revenue: 0, orders: 0 })
      const e = map.get(nd)
      e.revenue += parseFloat(r.orderAmount) || 0
      e.orders++
    })

    const totalDays = getDaysInMonth(selectedMonth)
    const result = []
    for (let d = 1; d <= totalDays; d++) {
      const key = `${selectedMonth}-${String(d).padStart(2, '0')}`
      const entry = map.get(key) || { revenue: 0, orders: 0 }
      const sun = isSunday(selectedMonth, d)
      result.push({
        day: d,
        date: key,
        revenue: entry.revenue,
        orders: entry.orders,
        isSunday: sun,
        target: stats.idealDaily,
        hit: entry.revenue >= stats.idealDaily,
      })
    }
    return result
  }, [monthOrders, selectedMonth, stats.idealDaily])

  // === Agent-wise target distribution ===
  const agentTargets = useMemo(() => {
    const map = new Map()
    monthOrders.forEach((r) => {
      const staff = r.supportStaff?.trim()
      if (!staff) return
      const key = staff.toLowerCase()
      if (!map.has(key)) map.set(key, { name: staff, achieved: 0, orders: 0, days: new Set() })
      const e = map.get(key)
      e.achieved += parseFloat(r.orderAmount) || 0
      e.orders++
      const nd = normalizeDate(r.date)
      if (nd) e.days.add(nd)
    })

    const agents = [...map.values()].map((a) => ({
      ...a,
      activeDays: a.days.size,
      avgPerDay: a.days.size > 0 ? a.achieved / a.days.size : 0,
      days: undefined,
    })).sort((a, b) => b.achieved - a.achieved)

    // Total achieved among agents (to compute proportional share)
    const totalAchieved = agents.reduce((s, a) => s + a.achieved, 0)

    return agents.map((a) => {
      const sharePct = totalAchieved > 0 ? a.achieved / totalAchieved : 0
      const proportionalTarget = config.monthlyTarget * sharePct
      const proportionalRemaining = Math.max(0, proportionalTarget - a.achieved)
      const dailyNeeded = stats.daysLeft > 0 ? proportionalRemaining / stats.daysLeft : 0
      const onPace = a.avgPerDay >= dailyNeeded * 0.9
      return { ...a, proportionalTarget, proportionalRemaining, dailyNeeded, onPace, sharePct }
    })
  }, [monthOrders, config.monthlyTarget, stats.daysLeft])

  // === Top doctors ===
  const topDoctors = useMemo(() => {
    const map = new Map()
    monthOrders.forEach((r) => {
      const doc = r.doctor?.trim() || 'Unknown'
      const key = doc.toLowerCase()
      if (!map.has(key)) map.set(key, { name: doc, revenue: 0, orders: 0 })
      const e = map.get(key)
      e.revenue += parseFloat(r.orderAmount) || 0
      e.orders++
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [monthOrders])

  // === Smart Action Items ===
  const actionItems = useMemo(() => {
    const items = []

    if (stats.progressPct >= 100) {
      items.push({ icon: '🎉', tone: 'success', title: 'TARGET ACHIEVED!', text: `Bhai mubarak! ₹${formatINR(stats.achieved)} ho gaya. Ab ${formatINRShort(stats.achieved - config.monthlyTarget)} extra hai.` })
      return items
    }

    if (stats.daysLeft === 0) {
      items.push({ icon: '⏰', tone: 'danger', title: 'Month Over', text: `Final: ₹${formatINR(stats.achieved)} of ₹${formatINR(config.monthlyTarget)} (${stats.progressPct.toFixed(1)}%)` })
      return items
    }

    // Daily push
    items.push({
      icon: '🎯',
      tone: stats.paceStatus === 'behind' ? 'danger' : stats.paceStatus === 'ahead' ? 'success' : 'warn',
      title: `Daily Required: ₹${formatINR(stats.requiredDaily)}`,
      text: `${stats.daysLeft} din bache hain. Roz ₹${formatINR(stats.requiredDaily)} chahiye target hit karne ke liye. (Ideal tha ₹${formatINR(stats.idealDaily)})`,
    })

    // Pace
    if (stats.paceStatus === 'behind') {
      items.push({
        icon: '🔴',
        tone: 'danger',
        title: `Behind by ${Math.abs(stats.pacePct).toFixed(1)}%`,
        text: `${formatINRShort(Math.abs(stats.paceDiff))} kam ho gaya schedule se. Catch up karne ke liye daily push badhao.`,
      })
    } else if (stats.paceStatus === 'ahead') {
      items.push({
        icon: '🟢',
        tone: 'success',
        title: `Ahead by ${stats.pacePct.toFixed(1)}%`,
        text: `Bhai badhiya! ${formatINRShort(stats.paceDiff)} extra hai schedule se. Pace maintain karo.`,
      })
    } else {
      items.push({
        icon: '🟡',
        tone: 'warn',
        title: 'On Track',
        text: `Schedule pe ho. Roz ka pace banaye rakho.`,
      })
    }

    // Orders needed
    if (stats.avgOrderValue > 0 && stats.ordersNeededDaily > 0) {
      items.push({
        icon: '📦',
        tone: 'info',
        title: `Daily ${stats.ordersNeededDaily} Orders Chahiye`,
        text: `Average order ₹${formatINR(stats.avgOrderValue)} hai. Daily ₹${formatINR(stats.requiredDaily)} ke liye ${stats.ordersNeededDaily} orders karne padenge.`,
      })
    }

    // Projection
    if (stats.projectedShortfall > 0 && stats.daysPassed >= 3) {
      items.push({
        icon: '📉',
        tone: 'danger',
        title: `Projected Shortfall: ${formatINRShort(stats.projectedShortfall)}`,
        text: `Is rate (${formatINRShort(stats.actualDailyAvg)}/day) se chala to month end pe ₹${formatINR(stats.projection)} hoga. ${formatINRShort(stats.projectedShortfall)} kam padega.`,
      })
    } else if (stats.projectedShortfall < 0 && stats.daysPassed >= 3) {
      items.push({
        icon: '📈',
        tone: 'success',
        title: `Projected Surplus: ${formatINRShort(Math.abs(stats.projectedShortfall))}`,
        text: `Is rate se chala to ₹${formatINR(stats.projection)} hoga - target se ${formatINRShort(Math.abs(stats.projectedShortfall))} zyada.`,
      })
    }

    // Repeat rate
    if (stats.repeatPct < 30 && stats.totalOrderCount > 20) {
      items.push({
        icon: '🔄',
        tone: 'info',
        title: `Repeat Rate Sirf ${stats.repeatPct.toFixed(1)}%`,
        text: `Repeat orders sirf ${stats.repeatCount} hain. Agar repeat rate 40% hota to ${formatINRShort(stats.achieved * 0.15)} extra revenue aata.`,
      })
    }

    // COD ratio
    const codRatio = stats.achieved > 0 ? (stats.achievedCOD / stats.achieved) * 100 : 0
    if (codRatio > 50) {
      items.push({
        icon: '💸',
        tone: 'warn',
        title: `COD Ratio High (${codRatio.toFixed(1)}%)`,
        text: `COD me ₹${formatINR(stats.achievedCOD)} hai. Prepay push karo - cancellations kam honge aur cash flow better hoga.`,
      })
    }

    // AOV push
    if (stats.avgOrderValue < 2000 && stats.totalOrderCount > 10) {
      items.push({
        icon: '💰',
        tone: 'info',
        title: `Avg Order Value ₹${formatINR(stats.avgOrderValue)}`,
        text: `AOV thoda kam hai. Upgrade plans ya bundles offer karke ₹2500+ tak laao - target jaldi hit hoga.`,
      })
    }

    // Top doctors push
    if (topDoctors.length > 0) {
      const topDocRevenue = topDoctors.reduce((s, d) => s + d.revenue, 0)
      const topDocPct = stats.achieved > 0 ? (topDocRevenue / stats.achieved) * 100 : 0
      items.push({
        icon: '👨‍⚕️',
        tone: 'info',
        title: `Top 5 Doctors = ${topDocPct.toFixed(0)}% Revenue`,
        text: `${topDoctors.map((d) => d.name).slice(0, 3).join(', ')} sabse zyada laate hain. Inko aur push karo.`,
      })
    }

    return items
  }, [stats, config.monthlyTarget, topDoctors])

  const handleSaveTarget = () => {
    const num = parseFloat(tempTarget.replace(/[^\d.]/g, ''))
    if (!isNaN(num) && num > 0) {
      setConfig((c) => ({ ...c, monthlyTarget: num }))
    }
    setEditingTarget(false)
    setTempTarget('')
  }

  const paceColor = stats.paceStatus === 'behind' ? '#dc2626' : stats.paceStatus === 'ahead' ? '#16a34a' : '#f59e0b'
  const paceIcon = stats.paceStatus === 'behind' ? '🔴' : stats.paceStatus === 'ahead' ? '🟢' : '🟡'
  const paceLabel = stats.paceStatus === 'behind' ? 'BEHIND' : stats.paceStatus === 'ahead' ? 'AHEAD' : 'ON TRACK'

  return (
    <div className="target-tracker">
      {/* === Config Bar === */}
      <div className="target-config">
        <div className="target-config-item">
          <label>Monthly Target</label>
          {editingTarget ? (
            <div className="target-edit-row">
              <input
                type="text"
                value={tempTarget}
                onChange={(e) => setTempTarget(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTarget()}
                placeholder="e.g. 30000000"
                autoFocus
              />
              <button className="target-btn-save" onClick={handleSaveTarget}>Save</button>
              <button className="target-btn-cancel" onClick={() => { setEditingTarget(false); setTempTarget('') }}>X</button>
            </div>
          ) : (
            <div className="target-display-row">
              <span className="target-display-val">₹{formatINR(config.monthlyTarget)}</span>
              <span className="target-display-short">({formatINRShort(config.monthlyTarget)})</span>
              <button className="target-btn-edit" onClick={() => { setEditingTarget(true); setTempTarget(String(config.monthlyTarget)) }}>Edit</button>
            </div>
          )}
        </div>

        <div className="target-config-item">
          <label>Month</label>
          <select value={selectedMonth} onChange={(e) => setConfig((c) => ({ ...c, selectedMonth: e.target.value }))}>
            {availableMonths.map((m) => {
              const [y, mm] = m.split('-')
              const monthName = new Date(parseInt(y), parseInt(mm) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
              return <option key={m} value={m}>{monthName}</option>
            })}
          </select>
        </div>

        <div className="target-config-item">
          <label>Include Sundays</label>
          <label className="target-toggle">
            <input
              type="checkbox"
              checked={config.includeSundays}
              onChange={(e) => setConfig((c) => ({ ...c, includeSundays: e.target.checked }))}
            />
            <span>{config.includeSundays ? 'Yes (7 days/week)' : 'No (Mon-Sat only)'}</span>
          </label>
        </div>
      </div>

      {/* === Hero Status === */}
      <div className="target-hero">
        <div className="target-hero-top">
          <div>
            <div className="target-hero-label">Achieved</div>
            <div className="target-hero-val">₹{formatINR(stats.achieved)}</div>
            <div className="target-hero-sub">{formatINRShort(stats.achieved)} of {formatINRShort(config.monthlyTarget)}</div>
          </div>
          <div className="target-pace-badge" style={{ background: paceColor }}>
            <span style={{ fontSize: 22 }}>{paceIcon}</span>
            <span>{paceLabel}</span>
            {stats.paceStatus !== 'on-track' && <span className="target-pace-pct">{stats.paceStatus === 'behind' ? '-' : '+'}{Math.abs(stats.pacePct).toFixed(1)}%</span>}
          </div>
        </div>

        <div className="target-progress-wrap">
          <div className="target-progress-bar">
            <div
              className="target-progress-fill"
              style={{
                width: `${Math.min(100, stats.progressPct)}%`,
                background: stats.progressPct >= 100
                  ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                  : stats.paceStatus === 'behind'
                    ? 'linear-gradient(90deg, #dc2626, #f59e0b)'
                    : 'linear-gradient(90deg, #667eea, #16a34a)',
              }}
            />
            <span className="target-progress-text">{stats.progressPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* === Big KPI Cards === */}
      <div className="target-kpi-grid">
        <div className="target-kpi-card blue">
          <div className="target-kpi-label">Target</div>
          <div className="target-kpi-val">{formatINRShort(config.monthlyTarget)}</div>
          <div className="target-kpi-sub">₹{formatINR(config.monthlyTarget)}</div>
        </div>
        <div className="target-kpi-card green">
          <div className="target-kpi-label">Achieved</div>
          <div className="target-kpi-val">{formatINRShort(stats.achieved)}</div>
          <div className="target-kpi-sub">{stats.totalOrderCount} orders</div>
        </div>
        <div className="target-kpi-card orange">
          <div className="target-kpi-label">Remaining</div>
          <div className="target-kpi-val">{formatINRShort(stats.remaining)}</div>
          <div className="target-kpi-sub">{stats.progressPct >= 100 ? 'Done!' : `${(100 - stats.progressPct).toFixed(1)}% left`}</div>
        </div>
        <div className="target-kpi-card purple">
          <div className="target-kpi-label">Days Passed</div>
          <div className="target-kpi-val">{stats.daysPassed} / {stats.workingDays}</div>
          <div className="target-kpi-sub">{stats.daysLeft} din bache</div>
        </div>
        <div className="target-kpi-card teal">
          <div className="target-kpi-label">Ideal Daily</div>
          <div className="target-kpi-val">{formatINRShort(stats.idealDaily)}</div>
          <div className="target-kpi-sub">₹{formatINR(stats.idealDaily)}/day</div>
        </div>
        <div className="target-kpi-card pink">
          <div className="target-kpi-label">Actual Avg/Day</div>
          <div className="target-kpi-val">{formatINRShort(stats.actualDailyAvg)}</div>
          <div className="target-kpi-sub">{stats.daysPassed} days basis</div>
        </div>
        <div className="target-kpi-card red">
          <div className="target-kpi-label">Required/Day</div>
          <div className="target-kpi-val">{formatINRShort(stats.requiredDaily)}</div>
          <div className="target-kpi-sub">target hit karne ke liye</div>
        </div>
        <div className="target-kpi-card blue">
          <div className="target-kpi-label">Today {isCurrentMonth ? '' : '(N/A)'}</div>
          <div className="target-kpi-val">{formatINRShort(stats.todayRevenue)}</div>
          <div className="target-kpi-sub">{stats.todayOrders} orders</div>
        </div>
      </div>

      {/* === Smart Action Items === */}
      <div className="target-actions">
        <h3 className="target-section-title">🎯 Kya Karna Padega (Action Plan)</h3>
        <div className="target-action-grid">
          {actionItems.map((item, i) => (
            <div key={i} className={`target-action-card target-action-${item.tone}`}>
              <div className="target-action-icon">{item.icon}</div>
              <div className="target-action-body">
                <div className="target-action-title">{item.title}</div>
                <div className="target-action-text">{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === Daily Tracker Chart === */}
      <div className="chart-card full-width" style={{ marginTop: 24 }}>
        <div className="chart-header">
          <h3>📅 Daily Revenue Tracker</h3>
          <span className="chart-subtitle">Red dashed line = ideal daily target ({formatINRShort(stats.idealDaily)}). Green bar = target hit, red bar = below target.</span>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={dailyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={12} tickFormatter={(v) => formatINRShort(v)} />
            <Tooltip
              formatter={(val, name) => name === 'revenue' ? [`₹${formatINR(val)}`, 'Revenue'] : [val, name]}
              labelFormatter={(d) => `Day ${d}`}
            />
            <ReferenceLine y={stats.idealDaily} stroke="#dc2626" strokeDasharray="5 5" label={{ value: 'Target', fill: '#dc2626', fontSize: 11, position: 'right' }} />
            <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
              {dailyChartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.revenue === 0 ? '#e5e7eb' : d.hit ? '#16a34a' : d.isSunday ? '#94a3b8' : '#f59e0b'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Cumulative Trend === */}
      <div className="chart-card full-width" style={{ marginTop: 20 }}>
        <div className="chart-header">
          <h3>📈 Cumulative Progress vs Target</h3>
          <span className="chart-subtitle">Blue = actual cumulative, dashed = ideal pace</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={(() => {
              let cum = 0
              return dailyChartData.map((d) => {
                cum += d.revenue
                return {
                  day: d.day,
                  cumulative: cum,
                  idealLine: stats.idealDaily * d.day,
                }
              })
            })()}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={12} tickFormatter={(v) => formatINRShort(v)} />
            <Tooltip formatter={(val) => `₹${formatINR(val)}`} labelFormatter={(d) => `Day ${d}`} />
            <Legend />
            <ReferenceLine y={config.monthlyTarget} stroke="#16a34a" strokeDasharray="5 5" label={{ value: `Target ${formatINRShort(config.monthlyTarget)}`, fill: '#16a34a', fontSize: 11, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="cumulative" name="Actual" stroke="#667eea" strokeWidth={3} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="idealLine" name="Ideal Pace" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* === Agent Targets === */}
      <div className="target-section" style={{ marginTop: 24 }}>
        <h3 className="target-section-title">👥 Agent-wise Target Distribution</h3>
        <p className="target-section-subtitle">Proportional target based on each agent's current contribution share</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Achieved</th>
                <th>Orders</th>
                <th>Active Days</th>
                <th>Avg/Day</th>
                <th>Share %</th>
                <th>Their Target</th>
                <th>Daily Needed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {agentTargets.slice(0, 20).map((a, i) => (
                <tr key={i} className={a.onPace ? 'row-match' : 'row-mismatch'}>
                  <td>{i + 1}</td>
                  <td><strong>{a.name}</strong></td>
                  <td className="amount">₹{formatINR(a.achieved)}</td>
                  <td>{a.orders}</td>
                  <td>{a.activeDays}</td>
                  <td>₹{formatINR(a.avgPerDay)}</td>
                  <td>{(a.sharePct * 100).toFixed(1)}%</td>
                  <td>{formatINRShort(a.proportionalTarget)}</td>
                  <td>₹{formatINR(a.dailyNeeded)}</td>
                  <td>
                    <span className={a.onPace ? 'badge badge-match' : 'badge badge-mismatch'}>
                      {a.onPace ? '✓ On Pace' : '⚠ Push Needed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === Top Doctors === */}
      <div className="target-section" style={{ marginTop: 24 }}>
        <h3 className="target-section-title">👨‍⚕️ Top 5 Doctors (Revenue Drivers)</h3>
        <div className="target-doctor-grid">
          {topDoctors.map((d, i) => (
            <div key={i} className="target-doctor-card">
              <div className="target-doctor-rank">#{i + 1}</div>
              <div className="target-doctor-name">{d.name}</div>
              <div className="target-doctor-revenue">{formatINRShort(d.revenue)}</div>
              <div className="target-doctor-orders">{d.orders} orders</div>
              <div className="target-doctor-pct">{stats.achieved > 0 ? ((d.revenue / stats.achieved) * 100).toFixed(1) : 0}% of total</div>
            </div>
          ))}
          {topDoctors.length === 0 && <div className="no-data">No doctor data for this month</div>}
        </div>
      </div>

      {/* === Quick Summary Footer === */}
      <div className="target-summary-footer">
        <div className="target-summary-row">
          <span>Total Prepay:</span> <strong>₹{formatINR(stats.achievedPrepay)}</strong>
        </div>
        <div className="target-summary-row">
          <span>Total COD:</span> <strong>₹{formatINR(stats.achievedCOD)}</strong>
        </div>
        <div className="target-summary-row">
          <span>Avg Order Value:</span> <strong>₹{formatINR(stats.avgOrderValue)}</strong>
        </div>
        <div className="target-summary-row">
          <span>Repeat Orders:</span> <strong>{stats.repeatCount} ({stats.repeatPct.toFixed(1)}%)</strong>
        </div>
        <div className="target-summary-row">
          <span>Full Prepay Orders:</span> <strong>{stats.fullPrepayCount} ({stats.prepayPct.toFixed(1)}%)</strong>
        </div>
        <div className="target-summary-row">
          <span>Active Agents:</span> <strong>{agentTargets.length}</strong>
        </div>
      </div>
    </div>
  )
}
