import React, { useEffect, useState } from 'react'

import { usePOS }      from '../../../../context/POSContext'
import ReceiptModal    from './ReceiptModal'

const CheckoutSuccessModal: React.FC = () => {
  const { checkoutOpen, closeCheckout, lastSaleStats, lastOrderNumber, lastReceipt } = usePOS()
  const [animate,      setAnimate]      = useState(false)
  const [showReceipt,  setShowReceipt]  = useState(false)

  useEffect(() => {
    if (checkoutOpen) setTimeout(() => setAnimate(true), 80)
    else              { setAnimate(false); setShowReceipt(false) }
  }, [checkoutOpen])

  if (!checkoutOpen) return null

  const orderNo = lastOrderNumber - 1

  return (
    <>
      <div className='modal-overlay'>
        <div className='modal-card checkout-success-card'>

          {/* Order badge */}
          <div className='checkout-success__order-badge'>#{orderNo}</div>

          <h2 className='modal-card__title' style={{ textAlign: 'center', marginBottom: 4 }}>
            Order Queued!
          </h2>
          <p style={{ textAlign: 'center', color: '#9e8478', fontSize: '0.82rem', margin: '0 0 20px' }}>
            Sent to Orders Queue — check the card when ready.
          </p>

          {/* Stats */}
          <div className='checkout-success__metrics'>
            <div className={`checkout-success__value${animate ? ' checkout-success__value--reveal' : ''}`}>
              ₱{lastSaleStats.rev.toFixed(2)}
            </div>
            <div className='checkout-success__label'>Order Total</div>

            <div
              className={`checkout-success__value${animate ? ' checkout-success__value--reveal' : ''}`}
              style={{ fontSize: '1.4rem', color: '#43a047' }}
            >
              ₱{lastSaleStats.prof.toFixed(2)}
            </div>
            <div className='checkout-success__label'>Est. Profit</div>
          </div>

          {/* Actions */}
          <div className='checkout-success__actions'>
            <button
              className='btn-outline modal-card__btn'
              onClick={() => setShowReceipt(true)}
            >
              <svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
                <rect x='2' y='4' width='9' height='6' rx='1'/>
                <path d='M4 4V2h5v2M4 10v2h5v-2'/>
                <circle cx='9.5' cy='7' r='.5' fill='currentColor' stroke='none'/>
              </svg>
              Receipt
            </button>
            <button className='btn-primary modal-card__btn' onClick={closeCheckout}>
              Close
            </button>
          </div>

        </div>
      </div>

      {/* Receipt modal renders on top when requested */}
      {showReceipt && lastReceipt && <ReceiptModal />}
    </>
  )
}

export default CheckoutSuccessModal
