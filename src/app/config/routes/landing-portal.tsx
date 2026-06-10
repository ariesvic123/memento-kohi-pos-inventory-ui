import React from 'react'

import LandingPortal from '../../components/landing-portal'
import Upload from '../../components/landing-portal/components/upload'
import ErrorPage from '../../hocs/error_page'

export const landingPortalRoutes = [
  {
    id:           'root',
    path:         '/',
    Component:    LandingPortal,
    errorElement: <ErrorPage />,
  },
  {
    path:      '/upload',
    Component: Upload,
  },
]
