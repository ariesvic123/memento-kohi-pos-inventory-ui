import React, { useEffect, useState } from 'react'

import { usePOS }          from '../../../../context/POSContext'
import { SellingPriceRow } from '../../../../config/utils/pos.types'

const DRINK_SIZE_COLS = [
  { label: '8oz',       key: 'Actual Price (8oz)',       costKey: '8oz'       },
  { label: '12oz',      key: 'Actual Price (12oz)',      costKey: '12oz'      },
  { label: '16oz',      key: 'Actual Price (16oz)',      costKey: '16oz'      },
  { label: 'Shots',     key: 'Actual Price (Shots)',     costKey: 'Shots'     },
  { label: 'Latte Art', key: 'Actual Price (Latte Art)', costKey: 'Latte Art' },
  { label: 'Slice',     key: 'Actual Price (Slice)',     costKey: 'Slice'     },
]

const COOKIE_SIZE_COLS = [
  { label: '60g', key: 'Actual Price (60g)', costKey: 'Cost (60g)' },
  { label: '70g', key: 'Actual Price (70g)', costKey: 'Cost (70g)' },
]

const marginColor = (pct: number) => {
  if (pct >= 60) return '#2e7d32'
  if (pct >= 40) return '#C4921E'
  return '#8B2020'
}

interface PricesTabProps { onDirtyChange?: (dirty: boolean) => void }

const PricesTab: React.FC<PricesTabProps> = ({ onDirtyChange }) => {
  const { sellingPrices, costing, updateSellingPrice } = usePOS()

  const [drafts,      setDrafts]      = useState<SellingPriceRow[]>([])
  const [saved,       setSaved]       = useState(false)
  const [showMargins, setShowMargins] = useState(false)
  const [isDirty,     setIsDirty]     = useState(false)

  useEffect(() => {
    setDrafts(sellingPrices.map((r) => ({ ...r })))
    setIsDirty(false)
    onDirtyChange?.(false)
  }, [sellingPrices.length])

  const setDraft = (i: number, key: string, val: number) => {
    setDrafts((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
    if (!isDirty) { setIsDirty(true); onDirtyChange?.(true) }
  }

  const handleSave = () => {
    drafts.forEach((d, i) => updateSellingPrice(i, d))
    setSaved(true)
    setIsDirty(false)
    onDirtyChange?.(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const drinks      = drafts.filter((r) => r.Category !== 'Food')
  const cookies     = drafts.filter((r) => r.Category === 'Food')
  const drinkStart  = 0
  const cookieStart = drinks.length

  const getCost = (drinkName: string, sizeKey: string): number | null => {
    const row = costing.find(
      (c) => String(c.Drinks ?? '').trim().toLowerCase() === drinkName.trim().toLowerCase()
    )
    if (!row) return null
    const v = parseFloat(String(row[sizeKey] ?? ''))
    return isNaN(v) || v === 0 ? null : v
  }

  // All cells are always inputtable — placeholder shows '—' when empty
  const priceCell = (row: SellingPriceRow, globalIdx: number, col: typeof DRINK_SIZE_COLS[0], isCookie = false) => {
    const raw   = row[col.key]
    const price = (raw === 'N/A' || raw === undefined) ? 0 : parseFloat(String(raw)) || 0

    let cost: number | null = null
    if (price > 0) {
      cost = isCookie
        ? (row[col.costKey] !== undefined && row[col.costKey] !== 'N/A'
            ? parseFloat(String(row[col.costKey])) || null
            : null)
        : getCost(String(row.Drinks ?? ''), col.costKey)
    }

    const profit = cost !== null && price > 0 ? price - cost : null
    const margin = cost !== null && price > 0 ? ((price - cost) / price) * 100 : null

    return (
      <td key={col.key} className='prices-tab__cell'>
        <input
          type='number'
          min={0}
          className='sheets-table__cell-input sheets-table__cell-input--price'
          value={price || ''}
          placeholder='—'
          onChange={(e) => setDraft(globalIdx, col.key, parseFloat(e.target.value) || 0)}
        />
        {showMargins && price > 0 && margin !== null && cost !== null && (
          <span className='prices-tab__margin' style={{ color: marginColor(margin) }}>
            {margin.toFixed(0)}% margin
            <span className='prices-tab__cost'>
              {profit !== null && ` · ₱${profit.toFixed(2)} profit`}
              {` · cost ₱${cost.toFixed(2)}`}
            </span>
          </span>
        )}
      </td>
    )
  }

  const legendItems = [
    { color: '#2e7d32', label: '≥ 60% Good'  },
    { color: '#C4921E', label: '40–59% Watch' },
    { color: '#8B2020', label: '< 40% Low'    },
  ]

  return (
    <div className='sheets-tab'>
      <div className='sheets-tab__toolbar'>
        <h2 className='sheets-tab__title'>Selling Prices</h2>

        <button
          className={`inventory__pill${showMargins ? ' inventory__pill--active' : ''}`}
          onClick={() => setShowMargins((v) => !v)}
        >
          📊 {showMargins ? 'Hide' : 'Show'} Margins
        </button>

        {showMargins && (
          <div className='prices-tab__legend'>
            {legendItems.map((l) => (
              <span key={l.label} className='prices-tab__legend-item'>
                <span className='prices-tab__legend-dot' style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}

        <button
          className='btn-primary'
          style={{ fontSize: '0.85rem', padding: '8px 16px', marginLeft: 'auto' }}
          onClick={handleSave}
        >
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Drinks */}
      <p className='prices-tab__section-label'>Drinks</p>
      <div className='sheets-table-wrap' style={{ marginBottom: 32 }}>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th>Drink</th>
              {DRINK_SIZE_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {drinks.map((row, i) => (
              <tr key={i}>
                <td>{String(row.Drinks ?? '')}</td>
                {DRINK_SIZE_COLS.map((col) => priceCell(row, drinkStart + i, col))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cookies */}
      <p className='prices-tab__section-label'>Cookies</p>
      <div className='sheets-table-wrap'>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th>Cookie</th>
              {COOKIE_SIZE_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {cookies.map((row, i) => (
              <tr key={i}>
                <td>{String(row.Drinks ?? '')}</td>
                {COOKIE_SIZE_COLS.map((col) => priceCell(row, cookieStart + i, col, true))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PricesTab
