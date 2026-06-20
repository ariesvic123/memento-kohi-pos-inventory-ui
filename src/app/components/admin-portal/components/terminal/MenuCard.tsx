import React, { useState } from 'react'

import { CartItem, CostingRow, DrinkSize, InventoryItem, SellingPriceRow } from '../../../../config/utils/pos.types'
import { isDrinkOutOfStock } from '../../../../config/utils/pos.helpers'

interface MenuCardProps {
  drink:        SellingPriceRow
  costing:      CostingRow[]
  inventory:    InventoryItem[]
  isBestSeller: boolean
  onSelectItem: (item: CartItem) => void
}

// Logo-derived palette: espresso → latte gold → cream
const SIZE_BACKGROUNDS: Record<DrinkSize, string> = {
  '8oz':    '#F5ECD6',   // foam cream (hot only)
  '12oz':   '#EDD9A8',   // latte cream
  '16oz':   '#C4921E',   // 珈琲 gold (largest size = boldest)
  'unit':   '#E8F0E4',   // fresh sage (add-ons)
  '75g':    '#E8DCC8',   // cookie warm
  'bundle': '#FFE8A0',   // bundle amber
}

const DRINK_SIZES:  DrinkSize[] = ['8oz', '12oz', '16oz']
const COOKIE_SIZES: DrinkSize[] = ['75g']

const parsePrice = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

const MenuCard: React.FC<MenuCardProps> = ({ drink, costing, inventory, isBestSeller, onSelectItem }) => {
  const drinkName = String(drink.Drinks ?? '')

  // Derive temperature availability from actual prices, not from name heuristics.
  // 8oz = hot size; 12oz/16oz = iced sizes.
  const has8oz  = parsePrice(drink['Actual Price (8oz)'])  > 0
  const hasIced = parsePrice(drink['Actual Price (12oz)']) > 0 || parsePrice(drink['Actual Price (16oz)']) > 0
  const tempMode: 'iced-only' | 'hot-only' | 'both' =
    has8oz && hasIced ? 'both' :
    has8oz            ? 'hot-only' :
    hasIced           ? 'iced-only' :
    'both'

  const [temp, setTemp] = useState<'hot' | 'iced'>(tempMode === 'hot-only' ? 'hot' : 'iced')

  const isOutOfStock = isDrinkOutOfStock(drinkName, inventory, costing)

  const costRow = costing.find(
    (c) => String(c.Drinks ?? '').trim().toLowerCase() === drinkName.trim().toLowerCase()
  )

  const hasDrinkSizes  = DRINK_SIZES.some((sz)  => parsePrice(drink[`Actual Price (${sz})`]) > 0)
  const hasCookieSizes = COOKIE_SIZES.some((sz) => parsePrice(drink[`Actual Price (${sz})`]) > 0)
  const unitPrice      =
    parsePrice(drink['Actual Price (Shots)'])     ||
    parsePrice(drink['Actual Price (Latte Art)']) ||
    parsePrice(drink['Actual Price (Slice)'])     ||
    parsePrice(drink['Actual Price'])

  if (!hasDrinkSizes && !hasCookieSizes && !unitPrice) return null

  const getCost = (sz: DrinkSize): number => {
    if (sz === '75g')  return parsePrice(drink['Cost (75g)'])
    if (sz === 'unit') {
      if (!costRow) return 0
      return (
        parsePrice(costRow['Shots'])     ||
        parsePrice(costRow['Latte Art']) ||
        parsePrice(costRow['Slice'])     ||
        0
      )
    }
    return costRow ? parsePrice(costRow[sz]) : 0
  }

  const handleClick = (sz: DrinkSize, price: number) => {
    if (isOutOfStock) return
    const base = { name: drinkName, size: sz, price, cost: getCost(sz), qty: 1 }
    onSelectItem(hasDrinkSizes ? { ...base, temperature: temp } : base)
  }

  const renderSizeBtn = (sz: DrinkSize, price: number, label: string) => {
    if (!price) return null
    const cost        = getCost(sz)
    const profitAmt   = price - cost
    const profitPct   = price > 0 ? (profitAmt / price) * 100 : 0
    const isLowProfit = profitPct < 40
    const showMargin  = cost > 0

    return (
      <button
        key={sz}
        disabled={isOutOfStock}
        className='menu-card__size-btn'
        style={{
          background: isOutOfStock ? '#d9d9d9' : SIZE_BACKGROUNDS[sz],
          color:      sz === '16oz' ? '#1A0A04' : undefined,   // dark text on gold 16oz
          opacity:    isOutOfStock ? 0.5 : 1,
          cursor:     isOutOfStock ? 'not-allowed' : 'pointer',
        }}
        onClick={() => handleClick(sz, price)}
      >
        <span className='menu-card__size-row'>
          <b>{label}</b>
          <span>₱{price}</span>
        </span>
        {showMargin && (
          <span className='menu-card__margin'>
            +₱{profitAmt.toFixed(1)} (
            <span style={{ color: isLowProfit ? '#e53935' : '#43a047' }}>
              {profitPct.toFixed(0)}%
            </span>
            ) Profit
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={`menu-card${isBestSeller ? ' menu-card--best-seller' : ''}`}>
      {isBestSeller && <span className='menu-card__badge'>BEST SELLER</span>}
      <p className='menu-card__name'>{drinkName}</p>

      {/* Temperature toggle — only for drink sizes, not cookies/unit */}
      {hasDrinkSizes && tempMode === 'both' && (
        <div className='menu-card__temp-toggle'>
          <button
            className={`menu-card__temp-btn${temp === 'iced' ? ' menu-card__temp-btn--active' : ''}`}
            onClick={() => setTemp('iced')}
          >
            Iced
          </button>
          <button
            className={`menu-card__temp-btn${temp === 'hot' ? ' menu-card__temp-btn--active-hot' : ''}`}
            onClick={() => setTemp('hot')}
          >
            Hot
          </button>
        </div>
      )}
      {hasDrinkSizes && tempMode === 'hot-only'  && <div className='menu-card__temp-badge menu-card__temp-badge--hot'>Hot only</div>}
      {hasDrinkSizes && tempMode === 'iced-only' && <div className='menu-card__temp-badge menu-card__temp-badge--iced'>Iced only</div>}

      {hasDrinkSizes && DRINK_SIZES
        .filter((sz) => {
          if (!hasDrinkSizes) return false
          // Hot → 8oz only | Iced → 12oz + 16oz only
          if (temp === 'hot')  return sz === '8oz'
          if (temp === 'iced') return sz !== '8oz'
          return true
        })
        .map((sz) => renderSizeBtn(sz, parsePrice(drink[`Actual Price (${sz})`]), sz))}
      {hasCookieSizes && COOKIE_SIZES.map((sz) => renderSizeBtn(sz, parsePrice(drink[`Actual Price (${sz})`]), sz))}
      {!hasDrinkSizes && !hasCookieSizes && unitPrice > 0 && renderSizeBtn('unit', unitPrice, '1 pc')}
    </div>
  )
}

export default MenuCard
