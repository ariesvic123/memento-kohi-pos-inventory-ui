// ============================================================
// POS HELPERS
// Pure business logic: no React, no state, no side-effects.
// ============================================================

import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import {
  CartItem,
  CostingRow,
  DrinkSize,
  FoodCostingRow,
  InventoryItem,
  RawIngredientPricingRow,
  RestockEntry,
  SaleRow,
  SellingPriceRow,
  StockStatus,
} from './pos.types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Plastic bags are excluded from the per-drink PACKAGING auto-deduction.
// They are only consumed for takeout orders, using the bag formula.
export const PLASTIC_BAG_NAMES = ['double plastic bag', 'single plastic bag']

const parseNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

const splitBeans = (beanType: unknown): string[] =>
  String(beanType ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== 'n/a')

// ─── Stock status ─────────────────────────────────────────────────────────────

export const getStockStatus = (current: number, max: number): StockStatus => {
  const percent = max > 0 ? (current / max) * 100 : 0
  if (percent === 0)  return { label: 'OUT OF STOCK', color: 'gray',   percent }
  if (percent <= 15)  return { label: 'CRITICAL',     color: 'red',    percent }
  if (percent <= 40)  return { label: 'LOW STOCK',    color: 'orange', percent }
  return                     { label: 'HEALTHY',      color: 'green',  percent }
}

export const resolveStock = (item: InventoryItem): number => {
  if (typeof item.stock === 'number') return item.stock
  return parseFloat(String(item.STOCKS ?? item.VOLUME ?? 0))
}

// ─── Drink availability ───────────────────────────────────────────────────────

export const isDrinkOutOfStock = (
  drinkName: string,
  inventory: InventoryItem[],
  costing: CostingRow[]
): boolean => {
  const rule = costing.find(
    (c) => String(c.Drinks ?? '').trim().toLowerCase() === drinkName.trim().toLowerCase()
  )
  if (!rule) return false

  const milkType  = String(rule['Milk Type'] ?? '').trim()
  const keyIngredients: string[] = [
    ...(milkType && milkType !== 'N/A' ? [milkType] : []),
    ...splitBeans(rule['Bean Type']),
  ]

  return keyIngredients.some((ingredient) => {
    const inv = inventory.find(
      (i) => String(i.INGREDIENTS ?? '').trim().toLowerCase() === ingredient.toLowerCase()
    )
    if (!inv) return false
    return resolveStock(inv) <= 0
  })
}

export const isDrinkLowStock = (
  drinkName: string,
  inventory: InventoryItem[],
  costing: CostingRow[]
): boolean => {
  const rule = costing.find(
    (c) => String(c.Drinks ?? '').trim().toLowerCase() === drinkName.trim().toLowerCase()
  )
  if (!rule) return false

  const checkIngredient = (name: string): boolean => {
    const row = inventory.find(
      (i) => String(i.INGREDIENTS ?? '').trim().toLowerCase() === name.toLowerCase()
    )
    if (!row) return false
    const stock = resolveStock(row)
    const max   = typeof row.originalStock === 'number' ? row.originalStock : stock
    return (stock / max) * 100 <= 40
  }

  const milkType = String(rule['Milk Type'] ?? '').trim()
  if (milkType && milkType !== 'N/A' && checkIngredient(milkType)) return true

  return splitBeans(rule['Bean Type']).some((b) => checkIngredient(b))
}

// ─── Volume column resolver ───────────────────────────────────────────────────

export const resolveVolColumn = (size: DrinkSize, temperature?: 'hot' | 'iced'): string => {
  if (size === '8oz') return temperature === 'hot' ? '8oz HOT / vol' : '8oz ICED / vol'
  const map: Partial<Record<DrinkSize, string>> = {
    '12oz': '12oz (volume)',
    '16oz': '16oz (volume)',
    'unit': '',
    '60g':  'MASTER DOUGH (volume)',
    '70g':  'MASTER DOUGH (volume)',
  }
  return map[size] ?? ''
}

// ─── Inventory deduction ──────────────────────────────────────────────────────

export const computeInventoryAfterDeduction = (
  baseInventory:        InventoryItem[],
  cartItems:            CartItem[],
  costing:              CostingRow[],
  rawIngredientsPricing: RawIngredientPricingRow[],
  foodCosting:          FoodCostingRow[],
  takeoutBags?:         { doubleBags: number; singleBags: number }
): InventoryItem[] => {
  const tempInv: InventoryItem[] = JSON.parse(JSON.stringify(baseInventory))

  cartItems.forEach((item) => {
    const isCookieItem = item.size === '60g' || item.size === '70g'

    // ── Cookie deduction path ────────────────────────────────────────────────
    if (isCookieItem) {
      const sizeQtyKey  = item.size === '60g' ? '60g QTY' : '70g QTY'
      const doughRow    = foodCosting.find(
        (f) => String(f.Food ?? '').trim().toLowerCase() === item.name.trim().toLowerCase()
      )
      const cookieQty = doughRow ? parseNum(doughRow[sizeQtyKey]) : 0

      rawIngredientsPricing.forEach((pricingRow) => {
        const pricingName  = String(pricingRow.INGREDIENTS ?? '').trim()
        const category     = String(pricingRow.CATEGORY    ?? '').trim().toUpperCase()
        const rowDrinkType = String(pricingRow['DRINK TYPE'] ?? '').trim()
        const volColumn    = 'MASTER DOUGH (volume)'

        if (!(volColumn in pricingRow)) return
        const rawVolume = parseNum(pricingRow[volColumn])
        if (rawVolume <= 0) return

        let perCookieVol = 0

        if (category === 'BAKING') {
          perCookieVol = cookieQty > 0 ? rawVolume / cookieQty : 0
        } else if (
          category === 'COOKIE_SPECIFIC' &&
          rowDrinkType &&
          item.name.trim().toLowerCase() === rowDrinkType.trim().toLowerCase()
        ) {
          perCookieVol = cookieQty > 0 ? rawVolume / cookieQty : 0
        } else if (
          category === 'FRUIT_CREAM' &&
          rowDrinkType &&
          item.name.toLowerCase().includes(rowDrinkType.toLowerCase())
        ) {
          // cream component: scale by (grams-of-cream-per-cookie / total-cream-batch-grams)
          const creamRow         = foodCosting.find(
            (f) => String(f.Food ?? '').trim().toLowerCase() === rowDrinkType.trim().toLowerCase()
          )
          const masterDoughGrams = parseNum(creamRow?.['Master Dough (grams)'])
          const gramsPerCookie   = parseNum(creamRow?.['Fruit Cream gram/cookie'])
          if (masterDoughGrams > 0 && gramsPerCookie > 0) {
            perCookieVol = rawVolume * (gramsPerCookie / masterDoughGrams)
          }
        }

        if (perCookieVol <= 0) return

        const invIndex = tempInv.findIndex(
          (inv) => String(inv.INGREDIENTS ?? '').trim().toLowerCase() === pricingName.toLowerCase()
        )
        if (invIndex === -1) return

        const currentStock = resolveStock(tempInv[invIndex])
        tempInv[invIndex].stock = Math.max(0, currentStock - perCookieVol * item.qty)
      })

      return
    }

    // ── Drink deduction path ─────────────────────────────────────────────────
    const drinkRule = costing.find(
      (c) => String(c.Drinks ?? '').trim().toLowerCase() === item.name.trim().toLowerCase()
    )
    if (!drinkRule) return

    const assignedMilkType = String(drinkRule['Milk Type'] ?? '').trim()
    const beanNames        = splitBeans(drinkRule['Bean Type'])

    // ── Unit items: shots / latte art (no volume column in Ingredients Pricing) ──
    if (item.size === 'unit') {
      const shotsRuleCost  = parseNum(drinkRule['Shots'])
      const latteArtCost   = parseNum(drinkRule['Latte Art'])
      const hasShots       = shotsRuleCost > 0
      const hasLatteArt    = latteArtCost > 0

      if (!hasShots && !hasLatteArt) return

      // Doppio = 1× 8oz ICED/vol per bean; scale other shots proportionally
      const doppioRule      = costing.find((c) => String(c.Drinks ?? '').trim().toLowerCase() === 'doppio')
      const doppioShotsCost = doppioRule ? parseNum(doppioRule['Shots']) : 0
      const shotsScale      = hasShots && doppioShotsCost > 0 ? shotsRuleCost / doppioShotsCost : 0

      rawIngredientsPricing.forEach((pricingRow) => {
        const pricingName = String(pricingRow.INGREDIENTS ?? '').trim()
        const category    = String(pricingRow.CATEGORY    ?? '').trim().toUpperCase()
        const volBase     = parseNum(pricingRow['8oz ICED / vol'])
        if (volBase <= 0) return

        let volumeUsed = 0

        if (category === 'BEAN' && hasShots && shotsScale > 0 &&
            beanNames.some((b) => b === pricingName.toLowerCase())) {
          volumeUsed = volBase * shotsScale
        } else if (category === 'MILK' && hasLatteArt &&
                   assignedMilkType && assignedMilkType !== 'N/A' &&
                   pricingName.toLowerCase() === assignedMilkType.toLowerCase()) {
          volumeUsed = volBase
        }

        if (volumeUsed <= 0) return

        const invIndex = tempInv.findIndex(
          (inv) => String(inv.INGREDIENTS ?? '').trim().toLowerCase() === pricingName.toLowerCase()
        )
        if (invIndex === -1) return

        const currentStock = resolveStock(tempInv[invIndex])
        tempInv[invIndex].stock = Math.max(0, currentStock - volumeUsed * item.qty)
      })

      return
    }

    // ── Sized drinks: 8oz / 12oz / 16oz ─────────────────────────────────────
    const volColumn = resolveVolColumn(item.size, item.temperature)
    if (!volColumn) return

    const drinkSeries = String(drinkRule?.['Series'] ?? '').toLowerCase()
    const drinkName   = item.name.trim().toLowerCase()
    const isKCNT      = drinkSeries.includes('kohi cream') && !drinkName.includes('tiramisu')

    // Fruit-puree drinks (e.g. Strawberry/Blueberry Latte) use Sip Lid + Bobba Straw.
    // Determined data-driven: any DRINK_SPECIFIC puree ingredient that matches this drink.
    const drinkHasFruitPuree = rawIngredientsPricing.some((r) =>
      String(r.CATEGORY ?? '').toUpperCase() === 'DRINK_SPECIFIC' &&
      String(r.INGREDIENTS ?? '').toLowerCase().includes('puree') &&
      drinkName.includes(String(r['DRINK TYPE'] ?? '').trim().toLowerCase())
    )

    // usesBobba: drinks that need the wide bobba straw (and Sip Lid instead of Flat)
    const usesBobba = isKCNT || drinkHasFruitPuree

    rawIngredientsPricing.forEach((pricingRow) => {
      const pricingName  = String(pricingRow.INGREDIENTS ?? '').trim()
      const category     = String(pricingRow.CATEGORY    ?? '').trim().toUpperCase()
      const rowDrinkType = String(pricingRow['DRINK TYPE'] ?? '').trim()

      if (!(volColumn in pricingRow)) return

      const volumeUsed = parseNum(pricingRow[volColumn])
      if (volumeUsed <= 0) return

      let shouldApply = false

      if (category === 'DRINK_SPECIFIC' && rowDrinkType && drinkName.includes(rowDrinkType.toLowerCase()))
        shouldApply = true
      if (category === 'MILK' && assignedMilkType && assignedMilkType !== 'N/A' &&
          pricingName.toLowerCase() === assignedMilkType.toLowerCase()) {
        // If the MILK row has a specific DRINK TYPE, treat it like DRINK_SPECIFIC —
        // only apply to that drink. No DRINK TYPE (or N/A) means it applies to all drinks
        // that use this milk.
        const milkForDrink = rowDrinkType && rowDrinkType !== 'N/A' ? rowDrinkType.toLowerCase() : null
        if (!milkForDrink || drinkName.includes(milkForDrink)) shouldApply = true
      }
      if (category === 'BEAN' && beanNames.some((b) => b === pricingName.toLowerCase()))
        shouldApply = true
      if (category === 'ICE' || category === 'GENERIC')
        shouldApply = true

      // ── PACKAGING: ONE cup + ONE lid + ONE straw per drink ───────────────────
      // Rules derived cell-by-cell from Drinks Costing cost gaps:
      //   8oz HOT              → 8oz paper cup + Plastic Lids (paper cup)
      //   12oz Kohi Cream      → 12oz cups + Dome Lids + Bobba Straws
      //   16oz Kohi Cream      → 16oz cups + Sip Lids  + Bobba Straws
      //   12oz/16oz fruit latte → same cup  + Sip Lids  + Bobba Straws
      //   all other iced       → size cup   + Flat Lids + Thin Straws
      if (category === 'PACKAGING' && !PLASTIC_BAG_NAMES.includes(pricingName.toLowerCase())) {
        const p = pricingName.toLowerCase()

        if (p.includes('dome')) {
          // Dome lids: 12oz Kohi Cream non-tiramisu only
          if (item.size === '12oz' && isKCNT) shouldApply = true
        } else if (p.includes('sip')) {
          // Sip lids: all 12oz/16oz drinks except 12oz Kohi Cream (dome covers that)
          if (!(item.size === '12oz' && isKCNT)) shouldApply = true
        } else if (p.includes('flat')) {
          // Flat lids: no longer assigned to any drink (sip lids cover all iced cups)
        } else if (p.includes('bobba')) {
          // Bobba straws: Kohi Cream non-tiramisu + fruit-puree drinks
          if (usesBobba) shouldApply = true
        } else if (p.includes('thin')) {
          // Thin straws: all regular iced drinks (non-bobba)
          if (!usesBobba) shouldApply = true
        } else if (p.includes('12oz') && !p.includes('16oz')) {
          if (item.size === '12oz') shouldApply = true
        } else if (p.includes('16oz') && !p.includes('12oz')) {
          if (item.size === '16oz') shouldApply = true
        } else {
          // 8oz paper cup, Plastic Lids (paper cup): vol column restricts to 8oz HOT
          shouldApply = true
        }
      }

      // ── Cream series ─────────────────────────────────────────────────────────
      // CREAM_SERIES (Homemade Cold Foam, 40ml APC): all Kohi Cream non-tiramisu EXCEPT Memento Latte
      if (category === 'CREAM_SERIES' && isKCNT && !drinkName.includes('memento'))
        shouldApply = true
      // BREVE_SERIES (Seasalt Breve, 20ml APC): Memento Latte only
      // Cell ref: row 66-69 in Ingredients Pricing — 12oz=20/16oz=20 for All Purpose Cream
      if (category === 'BREVE_SERIES' && drinkName.includes('memento') && drinkSeries.includes('kohi cream'))
        shouldApply = true
      // CREAM_CHEESE_SERIES (Tiramisu Breve): Tiramisu Latte only
      if (category === 'CREAM_CHEESE_SERIES' && drinkName.includes('tiramisu') && drinkSeries.includes('kohi cream'))
        shouldApply = true

      if (!shouldApply) return

      const invIndex = tempInv.findIndex(
        (inv) => String(inv.INGREDIENTS ?? '').trim().toLowerCase() === pricingName.toLowerCase()
      )
      if (invIndex === -1) return

      const currentStock = resolveStock(tempInv[invIndex])
      tempInv[invIndex].stock = Math.max(0, currentStock - volumeUsed * item.qty)
    })
  })

  // ── Takeout plastic bag deduction ──────────────────────────────────────────
  // Goes through rawIngredientsPricing for item lookup (same path as cups/lids),
  // but uses the formula-computed count instead of per-drink volume.
  if (takeoutBags && (takeoutBags.doubleBags > 0 || takeoutBags.singleBags > 0)) {
    const applied = new Set<string>()
    rawIngredientsPricing.forEach((pricingRow) => {
      const pricingName = String(pricingRow.INGREDIENTS ?? '').trim()
      const nameLower   = pricingName.toLowerCase()
      if (!PLASTIC_BAG_NAMES.includes(nameLower)) return
      if (applied.has(nameLower)) return
      applied.add(nameLower)

      const bagCount = nameLower === PLASTIC_BAG_NAMES[0]
        ? takeoutBags.doubleBags
        : takeoutBags.singleBags
      if (bagCount <= 0) return

      const invIndex = tempInv.findIndex(
        (inv) => String(inv.INGREDIENTS ?? '').trim().toLowerCase() === nameLower
      )
      if (invIndex === -1) return

      const currentStock = resolveStock(tempInv[invIndex])
      tempInv[invIndex].stock = Math.max(0, currentStock - bagCount)
    })
  }

  return tempInv
}

