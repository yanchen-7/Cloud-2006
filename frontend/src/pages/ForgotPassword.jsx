import React, { useState } from 'react'

export default function ForgotPassword(){
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e){
    e.preventDefault()
    if (submitting) return
    setMessage('')
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/session/password/forgot', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email })
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (payload?.details) {
          const firstError = Object.values(payload.details)[0]
          setError(typeof firstError === 'string' ? firstError : 'Unable to send reset email')
        } else if (payload?.error) {
          setError(payload.error)
        } else {
          setError('Unable to send reset email')
        }
        return
      }
      setMessage(payload?.message || 'If that account exists, we sent instructions to your email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-wrapper">
      <div className="auth-card">
        <h1>Reset your password</h1>
        <p className="auth-intro">Enter the email associated with your account and we will send you a link to reset your password.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}
          <div className="form-actions"><button type="submit" className="btn primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send reset email'}</button></div>
        </form>
      </div>
    </section>
  )
}
