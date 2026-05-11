import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import Charts from './Charts'
import AgentPerformance from './AgentPerformance'
import DataAlerts from './DataAlerts'
import StaffMapping from './StaffMapping'
import ShopifyMatch from './ShopifyMatch'
import SheetVerification from './SheetVerification'
import './App.css'

// Convert Google Sheet URL to CSV export URL
function sheetUrlToCsv(url) {
  if (!url) return ''
  const u = url.trim()
  // Already a gviz CSV url
  if (u.includes('gviz/tq')) return u
  // Extract spreadsheet ID and gid
  const idMatch = u.match(/\/d\/([a-zA-Z0-9_-]+)/)
  const gidMatch = u.match(/gid=(\d+)/)
  if (idMatch) {
    const id = idMatch[1]
    const gid = gidMatch ? gidMatch[1] : '0'
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
  }
  return u
}

const STORAGE_KEY = 'sheetautomations_urls'
const STAFF_MAPPING_KEY = 'sheetautomations_staff_mapping_v3'

const DEFAULT_STAFF_NAMES = [
  ['shazan'],
  ['aakash sharma', 'aakash'],
  ['aayan'],
  ['sachin'],
  ['rohit kumar'],
  ['company'],
  ['nayan pal', 'nayan'],
  ['prince kumar', 'prince'],
  ['manish singh'],
  ['daman'],
  ['jaspal', 'jaspal singh', 'jaspal assessment', 'jashpal'],
  ['aman', 'aman ul nawaz'],
  ['pradeep'],
  ['shivan'],
  ['sachin sharma'],
  ['omprakash', 'om prakash'],
  ['shazib', 'shazib ahmed'],
  ['faizan', 'faizan alam'],
  ['rohit 3', 'rohit'],
  ['neeraj', 'neeraj raghuwanshi'],
  ['sanchit'],
  ['anubhav'],
  ['naresh prajapati', 'naresh'],
  ['akash gautam', 'akash'],
  ['deepak raghuwanshi'],
  ['sumit'],
  ['alam', 'alam uddin'],
  ['riyan'],
  ['manish'],
  ['ashutosh', 'ashutosh kumar'],
  ['firdaus'],
  ['ankit'],
  ['jatin', 'jatin sharma'],
  ['yogendra singh', 'yogendra'],
  ['shiva'],
  ['imran', 'imran ansari'],
  ['sagar nair', 'sagar'],
  ['rohit singh'],
  ['mohan raghuwanshi'],
  ['hazrat', 'hazrat selim sarkar'],
  ['mehtab'],
  ['roushan singh', 'roushan'],
  ['tushar gupta', 'tushar'],
  ['rohit choudhary'],
  ['amrit'],
  ['sumit ratan'],
  ['islam assessment', 'islam'],
  ['nikesh'],
  ['haris', 'haris siddiqui'],
  ['mirza owais'],
  ['jitender juneja', 'jitender'],
  ['sanyam vivek', 'sanyam'],
  ['mohd zaid'],
  ['bhanu'],
  ['ajaz shah'],
  ['nilotpal bhattacharjee'],
  ['sumit tanwar', 'sumit tanwa'],
  ['vikash kumar'],
]

function loadSavedUrls() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (e) {}
  return null
}

function saveUrls(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (e) {}
}

function loadStaffGroups() {
  try {
    const saved = localStorage.getItem(STAFF_MAPPING_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {}
  return DEFAULT_STAFF_NAMES
}

function saveStaffGroups(groups) {
  try {
    localStorage.setItem(STAFF_MAPPING_KEY, JSON.stringify(groups))
  } catch (e) {}
}

function parseCSV(text) {
  const rows = []
  let current = ''
  let inQuotes = false
  const lines = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      rows.push(current.trim()); current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current || rows.length > 0) {
        rows.push(current.trim()); lines.push([...rows]); rows.length = 0; current = ''
      }
    } else current += ch
  }
  if (current || rows.length > 0) { rows.push(current.trim()); lines.push([...rows]) }
  return lines
}

const ORDER_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'orderID', label: 'Order ID' },
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'deliveryDate', label: 'Delivery Date' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'orderAmount', label: 'Order Amt' },
  { key: 'prepayAmount', label: 'Prepay Amt' },
  { key: 'codAmount', label: 'COD Amt' },
  { key: 'supportStaff', label: 'Support Staff' },
  { key: 'location', label: 'Location' },
  { key: 'notes', label: 'Notes' },
  { key: 'dynos', label: 'Dynos' },
  { key: 'poseidonMD', label: 'PoseidonMD' },
  { key: 'vitaman', label: 'Vitaman' },
  { key: 'anteros', label: 'Anteros 12.5' },
  { key: 'anicob', label: 'Anicob' },
  { key: 'heraclesMD', label: 'HeraclesMD' },
  { key: 'morpheusMD', label: 'MorpheusMD' },
  { key: 'magmapureD3', label: 'Magmapure-D3' },
  { key: 'aegisMD', label: 'Aegis MD' },
  { key: 'omega3', label: 'Omega-3' },
  { key: 'heliosMD', label: 'HeliosMD' },
  { key: 'chronos25', label: 'Chronos 25' },
  { key: 'sourceID', label: 'Source ID' },
  { key: 'planType', label: 'Plan Type' },
  { key: 'orderType', label: 'Order Type' },
  { key: 'deliveryNotes', label: 'Delivery Notes' },
]

function orderRowToObj(row) {
  const obj = {}
  ORDER_COLUMNS.forEach((col, i) => { obj[col.key] = row[i] || '' })
  return obj
}

function eodRowToObj(row, sheetName, sheetType) {
  if (sheetType === 'eod1') {
    // EOD 1: Date, Agent Name, Total Plans, Deal/Invoice Link, Link Number, Submitted At
    return {
      reportDate: row[0] || '',
      agentName: row[1] || '',
      dealNumber: row[2] || '',
      dealLink: row[3] || '',
      submittedAt: row[4] || '',
      timestamp: row[5] || '',
      source: sheetName,
    }
  }
  if (sheetType === 'eod2') {
    // EOD 2: Report Date, Agent Name, Deal Number, Deal/Invoice Link, Submitted At (timestamp)
    return {
      reportDate: row[0] || '',
      agentName: row[1] || '',
      dealNumber: row[2] || '',
      dealLink: row[3] || '',
      submittedAt: '',
      timestamp: row[4] || '',
      source: sheetName,
    }
  }
  // EOD 3: Report Date, Agent Name, Total Payments, Deal Link, Link Number, Timestamp, Checked
  return {
    reportDate: row[0] || '',
    agentName: row[1] || '',
    dealNumber: row[2] || '',
    dealLink: row[3] || '',
    submittedAt: row[4] || '',
    timestamp: row[5] || '',
    source: sheetName,
  }
}

function getUniqueValues(data, key) {
  const seen = new Map()
  data.forEach((d) => {
    const val = d[key]?.trim()
    if (val) {
      const lower = val.toLowerCase()
      if (!seen.has(lower)) seen.set(lower, val)
    }
  })
  return [...seen.values()].sort()
}

