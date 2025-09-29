import React, { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

export default function AppLayout() {
  const location = useLocation()
  const pageId = derivePageId(location.pathname)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.page = pageId
      return () => {
        delete document.body.dataset.page
      }
    }
    return undefined
  }, [pageId])

  return (
    <div className="app" data-page={pageId}>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/">
            <i className="fas fa-map-marked-alt" aria-hidden="true"></i>
            Welcome to Singapore!
          </Link>
          <nav className="primary-nav" aria-label="Primary navigation">
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/explore">Explore Places</Link></li>
              <li><Link to="/profile">Profile</Link></li>
              <li><Link className="login-link" to="/login">Login</Link></li>
              <li><Link className="signup-link" to="/register">Register</Link></li>
            </ul>
          </nav>
        </div>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>
          Data provided by{' '}
          <a href="https://data.gov.sg" target="_blank" rel="noreferrer">
            Data.gov.sg
          </a>
        </p>
      </footer>
    </div>
  )
}

function derivePageId(pathname) {
  if (!pathname || pathname === '/' || pathname === '/home') return 'home'
  const clean = pathname.replace(/^\/+/, '').split('/')[0]
  return clean || 'home'
}