// ─── Void/refund: exact per-ingredient deduction amounts ─────────────────────
// Mirrors computeInventoryAfterDeduction's logic but accumulates delta amounts
// into a plain map instead of mutating inventory — no LARGE-stock tricks needed.
export const computeVoidDeltas = (
  cartItems:             CartItem[],
  costing:               CostingRow[],
  rawIngredientsPricing: RawIngredientPricingRow[],
  foodCosting:           FoodCostingRow[]
): Record<string, number> => {
  const deltas: Record<string, number> = {}
  const add = (name: string, amount: number) => {
    const key = name.trim().toLowerCase()
    deltas[key] = (deltas[key] ?? 0) + amount
  }

  cartItems.forEach((item) => {
    const isCookieItem = item.size === '60g' || item.size === '70g'

    // ── Cookie path ──────────────────────────────────────────────────────────
    if (isCookieItem) {
      const sizeQtyKey = item.size === '60g' ? '60g QTY' : '70g QTY'
      const doughRow   = foodCosting.find(
        (f) => String(f.Food ?? '').trim().toLowerCase() === item.name.trim().toLowerCase()
      )
      const cookieQty = doughRow ? parseNum(doughRow[sizeQtyKey]) : 0

      rawIngredientsPricing.forEach((pr) => {
        const pricingName  = String(pr.INGREDIENTS ?? '').trim()
        const category     = String(pr.CATEGORY    ?? '').trim().toUpperCase()
        const rowDrinkType = String(pr['DRINK TYPE'] ?? '').trim()
        const volColumn    = 'MASTER DOUGH (volume)'
        if (!(volColumn in pr)) return
        const rawVolume = parseNum(pr[volColumn])
        if (rawVolume <= 0) return

        let perCookieVol = 0
        if (category === 'BAKING') {
          perCookieVol = cookieQty > 0 ? rawVolume / cookieQty : 0
        } else if (category === 'COOKIE_SPECIFIC' && rowDrinkType &&
            item.name.trim().toLowerCase() === rowDrinkType.trim().toLowerCase()) {
          perCookieVol = cookieQty > 0 ? rawVolume / cookieQty : 0
        } else if (category === 'FRUIT_CREAM' && rowDrinkType &&
            item.name.toLowerCase().includes(rowDrinkType.toLowerCase())) {
          const creamRow = foodCosting.find(
            (f) => String(f.Food ?? '').trim().toLowerCase() === rowDrinkType.trim().toLowerCase()
          )
          const masterDoughGrams = parseNum(creamRow?.['Master Dough (grams)'])
          const gramsPerCookie   = parseNum(creamRow?.['Fruit Cream gram/cookie'])
          if (masterDoughGrams > 0 && gramsPerCookie > 0)
            perCookieVol = rawVolume * (gramsPerCookie / masterDoughGrams)
        }
        if (perCookieVol > 0) add(pricingName, perCookieVol * item.qty)
      })
      return
    }

    // ── Drink path ───────────────────────────────────────────────────────────
    const drinkRule = costing.find(
      (c) => String(c.Drinks ?? '').trim().toLowerCase() === item.name.trim().toLowerCase()
    )
    if (!drinkRule) return

    const assignedMilkType = String(drinkRule['Milk Type'] ?? '').trim()
    const beanNames        = splitBeans(drinkRule['Bean Type'])
    const drinkSeries      = String(drinkRule?.['Series'] ?? '').toLowerCase()
    const drinkName        = item.name.trim().toLowerCase()
    const isKCNT           = drinkSeries.includes('kohi cream') && !drinkName.includes('tiramisu')

    const drinkHasFruitPuree = rawIngredientsPricing.some((r) =>
      String(r.CATEGORY ?? '').toUpperCase() === 'DRINK_SPECIFIC' &&
      String(r.INGREDIENTS ?? '').toLowerCase().includes('puree') &&
      drinkName.includes(String(r['DRINK TYPE'] ?? '').trim().toLowerCase())
    )
    const usesBobba = isKCNT || drinkHasFruitPuree

    // ── Unit items (shots / latte art) ───────────────────────────────────────
    if (item.size === 'unit') {
      const shotsRuleCost  = parseNum(drinkRule['Shots'])
      const latteArtCost   = parseNum(drinkRule['Latte Art'])
      const hasShots       = shotsRuleCost > 0
      const hasLatteArt    = latteArtCost  > 0
      if (!hasShots && !hasLatteArt) return

      const doppioRule      = costing.find((c) => String(c.Drinks ?? '').trim().toLowerCase() === 'doppio')
      const doppioShotsCost = doppioRule ? parseNum(doppioRule['Shots']) : 0
      const shotsScale      = hasShots && doppioShotsCost > 0 ? shotsRuleCost / doppioShotsCost : 0

      rawIngredientsPricing.forEach((pr) => {
        const pricingName = String(pr.INGREDIENTS ?? '').trim()
        const category    = String(pr.CATEGORY    ?? '').trim().toUpperCase()
        const volBase     = parseNum(pr['8oz ICED / vol'])
        if (volBase <= 0) return
        let vol = 0
        if (category === 'BEAN' && hasShots && shotsScale > 0 &&
            beanNames.some((b) => b === pricingName.toLowerCase()))
          vol = volBase * shotsScale
        else if (category === 'MILK' && hasLatteArt &&
            assignedMilkType && assignedMilkType !== 'N/A' &&
            pricingName.toLowerCase() === assignedMilkType.toLowerCase())
          vol = volBase
        if (vol > 0) add(pricingName, vol * item.qty)
      })
      return
    }

    // ── Sized drinks (8oz / 12oz / 16oz) ─────────────────────────────────────
    const volColumn = resolveVolColumn(item.size, item.temperature)
    if (!volColumn) return

    rawIngredientsPricing.forEach((pr) => {
      const pricingName  = String(pr.INGREDIENTS ?? '').trim()
      const category     = String(pr.CATEGORY    ?? '').trim().toUpperCase()
      const rowDrinkType = String(pr['DRINK TYPE'] ?? '').trim()
      if (!(volColumn in pr)) return
      const volumeUsed = parseNum(pr[volColumn])
      if (volumeUsed <= 0) return

      let shouldApply = false
      const p = pricingName.toLowerCase()

      if (category === 'DRINK_SPECIFIC' && rowDrinkType && drinkName.includes(rowDrinkType.toLowerCase()))
        shouldApply = true
      if (category === 'MILK' && assignedMilkType && assignedMilkType !== 'N/A' &&
          pricingName.toLowerCase() === assignedMilkType.toLowerCase()) {
        const milkForDrink = rowDrinkType && rowDrinkType !== 'N/A' ? rowDrinkType.toLowerCase() : null
        if (!milkForDrink || drinkName.includes(milkForDrink)) shouldApply = true
      }
      if (category === 'BEAN' && beanNames.some((b) => b === pricingName.toLowerCase()))
        shouldApply = true
      if (category === 'ICE' || category === 'GENERIC') shouldApply = true

      if (category === 'PACKAGING' && !PLASTIC_BAG_NAMES.includes(p)) {
        if (p.includes('sip'))                                              { if (!(item.size === '12oz' && isKCNT)) shouldApply = true }
        else if (p.includes('dome'))                                         { if (item.size === '12oz' && isKCNT) shouldApply = true }
        else if (p.includes('flat'))                                         { /* no longer assigned to any drink */ }
        else if (p.includes('bobba'))                                        { if (usesBobba) shouldApply = true }
        else if (p.includes('thin'))                                         { if (!usesBobba) shouldApply = true }
        else if (p.includes('12oz') && !p.includes('16oz'))                 { if (item.size === '12oz') shouldApply = true }
        else if (p.includes('16oz') && !p.includes('12oz'))                 { if (item.size === '16oz') shouldApply = true }
        else shouldApply = true
      }

      if (category === 'CREAM_SERIES' && isKCNT && !drinkName.includes('memento')) shouldApply = true
      if (category === 'BREVE_SERIES' && drinkName.includes('memento') && drinkSeries.includes('kohi cream')) shouldApply = true
      if (category === 'CREAM_CHEESE_SERIES' && drinkName.includes('tiramisu') && drinkSeries.includes('kohi cream')) shouldApply = true

      if (shouldApply) add(pricingName, volumeUsed * item.qty)
    })
  })

  return deltas
}