// Normalize date to yyyy-mm-dd string for comparison
function normalizeDate(dateStr) {
  if (!dateStr) return ''
  const d = dateStr.trim()
  // yyyy-mm-dd already (EOD sheets)
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  // dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy, d-m-yyyy (Order sheet)
  const slash = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (slash) {
    let day = slash[1].padStart(2, '0')
    let month = slash[2].padStart(2, '0')
    let year = parseInt(slash[3])
    if (year < 100) year += 2000 // 26 -> 2026
    if (year < 2000) year = 2026 // fix typos like 1026
    return `${year}-${month}-${day}`
  }
  // "1 Mar", "5 March" etc
  const text = d.match(/^(\d{1,2})\s+(\w+)/)
  if (text) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const m = months[text[2].toLowerCase().slice(0, 3)]
    if (m) return `2026-${m}-${text[1].padStart(2, '0')}`
  }
  return ''
}

function parseSheetDate(dateStr) {
  const n = normalizeDate(dateStr)
  if (!n) return null
  // Parse manually to avoid timezone issues
  const [y, m, d] = n.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const ORDER_CHECK_KEY = 'matchtable_order_checks_v1'

function getOrderKey(o) {
  const id = (o.orderID || '').trim()
  if (id) return `id:${id}`
  return `pk:${(o.phone || '').trim()}|${(o.date || '').trim()}|${(o.orderAmount || '').trim()}|${(o.name || '').trim().toLowerCase()}`
}

function MatchTable({ data }) {
  const [expandedRow, setExpandedRow] = useState(null)
  const [subTab, setSubTab] = useState('both')
  const [checkedOrders, setCheckedOrders] = useState(() => {
    try {
      const saved = localStorage.getItem(ORDER_CHECK_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  function toggleCheck(o) {
    const key = getOrderKey(o)
    setCheckedOrders((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = true
      try { localStorage.setItem(ORDER_CHECK_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (data.length === 0) return <div className="no-data">No data found</div>

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <th>Date</th>
            <th>Agent</th>
            <th>EOD Links</th>
            <th>Orders</th>
            <th>Status</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <Fragment key={i}>
              <tr className={row.match ? 'row-match' : 'row-mismatch'} style={{ cursor: 'pointer' }}
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                <td>
                  <span className="expand-arrow">{expandedRow === i ? '\u25BC' : '\u25B6'}</span>
                </td>
                <td>{i + 1}</td>
                <td>{row.date}</td>
                <td><strong>{row.agent}</strong></td>
                <td><span className="badge badge-plan">{row.eodCount} links</span></td>
                <td><span className={row.orderCount > 0 ? 'badge badge-match' : 'badge badge-mismatch'}>{row.orderCount} orders</span></td>
                <td>
                  <span className={row.match ? 'badge badge-match' : 'badge badge-mismatch'}>
                    {row.match ? 'Match' : 'Mismatch'}
                  </span>
                </td>
                <td className={row.diff > 0 ? 'cod' : row.diff < 0 ? 'amount' : ''}>
                  {row.diff > 0 ? `+${row.diff} (EOD extra)` : row.diff < 0 ? `${row.diff} (Orders extra)` : '0'}
                </td>
              </tr>
              {expandedRow === i && (
                <tr className="links-row">
                  <td colSpan={8}>
                    <div className="links-dropdown">
                      <div className="match-tabs">
                        <button className={subTab === 'both' ? 'alert-tab active' : 'alert-tab'} onClick={(e) => { e.stopPropagation(); setSubTab('both') }}>
                          Both
                        </button>
                        <button className={subTab === 'eod' ? 'alert-tab active' : 'alert-tab'} onClick={(e) => { e.stopPropagation(); setSubTab('eod') }}>
                          EOD Links ({row.links?.length || 0})
                        </button>
                        <button className={subTab === 'orders' ? 'alert-tab active' : 'alert-tab'} onClick={(e) => { e.stopPropagation(); setSubTab('orders') }}>
                          Orders ({row.orders?.length || 0})
                        </button>
                      </div>

                      {/* EOD Links */}
                      {(subTab === 'both' || subTab === 'eod') && (
                        <div className="match-section">
                          <div className="match-section-title eod-title">
                            EOD Links - {row.agent} ({row.date}) - <strong>{row.links?.length || 0} links</strong>
                          </div>
                          <div className="links-list">
                            {(row.links || []).map((item, j) => {
                              const linkStr = typeof item === 'string' ? item : item.link
                              const source = typeof item === 'string' ? '' : item.source
                              const url = (linkStr || '').split(/\s+/)[0].trim()
                              const module = url.match(/tab\/(\w+)/)
                              const isDupe = row.links.some((other, k) => {
                                if (k === j) return false
                                const otherUrl = (typeof other === 'string' ? other : other.link || '').split(/\s+/)[0].trim().toLowerCase()
                                return otherUrl === url.toLowerCase()
                              })
                              return (
                                <div key={j} className={`link-item ${isDupe ? 'link-dupe' : ''}`}>
                                  <span className="link-num">{j + 1}</span>
                                  {module && <span className="badge badge-plan">{module[1]}</span>}
                                  {source && <span className="badge badge-order-type">{source}</span>}
                                  {isDupe && <span className="badge badge-mismatch">Duplicate</span>}
                                  <a href={url} target="_blank" rel="noreferrer" className="link-btn">
                                    {url.length > 60 ? url.slice(0, 60) + '...' : url}
                                  </a>
                                </div>
                              )
                            })}
                            {(!row.links || row.links.length === 0) && <div className="no-data" style={{ padding: 12 }}>No EOD links found</div>}
                          </div>
                        </div>
                      )}

                      {/* Orders */}
                      {(subTab === 'both' || subTab === 'orders') && (
                        <div className="match-section">
                          <div className="match-section-title order-title">
                            Orders - {row.agent} ({row.date}) - <strong>{row.orders?.length || 0} orders</strong>
                          </div>
                          {(row.orders || []).length > 0 ? (
                            <table className="inner-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 36 }}>✓</th>
                                  <th>#</th>
                                  <th>Name</th>
                                  <th>Phone</th>
                                  <th>Support Staff</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.orders.map((o, j) => {
                                  const checked = !!checkedOrders[getOrderKey(o)]
                                  return (
                                    <tr key={j}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleCheck(o)}
                                          style={{ cursor: 'pointer', width: 18, height: 18 }}
                                        />
                                      </td>
                                      <td>{j + 1}</td>
                                      <td><strong>{o.name}</strong></td>
                                      <td>{o.phone || <span className="badge badge-mismatch">N/A</span>}</td>
                                      <td>{o.supportStaff}</td>
                                      <td className="amount">{o.orderAmount}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          ) : <div className="no-data" style={{ padding: 12 }}>No orders found</div>}
                        </div>
                      )}

                      {/* Summary */}
                      {!row.match && (
                        <div className="match-summary">
                          {row.diff > 0
                            ? `EOD has ${row.diff} extra links - ${row.diff} orders are missing from Order sheet`
                            : `Order sheet has ${Math.abs(row.diff)} extra orders - EOD is missing ${Math.abs(row.diff)} links`
                          }
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinkSearch({ eodData, allDuplicates }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)

  function handleSearch() {
    if (!query.trim()) return
    const q = query.trim().toLowerCase()
    // Extract ID from full URL or use as-is
    const idMatch = q.match(/\/(\d{10,})/)
    const searchId = idMatch ? idMatch[1] : q

    // Find in all EOD data
    const found = eodData.filter((row) => {
      const link = (row.dealLink || '').toLowerCase()
      return link.includes(searchId)
    })

    // Check if duplicate
    const isDuplicate = allDuplicates.some((d) => {
      const link = (d.link || '').toLowerCase()
      return link.includes(searchId)
    })

    // Group by sheet
    const bySheet = new Map()
    found.forEach((row) => {
      const src = row.source || 'Unknown'
      if (!bySheet.has(src)) bySheet.set(src, [])
      bySheet.get(src).push(row)
    })

    setResults({ found, isDuplicate, bySheet: [...bySheet.entries()], searchId })
  }

  return (
    <div>
      <div className="search-box">
        <div className="search-input-row">
          <input
            type="text"
            className="search-input"
            placeholder="Paste Zoho link or ID (e.g. 570692000163397174)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="search-btn" onClick={handleSearch}>Search</button>
        </div>
      </div>

      {results && (
        <div className="search-results">
          {/* Stats */}
          <div className="stats-row">
            <div className={results.found.length > 0 ? 'stat-box green' : 'stat-box red'}>
              <div className="num">{results.found.length}</div>
              <div className="label">Found In EOD</div>
            </div>
            <div className={results.isDuplicate ? 'stat-box red' : 'stat-box green'}>
              <div className="num">{results.isDuplicate ? 'Yes' : 'No'}</div>
              <div className="label">Duplicate</div>
            </div>
            <div className="stat-box purple">
              <div className="num">{results.bySheet.length}</div>
              <div className="label">Sheets Found In</div>
            </div>
          </div>

          {results.found.length === 0 ? (
            <div className="no-data">Link not found in any EOD sheet</div>
          ) : (
            <>
              {/* Sheet wise results */}
              {results.bySheet.map(([sheetName, rows]) => (
                <div key={sheetName} className="search-sheet-section">
                  <div className="match-section-title eod-title">
                    {sheetName} - {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Date</th>
                          <th>Agent</th>
                          <th>Deal #</th>
                          <th>Link</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={results.isDuplicate ? 'row-mismatch' : ''}>
                            <td>{i + 1}</td>
                            <td>{row.reportDate}</td>
                            <td><strong>{row.agentName}</strong></td>
                            <td>{row.dealNumber}</td>
                            <td>
                              {row.dealLink ? (
                                <a href={row.dealLink.split(/\s+/)[0]} target="_blank" rel="noreferrer" className="link-btn">Open</a>
                              ) : ''}
                            </td>
                            <td>{row.timestamp ? new Date(row.timestamp).toLocaleString('en-IN') : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Duplicate warning */}
              {results.isDuplicate && (
                <div className="match-summary">
                  This link is a duplicate - found in multiple submissions
                </div>
              )}

              {results.bySheet.length > 1 && (
                <div className="match-summary">
                  Cross-sheet duplicate - this link exists in {results.bySheet.length} different EOD sheets: {results.bySheet.map(([s]) => s).join(', ')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MultiSelect({ label, options, selected, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="filter-group multi-select" ref={ref}>
      <label>{label}</label>
      <div className="multi-select-box" onClick={() => setOpen(!open)}>
        {selected.length === 0 ? `All ${label}` : `${selected.length} selected`}
        <span className="arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </div>
      {open && (
        <div className="multi-dropdown">
          {options.map((opt) => (
            <label key={opt} className="multi-option">
              <input
                type="checkbox"
                checked={selected.some((s) => s.toLowerCase() === opt.toLowerCase())}
                onChange={() => onToggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const savedConfig = loadSavedUrls()
  const [showSetup, setShowSetup] = useState(!savedConfig)
  const [tab, setTab] = useState('orders')
  const [orderData, setOrderData] = useState([])
  const [eodData, setEodData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Setup form
  const [orderUrl, setOrderUrl] = useState(savedConfig?.orderUrl || '')
  const [eodUrls, setEodUrls] = useState(savedConfig?.eodUrls || [{ url: '', name: 'EOD 1', type: 'eod1' }])
  const [orderCsvFile, setOrderCsvFile] = useState(null)
  const [eodCsvFiles, setEodCsvFiles] = useState([])

  // Order filters
  const [orderFilters, setOrderFilters] = useState({
    search: '', doctor: [], supportStaff: [], location: [], orderType: [], planType: [],
    dateFrom: '', dateTo: '', singleDate: '',
  })

  // EOD filters
  const [eodFilters, setEodFilters] = useState({
    search: '', agent: [], dateFrom: '', dateTo: '', singleDate: '',
  })

  // Staff name groups (editable via Staff Mapping tab)
  const [staffGroups, setStaffGroups] = useState(loadStaffGroups())

  useEffect(() => { saveStaffGroups(staffGroups) }, [staffGroups])

  function addEodSheet() {
    const num = eodUrls.length + 1
    setEodUrls([...eodUrls, { url: '', name: `EOD ${num}`, type: `eod${num}` }])
  }

  function removeEodSheet(idx) {
    setEodUrls(eodUrls.filter((_, i) => i !== idx))
  }

  function updateEodUrl(idx, field, value) {
    const updated = [...eodUrls]
    updated[idx] = { ...updated[idx], [field]: value }
    setEodUrls(updated)
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = () => reject(new Error('File read failed'))
      reader.readAsText(file)
    })
  }

  function fetchData(orderCsvUrl, eodSheets, orderFile, eodFiles) {
    setLoading(true)
    setError(null)

    const fetchCsv = (url, label) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${label} load failed (HTTP ${r.status}). Check if sheet is public/shared correctly.`)
      return r.text()
    })

    // Order: file first, then URL
    const orderPromise = orderFile
      ? readFile(orderFile)
      : orderCsvUrl ? fetchCsv(sheetUrlToCsv(orderCsvUrl), 'Order sheet') : Promise.resolve('')

    // EOD: files first, then URLs
    const eodPromises = []
    // Add file-based EODs
    if (eodFiles && eodFiles.length > 0) {
      eodFiles.forEach((ef) => {
        eodPromises.push(readFile(ef.file).then((text) => ({ text, name: ef.name, type: ef.type })))
      })
    }
    // Add URL-based EODs
    eodSheets.filter((s) => s.url.trim()).forEach((sheet) => {
      eodPromises.push(
        fetchCsv(sheetUrlToCsv(sheet.url), sheet.name || 'EOD sheet').then((text) => ({ text, name: sheet.name, type: sheet.type }))
      )
    })

    Promise.all([orderPromise, ...eodPromises])
      .then(([orderText, ...eodResults]) => {
        if (orderText) {
          const orderLines = parseCSV(orderText)
          if (orderLines.length > 1) {
            setOrderData(orderLines.slice(1).map(orderRowToObj).filter((r) => r.name))
          }
        }
        const allEod = []
        eodResults.forEach(({ text, name, type }) => {
          const lines = parseCSV(text)
          if (lines.length > 1) {
            lines.slice(1).forEach((row) => {
              const obj = eodRowToObj(row, name, type)
              if (obj.agentName) allEod.push(obj)
            })
          }
        })
        setEodData(allEod)
        setLoading(false)
        setShowSetup(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
  }

  function handleLoadData() {
    const config = { orderUrl, eodUrls }
    saveUrls(config)
    fetchData(orderUrl, eodUrls, orderCsvFile, eodCsvFiles)
  }

  function handleOrderFileChange(e) {
    const file = e.target.files[0]
    if (file) setOrderCsvFile(file)
  }

  function handleEodFileChange(e, name, type) {
    const file = e.target.files[0]
    if (file) {
      setEodCsvFiles((prev) => {
        const filtered = prev.filter((f) => f.name !== name)
        return [...filtered, { file, name, type }]
      })
    }
  }

  // Auto-load on first mount if saved config exists
  useEffect(() => {
    if (savedConfig) {
      fetchData(savedConfig.orderUrl, savedConfig.eodUrls)
    }
  }, [])

  // --- Order filter logic ---
  const orderFilterOptions = useMemo(() => ({
    doctors: getUniqueValues(orderData, 'doctor'),
    staff: getUniqueValues(orderData, 'supportStaff'),
    locations: getUniqueValues(orderData, 'location'),
    orderTypes: getUniqueValues(orderData, 'orderType'),
    planTypes: getUniqueValues(orderData, 'planType'),
  }), [orderData])

  const filteredOrders = useMemo(() => {
    return orderData.filter((row) => {
      if (orderFilters.search) {
        const s = orderFilters.search.toLowerCase()
        if (!(row.name.toLowerCase().includes(s) || row.phone.includes(s) || row.location.toLowerCase().includes(s))) return false
      }
      if (orderFilters.singleDate) {
        const rd = parseSheetDate(row.date), pick = new Date(orderFilters.singleDate + 'T00:00:00')
        if (!rd || rd.toDateString() !== pick.toDateString()) return false
      }
      if (orderFilters.dateFrom) {
        const rd = parseSheetDate(row.date), from = new Date(orderFilters.dateFrom + 'T00:00:00')
        if (!rd || rd < from) return false
      }
      if (orderFilters.dateTo) {
        const rd = parseSheetDate(row.date), to = new Date(orderFilters.dateTo + 'T00:00:00')
        if (!rd || rd > to) return false
      }
      if (orderFilters.doctor.length > 0 && !orderFilters.doctor.some((f) => f.toLowerCase() === row.doctor.trim().toLowerCase())) return false
      if (orderFilters.supportStaff.length > 0 && !orderFilters.supportStaff.some((f) => f.toLowerCase() === row.supportStaff.trim().toLowerCase())) return false
      if (orderFilters.location.length > 0 && !orderFilters.location.some((f) => f.toLowerCase() === row.location.trim().toLowerCase())) return false
      if (orderFilters.orderType.length > 0 && !orderFilters.orderType.some((f) => f.toLowerCase() === row.orderType.trim().toLowerCase())) return false
      if (orderFilters.planType.length > 0 && !orderFilters.planType.some((f) => f.toLowerCase() === row.planType.trim().toLowerCase())) return false
      return true
    })
  }, [orderData, orderFilters])

  const totalAmount = useMemo(() => filteredOrders.reduce((s, r) => s + (parseFloat(r.orderAmount) || 0), 0), [filteredOrders])
  const totalPrepay = useMemo(() => filteredOrders.reduce((s, r) => s + (parseFloat(r.prepayAmount) || 0), 0), [filteredOrders])
  const totalCOD = useMemo(() => filteredOrders.reduce((s, r) => s + (parseFloat(r.codAmount) || 0), 0), [filteredOrders])

  // Smart alerts for each order row
  const VALID_AMOUNTS = [1199, 1399, 1489, 1499, 1649, 2499, 2500, 2800, 2900, 3500, 3999, 4800, 6000]
  const orderAlerts = useMemo(() => {
    const phoneIndex = new Map() // phone+date+amount+staff -> count
    const alerts = new Map() // row index -> [{type, msg}]

    orderData.forEach((row, idx) => {
      const issues = []
      const phone = row.phone?.trim()
      const amount = parseFloat(row.orderAmount) || 0
      const prepay = parseFloat(row.prepayAmount) || 0
      const cod = parseFloat(row.codAmount) || 0

      // Phone blank
      if (!phone) issues.push({ type: 'red', msg: 'Phone missing' })
      // Phone not 10 digits
      else if (!/^\d{10}$/.test(phone)) issues.push({ type: 'orange', msg: 'Phone not 10 digits' })

      // Doctor blank
      if (!row.doctor?.trim()) issues.push({ type: 'orange', msg: 'Doctor missing' })

      // Staff blank
      if (!row.supportStaff?.trim()) issues.push({ type: 'orange', msg: 'Staff missing' })

      // COD negative
      if (cod < 0) issues.push({ type: 'red', msg: 'COD is negative' })

      // COD mismatch (amount - prepay != cod)
      if (amount > 0 && prepay >= 0 && cod >= 0) {
        const expectedCod = amount - prepay
        if (Math.abs(expectedCod - cod) > 1) issues.push({ type: 'orange', msg: `COD should be ${expectedCod}, got ${cod}` })
      }

      // Unusual amount
      if (amount > 0 && !VALID_AMOUNTS.includes(amount)) issues.push({ type: 'yellow', msg: 'Unusual amount' })

      // Duplicate: same phone + same date + same amount + same staff
      if (phone) {
        const key = `${phone}|${normalizeDate(row.date)}|${amount}|${(row.supportStaff || '').trim().toLowerCase()}`
        phoneIndex.set(key, (phoneIndex.get(key) || 0) + 1)
      }

      if (issues.length > 0) alerts.set(idx, issues)
    })

    // Second pass: mark duplicates
    orderData.forEach((row, idx) => {
      const phone = row.phone?.trim()
      if (!phone) return
      const amount = parseFloat(row.orderAmount) || 0
      const key = `${phone}|${normalizeDate(row.date)}|${amount}|${(row.supportStaff || '').trim().toLowerCase()}`
      if (phoneIndex.get(key) > 1) {
        const existing = alerts.get(idx) || []
        existing.push({ type: 'red', msg: 'Duplicate entry (same phone+date+amount+staff)' })
        alerts.set(idx, existing)
      }

      // Same phone different staff same day
      const dayKey = `${phone}|${normalizeDate(row.date)}`
      const staffForDay = new Set()
      orderData.forEach((r) => {
        if (r.phone?.trim() === phone && normalizeDate(r.date) === normalizeDate(row.date)) {
          staffForDay.add((r.supportStaff || '').trim().toLowerCase())
        }
      })
      if (staffForDay.size > 1) {
        const existing = alerts.get(idx) || []
        if (!existing.some((e) => e.msg.includes('Different staff'))) {
          existing.push({ type: 'yellow', msg: 'Same phone, different staff same day' })
          alerts.set(idx, existing)
        }
      }
    })

    return alerts
  }, [orderData])

  // --- EOD filter logic ---
  const eodFilterOptions = useMemo(() => ({
    agents: getUniqueValues(eodData, 'agentName'),
  }), [eodData])

  const filteredEod = useMemo(() => {
    return eodData.filter((row) => {
      if (eodFilters.search) {
        const s = eodFilters.search.toLowerCase()
        if (!row.agentName.toLowerCase().includes(s)) return false
      }
      if (eodFilters.singleDate) {
        const nd = normalizeDate(row.reportDate)
        if (nd !== eodFilters.singleDate) return false
      }
      if (eodFilters.dateFrom) {
        const rd = parseSheetDate(row.reportDate), from = new Date(eodFilters.dateFrom + 'T00:00:00')
        if (!rd || rd < from) return false
      }
      if (eodFilters.dateTo) {
        const rd = parseSheetDate(row.reportDate), to = new Date(eodFilters.dateTo + 'T00:00:00')
        if (!rd || rd > to) return false
      }
      if (eodFilters.agent.length > 0 && !eodFilters.agent.some((f) => f.toLowerCase() === row.agentName.trim().toLowerCase())) return false
      return true
    })
  }, [eodData, eodFilters])

  // --- Duplicates Detection ---
  const { sameSheetDupes, crossSheetDupes, dedupedEod } = useMemo(() => {
    // Step 1: Find same-sheet duplicates (same link in same sheet)
    const sheetMap = new Map() // key: link|sheet -> first row
    const sameDupes = []
    const afterSameDedup = []

    eodData.forEach((row) => {
      const linkBase = (row.dealLink || '').split(/\s+/)[0].trim().toLowerCase()
      if (!linkBase) { afterSameDedup.push(row); return }
      const key = `${linkBase}|${row.source}`

      if (sheetMap.has(key)) {
        const first = sheetMap.get(key)
        sameDupes.push({
          agent: row.agentName.trim(),
          date: row.reportDate,
          link: row.dealLink,
          source: row.source,
          timestamp: row.timestamp,
          firstAgent: first.agent,
          firstDate: first.date,
          firstSource: first.source,
          type: 'Same Sheet',
        })
      } else {
        sheetMap.set(key, { agent: row.agentName.trim(), date: row.reportDate, source: row.source })
        afterSameDedup.push(row)
      }
    })

    // Step 2: Find cross-sheet duplicates (same link in different sheets)
    // Group all links by their URL across all sheets
    const linkSheetMap = new Map() // key: link -> [{agent, date, source, row}]
    afterSameDedup.forEach((row) => {
      const linkBase = (row.dealLink || '').split(/\s+/)[0].trim().toLowerCase()
      if (!linkBase) return
      if (!linkSheetMap.has(linkBase)) linkSheetMap.set(linkBase, [])
      linkSheetMap.get(linkBase).push({
        agent: row.agentName.trim(),
        date: row.reportDate,
        source: row.source,
        timestamp: row.timestamp,
        link: row.dealLink,
        row,
      })
    })

    const crossDupes = []
    const clean = []
    const crossDupeLinks = new Set()

    linkSheetMap.forEach((entries, linkBase) => {
      // Get unique sheets this link appears in
      const sheets = [...new Set(entries.map((e) => e.source))]
      if (sheets.length > 1) {
        // Link found in 2 or 3 sheets - mark all as cross-sheet duplicates
        const first = entries[0]
        entries.forEach((entry, idx) => {
          if (idx === 0) {
            // First occurrence goes to clean but also noted
            clean.push(entry.row)
            return
          }
          crossDupes.push({
            agent: entry.agent,
            date: entry.date,
            link: entry.link,
            source: entry.source,
            timestamp: entry.timestamp,
            firstAgent: first.agent,
            firstDate: first.date,
            firstSource: first.source,
            foundInSheets: sheets.join(', '),
            type: 'Cross Sheet',
          })
        })
        crossDupeLinks.add(linkBase)
      } else {
        // Only in 1 sheet - clean
        entries.forEach((e) => clean.push(e.row))
      }
    })

    // Also add rows with no link to clean
    afterSameDedup.forEach((row) => {
      const linkBase = (row.dealLink || '').split(/\s+/)[0].trim().toLowerCase()
      if (!linkBase) clean.push(row)
    })

    return { sameSheetDupes: sameDupes, crossSheetDupes: crossDupes, dedupedEod: clean }
  }, [eodData])

  const allDuplicates = useMemo(() => [...sameSheetDupes, ...crossSheetDupes], [sameSheetDupes, crossSheetDupes])

  // Duplicate agent stats
  const dupeAgentStats = useMemo(() => {
    const map = new Map()
    allDuplicates.forEach((d) => {
      const name = d.agent.toLowerCase()
      if (!map.has(name)) map.set(name, { name: d.agent, sameSheet: 0, crossSheet: 0 })
      const e = map.get(name)
      if (d.type === 'Same Sheet') e.sameSheet++
      else e.crossSheet++
    })
    return [...map.values()].sort((a, b) => (b.sameSheet + b.crossSheet) - (a.sameSheet + a.crossSheet))
  }, [allDuplicates])

  const filteredDuplicates = useMemo(() => {
    return allDuplicates.filter((row) => {
      if (eodFilters.search && !row.agent.toLowerCase().includes(eodFilters.search.toLowerCase())) return false
      if (eodFilters.singleDate && normalizeDate(row.date) !== eodFilters.singleDate) return false
      if (eodFilters.dateFrom) {
        const rd = parseSheetDate(row.date), from = new Date(eodFilters.dateFrom + 'T00:00:00')
        if (!rd || rd < from) return false
      }
      if (eodFilters.dateTo) {
        const rd = parseSheetDate(row.date), to = new Date(eodFilters.dateTo + 'T00:00:00')
        if (!rd || rd > to) return false
      }
      if (eodFilters.agent.length > 0 && !eodFilters.agent.some((f) => f.toLowerCase() === row.agent.trim().toLowerCase())) return false
      return true
    })
  }, [allDuplicates, eodFilters])

  // --- Matching: EOD vs Orders ---
  const matchData = useMemo(() => {
    // Group EOD by agent+date: count = actual links submitted (works for all EOD types,
    // including EOD 2 where the third column is a deal ID, not a count)
    const eodMap = new Map()
    eodData.forEach((row) => {
      const key = `${row.agentName.trim().toLowerCase()}|${normalizeDate(row.reportDate)}`
      if (!eodMap.has(key)) {
        eodMap.set(key, { agent: row.agentName.trim(), date: row.reportDate, links: [] })
      }
      const entry = eodMap.get(key)
      if (row.dealLink) entry.links.push({ link: row.dealLink, source: row.source })
    })

    // Group Orders by supportStaff+date (with details)
    const orderDetailMap = new Map()
    orderData.forEach((row) => {
      const staff = row.supportStaff.trim().toLowerCase()
      const date = normalizeDate(row.date)
      if (!staff || !date) return
      const key = `${staff}|${date}`
      if (!orderDetailMap.has(key)) orderDetailMap.set(key, [])
      orderDetailMap.get(key).push(row)
    })

    // Build lookup: name -> group id (from user-editable state)
    const nameGroupMap = new Map()
    staffGroups.forEach((group, idx) => {
      group.forEach((name) => nameGroupMap.set(name.trim().toLowerCase(), idx))
    })

    function getGroupId(name) {
      const n = name.trim().toLowerCase()
      if (nameGroupMap.has(n)) return nameGroupMap.get(n)
      // Try first name only
      const first = n.split(/\s+/)[0]
      if (nameGroupMap.has(first)) return nameGroupMap.get(first)
      return -1
    }

    function namesMatch(agent, staff) {
      const a = agent.trim().toLowerCase()
      const s = staff.trim().toLowerCase()
      if (a === s) return true
      const groupA = getGroupId(a)
      const groupB = getGroupId(s)
      if (groupA >= 0 && groupA === groupB) return true
      return false
    }

    function findOrders(agentName, date) {
      const agentLower = agentName.trim().toLowerCase()
      const matched = []
      orderDetailMap.forEach((rows, key) => {
        const [staff, d] = key.split('|')
        if (d !== date) return
        if (namesMatch(agentLower, staff)) {
          matched.push(...rows)
        }
      })
      return matched
    }

    // Build match rows
    const results = []
    eodMap.forEach((val) => {
      const date = normalizeDate(val.date)
      const orders = findOrders(val.agent, date)
      const eodCount = val.links.length
      const match = eodCount === orders.length
      results.push({
        agent: val.agent,
        date: val.date,
        eodCount,
        orderCount: orders.length,
        match,
        diff: eodCount - orders.length,
        links: val.links,
        orders,
      })
    })
    return results.sort((a, b) => a.date.localeCompare(b.date) || a.agent.localeCompare(b.agent))
  }, [eodData, orderData, staffGroups])

  const filteredMatch = useMemo(() => {
    return matchData.filter((row) => {
      if (eodFilters.search) {
        if (!row.agent.toLowerCase().includes(eodFilters.search.toLowerCase())) return false
      }
      if (eodFilters.singleDate) {
        if (normalizeDate(row.date) !== eodFilters.singleDate) return false
      }
      if (eodFilters.dateFrom) {
        const rd = parseSheetDate(row.date), from = new Date(eodFilters.dateFrom + 'T00:00:00')
        if (!rd || rd < from) return false
      }
      if (eodFilters.dateTo) {
        const rd = parseSheetDate(row.date), to = new Date(eodFilters.dateTo + 'T00:00:00')
        if (!rd || rd > to) return false
      }
      if (eodFilters.agent.length > 0 && !eodFilters.agent.some((f) => f.toLowerCase() === row.agent.trim().toLowerCase())) return false
      return true
    })
  }, [matchData, eodFilters])

  // --- Handlers ---
  const toggleOrderFilter = (key, value) => {
    setOrderFilters((prev) => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })
  }

  const clearOrderFilters = () => {
    setOrderFilters({ search: '', doctor: [], supportStaff: [], location: [], orderType: [], planType: [], dateFrom: '', dateTo: '', singleDate: '' })
  }

  const toggleEodFilter = (key, value) => {
    setEodFilters((prev) => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })
  }

  const clearEodFilters = () => {
    setEodFilters({ search: '', agent: [], dateFrom: '', dateTo: '', singleDate: '' })
  }

  // Setup Screen
  if (showSetup || (!orderData.length && !eodData.length && !loading)) {
    return (
      <div className="app">
        <div className="setup-container">
          <div className="setup-header">
            <h1>Sheet Dashboard Setup</h1>
            <p>Paste your Google Sheet links and click Load Data</p>
          </div>

          <div className="setup-section">
            <h3>Order Sheet</h3>
            <div className="setup-or-row">
              <div className="setup-option">
                <label className="setup-label">URL</label>
                <input
                  type="text"
                  className="setup-input"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
                  value={orderUrl}
                  onChange={(e) => setOrderUrl(e.target.value)}
                />
              </div>
              <span className="setup-or">OR</span>
              <div className="setup-option">
                <label className="setup-label">Upload CSV</label>
                <input type="file" accept=".csv" className="setup-file" onChange={handleOrderFileChange} />
                {orderCsvFile && <span className="file-name">{orderCsvFile.name}</span>}
              </div>
            </div>
          </div>

          <div className="setup-section">
            <div className="setup-section-header">
              <h3>EOD Sheet URLs</h3>
              <button className="setup-add-btn" onClick={addEodSheet}>+ Add EOD Sheet</button>
            </div>
            {eodUrls.map((eod, idx) => (
              <div key={idx} className="setup-eod-card">
                <div className="setup-eod-top">
                  <input
                    type="text"
                    className="setup-input-name"
                    placeholder="Name"
                    value={eod.name}
                    onChange={(e) => updateEodUrl(idx, 'name', e.target.value)}
                  />
                  <select className="setup-type" value={eod.type} onChange={(e) => updateEodUrl(idx, 'type', e.target.value)}>
                    <option value="eod1">Type 1 (Date, Agent, Plans, Link, LinkNo, Timestamp)</option>
                    <option value="eod2">Type 2 (Date, Agent, DealNo, Link, Timestamp)</option>
                    <option value="eod3">Type 3 (Date, Agent, Payments, Link, LinkNo, Timestamp, Checked)</option>
                  </select>
                  {eodUrls.length > 1 && (
                    <button className="setup-remove-btn" onClick={() => removeEodSheet(idx)}>X</button>
                  )}
                </div>
                <div className="setup-or-row">
                  <div className="setup-option">
                    <label className="setup-label">URL</label>
                    <input
                      type="text"
                      className="setup-input"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
                      value={eod.url}
                      onChange={(e) => updateEodUrl(idx, 'url', e.target.value)}
                    />
                  </div>
                  <span className="setup-or">OR</span>
                  <div className="setup-option">
                    <label className="setup-label">Upload CSV</label>
                    <input type="file" accept=".csv" className="setup-file" onChange={(e) => handleEodFileChange(e, eod.name, eod.type)} />
                    {eodCsvFiles.find((f) => f.name === eod.name) && <span className="file-name">{eodCsvFiles.find((f) => f.name === eod.name).file.name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

          <button className="setup-load-btn" onClick={handleLoadData} disabled={loading}>
            {loading ? 'Loading...' : 'Load Data'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading"><div className="spinner"></div>Loading sheets...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Sheet Dashboard</h1>
        <div className="tabs">
          <button className={tab === 'orders' ? 'tab active' : 'tab'} onClick={() => setTab('orders')}>Orders</button>
          <button className={tab === 'eod' ? 'tab active' : 'tab'} onClick={() => setTab('eod')}>EOD Report</button>
          <button className={tab === 'match' ? 'tab active' : 'tab'} onClick={() => setTab('match')}>EOD vs Orders</button>
          <button className={tab === 'duplicates' ? 'tab active' : 'tab'} onClick={() => setTab('duplicates')}>
            Duplicates {allDuplicates.length > 0 && <span className="tab-badge">{allDuplicates.length}</span>}
          </button>
          <button className={tab === 'charts' ? 'tab active' : 'tab'} onClick={() => setTab('charts')}>Analytics</button>
          <button className={tab === 'agents' ? 'tab active' : 'tab'} onClick={() => setTab('agents')}>Agent Performance</button>
          <button className={tab === 'verify' ? 'tab active' : 'tab'} onClick={() => setTab('verify')}>Verification</button>
          <button className={tab === 'alerts' ? 'tab active' : 'tab'} onClick={() => setTab('alerts')}>Data Alerts</button>
          <button className={tab === 'search' ? 'tab active' : 'tab'} onClick={() => setTab('search')}>Link Search</button>
          <button className={tab === 'staff' ? 'tab active' : 'tab'} onClick={() => setTab('staff')}>Staff Names</button>
          <button className={tab === 'shopify' ? 'tab active' : 'tab'} onClick={() => setTab('shopify')}>Shopify</button>
          <button className="tab settings-btn" onClick={() => setShowSetup(true)}>Settings</button>
        </div>
      </div>

      {/* ===== ORDERS TAB ===== */}
      {tab === 'orders' && (
        <>
          <div className="stats-row">
            <div className="stat-box purple"><div className="num">{filteredOrders.length}</div><div className="label">Orders</div></div>
            <div className="stat-box green"><div className="num">{totalAmount.toLocaleString('en-IN')}</div><div className="label">Total Amt</div></div>
            <div className="stat-box green"><div className="num">{totalPrepay.toLocaleString('en-IN')}</div><div className="label">Total Prepay</div></div>
            <div className="stat-box red"><div className="num">{totalCOD.toLocaleString('en-IN')}</div><div className="label">Total COD</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search</label>
              <input type="text" placeholder="Name, Phone, Location..." value={orderFilters.search}
                onChange={(e) => setOrderFilters((p) => ({ ...p, search: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Single Date</label>
              <input type="date" value={orderFilters.singleDate} onChange={(e) => setOrderFilters((p) => ({ ...p, singleDate: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date From</label>
              <input type="date" value={orderFilters.dateFrom} onChange={(e) => setOrderFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date To</label>
              <input type="date" value={orderFilters.dateTo} onChange={(e) => setOrderFilters((p) => ({ ...p, dateTo: e.target.value }))} />
            </div>
            <MultiSelect label="Doctor" options={orderFilterOptions.doctors} selected={orderFilters.doctor} onToggle={(v) => toggleOrderFilter('doctor', v)} />
            <MultiSelect label="Support Staff" options={orderFilterOptions.staff} selected={orderFilters.supportStaff} onToggle={(v) => toggleOrderFilter('supportStaff', v)} />
            <MultiSelect label="Location" options={orderFilterOptions.locations} selected={orderFilters.location} onToggle={(v) => toggleOrderFilter('location', v)} />
            <MultiSelect label="Order Type" options={orderFilterOptions.orderTypes} selected={orderFilters.orderType} onToggle={(v) => toggleOrderFilter('orderType', v)} />
            <MultiSelect label="Plan Type" options={orderFilterOptions.planTypes} selected={orderFilters.planType} onToggle={(v) => toggleOrderFilter('planType', v)} />
            <button className="clear-btn" onClick={clearOrderFilters}>Clear</button>
          </div>

          <div className="table-container">
            {filteredOrders.length === 0 ? <div className="no-data">No data found</div> : (
              <table>
                <thead><tr><th>#</th>{ORDER_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}<th>Alerts</th></tr></thead>
                <tbody>
                  {filteredOrders.map((row, i) => {
                    const rowIdx = orderData.indexOf(row)
                    const rowAlerts = orderAlerts.get(rowIdx) || []
                    const hasRed = rowAlerts.some((a) => a.type === 'red')
                    const hasOrange = rowAlerts.some((a) => a.type === 'orange')
                    const hasYellow = rowAlerts.some((a) => a.type === 'yellow')
                    const rowClass = hasRed ? 'row-alert-red' : hasOrange ? 'row-alert-orange' : hasYellow ? 'row-alert-yellow' : ''
                    return (
                    <tr key={i} className={rowClass}>
                      <td>{i + 1}</td>
                      {ORDER_COLUMNS.map((col) => {
                        if (col.key === 'name') return <td key={col.key}><strong>{row.name}</strong></td>
                        if (col.key === 'phone') return <td key={col.key}>{row.phone || <span className="badge badge-mismatch">N/A</span>}</td>
                        if (col.key === 'doctor') return <td key={col.key}>{row.doctor || <span className="badge badge-mismatch">N/A</span>}</td>
                        if (col.key === 'orderAmount' || col.key === 'prepayAmount') return <td key={col.key} className="amount">{row[col.key]}</td>
                        if (col.key === 'codAmount') return <td key={col.key} className="cod">{row[col.key]}</td>
                        if (col.key === 'planType') return <td key={col.key}>{row[col.key] && <span className="badge badge-plan">{row[col.key]}</span>}</td>
                        if (col.key === 'orderType') return <td key={col.key}>{row[col.key] && <span className="badge badge-order-type">{row[col.key]}</span>}</td>
                        if (col.key === 'deliveryNotes') return <td key={col.key}>{row[col.key] && <span className="badge badge-notes">{row[col.key]}</span>}</td>
                        return <td key={col.key}>{row[col.key]}</td>
                      })}
                      <td>
                        {rowAlerts.map((a, j) => (
                          <span key={j} className={`badge badge-alert-${a.type}`} style={{ marginRight: 4, marginBottom: 2, display: 'inline-block' }}>{a.msg}</span>
                        ))}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ===== EOD TAB ===== */}
      {tab === 'eod' && (
        <>
          <div className="stats-row">
            <div className="stat-box purple"><div className="num">{filteredEod.length}</div><div className="label">EOD Links</div></div>
            <div className="stat-box green"><div className="num">{eodFilterOptions.agents.length}</div><div className="label">Agents</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search Agent</label>
              <input type="text" placeholder="Agent name..." value={eodFilters.search}
                onChange={(e) => setEodFilters((p) => ({ ...p, search: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Single Date</label>
              <input type="date" value={eodFilters.singleDate} onChange={(e) => setEodFilters((p) => ({ ...p, singleDate: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date From</label>
              <input type="date" value={eodFilters.dateFrom} onChange={(e) => setEodFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date To</label>
              <input type="date" value={eodFilters.dateTo} onChange={(e) => setEodFilters((p) => ({ ...p, dateTo: e.target.value }))} />
            </div>
            <MultiSelect label="Agent" options={eodFilterOptions.agents} selected={eodFilters.agent} onToggle={(v) => toggleEodFilter('agent', v)} />
            <button className="clear-btn" onClick={clearEodFilters}>Clear</button>
          </div>

          <div className="table-container">
            {filteredEod.length === 0 ? <div className="no-data">No data found</div> : (
              <table>
                <thead><tr><th>#</th><th>Date</th><th>Agent</th><th>Deal #</th><th>Link</th><th>Sr.</th><th>Sheet</th><th>Timestamp</th></tr></thead>
                <tbody>
                  {filteredEod.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{row.reportDate}</td>
                      <td><strong>{row.agentName}</strong></td>
                      <td>{row.dealNumber}</td>
                      <td>{row.dealLink ? <a href={row.dealLink.split(/\s+/)[0]} target="_blank" rel="noreferrer" className="link-btn">Open</a> : ''}</td>
                      <td>{row.submittedAt}</td>
                      <td><span className="badge badge-plan">{row.source}</span></td>
                      <td>{row.timestamp ? new Date(row.timestamp).toLocaleString('en-IN') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ===== MATCH TAB ===== */}
      {tab === 'match' && (
        <>
          <div className="stats-row">
            <div className="stat-box green"><div className="num">{filteredMatch.filter((r) => r.match).length}</div><div className="label">Match</div></div>
            <div className="stat-box red"><div className="num">{filteredMatch.filter((r) => !r.match).length}</div><div className="label">Mismatch</div></div>
            <div className="stat-box purple"><div className="num">{filteredMatch.length}</div><div className="label">Total</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search Agent</label>
              <input type="text" placeholder="Agent name..." value={eodFilters.search}
                onChange={(e) => setEodFilters((p) => ({ ...p, search: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Single Date</label>
              <input type="date" value={eodFilters.singleDate} onChange={(e) => setEodFilters((p) => ({ ...p, singleDate: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date From</label>
              <input type="date" value={eodFilters.dateFrom} onChange={(e) => setEodFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date To</label>
              <input type="date" value={eodFilters.dateTo} onChange={(e) => setEodFilters((p) => ({ ...p, dateTo: e.target.value }))} />
            </div>
            <MultiSelect label="Agent" options={eodFilterOptions.agents} selected={eodFilters.agent} onToggle={(v) => toggleEodFilter('agent', v)} />
            <button className="clear-btn" onClick={clearEodFilters}>Clear</button>
          </div>

          <MatchTable data={filteredMatch} />
        </>
      )}
      {/* ===== CHARTS TAB ===== */}
      {tab === 'charts' && <Charts data={filteredOrders} />}

      {/* ===== AGENT PERFORMANCE TAB ===== */}
      {tab === 'agents' && <AgentPerformance data={orderData} />}

      {/* ===== VERIFICATION TAB ===== */}
      {tab === 'verify' && <SheetVerification data={orderData} />}

      {/* ===== DATA ALERTS TAB ===== */}
      {tab === 'alerts' && <DataAlerts data={orderData} eodData={eodData} />}

      {/* ===== LINK SEARCH TAB ===== */}
      {tab === 'search' && <LinkSearch eodData={eodData} allDuplicates={allDuplicates} />}

      {/* ===== STAFF MAPPING TAB ===== */}
      {tab === 'staff' && (
        <StaffMapping
          orderData={orderData}
          eodData={eodData}
          staffGroups={staffGroups}
          onUpdate={setStaffGroups}
        />
      )}

      {/* ===== SHOPIFY TAB ===== */}
      {tab === 'shopify' && <ShopifyMatch orderData={orderData} />}

      {/* ===== DUPLICATES TAB ===== */}
      {tab === 'duplicates' && (
        <>
          <div className="stats-row">
            <div className="stat-box red"><div className="num">{sameSheetDupes.length}</div><div className="label">Same Sheet Duplicates</div></div>
            <div className="stat-box purple"><div className="num">{crossSheetDupes.length}</div><div className="label">Cross Sheet Duplicates</div></div>
            <div className="stat-box green"><div className="num">{dedupedEod.length}</div><div className="label">Clean Links</div></div>
            <div className="stat-box blue"><div className="num">{eodData.length}</div><div className="label">Total EOD Rows</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search Agent</label>
              <input type="text" placeholder="Agent name..." value={eodFilters.search}
                onChange={(e) => setEodFilters((p) => ({ ...p, search: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Single Date</label>
              <input type="date" value={eodFilters.singleDate} onChange={(e) => setEodFilters((p) => ({ ...p, singleDate: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date From</label>
              <input type="date" value={eodFilters.dateFrom} onChange={(e) => setEodFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
            </div>
            <div className="filter-group"><label>Date To</label>
              <input type="date" value={eodFilters.dateTo} onChange={(e) => setEodFilters((p) => ({ ...p, dateTo: e.target.value }))} />
            </div>
            <MultiSelect label="Agent" options={eodFilterOptions.agents} selected={eodFilters.agent} onToggle={(v) => toggleEodFilter('agent', v)} />
            <button className="clear-btn" onClick={clearEodFilters}>Clear</button>
          </div>

          {/* Agent wise duplicate stats */}
          {dupeAgentStats.length > 0 && (
            <div className="table-container" style={{ marginBottom: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Agent</th>
                    <th>Same Sheet Dupes</th>
                    <th>Cross Sheet Dupes</th>
                    <th>Total Dupes</th>
                  </tr>
                </thead>
                <tbody>
                  {dupeAgentStats.map((a, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><strong>{a.name}</strong></td>
                      <td className={a.sameSheet > 0 ? 'cod' : ''}>{a.sameSheet}</td>
                      <td className={a.crossSheet > 0 ? 'cod' : ''}>{a.crossSheet}</td>
                      <td><span className="badge badge-mismatch">{a.sameSheet + a.crossSheet}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Duplicate links detail */}
          <div className="table-container">
            {filteredDuplicates.length === 0 ? <div className="no-data">No duplicates found</div> : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Agent</th>
                    <th>Date</th>
                    <th>Sheet</th>
                    <th>Link</th>
                    <th>Original Agent</th>
                    <th>Original Date</th>
                    <th>Original Sheet</th>
                    <th>Found In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDuplicates.map((row, i) => (
                    <tr key={i} className={row.type === 'Cross Sheet' ? 'row-cross-dupe' : 'row-mismatch'}>
                      <td>{i + 1}</td>
                      <td><span className={row.type === 'Cross Sheet' ? 'badge badge-cross' : 'badge badge-mismatch'}>{row.type}</span></td>
                      <td><strong>{row.agent}</strong></td>
                      <td>{row.date}</td>
                      <td><span className="badge badge-plan">{row.source}</span></td>
                      <td>{row.link ? <a href={row.link.split(/\s+/)[0]} target="_blank" rel="noreferrer" className="link-btn">Open</a> : ''}</td>
                      <td>{row.firstAgent}</td>
                      <td>{row.firstDate}</td>
                      <td><span className="badge badge-plan">{row.firstSource}</span></td>
                      <td>{row.foundInSheets ? <span className="badge badge-cross">{row.foundInSheets}</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App
