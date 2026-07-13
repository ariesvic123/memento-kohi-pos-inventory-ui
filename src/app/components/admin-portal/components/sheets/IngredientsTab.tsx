import React, { useEffect, useMemo, useRef, useState } from 'react'

import { usePOS } from '../../../../context/POSContext'

// ─── Reusable multi-select dropdown ──────────────────────────────────────────
interface MultiSelectProps {
  options:      string[]
  selected:     Set<string>
  onChange:     (next: Set<string>) => void
  allLabel:     string
  selectedLabel: (count: number) => string
}

const MultiSelectDropdown: React.FC<MultiSelectProps> = ({
  options, selected, onChange, allLabel, selectedLabel,
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (val: string) => {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onChange(next)
  }

  const label = selected.size === 0 ? allLabel : selectedLabel(selected.size)

  return (
    <div className='multi-select' ref={ref}>
      <button
        type='button'
        className={`multi-select__trigger${selected.size > 0 ? ' multi-select__trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <svg width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
          <path d='M1 1l4 4 4-4'/>
        </svg>
      </button>

      {open && (
        <div className='multi-select__menu'>
          {selected.size > 0 && (
            <button
              type='button'
              className='multi-select__clear'
              onClick={() => { onChange(new Set()); }}
            >
              Clear all
            </button>
          )}
          {options.map((opt) => (
            <label key={opt} className='multi-select__item'>
              <input
                type='checkbox'
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className='multi-select__check'
              />
              <span className='multi-select__option-label'>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const ROWS_PER_PAGE = 15

// Keys for the editable "Vol Used" columns
const VOL_KEYS = [
  '8oz ICED / vol',
  '8oz HOT / vol',
  '12oz (volume)',
  '16oz (volume)',
  'MASTER DOUGH (volume)',
] as const

type VolKey = typeof VOL_KEYS[number]
type VolDraft = Record<VolKey, number | null>

const num = (v: unknown): number | null => {
  if (v === 'N/A' || v === '' || v === undefined || v === null) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

const priceCell = (basePrice: number | null, vol: number | null, containerVol: number | null) => {
  if (basePrice === null || vol === null || containerVol === null || containerVol === 0) return '—'
  return `₱${((basePrice / containerVol) * vol).toFixed(2)}`
}

interface IngredientsTabProps { onDirtyChange?: (dirty: boolean) => void }

const IngredientsTab: React.FC<IngredientsTabProps> = ({ onDirtyChange }) => {
  const { rawIngredientsPricing, batchSaveIngredientPricing } = usePOS()
  const [catFilter,  setCatFilter]  = useState<Set<string>>(new Set())
  const [dtFilter,   setDtFilter]   = useState<Set<string>>(new Set())
  const [ingSearch,  setIngSearch]  = useState('')
  const [page,       setPage]       = useState(1)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setIngSearch(''); searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const [drafts,    setDrafts]    = useState<VolDraft[]>([])
  const [saved,     setSaved]     = useState(false)
  const [isDirty,   setIsDirty]   = useState(false)

  // Initialise / re-initialise drafts whenever the pricing data changes
  useEffect(() => {
    setDrafts(
      rawIngredientsPricing.map((row) => ({
        '8oz ICED / vol':      num(row['8oz ICED / vol']),
        '8oz HOT / vol':       num(row['8oz HOT / vol']),
        '12oz (volume)':       num(row['12oz (volume)']),
        '16oz (volume)':       num(row['16oz (volume)']),
        'MASTER DOUGH (volume)': num(row['MASTER DOUGH (volume)']),
      }))
    )
    setIsDirty(false)
    onDirtyChange?.(false)
  }, [rawIngredientsPricing.length])

  const setVol = (originalIdx: number, key: VolKey, val: string) => {
    const parsed = val === '' ? null : parseFloat(val)
    setDrafts((prev) =>
      prev.map((d, i) => i === originalIdx ? { ...d, [key]: isNaN(parsed as number) ? null : parsed } : d)
    )
    if (!isDirty) { setIsDirty(true); onDirtyChange?.(true) }
  }

  // Save all editable vol columns back to context and recompute drink costs.
  const handleSave = () => {
    const newPricing = rawIngredientsPricing.map((row, i) => {
      const d = drafts[i]
      if (!d) return row
      const patch: Record<string, unknown> = {}
      VOL_KEYS.forEach((key) => {
        patch[key] = d[key] !== null ? d[key] : 'N/A'
      })
      return { ...row, ...patch }
    })
    batchSaveIngredientPricing(newPricing)
    setSaved(true)
    setIsDirty(false)
    onDirtyChange?.(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const categories = useMemo(() => {
    const set = new Set(rawIngredientsPricing.map((r) => String(r.CATEGORY ?? '').trim()).filter(Boolean))
    return Array.from(set).sort()
  }, [rawIngredientsPricing])

  const drinkTypes = useMemo(() => {
    const set = new Set(
      rawIngredientsPricing
        .map((r) => String(r['DRINK TYPE'] ?? '').trim())
        .filter((v) => Boolean(v))   // keep N/A — user needs it for filtering base ingredients
    )
    return Array.from(set).sort()
  }, [rawIngredientsPricing])

  // Index-preserving filter — all three filters combined (AND logic)
  const filteredWithIndex = useMemo(() => {
    const term = ingSearch.trim().toLowerCase()
    return rawIngredientsPricing
      .map((r, i) => ({ row: r, i }))
      .filter(({ row }) => {
        if (catFilter.size > 0 && !catFilter.has(String(row.CATEGORY ?? '').trim())) return false
        const dt = String(row['DRINK TYPE'] ?? '').trim()
        if (dtFilter.size > 0 && !dtFilter.has(dt)) return false
        if (term && !String(row.INGREDIENTS ?? '').toLowerCase().includes(term)) return false
        return true
      })
  }, [rawIngredientsPricing, catFilter, dtFilter, ingSearch])

  const totalPages   = Math.max(1, Math.ceil(filteredWithIndex.length / ROWS_PER_PAGE))
  const visibleRows  = filteredWithIndex.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  useEffect(() => { setPage(1) }, [catFilter, dtFilter, ingSearch])

  // Vol input for editable cells
  const volInput = (originalIdx: number, key: VolKey) => {
    const draft = drafts[originalIdx]
    const val   = draft ? draft[key] : null
    return (
      <input
        type='number'
        min={0}
        step='any'
        className='sheets-table__cell-input'
        style={{ width: 64, textAlign: 'right' }}
        value={val !== null && val !== undefined ? val : ''}
        placeholder='—'
        onChange={(e) => setVol(originalIdx, key, e.target.value)}
      />
    )
  }

  return (
    <div className='sheets-tab'>
      <div className='sheets-tab__toolbar'>
        <h2 className='sheets-tab__title'>Ingredients Pricing</h2>
        <p className='sheets-tab__note'>
          Vol Used columns are editable — Price/cup updates automatically on Save.
        </p>

        {/* Ingredient search */}
        <div className='sheets-tab__search-wrap'>
          <span className='sheets-tab__search-icon'>
            <svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
              <circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/>
            </svg>
          </span>
          <input
            ref={searchRef}
            type='text'
            className='sheets-tab__search'
            placeholder='Search ingredient… ( / )'
            value={ingSearch}
            onChange={(e) => setIngSearch(e.target.value)}
          />
          {ingSearch && (
            <button className='sheets-tab__search-clear' onClick={() => setIngSearch('')}>✕</button>
          )}
        </div>

        {/* Category multi-select */}
        <MultiSelectDropdown
          options={categories}
          selected={catFilter}
          onChange={setCatFilter}
          allLabel='All Categories'
          selectedLabel={(n) => `${n} Categor${n === 1 ? 'y' : 'ies'}`}
        />

        {/* Drink Type multi-select */}
        <MultiSelectDropdown
          options={drinkTypes}
          selected={dtFilter}
          onChange={setDtFilter}
          allLabel='All Drink Types'
          selectedLabel={(n) => `${n} Drink Type${n === 1 ? '' : 's'}`}
        />

        <button
          className='btn-primary'
          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          onClick={handleSave}
        >
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      <div className='sheets-table-wrap sheets-table-wrap--scroll sheets-table-wrap--scroll-always'>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th rowSpan={2}>Ingredient</th>
              <th rowSpan={2}>Category</th>
              <th rowSpan={2}>Drink Type</th>
              <th rowSpan={2}>Container Vol</th>
              <th rowSpan={2}>Unit</th>
              <th rowSpan={2}>Base Price (₱)</th>
              <th colSpan={2} style={{ textAlign: 'center', background: '#e8d5c4' }}>8oz Iced</th>
              <th colSpan={2} style={{ textAlign: 'center', background: '#dce8d5' }}>8oz Hot</th>
              <th colSpan={2} style={{ textAlign: 'center', background: '#d5dce8' }}>12oz</th>
              <th colSpan={2} style={{ textAlign: 'center', background: '#e8d5e4' }}>16oz</th>
              <th colSpan={2} style={{ textAlign: 'center', background: '#e8e4c4' }}>Master Dough</th>
            </tr>
            <tr>
              <th style={{ background: '#f5ede4' }}>Vol used</th>
              <th style={{ background: '#f5ede4' }}>Price/cup</th>
              <th style={{ background: '#edf5e4' }}>Vol used</th>
              <th style={{ background: '#edf5e4' }}>Price/cup</th>
              <th style={{ background: '#e4edf5' }}>Vol used</th>
              <th style={{ background: '#e4edf5' }}>Price/cup</th>
              <th style={{ background: '#f5e4f0' }}>Vol used</th>
              <th style={{ background: '#f5e4f0' }}>Price/cup</th>
              <th style={{ background: '#f5f0e4' }}>Vol used</th>
              <th style={{ background: '#f5f0e4' }}>Price/batch</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, i }) => {
              const basePrice    = num(row['PRICE'])
              const containerVol = num(row['VOLUME'])
              const draft        = drafts[i]

              const v8i  = draft ? draft['8oz ICED / vol']      : num(row['8oz ICED / vol'])
              const v8h  = draft ? draft['8oz HOT / vol']       : num(row['8oz HOT / vol'])
              const v12  = draft ? draft['12oz (volume)']       : num(row['12oz (volume)'])
              const v16  = draft ? draft['16oz (volume)']       : num(row['16oz (volume)'])
              const vmd  = draft ? draft['MASTER DOUGH (volume)'] : num(row['MASTER DOUGH (volume)'])

              return (
                <tr key={i}>
                  <td><strong>{row.INGREDIENTS}</strong></td>
                  <td>{String(row.CATEGORY ?? '')}</td>
                  <td style={{ fontSize: '0.78rem', color: '#8b6f60' }}>{String(row['DRINK TYPE'] ?? '') || '—'}</td>
                  <td>{containerVol !== null ? containerVol.toFixed(2) : '—'}</td>
                  <td>{String(row['UNIT'] ?? '')}</td>
                  <td className='sheets-table__price-cell'>
                    {basePrice !== null ? `₱${basePrice.toFixed(2)}` : '—'}
                  </td>

                  {/* 8oz Iced */}
                  <td style={{ color: '#7a5020', padding: '4px 6px' }}>{volInput(i, '8oz ICED / vol')}</td>
                  <td style={{ color: '#5c3a10', fontWeight: 600 }}>{priceCell(basePrice, v8i, containerVol)}</td>

                  {/* 8oz Hot */}
                  <td style={{ color: '#3a6020', padding: '4px 6px' }}>{volInput(i, '8oz HOT / vol')}</td>
                  <td style={{ color: '#1e5010', fontWeight: 600 }}>{priceCell(basePrice, v8h, containerVol)}</td>

                  {/* 12oz */}
                  <td style={{ color: '#204070', padding: '4px 6px' }}>{volInput(i, '12oz (volume)')}</td>
                  <td style={{ color: '#102858', fontWeight: 600 }}>{priceCell(basePrice, v12, containerVol)}</td>

                  {/* 16oz */}
                  <td style={{ color: '#601060', padding: '4px 6px' }}>{volInput(i, '16oz (volume)')}</td>
                  <td style={{ color: '#400840', fontWeight: 600 }}>{priceCell(basePrice, v16, containerVol)}</td>

                  {/* Master Dough */}
                  <td style={{ color: '#5a4a10', padding: '4px 6px' }}>{volInput(i, 'MASTER DOUGH (volume)')}</td>
                  <td style={{ color: '#3a2e00', fontWeight: 600 }}>{priceCell(basePrice, vmd, containerVol)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className='sheets-tab__pagination'>
          <button className='daily-tally__page-btn' disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
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

export default IngredientsTab
