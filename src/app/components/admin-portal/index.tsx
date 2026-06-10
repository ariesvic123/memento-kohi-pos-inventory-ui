import React, { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { usePOS } from '../../context/POSContext'
import logo from '../../assets/logo.png'
import CheckoutPreviewModal from './components/modals/CheckoutPreviewModal'
import CheckoutSuccessModal from './components/modals/CheckoutSuccessModal'
import DailyCloseModal      from './components/modals/DailyCloseModal'
import '../admin-portal/styles/pos.scss'

// ─── Minimalist monochrome SVG icons ─────────────────────────────────────────
const IconTerminal = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1.5" width="13" height="9" rx="1.5"/>
    <path d="M3.5 7L5.5 9L3.5 11M7 11h3M5 14h5M7.5 10.5v3.5"/>
  </svg>
)
const IconOrders = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="1" width="11" height="13" rx="1.5"/>
    <path d="M5 5h5M5 7.5h5M5 10h3"/>
  </svg>
)
const IconDashboard = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="5.5" height="5.5" rx="1"/>
    <rect x="8.5" y="1" width="5.5" height="5.5" rx="1"/>
    <rect x="1" y="8.5" width="5.5" height="5.5" rx="1"/>
    <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1"/>
  </svg>
)
const IconInventory = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 5l6-3.5L13.5 5v7l-6 3.5L1.5 12V5z"/>
    <path d="M1.5 5l6 3.5L13.5 5M7.5 8.5V15.5"/>
  </svg>
)
const IconSheets = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="13" height="13" rx="1.5"/>
    <path d="M1 5h13M1 9h13M5 5v9M10 5v9"/>
  </svg>
)
const IconReport = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="1" width="10" height="12" rx="1.5"/>
    <path d="M5 5h4M5 7.5h4M5 10h2"/>
    <path d="M9 9.5v2.5l1.5-1.25L12 12V9.5" strokeWidth="1.2"/>
  </svg>
)
const IconExport = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 1v8M4 6l3 3 3-3"/>
    <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2"/>
  </svg>
)
const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 10l3-3-3-3M12 7H5"/>
    <path d="M5 11.5H2.5a1 1 0 01-1-1v-7a1 1 0 011-1H5"/>
  </svg>
)

const NAV_ITEMS = [
  { label: 'Terminal',   path: '/pos/terminal',  Icon: IconTerminal  },
  { label: 'Orders',     path: '/pos/orders',    Icon: IconOrders    },
  { label: 'Dashboard',  path: '/pos/dashboard', Icon: IconDashboard },
  { label: 'Inventory',  path: '/pos/inventory', Icon: IconInventory },
  { label: 'Sheets',     path: '/pos/sheets',    Icon: IconSheets    },
]

type WarnMode = 'export' | 'logout' | null

const AdminPortal: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { exportPOSData, logout, cart, pendingOrders } = usePOS()

  const [warnMode,   setWarnMode]   = useState<WarnMode>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const hasUnsaved    = cart.length > 0 || pendingOrders.length > 0
  const pendingCount  = pendingOrders.length
  const cartCount     = cart.reduce((s, i) => s + i.qty, 0)
  const summaryText   = [
    cartCount    > 0 ? `${cartCount} item${cartCount > 1 ? 's' : ''} in tray`         : '',
    pendingCount > 0 ? `${pendingCount} order${pendingCount > 1 ? 's' : ''} in queue` : '',
  ].filter(Boolean).join(' · ')

  const handleExportClick     = () => { if (hasUnsaved) { setWarnMode('export'); return } exportPOSData() }
  const handleExportAnyway    = () => { setWarnMode(null); exportPOSData() }
  const handleLogoutClick     = () => { if (hasUnsaved) { setWarnMode('logout'); return } doLogout() }
  const handleExportThenLogout = () => { exportPOSData(); setTimeout(() => { setWarnMode(null); doLogout() }, 400) }
  const handleLogoutAnyway    = () => { setWarnMode(null); doLogout() }
  const doLogout              = () => { logout(); navigate('/') }

  return (
    <div className='pos-shell'>
      <aside className='pos-shell__sidebar'>
        <div className='pos-shell__brand'>
          <img src={logo} alt='Memento Kohi' className='pos-shell__logo' />
        </div>

        <nav className='pos-shell__nav'>
          {NAV_ITEMS.map(({ label, path, Icon }) => {
            const isActive = location.pathname.startsWith(path)
            return (
              <button
                key={path}
                className={`pos-shell__nav-btn${isActive ? ' pos-shell__nav-btn--active' : ''}`}
                onClick={() => navigate(path)}
              >
                <Icon />
                {label}
              </button>
            )
          })}
        </nav>

        <button className='pos-shell__report-btn' onClick={() => setReportOpen(true)}>
          <IconReport /> Daily Report
        </button>
        <button className='pos-shell__export-btn' onClick={handleExportClick}>
          <IconExport /> Export Data
        </button>
        <button className='pos-shell__logout-btn' onClick={handleLogoutClick}>
          <IconLogout /> Logout
        </button>
      </aside>

      <main className='pos-shell__content'>
        <Outlet />
      </main>

      <CheckoutPreviewModal />
      <CheckoutSuccessModal />
      <DailyCloseModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />

      {warnMode === 'export' && (
        <div className='modal-overlay'>
          <div className='modal-card warn-modal'>
            <div className='warn-modal__icon'><svg width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' style={{color:'#8B2020'}}><path d='M14 3L2 25h24L14 3z'/><path d='M14 12v6M14 21v.5'/></svg></div>
            <h2 className='warn-modal__title'>Unsaved Data Detected</h2>
            <p className='warn-modal__body'>
              You have <strong>{summaryText}</strong> that are not yet marked as done.
              These will stay in the queue but will <em>not</em> be in the exported file.
            </p>
            <p className='warn-modal__hint'>
              Mark orders as done in the Orders Queue first to include them in the export.
            </p>
            <div className='warn-modal__actions'>
              <button className='btn-outline warn-modal__btn' onClick={() => setWarnMode(null)}>Cancel</button>
              <button className='btn-primary warn-modal__btn' onClick={handleExportAnyway}>Export Anyway</button>
            </div>
          </div>
        </div>
      )}

      {warnMode === 'logout' && (
        <div className='modal-overlay'>
          <div className='modal-card warn-modal'>
            <div className='warn-modal__icon'><svg width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' style={{color:'#8B2020'}}><path d='M14 3L2 25h24L14 3z'/><path d='M14 12v6M14 21v.5'/></svg></div>
            <h2 className='warn-modal__title'>Export Before Logging Out</h2>
            <p className='warn-modal__body'>
              You have <strong>{summaryText}</strong>. Logging out without exporting
              will keep these in your browser only — not in the Excel file.
            </p>
            <p className='warn-modal__hint'>
              Export first to save everything to your Excel masterfile.
            </p>
            <div className='warn-modal__actions warn-modal__actions--three'>
              <button className='btn-outline warn-modal__btn' onClick={() => setWarnMode(null)}>Cancel</button>
              <button className='btn-danger warn-modal__btn' onClick={handleLogoutAnyway}>Logout Anyway</button>
              <button className='btn-primary warn-modal__btn warn-modal__btn--accent' onClick={handleExportThenLogout}>
                Export &amp; Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPortal
