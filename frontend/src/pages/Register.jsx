import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Register(){
  const [form, setForm] = useState({ username:'', email:'', password:'', confirm:'', gender:'', date_of_birth:'', country_of_origin:'' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function update(k, v){ setForm(s => ({...s, [k]: v})) }

  async function onSubmit(e){
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    const res = await fetch('/api/session/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: form.username,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirm,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        country_of_origin: form.country_of_origin || null
      })
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      if (payload?.details) {
        const firstError = Object.values(payload.details)[0]
        setError(typeof firstError === 'string' ? firstError : 'Registration failed')
      } else if (payload?.error) {
        setError(payload.error)
      } else {
        setError('Registration failed')
      }
      return
    }
    navigate('/login')
  }

  return (
    <section className="auth-wrapper">
      <div className="auth-card">
        <h1>Register</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-grid">
            <div className="form-field"><label>Username</label><input value={form.username} onChange={e=>update('username', e.target.value)} required /></div>
            <div className="form-field"><label>Email</label><input type="email" value={form.email} onChange={e=>update('email', e.target.value)} required /></div>
            <div className="form-field"><label>Password</label><input type="password" value={form.password} onChange={e=>update('password', e.target.value)} required /></div>
            <div className="form-field"><label>Confirm</label><input type="password" value={form.confirm} onChange={e=>update('confirm', e.target.value)} required /></div>
            <div className="form-field"><label>Gender</label><select value={form.gender} onChange={e=>update('gender', e.target.value)}><option value="">Prefer not to say</option><option value="Female">Female</option><option value="Male">Male</option><option value="Non-binary">Non-binary</option><option value="Other">Other</option></select></div>
            <div className="form-field"><label>DOB</label><input type="date" value={form.date_of_birth} onChange={e=>update('date_of_birth', e.target.value)} /></div>
            <div className="form-field"><label>Country</label><input value={form.country_of_origin} onChange={e=>update('country_of_origin', e.target.value)} /></div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="form-actions"><button type="submit" className="btn primary">Sign Up</button></div>
        </form>
        <p className="auth-footer">Already registered? <Link to="/login">Login</Link></p>
      </div>
    </section>
  )
}
