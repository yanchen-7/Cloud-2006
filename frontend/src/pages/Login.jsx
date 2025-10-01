import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Login(){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function onSubmit(e){
    e.preventDefault()
    setError('')
    const res = await fetch('/api/session/login', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, password }) })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      if (payload?.details) {
        const firstError = Object.values(payload.details)[0]
        setError(typeof firstError === 'string' ? firstError : 'Invalid username or password')
      } else if (payload?.error) {
        setError(payload.error)
      } else {
        setError('Invalid username or password')
      }
      return
    }
    navigate('/')
  }

  return (
    <section className="auth-wrapper">
      <div className="auth-card">
        <h1>Login</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-field"><label>Username or Email</label><input value={username} onChange={e=>setUsername(e.target.value)} required /></div>
          <div className="form-field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
          {error && <div className="error">{error}</div>}
          <div className="form-actions"><button type="submit" className="btn primary">Login</button></div>
        </form>
        <p className="auth-footer">
          <Link to="/forgot-password">Forgot password?</Link>
          <span> · </span>
          <span>No account? <Link to="/register">Register</Link></span>
        </p>
      </div>
    </section>
  )
}
