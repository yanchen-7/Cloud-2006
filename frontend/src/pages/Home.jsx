import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const SENTOSA = { lat: 1.249404, lng: 103.830321 }
const MAX_MARKERS = 25
const SLIDE_INTERVAL_MS = 6500
const REVIEW_PREVIEW_LIMIT = 5

export default function Home() {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const iconsRef = useRef(null)
  const userMarkerRef = useRef(null)
  const chartRef = useRef(null)

  const [places, setPlaces] = useState([])
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [savedPlaces, setSavedPlaces] = useState(() => new Set())
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  // Initialize Leaflet icons
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof L !== 'undefined' && !iconsRef.current) {
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
        user: L.icon({
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }
    }
  }, [])

  const icons = iconsRef.current

  const loadPlaces = useCallback(async () => {
    setIsLoadingPlaces(true);
    try {
      let url = '/api/places';
      if (userLocation) {
        // Radius of 10km for the home page
        url += `?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=10`;
      }
      const placesResponse = await fetch(url);
      if (!placesResponse.ok) throw new Error('Failed to fetch places');
      const placesData = await placesResponse.json();
      const list = Array.isArray(placesData) ? placesData : [];
      setPlaces(list);
      setErrorMessage(list.length ? '' : 'No places available right now.');
    } catch (error) {
      console.error('Unable to load places data', error);
      setPlaces([]);
      setErrorMessage('Unable to load places data.');
    } finally {
      setIsLoadingPlaces(false);
    }
  }, [userLocation]);

  const loadSavedPlaces = useCallback(async () => {
  try {
    const response = await fetch('/api/favourites');
    if (!response.ok) throw new Error('Failed to fetch favourites');
    const data = await response.json();
    setSavedPlaces(new Set(data.map(fav => fav.place_id)));
  } catch (err) {
    console.error('Error loading saved places', err);
  }
}, []);


  useEffect(() => {
    loadPlaces()
  }, [loadPlaces])

  useEffect(() => {
  loadSavedPlaces();
}, [loadSavedPlaces]);

  // Callback ref to initialize the map safely
  const mapContainerRef = useCallback(node => {
    if (!node || mapRef.current || typeof L === 'undefined') return; // Ensure node exists and map is not already initialized

    const map = L.map(node, { zoomControl: true }).setView([SENTOSA.lat, SENTOSA.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    // Cleanup function for when the component unmounts
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleSelectPlace = useCallback(async place => {
    if (!place) {
      setSelectedPlace(null)
      return
    }
    const placeId = place.place_id
    setReviewsExpanded(false)
    setSelectedPlace(place)
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`)
      if (!response.ok) return
      const details = await response.json()
      setSelectedPlace(current => {
        if (!current || current.place_id !== placeId) return current
        return { ...current, ...details }
      })
    } catch (error) {
      console.warn('Failed to load place details', error)
    }
  }, [])
  const filteredPlaces = useMemo(() => {
    const list = Array.isArray(places) ? places : []
    if (!list.length) return []
    const byCategory = selectedCategory ? list.filter(place => place.category === selectedCategory) : list.slice()
    const limited = byCategory.slice(0, MAX_MARKERS)
    if (savedPlaces.size) {
      list.forEach(place => {
        if (savedPlaces.has(place.place_id) && !limited.find(item => item.place_id === place.place_id)) {
          limited.push(place)
        }
      })
    }
    return limited
  }, [places, selectedCategory, savedPlaces])

  const totalPlaces = Array.isArray(places) ? places.length : 0

  useEffect(() => {
  if (!mapRef.current || !icons) return;
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];

  filteredPlaces.forEach(place => {
    const lat = Number(place?.latitude);
    const lng = Number(place?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const marker = L.marker([lat, lng], {
      icon: savedPlaces.has(place.place_id) ? icons.saved : icons.default,
    }).addTo(mapRef.current);

    marker.on('click', () => handleSelectPlace(place));
    markersRef.current.push(marker);
  });
}, [filteredPlaces, icons, savedPlaces, handleSelectPlace]);


  useEffect(() => {
    if (!mapRef.current || !icons?.user) return
    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
        userMarkerRef.current = null
      }
      return
    }
    const latLng = [userLocation.lat, userLocation.lng]
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latLng, { icon: icons.user }).addTo(mapRef.current)
    } else {
      userMarkerRef.current.setLatLng(latLng)
    }
    mapRef.current.setView(latLng, 13)
  }, [icons, userLocation])

  const categories = useMemo(() => {
    const list = Array.isArray(places) ? places : []
    const set = new Set()
    list.forEach(place => {
      if (place?.category) set.add(String(place.category))
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [places])

  const recommendations = useMemo(() => {
    const list = Array.isArray(places) ? places : []
    const byCategory = new Map()
    list.forEach(place => {
      if (!place) return
      const category = place.category || 'Highlights'
      const bucket = byCategory.get(category) || []
      bucket.push(place)
      byCategory.set(category, bucket)
    })
    const entries = []
    byCategory.forEach((bucket, category) => {
      const sorted = bucket
        .slice()
        .sort((a, b) => Number(b?.rating || 0) - Number(a?.rating || 0))
      if (sorted[0]) entries.push({ category, place: sorted[0] })
    })
    entries.sort((a, b) => Number(b.place?.rating || 0) - Number(a.place?.rating || 0))
    return entries.slice(0, 5)
  }, [places])

  const goToPreviousRecommendation = useCallback(() => {
    if (!recommendations.length) return
    setCurrentSlide(prev => (prev - 1 + recommendations.length) % recommendations.length)
  }, [recommendations.length])

  const goToNextRecommendation = useCallback(() => {
    if (!recommendations.length) return
    setCurrentSlide(prev => (prev + 1) % recommendations.length)
  }, [recommendations.length])

  useEffect(() => {
    setCurrentSlide(0)
  }, [recommendations.length])

  useEffect(() => {
    if (typeof window === 'undefined' || recommendations.length <= 1) return
    const timer = window.setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % recommendations.length)
    }, SLIDE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [recommendations.length])

  const toggleSavedPlace = useCallback(async (placeId) => {
  try {
    setSavedPlaces(prev => {
      const isSaved = prev.has(placeId);
      const next = new Set(prev);
      if (isSaved) {
        next.delete(placeId);
        fetch(`/api/favourites/${encodeURIComponent(placeId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }).catch(err => console.error('Error removing favourite', err));
      } else {
        next.add(placeId);
        fetch('/api/favourites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ place_id: placeId }),
        }).catch(err => console.error('Error saving favourite', err));
      }
      return next;
    });
  } catch (err) {
    console.error('Error toggling saved place', err);
  }
}, []);



  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation is not available in this browser.')
      return
    }
    setIsLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      position => {
        setIsLocating(false)
        setLocationError('')
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        setIsLocating(false)
        setLocationError('Unable to access your location.')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  const handleRefreshData = useCallback(() => {
    loadPlaces()
  }, [loadPlaces])

  const placeCountLabel = useMemo(() => {
    if (isLoadingPlaces) return 'Loading places...'
    if (filteredPlaces.length) {
      const scope = selectedCategory ? ` in ${selectedCategory}` : ''
      return `Showing ${filteredPlaces.length}${scope} (of ${totalPlaces} places).`
    }
    if (selectedCategory) {
      return `No places found in ${selectedCategory}.`
    }
    return errorMessage || 'No places available right now.'
  }, [filteredPlaces.length, isLoadingPlaces, selectedCategory, totalPlaces, errorMessage])

  const mapHintMessage = errorMessage || locationError || (userLocation ? 'Tap a pin to see place details.' : 'Share your location and tap a pin to see place details.')

  const selectedPlaceReviews = Array.isArray(selectedPlace?.reviews)
    ? selectedPlace.reviews
    : Array.isArray(selectedPlace?.user_reviews)
    ? selectedPlace.user_reviews
    : []
  const visibleReviews = reviewsExpanded ? selectedPlaceReviews : selectedPlaceReviews.slice(0, REVIEW_PREVIEW_LIMIT)
  const canToggleReviews = selectedPlaceReviews.length > REVIEW_PREVIEW_LIMIT

  const globalReviews = useMemo(() => {
    const list = []
    const source = Array.isArray(places) ? places : []
    source.forEach(place => {
      const reviews = Array.isArray(place?.reviews)
        ? place.reviews
        : Array.isArray(place?.user_reviews)
        ? place.user_reviews
        : []
      reviews.forEach(review => {
        list.push({
          ...review,
          placeName: place.name,
          placeId: place.place_id,
        })
      })
    })
    list.sort((a, b) => {
      const dateA = new Date(a.publish_time || a.time || 0).getTime()
      const dateB = new Date(b.publish_time || b.time || 0).getTime()
      return dateB - dateA
    })
    return list.slice(0, 6)
  }, [places])

  const categoryAverages = useMemo(() => {
    const map = new Map()
    const list = Array.isArray(places) ? places : []
    list.forEach(place => {
      const category = place?.category
      const rating = Number(place?.rating)
      if (!category || !Number.isFinite(rating)) return
      const bucket = map.get(category) || []
      bucket.push(rating)
      map.set(category, bucket)
    })
    return Array.from(map.entries())
      .map(([category, ratings]) => ({
        category,
        average: ratings.reduce((sum, value) => sum + value, 0) / ratings.length,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 7)
  }, [places])

    // Chart rendering effect
  useEffect(() => {
    const canvas = chartRef.current
    if (!canvas) return
    
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      const parent = canvas.parentElement
      let width = parent?.clientWidth || canvas.clientWidth || 600
      let height = canvas.clientHeight || 220
      if (!height) height = 220
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      const padding = 32

      if (!categoryAverages.length) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '16px "Poppins", sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('No rating data yet.', padding, height / 2)
        return
      }

      const maxValue = Math.max(5, ...categoryAverages.map(item => item.average))
      const gap = 24
      const availableWidth = width - padding * 2
      const barWidth = Math.max(24, (availableWidth - gap * (categoryAverages.length - 1)) / categoryAverages.length)

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      categoryAverages.forEach((item, index) => {
        const x = padding + index * (barWidth + gap)
        const barHeight = (item.average / maxValue) * (height - padding * 2)
        const y = height - padding - barHeight

        ctx.fillStyle = '#60a5fa'
        ctx.fillRect(x, y, barWidth, barHeight)

        ctx.fillStyle = '#1f2933'
        ctx.font = '12px "Poppins", sans-serif'
        ctx.fillText(item.average.toFixed(2), x + barWidth / 2, y - 8)

        ctx.fillStyle = '#475569'
        ctx.fillText(truncateLabel(item.category), x + barWidth / 2, height - padding + 10)
      })
    } catch (error) {
      console.error('Chart rendering error:', error)
    }
  }, [categoryAverages])

  const sliderStyle = recommendations.length ? { transform: `translateX(-${currentSlide * 100}%)` } : undefined

  const isSelectedSaved = !!(selectedPlace && savedPlaces.has(selectedPlace.place_id))
  const priceLabel = formatPriceLevel(selectedPlace?.price_level)
  const statusInfo = deriveStatus(selectedPlace)
  const summaryLabel = buildReviewsSummary(selectedPlace?.reviews_summary || selectedPlace?.user_reviews_summary)
  const address = selectedPlace?.formatted_address || selectedPlace?.address || '--'
  const phone = selectedPlace?.international_phone_number || selectedPlace?.formatted_phone_number || selectedPlace?.phone || '--'
  const websiteUrl = normalizeWebsite(selectedPlace?.website || selectedPlace?.website_url)
  const websiteLabel = selectedPlace?.website || selectedPlace?.website_url || (websiteUrl ? websiteUrl : '--')
  const openingHours = Array.isArray(selectedPlace?.opening_hours?.weekday_text) ? selectedPlace.opening_hours.weekday_text : []
  const distanceLabel = (() => {
    if (!userLocation || !selectedPlace) return null
    const lat = Number(selectedPlace.latitude ?? selectedPlace.lat)
    const lng = Number(selectedPlace.longitude ?? selectedPlace.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    const distance = computeDistanceKm(userLocation, { lat, lng })
    return formatDistance(distance)
  })()
  return (
    <main className="page-content">
      <section className="top-row">
        <div className="card recommendations">
          <div className="card-header">
            <div>
              <h2><i className="fas fa-star" aria-hidden="true"></i> Recommendations of the Day</h2>
              <p>Fresh picks across popular categories, updated every day.</p>
            </div>
            <div className="slider-controls">
              <button className="slider-btn" id="recPrev" type="button" aria-label="Previous recommendation" onClick={goToPreviousRecommendation}>
                <i className="fas fa-chevron-left" aria-hidden="true"></i>
              </button>
              <button className="slider-btn" id="recNext" type="button" aria-label="Next recommendation" onClick={goToNextRecommendation}>
                <i className="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div className="slider" id="recommendationSlider">
            <div className="slider-track" id="recommendationTrack" style={sliderStyle}>
              {recommendations.length ? recommendations.map((entry, index) => (
                <div className="slider-item" key={`${entry.category}-${entry.place.place_id}-${index}`}>
                  <div className="details">
                    <h3>{entry.place?.name || '--'}</h3>
                    <p>{entry.place?.formatted_address || entry.place?.address || '--'}</p>
                    <div className="meta">
                      <span className="badge rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(entry.place?.rating)}</span>
                      <span className="badge muted">{getReviewCountLabel(entry.place) || 'Popular spot'}</span>
                    </div>
                  </div>
                  <div className="map-preview">
                    <div className="category">{entry.category}</div>
                  </div>
                </div>
              )) : (
                <div className="slider-placeholder">Recommendations will appear once places load.</div>
              )}
            </div>
            <div className="slider-pagination" id="recommendationDots">
              {recommendations.map((_, index) => (
                <button
                  key={`rec-dot-${index}`}
                  type="button"
                  className={`slider-dot${index === currentSlide ? ' active' : ''}`}
                  aria-label={`Go to recommendation ${index + 1}`}
                  onClick={() => setCurrentSlide(index)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="card weather" id="weatherCard">
          <div className="card-header">
            <div>
              <h2><i className="fas fa-cloud" aria-hidden="true"></i> Local Weather Dashboard</h2>
              <p>Nearest forecast, rainfall and PSI from Data.gov.sg</p>
            </div>
          </div>
          <WeatherBlock />
        </div>
      </section>

      <section className="map-section">
        <aside className="place-panel is-active" id="placePanel">
          <div className="panel-body">
            {!selectedPlace ? (
              <div className="panel-placeholder" id="placePlaceholder">
                <i className="fas fa-hand-pointer" aria-hidden="true"></i>
                <p>Select a place on the map to view full details, opening hours and reviews.</p>
              </div>
            ) : (
              <div className="place-details" id="placeDetails">
                <header className="place-header">
                  <div className="place-header-text">
                    <h3 id="placeName">{selectedPlace?.name || '--'}</h3>
                    <div className="place-meta">
                      <span id="placeCategory" className="badge muted">{selectedPlace?.category || '--'}</span>
                      <span id="placeRating" className="badge rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(selectedPlace?.rating)}</span>
                      <span id="placeReviewsCount" className="badge muted">
                        <i className="fas fa-users" aria-hidden="true"></i> {summaryLabel || '--'}
                      </span>
                      {priceLabel ? (
                        <span id="placePrice" className="badge price">
                          <i className="fas fa-dollar-sign" aria-hidden="true"></i> {priceLabel}
                        </span>
                      ) : null}
                      {distanceLabel ? (
                        <span id="placeDistance" className="badge muted">
                          <i className="fas fa-route" aria-hidden="true"></i> {distanceLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    id="savePlace"
                    className={`icon-btn${isSelectedSaved ? ' saved' : ''}`}
                    type="button"
                    aria-pressed={isSelectedSaved}
                    title={isSelectedSaved ? 'Remove from saved' : 'Save this place'}
                    onClick={() => toggleSavedPlace(selectedPlace.place_id)}
                  >
                    <i className={isSelectedSaved ? 'fas fa-star' : 'far fa-star'} aria-hidden="true"></i>
                    <span className="sr-only">{isSelectedSaved ? 'Remove from saved' : 'Save this place'}</span>
                  </button>
                </header>

                <dl className="place-data">
                  <div>
                    <dt>Status</dt>
                    <dd><span id="placeStatus" className="badge status" data-state={statusInfo.state}>{statusInfo.label}</span></dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd id="placeAddress">{address}</dd>
                  </div>
                  <div>
                    <dt>Telephone</dt>
                    <dd id="placePhone">{phone}</dd>
                  </div>
                  <div>
                    <dt>Website</dt>
                    <dd id="placeWebsite">
                      {websiteUrl ? (
                        <a id="placeWebsiteLink" href={websiteUrl} target="_blank" rel="noreferrer">
                          {websiteLabel}
                        </a>
                      ) : '--'}
                    </dd>
                  </div>
                  <div>
                    <dt>Opening Hours</dt>
                    <dd>
                      <ul className="opening-hours" id="placeHours">
                        {openingHours.length ? openingHours.map((line, index) => <li key={`${selectedPlace.place_id}-hours-${index}`}>{line}</li>) : <li>Not available</li>}
                      </ul>
                    </dd>
                  </div>
                </dl>

                <section className="place-reviews" aria-labelledby="placeReviewsTitle">
                  <div className="section-heading">
                    <h4 id="placeReviewsTitle"><i className="fas fa-star-half-alt" aria-hidden="true"></i> Visitor Reviews</h4>
                    <span className="badge muted" id="placeReviewsSummary">{summaryLabel || '--'}</span>
                  </div>
                  <div className="reviews-stack" id="placeReviewsList">
                    {visibleReviews.length ? visibleReviews.map(review => (
                      <article key={`${selectedPlace.place_id}-${review.author_name}-${review.publish_time ?? review.time ?? Math.random()}`} className="review-card">
                        <div className="review-header">
                          <span className="review-rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(review?.rating)}</span>
                          <span>{getReviewAuthor(review)}</span>
                        </div>
                        <span className="review-date">{formatDateLabel(review?.publish_time || review?.time)}</span>
                        <p className="review-text">{formatReviewSnippet(review?.review_text || review?.text)}</p>
                      </article>
                    )) : (
                      <div className="panel-placeholder">No reviews yet.</div>
                    )}
                  </div>
                  {canToggleReviews ? (
                    <button
                      id="placeReviewsToggle"
                      className="btn ghost"
                      type="button"
                      onClick={() => setReviewsExpanded(value => !value)}
                    >
                      {reviewsExpanded ? 'Show fewer reviews' : 'Show more reviews'}
                    </button>
                  ) : null}
                </section>

                <section className="user-review" aria-labelledby="userReviewTitle">
                  <h4 id="userReviewTitle"><i className="fas fa-pen-to-square" aria-hidden="true"></i> Share Your Experience</h4>
                  <p className="panel-placeholder">Sign in via the Profile page to leave a review.</p>
                </section>
              </div>
            )}
          </div>
        </aside>

        <div className="map-wrapper">
          <div className="map-toolbar">
            <button
              id="locateMe"
              className="btn ghost"
              type="button"
              onClick={handleLocateMe}
              disabled={isLocating}
            >
              <i className="fas fa-location-arrow" aria-hidden="true"></i>
              {isLocating ? 'Locating...' : 'Re-centre on Me'}
            </button>
            <label htmlFor="categorySelect" className="sr-only">Select a category</label>
            <select
              id="categorySelect"
              className="category-select"
              value={selectedCategory}
              onChange={event => setSelectedCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <span className="toolbar-text" id="placeCount">{placeCountLabel}</span>
            <button
              id="refreshData"
              className="btn ghost"
              type="button"
              onClick={handleRefreshData}
              disabled={isLoadingPlaces}
            >
              <i className="fas fa-sync" aria-hidden="true"></i>
              Refresh Data
            </button>
          </div>
          <div className="map-hint" id="mapHint">
            <i className="fas fa-info-circle" aria-hidden="true"></i>
            {mapHintMessage}
          </div>
          <div ref={mapContainerRef} id="map" className="map" role="region" aria-label="Singapore map"></div>
          <div className="map-legend">
            <span><i className="fas fa-location-crosshairs" aria-hidden="true"></i> You</span>
            <span><i className="fas fa-map-marker-alt" aria-hidden="true"></i> Selected Places</span>
          </div>
        </div>
      </section>

      <section className="card data-viz">
        <div className="card-header">
          <div>
            <h2><i className="fas fa-chart-bar" aria-hidden="true"></i> Data Visualisation</h2>
            <p>Explore ratings distribution by category.</p>
          </div>
        </div>
        <div className="viz-body">
          <canvas ref={chartRef} id="ratingsChart" height="220" style={{ width: '100%', height: '220px' }}></canvas>
        </div>
      </section>

      <section className="card reviews">
        <div className="card-header">
          <div>
            <h2><i className="fas fa-comments" aria-hidden="true"></i> Recent Reviews</h2>
            <p>Latest visitor reviews from our places database.</p>
          </div>
        </div>
        <div className="reviews-body">
          <div className="reviews-list" id="reviewsList">
            {globalReviews.length ? globalReviews.map(review => (
              <article key={`${review.placeId}-${review.author_name}-${review.publish_time ?? review.time ?? Math.random()}`} className="review-card">
                <div className="review-header">
                  <span className="review-rating"><i className="fas fa-star" aria-hidden="true"></i> {formatRating(review?.rating)}</span>
                  <span>{getReviewAuthor(review)}</span>
                </div>
                <span className="review-date">{formatDateLabel(review?.publish_time || review?.time)} - {review.placeName}</span>
                <p className="review-text">{formatReviewSnippet(review?.review_text || review?.text)}</p>
              </article>
            )) : (
              <div className="panel-placeholder">No reviews yet. Be the first to share.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
function WeatherBlock() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchWeather = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/weather')
        if (!response.ok) throw new Error('Failed to fetch weather')
        const data = await response.json()
        if (isMounted) {
          setPayload(data)
          setError('')
        }
      } catch (err) {
        console.error('Unable to load weather data', err)
        if (isMounted) {
          setPayload(null)
          setError('Unable to load weather data right now.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    fetchWeather()
    return () => {
      isMounted = false
    }
  }, [])

  const forecastItem = payload?.items?.[0] || null
  const description = forecastItem?.general?.forecast || forecastItem?.forecasts?.[0]?.forecast || 'Latest island-wide outlook from Data.gov.sg.'
  const area = forecastItem?.forecasts?.[0]?.area || 'Singapore (island-wide)'
  const updated = formatDateTime(forecastItem?.update_timestamp || forecastItem?.timestamp)
  const weatherSource = forecastItem?.forecasts?.[0]?.area ? `${forecastItem.forecasts[0].area} vicinity` : 'Island-wide'

  const temperature = formatTemperature(payload?.temp)
  const psi = formatPsi(payload?.psi)
  const rainfall = formatRainfall(payload?.rainfall)

  return (
    <div className="weather-body">
      <div className="weather-summary">
        <h3 id="weatherArea">{area}</h3>
        <p id="weatherDescription">{description}</p>
        <div className="weather-badges">
          <span className="badge" id="tempBadge"><i className="fas fa-temperature-three-quarters" aria-hidden="true"></i> Temp: {temperature || '--'}</span>
          <span className="badge" id="psiBadge"><i className="fas fa-wind" aria-hidden="true"></i> PSI: {psi || '--'}</span>
          <span className="badge" id="rainfallBadge"><i className="fas fa-umbrella" aria-hidden="true"></i> Rainfall: {rainfall || '--'}</span>
        </div>
      </div>
      <ul className="weather-meta">
        <li><i className="fas fa-clock" aria-hidden="true"></i> Updated: <span id="weatherUpdated">{isLoading && !updated ? 'Loading...' : updated || '--'}</span></li>
        <li><i className="fas fa-map-pin" aria-hidden="true"></i> Source: <span id="weatherSource">{weatherSource}</span></li>
      </ul>
      <div className="weather-errors" id="weatherErrors">
        {error ? <span>{error}</span> : null}
      </div>
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

function formatDateLabel(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Recently'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
}

function formatPriceLevel(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  const level = Math.min(4, Math.max(1, Math.round(num)))
  return '$'.repeat(level)
}

function computeDistanceKm(from, to) {
  if (!from || !to) return NaN
  const R = 6371
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLng = toRadians(to.lng - from.lng)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return null
  if (distance < 1) return `${Math.round(distance * 1000)} m away`
  return `${distance.toFixed(1)} km away`
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

function getReviewCountLabel(place) {
  const summary = place?.reviews_summary || place?.user_reviews_summary
  const rawCount = summary?.count ?? summary?.total_reviews ?? summary?.total
  const count = Number(rawCount)
  if (Number.isFinite(count) && count > 0) {
    return `${count} review${count === 1 ? '' : 's'}`
  }
  return null
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

function getReviewAuthor(review) {
  return review?.author_name || review?.author || review?.username || review?.name || 'Anonymous'
}

function truncateLabel(label, max = 18) {
  if (!label) return '--'
  const text = String(label)
  if (text.length <= max) return text
  const safeLength = Math.max(0, max - 3)
  return `${text.slice(0, safeLength)}...`
}

function normalizeWebsite(url) {
  if (!url) return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function formatTemperature(payload) {
  const readings = payload?.items?.[0]?.readings || []
  const values = readings.map(item => Number(item.value)).filter(Number.isFinite)
  if (!values.length) return null
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return `${average.toFixed(1)} deg C`
}

function formatPsi(payload) {
  const readings = payload?.items?.[0]?.readings?.psi_twenty_four_hourly || {}
  const value = readings.national ?? readings.north ?? readings.central ?? null
  if (value == null) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric).toString()
}

function formatRainfall(payload) {
  const readings = payload?.items?.[0]?.readings || []
  const values = readings.map(item => Number(item.value)).filter(Number.isFinite)
  if (!values.length) return null
  const max = Math.max(...values)
  return `${max.toFixed(1)} mm`
}
