import { useState, useMemo, Fragment } from 'react'

// Same column order as the main Order Sheet (keep in sync with App.jsx ORDER_COLUMNS)
const ORDER_SHEET_KEYS = [
  'date', 'orderID', 'name', 'phone', 'deliveryDate', 'doctor',
  'orderAmount', 'prepayAmount', 'codAmount', 'supportStaff',
  'location', 'notes', 'dynos', 'poseidonMD', 'vitaman', 'anteros',
  'anicob', 'heraclesMD', 'morpheusMD', 'magmapureD3', 'aegisMD', 'omega3',
  'heliosMD', 'chronos25', 'sourceID', 'planType', 'orderType', 'deliveryNotes',
]

function rowToOrderObj(row) {
  const obj = {}
  ORDER_SHEET_KEYS.forEach((k, i) => { obj[k] = (row[i] || '').trim() })
  return obj
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
      rows.push(current); current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current || rows.length > 0) {
        rows.push(current); lines.push([...rows]); rows.length = 0; current = ''
      }
    } else current += ch
  }
  if (current || rows.length > 0) { rows.push(current); lines.push([...rows]) }
  return lines
}

function findHeader(headers, ...candidates) {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const c of candidates) {
    const idx = lower.findIndex((h) => h === c.toLowerCase())
    if (idx >= 0) return headers[idx]
  }
  return null
}

// Last 10 digits (handles +91, spaces, dashes, parens, country codes)
function normalizePhone(p) {
  if (!p) return ''
  const digits = String(p).replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

// Normalize date to yyyy-mm-dd (handles dd/mm/yyyy, yyyy-mm-dd, etc.)
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

function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity
  const [y1, m1, dd1] = d1.split('-').map(Number)
  const [y2, m2, dd2] = d2.split('-').map(Number)
  if (!y1 || !y2) return Infinity
  const a = new Date(y1, m1 - 1, dd1)
  const b = new Date(y2, m2 - 1, dd2)
  return Math.round(Math.abs((a - b) / (1000 * 60 * 60 * 24)))
}

function addDays(dateStr, n) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Auto-classify a missing Shopify order using only signals present in the CSV
function autoClassify(o) {
  const total = parseFloat(o.total) || 0
  const fulfillment = (o.fulfillment || '').toLowerCase()
  const financial = (o.financial || '').toLowerCase()
  const cancelled = (o.cancelledAt || '').trim()
  const refunded = parseFloat(o.refundedAmount) || 0
  const tags = (o.tags || '').toLowerCase()
  const notes = (o.notes || '').toLowerCase()
  const blob = `${tags} ${notes}`

  if (cancelled) return 'cancelled'
  if (financial === 'refunded' || financial === 'partially_refunded' || refunded > 0) return 'refunded'
  if (fulfillment === 'restocked') return 'rto'
  if (total === 0) return 'foc'
  if (/\brto\b|return to origin|returned/.test(blob)) return 'rto'
  if (/\bfoc\b|free of cost|free order|gift/.test(blob)) return 'foc'
  if (/\bhold\b|on[\s-]?hold|pending review/.test(blob)) return 'hold'
  return 'unclassified'
}

const STATUS_LABELS = {
  truly_missing: 'Truly Missing',
  rto: 'RTO',
  foc: 'FOC / Free',
  hold: 'On Hold',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  other: 'Other',
  unclassified: 'Unclassified',
}

const STATUS_BADGE = {
  truly_missing: 'badge badge-mismatch',
  rto: 'badge badge-cross',
  foc: 'badge badge-plan',
  hold: 'badge badge-cross',
  cancelled: 'badge badge-plan',
  refunded: 'badge badge-plan',
  other: 'badge badge-plan',
  unclassified: 'badge badge-mismatch',
}

const MARKS_STORAGE_KEY = 'shopify_missing_order_marks_v1'

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

