import React, { useMemo, useState, useRef, useEffect } from 'react'

import { usePOS }      from '../../../../context/POSContext'
import { resolveUnit } from '../../../../config/utils/pos.types'

const stockoutLabel = (daysLeft: number | null): { text: string; cls: string } | null => {
  if (daysLeft === null) return null
  if (daysLeft <= 1)  return { text: 'Runs out today!', cls: 'inventory-card__stockout--critical' }
  if (daysLeft <= 3)  return { text: `~${daysLeft}d left`, cls: 'inventory-card__stockout--warn' }
  if (daysLeft <= 7)  return { text: `~${daysLeft}d left`, cls: 'inventory-card__stockout--caution' }
  return { text: `~${daysLeft}d`, cls: 'inventory-card__stockout--ok' }
}

const BAR_COLORS = {
  out:      '#5C1A1A',
  critical: '#8B2020',
  low:      '#C4921E',
  healthy:  '#3D1E0A',
}

type FilterMode = 'all' | 'in' | 'out'

const Inventory: React.FC = () => {
  const { inventory, dailySales } = usePOS()

  // Number of unique days we have sales data for (minimum 1 to avoid division by zero)
  const salesDays = useMemo(() => {
    const days = new Set(dailySales.map((s) => s.Date).filter(Boolean))
    return Math.max(1, days.size)
  }, [dailySales])
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
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

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase()
    return inventory
      .filter((item) => {
        const stock = typeof item.stock === 'number'
          ? item.stock
          : parseFloat(String(item.STOCKS ?? item.VOLUME ?? 0))
        if (filter === 'out') return stock <= 0
        if (filter === 'in')  return stock > 0
        return true
      })
      .filter((item) => {
        if (!term) return true
        return String(item.INGREDIENTS || item.name || '').toLowerCase().includes(term)
      })
  }, [inventory, filter, search])

  if (!inventory.length) {
    return (
      <div className='inventory'>
        <h1 className='inventory__heading'>Inventory Analytics</h1>
        <div className='dashboard-card'>No inventory data loaded.</div>
      </div>
    )
  }

  const pluralize = (word: string, n: number): string => {
    if (n === 1) return word
    const irregular: Record<string, string> = { box: 'boxes' }
    return irregular[word.toLowerCase()] ?? word + 's'
  }

  return (
    <div className='inventory'>
      {/* ── Header + controls ── */}
      <div className='inventory__header-row'>
        <h1 className='inventory__heading'>Inventory Analytics</h1>

        <div className='inventory__controls'>
          {/* Search */}
          <div className='inventory__search-wrap'>
            <span className='inventory__search-icon'><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/></svg></span>
            <input
              type='text'
              ref={searchRef}
              className='inventory__search'
              placeholder='Search item… ( / )'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className='inventory__search-clear' onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* Filter pills */}
          <div className='inventory__filter-pills'>
            {(['all', 'in', 'out'] as FilterMode[]).map((f) => (
              <button
                key={f}
                className={`inventory__pill${filter === f ? ' inventory__pill--active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'in' ? 'In Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {displayed.length === 0 && (
        <div className='inventory__empty'>No items match your filter.</div>
      )}

      <div className='inventory__grid'>
        {displayed.map((item, i) => {
          const name  = String(item.INGREDIENTS || item.name || '')
          const stock = typeof item.stock === 'number'
            ? item.stock
            : parseFloat(String(item.STOCKS ?? item.VOLUME ?? 0))

          const originalStock = typeof item.originalStock === 'number'
            ? item.originalStock
            : stock

          const percentage = originalStock > 0 ? (stock / originalStock) * 100 : 0

          const isOut      = stock <= 0
          const isCritical = percentage > 0  && percentage <= 10   // task 2: 10%
          const isLow      = percentage > 10 && percentage <= 40

          const barColor = isOut      ? BAR_COLORS.out
            : isCritical ? BAR_COLORS.critical
            : isLow      ? BAR_COLORS.low
            : BAR_COLORS.healthy

          const unit      = resolveUnit(item)
          const boxSize   = typeof item.BOX_SIZE  === 'number' && item.BOX_SIZE  > 0 ? item.BOX_SIZE  : null
          const container = typeof item.CONTAINER === 'string' && item.CONTAINER       ? item.CONTAINER : null
          const boxesLeft = boxSize ? stock / boxSize : null

          // Task 6: human-readable container display
          const containerLabel = boxesLeft !== null && container
            ? boxesLeft < 1
              ? `less than 1 ${container}`
              : `≈ ${boxesLeft.toFixed(1)} ${pluralize(container, Math.floor(boxesLeft))}`
            : null

          // Task 6: container badge — "1890ml = 1 bottle"
          const containerBadge = boxSize && unit && container
            ? `${boxSize}${unit} = 1 ${container}`
            : null

          // Projected stockout
          const consumed   = Math.max(0, originalStock - stock)
          const dailyRate  = consumed / salesDays
          const daysLeft   = !isOut && dailyRate > 0 ? Math.round(stock / dailyRate) : null
          const stockoutInfo = stockoutLabel(daysLeft)

          return (
            <div
              key={i}
              className={[
                'inventory-card',
                isOut      ? 'inventory-card--out'      : '',
                isCritical ? 'inventory-card--critical' : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Task 6: container size badge top-right */}
              {containerBadge && (
                <div className={`inventory-card__container-badge${isOut ? ' inventory-card__container-badge--shift' : ''}`}>
                  {containerBadge}
                </div>
              )}

              {/* Task 2: out-of-stock red dot */}
              {isOut && <div className='inventory-card__out-dot' />}

              <div className='inventory-card__name'>{name}</div>

              {/* Task 4: 2 decimal places; Task 6: human-readable primary display */}
              <div
                className='inventory-card__stock'
                style={{
                  color: isOut ? BAR_COLORS.out
                    : isCritical ? BAR_COLORS.critical
                    : isLow      ? BAR_COLORS.low
                    : 'inherit',
                }}
              >
                {containerLabel ?? (
                  <>
                    {stock.toFixed(2)}
                    {unit && <span className='inventory-card__unit'>{unit}</span>}
                  </>
                )}
              </div>

              {/* Show raw number as subtitle when container label is used */}
              {containerLabel && (
                <div className='inventory-card__stock-raw'>
                  {stock.toFixed(2)}{unit && ` ${unit}`}
                </div>
              )}

              <div className='inventory-card__bar-track'>
                <div
                  className='inventory-card__bar-fill'
                  style={{
                    width:      `${Math.max(0, Math.min(100, percentage))}%`,
                    background: barColor,
                  }}
                />
              </div>

              {isOut      && <p className='inventory-card__status inventory-card__status--out'>Out of stock</p>}
              {isCritical && !isOut && <p className='inventory-card__status inventory-card__status--critical'>Critical stock level</p>}
              {isLow      && !isCritical && <p className='inventory-card__status inventory-card__status--low'>Low stock</p>}

              {stockoutInfo && (
                <div className={`inventory-card__stockout ${stockoutInfo.cls}`}>
                  ⏱ {stockoutInfo.text}
                </div>
              )}

              {item.LAST_RESTOCK_DATE && (
                <div className='inventory-card__restock'>
                  <span className='inventory-card__restock-label'>Last restock</span>
                  <span className='inventory-card__restock-date'>{String(item.LAST_RESTOCK_DATE)}</span>
                  {item.LAST_RESTOCK_QTY !== undefined && (
                    <span className='inventory-card__restock-qty'>
                      +{Number(item.LAST_RESTOCK_QTY).toFixed(2)}{unit && ` ${unit}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Inventory