// ─── Takeout bag formula ──────────────────────────────────────────────────────
// Rules:
//   drinks=1              → 0 double + 1 single
//   drinks=5              → 2 double + 1 single  (floor(n/2) double, n%2 single)
//   drinks=1 + food       → 0 double + 2 single  (1 for drink, 1 for all food)
//   drinks=5 + food       → 2 double + 2 single  (bags for drinks + 1 for food)

export const computeTakeoutBagCounts = (
  cart: CartItem[]
): { doubleBags: number; singleBags: number } => {
  const drinkSizes: DrinkSize[] = ['8oz', '12oz', '16oz', 'unit']
  const drinkQty = cart
    .filter((item) => drinkSizes.includes(item.size))
    .reduce((sum, item) => sum + item.qty, 0)
  const hasFood = cart.some((item) => item.size === '60g' || item.size === '70g')

  return {
    doubleBags: Math.floor(drinkQty / 2),
    singleBags: (drinkQty % 2) + (hasFood ? 1 : 0),
  }
}

// Returns the ₱ cost of the plastic bags for a takeout order.
export const computeTakeoutBagCost = (
  doubleBags:            number,
  singleBags:            number,
  rawIngredientsPricing: RawIngredientPricingRow[]
): number => {
  let cost = 0
  const applied = new Set<string>()
  rawIngredientsPricing.forEach((row) => {
    const name = String(row.INGREDIENTS ?? '').trim().toLowerCase()
    if (!PLASTIC_BAG_NAMES.includes(name)) return
    if (applied.has(name)) return
    applied.add(name)
    const containerVol = parseNum(row['VOLUME'])
    const basePrice    = parseNum(row['PRICE'])
    if (!containerVol) return
    const count = name === PLASTIC_BAG_NAMES[0] ? doubleBags : singleBags
    cost += (basePrice / containerVol) * count
  })
  return cost
}

// ─── Excel file parsing ───────────────────────────────────────────────────────

export interface ParsedWorkbook {
  inventory:             InventoryItem[]
  rawIngredientsPricing: RawIngredientPricingRow[]
  costing:               CostingRow[]
  foodCosting:           FoodCostingRow[]
  sellingPrices:         unknown[]
  dailySales:            SaleRow[]
  restockRows:           RestockEntry[]
  formulaMap:            FormulaMap
  wb:                    XLSX.WorkBook
}

const HEADER_KEYS = ['INGREDIENTS', 'ITEMS', 'Drinks', 'Date', 'Food']

const parseSheet = <T>(wb: XLSX.WorkBook, sheetName: string): T[] => {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
  const hIdx = rows.findIndex((r) =>
    (r as string[]).some((c) => HEADER_KEYS.includes(String(c).trim()))
  )
  if (hIdx === -1) return []

  const headers = rows[hIdx] as string[]
  // Use the column that triggered HEADER_KEYS detection as the primary key.
  // Sheets like Drinks Costing may have blank/numeric prefix columns before 'Drinks',
  // so blindly using headers[0] would filter out all rows.
  const keyColIdx = headers.findIndex((h) => HEADER_KEYS.includes(String(h).trim()))
  const keyHeader = String(headers[keyColIdx >= 0 ? keyColIdx : 0]).trim()
  return rows
    .slice(hIdx + 1)
    .map((r) => {
      const obj: Record<string, unknown> = {}
      // Trim header names to avoid trailing-space mismatches between Excel columns and code keys
      headers.forEach((h, i) => { obj[String(h).trim()] = (r as unknown[])[i] })
      return obj
    })
    .filter((r) => r[keyHeader]) as T[]
}

// Custom parser for Ingredients Pricing — fixes duplicate PRICE + QTY CUPS headers.
// Column layout (0-indexed after header row):
//  0 INGREDIENTS | 1 CATEGORY | 2 DRINK TYPE | 3 VOLUME | 4 UNIT | 5 PRICE (base)
//  6 8oz ICED/vol | 7 8oz HOT/vol | 8 8oz ICED/cup | 9 8oz HOT/cup
//  10 8oz ICED/price | 11 8oz HOT/price
//  12 12oz (volume) | 13 12oz QTY CUPS | 14 12oz PRICE
//  15 16oz (volume) | 16 16oz QTY CUPS | 17 16oz PRICE
//  18 MASTER DOUGH (volume) | 19 MASTER DOUGH (production) | 20 MASTER DOUGH (price)
const INGR_PRICE_COL_NAMES: Record<number, string> = {
  5:  'PRICE',
  8:  '8oz ICED / cup',
  9:  '8oz HOT / cup',
  10: '8oz ICED / price',
  11: '8oz HOT / price',
  13: '12oz QTY CUPS',
  14: '12oz PRICE',
  16: '16oz QTY CUPS',
  17: '16oz PRICE',
}

const parseIngredientsPricing = (wb: XLSX.WorkBook): RawIngredientPricingRow[] => {
  const ws = wb.Sheets['Ingredients Pricing']
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hIdx = raw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'INGREDIENTS'))
  if (hIdx === -1) return []
  const baseHeaders = raw[hIdx] as string[]
  const headers = baseHeaders.map((h, i) => INGR_PRICE_COL_NAMES[i] ?? h)
  return raw
    .slice(hIdx + 1)
    .map((r) => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => { obj[h] = (r as unknown[])[i] })
      return obj
    })
    .filter((row) => row['INGREDIENTS'] && String(row['INGREDIENTS']).trim() !== '') as RawIngredientPricingRow[]
}

// Returns true if a SellingPriceRow has at least one valid (non-N/A) price
const hasAnyPrice = (row: Record<string, unknown>): boolean => {
  const priceCols = [
    'Actual Price (8oz)', 'Actual Price (12oz)', 'Actual Price (16oz)',
    'Actual Price (Slice)', 'Actual Price (Shots)', 'Actual Price (Latte Art)',
    'Actual Price (60g)', 'Actual Price (70g)', 'Actual Price',
  ]
  return priceCols.some((col) => parseNum(row[col]) > 0)
}

