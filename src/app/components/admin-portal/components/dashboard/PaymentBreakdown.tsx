import React from 'react'

import { SaleRow } from '../../../../config/utils/pos.types'

interface PaymentBreakdownProps {
  dailySales: SaleRow[]
}

interface MethodStats {
  revenue:  number
  expenses: number
  profit:   number
  txCount:  number
  margin:   number
}

const fmt   = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
const empty = (): MethodStats => ({ revenue: 0, expenses: 0, profit: 0, txCount: 0, margin: 0 })

const PaymentBreakdown: React.FC<PaymentBreakdownProps> = ({ dailySales }) => {
  const cash  = empty()
  const gcash = empty()

  // count distinct transactions per method
  const txKeys = { CASH: new Set<string>(), GCASH: new Set<string>() }

  dailySales.forEach((s) => {
    const rev  = parseFloat(s.Revenue)   || 0
    const prof = parseFloat(s.NetProfit) || 0
    const key  = `${s.Date}|${s.Time}|${s.Customer}`

    if (s.Method === 'CASH') {
      cash.revenue  += rev
      cash.profit   += prof
      txKeys.CASH.add(key)
    } else {
      gcash.revenue  += rev
      gcash.profit   += prof
      txKeys.GCASH.add(key)
    }
  })

  cash.expenses  = cash.revenue  - cash.profit
  gcash.expenses = gcash.revenue - gcash.profit
  cash.txCount   = txKeys.CASH.size
  gcash.txCount  = txKeys.GCASH.size
  cash.margin    = cash.revenue  > 0 ? (cash.profit  / cash.revenue)  * 100 : 0
  gcash.margin   = gcash.revenue > 0 ? (gcash.profit / gcash.revenue) * 100 : 0

  return (
    <div className='payment-breakdown'>
      <MethodCard label='Cash'  icon='💵' accent='#4a7c59' stats={cash}  />
      <MethodCard label='GCash' icon='📱' accent='#1a56a0' stats={gcash} />
    </div>
  )
}

interface MethodCardProps {
  label:  string
  icon:   string
  accent: string
  stats:  MethodStats
}

const MethodCard: React.FC<MethodCardProps> = ({ label, icon, accent, stats }) => (
  <div className='payment-breakdown__card' style={{ borderTopColor: accent }}>
    <div className='payment-breakdown__card-header'>
      <span className='payment-breakdown__icon'>{icon}</span>
      <span className='payment-breakdown__label' style={{ color: accent }}>{label}</span>
      <span className='payment-breakdown__txcount'>{stats.txCount} transactions</span>
    </div>

    <div className='payment-breakdown__row'>
      <span className='payment-breakdown__row-label'>Revenue</span>
      <span className='payment-breakdown__row-value'>{fmt(stats.revenue)}</span>
    </div>
    <div className='payment-breakdown__row payment-breakdown__row--expenses'>
      <span className='payment-breakdown__row-label'>Expenses</span>
      <span className='payment-breakdown__row-value'>{fmt(stats.expenses)}</span>
    </div>
    <div className='payment-breakdown__row payment-breakdown__row--profit'>
      <span className='payment-breakdown__row-label'>Profit</span>
      <span className='payment-breakdown__row-value'>{fmt(stats.profit)}</span>
    </div>

    <div className='payment-breakdown__bar-track'>
      <div
        className='payment-breakdown__bar-fill'
        style={{ width: `${stats.margin}%`, background: accent }}
      />
    </div>
    <div className='payment-breakdown__margin-label'>{stats.margin.toFixed(1)}% margin</div>
  </div>
)

export default PaymentBreakdown
