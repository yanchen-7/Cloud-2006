import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'

const SENTOSA = { lat: 1.249404, lng: 103.830321 }
const MAX_MARKERS = 40

export default function Explore() {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const iconsRef = useRef(null)

  const [places, setPlaces] = useState([])
  const [category, setCategory] = useState('')
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedPlaceIds, setSavedPlaceIds] = useState(() => new Set())
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (!iconsRef.current && typeof L !== 'undefined') {
    iconsRef.current = {
      default: L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
      saved: L.icon({
        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-gold.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    }
  }

  const icons = iconsRef.current

  const loadPlaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/places')
      if (!response.ok) throw new Error('Failed to fetch places')
      const data = await response.json()
      const list = Array.isArray(data) ? data : []
      setPlaces(list)
      setError(list.length ? '' : 'No places available right now.')
    } catch (err) {
      console.error('Unable to load places', err)
      setPlaces([])
      setError('Unable to load places right now.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlaces()
  }, [loadPlaces])

  useEffect(() => {
    if (mapRef.current || typeof L === 'undefined') return
    const map = L.map('exploreMap', { zoomControl: true }).setView([SENTOSA.lat, SENTOSA.lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const handleSelectPlace = useCallback(async place => {
    if (!place) {
      setSelectedPlace(null)
      return
    }
    const placeId = place.place_id
    setSelectedPlace(place)
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`)
      if (!response.ok) return
      const details = await response.json()
      setSelectedPlace(current => {
        if (!current || current.place_id !== placeId) return current
        return { ...current, ...details }
      })
    } catch (err) {
      console.warn('Failed to load place details', err)
    }
  }, [])

  const handleSavedToggle = useCallback((event, place) => {
    event.stopPropagation()
    setSavedPlaceIds(prev => {
      const next = new Set(prev)
      if (next.has(place.place_id)) next.delete(place.place_id)
      else next.add(place.place_id)
      return next
    })
  }, [])

  const categories = useMemo(() => {
    const list = Array.isArray(places) ? places : []
    const set = new Set()
    list.forEach(item => {
      if (item?.category) set.add(String(item.category))
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [places])

  const filteredPlaces = useMemo(() => {
    let list = Array.isArray(places) ? places : []
    if (category) list = list.filter(place => place.category === category)
    if (showSavedOnly) list = list.filter(place => savedPlaceIds.has(place.place_id))
    return list
      .slice(0, MAX_MARKERS)
      .sort((a, b) => Number(b?.rating || 0) - Number(a?.rating || 0))
  }, [places, category, showSavedOnly, savedPlaceIds])

  useEffect(() => {
    if (!mapRef.current || !icons) return
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    filteredPlaces.forEach(place => {
      const lat = Number(place?.latitude)
      const lng = Number(place?.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const marker = L.marker([lat, lng], {
        icon: savedPlaceIds.has(place.place_id) ? icons.saved : icons.default,
      }).addTo(mapRef.current)
      marker.on('click', () => handleSelectPlace(place))
      markersRef.current.push(marker)
    })
  }, [filteredPlaces, icons, savedPlaceIds, handleSelectPlace])

  useEffect(() => {
    if (!mapRef.current) return
    if (!filteredPlaces.length) {
      mapRef.current.setView([SENTOSA.lat, SENTOSA.lng], 12)
      return
    }
    const bounds = L.latLngBounds(
      filteredPlaces
        .map(place => [Number(place?.latitude), Number(place?.longitude)])
        .filter(coords => Number.isFinite(coords[0]) && Number.isFinite(coords[1]))
    )
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds.pad(0.2))
    }
  }, [filteredPlaces])

  const handleItemKeyDown = useCallback((event, place) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectPlace(place)
    }
  }, [handleSelectPlace])

  const isSelectedSaved = !!(selectedPlace && savedPlaceIds.has(selectedPlace.place_id))
  const selectedSummary = buildReviewsSummary(selectedPlace?.user_reviews_summary)
  const selectedPrice = formatPriceLevel(selectedPlace?.price_level)
  const selectedWebsite = normalizeWebsite(selectedPlace?.website || selectedPlace?.website_url)
  const selectedWebsiteLabel = selectedPlace?.website || selectedPlace?.website_url || (selectedWebsite ? selectedWebsite : '--')
  const selectedOpeningHours = Array.isArray(selectedPlace?.opening_hours?.weekday_text) ? selectedPlace.opening_hours.weekday_text : []
  const selectedStatus = deriveStatus(selectedPlace)
  const exploreCount = filteredPlaces.length
  return (
    <div className="explore">
      <section className="explore-hero">
        <div className="card">
          <div className="card-header">
            <div>
              <h1><i className="fas fa-compass" aria-hidden="true"></i> Explore Singapore</h1>
              <p>Filter by interests, review top spots and revisit favourites in a single map view.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="explore-layout">
        <div className="explore-map-wrapper">
          <div id="exploreMap" className="map" role="region" aria-label="Explore Singapore map"></div>
          <div className="map-legend">
            <span><i className="fas fa-map-marker-alt" aria-hidden="true"></i> Places</span>
            <span><i className="fas fa-star text-saved" aria-hidden="true"></i> Saved</span>
          </div>
        </div>
        <aside className="explore-sidebar">
          <div className="explore-controls">
            <label htmlFor="exploreCategory">Category</label>
            <select id="exploreCategory" value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              id="exploreSavedToggle"
              className={`btn ghost${showSavedOnly ? ' active' : ''}`}
              type="button"
              onClick={() => setShowSavedOnly(value => !value)}
            >
              <i className="fas fa-star" aria-hidden="true"></i>
              Saved Places
            </button>
          </div>
          <div className="explore-list-header">
            <h3>Top Places</h3>
            <span id="exploreCount" className="badge muted">{exploreCount}</span>
          </div>
          <div id="exploreList" className="explore-list">
            {filteredPlaces.length ? filteredPlaces.map(place => {
              const saved = savedPlaceIds.has(place.place_id)
              return (
                <article
                  key={place.place_id}
                  className="explore-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectPlace(place)}
                  onKeyDown={event => handleItemKeyDown(event, place)}
                >
                  <div className="title">{place.name}</div>
                  <span className="badge rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(place.rating)}</span>
                  <div className="meta">{place.formatted_address || place.address || '--'}</div>
                  <div className="meta">
                    <button
                      type="button"
                      className={`btn ghost${saved ? ' active' : ''}`}
                      onClick={event => handleSavedToggle(event, place)}
                    >
                      {saved ? 'Unsave' : 'Save'}
                    </button>
                  </div>
                </article>
              )
            }) : (
              <div className="panel-placeholder">{isLoading ? 'Loading places...' : error || 'No places match your filters.'}</div>
            )}
          </div>
        </aside>
      </section>

      <aside className={`explore-details${selectedPlace ? ' is-active' : ''}`} id="exploreDetailsPanel" aria-live="polite">
        <button
          id="exploreDetailsClose"
          className="icon-btn light"
          type="button"
          aria-label="Close details"
          onClick={() => setSelectedPlace(null)}
        >
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
        {selectedPlace ? (
          <div className="explore-detail-body">
            <header className="place-header">
              <div className="place-header-text">
                <h3>{selectedPlace.name || '--'}</h3>
                <div className="place-meta">
                  <span className="badge muted">{selectedPlace.category || '--'}</span>
                  <span className="badge rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(selectedPlace.rating)}</span>
                  <span className="badge muted">{selectedSummary || '--'}</span>
                  {selectedPrice ? (
                    <span className="badge price"><i className="fas fa-dollar-sign" aria-hidden="true"></i> {selectedPrice}</span>
                  ) : null}
                </div>
              </div>
              <button
                className={`icon-btn${isSelectedSaved ? ' saved' : ''}`}
                type="button"
                aria-pressed={isSelectedSaved}
                title={isSelectedSaved ? 'Remove from saved' : 'Save this place'}
                onClick={event => handleSavedToggle(event, selectedPlace)}
              >
                <i className={isSelectedSaved ? 'fas fa-star' : 'far fa-star'} aria-hidden="true"></i>
                <span className="sr-only">{isSelectedSaved ? 'Remove from saved' : 'Save this place'}</span>
              </button>
            </header>

            <p className="status-line"><span className="badge status" data-state={selectedStatus.state}>{selectedStatus.label}</span></p>
            <p><strong>Address:</strong> {selectedPlace.formatted_address || selectedPlace.address || '--'}</p>
            <p><strong>Phone:</strong> {selectedPlace.international_phone_number || selectedPlace.formatted_phone_number || selectedPlace.phone || '--'}</p>
            <p><strong>Website:</strong> {selectedWebsite ? <a href={selectedWebsite} target="_blank" rel="noreferrer">{selectedWebsiteLabel}</a> : '--'}</p>
            <div className="hours-block">
              <h4><i className="fas fa-clock" aria-hidden="true"></i> Opening Hours</h4>
              <ul className="opening-hours">
                {selectedOpeningHours.length ? selectedOpeningHours.map((line, index) => <li key={`hours-${index}`}>{line}</li>) : <li>Not available</li>}
              </ul>
            </div>
          </div>
        ) : (
          <div className="panel-placeholder">Select a place on the map to view full details.</div>
        )}
      </aside>
    </div>
  )
}
function formatRating(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(1) : '--'
}

function formatReviewSnippet(text, limit = 200) {
  if (!text) return '(No comment)'
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  const safeLength = Math.max(0, limit - 3)
  return `${trimmed.slice(0, safeLength)}...`
}

function formatPriceLevel(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  const level = Math.min(4, Math.max(1, Math.round(num)))
  return '$'.repeat(level)
}

function buildReviewsSummary(summary) {
  if (!summary) return '--'
  const count = Number(summary.count ?? summary.total_reviews ?? summary.total)
  const average = Number(summary.average ?? summary.average_rating ?? summary.rating)
  if (count && Number.isFinite(average)) {
    return `${count} review${count === 1 ? '' : 's'} - ${average.toFixed(1)} avg`
  }
  if (count) return `${count} review${count === 1 ? '' : 's'}`
  return '--'
}

function normalizeWebsite(url) {
  if (!url) return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function deriveStatus(place) {
  if (!place) return { label: 'Status unknown', state: 'unknown' }
  const openNow = place?.opening_hours?.open_now
  if (openNow === true) return { label: 'Open now', state: 'open' }
  if (openNow === false) return { label: 'Closed now', state: 'closed' }
  const raw = String(place?.business_status || '').toLowerCase()
  if (raw.includes('permanent')) return { label: 'Permanently closed', state: 'closed' }
  if (raw.includes('closed')) return { label: 'Temporarily closed', state: 'closed' }
  if (raw.includes('open')) return { label: 'Open', state: 'open' }
  return { label: 'Status unknown', state: 'unknown' }
}