export const excelSerialToDateStr = (serial: number): string => {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export const dateStrToExcelSerial = (dateStr: string): number => {
  const d = new Date(dateStr)
  return Math.floor(d.getTime() / 86400000 + 25569)
}

const normalizeForMatch = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()

const stripBrandQualifier = (s: string): string =>
  s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

export const toBaseVol = (vol: number, unit: string): number => {
  const u = unit.toLowerCase().trim()
  if (u === 'kg')                return vol * 1000       // kg → g
  if (u === 'l')                 return vol * 1000       // L  → ml
  if (u === 'oz' || u === 'fl oz') return vol * 29.5735  // fl oz → ml
  return vol                                             // ml / g (assume base unit)
}

export const fuzzyMatchRestock = (
  invName: string,
  restockRows: Record<string, unknown>[]
): Record<string, unknown>[] => {
  const inv        = normalizeForMatch(invName)
  const invStripped = normalizeForMatch(stripBrandQualifier(invName))
  if (!inv) return []

  // 1. Exact match (full name including brand qualifier)
  const exact = restockRows.filter((r) => normalizeForMatch(String(r['Item'] ?? '')) === inv)
  if (exact.length > 0) return exact

  // 1.5. Word-set containment with ORIGINAL name (brand-inclusive).
  // Prevents "All Purpose Cream (Nestle)" from matching "Jersey All Purpose Cream"
  // when "Nestle All Purpose Cream" is also a restock candidate.
  if (inv !== invStripped) {
    const invOrigWords = inv.split(/\s+/)
    const origSub = restockRows.filter((r) => {
      const rn      = normalizeForMatch(String(r['Item'] ?? ''))
      const rnWords = rn.split(/\s+/)
      return (
        rn.length >= 4 &&
        (invOrigWords.every((w) => rnWords.includes(w)) ||
         rnWords.every((w) => invOrigWords.includes(w)))
      )
    })
    if (origSub.length > 0) return origSub
  }

  // 2. Word-set containment (brand-stripped): rn words ⊆ inv words OR inv words ⊆ rn words
  const invWords = invStripped.split(/\s+/)
  const sub = restockRows.filter((r) => {
    const rn      = normalizeForMatch(String(r['Item'] ?? ''))
    const rnWords = rn.split(/\s+/)
    return (
      rn.length >= 4 &&
      (invWords.every((w) => rnWords.includes(w)) ||
       rnWords.every((w) => invWords.includes(w)))
    )
  })
  if (sub.length > 0) return sub

  // 3. Keyword scoring (brand-stripped) — word-boundary, highest score wins
  //    Require ≥2 keywords; a single generic word (e.g. "choco") matches too broadly
  const words = invStripped.split(/\s+/).filter((w) => w.length >= 4)
  if (words.length < 2) return []

  const scored = restockRows
    .map((r) => {
      const rnWords = normalizeForMatch(String(r['Item'] ?? '')).split(/\s+/)
      const score   = words.filter((w) => rnWords.includes(w)).length
      return { r, score }
    })
    .filter((x) => x.score > 0)

  if (!scored.length) return []
  const maxScore = Math.max(...scored.map((x) => x.score))
  const minScore = words.length === 1 ? 1 : 2
  if (maxScore < minScore) return []
  return scored.filter((x) => x.score === maxScore).map((x) => x.r)
}

// ─── Formula map parser ───────────────────────────────────────────────────────
// Parses cell formula strings from Drinks Costing (and Food Costing) to build an
// exact map from (drinkName, size) → [{rawIngredientsPricing array index, IP price field}].
// Uses array index (not ingredient name) to handle duplicate ingredient names correctly
// (e.g. JollyCow appears as MILK row 2 and CREAM_SERIES row 67 with different volumes).
//
// Map key:   "DrinkName|size"  e.g. "White Mocha Latte|12oz"
// Map value: Array of { ipIdx: number, priceKey: string }
//   ipIdx    = rawIngredientsPricing array index (NOT Excel row number)
//   priceKey = exact rawIngredientsPricing field (e.g. '12oz PRICE', '8oz ICED / price')
//
export type FormulaRef  = { ipIdx: number; priceKey: string }
export type FormulaMap  = Map<string, FormulaRef[]>

// Ingredients Pricing column index → rawIngredientsPricing price field name
const IP_COL_TO_PRICE_KEY: Record<number, string> = {
  10: '8oz ICED / price',
  11: '8oz HOT / price',
  14: '12oz PRICE',
  17: '16oz PRICE',
  20: 'MASTER DOUGH (price)',
}

export const parseFormulaMap = (wb: XLSX.WorkBook): FormulaMap => {
  const map: FormulaMap = new Map()

  const ipWs  = wb.Sheets['Ingredients Pricing']
  if (!ipWs) return map
  const ipRaw = XLSX.utils.sheet_to_json<unknown[]>(ipWs, { header: 1, defval: '' }) as unknown[][]

  // Build Excel row number (1-indexed) → rawIngredientsPricing array index
  // Mirrors parseIngredientsPricing's filter: only non-empty INGREDIENTS rows count.
  // Also captures per-row metadata needed for the 16oz inference logic.
  const ipHIdx = ipRaw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'INGREDIENTS'))
  const excelRowToIpIdx = new Map<number, number>()
  const ipIdxMeta = new Map<number, { cat: string; has16ozVol: boolean; has12ozVol: boolean }>()
  let ipIdx = 0
  for (let i = ipHIdx + 1; i < ipRaw.length; i++) {
    const row = ipRaw[i] as unknown[]
    const ingName = String(row[0] ?? '').trim()
    if (ingName) {
      excelRowToIpIdx.set(i + 1, ipIdx)  // Excel row is 1-indexed (i+1)
      ipIdxMeta.set(ipIdx, {
        cat:       String(row[1] ?? '').trim().toUpperCase(),
        has16ozVol: parseNum(row[15]) > 0,  // col 15 = 16oz (volume)
        has12ozVol: parseNum(row[12]) > 0,  // col 12 = 12oz (volume)
      })
      ipIdx++
    }
  }

  const IP_REF_RE = /'?Ingredients Pricing'?!\$?([A-Z]+)\$?(\d+)/g

  const extractRefs = (formula: string): FormulaRef[] => {
    const refs: FormulaRef[] = []
    IP_REF_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IP_REF_RE.exec(formula)) !== null) {
      const colIdx   = XLSX.utils.decode_col(m[1])
      const priceKey = IP_COL_TO_PRICE_KEY[colIdx]
      const excelRow = parseInt(m[2], 10)
      const idx      = excelRowToIpIdx.get(excelRow)
      if (priceKey && idx !== undefined) refs.push({ ipIdx: idx, priceKey })
    }
    return refs
  }

  // ── Drinks Costing ────────────────────────────────────────────────────────
  const dcWs = wb.Sheets['Drinks Costing']
  if (dcWs) {
    const dcRaw  = XLSX.utils.sheet_to_json<unknown[]>(dcWs, { header: 1 }) as unknown[][]
    const dcHIdx = dcRaw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'Drinks'))
    if (dcHIdx !== -1) {
      const headers    = dcRaw[dcHIdx] as string[]
      const nameColIdx = headers.findIndex((h) => String(h).trim() === 'Drinks')
      const SIZE_KEYS  = ['8oz', '12oz', '16oz', 'Slice', 'Shots', 'Latte Art']
      const sizeCols: { key: string; colIdx: number }[] = []
      headers.forEach((h, i) => {
        const k = String(h).trim()
        if (SIZE_KEYS.includes(k)) sizeCols.push({ key: k, colIdx: i })
      })

      for (let r = dcHIdx + 1; r < dcRaw.length; r++) {
        const row       = dcRaw[r] as unknown[]
        const drinkName = String(row[nameColIdx] ?? '').trim()
        if (!drinkName) continue

        sizeCols.forEach(({ key, colIdx }) => {
          const addr = XLSX.utils.encode_cell({ r, c: colIdx })
          const cell = dcWs[addr]
          if (!cell?.f) return
          const refs = extractRefs(cell.f)
          if (refs.length > 0) map.set(`${drinkName}|${key}`, refs)
        })
      }
    }
  }

  // ── Food Costing ──────────────────────────────────────────────────────────
  const fcWs = wb.Sheets['Food Costing']
  if (fcWs) {
    const fcRaw  = XLSX.utils.sheet_to_json<unknown[]>(fcWs, { header: 1 }) as unknown[][]
    const fcHIdx = fcRaw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'Food'))
    if (fcHIdx !== -1) {
      const headers    = fcRaw[fcHIdx] as string[]
      const nameColIdx = headers.findIndex((h) => String(h).trim() === 'Food')
      const FOOD_COST_KEYS = ['Master Dough (pricing)', '60g cookie', '70g cookie', 'Fruit Cream']
      const costCols: { key: string; colIdx: number }[] = []
      headers.forEach((h, i) => {
        const k = String(h).trim()
        if (FOOD_COST_KEYS.includes(k)) costCols.push({ key: k, colIdx: i })
      })

      for (let r = fcHIdx + 1; r < fcRaw.length; r++) {
        const row      = fcRaw[r] as unknown[]
        const foodName = String(row[nameColIdx] ?? '').trim()
        if (!foodName) continue

        costCols.forEach(({ key, colIdx }) => {
          const addr = XLSX.utils.encode_cell({ r, c: colIdx })
          const cell = fcWs[addr]
          if (!cell?.f) return
          const refs = extractRefs(cell.f)
          if (refs.length > 0) map.set(`${foodName}|${key}`, refs)
        })
      }
    }
  }

  // ── Infer missing 12oz / 16oz entries from each other ─────────────────────
  // Both sizes reference the same ingredient rows; only the per-cup price key
  // differs ('12oz PRICE' vs '16oz PRICE').  When the Excel formula cell exists
  // for one size but not the other (e.g. Matcha Latte has 12oz formula but no
  // 16oz formula), derive the missing entry so that cost recomputation covers
  // all sizes whenever per-cup prices change.
  //
  // Smart 12oz → 16oz inference rules (per ref, for '12oz PRICE' keys only):
  //  1. Ingredient has 16oz (volume) set → include with '16oz PRICE' key.
  //  2. Ingredient has no 16oz vol but its adjacent next ipIdx is a "companion"
  //     row that has 16oz vol but no 12oz vol (e.g. "16oz cups" follows "12oz
  //     cups") → substitute the companion and use its '16oz PRICE'.
  //  3. Ingredient is DRINK_SPECIFIC with no 16oz vol, and the drink is
  //     "configured" (≥1 other DS ref already has a 16oz vol) → this ingredient
  //     intentionally has no 16oz version; exclude it (contributes ₱0).
  //  4. All other cases → keep ref with '16oz PRICE' key; recomputeDrinkCosts-
  //     FromFormulaMap will fall back to '12oz PRICE' if the 16oz price is 0.
  const seen12 = new Map<string, FormulaRef[]>()
  const seen16 = new Map<string, FormulaRef[]>()
  for (const [key, refs] of map.entries()) {
    const pipe  = key.lastIndexOf('|')
    const drink = key.slice(0, pipe)
    const size  = key.slice(pipe + 1)
    if (size === '12oz') seen12.set(drink, refs)
    if (size === '16oz') seen16.set(drink, refs)
  }
  for (const [drink, refs12] of seen12.entries()) {
    if (!seen16.has(drink)) {
      // Rule 3 gating: is ≥1 DS ref in this drink already configured for 16oz?
      const dsConfigured = refs12.some(({ ipIdx: idx, priceKey }) =>
        priceKey === '12oz PRICE' && (ipIdxMeta.get(idx)?.cat === 'DRINK_SPECIFIC') && (ipIdxMeta.get(idx)?.has16ozVol ?? false)
      )

      const inferred16: FormulaRef[] = []
      for (const r of refs12) {
        if (r.priceKey !== '12oz PRICE') {
          inferred16.push(r)  // non-12oz key (8oz / master dough): pass through unchanged
          continue
        }
        const meta = ipIdxMeta.get(r.ipIdx)

        // Rule 1: ingredient has a 16oz volume → use its 16oz PRICE
        if (meta?.has16ozVol) {
          inferred16.push({ ipIdx: r.ipIdx, priceKey: '16oz PRICE' })
          continue
        }

        // Rule 2: companion packaging row (e.g. "12oz cups" → "16oz cups")
        // Only for non-DS rows to avoid accidentally substituting the wrong ingredient.
        const companionMeta = ipIdxMeta.get(r.ipIdx + 1)
        if (meta?.cat !== 'DRINK_SPECIFIC' && companionMeta?.has16ozVol && !companionMeta.has12ozVol) {
          inferred16.push({ ipIdx: r.ipIdx + 1, priceKey: '16oz PRICE' })
          continue
        }

        // Rule 3: DS ingredient with no 16oz vol in a fully-configured drink → exclude
        if (dsConfigured && meta?.cat === 'DRINK_SPECIFIC') {
          continue
        }

        // Rule 4: fallback — include with 16oz PRICE; sumRefs will fall back to 12oz if 0
        inferred16.push({ ipIdx: r.ipIdx, priceKey: '16oz PRICE' })
      }

      if (inferred16.length > 0) map.set(`${drink}|16oz`, inferred16)
    }
  }
  for (const [drink, refs16] of seen16.entries()) {
    if (!seen12.has(drink)) {
      map.set(`${drink}|12oz`, refs16.map((r) => ({
        ipIdx:    r.ipIdx,
        priceKey: r.priceKey === '16oz PRICE' ? '12oz PRICE' : r.priceKey,
      })))
    }
  }

  return map
}

