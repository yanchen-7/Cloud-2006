import React, { useEffect, useState } from 'react'

export default function PlaceInsights({ placeId }) {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!placeId) return
    
    setLoading(true)
    setError(null)
    setInsights(null)

    // Fetch from your new Big Data API
    fetch(`/api/insights/${placeId}`)
      .then(res => {
        if (!res.ok) throw new Error('No insights available')
        return res.json()
      })
      .then(data => {
        setInsights(data)
        setLoading(false)
      })
      .catch(err => {
        // Quietly fail if no data found (don't show ugly errors)
        setLoading(false)
      })
  }, [placeId])

  if (loading) return <div className="badge muted">✨ Analyzing reviews...</div>
  if (!insights) return null

  // Helper to render tags
  const renderTags = (tags, colorClass, icon) => {
    if (!tags || tags.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {tags.map(t => (
          <span key={t.word} className={`badge ${colorClass}`} title={`${t.count} mentions`}>
            {icon} {t.word} <span style={{opacity: 0.7, fontSize: '0.8em', marginLeft: '4px'}}>★{t.score}</span>
          </span>
        ))}
      </div>
    )
  }

  // Only show if we actually have tags
  if (!insights.positive_tags?.length && !insights.negative_tags?.length) return null

  return (
    <div style={{ 
      marginTop: '1rem', 
      padding: '1rem', 
      background: 'rgba(45, 108, 223, 0.05)', 
      borderRadius: '12px',
      border: '1px solid rgba(45, 108, 223, 0.1)' 
    }}>
      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#1f2933', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <i className="fas fa-robot" style={{ color: '#2d6cdf' }}></i> 
        AI Review Highlights
      </h4>
      
      {insights.positive_tags?.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#059669', marginBottom: '0.25rem' }}>What people love</div>
          {renderTags(insights.positive_tags, 'price', '👍')} 
          {/* Reusing 'price' class for green styling */}
        </div>
      )}

      {insights.negative_tags?.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.25rem' }}>What to watch out for</div>
          {renderTags(insights.negative_tags, 'status', '⚠️')}
          {/* Reusing 'status' class for red/warning styling depends on your CSS, usually status[closed] is red */}
        </div>
      )}
      
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem', textAlign: 'right' }}>
        Analysis based on last 12 months of data
      </div>
    </div>
  )
}