import React, { useState } from 'react'
import { useBlocker }       from 'react-router-dom'

import RestockTab       from './RestockTab'
import IngredientsTab   from './IngredientsTab'
import InventoryEditTab from './InventoryEditTab'
import PricesTab        from './PricesTab'

const IcoRestock = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="11" height="8" rx="1"/>
    <path d="M4 4V2.5A1.5 1.5 0 015.5 1h2A1.5 1.5 0 019 2.5V4"/>
    <path d="M6.5 7v2M5.5 8h2"/>
  </svg>
)
const IcoIngredients = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 1v11M3 4l3.5-3 3.5 3"/>
    <path d="M2 8.5h9"/>
  </svg>
)
const IcoInventory = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="11" height="11" rx="1"/>
    <path d="M1 5h11M1 9h11M5 5v7M9 5v7"/>
  </svg>
)
const IcoPrices = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="5.5"/>
    <path d="M6.5 3.5v6M4.5 5h3a1 1 0 010 2H5a1 1 0 000 2h4"/>
  </svg>
)

type TabKey = 'restock' | 'ingredients' | 'inventory' | 'prices'

const TABS: { key: TabKey; label: string; Icon: React.FC }[] = [
  { key: 'restock',     label: 'Restock History',    Icon: IcoRestock     },
  { key: 'ingredients', label: 'Ingredients Pricing', Icon: IcoIngredients },
  { key: 'inventory',   label: 'Inventory Edit',      Icon: IcoInventory   },
  { key: 'prices',      label: 'Selling Prices',      Icon: IcoPrices      },
]

// ─── Blocking modal — reused for both tab-switch and sidebar-leave scenarios ──
interface DirtyModalProps {
  tabLabel:  string
  onStay:    () => void
  onLeave:   () => void
}
const DirtyModal: React.FC<DirtyModalProps> = ({ tabLabel, onStay, onLeave }) => (
  <div className='modal-overlay' onClick={onStay}>
    <div className='modal-card dirty-modal' onClick={(e) => e.stopPropagation()}>
      <div className='dirty-modal__icon'>
        <svg width='36' height='36' viewBox='0 0 36 36' fill='none' stroke='#C4921E' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M18 4L3 31h30L18 4z'/><path d='M18 15v8M18 26v1'/>
        </svg>
      </div>
      <h3 className='dirty-modal__title'>Unsaved Changes</h3>
      <p className='dirty-modal__body'>
        You have unsaved changes in <strong>{tabLabel}</strong>.<br />
        Go back and save, or leave without saving.
      </p>
      <div className='modal-card__actions'>
        <button className='btn-primary modal-card__btn' onClick={onStay}>
          Stay &amp; Save
        </button>
        <button className='btn-outline modal-card__btn' onClick={onLeave}>
          Leave without saving
        </button>
      </div>
    </div>
  </div>
)

const Sheets: React.FC = () => {
  const [active,      setActive]     = useState<TabKey>('restock')
  const [dirtyTabs,   setDirtyTabs]  = useState<Partial<Record<TabKey, boolean>>>({})
  const [pendingTab,  setPendingTab] = useState<TabKey | null>(null)

  const anyDirty    = Object.values(dirtyTabs).some(Boolean)
  const activeDirty = Boolean(dirtyTabs[active])

  const markDirty = (tab: TabKey, dirty: boolean) =>
    setDirtyTabs((prev) => ({ ...prev, [tab]: dirty }))

  // ── useBlocker: intercepts sidebar / browser-back navigation ────────────────
  const blocker = useBlocker(anyDirty)

  // ── Tab switch: if current tab is dirty, confirm before switching ───────────
  const handleTabClick = (key: TabKey) => {
    if (key === active) return
    if (activeDirty) {
      setPendingTab(key)   // open the confirm modal
    } else {
      setActive(key)
    }
  }

  const confirmSwitch = () => {
    if (pendingTab) {
      setDirtyTabs((prev) => ({ ...prev, [active]: false }))
      setActive(pendingTab)
      setPendingTab(null)
    }
  }

  const cancelSwitch = () => setPendingTab(null)

  // Dirty tab label for modal
  const activeDirtyLabel = TABS.find((t) => t.key === active)?.label ?? active
  const blockerDirtyLabel = TABS.find((t) => t.key === Object.keys(dirtyTabs).find((k) => dirtyTabs[k as TabKey]))?.label ?? 'this tab'

  return (
    <div className='sheets'>
      <div className='sheets__tabs'>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`sheets__tab-btn${active === key ? ' sheets__tab-btn--active' : ''}`}
            onClick={() => handleTabClick(key)}
          >
            <Icon />
            {label}
            {dirtyTabs[key] && <span className='sheets__tab-dirty-dot' title='Unsaved changes' />}
          </button>
        ))}
      </div>

      <div className='sheets__content'>
        {active === 'restock'     && <RestockTab />}
        {active === 'ingredients' && (
          <IngredientsTab onDirtyChange={(d) => markDirty('ingredients', d)} />
        )}
        {active === 'inventory' && (
          <InventoryEditTab onDirtyChange={(d) => markDirty('inventory', d)} />
        )}
        {active === 'prices' && (
          <PricesTab onDirtyChange={(d) => markDirty('prices', d)} />
        )}
      </div>

      {/* Modal: within-tabs dirty switch */}
      {pendingTab && (
        <DirtyModal
          tabLabel={activeDirtyLabel}
          onStay={cancelSwitch}
          onLeave={confirmSwitch}
        />
      )}

      {/* Modal: sidebar / external navigation blocked by useBlocker */}
      {blocker.state === 'blocked' && (
        <DirtyModal
          tabLabel={blockerDirtyLabel}
          onStay={() => blocker.reset?.()}
          onLeave={() => {
            setDirtyTabs({})   // clear dirty state so blocker doesn't re-fire
            blocker.proceed?.()
          }}
        />
      )}
    </div>
  )
}

export default Sheets