export const parseWorkbook = (wb: XLSX.WorkBook): ParsedWorkbook => {
  // ── Inventory ────────────────────────────────────────────────────────────
  const invData = wb.SheetNames.includes('Updated Inventory')
    ? parseSheet<Record<string, unknown>>(wb, 'Updated Inventory')
    : parseSheet<Record<string, unknown>>(wb, 'Ingredients Pricing')

  // ── Restock Details — filter valid rows only ─────────────────────────────
  const restockRaw: Record<string, unknown>[] = wb.Sheets['Restock Details']
    ? (XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Restock Details'], { defval: '' })
        .filter((r) => {
          const item = String(r['Item'] ?? '')
          return (
            /[a-zA-Z]{3,}/.test(item) &&
            typeof r['Volume/Weight'] === 'number' &&
            typeof r['QTY'] === 'number' &&
            typeof r['Date'] === 'number'
          )
        }))
    : []

  const inventory: InventoryItem[] = invData.map((row) => {
    // Normalize 'ITEMS' column (Updated Inventory) → INGREDIENTS key
    const ingredients = String(row['INGREDIENTS'] ?? row['ITEMS'] ?? '').trim()
    const baseStock   = parseFloat(String(row['STOCKS'] ?? row['VOLUME'] ?? 0))
    const boxSize     = parseFloat(String(row['BOX_SIZE'] ?? ''))
    const container   = String(row['CONTAINER'] ?? '').trim()

    // Derive last restock from Restock Details
    const matches = fuzzyMatchRestock(ingredients, restockRaw)
    let lastRestockDate: string | undefined
    let lastRestockQty:  number | undefined

    if (matches.length > 0) {
      const sorted = [...matches].sort((a, b) => Number(b['Date']) - Number(a['Date']))
      const latest = sorted[0]
      lastRestockDate = excelSerialToDateStr(Number(latest['Date']))
      lastRestockQty  = Number(latest['Volume/Weight']) * Number(latest['QTY'])
    }

    const item: InventoryItem = {
      ...row,
      INGREDIENTS:   ingredients,
      stock:         baseStock,
      originalStock: baseStock,
      ...((!isNaN(boxSize) && boxSize > 0)  ? { BOX_SIZE:          boxSize }          : {}),
      ...(container                          ? { CONTAINER:         container }         : {}),
      ...(lastRestockDate !== undefined      ? { LAST_RESTOCK_DATE: lastRestockDate }   : {}),
      ...(lastRestockQty  !== undefined      ? { LAST_RESTOCK_QTY:  lastRestockQty }    : {}),
    }
    return item
  })

  // ── Pricing / costing sheets ─────────────────────────────────────────────
  const pricingData   = parseIngredientsPricing(wb)
  const drinkCosting  = parseSheet<CostingRow>(wb, 'Drinks Costing')
  const foodCostData  = parseSheet<FoodCostingRow>(wb, 'Food Costing')

  // ── Daily sales ──────────────────────────────────────────────────────────
  const historySheet = wb.Sheets['POS_Transaction_History']
  const dailySales: SaleRow[] = historySheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(historySheet, { defval: '' }).map((row) => {
        const tempStr  = String(row['Temperature'] ?? '').trim()
        const orderNo  = parseInt(String(row['OrderNo'] ?? ''), 10)
        const addrStr  = String(row['Address'] ?? '').trim()
        // Date may come back as an Excel serial number after re-import (e.g. 46172)
        // — convert to ISO string so date comparisons and display work correctly.
        const rawDate    = row['Date']
        const dateSerial = typeof rawDate === 'number' && rawDate > 40000 ? rawDate : null
        const normalDate = dateSerial
          ? (() => {
              const d = new Date(Math.round((dateSerial - 25569) * 86400 * 1000))
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            })()
          : String(rawDate ?? '')

        const saleRow: SaleRow = {
          Date:      normalDate,
          Time:      String(row['Time']      ?? ''),
          Drink:     String(row['Drink']     ?? ''),
          Size:      String(row['Size']      ?? '8oz') as DrinkSize,
          Qty:       parseFloat(String(row['Qty']   ?? 0)),
          Price:     parseFloat(String(row['Price'] ?? 0)),
          Revenue:   parseFloat(String(row['Revenue']    ?? 0)).toString(),
          NetProfit: parseFloat(String(row['Net Profit'] ?? 0)).toString(),
          Notes:     String(row['Notes']    ?? ''),
          Customer:  String(row['Customer'] ?? ''),
          Method:    (String(row['Method'] ?? 'CASH').toUpperCase() === 'GCASH' ? 'GCASH' : 'CASH') as 'CASH' | 'GCASH',
          Timestamp: String(row['Timestamp'] ?? ''),
        }
        if (tempStr === 'hot' || tempStr === 'iced') saleRow.Temperature = tempStr
        if (!isNaN(orderNo) && orderNo > 0)          saleRow.OrderNo     = orderNo
        if (addrStr)                                  saleRow.Address     = addrStr
        return saleRow
      })
    : []

  // ── Drinks selling price — filter out all-N/A rows ───────────────────────
  const drinkPriceRows = parseSheet<Record<string, unknown>>(wb, 'Drinks Selling Price')
    .filter(hasAnyPrice)
    .map((row) => ({ ...row, Category: row['Category'] ?? 'Drinks' }))

  // ── Cookie selling price — normalize to SellingPriceRow shape ────────────
  const cookiePriceRows = parseSheet<Record<string, unknown>>(wb, 'Cookie Selling Price')
    .filter((row) => row['Food'])
    .map((row) => {
      const foodName    = String(row['Food'] ?? '').trim()
      const foodCostRow = foodCostData.find(
        (f) => String(f.Food ?? '').trim().toLowerCase() === foodName.toLowerCase()
      )
      const normalized: Record<string, unknown> = {
        Drinks:                   foodName,
        Category:                 'Food',
        'Actual Price (8oz)':     'N/A',
        'Actual Price (12oz)':    'N/A',
        'Actual Price (16oz)':    'N/A',
        'Actual Price (60g)':     row['60g cookie'],
        'Actual Price (70g)':     row['70g cookie'],
        'Cost (60g)':             foodCostRow?.['60g cookie'] ?? 'N/A',
        'Cost (70g)':             foodCostRow?.['70g cookie'] ?? 'N/A',
      }
      return normalized
    })
    .filter(hasAnyPrice)

  const sellingPrices = [...drinkPriceRows, ...cookiePriceRows] as SellingPriceRow[]

  const restockRows: RestockEntry[] = restockRaw.map((r) => ({
    Item:            String(r['Item']           ?? ''),
    'Volume/Weight': Number(r['Volume/Weight']  ?? 0),
    unit:            String(r['unit']           ?? ''),
    QTY:             Number(r['QTY']            ?? 0),
    Price:           Number(r['Price']          ?? 0),
    Total:           Number(r['Total']          ?? 0),
    Method:          (String(r['Method'] ?? 'CASH').toUpperCase() === 'GCASH' ? 'GCASH' : 'CASH') as 'CASH' | 'GCASH',
    Date:            Number(r['Date']           ?? 0),
    Supplier:        String(r['Supplier']       ?? ''),
  }))

  // Build formula map first — needed for exact cost recomputation below.
  const formulaMap = parseFormulaMap(wb)

  // Sync in-memory ingredient prices (and per-cup prices) to latest restock on load,
  // then recompute drink costs exactly via formula map (delta fallback if map is empty).
  const { newPricing: syncedPricing } = recalcIngredientPricesFromRestocks(pricingData, restockRows)
  const syncedCosting = formulaMap.size
    ? recomputeDrinkCostsFromFormulaMap(drinkCosting, syncedPricing, formulaMap)
    : recomputeDrinkCostsFromIngredientChange(drinkCosting, pricingData, syncedPricing)

  return {
    inventory,
    rawIngredientsPricing: syncedPricing,
    costing:    syncedCosting,
    foodCosting: foodCostData,
    sellingPrices,
    dailySales,
    restockRows,
    formulaMap,
    wb,
  }
}

// ─── Drink cost recalculation ─────────────────────────────────────────────────

// Positional row-pair approach: compares oldPricing[i] vs newPricing[i] directly.
// This eliminates double-counting that occurred when the same ingredient name
// appears multiple times (e.g. JollyCow as MILK + CREAM_SERIES) with different
// prices — the old name-lookup approach would cross-apply the wrong delta to the
// wrong row.
export const recomputeDrinkCostsFromIngredientChange = (
  costing:    CostingRow[],
  oldPricing: RawIngredientPricingRow[],
  newPricing: RawIngredientPricingRow[],
): CostingRow[] => {
  type RowChange = {
    row: RawIngredientPricingRow
    d8:  number
    d12: number
    d16: number
  }

  const rowChanges: RowChange[] = []

  newPricing.forEach((newRow, i) => {
    const oldRow = oldPricing[i]
    if (!oldRow) return

    const oldPrice     = parseNum(oldRow['PRICE'])
    const newPrice     = parseNum(newRow['PRICE'])
    if (oldPrice === newPrice) return

    // Unit-convert containerVol so that priceRate is always in ₱/ml (or ₱/g).
    // newPrice from recalcIngredientPricesFromRestocks is already scaled to the
    // toBaseVol-normalised volume — the denominator here must match.
    const ingUnit      = String(newRow['UNIT'] ?? '').trim()
    const containerVol = toBaseVol(parseNum(newRow['VOLUME']), ingUnit)
    if (!containerVol) return

    const priceRate = (newPrice - oldPrice) / containerVol   // ₱ per ml (or ₱ per g)

    const d8  = priceRate * parseNum(newRow['8oz HOT / vol'])
    const d12 = priceRate * parseNum(newRow['12oz (volume)'])
    const d16 = priceRate * parseNum(newRow['16oz (volume)'])

    if (!d8 && !d12 && !d16) return
    rowChanges.push({ row: newRow, d8, d12, d16 })
  })

  if (!rowChanges.length) return costing

  return costing.map((drink) => {
    const milkType    = String(drink['Milk Type'] ?? '').trim()
    const beanNames   = splitBeans(drink['Bean Type'])
    const drinkSeries = String(drink['Series'] ?? '').toLowerCase()
    const dName       = drink.Drinks.trim().toLowerCase()
    const isKCNT      = drinkSeries.includes('kohi cream') && !dName.includes('tiramisu')

    const drinkHasFruitPuree = newPricing.some((r) =>
      String(r.CATEGORY ?? '').toUpperCase() === 'DRINK_SPECIFIC' &&
      String(r.INGREDIENTS ?? '').toLowerCase().includes('puree') &&
      dName.includes(String(r['DRINK TYPE'] ?? '').trim().toLowerCase())
    )
    const usesBobba = isKCNT || drinkHasFruitPuree

    let cd8 = 0, cd12 = 0, cd16 = 0

    rowChanges.forEach(({ row: pr, d8, d12, d16 }) => {
      const cat       = String(pr.CATEGORY    ?? '').trim().toUpperCase()
      const drinkType = String(pr['DRINK TYPE'] ?? '').trim()
      const ingName   = String(pr.INGREDIENTS  ?? '').trim().toLowerCase()

      let applies = false
      if (cat === 'DRINK_SPECIFIC' && drinkType && dName.includes(drinkType.trim().toLowerCase()))
        applies = true
      if (cat === 'MILK' && milkType && milkType !== 'N/A' &&
          ingName === milkType.toLowerCase()) {
        const milkForDrink = drinkType && drinkType !== 'N/A' ? drinkType.toLowerCase() : null
        if (!milkForDrink || dName.includes(milkForDrink)) applies = true
      }
      if (cat === 'BEAN' && beanNames.some((b) => b === ingName))
        applies = true
      if (cat === 'ICE' || cat === 'GENERIC')
        applies = true
      if (cat === 'CREAM_SERIES'        && isKCNT && !dName.includes('memento'))                            applies = true
      if (cat === 'BREVE_SERIES'        && dName.includes('memento') && drinkSeries.includes('kohi cream')) applies = true
      if (cat === 'CREAM_CHEESE_SERIES' && dName.includes('tiramisu') && drinkSeries.includes('kohi cream')) applies = true

      // ── PACKAGING delta: mirrors computeInventoryAfterDeduction rules ────────
      if (cat === 'PACKAGING' && !PLASTIC_BAG_NAMES.includes(ingName)) {
        const p = ingName
        if (p.includes('dome'))   { if (isKCNT) cd12 += d12; return }
        if (p.includes('sip'))    { if (!isKCNT) cd12 += d12; cd16 += d16; return }
        if (p.includes('flat'))   { return }  // flat lids: no longer assigned to any drink
        if (p.includes('bobba'))  { if (usesBobba)  { cd12 += d12; cd16 += d16 }; return }
        if (p.includes('thin'))   { if (!usesBobba) { cd12 += d12; cd16 += d16 }; return }
        if (p.includes('12oz') && !p.includes('16oz')) { cd12 += d12; return }
        if (p.includes('16oz') && !p.includes('12oz')) { cd16 += d16; return }
        cd8 += d8  // 8oz paper cup / plastic lid
        return
      }

      if (!applies) return

      cd8  += d8
      cd12 += d12
      // DRINK_SPECIFIC ingredients have a fixed per-cup amount — same for 12oz and 16oz.
      // When 16oz (volume) is N/A, d16 = 0 and the 16oz baseline would never update.
      // Use d12 as the 16oz delta so price changes propagate to both sizes correctly.
      cd16 += (cat === 'DRINK_SPECIFIC' && d16 === 0) ? d12 : d16
    })

    const upd = (cur: unknown, delta: number): unknown => {
      const n = parseNum(cur)
      return (typeof cur === 'number' && cur !== 0 && n > 0)
        ? parseFloat((n + delta).toFixed(10))
        : cur
    }

    return {
      ...drink,
      '8oz':  upd(drink['8oz'],  cd8),
      '12oz': upd(drink['12oz'], cd12),
      '16oz': upd(drink['16oz'], cd16),
    } as CostingRow
  })
}

