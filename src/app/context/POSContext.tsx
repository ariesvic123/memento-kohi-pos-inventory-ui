// ============================================================
// POS CONTEXT
// Single source of truth for all POS + Inventory state.
// Consumed via usePOS() hook — no prop drilling.
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as XLSX from 'xlsx'

import {
  CartItem,
  CostingRow,
  CustomerInfo,
  DeductionPreviewItem,
  FoodCostingRow,
  InventoryItem,
  LastReceipt,
  PendingOrder,
  PendingOrderItem,
  RawIngredientPricingRow,
  RestockEntry,
  SaleRow,
  SellingPriceRow,
} from '../config/utils/pos.types'
// Returns today as YYYY-MM-DD — locale-independent, safe for storage and comparison
const toISODate = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

import {
  applyRestockToInventory,
  computeInventoryAfterDeduction,
  computeTakeoutBagCost,
  computeTakeoutBagCounts,
  computeVoidDeltas,
  dateStrToExcelSerial,
  exportPOSData as exportHelper,
  FormulaMap,
  parseWorkbook,
  recalcIngredientPricesFromRestocks,
  recomputeDrinkCostsFromFormulaMap,
  recomputeDrinkCostsFromIngredientChange,
  recomputeDrinkCostsFromVolumeChanges,
  recomputePerCupPricesFromVolumes,
} from '../config/utils/pos.helpers'


// ─── Shape ───────────────────────────────────────────────────────────────────

interface POSContextValue {
  // store state
  isStoreOpen: boolean
  initializeStore: (wb: XLSX.WorkBook) => void

  // data
  inventory:             InventoryItem[]
  costing:               CostingRow[]
  foodCosting:           FoodCostingRow[]
  sellingPrices:         SellingPriceRow[]
  dailySales:            SaleRow[]
  rawIngredientsPricing: RawIngredientPricingRow[]
  restockRows:           RestockEntry[]
  formulaMap:            FormulaMap

  // restock action
  addRestock: (entry: Omit<RestockEntry, 'Date'> & { dateStr: string }) => void

  // sheet editors
  updateInventoryItem:         (index: number, patch: Partial<InventoryItem>) => void
  updateSellingPrice:          (index: number, patch: Partial<SellingPriceRow>) => void
  updateIngredientPricing:     (index: number, patch: Partial<RawIngredientPricingRow>) => void
  batchSaveIngredientPricing:  (newPricing: RawIngredientPricingRow[]) => void

  // cart
  cart:            CartItem[]
  addToCart:       (item: CartItem) => void
  incrementCart:   (index: number) => void
  decrementCart:   (index: number) => void
  removeFromCart:  (index: number) => void
  clearCart:       () => void

  // customer
  customerInfo:       CustomerInfo
  setCustomerInfo:    React.Dispatch<React.SetStateAction<CustomerInfo>>

  // checkout flow
  isPreviewing:         boolean
  deductionPreview:     DeductionPreviewItem[]
  barPercentages:       number[]
  startCheckoutPreview: () => void
  cancelPreview:        () => void
  confirmSale:          () => void

  // stock warning (shown instead of preview when stock is insufficient)
  stockWarning:      string[]
  clearStockWarning: () => void

  // success modal
  checkoutOpen:      boolean
  closeCheckout:     () => void
  lastSaleStats:     { rev: number; prof: number }
  lastOrderNumber:   number
  resetOrderNumber:  () => void

  // receipt
  lastReceipt: LastReceipt | null
  clearReceipt: () => void

  // inventory animation
  animateBars:       boolean

  // export
  exportPOSData: () => void

  // restock edit
  updateRestockEntry: (index: number, updated: RestockEntry) => void

  // pending orders (delivery / call-in queue)
  pendingOrders:        PendingOrder[]
  addPendingOrder:      (order: Omit<PendingOrder, 'id' | 'orderNo' | 'date' | 'createdAt'>) => void
  completePendingOrder: (id: string) => void
  deletePendingOrder:   (id: string) => void
  updatePendingOrder:   (id: string, patch: Partial<Pick<PendingOrder, 'method' | 'notes' | 'cashReceived'>>) => void

  // bundle pre-orders (advance orders, saved to Excel)
  addPreOrder:      (order: Omit<PendingOrder, 'id' | 'orderNo' | 'date' | 'createdAt' | 'isPreOrder'>) => void
  completePreOrder: (id: string) => void
  deletePreOrder:   (id: string) => void

  // void / refund (reverses inventory deduction + removes from daily sales)
  voidOrder: (orderNo: number | undefined, customer: string, time: string) => void

  // logout
  logout: () => void

