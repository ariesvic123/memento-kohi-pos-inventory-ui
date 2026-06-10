import React, { useMemo, useRef, useState, useEffect } from 'react'

import { usePOS }        from '../../../../context/POSContext'
import { CartItem, CostingRow, DrinkSize, SellingPriceRow } from '../../../../config/utils/pos.types'
import MenuCard          from './MenuCard'
import CartPanel         from './CartPanel'
import NotesModal        from '../modals/NotesModal'
import StockWarningModal from '../modals/StockWarningModal'

const CATEGORY_ORDER = ['Coffee', 'Non-Coffee', 'Food', 'Extras']

const parsePrice = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }

const resolveCategory = (item: SellingPriceRow, costing: CostingRow[]): string => {
  const raw = String(item.Category ?? '').trim().toLowerCase()
  if (raw === 'food')                               return 'Food'
  if (raw === 'coffee')                             return 'Coffee'
  if (raw === 'non-coffee' || raw === 'non coffee') return 'Non-Coffee'
  if (raw === 'extras' || raw === 'extra')          return 'Extras'

  // Unit-only items (Shots, Latte Art, Slice — no sized cups, no cookies) → Extras
  const hasDrinkSizes  = ['8oz', '12oz', '16oz'].some((sz) => parsePrice(item[`Actual Price (${sz})`]) > 0)
  const hasCookieSizes = ['60g', '70g'].some((sz)          => parsePrice(item[`Actual Price (${sz})`]) > 0)
  if (!hasDrinkSizes && !hasCookieSizes) return 'Extras'

  const drinkName = String(item.Drinks ?? '').trim().toLowerCase()
  const costRow   = costing.find(
    (c) => String(c.Drinks ?? '').trim().toLowerCase() === drinkName
  )
  if (!costRow) return 'Non-Coffee'

  const beanType = String(costRow['Bean Type'] ?? '').trim().toLowerCase()
  return beanType && beanType !== 'n/a' ? 'Coffee' : 'Non-Coffee'
}

const POSTerminal: React.FC = () => {
  const {
    sellingPrices,
    costing,
    inventory,
    bestSellers,
    cart,
    addToCart,
    incrementCart,
    decrementCart,
    removeFromCart,
    clearCart,
    startCheckoutPreview,
  } = usePOS()

  const [pendingItem,   setPendingItem]   = useState<CartItem | null>(null)
  const [search,        setSearch]        = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // / → focus search (when not already in an input)
      if (e.key === '/' && !inInput) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      // Escape → clear search / close pending modal
      if (e.key === 'Escape') {
        if (pendingItem) { setPendingItem(null); return }
        if (search)      { setSearch(''); return }
      }
      // Ctrl+Enter → checkout
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (cart.length) { e.preventDefault(); startCheckoutPreview() }
      }
      // ? → toggle shortcuts panel (when not in input)
      if (e.key === '?' && !inInput) {
        setShowShortcuts((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, search, pendingItem, startCheckoutPreview])

  const extras = useMemo<CartItem[]>(() => {
    return sellingPrices
      .filter((item) => resolveCategory(item as SellingPriceRow, costing) === 'Extras')
      .map((item) => {
        const price =
          parsePrice(item['Actual Price (Shots)'])     ||
          parsePrice(item['Actual Price (Latte Art)']) ||
          parsePrice(item['Actual Price (Slice)'])     ||
          parsePrice(item['Actual Price'])
        const costRow = costing.find(
          (c) => String(c.Drinks ?? '').trim().toLowerCase() === String(item.Drinks ?? '').trim().toLowerCase()
        )
        const cost = costRow
          ? parsePrice(costRow['Shots']) || parsePrice(costRow['Latte Art']) || parsePrice(costRow['Slice']) || 0
          : 0
        return { name: String(item.Drinks), size: 'unit' as DrinkSize, price, cost, qty: 1 }
      })
      .filter((item) => item.price > 0)
  }, [sellingPrices, costing])

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    const map = new Map<string, SellingPriceRow[]>()
    sellingPrices
      .filter((item) => !term || String(item.Drinks ?? '').toLowerCase().includes(term))
      .forEach((item) => {
        const cat = resolveCategory(item as SellingPriceRow, costing)
        if (!map.has(cat)) map.set(cat, [])
        map.get(cat)!.push(item as SellingPriceRow)
      })
    const ordered = new Map<string, SellingPriceRow[]>()
    CATEGORY_ORDER.forEach((cat) => { if (map.has(cat)) ordered.set(cat, map.get(cat)!) })
    map.forEach((v, k) => { if (!ordered.has(k)) ordered.set(k, v) })
    return ordered
  }, [sellingPrices, costing, search])

  const handleSelectItem = (item: CartItem) => setPendingItem(item)

  const handleNotesConfirm = (item: CartItem, selectedExtras: CartItem[]) => {
    addToCart(selectedExtras.length > 0 ? { ...item, addOns: selectedExtras } : item)
    setPendingItem(null)
  }

  return (
    <div className='pos-terminal'>
      <div className='pos-terminal__menu'>
        {/* Search bar */}
        <div className='pos-terminal__search-wrap'>
          <span className='pos-terminal__search-icon'><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='5.5' cy='5.5' r='4'/><path d='M9 9l2.5 2.5'/></svg></span>
          <input
            ref={searchRef}
            type='text'
            className='pos-terminal__search'
            placeholder='Search drinks… ( / )'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className='pos-terminal__search-clear' onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category} className={`pos-terminal__section pos-terminal__section--${category.toLowerCase().replace(/\s+/g, '-')}`}>
            <h3 className='pos-terminal__section-title'>{category}</h3>
            <div className='pos-terminal__grid'>
              {items.map((drink, i) => (
                <MenuCard
                  key={i}
                  drink={drink}
                  costing={costing}
                  inventory={inventory}
                  isBestSeller={bestSellers.includes(String(drink.Drinks))}
                  onSelectItem={handleSelectItem}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <CartPanel
        cart={cart}
        onIncrement={incrementCart}
        onDecrement={decrementCart}
        onRemove={removeFromCart}
        onClear={clearCart}
        onStartPreview={startCheckoutPreview}
      />

      <NotesModal
        item={pendingItem}
        extras={extras}
        onConfirm={handleNotesConfirm}
        onClose={() => setPendingItem(null)}
      />

      <StockWarningModal />

      {/* Shortcuts help badge */}
      <button
        className='terminal-shortcuts__toggle'
        onClick={() => setShowShortcuts((v) => !v)}
        title='Keyboard shortcuts (?)'
      >
        ?
      </button>
      {showShortcuts && (
        <div className='terminal-shortcuts__panel'>
          <p className='terminal-shortcuts__heading'>Keyboard Shortcuts</p>
          <div className='terminal-shortcuts__row'><kbd>/</kbd><span>Focus search</span></div>
          <div className='terminal-shortcuts__row'><kbd>Esc</kbd><span>Clear search / close modal</span></div>
          <div className='terminal-shortcuts__row'><kbd>Ctrl+Enter</kbd><span>Checkout</span></div>
          <div className='terminal-shortcuts__row'><kbd>?</kbd><span>Toggle this panel</span></div>
        </div>
      )}
    </div>
  )
}

export default POSTerminal
