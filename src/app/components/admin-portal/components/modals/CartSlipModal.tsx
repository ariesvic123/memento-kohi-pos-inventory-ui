import React, { useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'

import { CartItem } from '../../../../config/utils/pos.types'

interface Props {
  cart:      CartItem[]
  onClose:   () => void
  customer?: string
  orderNo?:  number
}

const CartSlipModal: React.FC<Props> = ({ cart, onClose, customer, orderNo }) => {
  const slipRef          = useRef<HTMLDivElement>(null)
  const [copying, setCopying] = useState(false)
  const [done,    setDone]    = useState(false)

  const addOnSum  = (item: CartItem) => (item.addOns ?? []).reduce((s, ao) => s + ao.price, 0)
  const itemTotal = (item: CartItem) => (item.price + addOnSum(item)) * item.qty
  const grandTotal = cart.reduce((acc, item) => acc + itemTotal(item), 0)

  const handleCopy = useCallback(async () => {
    if (!slipRef.current || copying) return
    setCopying(true)
    try {
      const canvas = await html2canvas(slipRef.current, {
        backgroundColor: '#fffef8',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 0,
      })
      canvas.toBlob(async (blob) => {
        if (!blob) { setCopying(false); return }
        try {
          if (!navigator.clipboard || !window.isSecureContext) throw new Error('insecure')
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setDone(true)
          setTimeout(() => setDone(false), 2500)
        } catch {
          const url = URL.createObjectURL(blob)
          const a   = document.createElement('a')
          a.href = url; a.download = 'order-slip.png'; a.click()
          URL.revokeObjectURL(url)
        }
        setCopying(false)
      }, 'image/png')
    } catch { setCopying(false) }
  }, [copying])

  return (
    <div className='modal-overlay cart-slip-overlay' onClick={onClose}>
      <div className='cart-slip-wrapper' onClick={(e) => e.stopPropagation()}>

        {/* Action bar */}
        <div className='cart-slip-actions'>
          <button className='receipt-actions__close' onClick={onClose}>✕</button>
          <button
            className={`btn-primary receipt-actions__copy${done ? ' receipt-actions__copy--done' : ''}`}
            onClick={handleCopy}
            disabled={copying}
          >
            {copying
              ? <><span className='receipt-actions__spinner' /> Capturing...</>
              : done
              ? <><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'><path d='M2 7l3.5 3.5L11 4'/></svg> Copied!</>
              : <><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'><rect x='4' y='4' width='8' height='8' rx='1'/><path d='M1 9V2a1 1 0 011-1h7'/></svg> Copy Slip</>
            }
          </button>
        </div>

        {/* Slip paper */}
        <div className='cart-slip' ref={slipRef}>

          <div className='cart-slip__header'>Order Slip</div>
          {(customer || orderNo !== undefined) && (
            <div className='cart-slip__meta'>
              {orderNo !== undefined && <span className='cart-slip__meta-no'>#{orderNo}</span>}
              {customer && <span className='cart-slip__meta-customer'>{customer}</span>}
            </div>
          )}
          <div className='cart-slip__tear' />

          <div className='cart-slip__items'>
            {cart.map((item, i) => {
              const aoTotal = addOnSum(item)
              const unitEffective = item.price + aoTotal
              const lineTotal     = itemTotal(item)

              return (
                <div key={i} className='cart-slip__item'>

                  {/* Item name row */}
                  <div className='cart-slip__item-top'>
                    <div className='cart-slip__item-left'>
                      <span className='cart-slip__item-qty'>{item.qty}×</span>
                      <span className='cart-slip__item-name'>{item.name}</span>
                      <span className='cart-slip__item-size'>({item.size})</span>
                      {item.temperature && (
                        <span className={`cart-slip__temp-tag cart-slip__temp-tag--${item.temperature}`}>
                          {item.temperature === 'hot' ? 'Hot' : 'Iced'}
                        </span>
                      )}
                    </div>
                    <span className='cart-slip__item-price'>₱{lineTotal.toFixed(2)}</span>
                  </div>

                  {/* Unit breakdown */}
                  <div className='cart-slip__item-breakdown'>
                    {item.qty > 1
                      ? `₱${unitEffective.toFixed(2)}/ea × ${item.qty}`
                      : `₱${item.price.toFixed(2)}${aoTotal > 0 ? ` + ₱${aoTotal.toFixed(2)} add-ons` : ''}`
                    }
                  </div>

                  {/* Bundle items */}
                  {(item.bundleItems ?? []).map((bi, j) => (
                    <div key={`bi-${j}`} className='cart-slip__addon'>
                      <span className='cart-slip__addon-tree'>└</span>
                      <span className='cart-slip__addon-name'>{bi.name} ({bi.size})</span>
                      <span className='cart-slip__addon-price'>₱{bi.price.toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Add-ons */}
                  {(item.addOns ?? []).map((ao, j) => (
                    <div key={`ao-${j}`} className='cart-slip__addon'>
                      <span className='cart-slip__addon-tree'>└</span>
                      <span className='cart-slip__addon-name'>+ {ao.name}</span>
                      <span className='cart-slip__addon-price'>
                        {item.qty > 1
                          ? `₱${ao.price.toFixed(2)} × ${item.qty} = ₱${(ao.price * item.qty).toFixed(2)}`
                          : `₱${ao.price.toFixed(2)}`
                        }
                      </span>
                    </div>
                  ))}

                  {/* Notes */}
                  {item.notes && (
                    <div className='cart-slip__notes'>Note: {item.notes}</div>
                  )}
                </div>
              )
            })}
          </div>

          <div className='cart-slip__tear' />

          <div className='cart-slip__total'>
            <span>TOTAL</span>
            <span>₱{grandTotal.toFixed(2)}</span>
          </div>

        </div>
      </div>
    </div>
  )
}

export default CartSlipModal
