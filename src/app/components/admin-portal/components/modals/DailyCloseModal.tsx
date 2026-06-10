import React, { useMemo } from 'react'

import { usePOS } from '../../../../context/POSContext'

interface Props {
  isOpen:  boolean
  onClose: () => void
}

const DailyCloseModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { dailySales, stats, exportPOSData } = usePOS()

  const d        = new Date()
  const today    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todaySales = useMemo(() => dailySales.filter((s) => s.Date === today), [dailySales, today])

  const todayStats = useMemo(() => {
    let rev = 0, profit = 0
    todaySales.forEach((s) => {
      rev    += parseFloat(s.Revenue)   || 0
      profit += parseFloat(s.NetProfit) || 0
    })
    const exp    = rev - profit
    const margin = rev > 0 ? (profit / rev) * 100 : 0
    const orders = new Set(todaySales.map((s) => s.OrderNo).filter((n) => n != null)).size
    const items  = todaySales.reduce((sum, s) => sum + s.Qty, 0)
    const cash   = todaySales.filter((s) => s.Method === 'CASH').reduce((sum, s) => sum + (parseFloat(s.Revenue) || 0), 0)
    const gcash  = todaySales.filter((s) => s.Method === 'GCASH').reduce((sum, s) => sum + (parseFloat(s.Revenue) || 0), 0)
    return { rev, profit, exp, margin, orders, items, cash, gcash }
  }, [todaySales])

  const topDrinks = useMemo(() => {
    const counts: Record<string, number> = {}
    todaySales.forEach((s) => { counts[s.Drink] = (counts[s.Drink] || 0) + s.Qty })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [todaySales])

  if (!isOpen) return null

  const handleExport = () => { exportPOSData(); onClose() }

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='modal-card modal-card--wide close-report' onClick={(e) => e.stopPropagation()}>
        <div className='close-report__header'>
          <div>
            <h2 className='close-report__title'>Daily Report</h2>
            <p className='close-report__date'>{new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <button className='close-report__print' onClick={() => window.print()}>
            <svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'><rect x='2' y='4' width='9' height='6' rx='1'/><path d='M4 4V2h5v2M4 10v2h5v-2'/><circle cx='9.5' cy='7' r='0.5' fill='currentColor' stroke='none'/></svg>
            Print
          </button>
        </div>

        {/* Today stats */}
        <div className='close-report__grid'>
          {[
            { label: 'Revenue',  val: `₱${todayStats.rev.toFixed(2)}`,    color: '#2e7d32' },
            { label: 'Expenses', val: `₱${todayStats.exp.toFixed(2)}`,    color: '#8B2020' },
            { label: 'Profit',   val: `₱${todayStats.profit.toFixed(2)}`, color: '#2e7d32' },
            { label: 'Margin',   val: `${todayStats.margin.toFixed(1)}%`,  color: todayStats.margin >= 40 ? '#2e7d32' : '#C4921E' },
            { label: 'Orders',   val: String(todayStats.orders) },
            { label: 'Items Sold', val: String(todayStats.items) },
          ].map(({ label, val, color }) => (
            <div key={label} className='close-report__stat'>
              <span className='close-report__stat-val' style={color ? { color } : undefined}>{val}</span>
              <span className='close-report__stat-label'>{label}</span>
            </div>
          ))}
        </div>

        {/* Payment breakdown */}
        <div className='close-report__methods'>
          {todayStats.cash  > 0 && <span className='close-report__method-chip close-report__method-chip--cash'>Cash ₱{todayStats.cash.toFixed(2)}</span>}
          {todayStats.gcash > 0 && <span className='close-report__method-chip close-report__method-chip--gcash'>GCash ₱{todayStats.gcash.toFixed(2)}</span>}
        </div>

        {/* Top drinks today */}
        {topDrinks.length > 0 && (
          <div className='close-report__top'>
            <p className='close-report__section-label'>Top Drinks Today</p>
            <ol className='close-report__top-list'>
              {topDrinks.map(([name, qty], i) => (
                <li key={name} className='close-report__top-item'>
                  <span className='close-report__top-rank'>{i + 1}</span>
                  <span className='close-report__top-name'>{name}</span>
                  <span className='close-report__top-qty'>{qty}×</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* All-time totals */}
        <div className='close-report__alltime'>
          <p className='close-report__section-label'>All-Time Totals</p>
          <div className='close-report__alltime-row'>
            <span>Revenue</span><span style={{ color: '#2e7d32', fontWeight: 700 }}>₱{stats.rev.toFixed(2)}</span>
          </div>
          <div className='close-report__alltime-row'>
            <span>Profit</span><span style={{ color: '#2e7d32', fontWeight: 700 }}>₱{stats.prof.toFixed(2)}</span>
          </div>
          <div className='close-report__alltime-row'>
            <span>Margin</span><span style={{ fontWeight: 700 }}>{stats.margin.toFixed(1)}%</span>
          </div>
        </div>

        <div className='modal-card__actions'>
          <button className='btn-outline modal-card__btn' onClick={onClose}>Close</button>
          <button className='btn-primary modal-card__btn' onClick={handleExport}>Export &amp; Close Shift</button>
        </div>
      </div>
    </div>
  )
}

export default DailyCloseModal
