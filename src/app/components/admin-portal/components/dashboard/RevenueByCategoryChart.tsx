import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

import { CostingRow, SaleRow, SellingPriceRow } from '../../../../config/utils/pos.types'

interface Props {
  dailySales:    SaleRow[]
  sellingPrices: SellingPriceRow[]
  costing:       CostingRow[]
}

const COLORS = {
  Coffee:     '#3D1E0A',
  NonCoffee:  '#C4921E',
  Food:       '#7B3E18',
}

const RevenueByCategoryChart: React.FC<Props> = ({ dailySales, sellingPrices, costing }) => {
  const coffeeDrinks = useMemo(() => {
    const s = new Set<string>()
    costing.forEach((c) => {
      if (String(c['Bean Type'] ?? '').trim().toLowerCase() !== 'n/a')
        s.add(String(c.Drinks ?? '').trim().toLowerCase())
    })
    return s
  }, [costing])

  const foodDrinks = useMemo(() => {
    const s = new Set<string>()
    sellingPrices.forEach((r) => {
      if (String(r.Category ?? '').toLowerCase() === 'food')
        s.add(String(r.Drinks ?? '').trim().toLowerCase())
    })
    return s
  }, [sellingPrices])

  // Revenue per category per day
  const chartData = useMemo(() => {
    const byDate: Record<string, { Coffee: number; NonCoffee: number; Food: number }> = {}
    dailySales.forEach((s) => {
      const date = s.Date || 'Unknown'
      if (!byDate[date]) byDate[date] = { Coffee: 0, NonCoffee: 0, Food: 0 }
      const rev  = parseFloat(String(s.Revenue || 0))
      const name = s.Drink.trim().toLowerCase()
      if (foodDrinks.has(name))         byDate[date].Food      += rev
      else if (coffeeDrinks.has(name))  byDate[date].Coffee    += rev
      else                              byDate[date].NonCoffee += rev
    })
    return Object.entries(byDate)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, vals]) => ({ date, ...vals }))
  }, [dailySales, coffeeDrinks, foodDrinks])

  // All-time totals for the summary chips
  const totals = useMemo(() => {
    const t = { Coffee: 0, NonCoffee: 0, Food: 0 }
    chartData.forEach((d) => { t.Coffee += d.Coffee; t.NonCoffee += d.NonCoffee; t.Food += d.Food })
    return t
  }, [chartData])

  const grand = totals.Coffee + totals.NonCoffee + totals.Food

  if (!chartData.length) return null

  return (
    <div className='dashboard-card'>
      <h3 className='dashboard-card__title'>Revenue by Category</h3>

      <div className='rev-cat__chips'>
        {([['Coffee', COLORS.Coffee], ['Non-Coffee', COLORS.NonCoffee], ['Food', COLORS.Food]] as [string, string][]).map(([label, color]) => {
          const key = label.replace('-', '') as 'Coffee' | 'NonCoffee' | 'Food'
          const pct = grand > 0 ? (totals[key] / grand * 100).toFixed(0) : '0'
          return (
            <div key={label} className='rev-cat__chip' style={{ borderColor: color }}>
              <span className='rev-cat__chip-dot' style={{ background: color }} />
              <span className='rev-cat__chip-label'>{label}</span>
              <span className='rev-cat__chip-val'>₱{totals[key].toFixed(2)}</span>
              <span className='rev-cat__chip-pct'>{pct}%</span>
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width='100%' height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey='date' tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `₱${v.toFixed(2)}`} />
          <Legend />
          <Bar dataKey='Coffee'    fill={COLORS.Coffee}    radius={[3, 3, 0, 0]} />
          <Bar dataKey='NonCoffee' name='Non-Coffee' fill={COLORS.NonCoffee} radius={[3, 3, 0, 0]} />
          <Bar dataKey='Food'      fill={COLORS.Food}      radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default RevenueByCategoryChart
