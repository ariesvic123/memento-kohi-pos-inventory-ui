import React from 'react'

import { SaleRow } from '../../../../config/utils/pos.types'

interface MetricsOverviewProps { dailySales: SaleRow[] }

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 })

const MetricsOverview: React.FC<MetricsOverviewProps> = ({ dailySales }) => {
  const totalRevenue  = dailySales.reduce((s, t) => s + (parseFloat(t.Revenue)  || 0), 0)
  const totalProfit   = dailySales.reduce((s, t) => s + (parseFloat(t.NetProfit) || 0), 0)
  const totalExpenses = totalRevenue - totalProfit
  const margin        = totalRevenue > 0 ? (totalProfit  / totalRevenue) * 100 : 0
  const expPct        = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0

  return (
    <div className='metrics-overview'>
      {/* ── Top row: revenue + three tiles ── */}
      <div className='metrics-overview__top'>
        <div className='metrics-overview__revenue-block'>
          <span className='metrics-overview__revenue-label'>All-Time Revenue</span>
          <span className='metrics-overview__revenue-val'>₱{fmt(totalRevenue)}</span>
        </div>

        <div className='metrics-overview__tiles'>
          <div className='metrics-overview__tile'>
            <span className='metrics-overview__tile-val metrics-overview__tile-val--exp'>₱{fmt(totalExpenses)}</span>
            <span className='metrics-overview__tile-label'>Expenses</span>
          </div>
          <div className='metrics-overview__tile-divider' />
          <div className='metrics-overview__tile'>
            <span className='metrics-overview__tile-val metrics-overview__tile-val--prof'>₱{fmt(totalProfit)}</span>
            <span className='metrics-overview__tile-label'>Net Profit</span>
          </div>
          <div className='metrics-overview__tile-divider' />
          <div className='metrics-overview__tile'>
            <span
              className='metrics-overview__tile-val'
              style={{ color: margin >= 40 ? '#2e7d32' : '#C4921E' }}
            >
              {margin.toFixed(1)}%
            </span>
            <span className='metrics-overview__tile-label'>Margin</span>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className='metrics-overview__bar-wrap'>
        <div className='metrics-overview__bar-track'>
          <div
            className='metrics-overview__bar-exp'
            style={{ width: `${Math.min(100, expPct)}%` }}
          />
          <div
            className='metrics-overview__bar-prof'
            style={{ width: `${Math.min(100, margin)}%` }}
          />
        </div>
        <div className='metrics-overview__bar-legend'>
          <span className='metrics-overview__bar-legend-item metrics-overview__bar-legend-item--exp'>
            <span className='metrics-overview__bar-dot metrics-overview__bar-dot--exp' />
            Expenses {expPct.toFixed(0)}%
          </span>
          <span className='metrics-overview__bar-legend-item metrics-overview__bar-legend-item--prof'>
            <span className='metrics-overview__bar-dot metrics-overview__bar-dot--prof' />
            Profit {margin.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default MetricsOverview
