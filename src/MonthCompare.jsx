import { useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

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

function getMonthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function computeMonthMetrics(rows) {
  const revenue = rows.reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
  const prepay = rows.reduce((s, r) => s + (parseFloat(r.prepayAmount) || 0), 0)
  const cod = rows.reduce((s, r) => s + (parseFloat(r.codAmount) || 0), 0)
  const orders = rows.length
  const aov = orders > 0 ? revenue / orders : 0
  const repeatCount = rows.filter((r) => (r.orderType || '').toLowerCase().includes('repeat')).length
  const repeatPct = orders > 0 ? (repeatCount / orders) * 100 : 0
  const fullPrepay = rows.filter((r) => !parseFloat(r.codAmount)).length
  const prepayPct = orders > 0 ? (fullPrepay / orders) * 100 : 0
  const codPct = orders > 0 ? ((orders - fullPrepay) / orders) * 100 : 0
  const dates = new Set(rows.map((r) => normalizeDate(r.date)).filter(Boolean))
  const activeDays = dates.size
  const dailyAvg = activeDays > 0 ? revenue / activeDays : 0

  // Top agent
  const agentMap = new Map()
  rows.forEach((r) => {
    const s = r.supportStaff?.trim()
    if (!s) return
    const k = s.toLowerCase()
    agentMap.set(k, (agentMap.get(k) || 0) + (parseFloat(r.orderAmount) || 0))
  })
  let topAgent = '-', topAgentRevenue = 0
  agentMap.forEach((v, k) => { if (v > topAgentRevenue) { topAgent = k; topAgentRevenue = v } })

  // Top doctor
  const docMap = new Map()
  rows.forEach((r) => {
    const d = r.doctor?.trim()
    if (!d) return
    docMap.set(d, (docMap.get(d) || 0) + (parseFloat(r.orderAmount) || 0))
  })
  let topDoctor = '-', topDoctorRevenue = 0
  docMap.forEach((v, k) => { if (v > topDoctorRevenue) { topDoctor = k; topDoctorRevenue = v } })

  // Unique agents and doctors
  const uniqueAgents = new Set(rows.map((r) => r.supportStaff?.trim().toLowerCase()).filter(Boolean)).size
  const uniqueDoctors = new Set(rows.map((r) => r.doctor?.trim().toLowerCase()).filter(Boolean)).size

  return {
    revenue, prepay, cod, orders, aov, repeatCount, repeatPct,
    fullPrepay, prepayPct, codPct, activeDays, dailyAvg,
    topAgent: topAgent.replace(/\b\w/g, (c) => c.toUpperCase()),
    topAgentRevenue, topDoctor, topDoctorRevenue,
    uniqueAgents, uniqueDoctors,
  }
}

function pctChange(a, b) {
  if (!a && !b) return 0
  if (!a) return 100
  return ((b - a) / Math.abs(a)) * 100
}

function ChangeBadge({ change, inverted = false }) {
  if (Math.abs(change) < 0.5) return <span style={{ color: '#94a3b8', fontWeight: 600 }}>⚪ 0%</span>
  const positive = inverted ? change < 0 : change > 0
  const color = positive ? '#16a34a' : '#dc2626'
  const arrow = change > 0 ? '↑' : '↓'
  return <span style={{ color, fontWeight: 700 }}>{positive ? '🟢' : '🔴'} {arrow} {Math.abs(change).toFixed(1)}%</span>
}

export default function MonthCompare({ data }) {
  // Available months in data
  const availableMonths = useMemo(() => {
    const set = new Set()
    data.forEach((r) => {
      const nd = normalizeDate(r.date)
      if (nd) set.add(nd.slice(0, 7))
    })
    return [...set].sort()
  }, [data])

  const [monthA, setMonthA] = useState(() => availableMonths[availableMonths.length - 2] || availableMonths[0] || '')
  const [monthB, setMonthB] = useState(() => availableMonths[availableMonths.length - 1] || '')

  const rowsA = useMemo(() => data.filter((r) => normalizeDate(r.date).startsWith(monthA)), [data, monthA])
  const rowsB = useMemo(() => data.filter((r) => normalizeDate(r.date).startsWith(monthB)), [data, monthB])

  const metricsA = useMemo(() => computeMonthMetrics(rowsA), [rowsA])
  const metricsB = useMemo(() => computeMonthMetrics(rowsB), [rowsB])

  // Daily revenue for overlay chart
  const dailyChartData = useMemo(() => {
    const result = []
    for (let d = 1; d <= 31; d++) {
      const aRevenue = rowsA
        .filter((r) => {
          const nd = normalizeDate(r.date)
          return nd && parseInt(nd.slice(8, 10)) === d
        })
        .reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
      const bRevenue = rowsB
        .filter((r) => {
          const nd = normalizeDate(r.date)
          return nd && parseInt(nd.slice(8, 10)) === d
        })
        .reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
      result.push({ day: d, [monthA]: aRevenue, [monthB]: bRevenue })
    }
    return result
  }, [rowsA, rowsB, monthA, monthB])

  // Agent comparison
  const agentComparison = useMemo(() => {
    const map = new Map()
    rowsA.forEach((r) => {
      const s = r.supportStaff?.trim()
      if (!s) return
      const k = s.toLowerCase()
      if (!map.has(k)) map.set(k, { name: s, a: 0, b: 0, aOrders: 0, bOrders: 0 })
      map.get(k).a += parseFloat(r.orderAmount) || 0
      map.get(k).aOrders++
    })
    rowsB.forEach((r) => {
      const s = r.supportStaff?.trim()
      if (!s) return
      const k = s.toLowerCase()
      if (!map.has(k)) map.set(k, { name: s, a: 0, b: 0, aOrders: 0, bOrders: 0 })
      map.get(k).b += parseFloat(r.orderAmount) || 0
      map.get(k).bOrders++
    })
    return [...map.values()]
      .map((a) => ({ ...a, change: pctChange(a.a, a.b), absChange: a.b - a.a }))
      .sort((a, b) => Math.max(b.a, b.b) - Math.max(a.a, a.b))
      .slice(0, 15)
  }, [rowsA, rowsB])

  // Risk / Win lists
  const droppedAgents = useMemo(() => {
    return agentComparison
      .filter((a) => a.a > 50000 && a.change < -25)
      .sort((a, b) => a.change - b.change)
  }, [agentComparison])

  const risingAgents = useMemo(() => {
    return agentComparison
      .filter((a) => a.b > 50000 && a.change > 25)
      .sort((a, b) => b.change - a.change)
  }, [agentComparison])

  if (availableMonths.length < 2) {
    return (
      <div className="no-data" style={{ padding: 40 }}>
        Need data from at least 2 different months to compare. Currently found: {availableMonths.length} month(s).
      </div>
    )
  }

  return (
    <div className="month-compare">
      {/* Month selectors */}
      <div className="compare-selector">
        <div className="compare-selector-item">
          <label>Month A (Previous)</label>
          <select value={monthA} onChange={(e) => setMonthA(e.target.value)}>
            {availableMonths.map((m) => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
          </select>
        </div>
        <div className="compare-vs">VS</div>
        <div className="compare-selector-item">
          <label>Month B (Current)</label>
          <select value={monthB} onChange={(e) => setMonthB(e.target.value)}>
            {availableMonths.map((m) => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {/* Quick KPIs */}
      <div className="compare-kpi-row">
        <div className="compare-kpi-card">
          <div className="compare-kpi-label">Revenue Change</div>
          <div className="compare-kpi-val">{formatINRShort(metricsB.revenue - metricsA.revenue)}</div>
          <ChangeBadge change={pctChange(metricsA.revenue, metricsB.revenue)} />
        </div>
        <div className="compare-kpi-card">
          <div className="compare-kpi-label">Orders Change</div>
          <div className="compare-kpi-val">{metricsB.orders - metricsA.orders}</div>
          <ChangeBadge change={pctChange(metricsA.orders, metricsB.orders)} />
        </div>
        <div className="compare-kpi-card">
          <div className="compare-kpi-label">AOV Change</div>
          <div className="compare-kpi-val">₹{formatINR(metricsB.aov - metricsA.aov)}</div>
          <ChangeBadge change={pctChange(metricsA.aov, metricsB.aov)} />
        </div>
        <div className="compare-kpi-card">
          <div className="compare-kpi-label">Repeat Change</div>
          <div className="compare-kpi-val">{(metricsB.repeatPct - metricsA.repeatPct).toFixed(1)}%</div>
          <ChangeBadge change={pctChange(metricsA.repeatPct, metricsB.repeatPct)} />
        </div>
      </div>

      {/* Side-by-side table */}
      <div className="compare-section">
        <h3 className="target-section-title">📊 Side-by-Side Metrics</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>{getMonthLabel(monthA)}</th>
                <th>{getMonthLabel(monthB)}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Revenue</strong></td>
                <td className="amount">₹{formatINR(metricsA.revenue)}</td>
                <td className="amount">₹{formatINR(metricsB.revenue)}</td>
                <td><ChangeBadge change={pctChange(metricsA.revenue, metricsB.revenue)} /></td>
              </tr>
              <tr>
                <td><strong>Total Orders</strong></td>
                <td>{metricsA.orders}</td>
                <td>{metricsB.orders}</td>
                <td><ChangeBadge change={pctChange(metricsA.orders, metricsB.orders)} /></td>
              </tr>
              <tr>
                <td><strong>Avg Order Value</strong></td>
                <td>₹{formatINR(metricsA.aov)}</td>
                <td>₹{formatINR(metricsB.aov)}</td>
                <td><ChangeBadge change={pctChange(metricsA.aov, metricsB.aov)} /></td>
              </tr>
              <tr>
                <td><strong>Daily Avg Revenue</strong></td>
                <td>₹{formatINR(metricsA.dailyAvg)}</td>
                <td>₹{formatINR(metricsB.dailyAvg)}</td>
                <td><ChangeBadge change={pctChange(metricsA.dailyAvg, metricsB.dailyAvg)} /></td>
              </tr>
              <tr>
                <td><strong>Active Days</strong></td>
                <td>{metricsA.activeDays}</td>
                <td>{metricsB.activeDays}</td>
                <td><span style={{ color: '#64748b' }}>📅 {metricsB.activeDays - metricsA.activeDays > 0 ? '+' : ''}{metricsB.activeDays - metricsA.activeDays} days</span></td>
              </tr>
              <tr>
                <td><strong>Total Prepay</strong></td>
                <td className="amount">₹{formatINR(metricsA.prepay)}</td>
                <td className="amount">₹{formatINR(metricsB.prepay)}</td>
                <td><ChangeBadge change={pctChange(metricsA.prepay, metricsB.prepay)} /></td>
              </tr>
              <tr>
                <td><strong>Total COD</strong></td>
                <td className="cod">₹{formatINR(metricsA.cod)}</td>
                <td className="cod">₹{formatINR(metricsB.cod)}</td>
                <td><ChangeBadge change={pctChange(metricsA.cod, metricsB.cod)} inverted /></td>
              </tr>
              <tr>
                <td><strong>Repeat Rate %</strong></td>
                <td>{metricsA.repeatPct.toFixed(1)}% ({metricsA.repeatCount})</td>
                <td>{metricsB.repeatPct.toFixed(1)}% ({metricsB.repeatCount})</td>
                <td><ChangeBadge change={pctChange(metricsA.repeatPct, metricsB.repeatPct)} /></td>
              </tr>
              <tr>
                <td><strong>Full Prepay %</strong></td>
                <td>{metricsA.prepayPct.toFixed(1)}%</td>
                <td>{metricsB.prepayPct.toFixed(1)}%</td>
                <td><ChangeBadge change={pctChange(metricsA.prepayPct, metricsB.prepayPct)} /></td>
              </tr>
              <tr>
                <td><strong>COD %</strong></td>
                <td>{metricsA.codPct.toFixed(1)}%</td>
                <td>{metricsB.codPct.toFixed(1)}%</td>
                <td><ChangeBadge change={pctChange(metricsA.codPct, metricsB.codPct)} inverted /></td>
              </tr>
              <tr>
                <td><strong>Active Agents</strong></td>
                <td>{metricsA.uniqueAgents}</td>
                <td>{metricsB.uniqueAgents}</td>
                <td><ChangeBadge change={pctChange(metricsA.uniqueAgents, metricsB.uniqueAgents)} /></td>
              </tr>
              <tr>
                <td><strong>Unique Doctors</strong></td>
                <td>{metricsA.uniqueDoctors}</td>
                <td>{metricsB.uniqueDoctors}</td>
                <td><ChangeBadge change={pctChange(metricsA.uniqueDoctors, metricsB.uniqueDoctors)} /></td>
              </tr>
              <tr>
                <td><strong>Top Agent</strong></td>
                <td>{metricsA.topAgent} ({formatINRShort(metricsA.topAgentRevenue)})</td>
                <td>{metricsB.topAgent} ({formatINRShort(metricsB.topAgentRevenue)})</td>
                <td>{metricsA.topAgent === metricsB.topAgent ? <span style={{ color: '#16a34a' }}>✓ Same</span> : <span style={{ color: '#f59e0b' }}>⚠ Changed</span>}</td>
              </tr>
              <tr>
                <td><strong>Top Doctor</strong></td>
                <td>{metricsA.topDoctor} ({formatINRShort(metricsA.topDoctorRevenue)})</td>
                <td>{metricsB.topDoctor} ({formatINRShort(metricsB.topDoctorRevenue)})</td>
                <td>{metricsA.topDoctor === metricsB.topDoctor ? <span style={{ color: '#16a34a' }}>✓ Same</span> : <span style={{ color: '#f59e0b' }}>⚠ Changed</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Overlay daily chart */}
      <div className="chart-card full-width" style={{ marginTop: 20 }}>
        <div className="chart-header">
          <h3>📈 Daily Revenue Overlay</h3>
          <span className="chart-subtitle">Both months side-by-side per day of month</span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={dailyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={12} tickFormatter={(v) => formatINRShort(v)} />
            <Tooltip formatter={(val) => `₹${formatINR(val)}`} labelFormatter={(d) => `Day ${d}`} />
            <Legend />
            <Line type="monotone" dataKey={monthA} name={getMonthLabel(monthA)} stroke="#94a3b8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={monthB} name={getMonthLabel(monthB)} stroke="#667eea" strokeWidth={3} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Risk + Rising lists */}
      {(droppedAgents.length > 0 || risingAgents.length > 0) && (
        <div className="compare-risk-grid">
          {risingAgents.length > 0 && (
            <div className="compare-section">
              <h3 className="target-section-title">🚀 Rising Stars (Big Improvers)</h3>
              <table>
                <thead>
                  <tr><th>Agent</th><th>{getMonthLabel(monthA)}</th><th>{getMonthLabel(monthB)}</th><th>Change</th></tr>
                </thead>
                <tbody>
                  {risingAgents.slice(0, 8).map((a, i) => (
                    <tr key={i} className="row-match">
                      <td><strong>{a.name}</strong></td>
                      <td>{formatINRShort(a.a)}</td>
                      <td>{formatINRShort(a.b)}</td>
                      <td><ChangeBadge change={a.change} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {droppedAgents.length > 0 && (
            <div className="compare-section">
              <h3 className="target-section-title">⚠️ Dropped Performers (Needs Push)</h3>
              <table>
                <thead>
                  <tr><th>Agent</th><th>{getMonthLabel(monthA)}</th><th>{getMonthLabel(monthB)}</th><th>Change</th></tr>
                </thead>
                <tbody>
                  {droppedAgents.slice(0, 8).map((a, i) => (
                    <tr key={i} className="row-mismatch">
                      <td><strong>{a.name}</strong></td>
                      <td>{formatINRShort(a.a)}</td>
                      <td>{formatINRShort(a.b)}</td>
                      <td><ChangeBadge change={a.change} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Full agent comparison */}
      <div className="compare-section" style={{ marginTop: 20 }}>
        <h3 className="target-section-title">👥 Agent-wise Full Comparison</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>{getMonthLabel(monthA)} Revenue</th>
                <th>{getMonthLabel(monthB)} Revenue</th>
                <th>Δ Revenue</th>
                <th>{getMonthLabel(monthA)} Orders</th>
                <th>{getMonthLabel(monthB)} Orders</th>
                <th>Change %</th>
              </tr>
            </thead>
            <tbody>
              {agentComparison.map((a, i) => (
                <tr key={i} className={a.change > 0 ? 'row-match' : a.change < -10 ? 'row-mismatch' : ''}>
                  <td>{i + 1}</td>
                  <td><strong>{a.name}</strong></td>
                  <td className="amount">{formatINRShort(a.a)}</td>
                  <td className="amount">{formatINRShort(a.b)}</td>
                  <td style={{ color: a.absChange > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {a.absChange > 0 ? '+' : ''}{formatINRShort(a.absChange)}
                  </td>
                  <td>{a.aOrders}</td>
                  <td>{a.bOrders}</td>
                  <td><ChangeBadge change={a.change} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
