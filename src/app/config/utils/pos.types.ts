// ============================================================
// POS TYPES
// Shared TypeScript interfaces for the entire POS system.
// ============================================================

export interface InventoryItem {
  INGREDIENTS: string
  STOCKS?: number
  VOLUME?: number
  CATEGORY?: string
  UNIT?: string
  BOX_SIZE?: number
  CONTAINER?: string
  LAST_RESTOCK_DATE?: string
  LAST_RESTOCK_QTY?: number
  stock: number
  originalStock: number
  [key: string]: unknown
}

export const resolveUnit = (item: InventoryItem): string =>
  String(item.UNIT ?? item['Unit'] ?? item['UNITS'] ?? item['unit'] ?? '').trim()

export interface CostingRow {
  Drinks: string
  'Milk Type': string
  'Bean Type': string
  '8oz': number
  '12oz': number
  '16oz': number
  [key: string]: unknown
}

export interface SellingPriceRow {
  Drinks: string
  Category?: string
  'Actual Price (8oz)': number
  'Actual Price (12oz)': number
  'Actual Price (16oz)': number
  'Actual Price (Slice)'?: number
  'Actual Price (Shots)'?: number
  'Actual Price (Latte Art)'?: number
  'Actual Price (75g)'?: number
  'Cost (75g)'?: number
  'Actual Price'?: number
  [key: string]: unknown
}

export interface FoodCostingRow {
  Food: string
  Series: string
  'Master Dough (grams)': number
  'Fruit Cream gram/cookie': number | string
  '75g QTY': number | string
  'Master Dough (pricing)': number
  '75g cookie': number | string
  'Fruit Cream': number | string
  [key: string]: unknown
}

export interface RawIngredientPricingRow {
  INGREDIENTS: string
  CATEGORY: string
  'DRINK TYPE': string
  '8oz ICED / vol': number
  '12oz (volume)': number
  '16oz (volume)': number
  [key: string]: unknown
}

export type DrinkSize = '8oz' | '12oz' | '16oz' | 'unit' | '75g' | 'bundle'

export interface CartItem {
  name: string
  size: DrinkSize
  price: number
  cost: number
  qty: number
  notes?: string
  temperature?: 'hot' | 'iced'
  addOns?: CartItem[]
  isBundle?:    boolean
  bundleItems?: CartItem[]
}

export interface SaleRow {
  Date: string
  Time: string
  Drink: string
  Size: DrinkSize
  Qty: number
  Price: number
  Revenue: string
  NetProfit: string
  Notes: string
  Customer: string
  Method: PaymentMethod
  Temperature?: 'hot' | 'iced'
  OrderNo?: number
  Address?: string
  Timestamp?: string
}

export interface PendingOrderItem {
  name:         string
  size:         DrinkSize
  qty:          number
  price:        number
  cost:         number
  temperature?: 'hot' | 'iced'
  addOns?:      PendingOrderItem[]
  isBundle?:    boolean
  bundleItems?: PendingOrderItem[]
}

export interface PendingOrder {
  id:           string
  orderNo:      number
  customer:     string
  address:      string
  method:       PaymentMethod
  items:        PendingOrderItem[]
  total:        number
  date:         string
  createdAt:    string
  isTakeout?:   boolean
  notes?:       string
  cashReceived?: number
  isPreOrder?:  boolean
}

export type PaymentMethod = 'CASH' | 'GCASH'

export interface LastReceipt {
  orderNo:      number
  customer:     string
  method:       PaymentMethod
  isTakeout:    boolean
  items:        PendingOrderItem[]
  total:        number
  date:         string
  time:         string
  cashReceived?: number   // cash only
  change?:       number   // cash only
}

export interface GCashConfig {
  qrImage: string   // only stored — name & number are hardcoded
}

// Permanent GCash account info — never changes
export const GCASH_NAME   = 'AR**S V** L.'
export const GCASH_NUMBER = '0947-492-9000'

export interface CustomerInfo {
  name:          string
  method:        PaymentMethod
  isTakeout:     boolean
  cashReceived?: number
}

export interface DeductionPreviewItem extends InventoryItem {
  // same shape, used for preview display
}

export interface StockStatus {
  label: 'OUT OF STOCK' | 'CRITICAL' | 'LOW STOCK' | 'HEALTHY'
  color: 'gray' | 'red' | 'orange' | 'green'
  percent: number
}

export interface RestockEntry {
  Item:              string
  'Volume/Weight':   number
  unit:              string
  QTY:               number
  Price:             number
  Total:             number
  Method:            PaymentMethod
  Date:              number   // Excel serial date
  Supplier:          string
}
