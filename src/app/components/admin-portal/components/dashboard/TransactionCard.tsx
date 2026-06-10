import React from 'react'

import { SaleRow } from '../../../../config/utils/pos.types'

interface TransactionGroup {
  key:      string
  Date:     string
  Time:     string
  Customer: string
  Method:   string
  items:    SaleRow[]
}

interface TransactionCardProps {
  transaction: TransactionGroup
}

const TransactionCard: React.FC<TransactionCardProps> = ({ transaction }) => {
  const totalRevenue = transaction.items.reduce(
    (sum, item) =>
      sum + (parseFloat(item.Revenue) || parseFloat(String(item.Price || 0)) * parseFloat(String(item.Qty || 0))),
    0
  )
  const totalProfit = transaction.items.reduce(
    (sum, item) => sum + (parseFloat(item.NetProfit) || 0),
    0
  )

  return (
    <div className='tx-card'>
      <div className='tx-card__header'>
        <div>
          <div className='tx-card__customer'>{transaction.Customer || 'Guest'}</div>
          <div className='tx-card__meta'>
            {transaction.Date} • {transaction.Time} • {transaction.Method}
          </div>
        </div>
        <div className='tx-card__summary'>
          <div className='tx-card__revenue'>₱{totalRevenue.toFixed(2)}</div>
          <div className='tx-card__profit'>+₱{totalProfit.toFixed(2)}</div>
        </div>
      </div>

      <div className='tx-card__divider' />

      {transaction.items.map((item, i) => {
        const qty     = parseFloat(String(item.Qty  || 0))
        const price   = parseFloat(String(item.Price|| 0))
        const revenue = parseFloat(item.Revenue) || qty * price
        const profit  = parseFloat(item.NetProfit || '0')
        const margin  = revenue > 0 ? (profit / revenue) * 100 : 0

        return (
          <div key={i} className='tx-card__item'>
            <span className='tx-card__item-name'>{qty}× {item.Drink} ({item.Size})</span>
            <span className='tx-card__item-metrics'>₱{revenue.toFixed(2)} • {margin.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}

export default TransactionCard
