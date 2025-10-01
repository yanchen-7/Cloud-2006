import React, { useEffect, useState } from 'react'

export default function Profile(){
  const [session, setSession] = useState(null)
  const [form, setForm] = useState({ email:'', gender:'', date_of_birth:'', country_of_origin:'', password:'', confirm:'' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load(){
      const sessionRes = await fetch('/api/session', { credentials:'include' })
      const sessionData = await sessionRes.json()
      setSession(sessionData)
      if (sessionData?.authenticated) {
        const profileRes = await fetch('/api/session/profile', { credentials:'include' })
        if (profileRes.ok) {
          const payload = await profileRes.json()
          const profile = payload.profile || {}
          setForm(f => ({
            ...f,
            email: profile.email || '',
            gender: profile.gender || '',
            date_of_birth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '',
            country_of_origin: profile.country_of_origin || ''
          }))
        }
      }
    }
    load()
  }, [])

  async function onSubmit(e){
    e.preventDefault()
    setMessage('')
    setError('')
    const res = await fetch('/api/session/profile', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      credentials:'include',
      body: JSON.stringify({
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        country_of_origin: form.country_of_origin || null,
        password: form.password || '',
        confirmPassword: form.confirm || ''
      })
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      if (payload?.details) {
        const firstError = Object.values(payload.details)[0]
        setError(typeof firstError === 'string' ? firstError : 'Unable to update profile')
      } else if (payload?.error) {
        setError(payload.error)
      } else {
        setError('Unable to update profile')
      }
      return
    }
    const payload = await res.json()
    const profile = payload.profile || {}
    setSession(s => s ? ({ ...s, user: { ...s.user, email: profile.email || s.user?.email } }) : s)
    setForm(f => ({
      ...f,
      email: profile.email || '',
      gender: profile.gender || '',
      date_of_birth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '',
      country_of_origin: profile.country_of_origin || '',
      password:'',
      confirm:''
    }))
    setMessage('Profile updated successfully')
  }

  if (!session?.authenticated) return <div className="empty">Please login first.</div>
  return (
    <section className="profile-wrapper">
      <div className="profile-card">
        <h1>Your Profile</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-grid">
            <div className="form-field"><label>Username</label><input value={session.user.username} readOnly /></div>
            <div className="form-field"><label>Email</label><input value={form.email} readOnly required /></div>
            <div className="form-field"><label>Gender</label><select value={form.gender} onChange={e=>setForm(s=>({...s,gender:e.target.value}))}><option value="">Prefer not to say</option><option value="Female">Female</option><option value="Male">Male</option><option value="Non-binary">Non-binary</option><option value="Other">Other</option></select></div>
            <div className="form-field"><label>DOB</label><input type="date" value={form.date_of_birth} onChange={e=>setForm(s=>({...s,date_of_birth:e.target.value}))} /></div>
            <div className="form-field"><label>Country</label><input value={form.country_of_origin} onChange={e=>setForm(s=>({...s,country_of_origin:e.target.value}))} /></div>
            <div className="form-field"><label>New Password</label><input type="password" value={form.password} onChange={e=>setForm(s=>({...s,password:e.target.value}))} placeholder="Leave blank to keep current" /></div>
            <div className="form-field"><label>Confirm Password</label><input type="password" value={form.confirm} onChange={e=>setForm(s=>({...s,confirm:e.target.value}))} placeholder="Repeat new password" /></div>
          </div>
          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}
          <div className="form-actions"><button type="submit" className="btn primary">Save Changes</button></div>
        </form>
      </div>
    </section>
  )
}
