import React, { useState, useMemo } from 'react'

import { usePOS }            from '../../../../context/POSContext'
import {
  CartItem,
  DrinkSize,
  PaymentMethod,
  SellingPriceRow,
} from '../../../../config/utils/pos.types'
import { computeBundlePrice } from '../../../../config/utils/pos.helpers'

// ─── Types ────────────────────────────────────────────────────────────────────

type BundleMode = 'same' | 'assorted'

interface CookieOption {
  name:   string
  size:   DrinkSize
  price:  number
  cost:   number
}

interface BundleSelectorModalProps {
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parsePrice = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

const buildCookieOptions = (sellingPrices: SellingPriceRow[]): CookieOption[] => {
  const options: CookieOption[] = []
  sellingPrices.forEach((row) => {
    if (String(row.Category ?? '').toLowerCase() !== 'food') return
    const name = String(row.Drinks ?? '').trim()
    const p75  = parsePrice(row['Actual Price (75g)'])
    const c75  = parsePrice(row['Cost (75g)'])
    if (p75 > 0) options.push({ name, size: '75g', price: p75, cost: c75 })
  })
  return options
}

// ─── Component ────────────────────────────────────────────────────────────────

const BundleSelectorModal: React.FC<BundleSelectorModalProps> = ({ onClose }) => {
  const {
    sellingPrices,
    addToCart,
    addPreOrder,
  } = usePOS()

  const cookieOptions = useMemo(() => buildCookieOptions(sellingPrices), [sellingPrices])
  const cookieNames   = useMemo(() => [...new Set(cookieOptions.map((o) => o.name))], [cookieOptions])

  // ── Mode ─────────────────────────────────────────────────────────────────
  const [mode,       setMode]       = useState<BundleMode>('same')
  const [isPreOrder, setIsPreOrder] = useState(false)

  // ── Same-flavor state ─────────────────────────────────────────────────────
  const [sameName, setSameName] = useState(cookieNames[0] ?? '')

  // ── Assorted state (3 slots) ───────────────────────────────────────────────
  const firstOpt = cookieOptions.length > 0 ? cookieOptions[0] : null
  const [slot1, setSlot1] = useState<CookieOption | null>(firstOpt)
  const [slot2, setSlot2] = useState<CookieOption | null>(firstOpt)
  const [slot3, setSlot3] = useState<CookieOption | null>(firstOpt)

  // ── Pre-order form ────────────────────────────────────────────────────────
  const [poCustomer, setPoCustomer] = useState('')
  const [poAddress,  setPoAddress]  = useState('')
  const [poMethod,   setPoMethod]   = useState<PaymentMethod>('CASH')
  const [poTakeout,  setPoTakeout]  = useState(false)
  const [poCash,     setPoCash]     = useState<number>(0)

  // ── Derived bundle items & price ──────────────────────────────────────────

  const bundleItems = useMemo((): CookieOption[] => {
    if (mode === 'same') {
      const opt = cookieOptions.find((o) => o.name === sameName)
      if (!opt) return []
      return [opt, opt, opt]
    }
    return [slot1, slot2, slot3].filter((s): s is CookieOption => s !== null)
  }, [mode, sameName, slot1, slot2, slot3, cookieOptions])

  const bundlePrice = useMemo(
    () => bundleItems.length === 3 ? computeBundlePrice(bundleItems.map((b) => b.price)) : 0,
    [bundleItems]
  )
  const bundleCost = useMemo(
    () => bundleItems.reduce((sum, b) => sum + b.cost, 0),
    [bundleItems]
  )

  const bundleName = useMemo(() => {
    if (mode === 'same') return `Cookie Bundle — ${sameName} ×3`
    const names = bundleItems.map((b) => b.name).join(', ')
    return `Cookie Bundle — Assorted (${names})`
  }, [mode, sameName, bundleItems])

  const isValid = bundleItems.length === 3 && bundlePrice > 0

  // ── Assorted slot selector ────────────────────────────────────────────────
  const setSlot = (slotIdx: number, name: string) => {
    const opt = cookieOptions.find((o) => o.name === name) ?? null
    if (slotIdx === 0) setSlot1(opt)
    else if (slotIdx === 1) setSlot2(opt)
    else setSlot3(opt)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleAddToCart = () => {
    if (!isValid) return
    const cartBundleItems: CartItem[] = bundleItems.map((b) => ({
      name: b.name, size: b.size, price: b.price, cost: b.cost, qty: 1,
    }))
    const bundleCartItem: CartItem = {
      name:        bundleName,
      size:        'bundle',
      price:       bundlePrice,
      cost:        bundleCost,
      qty:         1,
      isBundle:    true,
      bundleItems: cartBundleItems,
    }
    addToCart(bundleCartItem)
    onClose()
  }

  const handleSavePreOrder = () => {
    if (!isValid || !poCustomer.trim()) return
    const cartBundleItems: CartItem[] = bundleItems.map((b) => ({
      name: b.name, size: b.size, price: b.price, cost: b.cost, qty: 1,
    }))
    const orderPayload = {
      customer:  poCustomer.trim(),
      address:   poAddress.trim(),
      method:    poMethod,
      isTakeout: poTakeout,
      items: [{
        name:        bundleName,
        size:        'bundle' as DrinkSize,
        price:       bundlePrice,
        cost:        bundleCost,
        qty:         1,
        isBundle:    true,
        bundleItems: cartBundleItems.map((bi) => ({
          name: bi.name, size: bi.size, price: bi.price, cost: bi.cost, qty: bi.qty,
        })),
      }],
      total:       bundlePrice,
      ...(poMethod === 'CASH' && poCash > 0 ? { cashReceived: poCash } : {}),
    }
    addPreOrder(orderPayload)
    onClose()
  }

  // ── Slot row renderer ─────────────────────────────────────────────────────
  const renderSlot = (label: string, slotIdx: number, slot: CookieOption | null) => {
    const slotName = slot?.name ?? cookieNames[0] ?? ''
    return (
      <div key={slotIdx} className='bundle-modal__slot'>
        <span className='bundle-modal__slot-label'>{label}</span>
        <select
          className='bundle-modal__select'
          value={slotName}
          onChange={(e) => setSlot(slotIdx, e.target.value)}
        >
          {cookieNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {slot && (
          <span className='bundle-modal__slot-price'>₱{slot.price} · 75g</span>
        )}
      </div>
    )
  }

  return (
    <div className='bundle-modal-overlay' onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className='bundle-modal'>
        <div className='bundle-modal__header'>
          <h2 className='bundle-modal__title'>Cookie Bundle</h2>
          <span className='bundle-modal__subtitle'>3 cookies · −₱15 discount · min ₱200</span>
          <button className='bundle-modal__close' onClick={onClose}>✕</button>
        </div>

        {/* Mode tabs */}
        <div className='bundle-modal__tabs'>
          {(['same', 'assorted'] as BundleMode[]).map((m) => (
            <button
              key={m}
              className={`bundle-modal__tab${mode === m ? ' bundle-modal__tab--active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'same' ? 'Same Flavor' : 'Assorted'}
            </button>
          ))}
        </div>

        <div className='bundle-modal__body'>
          {mode === 'same' ? (
            <div className='bundle-modal__same'>
              <div className='bundle-modal__field'>
                <label className='bundle-modal__label'>Cookie Flavor</label>
                <select
                  className='bundle-modal__select bundle-modal__select--wide'
                  value={sameName}
                  onChange={(e) => setSameName(e.target.value)}
                >
                  {cookieNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className='bundle-modal__assorted'>
              {renderSlot('Cookie 1', 0, slot1)}
              {renderSlot('Cookie 2', 1, slot2)}
              {renderSlot('Cookie 3', 2, slot3)}
            </div>
          )}

          {/* Price summary */}
          {isValid && (
            <div className='bundle-modal__price-summary'>
              <div className='bundle-modal__price-row'>
                <span>3 cookies subtotal</span>
                <span>₱{bundleItems.reduce((s, b) => s + b.price, 0).toFixed(2)}</span>
              </div>
              <div className='bundle-modal__price-row bundle-modal__price-row--discount'>
                <span>Bundle discount</span>
                <span>−₱15.00</span>
              </div>
              {bundleItems.reduce((s, b) => s + b.price, 0) - 15 < 200 && (
                <div className='bundle-modal__price-row bundle-modal__price-row--floor'>
                  <span>Minimum price applied</span>
                  <span>₱200.00</span>
                </div>
              )}
              <div className='bundle-modal__price-row bundle-modal__price-row--total'>
                <span>Bundle Price</span>
                <span>₱{bundlePrice.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Pre-order toggle */}
          <div className='bundle-modal__preorder-toggle'>
            <label className='bundle-modal__checkbox-label'>
              <input
                type='checkbox'
                checked={isPreOrder}
                onChange={(e) => setIsPreOrder(e.target.checked)}
              />
              Save as Pre-Order (advance order)
            </label>
          </div>

          {/* Pre-order form */}
          {isPreOrder && (
            <div className='bundle-modal__preorder-form'>
              <div className='bundle-modal__field'>
                <label className='bundle-modal__label'>Customer Name *</label>
                <input
                  className='bundle-modal__input'
                  value={poCustomer}
                  onChange={(e) => setPoCustomer(e.target.value)}
                  placeholder='Customer name…'
                />
              </div>
              <div className='bundle-modal__field'>
                <label className='bundle-modal__label'>Address</label>
                <input
                  className='bundle-modal__input'
                  value={poAddress}
                  onChange={(e) => setPoAddress(e.target.value)}
                  placeholder='Delivery address…'
                />
              </div>
              <div className='bundle-modal__field'>
                <label className='bundle-modal__label'>Payment</label>
                <div className='bundle-modal__size-toggle'>
                  {(['CASH', 'GCASH'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      className={`bundle-modal__size-btn${poMethod === m ? ' bundle-modal__size-btn--active' : ''}`}
                      onClick={() => setPoMethod(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {poMethod === 'CASH' && (
                <div className='bundle-modal__field'>
                  <label className='bundle-modal__label'>Cash Received</label>
                  <input
                    type='number'
                    className='bundle-modal__input'
                    value={poCash || ''}
                    onChange={(e) => setPoCash(parseFloat(e.target.value) || 0)}
                    placeholder={`₱${bundlePrice.toFixed(2)}`}
                    min={0}
                  />
                </div>
              )}
              <div className='bundle-modal__field'>
                <label className='bundle-modal__checkbox-label'>
                  <input
                    type='checkbox'
                    checked={poTakeout}
                    onChange={(e) => setPoTakeout(e.target.checked)}
                  />
                  Takeout
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className='bundle-modal__actions'>
          <button className='bundle-modal__cancel-btn' onClick={onClose}>Cancel</button>
          {isPreOrder ? (
            <button
              className='bundle-modal__confirm-btn'
              disabled={!isValid || !poCustomer.trim()}
              onClick={handleSavePreOrder}
            >
              Save Pre-Order
            </button>
          ) : (
            <button
              className='bundle-modal__confirm-btn'
              disabled={!isValid}
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BundleSelectorModal