// ─── Per-cup price recomputation from volume changes ─────────────────────────
// When the user edits volume-used columns, per-cup price fields must also update.
// Call this before recomputeDrinkCostsFromFormulaMap when volumes change.
export const recomputePerCupPricesFromVolumes = (
  pricing: RawIngredientPricingRow[]
): RawIngredientPricingRow[] => {
  const PAIRS: Array<[string, string]> = [
    ['8oz ICED / vol',        '8oz ICED / price'],
    ['8oz HOT / vol',         '8oz HOT / price'],
    ['12oz (volume)',          '12oz PRICE'],
    ['16oz (volume)',          '16oz PRICE'],
    ['MASTER DOUGH (volume)', 'MASTER DOUGH (price)'],
  ]
  return pricing.map((row) => {
    const basePrice    = parseNum(row['PRICE'])
    const containerVol = parseNum(row['VOLUME'])
    if (!basePrice || !containerVol) return row
    const pricePerUnit = basePrice / containerVol
    const updates: Record<string, unknown> = {}
    PAIRS.forEach(([volKey, priceKey]) => {
      const vol = parseNum(row[volKey])
      if (vol > 0) updates[priceKey] = parseFloat((pricePerUnit * vol).toFixed(4))
    })
    return { ...row, ...updates }
  })
}

// ─── Exact drink cost recomputation via formula map ───────────────────────────
// Replaces the delta approach when a formula map is available.
// For each (drink, size), sums the exact per-cup prices from rawIngredientsPricing
// using the cell references captured at workbook parse time.
// Falls back to the original cached value when no formula map entry exists.
export const recomputeDrinkCostsFromFormulaMap = (
  costing:    CostingRow[],
  newPricing: RawIngredientPricingRow[],
  formulaMap: FormulaMap,
): CostingRow[] => {
  if (!formulaMap.size) return costing

  const sumRefs = (refs: FormulaRef[]): number =>
    refs.reduce((sum, { ipIdx, priceKey }) => {
      const row = newPricing[ipIdx]
      if (!row) return sum
      let price = parseNum(row[priceKey])
      // Safety fallback: if the resolved price is 0/N/A, try the opposite-size price so costs
      // are not silently zeroed out (e.g. before per-cup prices have been recalculated).
      if (price <= 0 && priceKey === '16oz PRICE') price = parseNum(row['12oz PRICE'])
      else if (price <= 0 && priceKey === '12oz PRICE') price = parseNum(row['16oz PRICE'])
      return sum + price
    }, 0)

  const SIZE_KEYS = ['8oz', '12oz', '16oz', 'Slice', 'Shots', 'Latte Art'] as const

  return costing.map((drink) => {
    const drinkName = String(drink.Drinks ?? '').trim()
    const updates: Record<string, unknown> = {}

    SIZE_KEYS.forEach((size) => {
      const refs = formulaMap.get(`${drinkName}|${size}`)
      if (!refs || !refs.length) return

      // For inferred 16oz entries: dynamically exclude DS refs whose 16oz (volume)
      // is 0 in current pricing when ≥1 other DS ref already has a 16oz volume.
      // Handles the case where the formula map was built at import (dsConfigured=false
      // at that time) but the user has since configured 16oz volumes in-app.
      let activeRefs = refs
      if (size === '16oz') {
        const dsConfigured = refs.some(({ ipIdx: i, priceKey }) =>
          priceKey === '16oz PRICE' &&
          String(newPricing[i]?.['CATEGORY'] ?? '').trim().toUpperCase() === 'DRINK_SPECIFIC' &&
          parseNum(newPricing[i]?.['16oz (volume)']) > 0
        )
        if (dsConfigured) {
          activeRefs = refs.filter(({ ipIdx: i, priceKey }) => {
            if (priceKey !== '16oz PRICE') return true
            const r = newPricing[i]
            if (String(r?.['CATEGORY'] ?? '').trim().toUpperCase() !== 'DRINK_SPECIFIC') return true
            return parseNum(r?.['16oz (volume)']) > 0
          })
        }
      }

      const newCost = parseFloat(sumRefs(activeRefs).toFixed(10))
      // Always update when formula refs exist — the ref list is only built for cells
      // that have formulas in the Excel, so their cost should always be recomputed.
      // N/A cells have no formula and thus no refs, so they are never touched.
      updates[size] = newCost
    })

    return Object.keys(updates).length ? { ...drink, ...updates } as CostingRow : drink
  })
}

// ─── Drink cost recalculation from ingredient volume changes ─────────────────
// Called when user edits volume-used columns in IngredientsTab.
// Mirrors the matching logic of recomputeDrinkCostsFromIngredientChange but
// computes cost deltas from changed volumes rather than changed base prices.
export const recomputeDrinkCostsFromVolumeChanges = (
  costing:    CostingRow[],
  oldPricing: RawIngredientPricingRow[],
  newPricing: RawIngredientPricingRow[],
): CostingRow[] => {
  type VolChange = {
    row: RawIngredientPricingRow
    d8:  number
    d12: number
    d16: number
  }

  const volChanges: VolChange[] = []

  newPricing.forEach((newRow, i) => {
    const oldRow = oldPricing[i]
    if (!oldRow) return

    const price        = parseNum(newRow['PRICE'])
    const ingUnit2     = String(newRow['UNIT'] ?? '').trim()
    const containerVol = toBaseVol(parseNum(newRow['VOLUME']), ingUnit2)
    if (!price || !containerVol) return

    const costRate = price / containerVol   // ₱ per ml (or ₱ per g)

    const old8h = parseNum(oldRow['8oz HOT / vol'])
    const new8h = parseNum(newRow['8oz HOT / vol'])
    const old12 = parseNum(oldRow['12oz (volume)'])
    const new12 = parseNum(newRow['12oz (volume)'])
    const old16 = parseNum(oldRow['16oz (volume)'])
    const new16 = parseNum(newRow['16oz (volume)'])

    const d8  = costRate * (new8h - old8h)
    const d12 = costRate * (new12 - old12)
    const d16 = costRate * (new16 - old16)

    if (!d8 && !d12 && !d16) return
    volChanges.push({ row: newRow, d8, d12, d16 })
  })

  if (!volChanges.length) return costing

  return costing.map((drink) => {
    const milkType    = String(drink['Milk Type'] ?? '').trim()
    const beanNames   = splitBeans(drink['Bean Type'])
    const drinkSeries = String(drink['Series'] ?? '').toLowerCase()
    const dName       = drink.Drinks.trim().toLowerCase()
    const isKCNT      = drinkSeries.includes('kohi cream') && !dName.includes('tiramisu')

    const drinkHasFruitPuree = newPricing.some((r) =>
      String(r.CATEGORY ?? '').toUpperCase() === 'DRINK_SPECIFIC' &&
      String(r.INGREDIENTS ?? '').toLowerCase().includes('puree') &&
      dName.includes(String(r['DRINK TYPE'] ?? '').trim().toLowerCase())
    )
    const usesBobba = isKCNT || drinkHasFruitPuree

    let cd8 = 0, cd12 = 0, cd16 = 0

    volChanges.forEach(({ row: pr, d8, d12, d16 }) => {
      const cat       = String(pr.CATEGORY    ?? '').trim().toUpperCase()
      const drinkType = String(pr['DRINK TYPE'] ?? '').trim()
      const ingName   = String(pr.INGREDIENTS  ?? '').trim().toLowerCase()

      let applies = false
      if (cat === 'DRINK_SPECIFIC' && drinkType && dName.includes(drinkType.trim().toLowerCase()))
        applies = true
      if (cat === 'MILK' && milkType && milkType !== 'N/A' &&
          ingName === milkType.toLowerCase()) {
        const milkForDrink = drinkType && drinkType !== 'N/A' ? drinkType.toLowerCase() : null
        if (!milkForDrink || dName.includes(milkForDrink)) applies = true
      }
      if (cat === 'BEAN' && beanNames.some((b) => b === ingName))
        applies = true
      if (cat === 'ICE' || cat === 'GENERIC')
        applies = true
      if (cat === 'CREAM_SERIES'        && isKCNT && !dName.includes('memento'))                            applies = true
      if (cat === 'BREVE_SERIES'        && dName.includes('memento') && drinkSeries.includes('kohi cream')) applies = true
      if (cat === 'CREAM_CHEESE_SERIES' && dName.includes('tiramisu') && drinkSeries.includes('kohi cream')) applies = true

      if (cat === 'PACKAGING' && !PLASTIC_BAG_NAMES.includes(ingName)) {
        const p = ingName
        if (p.includes('dome'))   { if (isKCNT) cd12 += d12; return }
        if (p.includes('sip'))    { if (!isKCNT) cd12 += d12; cd16 += d16; return }
        if (p.includes('flat'))   { return }  // flat lids: no longer assigned to any drink
        if (p.includes('bobba'))  { if (usesBobba)  { cd12 += d12; cd16 += d16 }; return }
        if (p.includes('thin'))   { if (!usesBobba) { cd12 += d12; cd16 += d16 }; return }
        if (p.includes('12oz') && !p.includes('16oz')) { cd12 += d12; return }
        if (p.includes('16oz') && !p.includes('12oz')) { cd16 += d16; return }
        cd8 += d8
        return
      }

      if (!applies) return
      cd8  += d8
      cd12 += d12
      cd16 += d16
    })

    // Allow updates even when current cost is 0 (newly populated size)
    const updVol = (cur: unknown, delta: number): unknown => {
      if (!delta) return cur
      const n = parseNum(cur)
      return parseFloat(((n || 0) + delta).toFixed(10))
    }

    return {
      ...drink,
      '8oz':  updVol(drink['8oz'],  cd8),
      '12oz': updVol(drink['12oz'], cd12),
      '16oz': updVol(drink['16oz'], cd16),
    } as CostingRow
  })
}

// ─── In-memory price recalculation from all restocks ────────────────────────
// Always uses the latest-date restock entry per ingredient.
// Call this whenever restockRows changes (add, load).

export interface PriceChange {
  INGREDIENTS: string
  VOLUME:      number
  oldPrice:    number
  newPrice:    number
}

export const recalcIngredientPricesFromRestocks = (
  rawIngredientsPricing: RawIngredientPricingRow[],
  restockRows:           RestockEntry[]
): { newPricing: RawIngredientPricingRow[]; priceChanges: PriceChange[] } => {
  if (!restockRows.length) return { newPricing: rawIngredientsPricing, priceChanges: [] }

  const restockAsRaw = restockRows as unknown as Record<string, unknown>[]
  const priceChanges: PriceChange[] = []

  const newPricing = rawIngredientsPricing.map((row) => {
    const ingName = String(row.INGREDIENTS ?? '').trim()
    const ingVol  = parseNum(row['VOLUME'])
    const ingUnit = String(row['UNIT'] ?? '').trim()
    if (!ingVol || !ingUnit) return row

    const matches = fuzzyMatchRestock(ingName, restockAsRaw)
    if (!matches.length) return row

    // Always pick the LATEST restock entry by Date
    const sorted      = [...matches].sort((a, b) => Number(b['Date']) - Number(a['Date']))
    const latest      = sorted[0]
    const restockPrice = Number(latest['Price'])
    const restockVol   = Number(latest['Volume/Weight'])
    const restockUnit  = String(latest['unit'] ?? '').trim()
    if (!restockPrice || !restockVol) return row

    const ingBase     = toBaseVol(ingVol, ingUnit)
    const restockBase = toBaseVol(restockVol, restockUnit)
    if (!restockBase) return row

    const oldPrice = parseNum(row['PRICE'])
    const newPrice = parseFloat(((restockPrice / restockBase) * ingBase).toFixed(4))

    if (oldPrice !== newPrice) {
      priceChanges.push({ INGREDIENTS: ingName, VOLUME: ingVol, oldPrice, newPrice })
    }

    // Recompute per-cup prices so they stay current without needing the delta approach.
    // Formula mirrors the Excel cell: price = (PRICE / container_vol) * vol_used_per_cup
    const pricePerUnit = ingVol > 0 ? newPrice / ingVol : 0
    const perCupUpdates: Record<string, unknown> = {}
    const VOL_PRICE_PAIRS: Array<[string, string]> = [
      ['8oz ICED / vol',        '8oz ICED / price'],
      ['8oz HOT / vol',         '8oz HOT / price'],
      ['12oz (volume)',          '12oz PRICE'],
      ['16oz (volume)',          '16oz PRICE'],
      ['MASTER DOUGH (volume)', 'MASTER DOUGH (price)'],
    ]
    VOL_PRICE_PAIRS.forEach(([volKey, priceKey]) => {
      const vol = parseNum(row[volKey])
      if (vol > 0 && pricePerUnit > 0) {
        perCupUpdates[priceKey] = parseFloat((pricePerUnit * vol).toFixed(4))
      }
    })

    return { ...row, PRICE: newPrice, ...perCupUpdates }
  })

  return { newPricing, priceChanges }
}

