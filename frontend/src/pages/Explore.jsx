import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'

const SENTOSA = { lat: 1.249404, lng: 103.830321 }
const MAX_MARKERS = 40

export default function Explore() {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const markerByIdRef = useRef(new Map()) // map of place_id -> Leaflet marker
  const highlightMarkerRef = useRef(null)
  const iconsRef = useRef(null)

  const [places, setPlaces] = useState([])
  const [category, setCategory] = useState('')
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedPlaceIds, setSavedPlaceIds] = useState(() => new Set())
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [focusPlaceId, setFocusPlaceId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [favouritesLoaded, setFavouritesLoaded] = useState(false)
  const [dailyTop, setDailyTop] = useState([])
  const [dailyTopError, setDailyTopError] = useState('')
  const [recommendations, setRecommendations] = useState([])
  const [recsLoading, setRecsLoading] = useState(false)

  if (!iconsRef.current && typeof L !== 'undefined') {
    iconsRef.current = {
      default: L.icon({
        iconUrl:
          'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png',
        shadowUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
      saved: L.icon({
        iconUrl:
          'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-gold.png',
        shadowUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    }
  }

  useEffect(() => {
    async function loadFavourites() {
      try {
        const res = await fetch('/api/favourites', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to fetch favourites')
        const data = await res.json()
        setSavedPlaceIds(new Set(data.map(fav => String(fav.place_id).trim())))
      } catch (err) {
        console.error(err)
      } finally {
        setFavouritesLoaded(true)
      }
    }
    loadFavourites()
  }, [])

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
    async function loadDailyTop() {
      try {
        const res = await fetch('/api/places/daily-top5')
        if (!res.ok) throw new Error('Failed to load daily top list')
        const data = await res.json()
        const list = Array.isArray(data) ? data.slice(0, 5) : []
        setDailyTop(list)
        setDailyTopError(list.length ? '' : 'No daily scores available.')
      } catch (err) {
        console.error(err)
        setDailyTop([])
        setDailyTopError('Unable to load daily top places right now.')
      }
    }
    loadDailyTop()
  }, [])

  useEffect(() => {
    if (mapRef.current || typeof L === 'undefined') return
    const map = L.map('exploreMap', { zoomControl: true }).setView(
      [SENTOSA.lat, SENTOSA.lng],
      12
    )
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

  // fly to marker when clicking a recommendation or focused place
  const focusMarker = useCallback((place) => {
    if (!place?.place_id || !mapRef.current) return
    const pid = String(place.place_id).trim()
    const marker = markerByIdRef.current.get(pid)

    if (marker) {
      const latLng = marker.getLatLng()
      mapRef.current.flyTo(latLng, 16, { animate: true, duration: 0.8 })
      return
    }

    const lat = Number(place.latitude)
    const lng = Number(place.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.8 })
    }
  }, [])

  // fetch place details + recommendations (supports focus mode)
  const handleSelectPlace = useCallback(async (place, { focus = false } = {}) => {
    if (!place) {
      setSelectedPlace(null)
      setFocusPlaceId(null)
      setRecommendations([])
      setRecsLoading(false)
      return
    }

    const placeId = place.place_id
    setSelectedPlace(place)
    setFocusPlaceId(focus ? placeId : null)

    // 1) load full details
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`)
      if (response.ok) {
        const details = await response.json()
        setSelectedPlace(current => {
          if (!current || current.place_id !== placeId) return current
          return { ...current, ...details }
        })
      }
    } catch (err) {
      console.warn('Failed to load place details', err)
    }

    // 2) load recommendations
    setRecsLoading(true)
    try {
      const recRes = await fetch(`/api/places/${encodeURIComponent(placeId)}/recommendations?limit=8`)
      if (recRes.ok) {
        const recData = await recRes.json()
        setRecommendations(recData.recommendations || [])
      } else {
        setRecommendations([])
      }
    } catch (err) {
      console.warn('Failed to load recommendations', err)
      setRecommendations([])
    } finally {
      setRecsLoading(false)
    }
  }, [])

  const handleSavedToggle = useCallback(
    async (event, place) => {
      event.stopPropagation()
      if (!place?.place_id) return

      try {
        if (savedPlaceIds.has(String(place.place_id))) {
          const res = await fetch(
            `/api/favourites/${encodeURIComponent(place.place_id)}`,
            {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
            }
          )
          if (!res.ok) throw new Error('Failed to remove favourite')
          setSavedPlaceIds(prev => {
            const next = new Set(prev)
            next.delete(String(place.place_id))
            return next
          })
        } else {
          const res = await fetch('/api/favourites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ place_id: place.place_id }),
          })
          if (!res.ok) throw new Error('Failed to save as favourite')
          setSavedPlaceIds(prev => {
            const next = new Set(prev)
            next.add(String(place.place_id))
            return next
          })
        }
      } catch (err) {
        console.error(err)
        alert(err.message || 'Failed to update favourite')
      }
    },
    [savedPlaceIds]
  )

  const handleDailyTopSelect = useCallback(
    (item) => {
      const p = item?.place;
      if (!p?.place_id) return;

      const lat = Number(p.latitude);
      const lng = Number(p.longitude);

      if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
        mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
      }

      handleSelectPlace(
        {
          place_id: p.place_id,
          name: p.name || p.place_id,
          formatted_address: p.formatted_address || p.address,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          category: p.category,
          rating: p.rating,
          price_level: p.price_level,
          opening_hours: p.opening_hours,
          website: p.website,
        },
        { focus: true }
      );
    },
    [handleSelectPlace]
  );

  const handleDailyTopKeyDown = useCallback(
    (event, item) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleDailyTopSelect(item);
      }
    },
    [handleDailyTopSelect]
  );



  const categories = useMemo(() => {
    const list = Array.isArray(places) ? places : []
    const set = new Set()
    list.forEach(item => {
      if (item?.category) set.add(String(item.category))
    })
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [places])

  const filteredPlaces = useMemo(() => {
    let list = Array.isArray(places) ? places : []
    if (category) list = list.filter(place => place.category === category)
    if (showSavedOnly && favouritesLoaded)
      list = list.filter(place => savedPlaceIds.has(String(place.place_id)))
    return list
      .slice(0, MAX_MARKERS)
      .sort((a, b) => Number(b?.rating || 0) - Number(a?.rating || 0))
  }, [places, category, showSavedOnly, savedPlaceIds, favouritesLoaded])

  useEffect(() => {
    if (!mapRef.current || !icons) return
    if (!favouritesLoaded) return

    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []
    markerByIdRef.current.clear()

    // If focusing on a single place, skip rendering the full set
    if (focusPlaceId) return

    if (!filteredPlaces.length) return

    filteredPlaces.forEach(place => {
      const lat = Number(place?.latitude)
      const lng = Number(place?.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const marker = L.marker([lat, lng], {
        icon: savedPlaceIds.has(String(place.place_id).trim())
          ? icons.saved
          : icons.default,
      }).addTo(mapRef.current)

      const pid = String(place.place_id).trim()
      markerByIdRef.current.set(pid, marker)

      marker.on('click', () => handleSelectPlace(place))
      markersRef.current.push(marker)
    })
  }, [filteredPlaces, focusPlaceId, savedPlaceIds, favouritesLoaded, icons, handleSelectPlace])

  useEffect(() => {
    if (!mapRef.current) return
    if (focusPlaceId) return
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

  useEffect(() => {
    // Keep a dedicated highlight marker for the selected place
    const map = mapRef.current
    const icons = iconsRef.current
    if (!map) return

    // Clear previous highlight marker
    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.remove()
      highlightMarkerRef.current = null
    }

    if (!selectedPlace) return

    const lat = Number(selectedPlace?.latitude)
    const lng = Number(selectedPlace?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const isSaved = selectedPlace?.place_id
      ? savedPlaceIds.has(String(selectedPlace.place_id).trim())
      : false
    const icon = icons?.[isSaved ? 'saved' : 'default']

    const marker = L.marker([lat, lng], icon ? { icon } : undefined).addTo(map)
    highlightMarkerRef.current = marker
  }, [selectedPlace, savedPlaceIds])

  const handleItemKeyDown = useCallback((event, place) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectPlace(place)
    }
  }, [handleSelectPlace])

  const isSelectedSaved = !!(
    selectedPlace && savedPlaceIds.has(String(selectedPlace.place_id).trim())
  )
  const selectedSummary = buildReviewsSummary(selectedPlace?.user_reviews_summary)
  const selectedPrice = formatPriceLevel(selectedPlace?.price_level)
  const selectedWebsite = normalizeWebsite(
    selectedPlace?.website || selectedPlace?.website_url
  )
  const selectedWebsiteLabel =
    selectedPlace?.website ||
    selectedPlace?.website_url ||
    (selectedWebsite ? selectedWebsite : '--')
  const selectedOpeningHours = Array.isArray(
    selectedPlace?.opening_hours?.weekday_text
  )
    ? selectedPlace.opening_hours.weekday_text
    : []
  const selectedStatus = deriveStatus(selectedPlace)
  const exploreCount = filteredPlaces.length

  return (
    <div className="explore">
      <section className="explore-hero">
  <div className="daily-top">
    <div className="daily-top-header" style={{ textAlign: 'center' }}>
      <h2>Daily Top 5 (AI score)</h2>
    </div>

    <div
      className="daily-top-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', // 5 cards in one row
        gap: '1rem',
        alignItems: 'stretch',
      }}
    >
      {dailyTop.length ? (
        dailyTop.map(item => (
          <article
            key={item.place?.place_id || item.rank}
            className="card daily-top-card"
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
            role="button"
            tabIndex={0}
            onClick={() => handleDailyTopSelect(item)}
            onKeyDown={(event) => handleDailyTopKeyDown(event, item)}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <span className="badge rating">#{item.rank || '--'}</span>
              <span className="badge muted">
                {item.review_count || 0} reviews
              </span>
            </div>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            >
              <h3>{item.place?.name || item.place?.place_id || 'Unknown place'}</h3>
              <p className="muted">
                {item.place?.formatted_address ||
                  item.place?.address ||
                  'Address not available'}
              </p>
            </div>

            <div
              className="daily-top-card__meta"
              style={{
                marginTop: 'auto',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span className="badge rating">
                <i className="fas fa-star" aria-hidden="true"></i>{' '}
                {formatRating(item.place?.rating)}
              </span>
              <span className="badge status" data-state="open">
                AI score: {formatSentiment(item.avg_sentiment)}
              </span>
            </div>
          </article>
        ))
      ) : (
        <div className="panel-placeholder">
          {dailyTopError || 'Loading daily top places...'}
        </div>
      )}
    </div>
  </div>
</section>


      <section className="explore-layout">
        <div className="explore-map-wrapper">
          <div
            id="exploreMap"
            className="map"
            role="region"
            aria-label="Explore Singapore map"
          ></div>

          <div className="map-legend">
            <span>
              <i className="fas fa-map-marker-alt" aria-hidden="true"></i> Places
            </span>
            <span>
              <i className="fas fa-star text-saved" aria-hidden="true"></i> Saved
            </span>
          </div>

          <aside
            className={`explore-details${selectedPlace ? ' is-active' : ''}`}
            id="exploreDetailsPanel"
            aria-live="polite"
          >
            <button
              id="exploreDetailsClose"
              className="icon-btn light"
              type="button"
              aria-label="Close details"
              onClick={() => {
                setSelectedPlace(null)
                setFocusPlaceId(null)
                setRecommendations([])
              }}
            >
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>

            {selectedPlace ? (
              <div className="explore-detail-body">
                <header className="place-header">
                  <div className="place-header-text">
                    <h3>{selectedPlace.name || '--'}</h3>
                    <div className="place-meta">
                      <span className="badge muted">
                        {selectedPlace.category || '--'}
                      </span>
                      <span className="badge rating">
                        <i className="fas fa-star" aria-hidden="true"></i>{' '}
                        {formatRating(selectedPlace.rating)}
                      </span>
                      <span className="badge muted">{selectedSummary || '--'}</span>
                      {selectedPrice ? (
                        <span className="badge price">
                          <i className="fas fa-dollar-sign" aria-hidden="true"></i>{' '}
                          {selectedPrice}
                        </span>
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
                    <i
                      className={isSelectedSaved ? 'fas fa-star' : 'far fa-star'}
                      aria-hidden="true"
                    ></i>
                    <span className="sr-only">
                      {isSelectedSaved ? 'Remove from saved' : 'Save this place'}
                    </span>
                  </button>
                </header>

                <p className="status-line">
                  <span className="badge status" data-state={selectedStatus.state}>
                    {selectedStatus.label}
                  </span>
                </p>

                <p>
                  <strong>Address:</strong>{' '}
                  {selectedPlace.formatted_address || selectedPlace.address || '--'}
                </p>
                <p>
                  <strong>Phone:</strong>{' '}
                  {selectedPlace.international_phone_number ||
                    selectedPlace.formatted_phone_number ||
                    selectedPlace.phone ||
                    '--'}
                </p>
                <p>
                  <strong>Website:</strong>{' '}
                  {selectedWebsite ? (
                    <a href={selectedWebsite} target="_blank" rel="noreferrer">
                      {selectedWebsiteLabel}
                    </a>
                  ) : (
                    '--'
                  )}
                </p>

                <div className="hours-block">
                  <h4>
                    <i className="fas fa-clock" aria-hidden="true"></i> Opening
                    Hours
                  </h4>
                  <ul className="opening-hours">
                    {selectedOpeningHours.length ? (
                      selectedOpeningHours.map((line, index) => (
                        <li key={`hours-${index}`}>{line}</li>
                      ))
                    ) : (
                      <li>Not available</li>
                    )}
                  </ul>
                </div>

                {/* Recommended Places section */}
                <div className="recs-block">
                  <h4>
                    <i className="fas fa-thumbs-up" aria-hidden="true"></i>{' '}
                    Recommended Places
                  </h4>

                  <p className="recs-desc">
                    These suggestions are generated from real user activity: places frequently clicked or visited together.
                  </p>

                  {recsLoading ? (
                    <div className="panel-placeholder">
                      Loading recommendations...
                    </div>
                  ) : recommendations.length ? (
                    <div className="recs-list">
                      {recommendations.map(rec => (
                        <div
                          key={rec.place_id}
                          className="rec-item"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            handleSelectPlace(rec, { focus: true })
                            focusMarker(rec)   // fly to marker
                          }}
                          onKeyDown={e => {
                            handleItemKeyDown(e, rec)
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleSelectPlace(rec, { focus: true })
                              focusMarker(rec)
                            }
                          }}
                        >
                          <div className="rec-title">{rec.name || '--'}</div>
                          <div className="rec-meta">
                            <span className="badge rating">
                              <i className="fas fa-star" aria-hidden="true"></i>{' '}
                              {formatRating(rec.rating)}
                            </span>
                          </div>
                          <div className="meta">
                            {rec.formatted_address || rec.address || '--'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel-placeholder">
                      No recommendations yet for this place.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="panel-placeholder">
                Select a place on the map to view full details.
              </div>
            )}
          </aside>
        </div>

        <aside className="explore-sidebar">
          <div className="explore-controls">
            <label htmlFor="exploreCategory">Category</label>
            <select
              id="exploreCategory"
              value={category}
              onChange={event => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
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
            <span id="exploreCount" className="badge muted">
              {exploreCount}
            </span>
          </div>

          <div id="exploreList" className="explore-list">
            {filteredPlaces.length ? (
              filteredPlaces.map(place => {
                const saved = savedPlaceIds.has(String(place.place_id).trim())
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
                    <span className="badge rating">
                      <i className="fas fa-star" aria-hidden="true"></i>{' '}
                      {formatRating(place.rating)}
                    </span>
                    <div className="meta">
                      {place.formatted_address || place.address || '--'}
                    </div>
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
              })
            ) : (
              <div className="panel-placeholder">
                {isLoading
                  ? 'Loading places...'
                  : error || 'No places match your filters.'}
              </div>
            )}
          </div>
        </aside>
      </section>
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

function formatSentiment(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '--'
  return num.toFixed(2)
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
