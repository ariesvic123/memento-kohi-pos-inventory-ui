import React, { useState } from 'react'

import { CartItem, PaymentMethod, PendingOrder, PendingOrderItem } from '../../../../config/utils/pos.types'
import CartSlipModal from '../modals/CartSlipModal'

interface Props {
  order:        PendingOrder
  index:        number
  onSendToCart: (id: string) => void
  onDelete:     (id: string) => void
  onUpdate:     (id: string, patch: Partial<Pick<PendingOrder, 'method' | 'notes' | 'cashReceived'>>) => void
}

const toCartItems = (items: PendingOrderItem[]): CartItem[] =>
  items.map((item) => {
    const ci: CartItem = { name: item.name, size: item.size, price: item.price, cost: item.cost, qty: item.qty }
    if (item.isBundle && item.bundleItems?.length) {
      ci.isBundle    = true
      ci.bundleItems = item.bundleItems.map((bi) => ({ name: bi.name, size: bi.size, price: bi.price, cost: bi.cost, qty: bi.qty }))
    }
    if (item.addOns?.length) {
      ci.addOns = item.addOns.map((ao) => ({ name: ao.name, size: ao.size, price: ao.price, cost: ao.cost, qty: ao.qty }))
    }
    return ci
  })

const PreOrderCard: React.FC<Props> = ({ order, index, onSendToCart, onDelete, onUpdate }) => {
  const [checked,     setChecked]     = useState(false)
  const [exiting,     setExiting]     = useState(false)
  const [showSlip,    setShowSlip]    = useState(false)
  const [editing,     setEditing]     = useState(false)
  const [draftMethod, setDraftMethod] = useState<PaymentMethod>(order.method)
  const [draftNotes,  setDraftNotes]  = useState(order.notes ?? '')
  const [draftCash,   setDraftCash]   = useState(order.cashReceived ?? 0)

  const handleCheck = () => {
    if (checked) return
    setChecked(true)
    setTimeout(() => onSendToCart(order.id), 700)
  }

  const handleDelete = () => {
    setExiting(true)
    setTimeout(() => onDelete(order.id), 300)
  }

  const handleEditOpen = () => {
    setDraftMethod(order.method)
    setDraftNotes(order.notes ?? '')
    setDraftCash(order.cashReceived ?? 0)
    setEditing(true)
  }

  const handleEditSave = () => {
    onUpdate(order.id, {
      method:       draftMethod,
      notes:        draftNotes.trim() || undefined,
      cashReceived: draftMethod === 'CASH' && draftCash > 0 ? draftCash : undefined,
    } as { method: PaymentMethod; notes?: string; cashReceived?: number })
    setEditing(false)
  }

  const handleEditCancel = () => {
    setDraftMethod(order.method)
    setDraftNotes(order.notes ?? '')
    setDraftCash(order.cashReceived ?? 0)
    setEditing(false)
  }

  const change = order.method === 'CASH' && (order.cashReceived ?? 0) > 0
    ? Math.max(0, (order.cashReceived ?? 0) - order.total)
    : null

  const tilt = index % 2 === 0 ? -1 : 1

  const cls = [
    'sticky-card',
    'sticky-card--preorder',
    checked ? 'sticky-card--checked' : '',
    exiting ? 'sticky-card--exiting' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
    >
      <div className='sticky-card__tape sticky-card__tape--preorder' />

      {/* Header */}
      <div className='sticky-card__header'>
        <span className='sticky-card__order-no'>#{order.orderNo}</span>
        <span className='sticky-card__preorder-badge'>PRE-ORDER</span>
        <span className='sticky-card__time'>{order.createdAt}</span>
        <button
          className={`sticky-card__checkbox${checked ? ' sticky-card__checkbox--done' : ''}`}
          onClick={handleCheck}
          title='Load to cart — add more items at terminal'
        >
          {checked ? '✓' : ''}
        </button>
      </div>

      {/* Customer */}
      <div className='sticky-card__customer'>{order.customer}</div>
      <div className='sticky-card__method-row'>
        <span className={`sticky-card__method sticky-card__method--${order.method.toLowerCase()}`}>
          {order.method}
        </span>
        <span className={`sticky-card__order-type${order.isTakeout ? ' sticky-card__order-type--takeout' : ' sticky-card__order-type--dinein'}`}>
          {order.isTakeout ? 'Takeout' : 'Dine-in'}
        </span>
        {order.address && (
          <span className='sticky-card__address'>{order.address}</span>
        )}
      </div>

      <div className='sticky-card__divider' />

      {/* Items */}
      <ul className='sticky-card__items'>
        {order.items.map((item, i) => (
          <React.Fragment key={i}>
            <li className='sticky-card__item'>
              <span className='sticky-card__item-left'>
                <b className='sticky-card__qty'>{item.qty}×</b>
                {item.isBundle
                  ? <span className='sticky-card__bundle-label'>Cookie Bundle</span>
                  : <><span className='sticky-card__size'>{item.size}</span><span className='sticky-card__name'>{item.name}</span></>
                }
              </span>
              <span className='sticky-card__item-right'>
                <span className='sticky-card__price'>₱{item.price}</span>
              </span>
            </li>
            {item.isBundle && (item.bundleItems ?? []).map((bi, j) => (
              <li key={`bi-${j}`} className='sticky-card__addon-row'>
                <span className='sticky-card__addon-tree'>└</span>
                <span className='sticky-card__addon-name'>{bi.name} {bi.size}</span>
                <span className='sticky-card__addon-price'>₱{bi.price}</span>
              </li>
            ))}
          </React.Fragment>
        ))}
      </ul>

      <div className='sticky-card__divider' />

      <div className='sticky-card__total-row'>
        <span>TOTAL</span>
        <span className='sticky-card__total'>₱{order.total.toFixed(2)}</span>
      </div>

      {/* Cash change display */}
      {!editing && change !== null && (
        <div className='sticky-card__change-row'>
          <span>Cash ₱{(order.cashReceived ?? 0).toFixed(2)}</span>
          <span>Change <b>₱{change.toFixed(2)}</b></span>
        </div>
      )}

      {/* Notes display */}
      {!editing && order.notes && (
        <div className='sticky-card__notes-display'>{order.notes}</div>
      )}

      {/* Edit form */}
      {editing && (
        <div className='sticky-card__edit-form'>
          <div className='sticky-card__edit-row'>
            <span className='sticky-card__edit-label'>Payment</span>
            <div className='sticky-card__method-toggle'>
              {(['CASH', 'GCASH'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  className={`sticky-card__method-btn sticky-card__method-btn--${m.toLowerCase()}${draftMethod === m ? ' sticky-card__method-btn--active' : ''}`}
                  onClick={() => setDraftMethod(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {draftMethod === 'CASH' && (
            <div className='sticky-card__edit-row'>
              <span className='sticky-card__edit-label'>Cash rcvd</span>
              <input
                type='number'
                min={0}
                step='any'
                className='sticky-card__cash-input'
                value={draftCash || ''}
                placeholder={`₱${order.total.toFixed(2)}`}
                onChange={(e) => setDraftCash(parseFloat(e.target.value) || 0)}
              />
            </div>
          )}

          <div className='sticky-card__edit-row sticky-card__edit-row--col'>
            <span className='sticky-card__edit-label'>Notes</span>
            <textarea
              className='sticky-card__notes-input'
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder='Special instructions…'
              rows={2}
            />
          </div>

          <div className='sticky-card__edit-actions'>
            <button className='sticky-card__save-btn'   onClick={handleEditSave}>Save</button>
            <button className='sticky-card__cancel-btn' onClick={handleEditCancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Order slip button */}
      {!checked && !editing && (
        <button
          className='sticky-card__slip-btn'
          onClick={() => setShowSlip(true)}
          title='View order slip'
        >
          Order Slip
        </button>
      )}

      {/* Edit pencil button */}
      {!checked && !editing && (
        <button className='sticky-card__edit-btn' onClick={handleEditOpen} title='Edit pre-order'>
          ✎
        </button>
      )}

      {/* Delete */}
      {!checked && !editing && (
        <button className='sticky-card__delete' onClick={handleDelete} title='Cancel pre-order'>
          ✕
        </button>
      )}

      {/* Done overlay */}
      {checked && (
        <div className='sticky-card__done-overlay'>
          <span className='sticky-card__done-check'>✓</span>
          <span className='sticky-card__done-label'>Off to cart! →</span>
        </div>
      )}

      {showSlip && (
        <CartSlipModal
          cart={toCartItems(order.items)}
          customer={order.customer}
          orderNo={order.orderNo}
          onClose={() => setShowSlip(false)}
        />
      )}
    </div>
  )
}

export default PreOrderCard
