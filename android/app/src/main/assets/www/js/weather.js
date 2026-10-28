// RootRise weather service integration.
// The device location is requested once when no cached coordinates exist. The Android runtime
// permission is managed by MainActivity; the user's OS setting remains authoritative.
// Forecast is online model data, not a DHT22 reading. Open-Meteo is used for non-commercial demo use.
let locationRequestPending = false;
let locationPermissionDenied = false;
let locationUnavailable = false;
let cachedCoordinates = null;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function describeWeather(code, isDay) {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: 'Clear sky' };
  if (code === 1) return { icon: '🌤️', label: 'Mainly clear' };
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
  if ([51,53,55,56,57].includes(code)) return { icon: '🌦️', label: 'Drizzle' };
  if ([61,63,65,66,67,80,81,82].includes(code)) return { icon: '🌧️', label: 'Rain' };
  if ([71,73,75,77,85,86].includes(code)) return { icon: '🌨️', label: 'Snow' };
  if ([95,96,99].includes(code)) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌤️', label: 'Current conditions' };
}

function nearestHourlyValue(times, values, currentTime) {
  if (!Array.isArray(times) || !Array.isArray(values) || !times.length) return null;
  const target = new Date(currentTime).getTime();
  if (!Number.isFinite(target)) return null;
  let bestIndex = -1, bestDistance = Infinity;
  times.forEach((time, index) => {
    const parsed = new Date(time).getTime(), value = values[index];
    if (Number.isFinite(parsed) && Number.isFinite(value)) {
      const distance = Math.abs(parsed - target);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
  });
  return bestIndex >= 0 && bestDistance <= 90 * 60 * 1000 ? values[bestIndex] : null;
}

async function fetchWeatherAt(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,relative_humidity_2m,weather_code,is_day', hourly: 'precipitation_probability', forecast_days: '1', timezone: 'auto' });
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}.`);
  const data = await response.json(), current = data.current;
  if (!current || !Number.isFinite(current.temperature_2m) || !Number.isFinite(current.relative_humidity_2m)) throw new Error('The weather service returned incomplete current conditions.');
  const rain = nearestHourlyValue(data.hourly?.time, data.hourly?.precipitation_probability, current.time);
  const condition = describeWeather(current.weather_code, current.is_day === 1);
  setText('weatherIcon', condition.icon);
  setText('weatherTemp', Math.round(current.temperature_2m));
  setText('weatherRain', rain === null ? '—' : `${rain}%`);
  setText('weatherHum', `${current.relative_humidity_2m}%`);
  setText('weatherCondition', condition.label);
  setText('updatedAt', `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

async function fetchPlaceName(latitude, longitude) {
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: 'en' });
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Place-name lookup failed.');
  const place = await response.json();
  const parts = [place.city, place.locality, place.principalSubdivision, place.countryName].filter((v, i, all) => v && all.indexOf(v) === i).slice(0, 3);
  if (!parts.length) throw new Error('No nearby place name was returned.');
  return parts.join(', ');
}

function readCachedCoordinates() {
  try {
    const value = JSON.parse(localStorage.getItem('rootrise_weather_coordinates') || 'null');
    if (value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) return value;
  } catch (_) { /* Storage may be disabled. */ }
  return null;
}
function saveCoordinates(latitude, longitude) {
  cachedCoordinates = { latitude, longitude, savedAt: Date.now() };
  try { localStorage.setItem('rootrise_weather_coordinates', JSON.stringify(cachedCoordinates)); } catch (_) { /* Continue in memory. */ }
  window.dispatchEvent(new CustomEvent('rootrise:location-update', { detail: cachedCoordinates }));
}
window.addEventListener('rootrise:native-location', event => {
  const coords = event.detail || {};
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
  locationRequestPending = false;
  locationUnavailable = false;
  saveCoordinates(coords.latitude, coords.longitude);
  updateForecast(coords, false);
});
window.addEventListener('rootrise:native-location-error', event => {
  locationRequestPending = false;
  const status = document.getElementById('weatherStatus');
  if (status) status.textContent = String(event.detail || 'Location is unavailable. Check Android location settings.');
  if (!cachedCoordinates) {
    setText('weatherPlace', 'Location unavailable');
    setText('weatherLocationHeading', 'Location unavailable');
  }
});
async function updateForecast(coords, isRefresh) {
  const status = document.getElementById('weatherStatus');
  try {
    const results = await Promise.allSettled([fetchWeatherAt(coords.latitude, coords.longitude), fetchPlaceName(coords.latitude, coords.longitude)]);
    if (results[0].status === 'rejected') throw results[0].reason;
    const place = results[1].status === 'fulfilled' ? results[1].value : 'Weather near saved location';
    setText('weatherPlace', place);
    setText('weatherLocationHeading', place);
    if (status) status.textContent = `Local forecast · Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (error) {
    if (status) status.textContent = 'Weather temporarily unavailable. Check location permission and internet connection, then try again.';
  }
}

function loadWeatherFromCurrentLocation(isRefresh = false) {
  if (locationRequestPending) return;
  const status = document.getElementById('weatherStatus');
  cachedCoordinates = cachedCoordinates || readCachedCoordinates();

  if (window.RootRiseNative && typeof window.RootRiseNative.postMessage === 'function') {
    if (cachedCoordinates) updateForecast(cachedCoordinates, true);
    setText('weatherPlace', cachedCoordinates ? 'Refreshing your location…' : 'Finding your location…');
    if (status) status.textContent = 'Requesting your phone location…';
    locationRequestPending = true;
    window.RootRiseNative.postMessage(JSON.stringify({ action: 'getPhoneLocation' }));
    return;
  }
  if (!navigator.geolocation) {
    locationUnavailable = true;
    setText('weatherPlace', 'Location unavailable');
    setText('weatherLocationHeading', 'Location unavailable');
    if (status) status.textContent = 'Location is unavailable in this browser. Weather can still be used once location access is supported.';
    if (cachedCoordinates) updateForecast(cachedCoordinates, true);
    return;
  }

  // Show cached weather immediately, then refresh the position so the forecast follows the
  // device if it has moved. A granted OS permission is reused; the app does not request it anew.
  if (cachedCoordinates && isRefresh) updateForecast(cachedCoordinates, true);
  locationRequestPending = true;
  if (!cachedCoordinates) {
    setText('weatherPlace', 'Finding your location…');
    setText('weatherLocationHeading', 'Finding your location…');
    if (status) status.textContent = 'Loading local forecast…';
  }

  navigator.geolocation.getCurrentPosition(async position => {
    const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    saveCoordinates(coords.latitude, coords.longitude);
    locationRequestPending = false;
    await updateForecast(coords, isRefresh);
  }, async error => {
    locationRequestPending = false;
    const messages = {
      1: 'Location access is off. Enable it in app settings to show weather for your current location.',
      2: 'Your device could not determine its location. Check device location services.',
      3: 'Location request timed out. Try again where GPS reception is better.'
    };
    if (error.code === 1) locationPermissionDenied = true;
    if (cachedCoordinates) {
      await updateForecast(cachedCoordinates, true);
      if (status) status.textContent = 'Using the last saved location. Enable location access or refresh to update it.';
    } else {
      setText('weatherPlace', 'Location unavailable');
      setText('weatherLocationHeading', 'Location unavailable');
      if (status) status.textContent = messages[error.code] || 'Could not access your location.';
    }
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: isRefresh ? 15 * 60 * 1000 : 5 * 60 * 1000 });
}

// First load may use cached coordinates immediately, then a geolocation refresh is attempted.
loadWeatherFromCurrentLocation();
// Refresh the forecast and position every 15 minutes. Permission prompts are controlled by the OS;
// if permission is denied, the app falls back to its last saved coordinates.
window.setInterval(() => loadWeatherFromCurrentLocation(true), 15 * 60 * 1000);

// Farm forecast uses coordinates reported by the ESP32 GPS/location integration, never a manual pin.
let lastFarmForecastPoint = null;
let lastFarmForecastAt = 0;
async function updateFarmWeather(latitude, longitude, sourceLabel = 'ESP32 GPS') {
  const placeLabel = document.getElementById('farmWeatherLocation');
  const source = document.getElementById('farmWeatherSource');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (placeLabel) placeLabel.textContent = `GPS ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  if (source) source.textContent = sourceLabel;
  const now = Date.now();
  const moved = !lastFarmForecastPoint || Math.abs(lastFarmForecastPoint.latitude-latitude)>0.03 || Math.abs(lastFarmForecastPoint.longitude-longitude)>0.03;
  if (!moved && now-lastFarmForecastAt < 15*60*1000) return;
  lastFarmForecastPoint = {latitude,longitude}; lastFarmForecastAt = now;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,relative_humidity_2m,weather_code,is_day', hourly: 'precipitation_probability', forecast_days: '1', timezone: 'auto' });
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Farm forecast unavailable');
    const data = await response.json();
    const current = data.current;
    if (!current) throw new Error('No current forecast');
    const rain = nearestHourlyValue(data.hourly?.time, data.hourly?.precipitation_probability, current.time);
    const condition = describeWeather(current.weather_code, current.is_day === 1);
    setText('farmWeatherIcon', condition.icon);
    setText('farmWeatherTemp', Math.round(current.temperature_2m));
    setText('farmWeatherRain', rain == null ? '—' : `${rain}%`);
    setText('farmWeatherHum', `${current.relative_humidity_2m}%`);
    setText('farmWeatherLabel', condition.label);
    if (placeLabel) placeLabel.textContent = `GPS ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  } catch (_) {
    if (placeLabel) placeLabel.textContent = 'Farm forecast unavailable · Check internet';
  }
}
window.updateFarmWeather = updateFarmWeather;
