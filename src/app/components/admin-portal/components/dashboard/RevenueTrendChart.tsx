import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

import { SaleRow } from '../../../../config/utils/pos.types'

interface RevenueTrendChartProps {
  dailySales: SaleRow[]
}

const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ dailySales }) => {
  const grouped: Record<string, number> = {}
  dailySales.forEach((sale) => {
    const date = sale.Date || 'Unknown'
    grouped[date] = (grouped[date] || 0) + Number(sale.Revenue || 0)
  })

  const chartData = Object.entries(grouped).map(([date, revenue]) => ({ date, revenue }))

  return (
    <div className='dashboard-card dashboard-card--chart'>
      <h3 className='dashboard-card__title'>Daily Revenue Trend</h3>
      <ResponsiveContainer width='100%' height={250}>
        <LineChart data={chartData}>
          <XAxis dataKey='date' />
          <YAxis />
          <Tooltip />
          <Line type='monotone' dataKey='revenue' stroke='#5c3a21' strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default RevenueTrendChart
