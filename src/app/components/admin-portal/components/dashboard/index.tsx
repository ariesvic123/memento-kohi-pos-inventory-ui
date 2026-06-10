import React from 'react'

import { usePOS }             from '../../../../context/POSContext'
import MetricsOverview        from './MetricsOverview'
import PaymentBreakdown       from './PaymentBreakdown'
import DailyTally             from './DailyTally'
import BestSellerCarousel     from './BestSellerCarousel'
import RevenueTrendChart      from './RevenueTrendChart'
import RevenueByCategoryChart from './RevenueByCategoryChart'

const Dashboard: React.FC = () => {
  const { dailySales, sellingPrices, costing } = usePOS()

  return (
    <div className='dashboard'>
      {/* ── Compact metrics strip ── */}
      <MetricsOverview dailySales={dailySales} />

      {/* ── Cash vs GCash breakdown ── */}
      <PaymentBreakdown dailySales={dailySales} />

      {/* ── Charts row ── */}
      <div className='dashboard__charts-row'>
        <RevenueTrendChart      dailySales={dailySales} />
        <RevenueByCategoryChart dailySales={dailySales} sellingPrices={sellingPrices} costing={costing} />
      </div>

      {/* ── Sales record (table untouched) ── */}
      <DailyTally dailySales={dailySales} />

      {/* ── Best sellers ── */}
      <BestSellerCarousel dailySales={dailySales} sellingPrices={sellingPrices} costing={costing} />
    </div>
  )
}

export default Dashboard
