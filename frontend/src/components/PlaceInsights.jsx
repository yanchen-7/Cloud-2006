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
        // Quietly fail
        setLoading(false)
      })
  }, [placeId])

  if (loading) return (
    <div style={{ marginTop: '1.5rem' }}>
        <span className="badge muted">✨ Analyzing reviews...</span>
    </div>
  )
  
  if (!insights) return null

  // Helper to render tags horizontally
  const renderTags = (tags, colorClass, icon) => {
    if (!tags || tags.length === 0) return null
    return (
      <div className="ai-tags-row">
        {tags.map((t, idx) => (
          <span key={`${t.word}-${idx}`} className={`badge ${colorClass}`} title={`${t.count} mentions`}>
            {icon} {t.word} <span className="ai-score">★{t.score}</span>
          </span>
        ))}
      </div>
    )
  }

  // Only show if we actually have tags
  if (!insights.positive_tags?.length && !insights.negative_tags?.length) return null

  return (
    <div className="ai-insights-panel">
      <div className="ai-header">
        <h4>
          <i className="fas fa-robot" style={{ color: '#2d6cdf' }}></i> 
          AI Review Highlights
        </h4>
      </div>
      
      <div className="ai-grid">
        {/* Positive Column */}
        {insights.positive_tags?.length > 0 && (
          <div className="ai-column">
            <div className="ai-category-title" style={{ color: '#059669' }}>
              What people love
            </div>
            {renderTags(insights.positive_tags, 'price', '👍')} 
          </div>
        )}

        {/* Negative Column */}
        {insights.negative_tags?.length > 0 && (
          <div className="ai-column">
            <div className="ai-category-title" style={{ color: '#dc2626' }}>
              What to watch out for
            </div>
            {renderTags(insights.negative_tags, 'status', '⚠️')}
          </div>
        )}
      </div>

      <div className="ai-footer">
        Analysis based on last 12 months of data
      </div>
    </div>
  )
}