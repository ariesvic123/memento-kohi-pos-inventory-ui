import React, { useEffect, useMemo, useState } from 'react'

import { usePOS }               from '../../../../context/POSContext'
import { RestockEntry }         from '../../../../config/utils/pos.types'
import { excelSerialToDateStr } from '../../../../config/utils/pos.helpers'
import AddRestockModal          from '../modals/AddRestockModal'

const ROWS_PER_PAGE = 15

const RestockTab: React.FC = () => {
  const { restockRows } = usePOS()
  const [modalOpen,     setModalOpen]     = useState(false)
  const [selectedDate,  setSelectedDate]  = useState<string>('all')
  const [search,        setSearch]        = useState('')
  const [page,          setPage]          = useState(1)
  const [editEntry,     setEditEntry]     = useState<RestockEntry | undefined>(undefined)
  const [editIndex,     setEditIndex]     = useState<number | undefined>(undefined)

  const sorted = useMemo(
    () => [...restockRows].sort((a, b) => b.Date - a.Date),
    [restockRows]
  )

  // Unique dates newest-first for the dropdown
  const availableDates = useMemo(() => {
    const set = new Set(sorted.map((r) => excelSerialToDateStr(r.Date)))
    return Array.from(set)
  }, [sorted])

  // Filter by date + search
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sorted.filter((r) => {
      if (selectedDate !== 'all' && excelSerialToDateStr(r.Date) !== selectedDate) return false
      if (term && !r.Item.toLowerCase().includes(term) && !r.Supplier.toLowerCase().includes(term)) return false
      return true
    })
  }, [sorted, selectedDate, search])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
  const visibleRows = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  useEffect(() => { setPage(1) }, [selectedDate, search])

  const handleEditClick = (entry: RestockEntry) => {
    // Find the true index in the unfiltered restockRows array
    const idx = restockRows.findIndex((r) =>
      r.Date === entry.Date &&
      r.Item === entry.Item &&
      r['Volume/Weight'] === entry['Volume/Weight'] &&
      r.QTY === entry.QTY &&
      r.Price === entry.Price
    )
    setEditEntry(entry)
    setEditIndex(idx === -1 ? undefined : idx)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setEditEntry(undefined)
    setEditIndex(undefined)
  }

  return (
    <div className='sheets-tab'>
      {/* Toolbar */}
      <div className='sheets-tab__toolbar'>
        <h2 className='sheets-tab__title'>Restock History</h2>

        {/* Date filter */}
        <select
          className='daily-tally__date-select'
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        >
          <option value='all'>All Dates</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Search */}
        <div className='sheets-tab__search-wrap'>
          <span className='sheets-tab__search-icon'><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/></svg></span>
          <input
            type='text'
            className='sheets-tab__search'
            placeholder='Item or supplier…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className='sheets-tab__search-clear' onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <button
          className='btn-primary'
          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          onClick={() => { setEditEntry(undefined); setEditIndex(undefined); setModalOpen(true) }}
        >
          + Add Restock
        </button>
      </div>

      <AddRestockModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        {...(editEntry !== undefined && editIndex !== undefined
          ? { editEntry, editIndex }
          : {})}
      />

      <div className='sheets-table-wrap sheets-table-wrap--scroll'>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Vol/Wt</th>
              <th>Unit</th>
              <th>QTY</th>
              <th>Price</th>
              <th>Total</th>
              <th>Method</th>
              <th>Supplier</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#a08070' }}>No records match.</td></tr>
            )}
            {visibleRows.map((r, i) => (
              <tr key={i} className='restock-row'>
                <td>{excelSerialToDateStr(r.Date)}</td>
                <td>{r.Item}</td>
                <td>{r['Volume/Weight']}</td>
                <td>{r.unit}</td>
                <td>{r.QTY}</td>
                <td>₱{Number(r.Price).toFixed(2)}</td>
                <td>₱{Number(r.Total).toFixed(2)}</td>
                <td>{r.Method}</td>
                <td>{r.Supplier || '—'}</td>
                <td>
                  <button
                    className='restock-row__edit-btn'
                    onClick={() => handleEditClick(r)}
                    title='Edit this restock entry'
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='sheets-tab__pagination'>
          <button className='daily-tally__page-btn' disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`daily-tally__page-btn${page === p ? ' daily-tally__page-btn--active' : ''}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button className='daily-tally__page-btn' disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
          <span className='daily-tally__page-info'>
            {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
          </span>
        </div>
      )}
    </div>
  )
}

export default RestockTab
