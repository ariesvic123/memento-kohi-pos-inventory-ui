import React, { useEffect, useState } from 'react'

import { usePOS }                  from '../../../../context/POSContext'
import { resolveUnit }             from '../../../../config/utils/pos.types'
import { computeTakeoutBagCounts } from '../../../../config/utils/pos.helpers'

const CheckoutPreviewModal: React.FC = () => {
  const {
    isPreviewing,
    deductionPreview,
    barPercentages,
    inventory,
    cart,
    customerInfo,
    setCustomerInfo,
    cancelPreview,
    confirmSale,
  } = usePOS()

  const [cashReceived, setCashReceived] = useState('')
  const [exactCash,    setExactCash]   = useState(false)
  const [attempted,    setAttempted]   = useState(false)
  const [nameError,    setNameError]   = useState(false)

  const totalDue   = cart.reduce((acc, item) => {
    const addOnSum = (item.addOns ?? []).reduce((s, ao) => s + ao.price, 0)
    return acc + (item.price + addOnSum) * item.qty
  }, 0)
  const cashAmount = parseFloat(cashReceived) || 0
  const change     = cashAmount - totalDue
  const isCash     = customerInfo.method === 'CASH'
  const canConfirm = !isCash || cashAmount >= totalDue
  const hasName    = customerInfo.name.trim().length > 0

  // Takeout bag counts (only computed when takeout is on)
  const bagCounts = customerInfo.isTakeout ? computeTakeoutBagCounts(cart) : null
  const totalBags = bagCounts ? bagCounts.doubleBags + bagCounts.singleBags : 0

  useEffect(() => {
    if (exactCash) {
      setCashReceived(totalDue.toFixed(2))
      setCustomerInfo((prev) => ({ ...prev, cashReceived: totalDue }))
    } else {
      setCashReceived('')
      setCustomerInfo((prev) => { const { cashReceived: _, ...rest } = prev; return rest as typeof prev })
    }
  }, [exactCash, totalDue])

  useEffect(() => {
    if (isPreviewing) {
      // Always reset customer name so every order starts fresh
      setCustomerInfo((prev) => ({ ...prev, name: '' }))
    } else {
      setCashReceived('')
      setExactCash(false)
      setAttempted(false)
      setNameError(false)
    }
  }, [isPreviewing])

  if (!isPreviewing) return null

  const handleConfirm = () => {
    if (!hasName)    { setNameError(true); return }
    if (!canConfirm) { setAttempted(true); return }
    setNameError(false)
    confirmSale()
  }

  const cashError = attempted && isCash && !canConfirm
    ? cashReceived === ''
      ? 'Enter cash amount to confirm.'
      : `Short by ₱${Math.abs(change).toFixed(2)} — add more cash.`
    : null

  return (
    <div className='modal-overlay'>
      <div className='modal-card modal-card--wide'>
        <h2 className='modal-card__title'>Stock Deduction Preview</h2>

        {/* Customer fields */}
        <div className='checkout-preview__customer'>
          <div>
            <input
              type='text'
              placeholder='Customer First Name *'
              value={customerInfo.name}
              onChange={(e) => { setCustomerInfo((prev) => ({ ...prev, name: e.target.value })); setNameError(false) }}
              className={`checkout-preview__input${nameError ? ' checkout-preview__input--error' : ''}`}
            />
            {nameError && <p className='checkout-preview__cash-error'>Customer name is required.</p>}
          </div>
          <select
            value={customerInfo.method}
            onChange={(e) => {
              setAttempted(false)
              setCustomerInfo((prev) => ({ ...prev, method: e.target.value as 'CASH' | 'GCASH' }))
            }}
            className='checkout-preview__select'
          >
            <option value='CASH'>CASH</option>
            <option value='GCASH'>GCASH</option>
          </select>
        </div>

        {/* Takeout toggle */}
        <div className='checkout-preview__takeout'>
          <label className='checkout-preview__exact-label'>
            <input
              type='checkbox'
              checked={customerInfo.isTakeout}
              onChange={(e) => setCustomerInfo((prev) => ({ ...prev, isTakeout: e.target.checked }))}
              className='checkout-preview__exact-check'
            />
            Takeout
          </label>

          {customerInfo.isTakeout && bagCounts && totalBags > 0 && (
            <div className='checkout-preview__bags'>
              {bagCounts.doubleBags > 0 && (
                <span className='checkout-preview__bag-chip'>
                  {bagCounts.doubleBags}× Double Bag
                </span>
              )}
              {bagCounts.singleBags > 0 && (
                <span className='checkout-preview__bag-chip'>
                  {bagCounts.singleBags}× Single Bag
                </span>
              )}
            </div>
          )}

          {customerInfo.isTakeout && totalBags === 0 && (
            <span className='checkout-preview__bags-none'>No bags needed</span>
          )}
        </div>

        {/* Cash payment */}
        {isCash && (
          <div className='checkout-preview__cash'>
            <div className='checkout-preview__cash-row'>
              <span>Total Due</span>
              <span>₱{totalDue.toFixed(2)}</span>
            </div>
            <div className='checkout-preview__cash-row'>
              <label htmlFor='exact-cash-toggle' className='checkout-preview__exact-label'>
                <input
                  id='exact-cash-toggle'
                  type='checkbox'
                  checked={exactCash}
                  onChange={(e) => { setExactCash(e.target.checked); setAttempted(false) }}
                  className='checkout-preview__exact-check'
                />
                Exact Cash
              </label>
            </div>
            {!exactCash && (
              <div className='checkout-preview__cash-row'>
                <label htmlFor='cash-received'>Cash Received</label>
                <input
                  id='cash-received'
                  type='number'
                  min={0}
                  placeholder='0.00'
                  value={cashReceived}
                  onChange={(e) => {
                    setCashReceived(e.target.value)
                    setAttempted(false)
                    const amt = parseFloat(e.target.value) || 0
                    if (amt > 0) {
                      setCustomerInfo((prev) => ({ ...prev, cashReceived: amt }))
                    } else {
                      setCustomerInfo((prev) => { const { cashReceived: _, ...rest } = prev; return rest as typeof prev })
                    }
                  }}
                  className={`checkout-preview__input checkout-preview__input--cash${cashError ? ' checkout-preview__input--error' : ''}`}
                />
              </div>
            )}
            {cashError && (
              <p className='checkout-preview__cash-error'>{cashError}</p>
            )}
            {!cashError && cashReceived !== '' && (
              <div className={`checkout-preview__cash-row checkout-preview__cash-row--change${change < 0 ? ' checkout-preview__cash-row--short' : ''}`}>
                <span>{change < 0 ? 'Short by' : 'Change'}</span>
                <span>₱{Math.abs(change).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Deduction rows */}
        <div className='checkout-preview__list'>
          {deductionPreview.map((ing, i) => {
            const original = inventory.find(
              (inv) =>
                String(inv.INGREDIENTS).trim().toLowerCase() ===
                String(ing.INGREDIENTS).trim().toLowerCase()
            )
            const before = parseFloat(String(original?.stock ?? original?.STOCKS ?? original?.VOLUME ?? 0))
            const after  = parseFloat(String(ing.stock  ?? ing.STOCKS  ?? ing.VOLUME  ?? before))
            if (after >= before) return null

            const invIndex = inventory.findIndex(
              (inv) =>
                String(inv.INGREDIENTS).trim().toLowerCase() ===
                String(ing.INGREDIENTS).trim().toLowerCase()
            )

            return (
              <div key={`${String(ing.INGREDIENTS)}-${i}`} className='checkout-preview__row'>
                <div className='checkout-preview__name'>{String(ing.INGREDIENTS)}</div>
                <div className='checkout-preview__bar-track'>
                  <div
                    className='checkout-preview__bar-fill'
                    style={{ width: `${barPercentages[invIndex] ?? 0}%`, transition: 'width 2s ease' }}
                  />
                </div>
                <div className='checkout-preview__values'>
                  {before.toFixed(1)} → {after.toFixed(1)}
                  {resolveUnit(ing) && (
                    <span className='checkout-preview__unit'> {resolveUnit(ing)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className='modal-card__actions'>
          <button className='btn-outline modal-card__btn' onClick={cancelPreview}>
            Cancel
          </button>
          <button className='btn-danger modal-card__btn' onClick={handleConfirm}>
            Confirm Sale
          </button>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPreviewModal
