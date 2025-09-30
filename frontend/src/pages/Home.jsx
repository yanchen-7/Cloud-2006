
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

function Home() {
  // All your previous top-level constants and hooks go here
  const SENTOSA = { lat: 1.249404, lng: 103.830321 }
  const MAX_MARKERS = 25
  const SLIDE_INTERVAL_MS = 6500
  const REVIEW_PREVIEW_LIMIT = 5

  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)

  const mapRef = useRef(null)
  const markersRef = useRef([])
  const iconsRef = useRef(null)
  const userMarkerRef = useRef(null)
  const chartRef = useRef(null)

  const [places, setPlaces] = useState([])
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [savedPlaces, setSavedPlaces] = useState(() => new Set())

  const icons = iconsRef.current

  // ... (all the hooks and logic from your previous code, unchanged)

  // Place all the logic from your previous code here, unchanged

  // Return the main JSX (copy from your previous code)
  // (The entire return statement from your previous code goes here)
  // For brevity, you can copy the entire return statement from your previous code

  // Example:
  return (
    // ... (your previous JSX)
    <main className="page-content">
      {/* ... all your JSX ... */}
    </main>
  )
}

// Move Recommendations and WeatherBlock below Home
function Recommendations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/recommendations")
      .then((res) => res.json())
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading recommendations...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="recommendations">
      <h2>Recommendations of the Day</h2>
      <div>
        <h3>Top Pages</h3>
        <ul>
          {data.recommendations?.top_pages?.map(([page, count]) => (
            <li key={page}>{page} ({count} clicks)</li>
          ))}
        </ul>
        <h3>Top Elements</h3>
        <ul>
          {data.recommendations?.top_elements?.map(([element, count]) => (
            <li key={element}>{element} ({count} clicks)</li>
          ))}
        </ul>
        <h3>Predictions</h3>
        <ul>
          {data.predictions && Object.entries(data.predictions).map(([k, v]) => (
            <li key={k}>{k}: {(v * 100).toFixed(2)}%</li>
          ))}
        </ul>
      </div>
    </div>
  );
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

  const temperature = formatTemperature(payload)
  const psi = formatPsi(payload)
  const rainfall = formatRainfall(payload)

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
export default Home;
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
  return review?.author || review?.username || review?.name || 'Anonymous'
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
