import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts'

const COLORS = [
  '#667eea', '#764ba2', '#f97316', '#16a34a', '#dc2626', '#0ea5e9',
  '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#84cc16',
  '#f43f5e', '#22d3ee', '#a855f7', '#fb923c',
]

export default function Charts({ data }) {
  const [activeChart, setActiveChart] = useState('overview')

  // === Summary Stats ===
  const summary = useMemo(() => {
    const totalOrders = data.length
    const totalRevenue = data.reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0)
    const totalPrepay = data.reduce((s, r) => s + (parseFloat(r.prepayAmount) || 0), 0)
    const totalCOD = data.reduce((s, r) => s + (parseFloat(r.codAmount) || 0), 0)
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
    const repeatCount = data.filter((r) => (r.orderType || '').toLowerCase().includes('repeat')).length
    const repeatPct = totalOrders > 0 ? Math.round((repeatCount / totalOrders) * 100) : 0
    const uniqueDoctors = new Set(data.map((r) => r.doctor?.trim().toLowerCase()).filter(Boolean)).size
    const uniqueStaff = new Set(data.map((r) => r.supportStaff?.trim().toLowerCase()).filter(Boolean)).size

    // Best day
    const dayMap = new Map()
    data.forEach((r) => {
      const d = r.date?.trim()
      if (d) dayMap.set(d, (dayMap.get(d) || 0) + 1)
    })
    let bestDay = '-', bestDayCount = 0
    dayMap.forEach((count, day) => { if (count > bestDayCount) { bestDay = day; bestDayCount = count } })

    return { totalOrders, totalRevenue, totalPrepay, totalCOD, avgOrder, repeatCount, repeatPct, uniqueDoctors, uniqueStaff, bestDay, bestDayCount }
  }, [data])

  // === Chart Data ===
  const doctorData = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const doc = r.doctor?.trim() || 'Unknown'
      if (!map.has(doc)) map.set(doc, { orders: 0, revenue: 0 })
      const e = map.get(doc)
      e.orders++
      e.revenue += parseFloat(r.orderAmount) || 0
    })
    return [...map.entries()]
      .map(([name, v]) => ({ name: name.length > 22 ? name.slice(0, 22) + '...' : name, fullName: name, ...v }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 12)
  }, [data])

  const locationData = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const loc = r.location?.trim() || 'Unknown'
      const parts = loc.split(/\s+/)
      const state = parts.length > 1 ? parts[parts.length - 1] : loc
      map.set(state, (map.get(state) || 0) + 1)
    })
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12)
  }, [data])

  const dailyData = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const d = r.date?.trim()
      if (!d) return
      if (!map.has(d)) map.set(d, { orders: 0, amount: 0, cod: 0, prepay: 0 })
      const e = map.get(d)
      e.orders++
      e.amount += parseFloat(r.orderAmount) || 0
      e.cod += parseFloat(r.codAmount) || 0
      e.prepay += parseFloat(r.prepayAmount) || 0
    })
    return [...map.entries()]
      .map(([date, v]) => ({ date: date.replace(/\/2026$/, ''), fullDate: date, ...v }))
      .sort((a, b) => a.fullDate.split('/').reverse().join('').localeCompare(b.fullDate.split('/').reverse().join('')))
  }, [data])

  const orderTypeData = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const t = (r.orderType?.trim() || 'New Order').toLowerCase()
      const display = t.includes('repeat') ? 'Repeat' : 'New Order'
      map.set(display, (map.get(display) || 0) + 1)
    })
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [data])

  const planTypeData = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const p = r.planType?.trim() || 'Other'
      const lower = p.toLowerCase()
      if (!map.has(lower)) map.set(lower, { name: p || 'Other', orders: 0, revenue: 0 })
      const e = map.get(lower)
      e.orders++
      e.revenue += parseFloat(r.orderAmount) || 0
    })
    return [...map.values()].sort((a, b) => b.orders - a.orders)
  }, [data])

  const amountRangeData = useMemo(() => {
    const ranges = [
      { label: '1,199', min: 1199, max: 1199 },
      { label: '1,489', min: 1489, max: 1489 },
      { label: '2,499-2,999', min: 2499, max: 2999 },
      { label: '3,999', min: 3999, max: 3999 },
      { label: '4,000-6,000', min: 4000, max: 6000 },
      { label: 'Other', min: -1, max: -1 },
    ]
    const counts = ranges.map((r) => ({ ...r, count: 0 }))
    data.forEach((row) => {
      const amt = parseFloat(row.orderAmount) || 0
      let matched = false
      for (let i = 0; i < counts.length - 1; i++) {
        if (amt >= counts[i].min && amt <= counts[i].max) { counts[i].count++; matched = true; break }
      }
      if (!matched) counts[counts.length - 1].count++
    })
    return counts.filter((c) => c.count > 0).map((c) => ({ name: c.label, count: c.count }))
  }, [data])

  const prepayVsCod = useMemo(() => {
    const fullPrepay = data.filter((r) => !parseFloat(r.codAmount)).length
    const hasCod = data.length - fullPrepay
    return [
      { name: 'Full Prepay', count: fullPrepay },
      { name: 'Has COD', count: hasCod },
    ]
  }, [data])

  const medicineData = useMemo(() => {
    const meds = ['aegisMD', 'dynos', 'poseidonMD', 'vitaman', 'paropeace', 'heraclesMD', 'magmapureD3', 'omega3']
    const labels = ['Aegis MD', 'Dynos', 'PoseidonMD', 'Vitaman', 'Paropeace', 'HeraclesMD', 'Magmapure-D3', 'Omega-3']
    return meds.map((key, i) => {
      const total = data.reduce((s, r) => s + (parseInt(r[key]) || 0), 0)
      return { name: labels[i], total }
    }).filter((m) => m.total > 0).sort((a, b) => b.total - a.total)
  }, [data])

  const ChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{payload[0]?.payload?.fullName || payload[0]?.payload?.fullDate || label}</p>
          {payload.map((p, i) => (
            <p key={i} className="tooltip-value" style={{ color: p.color }}>
              {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}</strong>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'doctors', label: 'Doctors' },
    { id: 'geography', label: 'Geography' },
    { id: 'products', label: 'Products' },
  ]

  return (
    <div className="analytics">
      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card blue">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.totalOrders.toLocaleString('en-IN')}</span>
            <span className="summary-label">Total Orders</span>
          </div>
        </div>
        <div className="summary-card green">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.totalRevenue.toLocaleString('en-IN')}</span>
            <span className="summary-label">Total Revenue</span>
          </div>
        </div>
        <div className="summary-card purple">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.avgOrder.toLocaleString('en-IN')}</span>
            <span className="summary-label">Avg Order Value</span>
          </div>
        </div>
        <div className="summary-card orange">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.uniqueStaff}</span>
            <span className="summary-label">Active Agents</span>
          </div>
        </div>
        <div className="summary-card teal">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.bestDay}</span>
            <span className="summary-label">Best Day ({summary.bestDayCount} orders)</span>
          </div>
        </div>
        <div className="summary-card pink">
          <div className="summary-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          </div>
          <div className="summary-info">
            <span className="summary-num">{summary.repeatPct}%</span>
            <span className="summary-label">Repeat Orders ({summary.repeatCount})</span>
          </div>
        </div>
      </div>

      {/* Section Nav */}
      <div className="chart-nav">
        {sections.map((s) => (
          <button key={s.id} className={activeChart === s.id ? 'chart-nav-btn active' : 'chart-nav-btn'} onClick={() => setActiveChart(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* === OVERVIEW === */}
      {activeChart === 'overview' && (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-header">
              <h3>Prepay vs COD</h3>
              <span className="chart-subtitle">Payment method split</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={prepayVsCod} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={4}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={12}>
                  <Cell fill="#16a34a" /><Cell fill="#dc2626" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Repeat vs New</h3>
              <span className="chart-subtitle">Order type breakdown</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={orderTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={4}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={12}>
                  {orderTypeData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Amount Distribution</h3>
              <span className="chart-subtitle">Order amount ranges</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={amountRangeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Orders" radius={[6, 6, 0, 0]}>
                  {amountRangeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Plan Type Breakdown</h3>
              <span className="chart-subtitle">Orders by plan duration</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={planTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="orders" name="Orders" radius={[0, 6, 6, 0]}>
                  {planTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* === TRENDS === */}
      {activeChart === 'trends' && (
        <div className="charts-grid">
          <div className="chart-card full-width">
            <div className="chart-header">
              <h3>Daily Orders</h3>
              <span className="chart-subtitle">Number of orders per day</span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#667eea" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#667eea" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="orders" name="Orders" stroke="#667eea" fill="url(#orderGrad)" strokeWidth={2.5} dot={{ r: 3, fill: '#667eea' }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card full-width">
            <div className="chart-header">
              <h3>Revenue Trend</h3>
              <span className="chart-subtitle">Daily revenue breakdown</span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="amtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="codGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="amount" name="Total" stroke="#16a34a" fill="url(#amtGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="prepay" name="Prepay" stroke="#667eea" fill="transparent" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Area type="monotone" dataKey="cod" name="COD" stroke="#dc2626" fill="url(#codGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* === DOCTORS === */}
      {activeChart === 'doctors' && (
        <div className="charts-grid">
          <div className="chart-card full-width">
            <div className="chart-header">
              <h3>Top Doctors by Orders</h3>
              <span className="chart-subtitle">Most active doctors</span>
            </div>
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={doctorData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} />
                <YAxis dataKey="name" type="category" fontSize={11} width={170} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="orders" name="Orders" radius={[0, 6, 6, 0]} barSize={20}>
                  {doctorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card full-width">
            <div className="chart-header">
              <h3>Top Doctors by Revenue</h3>
              <span className="chart-subtitle">Revenue contribution</span>
            </div>
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={[...doctorData].sort((a, b) => b.revenue - a.revenue)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} />
                <YAxis dataKey="name" type="category" fontSize={11} width={170} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]} barSize={20}>
                  {doctorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* === GEOGRAPHY === */}
      {activeChart === 'geography' && (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-header">
              <h3>Orders by State</h3>
              <span className="chart-subtitle">Geographic distribution</span>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie data={locationData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={140} paddingAngle={2}
                  label={({ name, percent }) => percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ''} fontSize={11}>
                  {locationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Top States Bar</h3>
              <span className="chart-subtitle">Top 12 states by orders</span>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={locationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Orders" radius={[6, 6, 0, 0]}>
                  {locationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* === PRODUCTS === */}
      {activeChart === 'products' && (
        <div className="charts-grid">
          <div className="chart-card full-width">
            <div className="chart-header">
              <h3>Medicine Orders</h3>
              <span className="chart-subtitle">Total units ordered per medicine</span>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={medicineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Total Units" radius={[8, 8, 0, 0]} barSize={60}>
                  {medicineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Medicine Share</h3>
              <span className="chart-subtitle">Proportion of each medicine</span>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie data={medicineData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={11}>
                  {medicineData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Plan Type Revenue</h3>
              <span className="chart-subtitle">Revenue by plan duration</span>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={planTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                  {planTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
