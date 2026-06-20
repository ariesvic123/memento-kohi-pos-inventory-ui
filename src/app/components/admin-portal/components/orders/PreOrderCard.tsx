import React, { useState } from 'react'

import { PendingOrder } from '../../../../config/utils/pos.types'

interface Props {
  order:    PendingOrder
  index:    number
  onDone:   (id: string) => void
  onDelete: (id: string) => void
}

const PreOrderCard: React.FC<Props> = ({ order, index, onDone, onDelete }) => {
  const [checked, setChecked] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleCheck = () => {
    if (checked) return
    setChecked(true)
    setTimeout(() => {
      setExiting(true)
      setTimeout(() => onDone(order.id), 420)
    }, 600)
  }

  const handleDelete = () => {
    setExiting(true)
    setTimeout(() => onDelete(order.id), 300)
  }

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
          title='Mark as done — deducts stock'
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

      {order.notes && (
        <div className='sticky-card__notes-display'>{order.notes}</div>
      )}

      {/* Delete */}
      {!checked && (
        <button className='sticky-card__delete' onClick={handleDelete} title='Cancel pre-order'>
          ✕
        </button>
      )}

      {/* Done overlay */}
      {checked && (
        <div className='sticky-card__done-overlay'>
          <span className='sticky-card__done-check'>✓</span>
          <span className='sticky-card__done-label'>Done! Deducting stock…</span>
        </div>
      )}
    </div>
  )
}

export default PreOrderCard
