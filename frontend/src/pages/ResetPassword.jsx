import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function ResetPassword(){
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [token, setToken] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const t = searchParams.get('token') || ''
    setToken(t)
  }, [searchParams])

  async function onSubmit(e){
    e.preventDefault()
    if (submitting) return
    setError('')
    setMessage('')
    if (!token) {
      setError('Reset link is invalid or missing. Please request a new one.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/session/password/reset', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, password, confirmPassword: confirm })
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (payload?.details) {
          const firstError = Object.values(payload.details)[0]
          setError(typeof firstError === 'string' ? firstError : 'Unable to reset password')
        } else if (payload?.error) {
          setError(payload.error)
        } else {
          setError('Unable to reset password')
        }
        return
      }
      setMessage(payload?.message || 'Password updated. Redirecting to login…')
      setTimeout(() => navigate('/login'), 2000)
      setPassword('')
      setConfirm('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-wrapper">
      <div className="auth-card">
        <h1>Set a new password</h1>
        <p className="auth-intro">Choose a strong password that you have not used before.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-field"><label>New Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
          <div className="form-field"><label>Confirm Password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required /></div>
          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}
          <div className="form-actions"><button type="submit" className="btn primary" disabled={submitting || !token}>{submitting ? 'Saving…' : 'Reset password'}</button></div>
        </form>
      </div>
    </section>
  )
}
