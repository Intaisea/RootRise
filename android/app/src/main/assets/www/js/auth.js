import './api-config.js';
const API = (window.ROOTRISE_API_BASE || '').replace(/\/$/, '');
const $ = id => document.getElementById(id);
const form = $('cloudAuthForm'), email = $('cloudEmail'), password = $('cloudPassword'), consent = $('cloudConsent'), status = $('cloudStatus');
let user = null, shareEnabled = false, lastSync = 0, pendingSync = null, syncTimer = null;
let lastPumpState = null, lastConnectionState = null, receivedTelemetry = false;

function message(text, error = false) {
  if (status) { status.textContent = text; status.dataset.state = error ? 'error' : 'info'; }
}
function readLocalProfile() {
  try { return JSON.parse(localStorage.getItem('rootrise_profile') || '{}'); } catch (_) { return {}; }
}
function writeLocalProfile(profile) {
  try { localStorage.setItem('rootrise_profile', JSON.stringify(profile)); } catch (_) { /* Device storage may be unavailable. */ }
}
function localProfile() {
  const saved = readLocalProfile();
  return {
    name: $('nameInput')?.value.trim() || saved.name || 'RootRise Farmer',
    farm: $('farmInput')?.value.trim() || saved.farm || 'My Farm',
    age: $('ageInput')?.value.trim() || saved.age || ''
  };
}
function applyAccount(value) {
  const previousId = localStorage.getItem('rootrise_active_user');
  if (previousId && value && previousId !== value.id) localStorage.removeItem('rootrise_profile');
  if (value) {
    localStorage.setItem('rootrise_active_user', value.id);
    window.ROOTRISE_CLOUD_USER_EMAIL = value.email || '';
    const profile = readLocalProfile();
    if (value.consentAt) {
      const synced = { ...profile, name: value.name || 'RootRise Farmer', farm: value.farm || 'My Farm', age: value.age == null ? '' : String(value.age), email: value.email || '', saved: true, cloudSynced: true };
      writeLocalProfile(synced);
      if ($('nameInput')) $('nameInput').value = synced.name;
      if ($('farmInput')) $('farmInput').value = synced.farm;
      if ($('ageInput')) $('ageInput').value = synced.age;
      window.dispatchEvent(new CustomEvent('rootrise:cloud-profile-updated'));
    } else {
      const local = { ...profile, email: value.email || '', cloudSynced: false };
      writeLocalProfile(local);
      if ($('nameInput')) $('nameInput').value = local.name || 'RootRise Farmer';
      if ($('farmInput')) $('farmInput').value = local.farm || 'My Farm';
      if ($('ageInput')) $('ageInput').value = local.age || '';
    }
    window.dispatchEvent(new CustomEvent('rootrise:cloud-profile-updated'));
  } else {
    localStorage.removeItem('rootrise_active_user');
    window.ROOTRISE_CLOUD_USER_EMAIL = '';
  }
  const profileEmail = value?.email || readLocalProfile().email || '';
  if ($('profileEmail')) $('profileEmail').textContent = profileEmail || 'Sign in to sync across devices';
  if ($('accountProfileEmail')) $('accountProfileEmail').textContent = profileEmail || 'Sign in to sync across devices';
}
function setUser(value) {
  user = value || null;
  shareEnabled = Boolean(user?.consentAt);
  applyAccount(user);
  $('cloudAuthForm')?.classList.toggle('hidden', Boolean(user));
  $('cloudSession')?.classList.toggle('hidden', !user);
  if (user) {
    $('cloudSignedInAs').textContent = `Signed in as ${user.email}`;
    $('cloudPause').textContent = shareEnabled ? 'Pause sharing' : 'Enable sharing';
    message(shareEnabled ? 'Signed in. This profile is linked to your RootRise cloud account.' : 'Signed in. Enable sharing to sync profile and farm data across devices.');
  }
}
function apiUnavailableMessage() {
  if (!API && (location.hostname === 'appassets.androidplatform.net' || location.hostname === 'localhost' && location.protocol === 'https:')) {
    return 'The Android app has no backend URL configured. Set the deployed HTTPS API URL in js/api-config.js.';
  }
  return 'Could not connect to RootRise server. Check that the backend URL is reachable.';
}
async function request(path, options = {}) {
  if (!API && location.hostname === 'appassets.androidplatform.net') throw new Error(apiUnavailableMessage());
  const url = `${API}/api${path}`;
  let response;
  try {
    response = await fetch(url, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  } catch (error) {
    if (error instanceof TypeError) throw new Error(API ? 'Could not reach the RootRise backend URL.' : apiUnavailableMessage());
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed. Please try again.');
  return body;
}
async function syncProfile(profile = localProfile()) {
  if (!user || !shareEnabled) return;
  await request('/account/profile', { method: 'PATCH', body: JSON.stringify({ name: profile.name, farm: profile.farm, age: profile.age }) });
  const saved = { ...readLocalProfile(), ...profile, email: user.email, saved: true, cloudSynced: true };
  writeLocalProfile(saved);
  window.dispatchEvent(new CustomEvent('rootrise:profile-cloud-synced'));
}
async function flushDevice(force = false) {
  syncTimer = null;
  if (!user || !shareEnabled || !pendingSync) return;
  if (!force && Date.now() - lastSync < 60000) {
    syncTimer = setTimeout(flushDevice, 60000 - (Date.now() - lastSync));
    return;
  }
  const detail = pendingSync;
  pendingSync = null;
  try {
    await request('/sync', { method: 'POST', body: JSON.stringify({
      deviceName: detail.deviceName, connected: detail.connected, transport: detail.transport,
      airTemperature: detail.airTemperature, airHumidity: detail.airHumidity, soilMoisture: detail.soilMoisture,
      waterUsedLitres: detail.waterUsedLitres, pumpOn: detail.pumpOn, pumpSeconds: detail.pumpSeconds,
      latitude: detail.latitude, longitude: detail.longitude
    }) });
    lastSync = Date.now();
  } catch (error) {
    pendingSync = detail;
    message(`Data sync paused: ${error.message}`, true);
    syncTimer = setTimeout(() => flushDevice(true), 15000);
  }
}
function syncDevice(detail) {
  if (!user || !shareEnabled || !detail) return;
  const hasTelemetry = [detail.airTemperature, detail.airHumidity, detail.soilMoisture, detail.waterUsedLitres].some(Number.isFinite);
  const urgent = (typeof detail.connected === 'boolean' && lastConnectionState !== null && detail.connected !== lastConnectionState)
    || (typeof detail.pumpOn === 'boolean' && lastPumpState !== null && detail.pumpOn !== lastPumpState)
    || (hasTelemetry && !receivedTelemetry);
  if (detail.connected === false) receivedTelemetry = false;
  else if (hasTelemetry) receivedTelemetry = true;
  if (typeof detail.connected === 'boolean') lastConnectionState = detail.connected;
  if (typeof detail.pumpOn === 'boolean') lastPumpState = detail.pumpOn;
  pendingSync = detail;
  if (urgent) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => flushDevice(true), 0);
    return;
  }
  if (syncTimer) return;
  syncTimer = setTimeout(flushDevice, Math.max(0, 60000 - (Date.now() - lastSync)));
}
async function start() {
  try {
    const result = await request('/auth/me');
    setUser(result.user);
    if (shareEnabled) await syncProfile();
  } catch (error) {
    if (!/sign in|expired/i.test(error.message)) message(error.message, true);
    else message('Sign in to connect this app to your cloud account.');
  }
}
$('cloudSignup')?.addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  if (password.value.length < 12) { message('Use a password with at least 12 characters.', true); return; }
  try {
    const profile = localProfile();
    const result = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value, ...profile, shareData: consent.checked }) });
    password.value = '';
    setUser(result.user);
    if (shareEnabled) await syncProfile(profile);
    else { writeLocalProfile({ ...profile, email: result.user.email, saved: true, cloudSynced: false }); window.dispatchEvent(new CustomEvent('rootrise:cloud-profile-updated')); }
    message(shareEnabled ? 'Account created and linked. Your profile and ESP32 data will sync across devices.' : 'Account created. Enable sharing to sync your profile and ESP32 data.');
  } catch (error) { message(error.message, true); }
});
$$('cloudLogin')?.addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  const previousAccountId = localStorage.getItem('rootrise_active_user');
  const localBeforeLogin = localProfile();
  try {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
    password.value = '';
    const profile = previousAccountId && previousAccountId !== result.user.id
      ? { name: 'RootRise Farmer', farm: 'My Farm', age: '' }
      : localBeforeLogin;
    setUser(result.user);
    if (consent.checked && !shareEnabled) {
      await request('/account/consent', { method: 'PATCH', body: JSON.stringify({ shareData: true }) });
      user = { ...result.user, consentAt: new Date().toISOString() };
      shareEnabled = true;
      await syncProfile(profile);
    } else if (shareEnabled) await syncProfile();
    message(shareEnabled ? 'Signed in. Your RootRise profile is synced to this cloud account.' : 'Signed in. Enable sharing to sync your profile across devices.');
  } catch (error) { message(error.message, true); }
});cloudPause')?.addEventListener('click', async () => {
  if (!user) return;
  try {
    if (shareEnabled) {
      await request('/account/sharing', { method: 'DELETE' });
      shareEnabled = false;
      user = { ...user, consentAt: null };
      pendingSync = null;
      lastPumpState = null;
      lastConnectionState = null;
      receivedTelemetry = false;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
      $('cloudPause').textContent = 'Enable sharing';
      message('Sharing paused. New farm readings will no longer sync.');
    } else {
      if (!window.confirm('Enable cloud sync? Your profile details and ESP32 device, sensor, pump, and GPS data will be available to RootRise administrators. Your password is never shared.')) return;
      const profile = localProfile();
      await request('/account/consent', { method: 'PATCH', body: JSON.stringify({ shareData: true }) });
      shareEnabled = true;
      user = { ...user, consentAt: new Date().toISOString() };
      $('cloudPause').textContent = 'Pause sharing';
      await syncProfile(profile);
      message('Sharing enabled. This account now syncs to the cloud on any device.');
    }
  } catch (error) { message(error.message, true); }
});
$('cloudLogout')?.addEventListener('click', async () => {
  try { await request('/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
  setUser(null);
  pendingSync = null;
  lastPumpState = null;
  lastConnectionState = null;
  receivedTelemetry = false;
  lastSync = 0;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  message('Signed out. Sign in with this same account on another device to load your cloud profile.');
});
$('cloudForgot')?.addEventListener('click', async () => {
  const value = email.value.trim();
  if (!value) { message('Enter your account email first, then choose Forgot password.', true); email.focus(); return; }
  try { const result = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: value }) }); message(result.message); }
  catch (error) { message(error.message, true); }
});
window.addEventListener('rootrise:profile-saved', event => syncProfile(event.detail).catch(error => message(error.message, true)));
window.addEventListener('rootrise:device-update', event => syncDevice(event.detail));
start();
