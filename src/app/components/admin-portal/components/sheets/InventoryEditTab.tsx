import React, { useEffect, useMemo, useRef, useState } from 'react'

import { usePOS }                   from '../../../../context/POSContext'
import { InventoryItem, resolveUnit } from '../../../../config/utils/pos.types'

type Draft = Pick<InventoryItem, 'CATEGORY' | 'BOX_SIZE' | 'CONTAINER'> & { stock: number }

const ROWS_PER_PAGE = 15

interface InventoryEditTabProps { onDirtyChange?: (dirty: boolean) => void }

const InventoryEditTab: React.FC<InventoryEditTabProps> = ({ onDirtyChange }) => {
  const { inventory, updateInventoryItem } = usePOS()

  const [drafts,    setDrafts]    = useState<Draft[]>([])
  const [saved,     setSaved]     = useState(false)
  const [isDirty,   setIsDirty]   = useState(false)
  const [catFilter, setCatFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch(''); searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    setDrafts(inventory.map((item) => ({
      CATEGORY:  String(item.CATEGORY  ?? ''),
      BOX_SIZE:  Number(item.BOX_SIZE  ?? 0),
      CONTAINER: String(item.CONTAINER ?? ''),
      stock:     typeof item.stock === 'number' ? item.stock : parseFloat(String(item.STOCKS ?? item.VOLUME ?? 0)),
    })))
    setIsDirty(false)
    onDirtyChange?.(false)
  }, [inventory.length])

  const setDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
    if (!isDirty) { setIsDirty(true); onDirtyChange?.(true) }
  }

  // Save always applies to ALL rows regardless of current filter/page
  const handleSave = () => {
    drafts.forEach((d, i) => updateInventoryItem(i, {
      CATEGORY:  String(d.CATEGORY  ?? ''),
      BOX_SIZE:  Number(d.BOX_SIZE  ?? 0),
      CONTAINER: String(d.CONTAINER ?? ''),
      stock:     Number(d.stock     ?? 0),
    }))
    setSaved(true)
    setIsDirty(false)
    onDirtyChange?.(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const categories = useMemo(() => {
    const set = new Set(inventory.map((item) => String(item.CATEGORY ?? '').trim()).filter(Boolean))
    return Array.from(set).sort()
  }, [inventory])

  // Index-preserving filter — we need the original index for drafts
  const filteredWithIndex = useMemo(() => {
    const term = search.trim().toLowerCase()
    return inventory
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => {
        if (catFilter !== 'all' && String(item.CATEGORY ?? '').trim() !== catFilter) return false
        if (term && !String(item.INGREDIENTS ?? '').toLowerCase().includes(term)) return false
        return true
      })
  }, [inventory, catFilter, search])

  const totalPages  = Math.max(1, Math.ceil(filteredWithIndex.length / ROWS_PER_PAGE))
  const visibleRows = filteredWithIndex.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  useEffect(() => { setPage(1) }, [catFilter, search])

  return (
    <div className='sheets-tab'>
      <div className='sheets-tab__toolbar'>
        <h2 className='sheets-tab__title'>Inventory View</h2>
        <p className='sheets-tab__note'>
          Stock is read-only. Only Category, BOX_SIZE, and Container label are editable.
        </p>

        {/* Search */}
        <div className='sheets-tab__search-wrap'>
          <span className='sheets-tab__search-icon'><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/></svg></span>
          <input
            ref={searchRef}
            type='text'
            className='sheets-tab__search'
            placeholder='Search ingredient… ( / )'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className='sheets-tab__search-clear' onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <button
          className={`btn-primary${saved ? ' btn-primary--saved' : ''}`}
          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          onClick={handleSave}
        >
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Category pills */}
      <div className='inventory__filter-pills' style={{ marginBottom: '12px' }}>
        <button
          className={`inventory__pill${catFilter === 'all' ? ' inventory__pill--active' : ''}`}
          onClick={() => setCatFilter('all')}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`inventory__pill${catFilter === cat ? ' inventory__pill--active' : ''}`}
            onClick={() => setCatFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className='sheets-table-wrap sheets-table-wrap--scroll'>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Unit</th>
              <th>BOX_SIZE</th>
              <th>Container label</th>
              <th>Last Restock</th>
              <th>Last Qty</th>
            </tr>
          </thead>
          <tbody>
            {filteredWithIndex.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#a08070' }}>No items match.</td></tr>
            )}
            {visibleRows.map(({ item, i }) => {
              const draft = drafts[i] ?? { CATEGORY: '', BOX_SIZE: 0, CONTAINER: '' }
              const unit  = resolveUnit(item)
              return (
                <tr key={i}>
                  <td>{item.INGREDIENTS}</td>
                  <td>
                    <input
                      type='text'
                      className='sheets-table__cell-input'
                      value={draft.CATEGORY ?? ''}
                      onChange={(e) => setDraft(i, { CATEGORY: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type='number'
                      min={0}
                      step='any'
                      className='sheets-table__cell-input sheets-table__cell-input--stock'
                      style={{ color: (draft.stock ?? 0) <= 0 ? '#d32f2f' : 'inherit', fontWeight: 600 }}
                      value={draft.stock ?? ''}
                      onChange={(e) => setDraft(i, { stock: parseFloat(e.target.value) || 0 })}
                    />
                    {unit && <span style={{ fontSize: '0.75rem', color: '#a08070', marginLeft: 4 }}>{unit}</span>}
                  </td>
                  <td>{unit}</td>
                  <td>
                    <input
                      type='number'
                      min={0}
                      className='sheets-table__cell-input'
                      value={draft.BOX_SIZE || ''}
                      onChange={(e) => setDraft(i, { BOX_SIZE: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type='text'
                      className='sheets-table__cell-input'
                      placeholder='box, bag, can…'
                      value={draft.CONTAINER ?? ''}
                      onChange={(e) => setDraft(i, { CONTAINER: e.target.value })}
                    />
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#a08070' }}>{item.LAST_RESTOCK_DATE ?? '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#5c8a5c' }}>
                    {item.LAST_RESTOCK_QTY !== undefined
                      ? `+${Number(item.LAST_RESTOCK_QTY).toLocaleString()} ${unit}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
            {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, filteredWithIndex.length)} of {filteredWithIndex.length}
          </span>
        </div>
      )}
    </div>
  )
}

export default InventoryEditTab
