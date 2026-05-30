import { useMemo, useState } from 'react'

// Valid Zoho CRM link patterns
const ZOHO_PATTERNS = [
  /^https?:\/\/crm\.zoho\.in\/crm\/org\d+\/tab\/(Potentials|Invoices|Contacts|Leads|Deals)\/\d+/,
]

function validateLink(link) {
  if (!link) return { status: 'empty', reason: 'Link is empty' }
  const url = link.split(/\s+/)[0].trim()
  if (!url) return { status: 'empty', reason: 'Link is empty' }
  if (!url.startsWith('http')) return { status: 'broken', reason: 'Not a valid URL' }
  if (!url.includes('zoho.in')) return { status: 'broken', reason: 'Not a Zoho link' }
  if (!ZOHO_PATTERNS.some((p) => p.test(url))) return { status: 'suspicious', reason: 'Invalid Zoho format' }
  // Check for garbled/too short ID
  const idMatch = url.match(/\/(\d+)(\?|$)/)
  if (idMatch && idMatch[1].length < 10) return { status: 'suspicious', reason: 'ID too short (' + idMatch[1].length + ' digits)' }
  return { status: 'valid', reason: '' }
}

export default function DataAlerts({ data, eodData = [] }) {
  const [alertTab, setAlertTab] = useState('duplicates')

  // Duplicate Orders: same name + same phone + same amount
  const duplicateOrders = useMemo(() => {
    const map = new Map()
    data.forEach((row, idx) => {
      const name = row.name?.trim().toLowerCase()
      const phone = row.phone?.trim()
      const amount = row.orderAmount?.trim() || '0'
      if (!name || !phone) return
      const key = `${name}|${phone}|${amount}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ ...row, rowIndex: idx + 1 })
    })

    const dupes = []
    map.forEach((rows) => {
      if (rows.length > 1) {
        rows.forEach((r) => {
          dupes.push({ ...r, duplicateCount: rows.length })
        })
      }
    })
    return dupes
  }, [data])

  // Missing Data
  const missingData = useMemo(() => {
    const issues = []
    data.forEach((row, idx) => {
      const missing = []
      if (!row.phone?.trim()) missing.push('Phone')
      if (!row.orderAmount?.trim() || row.orderAmount === '0') missing.push('Order Amount')
      if (!row.doctor?.trim()) missing.push('Doctor')
      if (!row.supportStaff?.trim()) missing.push('Support Staff')
      if (!row.location?.trim()) missing.push('Location')
      if (!row.date?.trim()) missing.push('Date')
      if (missing.length > 0) {
        issues.push({ ...row, rowIndex: idx + 1, missingFields: missing })
      }
    })
    return issues
  }, [data])

  // EOD Link Validation
  const linkIssues = useMemo(() => {
    const empty = []
    const broken = []
    const suspicious = []
    const valid = []

    eodData.forEach((row, idx) => {
      const result = validateLink(row.dealLink)
      const entry = {
        agent: row.agentName?.trim() || '',
        date: row.reportDate || '',
        link: row.dealLink || '',
        source: row.source || '',
        reason: result.reason,
        rowIndex: idx + 1,
      }
      if (result.status === 'empty') empty.push(entry)
      else if (result.status === 'broken') broken.push(entry)
      else if (result.status === 'suspicious') suspicious.push(entry)
      else valid.push(entry)
    })

    return { empty, broken, suspicious, valid, total: eodData.length }
  }, [eodData])

  const phoneMissing = missingData.filter((r) => r.missingFields.includes('Phone')).length
  const doctorMissing = missingData.filter((r) => r.missingFields.includes('Doctor')).length

  const badLinks = [...linkIssues.empty, ...linkIssues.broken, ...linkIssues.suspicious]

  return (
    <div className="data-alerts">
      <div className="stats-row">
        <div className="stat-box red">
          <div className="num">{duplicateOrders.length}</div>
          <div className="label">Duplicate Orders</div>
        </div>
        <div className="stat-box purple">
          <div className="num">{missingData.length}</div>
          <div className="label">Missing Data</div>
        </div>
        <div className="stat-box red">
          <div className="num">{badLinks.length}</div>
          <div className="label">Bad EOD Links</div>
        </div>
        <div className="stat-box green">
          <div className="num">{linkIssues.valid.length}</div>
          <div className="label">Valid EOD Links</div>
        </div>
      </div>

      {/* Link issue breakdown */}
      <div className="stats-row">
        <div className="stat-box red"><div className="num">{linkIssues.empty.length}</div><div className="label">Empty Links</div></div>
        <div className="stat-box red"><div className="num">{linkIssues.broken.length}</div><div className="label">Broken Links</div></div>
        <div className="stat-box purple"><div className="num">{linkIssues.suspicious.length}</div><div className="label">Suspicious Links</div></div>
        <div className="stat-box red"><div className="num">{phoneMissing}</div><div className="label">Phone Missing</div></div>
        <div className="stat-box red"><div className="num">{doctorMissing}</div><div className="label">Doctor Missing</div></div>
      </div>

      {/* Sub tabs */}
      <div className="filters">
        <button className={alertTab === 'duplicates' ? 'alert-tab active' : 'alert-tab'} onClick={() => setAlertTab('duplicates')}>
          Duplicate Orders ({duplicateOrders.length})
        </button>
        <button className={alertTab === 'missing' ? 'alert-tab active' : 'alert-tab'} onClick={() => setAlertTab('missing')}>
          Missing Data ({missingData.length})
        </button>
        <button className={alertTab === 'links' ? 'alert-tab active' : 'alert-tab'} onClick={() => setAlertTab('links')}>
          Bad EOD Links ({badLinks.length})
        </button>
      </div>

      {/* Duplicates Table */}
      {alertTab === 'duplicates' && (
        <div className="table-container">
          {duplicateOrders.length === 0 ? <div className="no-data">No duplicate orders found</div> : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Doctor</th>
                  <th>Amount</th>
                  <th>Staff</th>
                  <th>Location</th>
                  <th>Times</th>
                </tr>
              </thead>
              <tbody>
                {duplicateOrders.map((row, i) => (
                  <tr key={i} className="row-mismatch">
                    <td>{i + 1}</td>
                    <td>{row.rowIndex}</td>
                    <td>{row.date}</td>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.phone}</td>
                    <td>{row.doctor}</td>
                    <td className="amount">{row.orderAmount}</td>
                    <td>{row.supportStaff}</td>
                    <td>{row.location}</td>
                    <td><span className="badge badge-mismatch">{row.duplicateCount}x</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Missing Data Table */}
      {alertTab === 'missing' && (
        <div className="table-container">
          {missingData.length === 0 ? <div className="no-data">All data is complete</div> : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Doctor</th>
                  <th>Amount</th>
                  <th>Staff</th>
                  <th>Notes</th>
                  <th>Missing Fields</th>
                </tr>
              </thead>
              <tbody>
                {missingData.map((row, i) => {
                  const noteText = [row.notes, row.deliveryNotes].filter((n) => n && n.trim()).join(' | ')
                  return (
                  <tr key={i} className="row-mismatch">
                    <td>{i + 1}</td>
                    <td>{row.rowIndex}</td>
                    <td>{row.date || <span className="badge badge-mismatch">Empty</span>}</td>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.phone || <span className="badge badge-mismatch">Empty</span>}</td>
                    <td>{row.doctor || <span className="badge badge-mismatch">Empty</span>}</td>
                    <td>{row.orderAmount || <span className="badge badge-mismatch">Empty</span>}</td>
                    <td>{row.supportStaff || <span className="badge badge-mismatch">Empty</span>}</td>
                    <td style={{ maxWidth: 260, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {noteText ? <span className="badge badge-notes">{noteText}</span> : <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td>
                      {row.missingFields.map((f) => (
                        <span key={f} className="badge badge-mismatch" style={{ marginRight: 4 }}>{f}</span>
                      ))}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bad EOD Links Table */}
      {alertTab === 'links' && (
        <div className="table-container">
          {badLinks.length === 0 ? <div className="no-data">All EOD links are valid</div> : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent</th>
                  <th>Date</th>
                  <th>Sheet</th>
                  <th>Issue</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {badLinks.map((row, i) => (
                  <tr key={i} className={row.reason.includes('empty') || row.reason === 'Link is empty' ? 'row-mismatch' : 'row-cross-dupe'}>
                    <td>{i + 1}</td>
                    <td><strong>{row.agent}</strong></td>
                    <td>{row.date}</td>
                    <td><span className="badge badge-plan">{row.source}</span></td>
                    <td><span className={row.reason === 'Link is empty' ? 'badge badge-mismatch' : row.reason.includes('Not') ? 'badge badge-mismatch' : 'badge badge-cross'}>{row.reason}</span></td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.link ? (
                        <a href={row.link.split(/\s+/)[0]} target="_blank" rel="noreferrer" className="link-btn">
                          {row.link.length > 60 ? row.link.slice(0, 60) + '...' : row.link}
                        </a>
                      ) : <span className="badge badge-mismatch">Empty</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