  // analytics
  stats: { rev: number; prof: number; exp: number; margin: number }
  bestSellers: string[]
}

// ─── Context ──────────────────────────────────────────────────────────────────

const POSContext = createContext<POSContextValue | null>(null)

export const usePOS = (): POSContextValue => {
  const ctx = useContext(POSContext)
  if (!ctx) throw new Error('usePOS must be used inside POSProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  const [wbSource,    setWbSource]    = useState<XLSX.WorkBook | null>(null)

  const [inventory,             setInventory]             = useState<InventoryItem[]>([])
  const [costing,               setCosting]               = useState<CostingRow[]>([])
  const [foodCosting,           setFoodCosting]           = useState<FoodCostingRow[]>([])
  const [sellingPrices,         setSellingPrices]         = useState<SellingPriceRow[]>([])
  const [dailySales,            setDailySales]            = useState<SaleRow[]>([])
  const [rawIngredientsPricing, setRawIngredientsPricing] = useState<RawIngredientPricingRow[]>([])
  const [restockRows,           setRestockRows]           = useState<RestockEntry[]>([])
  const [newRestocks,           setNewRestocks]           = useState<RestockEntry[]>([])
  const [formulaMap,            setFormulaMap]            = useState<FormulaMap>(new Map())
  const [lastSaleStats,         setLastSaleStats]         = useState<{ rev: number; prof: number }>({ rev: 0, prof: 0 })
  const [orderNumber,           setOrderNumber]           = useState<number>(() => {
    const saved = localStorage.getItem('memento_order_number')
    return saved ? parseInt(saved, 10) : 1
  })
  const [pendingOrders,         setPendingOrders]         = useState<PendingOrder[]>(() => {
    try {
      const raw = localStorage.getItem('memento_pending_orders')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })

  const [cart,         setCart]         = useState<CartItem[]>([])
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: '', method: 'CASH', isTakeout: false })

  const [isPreviewing,     setIsPreviewing]     = useState(false)
  const [deductionPreview, setDeductionPreview] = useState<DeductionPreviewItem[]>([])
  const [barPercentages,   setBarPercentages]   = useState<number[]>([])
  const [checkoutOpen,     setCheckoutOpen]     = useState(false)
  const [animateBars,      setAnimateBars]      = useState(false)
  const [stockWarning,     setStockWarning]     = useState<string[]>([])
  const [lastReceipt,      setLastReceipt]      = useState<LastReceipt | null>(null)

  // ─── Auto-restore from localStorage ───────────────────────────────────────
  useEffect(() => {
    const wb64 = localStorage.getItem('memento_wb_backup')
    if (!wb64) return
    try {
      const wb     = XLSX.read(wb64, { type: 'base64', cellStyles: true, cellFormula: true })
      const parsed = parseWorkbook(wb)
      setWbSource(wb)

      // Restore editable sheets from their own backups (user may have changed vols/prices)
      const savedIngr   = localStorage.getItem('memento_ingredients_backup')
      const savedSP     = localStorage.getItem('memento_selling_prices_backup')
      const savedCosting = localStorage.getItem('memento_costing_backup')

      setRawIngredientsPricing(savedIngr    ? JSON.parse(savedIngr)    : parsed.rawIngredientsPricing)
      const parsedSavedCosting: unknown[] = savedCosting ? JSON.parse(savedCosting) : []
      setCosting(parsedSavedCosting.length  ? parsedSavedCosting as typeof parsed.costing : parsed.costing)
      setFoodCosting(parsed.foodCosting)
      setSellingPrices(savedSP              ? JSON.parse(savedSP)      : parsed.sellingPrices as SellingPriceRow[])

      const savedSales       = localStorage.getItem('memento_sales_backup')
      const savedInventory   = localStorage.getItem('memento_inventory_backup')
      const savedNewRestocks = localStorage.getItem('memento_new_restocks_backup')
      const parsedNewRestocks: RestockEntry[] = savedNewRestocks ? JSON.parse(savedNewRestocks) : []
      setDailySales(savedSales       ? JSON.parse(savedSales)       : parsed.dailySales)
      setInventory(savedInventory    ? JSON.parse(savedInventory)   : parsed.inventory)
      setNewRestocks(parsedNewRestocks)
      // Merge not-yet-exported restocks back into the history list so they appear in the UI
      setRestockRows(parsedNewRestocks.length
        ? [...parsed.restockRows, ...parsedNewRestocks]
        : parsed.restockRows)
      setFormulaMap(parsed.formulaMap)
      setIsStoreOpen(true)
    } catch { /* corrupt backup — user will re-upload */ }
  }, [])

  useEffect(() => {
    if (dailySales.length)
      localStorage.setItem('memento_sales_backup', JSON.stringify(dailySales))
  }, [dailySales])

  useEffect(() => {
    if (inventory.length)
      localStorage.setItem('memento_inventory_backup', JSON.stringify(inventory))
  }, [inventory])

  // Persist user edits to Ingredients Pricing, Selling Prices, and Drinks Costing
  useEffect(() => {
    if (rawIngredientsPricing.length)
      localStorage.setItem('memento_ingredients_backup', JSON.stringify(rawIngredientsPricing))
  }, [rawIngredientsPricing])

  useEffect(() => {
    if (sellingPrices.length)
      localStorage.setItem('memento_selling_prices_backup', JSON.stringify(sellingPrices))
  }, [sellingPrices])

  useEffect(() => {
    if (costing.length)
      localStorage.setItem('memento_costing_backup', JSON.stringify(costing))
  }, [costing])

  useEffect(() => {
    localStorage.setItem('memento_new_restocks_backup', JSON.stringify(newRestocks))
  }, [newRestocks])

  // ─── Store init ───────────────────────────────────────────────────────────
  const initializeStore = useCallback((wb: XLSX.WorkBook) => {
    const parsed = parseWorkbook(wb)
    setWbSource(wb)
    setInventory(parsed.inventory)
    setRawIngredientsPricing(parsed.rawIngredientsPricing)
    setCosting(parsed.costing)
    setFoodCosting(parsed.foodCosting)
    setSellingPrices(parsed.sellingPrices as SellingPriceRow[])
    setDailySales(parsed.dailySales)
    setRestockRows(parsed.restockRows)
    setFormulaMap(parsed.formulaMap)
    setNewRestocks([])

    // Restore pre-orders from Excel; keep any in-session non-pre-orders from localStorage
    setPendingOrders((prev) => {
      const regular   = prev.filter((o) => !o.isPreOrder)
      const fromExcel = parsed.preOrders ?? []
      const merged    = [...regular, ...fromExcel]
      savePending(merged)
      return merged
    })

    setIsStoreOpen(true)

    const wb64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true })
    localStorage.setItem('memento_wb_backup', wb64)
    // Clear all backups so fresh Excel data takes effect
    localStorage.removeItem('memento_sales_backup')
    localStorage.removeItem('memento_inventory_backup')
    localStorage.removeItem('memento_ingredients_backup')
    localStorage.removeItem('memento_selling_prices_backup')
    localStorage.removeItem('memento_costing_backup')
    localStorage.removeItem('memento_new_restocks_backup')
  }, [])

  // ─── Cart actions ─────────────────────────────────────────────────────────
  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      if (item.addOns?.length) return [...prev, item]
      const existing = prev.find(
        (x) => !x.addOns?.length && x.name === item.name && x.size === item.size && (x.notes || '') === (item.notes || '')
      )
      if (existing) return prev.map((x) => x === existing ? { ...x, qty: x.qty + 1 } : x)
      return [...prev, item]
    })
  }, [])

  const incrementCart = useCallback((index: number) => {
    setCart((prev) => prev.map((x, i) => i === index ? { ...x, qty: x.qty + 1 } : x))
  }, [])

  const decrementCart = useCallback((index: number) => {
    setCart((prev) => prev.map((x, i) => i === index && x.qty > 1 ? { ...x, qty: x.qty - 1 } : x))
  }, [])

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  // ─── Restock action ───────────────────────────────────────────────────────
  const addRestock = useCallback(
    (entry: Omit<RestockEntry, 'Date'> & { dateStr: string }) => {
      const serial   = dateStrToExcelSerial(entry.dateStr)
      const full: RestockEntry = { ...entry, Date: serial }

      // Update inventory stock + last restock date (unchanged logic)
      const { inventory: inv2 } = applyRestockToInventory(inventory, rawIngredientsPricing, full)

      // Recalc ingredient prices (and per-cup prices) from LATEST restock across ALL entries
      const allRestocks = [...restockRows, full]
      const { newPricing } = recalcIngredientPricesFromRestocks(rawIngredientsPricing, allRestocks)

      // Exact recomputation via formula map; delta fallback when map is unavailable
      const costing2 = formulaMap.size
        ? recomputeDrinkCostsFromFormulaMap(costing, newPricing, formulaMap)
        : recomputeDrinkCostsFromIngredientChange(costing, rawIngredientsPricing, newPricing)

      setInventory(inv2)
      setRawIngredientsPricing(newPricing)
      setCosting(costing2)
      setRestockRows(allRestocks)
      setNewRestocks((prev) => [...prev, full])
    },
    [inventory, rawIngredientsPricing, costing, restockRows, formulaMap]
  )

  // Edit an existing restock entry: updates prices/costing across the app.
  // Inventory stock levels are not retroactively adjusted (price/supplier/date
  // corrections are the common case; volume/qty changes are rare and complex).
  const updateRestockEntry = useCallback(
    (index: number, updated: RestockEntry) => {
      const allRestocks = restockRows.map((r, i) => i === index ? updated : r)
      const { newPricing } = recalcIngredientPricesFromRestocks(rawIngredientsPricing, allRestocks)
      const costing2 = formulaMap.size
        ? recomputeDrinkCostsFromFormulaMap(costing, newPricing, formulaMap)
        : recomputeDrinkCostsFromIngredientChange(costing, rawIngredientsPricing, newPricing)
      setRestockRows(allRestocks)
      setRawIngredientsPricing(newPricing)
      setCosting(costing2)
    },
    [rawIngredientsPricing, costing, restockRows, formulaMap]
  )

  // ─── Sheet editors ────────────────────────────────────────────────────────
  const updateInventoryItem = useCallback((index: number, patch: Partial<InventoryItem>) => {
    setInventory((prev) => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }, [])

  const updateSellingPrice = useCallback((index: number, patch: Partial<SellingPriceRow>) => {
    setSellingPrices((prev) => prev.map((row, i) => i === index ? { ...row, ...patch } : row))
  }, [])

  const updateIngredientPricing = useCallback((index: number, patch: Partial<RawIngredientPricingRow>) => {
    setRawIngredientsPricing((prev) => prev.map((row, i) => i === index ? { ...row, ...patch } : row))
  }, [])

  // Batch save: updates all ingredient volumes at once and recomputes drink costs.
  const batchSaveIngredientPricing = useCallback(
    (newPricing: RawIngredientPricingRow[]) => {
      // Recompute per-cup prices first so formula-map sum uses current values
      const pricingWithPerCup = recomputePerCupPricesFromVolumes(newPricing)
      const updatedCosting = formulaMap.size
        ? recomputeDrinkCostsFromFormulaMap(costing, pricingWithPerCup, formulaMap)
        : recomputeDrinkCostsFromVolumeChanges(costing, rawIngredientsPricing, pricingWithPerCup)
      setRawIngredientsPricing(pricingWithPerCup)
      setCosting(updatedCosting)
    },
    [costing, rawIngredientsPricing, formulaMap]
  )

  // ─── Checkout preview ─────────────────────────────────────────────────────
  const clearStockWarning = useCallback(() => setStockWarning([]), [])

  const startCheckoutPreview = useCallback(() => {
    if (!cart.length) return

    const deducted = computeInventoryAfterDeduction(inventory, cart, costing, rawIngredientsPricing, foodCosting)

    // Block checkout if any ingredient would go negative
    const insufficient = deducted
      .filter((row) => {
        const after = typeof row.stock === 'number'
          ? row.stock
          : parseFloat(String(row.STOCKS ?? row.VOLUME ?? 0))
        return after < 0
      })
      .map((row) => String(row.INGREDIENTS ?? ''))
      .filter(Boolean)

    if (insufficient.length > 0) {
      setStockWarning(insufficient)
      return
    }

    setDeductionPreview(deducted)
    setBarPercentages(deducted.map(() => 100))
    setIsPreviewing(true)

    setTimeout(() => {
      const newPercents = deducted.map((row) => {
        const original = inventory.find(
          (inv) => String(inv.INGREDIENTS).trim().toLowerCase() === String(row.INGREDIENTS).trim().toLowerCase()
        )
        const before = parseFloat(String(original?.stock ?? original?.STOCKS ?? original?.VOLUME ?? 0))
        const after  = parseFloat(String(row.stock ?? row.STOCKS ?? row.VOLUME ?? before))
        return before > 0 ? (after / before) * 100 : 0
      })
      setBarPercentages(newPercents)
    }, 200)
  }, [cart, inventory, costing, rawIngredientsPricing])

  const cancelPreview = useCallback(() => setIsPreviewing(false), [])

  // ─── Confirm sale ─────────────────────────────────────────────────────────
  const confirmSale = useCallback(() => {
    const timestamp   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    const dateStamp   = toISODate()
    const currentOrder = orderNumber

    const takeoutBags = customerInfo.isTakeout ? computeTakeoutBagCounts(cart) : undefined
    const tempInv     = computeInventoryAfterDeduction(
      inventory, cart, costing, rawIngredientsPricing, foodCosting, takeoutBags
    )

    // negative stock guard
    const hasNegative = tempInv.some((item) => {
      const key = 'STOCKS' in item ? 'STOCKS' : 'VOLUME' in item ? 'VOLUME' : null
      if (!key) return false
      return parseFloat(String(item[key])) < 0
    })
    if (hasNegative) {
      alert('Insufficient stock! Sale cancelled.')
      return
    }

    // Build pending order items — preserve parent-child nesting for display
    const orderItems: PendingOrderItem[] = cart.map((item) => {
      const base: PendingOrderItem = {
        name:  item.name,
        size:  item.size,
        qty:   item.qty,
        price: item.price,
        cost:  item.cost,
      }
      if (item.temperature) base.temperature = item.temperature
      if (item.isBundle && item.bundleItems?.length) {
        base.isBundle    = true
        base.bundleItems = item.bundleItems.map((bi) => ({
          name: bi.name, size: bi.size, qty: bi.qty, price: bi.price, cost: bi.cost,
        }))
      }
      if (item.addOns?.length) {
        base.addOns = item.addOns.map((ao) => ({
          name:  ao.name,
          size:  ao.size,
          qty:   item.qty,
          price: ao.price,
          cost:  ao.cost,
        }))
      }
      return base
    })

    // Total includes add-ons per item
    const total = cart.reduce((s, item) => {
      const addOnSum = (item.addOns ?? []).reduce((ss, ao) => ss + ao.price, 0)
      return s + (item.price + addOnSum) * item.qty
    }, 0)
    const profit = cart.reduce((s, item) => {
      const mainProfit   = (item.price - item.cost) * item.qty
      const addOnProfit  = (item.addOns ?? []).reduce((ss, ao) => ss + (ao.price - ao.cost) * item.qty, 0)
      return s + mainProfit + addOnProfit
    }, 0)

    // Commit inventory deduction immediately (items are being prepared)
    setInventory((prev) =>
      prev.map((item) => {
        const updated = tempInv.find(
          (t) => String(t.INGREDIENTS ?? '').trim().toLowerCase() === String(item.INGREDIENTS ?? '').trim().toLowerCase()
        )
        if (!updated) return item
        const newStock = typeof updated.stock === 'number'
          ? updated.stock
          : parseFloat(String(updated.STOCKS ?? updated.VOLUME ?? 0))
        return { ...item, stock: newStock, originalStock: item.originalStock }
      })
    )

    // Add to pending orders queue (NOT dailySales — will move there when checked)
    const newOrder: PendingOrder = {
      id:        Math.random().toString(36).slice(2, 9),
      orderNo:   currentOrder,
      customer:  customerInfo.name,
      address:   '',
      method:    customerInfo.method,
      items:     orderItems,
      total,
      date:      dateStamp,
      createdAt: timestamp,
      isTakeout: customerInfo.isTakeout,
      ...(customerInfo.method === 'CASH' && customerInfo.cashReceived
        ? { cashReceived: customerInfo.cashReceived }
        : {}),
    }
    setPendingOrders((prev) => {
      const updated = [...prev, newOrder]
      savePending(updated)
      return updated
    })

    // Subtract plastic bag cost from profit for takeout orders
    const bagCost = customerInfo.isTakeout
      ? (() => {
          const { doubleBags, singleBags } = computeTakeoutBagCounts(cart)
          return computeTakeoutBagCost(doubleBags, singleBags, rawIngredientsPricing)
        })()
      : 0

    setLastSaleStats({ rev: total, prof: profit - bagCost })

    // Store receipt data before cart is cleared
    const cashRcv   = customerInfo.method === 'CASH' ? (customerInfo.cashReceived ?? total) : undefined
    const cashChng  = cashRcv !== undefined ? Math.max(0, cashRcv - total) : undefined
    const baseReceipt = {
      orderNo:   currentOrder,
      customer:  customerInfo.name,
      method:    customerInfo.method,
      isTakeout: customerInfo.isTakeout,
      items:     orderItems,
      total,
      date:      dateStamp,
      time:      timestamp,
    }
    setLastReceipt({
      ...baseReceipt,
      ...(cashRcv   !== undefined ? { cashReceived: cashRcv   } : {}),
      ...(cashChng  !== undefined ? { change:       cashChng  } : {}),
    })
    const nextOrder = currentOrder + 1
    setOrderNumber(nextOrder)
    localStorage.setItem('memento_order_number', String(nextOrder))
    setCart([])
    setIsPreviewing(false)
    setCheckoutOpen(true)

    setTimeout(() => {
      setAnimateBars(true)
      setTimeout(() => setAnimateBars(false), 2000)
    }, 2000)
  }, [cart, inventory, costing, rawIngredientsPricing, customerInfo, orderNumber])

  const closeCheckout = useCallback(() => setCheckoutOpen(false), [])

  const resetOrderNumber = useCallback(() => {
    setOrderNumber(1)
    localStorage.setItem('memento_order_number', '1')
  }, [])

  // ─── Pending orders ───────────────────────────────────────────────────────
  const savePending = (orders: PendingOrder[]) =>
    localStorage.setItem('memento_pending_orders', JSON.stringify(orders))

  const addPendingOrder = useCallback(
    (order: Omit<PendingOrder, 'id' | 'orderNo' | 'date' | 'createdAt'>) => {
      const id    = Math.random().toString(36).slice(2, 9)
      const now   = new Date()
      const full: PendingOrder = {
        ...order,
        id,
        orderNo:   orderNumber,
        date:      toISODate(now),
        createdAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      const next = orderNumber + 1
      setOrderNumber(next)
      localStorage.setItem('memento_order_number', String(next))
      setPendingOrders((prev) => {
        const updated = [...prev, full]
        savePending(updated)
        return updated
      })
    },
    [orderNumber]
  )

  const completePendingOrder = useCallback(
    (id: string) => {
      const order = pendingOrders.find((o) => o.id === id)
      if (!order) return
      const newRows: SaleRow[] = order.items.flatMap((item: PendingOrderItem) => {
        const main: SaleRow = {
          Date:      order.date,
          Time:      order.createdAt,
          Drink:     item.name,
          Size:      item.size,
          Qty:       item.qty,
          Price:     item.price,
          Revenue:   (item.price * item.qty).toFixed(2),
          NetProfit: ((item.price - item.cost) * item.qty).toFixed(2),
          Notes:     item.isBundle ? 'Bundle cookie' : '',
          Customer:  order.customer,
          Method:    order.method,
          OrderNo:   order.orderNo,
          ...(order.address ? { Address: order.address } : {}),
        }
        const addOnRows: SaleRow[] = (item.addOns ?? []).map((ao) => ({
          Date:      order.date,
          Time:      order.createdAt,
          Drink:     ao.name,
          Size:      ao.size,
          Qty:       item.qty,
          Price:     ao.price,
          Revenue:   (ao.price * item.qty).toFixed(2),
          NetProfit: ((ao.price - ao.cost) * item.qty).toFixed(2),
          Notes:     `Add-on for ${item.name}`,
          Customer:  order.customer,
          Method:    order.method,
          OrderNo:   order.orderNo,
          ...(order.address ? { Address: order.address } : {}),
        }))
        return [main, ...addOnRows]
      })
      setDailySales((prev) => [...prev, ...newRows])
      setPendingOrders((prev) => {
        const updated = prev.filter((o) => o.id !== id)
        savePending(updated)
        return updated
      })
    },
    [pendingOrders]
  )

  const deletePendingOrder = useCallback((id: string) => {
    const order = pendingOrders.find((o) => o.id === id)
    if (order && !order.isPreOrder) {
      // Restore inventory only for regular orders (pre-orders never deducted stock)
      const cartItems: CartItem[] = order.items.flatMap((item) => {
        const main: CartItem = { name: item.name, size: item.size, price: item.price, cost: item.cost, qty: item.qty }
        if (item.temperature) main.temperature = item.temperature
        if (item.isBundle && item.bundleItems?.length) {
          main.isBundle    = true
          main.bundleItems = item.bundleItems.map((bi) => ({
            name: bi.name, size: bi.size, price: bi.price, cost: bi.cost, qty: bi.qty,
          }))
        }
        const addOnItems: CartItem[] = (item.addOns ?? []).map((ao) => ({
          name: ao.name, size: ao.size, price: ao.price, cost: ao.cost, qty: item.qty,
        }))
        return [main, ...addOnItems]
      })
      const deltas = computeVoidDeltas(cartItems, costing, rawIngredientsPricing, foodCosting)
      setInventory((prev) =>
        prev.map((item) => {
          const key    = String(item.INGREDIENTS ?? '').trim().toLowerCase()
          const amount = deltas[key] ?? 0
          if (amount <= 0) return item
          return { ...item, stock: item.stock + amount }
        })
      )
    }
    setPendingOrders((prev) => {
      const updated = prev.filter((o) => o.id !== id)
      savePending(updated)
      return updated
    })
  }, [pendingOrders, costing, rawIngredientsPricing, foodCosting])

  const updatePendingOrder = useCallback(
    (id: string, patch: Partial<Pick<PendingOrder, 'method' | 'notes' | 'cashReceived'>>) => {
      setPendingOrders((prev) => {
        const updated = prev.map((o) => o.id === id ? { ...o, ...patch } : o)
        savePending(updated)
        return updated
      })
    },
    []
  )

  // ─── Bundle pre-orders (advance orders, no immediate inventory deduction) ────

  const addPreOrder = useCallback(
    (order: Omit<PendingOrder, 'id' | 'orderNo' | 'date' | 'createdAt' | 'isPreOrder'>) => {
      const id  = Math.random().toString(36).slice(2, 9)
      const now = new Date()
      const full: PendingOrder = {
        ...order,
        id,
        orderNo:   orderNumber,
        date:      toISODate(now),
        createdAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isPreOrder: true,
      }
      const next = orderNumber + 1
      setOrderNumber(next)
      localStorage.setItem('memento_order_number', String(next))
      setPendingOrders((prev) => {
        const updated = [...prev, full]
        savePending(updated)
        return updated
      })
    },
    [orderNumber]
  )

  const completePreOrder = useCallback(
    (id: string) => {
      const order = pendingOrders.find((o) => o.id === id && o.isPreOrder)
      if (!order) return

      // Build CartItems from order items for inventory deduction
      const cartItems: CartItem[] = order.items.map((item) => {
        const base: CartItem = {
          name: item.name, size: item.size, price: item.price, cost: item.cost, qty: item.qty,
        }
        if (item.isBundle && item.bundleItems?.length) {
          base.isBundle    = true
          base.bundleItems = item.bundleItems.map((bi) => ({
            name: bi.name, size: bi.size, price: bi.price, cost: bi.cost, qty: bi.qty,
          }))
        }
        return base
      })

      // Deduct inventory now (was not deducted at order creation)
      const takeoutBags = order.isTakeout ? computeTakeoutBagCounts(cartItems) : undefined
      const tempInv     = computeInventoryAfterDeduction(
        inventory, cartItems, costing, rawIngredientsPricing, foodCosting, takeoutBags
      )
      const hasNegative = tempInv.some((item) => {
        const key = 'STOCKS' in item ? 'STOCKS' : 'VOLUME' in item ? 'VOLUME' : null
        if (!key) return false
        return parseFloat(String(item[key as keyof typeof item])) < 0
      })
      if (hasNegative) {
        alert('Insufficient stock! Cannot complete pre-order.')
        return
      }
      setInventory((prev) =>
        prev.map((item) => {
          const updated = tempInv.find(
            (t) => String(t.INGREDIENTS ?? '').trim().toLowerCase() === String(item.INGREDIENTS ?? '').trim().toLowerCase()
          )
          if (!updated) return item
          const newStock = typeof updated.stock === 'number'
            ? updated.stock
            : parseFloat(String(updated.STOCKS ?? updated.VOLUME ?? 0))
          return { ...item, stock: newStock }
        })
      )

      // Add to daily sales — record bundle as one line, individual cookies inside
      const newRows: SaleRow[] = order.items.flatMap((item) => {
        if (item.isBundle) {
          return [{
            Date:      order.date,
            Time:      order.createdAt,
            Drink:     item.name,
            Size:      item.size,
            Qty:       item.qty,
            Price:     item.price,
            Revenue:   (item.price * item.qty).toFixed(2),
            NetProfit: ((item.price - item.cost) * item.qty).toFixed(2),
            Notes:     'Pre-order bundle',
            Customer:  order.customer,
            Method:    order.method,
            OrderNo:   order.orderNo,
            ...(order.address ? { Address: order.address } : {}),
          } as SaleRow]
        }
        return [{
          Date:      order.date,
          Time:      order.createdAt,
          Drink:     item.name,
          Size:      item.size,
          Qty:       item.qty,
          Price:     item.price,
          Revenue:   (item.price * item.qty).toFixed(2),
          NetProfit: ((item.price - item.cost) * item.qty).toFixed(2),
          Notes:     'Pre-order',
          Customer:  order.customer,
          Method:    order.method,
          OrderNo:   order.orderNo,
          ...(order.address ? { Address: order.address } : {}),
        } as SaleRow]
      })
      setDailySales((prev) => [...prev, ...newRows])

      setPendingOrders((prev) => {
        const updated = prev.filter((o) => o.id !== id)
        savePending(updated)
        return updated
      })
    },
    [pendingOrders, inventory, costing, rawIngredientsPricing, foodCosting]
  )

  const deletePreOrder = useCallback(
    (id: string) => {
      // No inventory to restore — pre-orders never deducted stock
      setPendingOrders((prev) => {
        const updated = prev.filter((o) => o.id !== id)
        savePending(updated)
        return updated
      })
    },
    []
  )

  const voidOrder = useCallback((orderNo: number | undefined, customer: string, time: string) => {
    const matchRow = (r: SaleRow) =>
      r.OrderNo === orderNo &&
      (r.Customer ?? '').trim() === customer &&
      r.Time === time

    const rows = dailySales.filter(matchRow)
    if (!rows.length) return

    // Reconstruct CartItems from sale rows
    const cartItems: CartItem[] = rows.map((r) => {
      const base: CartItem = { name: r.Drink, size: r.Size, price: r.Price, cost: 0, qty: r.Qty }
      if (r.Temperature) base.temperature = r.Temperature
      return base
    })

    const deltas = computeVoidDeltas(cartItems, costing, rawIngredientsPricing, foodCosting)

    setInventory((prev) =>
      prev.map((item) => {
        const key    = String(item.INGREDIENTS ?? '').trim().toLowerCase()
        const amount = deltas[key] ?? 0
        if (amount <= 0) return item
        return { ...item, stock: item.stock + amount }
      })
    )

    setDailySales((prev) => prev.filter((r) => !matchRow(r)))
  }, [dailySales, costing, rawIngredientsPricing, foodCosting])

  // ─── Export ───────────────────────────────────────────────────────────────
  const exportPOSData = useCallback(() => {
    if (!wbSource) { alert('No workbook loaded.'); return }
    try {
      const originalCount   = restockRows.length - newRestocks.length
      const originalRestocks = restockRows.slice(0, Math.max(0, originalCount))
      const activePreOrders = pendingOrders.filter((o) => o.isPreOrder)
      exportHelper(wbSource, inventory, dailySales, originalRestocks, newRestocks, rawIngredientsPricing, sellingPrices, activePreOrders)
      setNewRestocks([])
      localStorage.removeItem('memento_new_restocks_backup')
    } catch (err) {
      console.error('Export failed:', err)
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [wbSource, inventory, dailySales, restockRows, rawIngredientsPricing, sellingPrices, pendingOrders])

  // ─── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('memento_wb_backup')
    localStorage.removeItem('memento_sales_backup')
    localStorage.removeItem('memento_inventory_backup')
    localStorage.removeItem('memento_new_restocks_backup')
    setWbSource(null)
    setInventory([])
    setCosting([])
    setFoodCosting([])
    setSellingPrices([])
    setDailySales([])
    setRawIngredientsPricing([])
    setCart([])
    setRestockRows([])
    setNewRestocks([])
    setPendingOrders([])
    setOrderNumber(1)
    localStorage.removeItem('memento_order_number')
    localStorage.removeItem('memento_pending_orders')
    localStorage.removeItem('memento_ingredients_backup')
    localStorage.removeItem('memento_selling_prices_backup')
    localStorage.removeItem('memento_costing_backup')
    setIsStoreOpen(false)
  }, [])

  // ─── Analytics ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let rev = 0, prof = 0
    dailySales.forEach((s) => {
      rev  += parseFloat(s.Revenue)  || 0
      prof += parseFloat(s.NetProfit)|| 0
    })
    const exp = rev - prof
    return { rev, prof, exp, margin: rev > 0 ? (prof / rev) * 100 : 0 }
  }, [dailySales])

  const bestSellers = useMemo(() => {
    const counts: Record<string, number> = {}
    dailySales.forEach((s) => { counts[s.Drink] = (counts[s.Drink] || 0) + s.Qty })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
  }, [dailySales])

  // ─── Value ────────────────────────────────────────────────────────────────
  const value: POSContextValue = {
    isStoreOpen, initializeStore,
    inventory, costing, foodCosting, sellingPrices, dailySales, rawIngredientsPricing,
    restockRows, formulaMap, addRestock, updateRestockEntry,
    updateInventoryItem, updateSellingPrice, updateIngredientPricing, batchSaveIngredientPricing,
    cart, addToCart, incrementCart, decrementCart, removeFromCart, clearCart,
    customerInfo, setCustomerInfo,
    isPreviewing, deductionPreview, barPercentages,
    startCheckoutPreview, cancelPreview, confirmSale,
    stockWarning, clearStockWarning,
    lastReceipt, clearReceipt: () => setLastReceipt(null),
    checkoutOpen, closeCheckout, lastSaleStats, lastOrderNumber: orderNumber, resetOrderNumber,
    pendingOrders, addPendingOrder, completePendingOrder, deletePendingOrder, updatePendingOrder, voidOrder,
    addPreOrder, completePreOrder, deletePreOrder,
    animateBars,
    exportPOSData,
    logout,
    stats, bestSellers,
  }

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>
}
