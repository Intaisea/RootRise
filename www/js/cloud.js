import { firebaseConfig, firebaseConfigured } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const status = document.getElementById('cloudStatus');
const form = document.getElementById('cloudAuthForm');
const email = document.getElementById('cloudEmail');
const password = document.getElementById('cloudPassword');
const name = document.getElementById('cloudName');
const consent = document.getElementById('cloudConsent');
const signup = document.getElementById('cloudSignup');
const login = document.getElementById('cloudLogin');
const logout = document.getElementById('cloudLogout');
const session = document.getElementById('cloudSession');
let auth = null, db = null, consented = false, lastUpload = 0, latestTimer = 0;
function message(text, error = false) { if (status) { status.textContent = text; status.dataset.state = error ? 'error' : 'info'; } }
function profileFromForm() {
  const local = (() => { try { return JSON.parse(localStorage.getItem('rootrise_profile') || '{}'); } catch (_) { return {}; } })();
  return { name: name?.value.trim() || local.name || 'RootRise Farmer', farm: local.farm || document.getElementById('farmInput')?.value.trim() || 'My Farm' };
}
function setSignedIn(user) {
  if (session) session.classList.toggle('hidden', !user);
  if (form) form.classList.toggle('hidden', Boolean(user));
  if (user) { const label = document.getElementById('cloudSignedInAs'); if (label) label.textContent = `Signed in as ${user.email || user.uid}`; }
}
async function syncProfile(user) {
  if (!db || !consented || !user) return;
  const data = profileFromForm();
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email || '', name: data.name, farm: data.farm,
    allowDataSharing: true, consentUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp()
  }, { merge: true });
}
async function syncDevice(detail) {
  if (!auth?.currentUser || !consented || !db || !detail) return;
  const now = Date.now();
  if (now - lastUpload < 60000) { clearTimeout(latestTimer); latestTimer = setTimeout(() => syncDevice(detail), 60000 - (now - lastUpload)); return; }
  lastUpload = now;
  const latest = {
    deviceName: String(detail.deviceName || 'RootRise ESP32'), connected: detail.connected === true,
    transport: String(detail.transport || ''), airTemperature: Number.isFinite(detail.airTemperature) ? detail.airTemperature : null,
    airHumidity: Number.isFinite(detail.airHumidity) ? detail.airHumidity : null,
    soilMoisture: Number.isFinite(detail.soilMoisture) ? detail.soilMoisture : null,
    waterUsedLitres: Number.isFinite(detail.waterUsedLitres) ? detail.waterUsedLitres : null,
    pumpOn: detail.pumpOn === true, pumpSeconds: Number.isFinite(detail.pumpSeconds) ? detail.pumpSeconds : 0,
    farmLatitude: Number.isFinite(detail.latitude) ? detail.latitude : null,
    farmLongitude: Number.isFinite(detail.longitude) ? detail.longitude : null,
    recordedAt: serverTimestamp()
  };
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userRef, { latest, deviceOnline: latest.connected, deviceName: latest.deviceName, lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'telemetry', 'latest'), latest, { merge: true });
  } catch (error) { message(`Sync paused: ${error.message}`, true); }
}
if (!firebaseConfigured) message('Cloud sync is not configured yet. Add your Firebase web config to firebase-config.js.');
else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app);
  onAuthStateChanged(auth, async user => {
    setSignedIn(user);
    consented = false;
    if (!user) { message('Sign in to sync your account and field data securely.'); return; }
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      consented = consent?.checked === true || (snapshot.exists() && snapshot.data().allowDataSharing === true);
      if (consented) { message('Cloud sync is on. Your profile and ESP32 field data are shared with RootRise administrators.'); await syncProfile(user); }
      else message('Signed in. Cloud sharing is off until you opt in using the checkbox and sign in again.');
    } catch (error) { message(`Could not load account: ${error.message}`, true); }
  });
  signup?.addEventListener('click', async () => {
    if (!consent?.checked) { message('Please review and accept the data-sharing consent to create a synced account.', true); return; }
    if (!form?.reportValidity()) return;
    try { const result = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value); consented = true; await syncProfile(result.user); message('Account created and secure sync enabled.'); }
    catch (error) { message(error.message, true); }
  });
  login?.addEventListener('click', async () => {
    if (!form?.reportValidity()) return;
    try {
      const result = await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      const snapshot = await getDoc(doc(db, 'users', result.user.uid));
      if (consent?.checked) { consented = true; await syncProfile(result.user); message('Signed in and data sharing enabled.'); }
      else { consented = consent?.checked === true || (snapshot.exists() && snapshot.data().allowDataSharing === true); message(consented ? 'Signed in. Secure cloud sync is on.' : 'Signed in. Cloud sharing remains off.'); }
    } catch (error) { message(error.message, true); }
  });
  document.getElementById('cloudPause')?.addEventListener('click', async () => {
    if (!auth.currentUser || !db) return;
    try { await setDoc(doc(db, 'users', auth.currentUser.uid), { allowDataSharing: false, consentUpdatedAt: serverTimestamp() }, { merge: true }); consented = false; message('Cloud sharing paused. Existing cloud data is hidden from the admin portal; contact RootRise to request deletion.'); } catch (error) { message(error.message, true); }
  });  logout?.addEventListener('click', async () => { if (auth.currentUser && consented) await setDoc(doc(db, 'users', auth.currentUser.uid), { deviceOnline: false, updatedAt: serverTimestamp() }, { merge: true }); await signOut(auth); message('Signed out.'); });
  window.addEventListener('rootrise:profile-saved', () => { if (auth.currentUser && consented) syncProfile(auth.currentUser).catch(error => message(error.message, true)); });
  window.addEventListener('rootrise:device-update', event => syncDevice(event.detail));
}
