import React, { useMemo, useState, useEffect } from 'react'

import { SaleRow }  from '../../../../config/utils/pos.types'
import { usePOS }   from '../../../../context/POSContext'

interface Props { dailySales: SaleRow[] }

interface TallyItem {
  size:     string
  name:     string
  price:    number
  qty:      number
  subtotal: number
  isAddOn:  boolean
}

interface CustomerGroup {
  key:      string
  orderNo:  number | undefined
  customer: string
  time:     string
  methods:  string
  address:  string | undefined
  items:    TallyItem[]
  total:    number
  sortKey:  number
}

const CUSTOMERS_PER_PAGE = 10

// Normalise a date string that might still be an Excel serial (e.g. "46172")
const normDate = (raw: string): string => {
  const n = parseFloat(raw)
  if (!isNaN(n) && n > 40000 && String(n) === raw.trim()) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return raw
}

// "09:42 PM" → minutes since midnight (for stable time-based sorting)
const timeToMins = (t: string): number => {
  const m = t.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i)
  if (!m) return 0
  let h = parseInt(m[1]); const min = parseInt(m[2]); const p = (m[3] ?? '').toUpperCase()
  if (p === 'PM' && h !== 12) h += 12
  if (p === 'AM' && h === 12) h = 0
  return h * 60 + min
}

