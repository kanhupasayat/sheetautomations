import { useMemo, useState } from 'react'

const VALID_AMOUNTS = [1199, 1399, 1489, 1499, 1649, 2499, 2500, 2800, 2900, 3500, 3999, 4800, 6000]

const MEDICINE_KEYS = ['dynos', 'poseidonMD', 'vitaman', 'anteros', 'anicob', 'heraclesMD', 'morpheusMD', 'magmapureD3', 'aegisMD', 'omega3', 'heliosMD', 'chronos25']

function normalizeDate(dateStr) {
  if (!dateStr) return ''
  const d = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const slash = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (slash) {
    const day = slash[1].padStart(2, '0')
    const month = slash[2].padStart(2, '0')
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

function verifyRow(row, phoneDateAmountStaffMap, phoneDateStaffMap, orderIdMap) {
  const issues = []
  const phone = (row.phone || '').trim()
  const amount = parseFloat(row.orderAmount) || 0
  const prepay = parseFloat(row.prepayAmount) || 0
  const cod = parseFloat(row.codAmount) || 0
  const date = normalizeDate(row.date)

  // === Critical (Red) ===
  if (!row.name?.trim()) issues.push({ severity: 'red', category: 'missing', msg: 'Name missing' })
  if (!phone) issues.push({ severity: 'red', category: 'missing', msg: 'Phone missing' })
  if (!date) issues.push({ severity: 'red', category: 'date', msg: 'Date missing/invalid' })
  if (row.orderAmount?.trim() && amount === 0) issues.push({ severity: 'red', category: 'amount', msg: 'Order amount is 0' })
  else if (!row.orderAmount?.trim()) issues.push({ severity: 'red', category: 'amount', msg: 'Order amount blank' })
  if (cod < 0) issues.push({ severity: 'red', category: 'amount', msg: 'COD is negative' })

  // === Phone validation ===
  if (phone) {
    if (!/^\d+$/.test(phone)) issues.push({ severity: 'red', category: 'phone', msg: 'Phone has non-digit characters' })
    else if (phone.length !== 10) issues.push({ severity: 'orange', category: 'phone', msg: `Phone is ${phone.length} digits (should be 10)` })
    else if (/^(\d)\1{9}$/.test(phone)) issues.push({ severity: 'red', category: 'phone', msg: 'Phone is all same digit (fake)' })
    else if (phone === '1234567890' || phone === '0123456789' || phone === '9876543210') issues.push({ severity: 'red', category: 'phone', msg: 'Phone looks fake (sequential)' })
    else if (!/^[6-9]/.test(phone)) issues.push({ severity: 'orange', category: 'phone', msg: 'Phone does not start with 6/7/8/9' })
  }

  // === Date sanity ===
  if (date) {
    const [y, m, dd] = date.split('-').map(Number)
    const d = new Date(y, m - 1, dd)
    const now = new Date()
    const future = new Date(now)
    future.setDate(future.getDate() + 7)
    if (d > future) issues.push({ severity: 'orange', category: 'date', msg: 'Date is in future' })
    else if (y < 2024) issues.push({ severity: 'orange', category: 'date', msg: 'Date is very old (before 2024)' })
  }

  // === Doctor / Staff / Location missing ===
  if (!row.doctor?.trim()) issues.push({ severity: 'orange', category: 'missing', msg: 'Doctor missing' })
  if (!row.supportStaff?.trim()) issues.push({ severity: 'orange', category: 'missing', msg: 'Staff missing' })
  if (!row.location?.trim()) issues.push({ severity: 'yellow', category: 'missing', msg: 'Location missing' })

  // === COD logic ===
  if (amount > 0 && prepay >= 0 && cod >= 0) {
    const expected = amount - prepay
    if (Math.abs(expected - cod) > 1) issues.push({ severity: 'orange', category: 'amount', msg: `COD should be ${expected}, got ${cod}` })
  }
  if (prepay > amount && amount > 0) issues.push({ severity: 'orange', category: 'amount', msg: `Prepay (${prepay}) > Amount (${amount})` })
  if (prepay < 0) issues.push({ severity: 'red', category: 'amount', msg: 'Prepay is negative' })

  // === Amount validation ===
  if (amount > 0 && !VALID_AMOUNTS.includes(amount)) {
    issues.push({ severity: 'yellow', category: 'amount', msg: `Unusual amount (${amount})` })
  }

  // === Medicine quantity check ===
  const totalMeds = MEDICINE_KEYS.reduce((s, k) => s + (parseInt(row[k]) || 0), 0)
  if (amount > 0 && totalMeds === 0) {
    issues.push({ severity: 'yellow', category: 'medicine', msg: 'Order has amount but no medicine quantity' })
  }

  // === Order ID duplicate ===
  const orderId = (row.orderID || '').trim()
  if (orderId && orderIdMap.get(orderId) > 1) {
    issues.push({ severity: 'red', category: 'duplicate', msg: 'Duplicate Order ID' })
  }

  // === Duplicate (phone+date+amount+staff) ===
  if (phone && date) {
    const key = `${phone}|${date}|${amount}|${(row.supportStaff || '').trim().toLowerCase()}`
    if (phoneDateAmountStaffMap.get(key) > 1) {
      issues.push({ severity: 'red', category: 'duplicate', msg: 'Duplicate (same phone+date+amount+staff)' })
    }
  }

  // === Same phone different staff same day ===
  if (phone && date) {
    const key = `${phone}|${date}`
    const staffSet = phoneDateStaffMap.get(key)
    if (staffSet && staffSet.size > 1) {
      issues.push({ severity: 'yellow', category: 'duplicate', msg: 'Same phone, different staff same day' })
    }
  }

  return issues
}

function downloadCSV(rows, filename) {
  const csv = rows
    .map((r) => r.map((v) => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SheetVerification({ data }) {
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [search, setSearch] = useState('')

  const verification = useMemo(() => {
    const phoneDateAmountStaffMap = new Map()
    const phoneDateStaffMap = new Map()
    const orderIdMap = new Map()

    data.forEach((row) => {
      const phone = (row.phone || '').trim()
      const amount = parseFloat(row.orderAmount) || 0
      const date = normalizeDate(row.date)
      const staff = (row.supportStaff || '').trim().toLowerCase()

      if (phone && date) {
        const key1 = `${phone}|${date}|${amount}|${staff}`
        phoneDateAmountStaffMap.set(key1, (phoneDateAmountStaffMap.get(key1) || 0) + 1)
        const key2 = `${phone}|${date}`
        if (!phoneDateStaffMap.has(key2)) phoneDateStaffMap.set(key2, new Set())
        phoneDateStaffMap.get(key2).add(staff)
      }

      const orderId = (row.orderID || '').trim()
      if (orderId) orderIdMap.set(orderId, (orderIdMap.get(orderId) || 0) + 1)
    })

    const rowIssues = data.map((row) => verifyRow(row, phoneDateAmountStaffMap, phoneDateStaffMap, orderIdMap))

    let red = 0, orange = 0, yellow = 0, clean = 0
    const byCategory = new Map()
    const byStaff = new Map()

    rowIssues.forEach((issues, idx) => {
      const row = data[idx]
      if (issues.length === 0) { clean++; return }
      const hasRed = issues.some((i) => i.severity === 'red')
      const hasOrange = issues.some((i) => i.severity === 'orange')
      if (hasRed) red++
      else if (hasOrange) orange++
      else yellow++

      const seenCats = new Set()
      issues.forEach((issue) => {
        if (seenCats.has(issue.category)) return
        seenCats.add(issue.category)
        byCategory.set(issue.category, (byCategory.get(issue.category) || 0) + 1)
      })

      const staffName = (row.supportStaff || 'Unknown').trim() || 'Unknown'
      if (!byStaff.has(staffName)) byStaff.set(staffName, { name: staffName, total: 0, red: 0, orange: 0, yellow: 0 })
      const s = byStaff.get(staffName)
      s.total++
      if (hasRed) s.red++
      else if (hasOrange) s.orange++
      else s.yellow++
    })

    const score = data.length > 0 ? Math.round((clean / data.length) * 100) : 100

    return {
      rowIssues,
      red,
      orange,
      yellow,
      clean,
      score,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byStaff: [...byStaff.values()].sort((a, b) => (b.red * 10 + b.orange * 3 + b.yellow) - (a.red * 10 + a.orange * 3 + a.yellow)),
    }
  }, [data])

  const filteredRows = useMemo(() => {
    return data
      .map((row, idx) => ({ row, idx, issues: verification.rowIssues[idx] }))
      .filter((x) => {
        if (x.issues.length === 0) return false
        if (filterSeverity) {
          if (!x.issues.some((i) => i.severity === filterSeverity)) return false
        }
        if (filterCategory) {
          if (!x.issues.some((i) => i.category === filterCategory)) return false
        }
        if (filterStaff) {
          if ((x.row.supportStaff || 'Unknown').trim() !== filterStaff) return false
        }
        if (search) {
          const s = search.toLowerCase()
          const blob = `${x.row.name || ''} ${x.row.phone || ''} ${x.row.supportStaff || ''} ${x.row.doctor || ''} ${x.row.orderID || ''}`.toLowerCase()
          if (!blob.includes(s)) return false
        }
        return true
      })
  }, [data, verification, filterSeverity, filterCategory, filterStaff, search])

  function exportCSV() {
    const header = ['Row#', 'Severity', 'Date', 'Order ID', 'Name', 'Phone', 'Doctor', 'Staff', 'Amount', 'Prepay', 'COD', 'Issues']
    const rows = [header]
    filteredRows.forEach(({ row, idx, issues }) => {
      const sev = issues.some((i) => i.severity === 'red') ? 'RED' : issues.some((i) => i.severity === 'orange') ? 'ORANGE' : 'YELLOW'
      rows.push([
        idx + 1,
        sev,
        row.date,
        row.orderID,
        row.name,
        row.phone,
        row.doctor,
        row.supportStaff,
        row.orderAmount,
        row.prepayAmount,
        row.codAmount,
        issues.map((i) => `[${i.severity.toUpperCase()}] ${i.msg}`).join(' | '),
      ])
    })
    downloadCSV(rows, `sheet-verification-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (data.length === 0) {
    return (
      <div className="no-data" style={{ padding: 40, textAlign: 'center' }}>
        Order sheet is not loaded. Settings me jaake sheet load karo pehle.
      </div>
    )
  }

  const scoreColor = verification.score >= 90 ? 'green' : verification.score >= 70 ? 'purple' : 'red'

  return (
    <div>
      {/* Score header */}
      <div className="stats-row">
        <div className={`stat-box ${scoreColor}`}>
          <div className="num">{verification.score}%</div>
          <div className="label">Health Score</div>
        </div>
        <div className="stat-box purple"><div className="num">{data.length}</div><div className="label">Total Rows</div></div>
        <div className="stat-box green"><div className="num">{verification.clean}</div><div className="label">Clean</div></div>
        <div className="stat-box red"><div className="num">{verification.red}</div><div className="label">Critical</div></div>
        <div className="stat-box red"><div className="num">{verification.orange}</div><div className="label">Warnings</div></div>
        <div className="stat-box purple"><div className="num">{verification.yellow}</div><div className="label">Info</div></div>
      </div>

      {/* Health bar */}
      <div style={{ marginBottom: 20, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
          <span>Sheet Health</span>
          <span>{verification.clean}/{data.length} clean rows</span>
        </div>
        <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {verification.clean > 0 && (
            <div style={{ width: `${(verification.clean / data.length) * 100}%`, background: '#16a34a' }} title={`Clean: ${verification.clean}`} />
          )}
          {verification.yellow > 0 && (
            <div style={{ width: `${(verification.yellow / data.length) * 100}%`, background: '#eab308' }} title={`Yellow: ${verification.yellow}`} />
          )}
          {verification.orange > 0 && (
            <div style={{ width: `${(verification.orange / data.length) * 100}%`, background: '#f97316' }} title={`Orange: ${verification.orange}`} />
          )}
          {verification.red > 0 && (
            <div style={{ width: `${(verification.red / data.length) * 100}%`, background: '#dc2626' }} title={`Red: ${verification.red}`} />
          )}
        </div>
      </div>

      {/* Category breakdown - clickable */}
      {verification.byCategory.length > 0 && (
        <div className="match-section" style={{ marginBottom: 20 }}>
          <div className="match-section-title eod-title">Issue Categories (click to filter)</div>
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {verification.byCategory.map(([cat, count]) => (
              <button
                key={cat}
                className={filterCategory === cat ? 'alert-tab active' : 'alert-tab'}
                onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              >
                {cat}: {count} rows
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-staff stats */}
      {verification.byStaff.length > 0 && (
        <div className="match-section" style={{ marginBottom: 20 }}>
          <div className="match-section-title order-title">Errors per Staff (top problem makers)</div>
          <div className="table-container" style={{ maxHeight: 300, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Staff</th>
                  <th>Total</th>
                  <th>Red</th>
                  <th>Orange</th>
                  <th>Yellow</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {verification.byStaff.slice(0, 25).map((s, i) => (
                  <tr key={i} className={s.red > 0 ? 'row-mismatch' : ''}>
                    <td>{i + 1}</td>
                    <td><strong>{s.name}</strong></td>
                    <td><span className="badge badge-mismatch">{s.total}</span></td>
                    <td className={s.red > 0 ? 'cod' : ''}>{s.red}</td>
                    <td>{s.orange}</td>
                    <td>{s.yellow}</td>
                    <td>
                      <button
                        className={filterStaff === s.name ? 'alert-tab active' : 'alert-tab'}
                        onClick={() => setFilterStaff(filterStaff === s.name ? '' : s.name)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        {filterStaff === s.name ? 'Clear' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Search</label>
          <input type="text" placeholder="Name/Phone/Staff/OrderID..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Severity</label>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="">All</option>
            <option value="red">Red (Critical)</option>
            <option value="orange">Orange (Warning)</option>
            <option value="yellow">Yellow (Info)</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All</option>
            {verification.byCategory.map(([cat]) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Staff</label>
          <select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}>
            <option value="">All</option>
            {verification.byStaff.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <button className="clear-btn" onClick={() => { setFilterSeverity(''); setFilterCategory(''); setFilterStaff(''); setSearch('') }}>Clear</button>
        <button className="setup-load-btn" style={{ padding: '10px 20px', width: 'auto' }} onClick={exportCSV}>Export CSV</button>
      </div>

      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
        Showing <strong>{filteredRows.length}</strong> problematic rows
        {filterCategory && <> · category: <strong>{filterCategory}</strong></>}
        {filterStaff && <> · staff: <strong>{filterStaff}</strong></>}
        {filterSeverity && <> · severity: <strong>{filterSeverity}</strong></>}
      </div>

      <div className="table-container">
        {filteredRows.length === 0 ? (
          <div className="no-data">
            {data.length > 0 && verification.clean === data.length
              ? 'Sheet is 100% clean - no issues found'
              : 'No issues match the filters'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Row#</th>
                <th>Date</th>
                <th>Order ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Staff</th>
                <th>Amount</th>
                <th>Prepay</th>
                <th>COD</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ row, idx, issues }) => {
                const hasRed = issues.some((i) => i.severity === 'red')
                const hasOrange = issues.some((i) => i.severity === 'orange')
                const cls = hasRed ? 'row-alert-red' : hasOrange ? 'row-alert-orange' : 'row-alert-yellow'
                return (
                  <tr key={idx} className={cls}>
                    <td>{idx + 1}</td>
                    <td>{row.date}</td>
                    <td>{row.orderID}</td>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.phone || <span className="badge badge-mismatch">N/A</span>}</td>
                    <td>{row.supportStaff || <span className="badge badge-mismatch">N/A</span>}</td>
                    <td className="amount">{row.orderAmount}</td>
                    <td className="amount">{row.prepayAmount}</td>
                    <td className="cod">{row.codAmount}</td>
                    <td>
                      {issues.map((iss, j) => (
                        <span
                          key={j}
                          className={`badge badge-alert-${iss.severity}`}
                          style={{ marginRight: 4, marginBottom: 2, display: 'inline-block' }}
                        >
                          {iss.msg}
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
