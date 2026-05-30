import { useMemo, useState, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#667eea', '#764ba2', '#f97316', '#16a34a', '#dc2626', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308']

export default function AgentPerformance({ data }) {
  const [sortBy, setSortBy] = useState('totalOrders')
  const [expandedAgent, setExpandedAgent] = useState(null)

  const agentStats = useMemo(() => {
    const map = new Map()

    data.forEach((r) => {
      const staff = r.supportStaff?.trim()
      if (!staff) return
      const lower = staff.toLowerCase()

      if (!map.has(lower)) {
        map.set(lower, { name: staff, totalOrders: 0, totalAmount: 0, totalCOD: 0, totalPrepay: 0, dates: new Set(), orders: [] })
      }
      const entry = map.get(lower)
      entry.totalOrders++
      entry.totalAmount += parseFloat(r.orderAmount) || 0
      entry.totalCOD += parseFloat(r.codAmount) || 0
      entry.totalPrepay += parseFloat(r.prepayAmount) || 0
      if (r.date?.trim()) entry.dates.add(r.date.trim())
      entry.orders.push(r)
    })

    return [...map.values()].map((a) => ({
      ...a,
      activeDays: a.dates.size,
      avgPerDay: a.dates.size > 0 ? Math.round((a.totalOrders / a.dates.size) * 10) / 10 : 0,
      avgAmount: a.totalOrders > 0 ? Math.round(a.totalAmount / a.totalOrders) : 0,
      dates: undefined,
    }))
  }, [data])

  const sorted = useMemo(() => {
    return [...agentStats].sort((a, b) => b[sortBy] - a[sortBy])
  }, [agentStats, sortBy])

  const chartData = useMemo(() => sorted.slice(0, 15), [sorted])

  const totalOrders = agentStats.reduce((s, a) => s + a.totalOrders, 0)
  const totalAmount = agentStats.reduce((s, a) => s + a.totalAmount, 0)

  return (
    <div className="agent-performance">
      <div className="stats-row">
        <div className="stat-box purple"><div className="num">{agentStats.length}</div><div className="label">Total Agents</div></div>
        <div className="stat-box green"><div className="num">{totalOrders}</div><div className="label">Total Orders</div></div>
        <div className="stat-box red"><div className="num">{totalAmount.toLocaleString('en-IN')}</div><div className="label">Total Amount</div></div>
      </div>

      {/* Chart */}
      <div className="chart-card full-width">
        <h3>Top Agents (by Orders)</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" fontSize={11} angle={-45} textAnchor="end" />
            <YAxis fontSize={12} />
            <Tooltip formatter={(val) => val.toLocaleString('en-IN')} />
            <Bar dataKey="totalOrders" name="Orders" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sort */}
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="filter-group" style={{ minWidth: 200 }}>
          <label>Sort By</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="totalOrders">Total Orders</option>
            <option value="totalAmount">Total Amount</option>
            <option value="avgPerDay">Avg Orders/Day</option>
            <option value="activeDays">Active Days</option>
            <option value="totalCOD">Total COD</option>
            <option value="totalPrepay">Total Prepay</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Rank</th>
              <th>Agent</th>
              <th>Total Orders</th>
              <th>Total Amount</th>
              <th>Prepay</th>
              <th>COD</th>
              <th>Active Days</th>
              <th>Avg Orders/Day</th>
              <th>Avg Order Amt</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const expanded = expandedAgent === a.name
              return (
              <Fragment key={a.name}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedAgent(expanded ? null : a.name)}>
                  <td><span className="expand-arrow">{expanded ? '▼' : '▶'}</span></td>
                  <td><strong>{i + 1}</strong></td>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.totalOrders}</td>
                  <td className="amount">{a.totalAmount.toLocaleString('en-IN')}</td>
                  <td className="amount">{a.totalPrepay.toLocaleString('en-IN')}</td>
                  <td className="cod">{a.totalCOD.toLocaleString('en-IN')}</td>
                  <td>{a.activeDays}</td>
                  <td><span className="badge badge-plan">{a.avgPerDay}</span></td>
                  <td>{a.avgAmount.toLocaleString('en-IN')}</td>
                </tr>
                {expanded && (
                  <tr className="links-row">
                    <td colSpan={10}>
                      <div className="links-dropdown" style={{ padding: 12 }}>
                        <div className="match-section-title order-title" style={{ marginBottom: 8 }}>
                          {a.name} — All Sales ({a.orders.length} orders)
                        </div>
                        <table className="inner-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Date</th>
                              <th>Customer Name</th>
                              <th>Phone</th>
                              <th>Doctor</th>
                              <th>Amount</th>
                              <th>Prepay</th>
                              <th>COD</th>
                              <th>Plan Type</th>
                              <th>Order Type</th>
                              <th>Location</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...a.orders]
                              .sort((x, y) => (x.date || '').localeCompare(y.date || ''))
                              .map((o, j) => (
                                <tr key={j}>
                                  <td>{j + 1}</td>
                                  <td>{o.date}</td>
                                  <td><strong>{o.name}</strong></td>
                                  <td>{o.phone || <span className="badge badge-mismatch">N/A</span>}</td>
                                  <td>{o.doctor}</td>
                                  <td className="amount">{o.orderAmount}</td>
                                  <td className="amount">{o.prepayAmount}</td>
                                  <td className="cod">{o.codAmount}</td>
                                  <td>{o.planType && <span className="badge badge-plan">{o.planType}</span>}</td>
                                  <td>{o.orderType && <span className="badge badge-order-type">{o.orderType}</span>}</td>
                                  <td>{o.location}</td>
                                </tr>
                              ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                              <td colSpan={5} style={{ textAlign: 'right' }}>Total ({a.orders.length} orders)</td>
                              <td className="amount">{a.totalAmount.toLocaleString('en-IN')}</td>
                              <td className="amount">{a.totalPrepay.toLocaleString('en-IN')}</td>
                              <td className="cod">{a.totalCOD.toLocaleString('en-IN')}</td>
                              <td colSpan={3}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
