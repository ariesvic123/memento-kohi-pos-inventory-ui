import React, { useMemo } from 'react'

import { CostingRow, SaleRow, SellingPriceRow } from '../../../../config/utils/pos.types'

interface Props {
  dailySales:    SaleRow[]
  sellingPrices: SellingPriceRow[]
  costing:       CostingRow[]
}

interface DrinkStat { name: string; qty: number }

const TOP_N = 3

const BestSellerCarousel: React.FC<Props> = ({ dailySales, sellingPrices, costing }) => {

  // Coffee = has a bean type (uses espresso) | Non-Coffee = no beans | Food = cookies
  const coffeeDrinks = useMemo(() => {
    const s = new Set<string>()
    costing.forEach((c) => {
      const bean = String(c['Bean Type'] ?? '').trim()
      if (bean && bean.toLowerCase() !== 'n/a') {
        s.add(String(c.Drinks ?? '').trim().toLowerCase())
      }
    })
    return s
  }, [costing])

  const foodDrinks = useMemo(() => {
    const s = new Set<string>()
    sellingPrices.forEach((r) => {
      if (String(r.Category ?? '').toLowerCase() === 'food') {
        s.add(String(r.Drinks ?? '').trim().toLowerCase())
      }
    })
    return s
  }, [sellingPrices])

  // Total qty sold per drink name (all time)
  const drinkTotals = useMemo(() => {
    const counts: Record<string, number> = {}
    dailySales.forEach((r) => {
      const key = r.Drink
      counts[key] = (counts[key] || 0) + r.Qty
    })
    return counts
  }, [dailySales])

  const getTop = (filter: (name: string) => boolean): DrinkStat[] =>
    Object.entries(drinkTotals)
      .filter(([name]) => filter(name.trim().toLowerCase()))
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, TOP_N)

  const CATEGORIES = [
    {
      key:   'coffee',
      label: 'Coffee',
      items: getTop((n) => coffeeDrinks.has(n) && !foodDrinks.has(n)),
    },
    {
      key:   'noncoffee',
      label: 'Non-Coffee',
      items: getTop((n) => !coffeeDrinks.has(n) && !foodDrinks.has(n)),
    },
    {
      key:   'cookies',
      label: 'Cookies',
      items: getTop((n) => foodDrinks.has(n)),
    },
  ]

  return (
    <div className='bs-section'>
      <h2 className='bs-section__heading'>Top Sellers</h2>
      <div className='bs-section__grid'>
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className='bs-card'>
            <div className='bs-card__header'>{cat.label}</div>
            {!cat.items.length ? (
              <p className='bs-card__empty'>No sales yet.</p>
            ) : (
              <ol className='bs-card__list'>
                {cat.items.map((item, i) => (
                  <li key={i} className='bs-card__item'>
                    <span className='bs-card__rank'>{i + 1}</span>
                    <span className='bs-card__name'>{item.name}</span>
                    <span className='bs-card__qty'>{item.qty} sold</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BestSellerCarousel
