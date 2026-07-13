import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { usePOS }   from '../../../../context/POSContext'
import OrderCard    from './OrderCard'
import PreOrderCard from './PreOrderCard'

const OrdersQueue: React.FC = () => {
  const {
    pendingOrders,
    completePendingOrder,
    deletePendingOrder,
    updatePendingOrder,
    sendPreOrderToCart,
    deletePreOrder,
  } = usePOS()

  const navigate = useNavigate()

  const handleSendToCart = (id: string) => {
    sendPreOrderToCart(id)
    navigate('/pos/terminal')
  }

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

  const regularOrders = useMemo(
    () => pendingOrders.filter((o) => !o.isPreOrder),
    [pendingOrders]
  )
  const preOrders = useMemo(
    () => pendingOrders.filter((o) => o.isPreOrder),
    [pendingOrders]
  )

  const displayed = useMemo(() => {
    if (!search.trim()) return regularOrders
    const term = search.trim().toLowerCase()
    return regularOrders.filter(
      (order) =>
        order.customer.toLowerCase().includes(term) ||
        order.items.some((item) => item.name.toLowerCase().includes(term))
    )
  }, [regularOrders, search])

  const displayedPreOrders = useMemo(() => {
    if (!search.trim()) return preOrders
    const term = search.trim().toLowerCase()
    return preOrders.filter(
      (order) =>
        order.customer.toLowerCase().includes(term) ||
        order.items.some((item) => item.name.toLowerCase().includes(term))
    )
  }, [preOrders, search])

  const totalCount = pendingOrders.length

  return (
    <div className='orders-queue'>
      <div className='orders-queue__header'>
        <h1 className='orders-queue__title'>
          Orders Queue
          {totalCount > 0 && (
            <span className='orders-queue__badge'>{totalCount}</span>
          )}
        </h1>
        <p className='orders-queue__hint'>
          Orders appear here after each checkout. Check ✓ when ready — it moves to the Daily Tally.
        </p>

        {totalCount > 0 && (
          <div className='orders-queue__search-wrap'>
            <span className='orders-queue__search-icon'><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/></svg></span>
            <input
              type='text'
              ref={searchRef}
              className='orders-queue__search'
              placeholder='Search customer or drink… ( / )'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className='orders-queue__search-clear' onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        )}
      </div>

      {/* Pre-Orders section */}
      {preOrders.length > 0 && (
        <div className='orders-queue__section'>
          <div className='orders-queue__section-header'>
            <span className='orders-queue__section-title'>Pre-Orders</span>
            <span className='orders-queue__section-badge orders-queue__section-badge--preorder'>
              {preOrders.length}
            </span>
            <span className='orders-queue__section-hint'>Advance bundle orders — check ✓ to load into cart at terminal</span>
          </div>
          {displayedPreOrders.length > 0 ? (
            <div className='orders-queue__grid'>
              {displayedPreOrders.map((order, i) => (
                <PreOrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  onSendToCart={handleSendToCart}
                  onDelete={deletePreOrder}
                  onUpdate={updatePendingOrder}
                />
              ))}
            </div>
          ) : (
            <p className='orders-queue__section-empty'>No pre-orders match "{search}".</p>
          )}
        </div>
      )}

      {/* Regular orders section */}
      {regularOrders.length > 0 && (
        <div className='orders-queue__section'>
          {preOrders.length > 0 && (
            <div className='orders-queue__section-header'>
              <span className='orders-queue__section-title'>Regular Orders</span>
              <span className='orders-queue__section-badge'>{regularOrders.length}</span>
            </div>
          )}
          {displayed.length === 0 && search ? (
            <div className='orders-queue__empty'>
              <div className='orders-queue__empty-icon'><svg width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round'><circle cx='12' cy='12' r='8'/><path d='M18 18l5.5 5.5'/></svg></div>
              <p>No orders match "{search}".</p>
            </div>
          ) : (
            <div className='orders-queue__grid'>
              {displayed.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  onDone={completePendingOrder}
                  onDelete={deletePendingOrder}
                  onUpdate={updatePendingOrder}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {totalCount === 0 && (
        <div className='orders-queue__empty'>
          <div className='orders-queue__empty-icon'><svg width='32' height='32' viewBox='0 0 32 32' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'><rect x='6' y='3' width='20' height='26' rx='2'/><path d='M11 11h10M11 16h10M11 21h6'/></svg></div>
          <p>No pending orders.</p>
          <p>Complete a sale from the Terminal to see orders here.</p>
        </div>
      )}
    </div>
  )
}

export default OrdersQueue
