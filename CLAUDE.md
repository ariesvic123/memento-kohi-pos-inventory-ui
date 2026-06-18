# Memento Kohi — POS & Inventory System

## Project Overview
A frontend-only React POS and inventory management system for Memento Kohi coffee shop.
Reads/writes Excel files (.xlsx) for data persistence. No backend — all data lives in Excel.

## Tech Stack
- **React 19** — UI framework
- **TypeScript** — strict typing, never use `any`
- **Webpack 5** — custom bundler (no Vite, no CRA)
- **Ant Design v6** — component library (antd)
- **Recharts** — charts and analytics
- **Axios** — HTTP client (for GCash config/QR)
- **SCSS** — styling (no Tailwind, no CSS modules)
- **xlsx** — Excel read/write
- **React Router DOM v7** — routing
- **file-saver** — export Excel files
- **html2canvas** — receipt screenshot

## Folder Structure
```
src/app/
  components/
    admin-portal/       # Main POS + Inventory UI
      components/
        dashboard/      # Metrics, charts, tally
        inventory/      # Stock management
        modals/         # All modal dialogs
        orders/         # Order queue
        sheets/         # Excel-like data tables (Ingredients, Materials, Prices, Restock)
        terminal/       # POS terminal (cart, menu)
    landing-portal/     # Excel upload / entry point
  config/
    routes/             # Route definitions
    utils/
      pos.types.ts      # ALL shared TypeScript interfaces (source of truth)
      pos.helpers.ts    # Utility functions
      useGCashConfig.ts # GCash QR config hook
  context/
    POSContext.tsx      # Global state (React Context)
  assets/
    styles/style.scss   # Global styles
```

## Critical Conventions
- **Never use `any` type** — use proper interfaces from `pos.types.ts`
- **All shared types go in `pos.types.ts`** — do not create local type files
- **SCSS only** — no inline styles, no Tailwind, no CSS-in-JS
- **Ant Design components first** — don't reinvent what antd already has
- **No backend calls** — data comes from Excel files loaded via landing portal
- **DrinkSize** = `'8oz' | '12oz' | '16oz' | 'unit' | '60g' | '70g'` — never hardcode size strings
- **PaymentMethod** = `'CASH' | 'GCASH'` — only two methods

## Key Data Flows
1. User uploads Excel → `landing-portal` parses it → stored in `POSContext`
2. POS Terminal → adds to cart → checkout → saves SaleRow to Excel
3. Inventory deducts stock on each sale automatically
4. Dashboard reads SaleRow[] from context for charts and metrics

## Scripts
```bash
npm run build    # webpack production build
npm run start    # webpack dev server
npm run dev      # build then start
npx tsc --noEmit # type check only (no output)
```

## GCash Config
- QR image stored in config, name/number hardcoded: `GCASH_NAME`, `GCASH_NUMBER` in `pos.types.ts`
- Never expose real account details in logs or UI errors

## What Claude Should NOT Do
- Do not add a backend or API layer unless explicitly asked
- Do not switch to Vite or CRA — Webpack config is intentional
- Do not install Tailwind — project uses SCSS
- Do not create duplicate type definitions — always check `pos.types.ts` first
- Do not use `React.FC` — use plain function components with typed props
