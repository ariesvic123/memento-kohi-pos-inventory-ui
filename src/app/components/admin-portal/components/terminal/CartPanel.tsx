import React, { useState } from 'react'

import { CartItem } from '../../../../config/utils/pos.types'
import ConfirmModal  from '../modals/ConfirmModal'
import CartSlipModal from '../modals/CartSlipModal'

interface CartPanelProps {
  cart:           CartItem[]
  onIncrement:    (index: number) => void
  onDecrement:    (index: number) => void
  onRemove:       (index: number) => void
  onClear:        () => void
  onStartPreview: () => void
}

const CartPanel: React.FC<CartPanelProps> = ({
  cart, onIncrement, onDecrement, onRemove, onClear, onStartPreview,
}) => {
  const [voidConfirm,  setVoidConfirm]  = useState(false)
  const [removeTarget, setRemoveTarget] = useState<number | null>(null)
  const [showSlip,     setShowSlip]     = useState(false)

  const addOnSum  = (item: CartItem) => (item.addOns ?? []).reduce((s, ao) => s + ao.price, 0)
  const itemTotal = (item: CartItem) => (item.price + addOnSum(item)) * item.qty

  const totalDue = cart.reduce((acc, item) => acc + itemTotal(item), 0)

  return (
    <div className='cart-panel'>
      <div className='cart-panel__header'>
        <h3 className='cart-panel__title'>Current Tray</h3>
        <button className='cart-panel__void-btn' onClick={() => setVoidConfirm(true)}>VOID</button>
      </div>

      <div className='cart-panel__scroll'>
        {cart.map((item, i) => (
          <div key={`${item.name}-${item.size}-${i}`} className='cart-panel__item'>
            <div className='cart-panel__item-header'>
              <div>
                <b>{item.name}</b>
                {item.temperature && (
                  <span className={`cart-panel__temp-tag cart-panel__temp-tag--${item.temperature}`}>
                    {item.temperature === 'hot' ? 'Hot' : 'Iced'}
                  </span>
                )}
                {item.notes && <p className='cart-panel__item-notes'>{item.notes}</p>}
              </div>
              <button className='cart-panel__remove-btn' onClick={() => setRemoveTarget(i)}>✕</button>
            </div>

            <div className='cart-panel__qty-row'>
              <button className='cart-panel__qty-btn' onClick={() => onDecrement(i)}>−</button>
              <span>{item.qty} × {item.size}</span>
              <button className='cart-panel__qty-btn' onClick={() => onIncrement(i)}>+</button>
            </div>

            {/* Subtotal always on right */}
            <div className='cart-panel__price-meta'>
              <span className='cart-panel__item-subtotal'>₱{itemTotal(item).toFixed(2)}</span>
            </div>

            {(item.addOns ?? []).length > 0 && (
              <div className='cart-panel__addons'>
                {(item.addOns ?? []).map((ao, j) => (
                  <div key={j} className='cart-panel__addon-row'>
                    <span className='cart-panel__addon-name'>+ {ao.name}</span>
                    <span className='cart-panel__addon-price'>₱{ao.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className='cart-panel__footer'>
        <div className='cart-panel__total'>
          <span>Total Due</span>
          <span>₱{totalDue.toFixed(2)}</span>
        </div>
        <button
          className='cart-panel__slip-btn'
          onClick={() => setShowSlip(true)}
          disabled={!cart.length}
        >
          ORDER SLIP
        </button>
        <button
          className='cart-panel__checkout-btn'
          onClick={onStartPreview}
          disabled={!cart.length}
        >
          COMPLETE SALE
        </button>
      </div>

      <ConfirmModal
        isOpen={voidConfirm}
        title='Void Entire Tray?'
        onClose={() => setVoidConfirm(false)}
        onConfirm={() => { onClear(); setVoidConfirm(false) }}
      />

      <ConfirmModal
        isOpen={removeTarget !== null}
        title='Remove Item'
        description={
          removeTarget !== null
            ? `${cart[removeTarget]?.qty}× ${cart[removeTarget]?.name}`
            : undefined
        }
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget !== null) { onRemove(removeTarget); setRemoveTarget(null) }
        }}
      />

      {showSlip && <CartSlipModal cart={cart} onClose={() => setShowSlip(false)} />}
    </div>
  )
}

export default CartPanel
