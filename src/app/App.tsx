import React from 'react'
import { RouterProvider, createHashRouter } from 'react-router-dom'

import './assets/styles/style.scss'

import { POSProvider } from './context/POSContext'
import { landingPortalRoutes } from './config/routes/landing-portal'
import { posRoutes } from './config/routes/pos'

const router = () => createHashRouter([...landingPortalRoutes, ...posRoutes])

const App: React.FC = () => {
  return (
    <POSProvider>
      <RouterProvider router={router()} />
    </POSProvider>
  )
}

export default App