// ─── Ingredients Pricing price sync ──────────────────────────────────────────

const updateIngredientsPrices = (
  workbook:    XLSX.WorkBook,
  restockRows: Record<string, unknown>[]
): void => {
  const ws = workbook.Sheets['Ingredients Pricing']
  if (!ws) return

  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hIdx = raw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'INGREDIENTS'))
  if (hIdx === -1) return

  const ingColIdx   = 0  // INGREDIENTS
  const volColIdx   = 3  // VOLUME
  const unitColIdx  = 4  // UNIT
  const priceColIdx = 5  // PRICE (master per-container price, hardcoded in col F)

  // Main loop: only runs if there are restock entries to process
  if (restockRows.length) for (let rowIdx = hIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row     = raw[rowIdx] as unknown[]
    const ingName = String(row[ingColIdx] ?? '').trim()
    if (!ingName) continue

    const ingVolume = parseFloat(String(row[volColIdx] ?? ''))
    const ingUnit   = String(row[unitColIdx] ?? '').trim()
    if (!ingVolume || isNaN(ingVolume)) continue

    const matches = fuzzyMatchRestock(ingName, restockRows)
    if (!matches.length) continue

    const sorted       = [...matches].sort((a, b) => Number(b['Date']) - Number(a['Date']))
    const latest       = sorted[0]
    const restockPrice = Number(latest['Price'])
    const restockVol   = Number(latest['Volume/Weight'])
    const restockUnit  = String(latest['unit'] ?? '').trim()
    if (!restockPrice || !restockVol) continue

    // Normalize both volumes to the same base unit before scaling
    const ingBase     = toBaseVol(ingVolume, ingUnit)
    const restockBase = toBaseVol(restockVol, restockUnit)
    if (!restockBase) continue

    const newPrice = (restockPrice / restockBase) * ingBase

    const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: priceColIdx })
    const existing = ws[cellAddr]
    // Only overwrite hardcoded value cells — never touch formula cells
    // Spread existing to preserve cell style (`s` property)
    if (existing && !existing.f && existing.t === 'n') {
      ws[cellAddr] = { ...existing, t: 'n', v: parseFloat(newPrice.toFixed(4)), w: undefined }
    }

    // Also write the computed per-cup prices to 12oz PRICE (col O / index 14) and
    // 16oz PRICE (col R / index 17) so the exported file has correct static values.
    // Formula cells keep their .f string but get a fresh .v; N/A text cells are
    // overwritten with numbers when the corresponding volume column is defined.
    const pricePerUnit = ingBase > 0 ? newPrice / ingBase : 0
    if (pricePerUnit > 0) {
      ;[{ colVol: 12, colPrice: 14 }, { colVol: 15, colPrice: 17 }].forEach(({ colVol, colPrice }) => {
        const vol = parseFloat(String(row[colVol] ?? ''))
        if (!isFinite(vol) || vol <= 0) return
        const perCupPrice = parseFloat((pricePerUnit * vol).toFixed(4))
        const pAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colPrice })
        const pCell = ws[pAddr]
        ws[pAddr] = pCell ? { ...pCell, v: perCupPrice, t: 'n', w: undefined }
                          : { v: perCupPrice, t: 'n' }
      })
    }
  }

}

// ── Stamp 16oz QTY CUPS (Q/col 16) and 16oz PRICE (R/col 17) with formulas ───
// Called AFTER updateIngredientVolumes so that col P already has the user-updated
// 16oz volume values before we test whether a row needs formulas written.
// Any row with a numeric 16oz volume in col P but N/A in Q or R receives:
//   Q = D{row}/P{row}   (container volume ÷ per-cup volume)
//   R = F{row}/Q{row}   (base PRICE ÷ QTY CUPS)
// "R" here uses the existing col F price — works whether or not a restock matched.
const stampDrinkSpecificFormulas = (workbook: XLSX.WorkBook): void => {
  const ws = workbook.Sheets['Ingredients Pricing']
  if (!ws) return

  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hIdx = raw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'INGREDIENTS'))
  if (hIdx === -1) return

  const isNA = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' || s.toUpperCase() === 'N/A' }

  for (let rowIdx = hIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row = raw[rowIdx] as unknown[]
    if (!String(row[0] ?? '').trim()) continue

    // Read p16Vol from the worksheet cell — it was updated by updateIngredientVolumes
    const pAddr  = XLSX.utils.encode_cell({ r: rowIdx, c: 15 })
    const p16Vol = parseFloat(String(ws[pAddr]?.v ?? row[15] ?? ''))
    if (!isFinite(p16Vol) || p16Vol <= 0) continue

    if (!isNA(row[16]) && !isNA(row[17])) continue

    const r         = rowIdx + 1
    const vol       = parseFloat(String(ws[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })]?.v ?? row[3] ?? ''))
    const fAddr     = XLSX.utils.encode_cell({ r: rowIdx, c: 5 })
    const basePrice = Number(ws[fAddr]?.v ?? row[5] ?? 0)

    if (isNA(row[16])) {
      const qtyCups = (isFinite(vol) && p16Vol > 0) ? parseFloat((vol / p16Vol).toFixed(4)) : 0
      const qAddr   = XLSX.utils.encode_cell({ r: rowIdx, c: 16 })
      const qCell   = ws[qAddr]
      ws[qAddr] = qCell
        ? { ...qCell, f: `D${r}/P${r}`, t: 'n', v: qtyCups, w: undefined }
        : { f: `D${r}/P${r}`, t: 'n', v: qtyCups }
    }

    if (isNA(row[17])) {
      const qAddr       = XLSX.utils.encode_cell({ r: rowIdx, c: 16 })
      const qtyCupsVal  = Number(ws[qAddr]?.v ?? 0)
      const perCupPrice = (basePrice > 0 && qtyCupsVal > 0) ? parseFloat((basePrice / qtyCupsVal).toFixed(4)) : 0
      const rAddr       = XLSX.utils.encode_cell({ r: rowIdx, c: 17 })
      const rCell       = ws[rAddr]
      ws[rAddr] = rCell
        ? { ...rCell, f: `F${r}/Q${r}`, t: 'n', v: perCupPrice, w: undefined }
        : { f: `F${r}/Q${r}`, t: 'n', v: perCupPrice }
    }
  }
}

// ─── Restock application ─────────────────────────────────────────────────────

export interface RestockApplyResult {
  inventory:             InventoryItem[]
  rawIngredientsPricing: RawIngredientPricingRow[]
  priceChanges:          Array<{ INGREDIENTS: string; VOLUME: number; oldPrice: number; newPrice: number }>
}

export const applyRestockToInventory = (
  inventory:             InventoryItem[],
  rawIngredientsPricing: RawIngredientPricingRow[],
  entry:                 RestockEntry
): RestockApplyResult => {
  const restockAsRaw = [entry] as unknown as Record<string, unknown>[]
  const stockAdded   = entry['Volume/Weight'] * entry.QTY
  const dateStr      = excelSerialToDateStr(entry.Date)

  const newInventory = inventory.map((item) => {
    const matches = fuzzyMatchRestock(item.INGREDIENTS, restockAsRaw)
    if (!matches.length) return item
    return {
      ...item,
      stock:             item.stock + stockAdded,
      originalStock:     item.stock + stockAdded,
      LAST_RESTOCK_DATE: dateStr,
      LAST_RESTOCK_QTY:  stockAdded,
    }
  })

  const priceChanges: RestockApplyResult['priceChanges'] = []

  const newPricing = rawIngredientsPricing.map((row) => {
    const matches = fuzzyMatchRestock(row.INGREDIENTS, restockAsRaw)
    if (!matches.length) return row
    const ingVol  = parseNum(row['VOLUME'])
    const ingUnit = String(row['UNIT'] ?? '').trim()
    if (!ingVol || !ingUnit) return row
    const ingBase     = toBaseVol(ingVol, ingUnit)
    const restockBase = toBaseVol(entry['Volume/Weight'], entry.unit)
    if (!restockBase || !entry.Price) return row
    const oldPrice = parseNum(row['PRICE'])
    const newPrice = parseFloat(((entry.Price / restockBase) * ingBase).toFixed(4))
    priceChanges.push({ INGREDIENTS: row.INGREDIENTS, VOLUME: ingVol, oldPrice, newPrice })
    return { ...row, PRICE: newPrice }
  })

  return { inventory: newInventory, rawIngredientsPricing: newPricing, priceChanges }
}

// ─── Export write-back helpers ───────────────────────────────────────────────

// Writes editable volume columns from rawIngredientsPricing back to the
// Ingredients Pricing sheet.
//
// SAFETY RULES:
// 1. Positional walk (mirrors parseIngredientsPricing row-skip logic exactly).
//    Name-keyed Maps collapse duplicate ingredient names (same ingredient
//    repeated for different DRINK TYPEs) and corrupt cells. Positional walk
//    guarantees 1-to-1 correspondence.
// 2. Empty string ('') = cell was blank in original Excel → leave unchanged.
//    'N/A' = user explicitly cleared the field → write 'N/A' back.
//    Positive number → write the number.
//    Zero / null / undefined → leave unchanged.
const updateIngredientVolumes = (
  workbook:              XLSX.WorkBook,
  rawIngredientsPricing: RawIngredientPricingRow[]
): void => {
  const ws = workbook.Sheets['Ingredients Pricing']
  if (!ws || !rawIngredientsPricing.length) return

  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hIdx = raw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'INGREDIENTS'))
  if (hIdx === -1) return

  const VOL_COLS = [
    { colIdx: 6,  key: '8oz ICED / vol'        as const },
    { colIdx: 7,  key: '8oz HOT / vol'         as const },
    { colIdx: 12, key: '12oz (volume)'         as const },
    { colIdx: 15, key: '16oz (volume)'         as const },
    { colIdx: 18, key: 'MASTER DOUGH (volume)' as const },
  ]

  let pricingIdx = 0
  for (let rowIdx = hIdx + 1; rowIdx < raw.length; rowIdx++) {
    if (pricingIdx >= rawIngredientsPricing.length) break

    const exRow  = raw[rowIdx] as unknown[]
    const rawIng = exRow[0]
    if (!rawIng || String(rawIng).trim() === '') continue  // mirror parseIngredientsPricing filter

    const pr = rawIngredientsPricing[pricingIdx++]

    VOL_COLS.forEach(({ colIdx, key }) => {
      const rawVal      = pr[key]
      const isExplicitNA = rawVal === 'N/A'
      const isEmpty      = rawVal === '' || rawVal === undefined || rawVal === null
      // '' comes from defval: '' when the cell was blank → do NOT write anything
      if (isEmpty) return

      const addr  = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const exist = ws[addr]

      if (isExplicitNA) {
        ws[addr] = exist ? { ...exist, v: 'N/A', t: 's', w: undefined } : { v: 'N/A', t: 's' }
      } else {
        const n = parseNum(rawVal)
        if (n <= 0) return  // no meaningful volume → leave cell unchanged
        ws[addr] = exist ? { ...exist, v: n, t: 'n', w: undefined } : { v: n, t: 'n' }
      }
    })
  }
}

