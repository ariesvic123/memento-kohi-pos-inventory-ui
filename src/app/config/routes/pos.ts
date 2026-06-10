import AdminPortal from '../../components/admin-portal'
import POSTerminal from '../../components/admin-portal/components/terminal'
import Dashboard from '../../components/admin-portal/components/dashboard'
import Inventory from '../../components/admin-portal/components/inventory'
import Sheets from '../../components/admin-portal/components/sheets'
import OrdersQueue from '../../components/admin-portal/components/orders'

export const posRoutes = [
  {
    path:      '/pos',
    Component: AdminPortal,
    children: [
      {
        path:      'terminal',
        Component: POSTerminal,
      },
      {
        path:      'dashboard',
        Component: Dashboard,
      },
      {
        path:      'inventory',
        Component: Inventory,
      },
      {
        path:      'sheets',
        Component: Sheets,
      },
      {
        path:      'orders',
        Component: OrdersQueue,
      },
    ],
  },
]
