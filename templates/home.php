<?php
$pageTitle = 'Discover Singapore - Welcome to Garden City';
$pageId = 'home';
?>
<section class="top-row">
    <div class="card recommendations">
        <div class="card-header">
            <div>
                <h2><i class="fas fa-star"></i> Recommendations of the Day</h2>
                <p>Fresh picks across popular categories, updated every day.</p>
            </div>
            <div class="slider-controls">
                <button class="slider-btn" id="recPrev" aria-label="Previous recommendation"><i class="fas fa-chevron-left"></i></button>
                <button class="slider-btn" id="recNext" aria-label="Next recommendation"><i class="fas fa-chevron-right"></i></button>
            </div>
        </div>
        <div class="slider" id="recommendationSlider">
            <div class="slider-track" id="recommendationTrack">
                <div class="slider-placeholder">Loading daily picks...</div>
            </div>
            <div class="slider-pagination" id="recommendationDots"></div>
        </div>
    </div>

    <div class="card weather" id="weatherCard">
        <div class="card-header">
            <div>
                <h2><i class="fas fa-cloud"></i> Local Weather Dashboard</h2>
                <p>Nearest forecast, rainfall and PSI from Data.gov.sg</p>
            </div>
        </div>
        <div class="weather-body">
            <div class="weather-summary">
                <h3 id="weatherArea">Singapore (island-wide)</h3>
                <p id="weatherDescription">Latest island-wide outlook from Data.gov.sg.</p>
                <div class="weather-badges">
                    <span class="badge" id="tempBadge"><i class="fas fa-temperature-three-quarters"></i> Temp: --</span>
                    <span class="badge" id="psiBadge"><i class="fas fa-wind"></i> PSI: --</span>
                    <span class="badge" id="rainfallBadge"><i class="fas fa-umbrella"></i> Rainfall: --</span>
                </div>
            </div>
            <ul class="weather-meta">
                <li><i class="fas fa-clock"></i> Updated: <span id="weatherUpdated">--</span></li>
                <li><i class="fas fa-map-pin"></i> Source: <span id="weatherSource">Island-wide</span></li>
            </ul>
            <div class="weather-errors" id="weatherErrors"></div>
        </div>
    </div>
</section>

<section class="map-section">
    <aside class="place-panel is-collapsed" id="placePanel">
        <div class="panel-body">
            <div class="panel-placeholder" id="placePlaceholder">
                <i class="fas fa-hand-pointer"></i>
                <p>Select a place on the map to view full details, opening hours and reviews.</p>
            </div>
            <div class="place-details" id="placeDetails" hidden>
                <header class="place-header">
                    <div class="place-header-text">
                        <h3 id="placeName">--</h3>
                        <div class="place-meta">
                            <span id="placeCategory" class="badge muted">--</span>
                            <span id="placeRating" class="badge rating"><i class="fas fa-star"></i> --</span>
                            <span id="placeReviewsCount" class="badge muted"><i class="fas fa-users"></i> --</span>
                            <span id="placePrice" class="badge price" hidden><i class="fas fa-dollar-sign"></i></span>
                            <span id="placeDistance" class="badge muted" hidden><i class="fas fa-route"></i></span>
                        </div>
                    </div>
                    <button id="savePlace" class="icon-btn" type="button" aria-pressed="false" title="Save this place">
                        <i class="far fa-star"></i>
                    </button>
                </header>

                <dl class="place-data">
                    <div>
                        <dt>Status</dt>
                        <dd><span id="placeStatus" class="badge status">Status unknown</span></dd>
                    </div>
                    <div>
                        <dt>Address</dt>
                        <dd id="placeAddress">--</dd>
                    </div>
                    <div>
                        <dt>Telephone</dt>
                        <dd id="placePhone">--</dd>
                    </div>
                    <div>
                        <dt>Website</dt>
                        <dd id="placeWebsite"><a href="#" target="_blank" rel="noopener" id="placeWebsiteLink">--</a></dd>
                    </div>
                    <div>
                        <dt>Opening Hours</dt>
                        <dd>
                            <ul class="opening-hours" id="placeHours"></ul>
                        </dd>
                    </div>
                </dl>

                <section class="place-reviews" aria-labelledby="placeReviewsTitle">
                    <div class="section-heading">
                        <h4 id="placeReviewsTitle"><i class="fas fa-star-half-alt"></i> Visitor Reviews</h4>
                        <span class="badge muted" id="placeReviewsSummary">--</span>
                    </div>
                    <div class="reviews-stack" id="placeReviewsList"></div>
                    <button id="placeReviewsToggle" class="btn ghost" type="button" hidden>Show more reviews</button>
                </section>

                <section class="user-review" aria-labelledby="userReviewTitle">
                    <h4 id="userReviewTitle"><i class="fas fa-pen-to-square"></i> Share Your Experience</h4>
                    <form id="userReviewForm" novalidate>
                        <div class="form-row">
                            <label for="reviewerName">Name</label>
                            <input id="reviewerName" name="reviewerName" type="text" maxlength="80" placeholder="Optional" autocomplete="name">
                        </div>
                        <div class="form-row">
                            <label for="reviewerRating">Rating</label>
                            <select id="reviewerRating" name="reviewerRating" required>
                                <option value="">Select...</option>
                                <option value="5">5 - Excellent</option>
                                <option value="4">4 - Good</option>
                                <option value="3">3 - Decent</option>
                                <option value="2">2 - Below average</option>
                                <option value="1">1 - Poor</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label for="reviewerText">Review</label>
                            <textarea id="reviewerText" name="reviewerText" rows="3" maxlength="1000" required placeholder="Share your thoughts (min 10 characters)..."></textarea>
                        </div>
                        <div class="form-actions">
                            <span id="reviewFormMessage" class="form-message" role="status" aria-live="polite"></span>
                            <button type="submit" class="btn primary"><i class="fas fa-paper-plane"></i> Submit</button>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    </aside>

    <div class="map-wrapper">
        <div class="map-toolbar">
            <button id="locateMe" class="btn ghost" type="button"><i class="fas fa-location-arrow"></i> Re-centre on Me</button>
            <label for="categorySelect" class="sr-only">Select a category</label>
            <select id="categorySelect" class="category-select"></select>
            <span class="toolbar-text" id="placeCount">Choose a category and share your location for the best matches.</span>
            <button id="refreshData" class="btn ghost" type="button"><i class="fas fa-sync"></i> Refresh Data</button>
        </div>
        <div class="map-hint" id="mapHint"><i class="fas fa-info-circle"></i> Share your location and tap a pin to see place details.</div>
        <div id="map" class="map" role="region" aria-label="Singapore map"></div>
        <div class="map-legend">
            <span><i class="fas fa-location-crosshairs"></i> You</span>
            <span><i class="fas fa-map-marker-alt"></i> Selected Places</span>
        </div>
    </div>
</section>

<section class="card data-viz">
    <div class="card-header">
        <div>
            <h2><i class="fas fa-chart-bar"></i> Data Visualisation</h2>
            <p>Explore ratings distribution by category.</p>
        </div>
    </div>
    <div class="viz-body">
        <canvas id="ratingsChart" height="120"></canvas>
    </div>
</section>

<section class="card reviews">
    <div class="card-header">
        <div>
            <h2><i class="fas fa-comments"></i> Recent Reviews</h2>
            <p>Latest visitor reviews from our places database.</p>
        </div>
    </div>
    <div class="reviews-body">
        <div class="reviews-list" id="reviewsList">
            <div class="empty">Loading reviews...</div>
        </div>
    </div>
</section>