// Writes specific price columns back to a selling price sheet.
// Only writes POSITIVE prices; skips zeros, blanks, formula cells.
// Name-keyed is safe here because drink names are unique in the selling price sheets.
const updateSellingPriceColumns = (
  workbook:  XLSX.WorkBook,
  sheetName: string,
  data:      SellingPriceRow[],
  priceKeys: string[]
): void => {
  const ws = workbook.Sheets[sheetName]
  if (!ws || !data.length) return

  const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const hIdx = raw.findIndex((r) => (r as string[]).some((c) => String(c).trim() === 'Drinks'))
  if (hIdx === -1) return

  const headers    = raw[hIdx] as string[]
  const nameColIdx = headers.findIndex((h) => h.trim() === 'Drinks')
  if (nameColIdx === -1) return

  // Pre-compute column indices for only the target price keys
  const colMap: Array<{ key: string; colIdx: number }> = []
  priceKeys.forEach((key) => {
    const idx = headers.findIndex((h) => h.trim() === key)
    if (idx !== -1) colMap.push({ key, colIdx: idx })
  })
  if (!colMap.length) return

  const byName = new Map<string, SellingPriceRow>()
  data.forEach((r) => byName.set(String(r.Drinks ?? '').trim().toLowerCase(), r))

  for (let rowIdx = hIdx + 1; rowIdx < raw.length; rowIdx++) {
    const exRow = raw[rowIdx] as unknown[]
    const name  = String(exRow[nameColIdx] ?? '').trim().toLowerCase()
    if (!name) continue
    const match = byName.get(name)
    if (!match) continue

    colMap.forEach(({ key, colIdx }) => {
      const val = match[key]
      const n   = typeof val === 'number' ? val : parseNum(val)
      if (n <= 0) return  // 0 = N/A or unset → leave the Excel cell unchanged
      const addr  = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const exist = ws[addr]
      if (exist?.f) return  // never overwrite formula cells
      ws[addr] = exist ? { ...exist, v: n, t: 'n', w: undefined } : { v: n, t: 'n' }
    })
  }
}

// updateDrinkCosting intentionally removed — the Drinks Costing sheet in the
// master file holds hand-calculated baseline costs and must not be overwritten
// on export. In-memory costing is recomputed each session from restock price deltas.

// ─── Export workbook ──────────────────────────────────────────────────────────

export const exportPOSData = (
  wbSource:              XLSX.WorkBook,
  inventory:             InventoryItem[],
  dailySales:            SaleRow[],
  originalRestocks:      RestockEntry[]            = [],
  newRestocks:           RestockEntry[]            = [],
  rawIngredientsPricing: RawIngredientPricingRow[] = [],
  sellingPrices:         SellingPriceRow[]         = []
): void => {
  // Deep-clone at JS object level — avoids a lossy binary write→read round-trip
  // that strips cell style data in the community SheetJS build.
  // structuredClone preserves Uint8Arrays (theme/image blobs); JSON fallback for
  // environments that don't support it yet.
  let workbook: XLSX.WorkBook
  try {
    workbook = structuredClone(wbSource) as XLSX.WorkBook
  } catch {
    workbook = JSON.parse(JSON.stringify(wbSource)) as XLSX.WorkBook
  }

  // Update cells IN PLACE to preserve the original cell styles (colors, borders, fonts).
  // Previously used aoa_to_sheet() which created a brand-new sheet with no styling.
  const replaceSheetData = (sheetName: string, newData: Record<string, unknown>[]): void => {
    const ws = workbook.Sheets[sheetName]
    if (!ws) return

    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
    const headerIndex = raw.findIndex((row) =>
      (row as string[]).some((c) => ['Date', 'INGREDIENTS', 'ITEMS'].includes(String(c).trim()))
    )
    if (headerIndex === -1) return

    const headers  = raw[headerIndex] as string[]
    const oldRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

    newData.forEach((rowData, offset) => {
      const r = headerIndex + 1 + offset
      headers.forEach((header, c) => {
        const addr    = XLSX.utils.encode_cell({ r, c })
        const val     = rowData[header] ?? ''
        const t       = typeof val === 'number' ? 'n' : 's'
        const current = ws[addr]
        // Keep the existing cell object (preserving its `s` style property), update value only
        ws[addr] = current ? { ...current, v: val, t, w: undefined } : { v: val, t }
      })
    })

    // Extend the range if new data has more rows than before
    const newLastRow = headerIndex + newData.length
    if (newLastRow > oldRange.e.r) {
      ws['!ref'] = XLSX.utils.encode_range({ s: oldRange.s, e: { r: newLastRow, c: oldRange.e.c } })
    }
  }

  const inventoryForExport = inventory.map((item) => {
    const row = { ...item } as Record<string, unknown>
    // Excel uses ITEMS column; map back from INGREDIENTS
    row['ITEMS'] = item.INGREDIENTS
    if ('STOCKS' in item) row['STOCKS'] = item.stock
    if ('VOLUME' in item) row['VOLUME'] = item.stock
    if (item.LAST_RESTOCK_DATE) row['LAST_RESTOCK_DATE'] = item.LAST_RESTOCK_DATE
    if (item.LAST_RESTOCK_QTY !== undefined) row['LAST_RESTOCK_QTY'] = item.LAST_RESTOCK_QTY
    return row
  })
  replaceSheetData('Updated Inventory', inventoryForExport)

  // Write restock entries to the Restock Details sheet.
  // Strategy: update original rows in-place (preserves fee/shipping rows and cell
  // styles that the filter in parseWorkbook strips out), then append new entries.
  if (workbook.Sheets['Restock Details']) {
    const rsWs     = workbook.Sheets['Restock Details']
    const rsRaw    = XLSX.utils.sheet_to_json<unknown[]>(rsWs, { header: 1 }) as unknown[][]
    const rsHdrIdx = rsRaw.findIndex((r) =>
      (r as string[]).some((c) => String(c).trim() === 'Item')
    )
    if (rsHdrIdx !== -1) {
      const rsHeaders = rsRaw[rsHdrIdx] as string[]
      const volIdx    = rsHeaders.indexOf('Volume/Weight')
      const qtyIdx    = rsHeaders.indexOf('QTY')
      const dateIdx   = rsHeaders.indexOf('Date')

      // Pass 1: overwrite valid (non-fee) rows with potentially-edited originalRestocks
      let filteredIdx = 0
      for (let rowI = rsHdrIdx + 1; rowI < rsRaw.length; rowI++) {
        if (filteredIdx >= originalRestocks.length) break
        const row = rsRaw[rowI] as unknown[]
        const isValid =
          /[a-zA-Z]{3,}/.test(String(row[0] ?? '')) &&
          typeof row[volIdx]  === 'number' &&
          typeof row[qtyIdx]  === 'number' &&
          typeof row[dateIdx] === 'number'
        if (!isValid) continue  // fee / shipping row — leave untouched
        const updated = originalRestocks[filteredIdx++]
        rsHeaders.forEach((h, colI) => {
          const val = (updated as unknown as Record<string, unknown>)[h]
          if (val === undefined) return
          const addr     = XLSX.utils.encode_cell({ r: rowI, c: colI })
          const existing = rsWs[addr]
          const t        = typeof val === 'number' ? 'n' : 's'
          rsWs[addr]     = existing ? { ...existing, t, v: val, w: undefined } : { t, v: val }
        })
      }

      // Pass 2: append anything not matched in place (unmatched originals + new entries)
      const toAppend = [...originalRestocks.slice(filteredIdx), ...newRestocks]
      if (toAppend.length) {
        const range   = XLSX.utils.decode_range(rsWs['!ref'] ?? 'A1')
        const newRows = toAppend.map((entry) =>
          rsHeaders.map((h) => (entry as unknown as Record<string, unknown>)[h] ?? '')
        )
        XLSX.utils.sheet_add_aoa(rsWs, newRows, { origin: { r: range.e.r + 1, c: 0 } })
        rsWs['!ref'] = XLSX.utils.encode_range({
          s: range.s,
          e: { r: range.e.r + newRows.length, c: range.e.c },
        })
      }
    }
  }

  // Sync latest restock prices → Ingredients Pricing PRICE column
  const restockForExport = workbook.Sheets['Restock Details']
    ? (XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets['Restock Details'], { defval: '' }
      ).filter((r) =>
        /[a-zA-Z]{3,}/.test(String(r['Item'] ?? '')) &&
        typeof r['Volume/Weight'] === 'number' &&
        typeof r['QTY']           === 'number' &&
        typeof r['Date']          === 'number'
      ))
    : []
  updateIngredientsPrices(workbook, restockForExport)

  // Write back user-edited ingredient volumes and selling prices.
  // Drink/Food costing sheets are intentionally NOT written back — the master
  // file holds the hand-calculated baseline costs and must stay pristine.
  // In-memory costing is recomputed each session from ingredient price deltas.
  updateIngredientVolumes(workbook, rawIngredientsPricing)
  stampDrinkSpecificFormulas(workbook)
  updateSellingPriceColumns(workbook, 'Drinks Selling Price',
    sellingPrices.filter((r) => r.Category !== 'Food'),
    ['Actual Price (8oz)', 'Actual Price (12oz)', 'Actual Price (16oz)',
     'Actual Price (Shots)', 'Actual Price (Latte Art)', 'Actual Price (Slice)'])
  updateSellingPriceColumns(workbook, 'Cookie Selling Price',
    sellingPrices.filter((r) => r.Category === 'Food'),
    ['Actual Price (60g)', 'Actual Price (70g)', 'Cost (60g)', 'Cost (70g)'])

  const historySheetName = 'POS_Transaction_History'
  const historyData = dailySales.map((row) => ({
    Date:        row.Date,
    Time:        row.Time,
    Drink:       row.Drink,
    Size:        row.Size,
    Qty:         row.Qty,
    Price:       row.Price,
    Revenue:     row.Revenue,
    'Net Profit': row.NetProfit,
    Notes:       row.Notes,
    Customer:    row.Customer,
    Method:      row.Method,
    Temperature: row.Temperature ?? '',
    OrderNo:     row.OrderNo    ?? '',
    Address:     row.Address    ?? '',
    Timestamp:   row.Timestamp  ?? '',
  }))

  const historyWs = XLSX.utils.json_to_sheet(historyData)

  // Force the Date column cells to string type so Excel cannot auto-convert
  // them to date serials on re-open/re-save.
  const historyRaw = XLSX.utils.sheet_to_json<unknown[]>(historyWs, { header: 1 }) as unknown[][]
  const dateColIdx = (historyRaw[0] as string[])?.indexOf('Date') ?? -1
  if (dateColIdx >= 0) {
    for (let r = 1; r < historyRaw.length; r++) {
      const addr    = XLSX.utils.encode_cell({ r, c: dateColIdx })
      const cell    = historyWs[addr]
      if (cell) historyWs[addr] = { ...cell, t: 's', v: String(cell.v ?? ''), w: undefined }
    }
  }

  workbook.Sheets[historySheetName] = historyWs
  if (!workbook.SheetNames.includes(historySheetName)) {
    workbook.SheetNames.push(historySheetName)
  }

  const now      = new Date()
  const pad      = (n: number) => String(n).padStart(2, '0')
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true })
  saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), `updated_data_${datePart}.xlsx`)
}