function ShopifyMatch({ orderData = [] }) {
  const [rawData, setRawData] = useState([])
  const [headers, setHeaders] = useState([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Optional 2nd Order Sheet (uploaded as CSV) — merged with main orderData for matching
  const [secondSheetData, setSecondSheetData] = useState([])
  const [secondSheetFileName, setSecondSheetFileName] = useState('')
  const [secondSheetError, setSecondSheetError] = useState(null)
  const [dateFilter, setDateFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [fulfillmentFilter, setFulfillmentFilter] = useState('')
  const [matchFilter, setMatchFilter] = useState('')
  const [dateScope, setDateScope] = useState('sameDate')
  const [search, setSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [view, setView] = useState('shopify')

  // Reconciliation state
  const [toleranceDays, setToleranceDays] = useState(3)
  const [reconSearch, setReconSearch] = useState('')
  const [reconShow, setReconShow] = useState('mismatch')
  const [expandedReconPhone, setExpandedReconPhone] = useState(null)

  // Payment scope: default only paid + partially_paid (real revenue)
  const [paymentScope, setPaymentScope] = useState('paidOnly')

  // Missing Paid Orders state
  const [missingSearch, setMissingSearch] = useState('')
  const [missingDateFilter, setMissingDateFilter] = useState('')
  const [missingReasonFilter, setMissingReasonFilter] = useState('')
  const [missingStatusFilter, setMissingStatusFilter] = useState('')

  // Manual classification marks (RTO / FOC / Hold / etc.) — keyed by Shopify order name (e.g. "#1234")
  // Persists in localStorage so marks survive refresh and new CSV uploads.
  const [manualMarks, setManualMarks] = useState(() => {
    try {
      const saved = localStorage.getItem(MARKS_STORAGE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  function setMark(orderName, code) {
    if (!orderName) return
    setManualMarks((prev) => {
      const next = { ...prev }
      if (!code) delete next[orderName]
      else next[orderName] = code
      try { localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)
    setError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const lines = parseCSV(ev.target.result)
        if (lines.length < 2) {
          setError('File is empty or only contains a header')
          setLoading(false)
          return
        }
        const head = lines[0].map((h) => h.trim())
        const rows = lines.slice(1).filter((r) => r.some((c) => c && c.trim()))
        const objs = rows.map((r) => {
          const obj = {}
          head.forEach((h, i) => { obj[h] = (r[i] || '').trim() })
          return obj
        })
        setHeaders(head)
        setRawData(objs)
        setLoading(false)
      } catch (err) {
        setError('Parse error: ' + err.message)
        setLoading(false)
      }
    }
    reader.onerror = () => { setError('File read failed'); setLoading(false) }
    reader.readAsText(file)
  }

  function handleSecondSheet(e) {
    const file = e.target.files[0]
    if (!file) return
    setSecondSheetFileName(file.name)
    setSecondSheetError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const lines = parseCSV(ev.target.result)
        if (lines.length < 1) {
          setSecondSheetError('File is empty')
          return
        }
        // Skip header row if first cell looks like a label, not a date
        const first = (lines[0][0] || '').toLowerCase().trim()
        const startIdx = (first === 'date' || first === '' || /^[a-z]/i.test(first)) ? 1 : 0
        const rows = lines.slice(startIdx)
          .map(rowToOrderObj)
          .filter((r) => r.name || r.phone)
        setSecondSheetData(rows)
        if (rows.length === 0) setSecondSheetError('No valid rows found (need name or phone)')
      } catch (err) {
        setSecondSheetError('Parse error: ' + err.message)
      }
    }
    reader.onerror = () => setSecondSheetError('File read failed')
    reader.readAsText(file)
    e.target.value = ''
  }

  function removeSecondSheet() {
    setSecondSheetData([])
    setSecondSheetFileName('')
    setSecondSheetError(null)
  }

  // Merged sheet data: main orderData + uploaded 2nd sheet — used everywhere matching happens
  const mergedSheetData = useMemo(
    () => [...orderData, ...secondSheetData],
    [orderData, secondSheetData]
  )

  const cols = useMemo(() => {
    if (headers.length === 0) return {}
    return {
      name: findHeader(headers, 'Name'),
      email: findHeader(headers, 'Email'),
      createdAt: findHeader(headers, 'Created at', 'Created At'),
      paidAt: findHeader(headers, 'Paid at', 'Paid At'),
      financial: findHeader(headers, 'Financial Status'),
      fulfillment: findHeader(headers, 'Fulfillment Status'),
      total: findHeader(headers, 'Total'),
      phone: findHeader(headers, 'Phone'),
      shippingPhone: findHeader(headers, 'Shipping Phone'),
      billingPhone: findHeader(headers, 'Billing Phone'),
      shippingName: findHeader(headers, 'Shipping Name'),
      billingName: findHeader(headers, 'Billing Name'),
      shippingCity: findHeader(headers, 'Shipping City'),
      paymentMethod: findHeader(headers, 'Payment Method'),
      tags: findHeader(headers, 'Tags'),
      notes: findHeader(headers, 'Notes', 'Note'),
      cancelledAt: findHeader(headers, 'Cancelled at', 'Cancelled At'),
      refundedAmount: findHeader(headers, 'Refunded Amount'),
    }
  }, [headers])

  function getPhone(row) {
    return (cols.phone && row[cols.phone]) || (cols.shippingPhone && row[cols.shippingPhone]) || (cols.billingPhone && row[cols.billingPhone]) || ''
  }

  function getDate(row) {
    const raw = (cols.createdAt && row[cols.createdAt]) || ''
    return raw.slice(0, 10)
  }

  // Group lineitems into unique orders (all of them)
  const allOrders = useMemo(() => {
    const map = new Map()
    rawData.forEach((r) => {
      const orderName = (cols.name && r[cols.name]) || ''
      if (!orderName) return
      if (!map.has(orderName)) {
        map.set(orderName, { ...r, _lineCount: 1 })
      } else {
        map.get(orderName)._lineCount++
      }
    })
    return [...map.values()]
  }, [rawData, cols])

  // Breakdown by Financial Status (for transparency)
  const paymentBreakdown = useMemo(() => {
    const map = new Map()
    allOrders.forEach((o) => {
      const status = ((cols.financial && o[cols.financial]) || 'unknown').toLowerCase() || 'unknown'
      map.set(status, (map.get(status) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [allOrders, cols])

  // Filter orders by payment scope (paid + partially_paid only by default)
  const orders = useMemo(() => {
    if (paymentScope === 'all') return allOrders
    return allOrders.filter((o) => {
      const status = ((cols.financial && o[cols.financial]) || '').toLowerCase()
      return status === 'paid' || status === 'partially_paid'
    })
  }, [allOrders, paymentScope, cols])

  const excludedCount = allOrders.length - orders.length

  // Build sheet phone index: phone(10 digits) -> [sheet rows]
  // Also: phone+date -> [sheet rows] for date-scoped matching
  const sheetIndex = useMemo(() => {
    const byPhone = new Map()
    const byPhoneDate = new Map()
    mergedSheetData.forEach((r) => {
      const phone = normalizePhone(r.phone)
      if (!phone) return
      const date = normalizeDate(r.date)
      if (!byPhone.has(phone)) byPhone.set(phone, [])
      byPhone.get(phone).push(r)
      const key = `${phone}|${date}`
      if (!byPhoneDate.has(key)) byPhoneDate.set(key, [])
      byPhoneDate.get(key).push(r)
    })
    return { byPhone, byPhoneDate }
  }, [mergedSheetData])

  // For each Shopify order, compute match against sheet
  const ordersWithMatch = useMemo(() => {
    return orders.map((o) => {
      const phone = normalizePhone(getPhone(o))
      const date = getDate(o)
      let sheetMatches = []
      if (phone) {
        if (dateScope === 'sameDate' && date) {
          sheetMatches = sheetIndex.byPhoneDate.get(`${phone}|${date}`) || []
        } else {
          sheetMatches = sheetIndex.byPhone.get(phone) || []
        }
      }
      return { ...o, _phone: phone, _date: date, _sheetMatches: sheetMatches, _matched: sheetMatches.length > 0 }
    })
  }, [orders, sheetIndex, dateScope, cols])

  const paymentOptions = useMemo(() => {
    const set = new Set()
    ordersWithMatch.forEach((r) => { const v = cols.financial && r[cols.financial]; if (v) set.add(v) })
    return [...set].sort()
  }, [ordersWithMatch, cols])

  const fulfillmentOptions = useMemo(() => {
    const set = new Set()
    ordersWithMatch.forEach((r) => { const v = cols.fulfillment && r[cols.fulfillment]; if (v) set.add(v) })
    return [...set].sort()
  }, [ordersWithMatch, cols])

  const filteredOrders = useMemo(() => {
    return ordersWithMatch.filter((row) => {
      if (dateFilter) {
        if (row._date !== dateFilter) return false
      }
      if (paymentFilter && cols.financial) {
        if ((row[cols.financial] || '').toLowerCase() !== paymentFilter.toLowerCase()) return false
      }
      if (fulfillmentFilter && cols.fulfillment) {
        const v = (row[cols.fulfillment] || '').toLowerCase() || 'unfulfilled'
        if (v !== fulfillmentFilter.toLowerCase()) return false
      }
      if (matchFilter === 'matched' && !row._matched) return false
      if (matchFilter === 'unmatched' && row._matched) return false
      if (matchFilter === 'nophone' && row._phone) return false
      if (search) {
        const s = search.toLowerCase()
        const phone = row._phone.toLowerCase()
        const name = ((cols.shippingName && row[cols.shippingName]) || (cols.billingName && row[cols.billingName]) || '').toLowerCase()
        const ordName = ((cols.name && row[cols.name]) || '').toLowerCase()
        const email = ((cols.email && row[cols.email]) || '').toLowerCase()
        if (!phone.includes(s) && !name.includes(s) && !ordName.includes(s) && !email.includes(s)) return false
      }
      return true
    })
  }, [ordersWithMatch, dateFilter, paymentFilter, fulfillmentFilter, matchFilter, search, cols])

  const stats = useMemo(() => {
    let paid = 0, pending = 0, matched = 0, unmatched = 0, noPhone = 0, totalAmt = 0
    filteredOrders.forEach((r) => {
      const fin = ((cols.financial && r[cols.financial]) || '').toLowerCase()
      if (fin === 'paid') paid++
      else if (fin === 'pending') pending++
      if (!r._phone) noPhone++
      else if (r._matched) matched++
      else unmatched++
      totalAmt += parseFloat((cols.total && r[cols.total]) || 0) || 0
    })
    return { total: filteredOrders.length, paid, pending, matched, unmatched, noPhone, totalAmt }
  }, [filteredOrders, cols])

  // === Per-Customer Reconciliation ===
  // For each phone in Shopify, count vs Sheet, with greedy date pairing within tolerance.
  const reconciliation = useMemo(() => {
    // Build Shopify by phone + min/max date window
    const shopByPhone = new Map()
    let minDate = null, maxDate = null
    orders.forEach((o) => {
      const phone = normalizePhone(getPhone(o))
      if (!phone) return
      const date = getDate(o)
      if (date) {
        if (!minDate || date < minDate) minDate = date
        if (!maxDate || date > maxDate) maxDate = date
      }
      if (!shopByPhone.has(phone)) shopByPhone.set(phone, [])
      shopByPhone.get(phone).push({
        date,
        orderName: (cols.name && o[cols.name]) || '',
        total: (cols.total && o[cols.total]) || '',
        financial: (cols.financial && o[cols.financial]) || '',
        fulfillment: (cols.fulfillment && o[cols.fulfillment]) || '',
        customer: (cols.shippingName && o[cols.shippingName]) || (cols.billingName && o[cols.billingName]) || '',
        tags: (cols.tags && o[cols.tags]) || '',
        notes: (cols.notes && o[cols.notes]) || '',
        cancelledAt: (cols.cancelledAt && o[cols.cancelledAt]) || '',
        refundedAmount: (cols.refundedAmount && o[cols.refundedAmount]) || '',
        raw: o,
      })
    })

    const windowStart = minDate ? addDays(minDate, -toleranceDays) : ''
    const windowEnd = maxDate ? addDays(maxDate, toleranceDays) : ''

    // Build Sheet by phone, only for phones in Shopify, only within window
    const sheetByPhone = new Map()
    mergedSheetData.forEach((r) => {
      const phone = normalizePhone(r.phone)
      if (!phone || !shopByPhone.has(phone)) return
      const date = normalizeDate(r.date)
      if (windowStart && date && date < windowStart) return
      if (windowEnd && date && date > windowEnd) return
      if (!sheetByPhone.has(phone)) sheetByPhone.set(phone, [])
      sheetByPhone.get(phone).push({ date, raw: r })
    })

    const rows = []
    shopByPhone.forEach((shopList, phone) => {
      const sortedShop = [...shopList].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      const sortedSheet = [...(sheetByPhone.get(phone) || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

      const usedSheetIdx = new Set()
      const pairs = sortedShop.map((shop) => {
        let bestIdx = -1, bestDiff = Infinity
        sortedSheet.forEach((sheet, idx) => {
          if (usedSheetIdx.has(idx)) return
          const diff = daysBetween(shop.date, sheet.date)
          if (diff <= toleranceDays && diff < bestDiff) {
            bestDiff = diff
            bestIdx = idx
          }
        })
        if (bestIdx >= 0) {
          usedSheetIdx.add(bestIdx)
          return { shop, sheet: sortedSheet[bestIdx], diff: bestDiff }
        }
        return { shop, sheet: null, diff: null }
      })

      const extraSheet = sortedSheet.filter((_, i) => !usedSheetIdx.has(i))
      const missingCount = pairs.filter((p) => !p.sheet).length
      const customerName = sortedShop[0]?.customer || (sortedSheet[0] && sortedSheet[0].raw.name) || ''

      rows.push({
        phone,
        customerName,
        shopCount: sortedShop.length,
        sheetCount: sortedSheet.length,
        missingCount,
        extraCount: extraSheet.length,
        pairs,
        extraSheet,
        isRepeat: sortedShop.length > 1,
        hasMismatch: missingCount > 0 || extraSheet.length > 0,
      })
    })

    rows.sort((a, b) => b.missingCount - a.missingCount || b.shopCount - a.shopCount || a.phone.localeCompare(b.phone))

    return { rows, windowStart, windowEnd }
  }, [orders, mergedSheetData, cols, toleranceDays])

  const reconStats = useMemo(() => {
    const r = reconciliation.rows
    return {
      totalCustomers: r.length,
      perfectMatch: r.filter((x) => x.missingCount === 0 && x.extraCount === 0).length,
      withMissing: r.filter((x) => x.missingCount > 0).length,
      withExtra: r.filter((x) => x.extraCount > 0).length,
      totalMissing: r.reduce((s, x) => s + x.missingCount, 0),
      totalExtra: r.reduce((s, x) => s + x.extraCount, 0),
      repeatCustomers: r.filter((x) => x.isRepeat).length,
    }
  }, [reconciliation])

  const filteredReconciliation = useMemo(() => {
    return reconciliation.rows.filter((row) => {
      if (reconShow === 'mismatch' && !row.hasMismatch) return false
      if (reconShow === 'missing' && row.missingCount === 0) return false
      if (reconShow === 'extra' && row.extraCount === 0) return false
      if (reconShow === 'repeat' && !row.isRepeat) return false
      if (reconShow === 'perfect' && row.hasMismatch) return false
      if (reconSearch) {
        const s = reconSearch.toLowerCase()
        const blob = `${row.phone} ${row.customerName}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [reconciliation, reconShow, reconSearch])

  function exportMissingCSV() {
    const header = ['Phone', 'Customer', 'Shopify Order', 'Shopify Date', 'Amount', 'Payment Status', 'Fulfillment', 'Status']
    const rows = [header]
    filteredReconciliation.forEach((row) => {
      row.pairs.filter((p) => !p.sheet).forEach((p) => {
        rows.push([
          row.phone,
          row.customerName,
          p.shop.orderName,
          p.shop.date,
          p.shop.total,
          p.shop.financial,
          p.shop.fulfillment,
          'MISSING IN SHEET',
        ])
      })
    })
    downloadCSV(rows, `missing-orders-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // === Missing Paid Orders (flat list, no grouping) ===
  // For each Shopify paid order not in sheet (within window), compute a "likely reason"
  // by checking if the phone exists ANYWHERE in sheet (any date).
  const missingPaidOrders = useMemo(() => {
    const fullSheetByPhone = new Map()
    mergedSheetData.forEach((r) => {
      const phone = normalizePhone(r.phone)
      if (!phone) return
      if (!fullSheetByPhone.has(phone)) fullSheetByPhone.set(phone, [])
      fullSheetByPhone.get(phone).push({ date: normalizeDate(r.date), raw: r })
    })

    const list = []
    reconciliation.rows.forEach((row) => {
      row.pairs.forEach((p, idx) => {
        if (p.sheet) return
        const phone = row.phone
        const sheetEntriesAny = fullSheetByPhone.get(phone) || []
        let reasonCode = 'never_seen'
        let reasonText = 'Phone never seen in sheet — completely missed entry'
        let closestDate = ''
        let closestDiff = null

        if (sheetEntriesAny.length > 0) {
          let closest = null
          let bestDiff = Infinity
          sheetEntriesAny.forEach((s) => {
            if (!s.date || !p.shop.date) return
            const diff = daysBetween(p.shop.date, s.date)
            if (diff < bestDiff) {
              bestDiff = diff
              closest = s
            }
          })
          if (closest) {
            closestDate = closest.date
            closestDiff = bestDiff
            if (bestDiff <= 7) {
              reasonCode = 'date_mismatch'
              reasonText = `Phone in sheet on ${closest.date} (${bestDiff} day gap) — likely date entry mistake`
            } else {
              reasonCode = 'old_entry'
              reasonText = `Phone in sheet on ${closest.date} (${bestDiff} days off — different time period)`
            }
          }
        }

        if (row.shopCount > 1) {
          reasonCode = 'repeat_skipped'
          reasonText = `Repeat customer: ${row.shopCount} Shopify orders, sheet has ${row.sheetCount}. This is order ${idx + 1}/${row.shopCount}.`
        }

        list.push({
          phone,
          customerName: row.customerName,
          date: p.shop.date,
          orderName: p.shop.orderName,
          total: p.shop.total,
          totalNum: parseFloat(p.shop.total) || 0,
          financial: p.shop.financial,
          fulfillment: p.shop.fulfillment,
          tags: p.shop.tags || '',
          notes: p.shop.notes || '',
          cancelledAt: p.shop.cancelledAt || '',
          refundedAmount: p.shop.refundedAmount || '',
          reasonCode,
          reasonText,
          closestDate,
          closestDiff,
          shopCount: row.shopCount,
          sheetCount: row.sheetCount,
          orderIdx: idx + 1,
        })
      })
    })

    return list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.phone.localeCompare(b.phone))
  }, [reconciliation, mergedSheetData])

  const missingStats = useMemo(() => {
    const totalAmount = missingPaidOrders.reduce((s, o) => s + o.totalNum, 0)
    const uniqueCustomers = new Set(missingPaidOrders.map((o) => o.phone)).size

    const byReason = new Map()
    missingPaidOrders.forEach((o) => {
      byReason.set(o.reasonCode, (byReason.get(o.reasonCode) || 0) + 1)
    })

    const byDate = new Map()
    missingPaidOrders.forEach((o) => {
      if (!o.date) return
      if (!byDate.has(o.date)) byDate.set(o.date, { count: 0, amount: 0 })
      const e = byDate.get(o.date)
      e.count++
      e.amount += o.totalNum
    })
    const dateBreakdown = [...byDate.entries()]
      .map(([d, v]) => ({ date: d, ...v }))
      .sort((a, b) => b.amount - a.amount)

    return {
      count: missingPaidOrders.length,
      totalAmount,
      uniqueCustomers,
      byReason: [...byReason.entries()],
      dateBreakdown,
    }
  }, [missingPaidOrders])

  // Enrich each missing order with auto + manual classification
  const classifiedMissing = useMemo(() => {
    return missingPaidOrders.map((o) => {
      const autoCode = autoClassify(o)
      const manualCode = manualMarks[o.orderName] || ''
      const finalCode = manualCode || autoCode
      return { ...o, autoCode, manualCode, finalCode }
    })
  }, [missingPaidOrders, manualMarks])

  const statusBreakdown = useMemo(() => {
    const map = new Map()
    classifiedMissing.forEach((o) => {
      map.set(o.finalCode, (map.get(o.finalCode) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [classifiedMissing])

  const filteredMissing = useMemo(() => {
    return classifiedMissing.filter((o) => {
      if (missingDateFilter && o.date !== missingDateFilter) return false
      if (missingReasonFilter && o.reasonCode !== missingReasonFilter) return false
      if (missingStatusFilter && o.finalCode !== missingStatusFilter) return false
      if (missingSearch) {
        const s = missingSearch.toLowerCase()
        const blob = `${o.phone} ${o.customerName} ${o.orderName} ${o.tags} ${o.notes}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [classifiedMissing, missingDateFilter, missingReasonFilter, missingStatusFilter, missingSearch])

  const filteredMissingTotal = useMemo(
    () => filteredMissing.reduce((s, o) => s + o.totalNum, 0),
    [filteredMissing]
  )

  function exportMissingFlatCSV() {
    const header = ['Date', 'Order #', 'Customer', 'Phone', 'Amount', 'Payment', 'Fulfillment', 'Classification', 'Mark Source', 'Tags', 'Cancelled At', 'Refunded Amount', 'Reason', 'Closest Sheet Date', 'Days Off']
    const rows = [header]
    filteredMissing.forEach((o) => {
      rows.push([
        o.date, o.orderName, o.customerName, o.phone, o.total, o.financial, o.fulfillment,
        STATUS_LABELS[o.finalCode] || o.finalCode,
        o.manualCode ? 'manual' : 'auto',
        o.tags || '', o.cancelledAt || '', o.refundedAmount || '',
        o.reasonText, o.closestDate, o.closestDiff != null ? o.closestDiff : '',
      ])
    })
    downloadCSV(rows, `missing-paid-orders-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function copyPhones() {
    const phones = [...new Set(filteredMissing.map((o) => o.phone))].join('\n')
    navigator.clipboard.writeText(phones).then(
      () => alert(`Copied ${[...new Set(filteredMissing.map((o) => o.phone))].length} phone numbers`),
      () => alert('Copy failed')
    )
  }

  const REASON_LABELS = {
    never_seen: 'Phone never in sheet',
    date_mismatch: 'Date mismatch (≤7 days)',
    old_entry: 'Different time period',
    repeat_skipped: 'Repeat order skipped',
  }

  // Reverse view: sheet orders NOT found in Shopify (same date scope)
  const sheetOnlyRows = useMemo(() => {
    if (orders.length === 0) return []
    // Build Shopify phone set (optionally per date)
    const shopifyByPhone = new Set()
    const shopifyByPhoneDate = new Set()
    orders.forEach((o) => {
      const p = normalizePhone(getPhone(o))
      const d = getDate(o)
      if (!p) return
      shopifyByPhone.add(p)
      shopifyByPhoneDate.add(`${p}|${d}`)
    })
    return mergedSheetData.filter((r) => {
      const p = normalizePhone(r.phone)
      if (!p) return false
      const d = normalizeDate(r.date)
      // If date filter is set, only compare that day's sheet rows
      if (dateFilter && d !== dateFilter) return false
      if (dateScope === 'sameDate') {
        return !shopifyByPhoneDate.has(`${p}|${d}`)
      }
      return !shopifyByPhone.has(p)
    })
  }, [orders, mergedSheetData, dateFilter, dateScope, cols])

  function resetFile() {
    if (!confirm('Reset the file?')) return
    setRawData([])
    setHeaders([])
    setFileName('')
    setDateFilter('')
    setPaymentFilter('')
    setFulfillmentFilter('')
    setMatchFilter('')
    setSearch('')
    setExpandedRow(null)
  }

  if (rawData.length === 0) {
    return (
      <div className="setup-container">
        <div className="setup-header">
          <h1>Shopify Orders Upload</h1>
          <p>Export orders CSV from Shopify and upload it here</p>
          {mergedSheetData.length === 0 && (
            <div className="error" style={{ marginTop: 8 }}>
              Warning: Order sheet data is not loaded. Please load the order sheet from Settings first — only then matching will work.
            </div>
          )}
          {mergedSheetData.length > 0 && (
            <p style={{ color: '#16a34a', fontWeight: 600 }}>
              Sheet data loaded: {orderData.length} (main){secondSheetData.length > 0 ? ` + ${secondSheetData.length} (2nd sheet)` : ''} = {mergedSheetData.length} rows — matching is ready ✓
            </p>
          )}
        </div>
        <div className="setup-section">
          <h3>Step 1 — Upload CSV</h3>
          <div className="setup-or-row">
            <div className="setup-option">
              <label className="setup-label">Shopify Orders CSV</label>
              <input type="file" accept=".csv" className="setup-file" onChange={handleFile} />
              {fileName && <span className="file-name">{fileName}</span>}
              {loading && <div style={{ marginTop: 8 }}>Loading...</div>}
              {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#f1f5f9', borderRadius: 6, fontSize: 13 }}>
            <strong>How to export:</strong>
            <ol style={{ marginTop: 6, paddingLeft: 20 }}>
              <li>Shopify Admin → Orders</li>
              <li>Apply a date filter (the day you want)</li>
              <li>Export → Plain CSV file → Current page / Selected orders</li>
              <li>Upload it here</li>
            </ol>
          </div>
        </div>

        <div className="setup-section" style={{ marginTop: 16 }}>
          <h3>Optional — Upload 2nd Order Sheet (CSV)</h3>
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>
            Same column order as the main Order Sheet (Date, Order ID, Name, Phone, ...). Will be merged with the main sheet for matching.
          </div>
          <div className="setup-or-row">
            <div className="setup-option">
              <label className="setup-label">2nd Order Sheet CSV</label>
              <input type="file" accept=".csv" className="setup-file" onChange={handleSecondSheet} />
              {secondSheetFileName && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <span className="file-name">{secondSheetFileName}</span>
                  {secondSheetData.length > 0 && (
                    <span style={{ marginLeft: 8, color: '#16a34a' }}>· {secondSheetData.length} rows loaded ✓</span>
                  )}
                  <button className="clear-btn" style={{ marginLeft: 12, padding: '4px 10px', fontSize: 12 }} onClick={removeSecondSheet}>
                    Remove
                  </button>
                </div>
              )}
              {secondSheetError && <div className="error" style={{ marginTop: 8 }}>{secondSheetError}</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="match-tabs" style={{ marginBottom: 12 }}>
        <button className={view === 'shopify' ? 'alert-tab active' : 'alert-tab'} onClick={() => setView('shopify')}>
          Shopify Orders ({ordersWithMatch.length})
        </button>
        <button className={view === 'reconcile' ? 'alert-tab active' : 'alert-tab'} onClick={() => setView('reconcile')}>
          Customer Reconciliation {reconStats.totalMissing > 0 && <span className="tab-badge">{reconStats.totalMissing}</span>}
        </button>
        <button className={view === 'missing' ? 'alert-tab active' : 'alert-tab'} onClick={() => setView('missing')}>
          Missing Paid Orders {missingStats.count > 0 && <span className="tab-badge">{missingStats.count}</span>}
        </button>
        <button className={view === 'simple' ? 'alert-tab active' : 'alert-tab'} onClick={() => setView('simple')}>
          Simple Missing {missingStats.count > 0 && <span className="tab-badge">{missingStats.count}</span>}
        </button>
        <button className={view === 'sheetonly' ? 'alert-tab active' : 'alert-tab'} onClick={() => setView('sheetonly')}>
          In Sheet, not in Shopify ({sheetOnlyRows.length})
        </button>
      </div>

      {/* Payment Status Filter Banner */}
      <div style={{ marginBottom: 12, padding: 12, background: paymentScope === 'paidOnly' ? '#ecfdf5' : '#fef3c7', borderRadius: 8, border: '1px solid ' + (paymentScope === 'paidOnly' ? '#a7f3d0' : '#fde68a'), display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13 }}>
          <strong>Match scope:</strong>{' '}
          {paymentScope === 'paidOnly' ? (
            <>
              Only <span className="badge badge-match">paid</span> + <span className="badge badge-match">partially_paid</span> orders are matched ({orders.length} of {allOrders.length}).
              {excludedCount > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  Excluded ({excludedCount}):{' '}
                  {paymentBreakdown
                    .filter(([s]) => s !== 'paid' && s !== 'partially_paid')
                    .map(([s, c]) => `${s} ${c}`)
                    .join(', ')}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="badge badge-mismatch">All orders</span> being matched, including pending/refunded/cancelled ({allOrders.length} total).
            </>
          )}
        </div>
        <button
          className="clear-btn"
          style={{ padding: '6px 14px', fontSize: 12 }}
          onClick={() => setPaymentScope(paymentScope === 'paidOnly' ? 'all' : 'paidOnly')}
        >
          {paymentScope === 'paidOnly' ? 'Show All Orders' : 'Show Paid Only'}
        </button>
      </div>

      {/* 2nd Order Sheet Upload (optional, merged with main sheet for matching) */}
      <div style={{ marginBottom: 12, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13 }}>
          <strong>Sheet sources:</strong>{' '}
          <span className="badge badge-plan">Main: {orderData.length}</span>{' '}
          {secondSheetData.length > 0 ? (
            <>
              <span className="badge badge-match">2nd Sheet: {secondSheetData.length}</span>{' '}
              <span style={{ opacity: 0.7 }}>= {mergedSheetData.length} total rows being matched</span>
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>· Upload an optional 2nd order sheet to merge into matching</span>
          )}
          {secondSheetFileName && (
            <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>({secondSheetFileName})</span>
          )}
          {secondSheetError && <span className="error" style={{ marginLeft: 8 }}>{secondSheetError}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="clear-btn" style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer', margin: 0 }}>
            {secondSheetData.length > 0 ? 'Replace 2nd Sheet' : 'Upload 2nd Sheet CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleSecondSheet} />
          </label>
          {secondSheetData.length > 0 && (
            <button className="clear-btn" style={{ padding: '6px 14px', fontSize: 12 }} onClick={removeSecondSheet}>
              Remove
            </button>
          )}
        </div>
      </div>

      {view === 'shopify' && (
        <>
          <div className="stats-row">
            <div className="stat-box purple"><div className="num">{stats.total}</div><div className="label">Total Orders</div></div>
            <div className="stat-box green"><div className="num">{stats.matched}</div><div className="label">Matched (in Sheet)</div></div>
            <div className="stat-box red"><div className="num">{stats.unmatched}</div><div className="label">Not Matched (missing in Sheet)</div></div>
            <div className="stat-box red"><div className="num">{stats.noPhone}</div><div className="label">No Phone</div></div>
            <div className="stat-box green"><div className="num">{stats.paid}</div><div className="label">Paid</div></div>
            <div className="stat-box green"><div className="num">{stats.totalAmt.toLocaleString('en-IN')}</div><div className="label">Total Amt</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search (Name, Phone, Email, Order#)</label>
              <input type="text" placeholder="Type anything..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Date (Created at)</label>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Payment Status</label>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="">All</option>
                {paymentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Fulfillment</label>
              <select value={fulfillmentFilter} onChange={(e) => setFulfillmentFilter(e.target.value)}>
                <option value="">All</option>
                {fulfillmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Match Status</label>
              <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
                <option value="">All</option>
                <option value="matched">Matched (in Sheet)</option>
                <option value="unmatched">Not Matched (missing)</option>
                <option value="nophone">No Phone</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Match Scope</label>
              <select value={dateScope} onChange={(e) => setDateScope(e.target.value)}>
                <option value="sameDate">Same Date only</option>
                <option value="anyDate">Any Date</option>
              </select>
            </div>
            <button className="clear-btn" onClick={() => { setDateFilter(''); setPaymentFilter(''); setFulfillmentFilter(''); setMatchFilter(''); setSearch('') }}>Clear</button>
            <button className="clear-btn" onClick={resetFile}>Reset File</button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            File: <strong>{fileName}</strong> — {rawData.length} rows, {orders.length} unique orders, {headers.length} columns. Sheet rows: {orderData.length}{secondSheetData.length > 0 ? ` + ${secondSheetData.length} (2nd sheet) = ${mergedSheetData.length}` : ''}. Match scope: <strong>{dateScope === 'sameDate' ? 'Same date only' : 'Any date'}</strong>
          </div>

          <div className="table-container">
            {filteredOrders.length === 0 ? <div className="no-data">No orders found</div> : (
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((r, i) => {
                    const fin = (cols.financial && r[cols.financial]) || ''
                    const ful = (cols.fulfillment && r[cols.fulfillment]) || 'unfulfilled'
                    const finLower = fin.toLowerCase()
                    const fulLower = ful.toLowerCase()
                    const rowClass = !r._phone ? 'row-alert-orange' : r._matched ? 'row-match' : 'row-mismatch'
                    return (
                      <Fragment key={i}>
                        <tr className={rowClass} style={{ cursor: 'pointer' }} onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                          <td><span className="expand-arrow">{expandedRow === i ? '▼' : '▶'}</span></td>
                          <td>{i + 1}</td>
                          <td><strong>{(cols.name && r[cols.name]) || ''}</strong></td>
                          <td>{r._date}</td>
                          <td>{(cols.shippingName && r[cols.shippingName]) || (cols.billingName && r[cols.billingName]) || ''}</td>
                          <td>{getPhone(r) || <span className="badge badge-mismatch">N/A</span>}</td>
                          <td className="amount">{(cols.total && r[cols.total]) || ''}</td>
                          <td>
                            <span className={finLower === 'paid' ? 'badge badge-match' : 'badge badge-mismatch'}>{fin || 'N/A'}</span>
                          </td>
                          <td>
                            <span className={fulLower === 'fulfilled' ? 'badge badge-match' : 'badge badge-plan'}>{ful}</span>
                          </td>
                          <td>
                            {!r._phone
                              ? <span className="badge badge-mismatch">No Phone</span>
                              : r._matched
                                ? <span className="badge badge-match">✓ In Sheet ({r._sheetMatches.length})</span>
                                : <span className="badge badge-mismatch">✗ Not in Sheet</span>}
                          </td>
                        </tr>
                        {expandedRow === i && (
                          <tr className="links-row">
                            <td colSpan={10}>
                              <div className="links-dropdown" style={{ padding: 12 }}>
                                {r._matched && r._sheetMatches.length > 0 && (
                                  <div className="match-section" style={{ marginBottom: 12 }}>
                                    <div className="match-section-title order-title">
                                      Matching rows in Sheet ({r._sheetMatches.length}) — phone: {r._phone}
                                    </div>
                                    <table className="inner-table">
                                      <thead>
                                        <tr>
                                          <th>#</th>
                                          <th>Sheet Date</th>
                                          <th>Name</th>
                                          <th>Phone</th>
                                          <th>Support Staff</th>
                                          <th>Doctor</th>
                                          <th>Amount</th>
                                          <th>Prepay</th>
                                          <th>COD</th>
                                          <th>Order Type</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {r._sheetMatches.map((s, j) => (
                                          <tr key={j}>
                                            <td>{j + 1}</td>
                                            <td>{s.date}</td>
                                            <td><strong>{s.name}</strong></td>
                                            <td>{s.phone}</td>
                                            <td>{s.supportStaff}</td>
                                            <td>{s.doctor}</td>
                                            <td className="amount">{s.orderAmount}</td>
                                            <td className="amount">{s.prepayAmount}</td>
                                            <td className="cod">{s.codAmount}</td>
                                            <td>{s.orderType}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {!r._matched && r._phone && (
                                  <div className="match-summary" style={{ marginBottom: 12 }}>
                                    Phone <strong>{r._phone}</strong> not found in sheet ({dateScope === 'sameDate' ? `on date ${r._date}` : 'on any date'}). This order has no entry in the sheet.
                                  </div>
                                )}
                                <div>
                                  <strong>Shopify Full Row:</strong>
                                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, fontSize: 12 }}>
                                    {headers.map((h) => r[h] && (
                                      <div key={h} style={{ padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                        <div style={{ opacity: 0.6, fontSize: 11 }}>{h}</div>
                                        <div style={{ wordBreak: 'break-word' }}>{r[h]}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'reconcile' && (
        <>
          <div className="stats-row">
            <div className="stat-box purple"><div className="num">{reconStats.totalCustomers}</div><div className="label">Customers (Shopify)</div></div>
            <div className="stat-box green"><div className="num">{reconStats.perfectMatch}</div><div className="label">Perfect Match</div></div>
            <div className="stat-box red"><div className="num">{reconStats.withMissing}</div><div className="label">With Missing in Sheet</div></div>
            <div className="stat-box red"><div className="num">{reconStats.totalMissing}</div><div className="label">Total Orders Missing</div></div>
            <div className="stat-box purple"><div className="num">{reconStats.repeatCustomers}</div><div className="label">Repeat Customers</div></div>
            <div className="stat-box red"><div className="num">{reconStats.totalExtra}</div><div className="label">Extra in Sheet</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Search Phone/Name</label>
              <input type="text" placeholder="Search..." value={reconSearch} onChange={(e) => setReconSearch(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Show</label>
              <select value={reconShow} onChange={(e) => setReconShow(e.target.value)}>
                <option value="mismatch">Only Mismatches</option>
                <option value="missing">Missing in Sheet</option>
                <option value="extra">Extra in Sheet</option>
                <option value="repeat">Repeat Customers</option>
                <option value="perfect">Perfect Match</option>
                <option value="all">All Customers</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Date Tolerance (days)</label>
              <input type="number" min="0" max="14" value={toleranceDays} onChange={(e) => setToleranceDays(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
            <button className="clear-btn" onClick={() => { setReconSearch(''); setReconShow('mismatch'); setToleranceDays(3) }}>Reset</button>
            <button className="setup-load-btn" style={{ padding: '10px 20px', width: 'auto' }} onClick={exportMissingCSV} disabled={reconStats.totalMissing === 0}>
              Export Missing
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Window: <strong>{reconciliation.windowStart || '—'}</strong> to <strong>{reconciliation.windowEnd || '—'}</strong> · pairing tolerance ±{toleranceDays} days · showing <strong>{filteredReconciliation.length}</strong> customers
          </div>

          <div className="table-container">
            {filteredReconciliation.length === 0 ? (
              <div className="no-data">No customers match the current filter</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>Phone</th>
                    <th>Customer</th>
                    <th>Shopify</th>
                    <th>Sheet</th>
                    <th>Missing</th>
                    <th>Extra</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReconciliation.map((row, i) => {
                    const expanded = expandedReconPhone === row.phone
                    const rowClass = row.missingCount > 0 ? 'row-mismatch' : row.extraCount > 0 ? 'row-cross-dupe' : 'row-match'
                    return (
                      <Fragment key={row.phone}>
                        <tr className={rowClass} style={{ cursor: 'pointer' }} onClick={() => setExpandedReconPhone(expanded ? null : row.phone)}>
                          <td><span className="expand-arrow">{expanded ? '▼' : '▶'}</span></td>
                          <td>{i + 1}</td>
                          <td><strong>{row.phone}</strong></td>
                          <td>{row.customerName}{row.isRepeat && <span className="badge badge-cross" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                          <td><span className="badge badge-plan">{row.shopCount}</span></td>
                          <td><span className={row.sheetCount === row.shopCount ? 'badge badge-match' : 'badge badge-mismatch'}>{row.sheetCount}</span></td>
                          <td className={row.missingCount > 0 ? 'cod' : ''}>{row.missingCount > 0 ? <strong>{row.missingCount}</strong> : 0}</td>
                          <td className={row.extraCount > 0 ? 'cod' : ''}>{row.extraCount > 0 ? row.extraCount : 0}</td>
                          <td>
                            {row.missingCount === 0 && row.extraCount === 0
                              ? <span className="badge badge-match">✓ Match</span>
                              : row.missingCount > 0
                                ? <span className="badge badge-mismatch">✗ {row.missingCount} missing</span>
                                : <span className="badge badge-cross">{row.extraCount} extra in sheet</span>}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`d-${row.phone}`} className="links-row">
                            <td colSpan={9}>
                              <div className="links-dropdown" style={{ padding: 12 }}>
                                <div className="match-section" style={{ marginBottom: 12 }}>
                                  <div className="match-section-title eod-title">
                                    Pairing Timeline — Phone {row.phone}
                                  </div>
                                  <table className="inner-table">
                                    <thead>
                                      <tr>
                                        <th>#</th>
                                        <th>Shopify Date</th>
                                        <th>Order #</th>
                                        <th>Amount</th>
                                        <th>Payment</th>
                                        <th>→</th>
                                        <th>Sheet Date</th>
                                        <th>Sheet Name</th>
                                        <th>Staff</th>
                                        <th>Order Type</th>
                                        <th>Sheet Amt</th>
                                        <th>Match</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.pairs.map((p, j) => (
                                        <tr key={j} className={p.sheet ? '' : 'row-mismatch'}>
                                          <td>{j + 1}</td>
                                          <td>{p.shop.date}</td>
                                          <td><strong>{p.shop.orderName}</strong></td>
                                          <td className="amount">{p.shop.total}</td>
                                          <td>
                                            <span className={(p.shop.financial || '').toLowerCase() === 'paid' ? 'badge badge-match' : 'badge badge-mismatch'}>
                                              {p.shop.financial || 'N/A'}
                                            </span>
                                          </td>
                                          <td>{p.sheet ? '→' : '✗'}</td>
                                          <td>{p.sheet ? p.sheet.date : <span className="badge badge-mismatch">MISSING</span>}</td>
                                          <td>{p.sheet ? p.sheet.raw.name : ''}</td>
                                          <td>{p.sheet ? p.sheet.raw.supportStaff : ''}</td>
                                          <td>{p.sheet && p.sheet.raw.orderType ? <span className="badge badge-order-type">{p.sheet.raw.orderType}</span> : ''}</td>
                                          <td className="amount">{p.sheet ? p.sheet.raw.orderAmount : ''}</td>
                                          <td>
                                            {!p.sheet
                                              ? <span className="badge badge-mismatch">Not in Sheet</span>
                                              : p.diff === 0
                                                ? <span className="badge badge-match">Same day</span>
                                                : <span className="badge badge-cross">±{p.diff} day{p.diff > 1 ? 's' : ''}</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {row.extraSheet.length > 0 && (
                                  <div className="match-section">
                                    <div className="match-section-title order-title">
                                      Extra in Sheet ({row.extraSheet.length}) — no Shopify counterpart in window
                                    </div>
                                    <table className="inner-table">
                                      <thead>
                                        <tr>
                                          <th>#</th>
                                          <th>Date</th>
                                          <th>Name</th>
                                          <th>Staff</th>
                                          <th>Doctor</th>
                                          <th>Amount</th>
                                          <th>Order Type</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.extraSheet.map((s, j) => (
                                          <tr key={j}>
                                            <td>{j + 1}</td>
                                            <td>{s.raw.date}</td>
                                            <td><strong>{s.raw.name}</strong></td>
                                            <td>{s.raw.supportStaff}</td>
                                            <td>{s.raw.doctor}</td>
                                            <td className="amount">{s.raw.orderAmount}</td>
                                            <td>{s.raw.orderType && <span className="badge badge-order-type">{s.raw.orderType}</span>}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {row.missingCount > 0 && (
                                  <div className="match-summary" style={{ marginTop: 12 }}>
                                    <strong>{row.missingCount}</strong> Shopify order{row.missingCount > 1 ? 's' : ''} for this customer not found in Sheet (within ±{toleranceDays} days). These need to be added to the sheet.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'missing' && (
        <>
          <div className="stats-row">
            <div className="stat-box red">
              <div className="num">
                {classifiedMissing.filter((o) => o.finalCode === 'truly_missing' || o.finalCode === 'unclassified').length}
              </div>
              <div className="label">Truly Missing + Unclassified</div>
            </div>
            <div className="stat-box red"><div className="num">{missingStats.count}</div><div className="label">All Missing Orders</div></div>
            <div className="stat-box red">
              <div className="num">{Math.round(missingStats.totalAmount).toLocaleString('en-IN')}</div>
              <div className="label">Total Missing ₹ (gap)</div>
            </div>
            <div className="stat-box purple"><div className="num">{missingStats.uniqueCustomers}</div><div className="label">Unique Customers</div></div>
            <div className="stat-box green">
              <div className="num">{stats.totalAmt.toLocaleString('en-IN')}</div>
              <div className="label">Shopify Total ₹ (paid)</div>
            </div>
          </div>

          {/* Classification breakdown — Truly Missing vs RTO/FOC/Hold/etc. */}
          {statusBreakdown.length > 0 && (
            <div className="match-section" style={{ marginBottom: 16 }}>
              <div className="match-section-title order-title">Order Classification — click to filter (auto + manual marks)</div>
              <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {statusBreakdown.map(([code, count]) => (
                  <button
                    key={code}
                    className={missingStatusFilter === code ? 'alert-tab active' : 'alert-tab'}
                    onClick={() => setMissingStatusFilter(missingStatusFilter === code ? '' : code)}
                  >
                    {STATUS_LABELS[code] || code}: {count}
                  </button>
                ))}
                {Object.keys(manualMarks).length > 0 && (
                  <button
                    className="clear-btn"
                    style={{ padding: '6px 14px', fontSize: 12 }}
                    onClick={() => {
                      if (confirm(`Clear all ${Object.keys(manualMarks).length} manual marks?`)) {
                        setManualMarks({})
                        try { localStorage.removeItem(MARKS_STORAGE_KEY) } catch {}
                      }
                    }}
                  >
                    Clear {Object.keys(manualMarks).length} manual marks
                  </button>
                )}
              </div>
              <div style={{ padding: '0 12px 10px', fontSize: 12, opacity: 0.7 }}>
                <strong>Tip:</strong> Auto-detection uses Shopify signals (Total=0 → FOC, Cancelled date → Cancelled, Refunded → Refunded, Restocked → RTO). Use the dropdown in each row to manually mark RTO / FOC / Hold etc. Marks save automatically.
              </div>
            </div>
          )}

          {/* Reason breakdown (why phone not in sheet) */}
          {missingStats.byReason.length > 0 && (
            <div className="match-section" style={{ marginBottom: 16 }}>
              <div className="match-section-title eod-title">Why these orders are missing in sheet (click to filter)</div>
              <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {missingStats.byReason.map(([code, count]) => (
                  <button
                    key={code}
                    className={missingReasonFilter === code ? 'alert-tab active' : 'alert-tab'}
                    onClick={() => setMissingReasonFilter(missingReasonFilter === code ? '' : code)}
                  >
                    {REASON_LABELS[code] || code}: {count}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date breakdown - top 10 days */}
          {missingStats.dateBreakdown.length > 0 && (
            <div className="match-section" style={{ marginBottom: 16 }}>
              <div className="match-section-title order-title">Date-wise (top 10 days by missing ₹)</div>
              <div className="table-container" style={{ maxHeight: 240, overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Missing Orders</th>
                      <th>Missing ₹</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingStats.dateBreakdown.slice(0, 10).map((d, i) => (
                      <tr key={d.date} className={missingDateFilter === d.date ? 'row-mismatch' : ''}>
                        <td>{i + 1}</td>
                        <td><strong>{d.date}</strong></td>
                        <td><span className="badge badge-mismatch">{d.count}</span></td>
                        <td className="amount">{Math.round(d.amount).toLocaleString('en-IN')}</td>
                        <td>
                          <button
                            className={missingDateFilter === d.date ? 'alert-tab active' : 'alert-tab'}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => setMissingDateFilter(missingDateFilter === d.date ? '' : d.date)}
                          >
                            {missingDateFilter === d.date ? 'Clear' : 'Filter'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="filters">
            <div className="filter-group">
              <label>Search Phone/Name/Order#</label>
              <input type="text" placeholder="Search..." value={missingSearch} onChange={(e) => setMissingSearch(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Date</label>
              <input type="date" value={missingDateFilter} onChange={(e) => setMissingDateFilter(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Status (Auto/Manual)</label>
              <select value={missingStatusFilter} onChange={(e) => setMissingStatusFilter(e.target.value)}>
                <option value="">All</option>
                {statusBreakdown.map(([code, count]) => (
                  <option key={code} value={code}>{STATUS_LABELS[code] || code} ({count})</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Reason (sheet match)</label>
              <select value={missingReasonFilter} onChange={(e) => setMissingReasonFilter(e.target.value)}>
                <option value="">All</option>
                {missingStats.byReason.map(([code, count]) => (
                  <option key={code} value={code}>{REASON_LABELS[code] || code} ({count})</option>
                ))}
              </select>
            </div>
            <button className="clear-btn" onClick={() => { setMissingSearch(''); setMissingDateFilter(''); setMissingReasonFilter(''); setMissingStatusFilter('') }}>Clear</button>
            <button className="setup-load-btn" style={{ padding: '10px 20px', width: 'auto' }} onClick={exportMissingFlatCSV} disabled={filteredMissing.length === 0}>
              Export CSV
            </button>
            <button className="setup-load-btn" style={{ padding: '10px 20px', width: 'auto', background: '#0ea5e9' }} onClick={copyPhones} disabled={filteredMissing.length === 0}>
              Copy Phones
            </button>
          </div>

          <div style={{ fontSize: 13, marginBottom: 8, padding: 10, background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
            Showing <strong>{filteredMissing.length}</strong> missing orders · Filtered total: <strong>₹{Math.round(filteredMissingTotal).toLocaleString('en-IN')}</strong>
            {' · '}This is the amount in Shopify that has <strong>no corresponding sheet entry</strong> within ±{toleranceDays} days.
          </div>

          <div className="table-container">
            {filteredMissing.length === 0 ? (
              <div className="no-data">
                {missingPaidOrders.length === 0 ? 'No missing paid orders ✓ All Shopify paid orders are in sheet' : 'No missing orders match the current filter'}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Classification</th>
                    <th>Mark As</th>
                    <th>Likely Reason (sheet)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMissing.map((o, i) => {
                    const rowClass = o.finalCode === 'truly_missing' || o.finalCode === 'unclassified'
                      ? 'row-mismatch'
                      : 'row-cross-dupe'
                    return (
                    <tr key={`${o.orderName}-${i}`} className={rowClass}>
                      <td>{i + 1}</td>
                      <td>{o.date}</td>
                      <td><strong>{o.orderName}</strong></td>
                      <td>{o.customerName}</td>
                      <td><strong>{o.phone}</strong></td>
                      <td className="amount">{o.total}</td>
                      <td>
                        <span className={(o.financial || '').toLowerCase() === 'paid' ? 'badge badge-match' : 'badge badge-cross'}>
                          {o.financial || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_BADGE[o.finalCode] || 'badge badge-plan'}>
                          {STATUS_LABELS[o.finalCode] || o.finalCode}
                        </span>
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                          {o.manualCode ? 'manual' : `auto${o.autoCode === 'unclassified' ? '' : ': ' + STATUS_LABELS[o.autoCode]}`}
                        </div>
                      </td>
                      <td>
                        <select
                          value={o.manualCode}
                          onChange={(e) => setMark(o.orderName, e.target.value)}
                          style={{ fontSize: 12, padding: '4px 6px' }}
                        >
                          <option value="">(Auto)</option>
                          <option value="truly_missing">Truly Missing</option>
                          <option value="rto">RTO</option>
                          <option value="foc">FOC / Free</option>
                          <option value="hold">On Hold</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td>
                        <span
                          className={
                            o.reasonCode === 'never_seen' ? 'badge badge-mismatch'
                            : o.reasonCode === 'date_mismatch' ? 'badge badge-cross'
                            : o.reasonCode === 'repeat_skipped' ? 'badge badge-cross'
                            : 'badge badge-plan'
                          }
                          style={{ whiteSpace: 'normal', textAlign: 'left', display: 'inline-block', maxWidth: 320 }}
                        >
                          {o.reasonText}
                        </span>
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

      {view === 'simple' && (() => {
        // Build phone set from sheet (any date) — pure phone-only match
        const sheetPhones = new Set()
        mergedSheetData.forEach((r) => {
          const p = normalizePhone(r.phone)
          if (p) sheetPhones.add(p)
        })

        // Shopify paid orders whose phone is NOT in sheet at all
        const simpleMissing = orders
          .map((o) => {
            const phone = normalizePhone(getPhone(o))
            return {
              phone,
              orderName: (cols.name && o[cols.name]) || '',
              customerName: (cols.shippingName && o[cols.shippingName]) || (cols.billingName && o[cols.billingName]) || '',
              date: getDate(o),
              total: (cols.total && o[cols.total]) || '',
              totalNum: parseFloat((cols.total && o[cols.total]) || 0) || 0,
            }
          })
          .filter((o) => !o.phone || !sheetPhones.has(o.phone))

        const q = missingSearch.trim().toLowerCase()
        const list = q
          ? simpleMissing.filter((o) =>
              `${o.phone} ${o.customerName} ${o.orderName}`.toLowerCase().includes(q)
            )
          : simpleMissing
        const totalAmt = list.reduce((s, o) => s + o.totalNum, 0)
        return (
          <>
            <div className="stats-row">
              <div className="stat-box red"><div className="num">{list.length}</div><div className="label">Missing Orders</div></div>
              <div className="stat-box red"><div className="num">{Math.round(totalAmt).toLocaleString('en-IN')}</div><div className="label">Total Amount</div></div>
            </div>

            <div className="filters">
              <div className="filter-group" style={{ flex: 1 }}>
                <label>Search Phone / Name / Order#</label>
                <input
                  type="text"
                  placeholder="Search..."
                  value={missingSearch}
                  onChange={(e) => setMissingSearch(e.target.value)}
                />
              </div>
              {missingSearch && (
                <button className="clear-btn" onClick={() => setMissingSearch('')}>Clear</button>
              )}
              <button
                className="setup-load-btn"
                style={{ padding: '10px 20px', width: 'auto', background: '#0ea5e9' }}
                disabled={list.length === 0}
                onClick={() => {
                  const phones = [...new Set(list.map((o) => o.phone).filter(Boolean))].join('\n')
                  navigator.clipboard.writeText(phones)
                }}
              >
                Copy Phones
              </button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 8, padding: 10, background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
              Shopify ke <strong>paid</strong> orders jinka phone Order Sheet mein <strong>nahi mila</strong>.
            </div>

            <div className="table-container">
              {list.length === 0 ? (
                <div className="no-data">
                  {missingPaidOrders.length === 0
                    ? 'No missing paid orders ✓ All Shopify paid orders are in sheet'
                    : 'No matches for current search'}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o, i) => (
                      <tr key={`${o.orderName}-${i}`} className="row-mismatch">
                        <td>{i + 1}</td>
                        <td>{o.date}</td>
                        <td><strong>{o.orderName}</strong></td>
                        <td>{o.customerName}</td>
                        <td><strong>{o.phone}</strong></td>
                        <td className="amount">{o.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      })()}

      {view === 'sheetonly' && (
        <>
          <div className="stats-row">
            <div className="stat-box red"><div className="num">{sheetOnlyRows.length}</div><div className="label">In Sheet, not in Shopify</div></div>
            <div className="stat-box purple"><div className="num">{mergedSheetData.length}</div><div className="label">Total Sheet Orders {secondSheetData.length > 0 ? `(${orderData.length}+${secondSheetData.length})` : ''}</div></div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Date filter (sheet side)</label>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Match Scope</label>
              <select value={dateScope} onChange={(e) => setDateScope(e.target.value)}>
                <option value="sameDate">Same Date only</option>
                <option value="anyDate">Any Date</option>
              </select>
            </div>
            <button className="clear-btn" onClick={() => setDateFilter('')}>Clear Date</button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            These are the sheet rows whose phones were <strong>not found</strong> in the Shopify CSV. Meaning: an entry exists in the sheet but no Shopify order (or there is a phone mismatch).
          </div>

          <div className="table-container">
            {sheetOnlyRows.length === 0 ? <div className="no-data">All sheet rows were found in Shopify ✓</div> : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Support Staff</th>
                    <th>Doctor</th>
                    <th>Amount</th>
                    <th>Prepay</th>
                    <th>COD</th>
                    <th>Order Type</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetOnlyRows.map((s, i) => (
                    <tr key={i} className="row-mismatch">
                      <td>{i + 1}</td>
                      <td>{s.date}</td>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.phone}</td>
                      <td>{s.supportStaff}</td>
                      <td>{s.doctor}</td>
                      <td className="amount">{s.orderAmount}</td>
                      <td className="amount">{s.prepayAmount}</td>
                      <td className="cod">{s.codAmount}</td>
                      <td>{s.orderType}</td>
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

export default ShopifyMatch
