import React, { useEffect, useState } from 'react'

export default function Profile(){
  const [session, setSession] = useState(null)
  const [form, setForm] = useState({ email:'', gender:'', date_of_birth:'', country_of_origin:'', password:'', confirm:'' })
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/session', { credentials:'include' }).then(r=>r.json()).then(s => {
      setSession(s)
      if (s?.user) setForm(f => ({...f, email: s.user.email}))
    })
  }, [])

  async function onSubmit(e){
    e.preventDefault()
    setMessage('')
    // Minimal example: only email update client-side; extend to backend endpoint if needed
    setMessage('Profile updated (client). Implement PUT /api/session/profile if needed).')
  }

  if (!session?.authenticated) return <div className="empty">Please login first.</div>
  return (
    <section className="profile-wrapper">
      <div className="profile-card">
        <h1>Your Profile</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-grid">
            <div className="form-field"><label>Username</label><input value={session.user.username} readOnly /></div>
            <div className="form-field"><label>Email</label><input value={form.email} onChange={e=>setForm(s=>({...s,email:e.target.value}))} required /></div>
            <div className="form-field"><label>Gender</label><select value={form.gender} onChange={e=>setForm(s=>({...s,gender:e.target.value}))}><option value="">Prefer not to say</option><option value="Female">Female</option><option value="Male">Male</option><option value="Non-binary">Non-binary</option><option value="Other">Other</option></select></div>
            <div className="form-field"><label>DOB</label><input type="date" value={form.date_of_birth} onChange={e=>setForm(s=>({...s,date_of_birth:e.target.value}))} /></div>
            <div className="form-field"><label>Country</label><input value={form.country_of_origin} onChange={e=>setForm(s=>({...s,country_of_origin:e.target.value}))} /></div>
          </div>
          {message && <div className="success">{message}</div>}
          <div className="form-actions"><button type="submit" className="btn primary">Save Changes</button></div>
        </form>
      </div>
    </section>
  )
}