const formatDateLabel = (dateStr: string): string => {
  const s = normDate(dateStr)
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const DailyTally: React.FC<Props> = ({ dailySales }) => {
  const { voidOrder } = usePOS()
  const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

  const [selectedDate, setSelectedDate] = useState(today)
  const [page,         setPage]         = useState(1)
  const [pendingVoid,  setPendingVoid]  = useState<string | null>(null)
  const [notes,        setNotes]        = useState('')
  const [draftNotes,   setDraftNotes]   = useState('')
  const [notesOpen,    setNotesOpen]    = useState(false)
  const [noteSaved,    setNoteSaved]    = useState(false)

  // Reset page when date changes
  useEffect(() => { setPage(1) }, [selectedDate])

  // Load saved note and close panel when date changes
  useEffect(() => {
    const stored = localStorage.getItem('memento_daily_notes')
    const all = stored ? (JSON.parse(stored) as Record<string, string>) : {}
    setNotes(all[selectedDate] ?? '')
    setNotesOpen(false)
  }, [selectedDate])

  const handleSaveNote = () => {
    const stored = localStorage.getItem('memento_daily_notes')
    const all = stored ? (JSON.parse(stored) as Record<string, string>) : {}
    if (draftNotes) all[selectedDate] = draftNotes
    else delete all[selectedDate]
    localStorage.setItem('memento_daily_notes', JSON.stringify(all))
    setNotes(draftNotes)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  const groups = useMemo<CustomerGroup[]>(() => {
    // Normalise dates first so serial-number dates match the selected ISO date
    const filtered = dailySales.filter((r) => normDate(r.Date) === selectedDate)
    const map = new Map<string, CustomerGroup>()

    filtered.forEach((r) => {
      // Key = customer + time + OrderNo — prevents merging even when OrderNo
      // resets across reloads (e.g. two different orders both get OrderNo=1).
      const customer = r.Customer.trim() || 'Guest'
      const key      = `${customer}__${r.Time}__${r.OrderNo ?? '?'}`

      // Sort key = actual datetime: date epoch + time-of-day minutes + orderNo tiebreaker.
      // This is immune to OrderNo counter resets — ordering is purely time-based.
      const dateEpoch  = new Date(normDate(r.Date)).getTime() || 0
      const timeSortMs = timeToMins(r.Time) * 60_000
      const dtSort     = dateEpoch + timeSortMs + (r.OrderNo ?? 9999)

      if (!map.has(key)) {
        map.set(key, {
          key,
          orderNo:  r.OrderNo,
          customer,
          time:    r.Time,
          methods: r.Method,
          address: r.Address,
          items:   [],
          total:   0,
          sortKey: dtSort,
        })
      }
      const g = map.get(key)!
      g.items.push({
        size:     String(r.Size),
        name:     r.Drink,
        price:    r.Price,
        qty:      r.Qty,
        subtotal: parseFloat(r.Revenue) || 0,
        isAddOn:  String(r.Notes ?? '').startsWith('Add-on for'),
      })
      g.total += parseFloat(r.Revenue) || 0
      if (!g.methods.includes(r.Method)) g.methods += ` | ${r.Method}`
      if (dtSort < g.sortKey) g.sortKey = dtSort
    })

    // Ascending by sortKey = chronological (earliest first, latest last)
    return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey)
  }, [dailySales, selectedDate])

  const totalPages    = Math.ceil(groups.length / CUSTOMERS_PER_PAGE)
  const visibleGroups = groups.slice((page - 1) * CUSTOMERS_PER_PAGE, page * CUSTOMERS_PER_PAGE)

  const grandTotal  = groups.reduce((s, g) => s + g.total, 0)
  const totalItems  = groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.qty, 0), 0)
  const isToday     = selectedDate === today

  const filtered    = dailySales.filter((r) => normDate(r.Date) === selectedDate)
  const cashTotal   = filtered.filter((r) => r.Method === 'CASH').reduce((s, r) => s + (parseFloat(r.Revenue) || 0), 0)
  const gcashTotal  = filtered.filter((r) => r.Method === 'GCASH').reduce((s, r) => s + (parseFloat(r.Revenue) || 0), 0)

  const methodClass = (m: string) => {
    if (m.includes('|'))     return 'daily-tally__method-tag--mixed'
    if (m.includes('GCASH')) return 'daily-tally__method-tag--gcash'
    return 'daily-tally__method-tag--cash'
  }

  return (
    <div className='daily-tally'>

      {/* ── Title row ── */}
      <div className='daily-tally__title-row'>
        <span className='daily-tally__title'>Daily Sales Record</span>

        <div className='daily-tally__filter'>
          <input
            type='date'
            className='daily-tally__date-select daily-tally__date-select--datepicker'
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />

          {!isToday && (
            <button className='daily-tally__today-btn' onClick={() => setSelectedDate(today)}>
              ↩ Today
            </button>
          )}
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className='daily-tally__stats'>
        <div className='daily-tally__stat'>
          <span className='daily-tally__stat-val daily-tally__stat-val--date'>
            {formatDateLabel(selectedDate)}
          </span>
          <span className='daily-tally__stat-label'>Date</span>
        </div>
        <div className='daily-tally__stat-divider' />
        <div className='daily-tally__stat'>
          <span className='daily-tally__stat-val'>{groups.length}</span>
          <span className='daily-tally__stat-label'>Customers</span>
        </div>
        <div className='daily-tally__stat-divider' />
        <div className='daily-tally__stat'>
          <span className='daily-tally__stat-val'>{totalItems}</span>
          <span className='daily-tally__stat-label'>Items Sold</span>
        </div>
        <div className='daily-tally__stat-divider' />
        <div className='daily-tally__stat'>
          <span className='daily-tally__stat-val daily-tally__stat-val--rev'>
            ₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
          <span className='daily-tally__stat-label'>Total Revenue</span>
          <div className='daily-tally__method-breakdown'>
            {cashTotal  > 0 && <span className='daily-tally__method-chip daily-tally__method-chip--cash'>Cash ₱{cashTotal.toFixed(2)}</span>}
            {gcashTotal > 0 && <span className='daily-tally__method-chip daily-tally__method-chip--gcash'>GCash ₱{gcashTotal.toFixed(2)}</span>}
          </div>
        </div>
      </div>

      {/* ── Daily Notes toggle ── */}
      <div className='daily-tally__notes-wrap'>
        {!notesOpen ? (
          <button
            className={`daily-tally__notes-btn${notes ? ' daily-tally__notes-btn--has-note' : ''}`}
            onClick={() => { setDraftNotes(notes); setNotesOpen(true) }}
            title={notes ? 'Edit day note' : 'Add a note for this day'}
          >
            <svg width='13' height='13' viewBox='0 0 14 14' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
              <path d='M9.5 1.5l3 3-8 8H1.5v-3l8-8z'/>
            </svg>
            {notes
              ? <span className='daily-tally__notes-preview'>{notes.split('\n')[0].slice(0, 60)}{notes.length > 60 ? '…' : ''}</span>
              : <span>Add Note</span>
            }
            <svg className='daily-tally__notes-chevron' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
              <path d='M1 1l4 4 4-4'/>
            </svg>
          </button>
        ) : (
          <div className='daily-tally__notes-panel'>
            <div className='daily-tally__notes-panel-header'>
              <svg width='13' height='13' viewBox='0 0 14 14' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
                <path d='M9.5 1.5l3 3-8 8H1.5v-3l8-8z'/>
              </svg>
              <span>Day Note</span>
            </div>
            <textarea
              className='daily-tally__notes-textarea'
              placeholder='e.g. Rainy day — low foot traffic. Ran out of oat milk by noon.'
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              autoFocus
            />
            <div className='daily-tally__notes-actions'>
              <button className='daily-tally__notes-save' onClick={handleSaveNote}>
                {noteSaved ? '✓ Saved' : 'Save Note'}
              </button>
              <button className='daily-tally__notes-cancel' onClick={() => setNotesOpen(false)}>
                Cancel
              </button>
              {notes && !noteSaved && (
                <button
                  className='daily-tally__notes-clear'
                  onClick={() => { setDraftNotes(''); }}
                  title='Clear note'
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {groups.length === 0 ? (
        <div className='daily-tally__empty'>
          No sales recorded for {isToday ? 'today' : formatDateLabel(selectedDate)}.
        </div>
      ) : (
        <>
          <div className='daily-tally__table-wrap'>
            <table className='daily-tally__table'>
              <thead>
                <tr>
                  <th>OZ</th>
                  <th>ITEM</th>
                  <th>PRICE</th>
                  <th>QTY</th>
                  <th>SUBTOTAL</th>
                  <th>TOTAL / METHOD</th>
                  <th>CUSTOMER</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g, gi) => (
                  <React.Fragment key={g.key}>
                    {g.items.map((item, ii) => (
                      <tr
                        key={ii}
                        className={[
                          ii === 0                   ? 'daily-tally__row--first' : '',
                          ii === g.items.length - 1  ? 'daily-tally__row--last'  : '',
                          item.isAddOn               ? 'daily-tally__row--addon' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className='daily-tally__td-oz'>
                          {item.isAddOn ? <span className='daily-tally__addon-tree'>└</span> : item.size}
                        </td>
                        <td className='daily-tally__td-item'>
                          {item.isAddOn
                            ? <span className='daily-tally__addon-label'>+ {item.name}</span>
                            : item.name}
                        </td>
                        <td className='daily-tally__td-price'>₱{item.price.toFixed(2)}</td>
                        <td className='daily-tally__td-qty'>{item.qty}</td>
                        <td className='daily-tally__td-sub'>
                          {item.isAddOn ? <span className='daily-tally__addon-sub'>₱{item.subtotal.toFixed(2)}</span> : `₱${item.subtotal.toFixed(2)}`}
                        </td>

                        {ii === 0 && (
                          <td className='daily-tally__td-total' rowSpan={g.items.length}>
                            <div className='daily-tally__total-inner'>
                              <span className='daily-tally__total-val'>₱{g.total.toFixed(2)}</span>
                              <span className={`daily-tally__method-tag ${methodClass(g.methods)}`}>
                                {g.methods}
                              </span>
                            </div>
                          </td>
                        )}
                        {ii === 0 && (
                          <td className='daily-tally__td-customer' rowSpan={g.items.length}>
                            <span className='daily-tally__customer-name'>{g.customer}</span>
                            {g.address && (
                              <span className='daily-tally__address-tag'>{g.address}</span>
                            )}
                          </td>
                        )}
                        {ii === 0 && (
                          <td className='daily-tally__td-void' rowSpan={g.items.length}>
                            {pendingVoid === g.key ? (
                              <div className='daily-tally__void-confirm'>
                                <span className='daily-tally__void-confirm-label'>Reverse?</span>
                                <button
                                  className='daily-tally__void-yes'
                                  onClick={() => {
                                    voidOrder(g.orderNo, g.customer, g.time)
                                    setPendingVoid(null)
                                  }}
                                >
                                  Yes
                                </button>
                                <button
                                  className='daily-tally__void-cancel'
                                  onClick={() => setPendingVoid(null)}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                className='daily-tally__void-btn'
                                title='Reverse this order and restore stock'
                                onClick={() => setPendingVoid(g.key)}
                              >
                                ↩
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {gi < visibleGroups.length - 1 && (
                      <tr className='daily-tally__spacer'><td colSpan={8} /></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className='daily-tally__pagination'>
              <button
                className='daily-tally__page-btn'
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>

              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  className={`daily-tally__page-btn${page === p ? ' daily-tally__page-btn--active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}

              <button
                className='daily-tally__page-btn'
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>

              <span className='daily-tally__page-info'>
                {(page - 1) * CUSTOMERS_PER_PAGE + 1}–{Math.min(page * CUSTOMERS_PER_PAGE, groups.length)} of {groups.length} customers
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DailyTally
