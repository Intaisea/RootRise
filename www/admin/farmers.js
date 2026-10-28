const API = (window.ROOTRISE_API_BASE || '').replace(/\/$/, '');
const $ = id => document.getElementById(id);
let accounts = [];
let activeDetailId = null;

async function request(path, options = {}) {
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function say(text, error = false, target = 'directoryMessage') {
  const element = $(target);
  element.textContent = text;
  element.dataset.error = String(error);
}
function online(account) {
  return account.deviceOnline === true && account.lastSeenAt && Date.now() - new Date(account.lastSeenAt).getTime() < 10 * 60 * 1000;
}
function cell(text, className = '') {
  const element = document.createElement('td');
  element.textContent = text ?? '—';
  if (className) element.className = className;
  return element;
}
function makeButton(text, className, handler) {
  const element = document.createElement('button');
  element.className = className;
  element.type = 'button';
  element.textContent = text;
  element.addEventListener('click', handler);
  return element;
}
function fmt(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function addInfo(label, value) {
  const box = document.createElement('div');
  const key = document.createElement('span');
  const val = document.createElement('strong');
  box.className = 'detail-info';
  key.textContent = label;
  val.textContent = value ?? '—';
  box.append(key, val);
  return box;
}
function addLog(container, title, detail, time) {
  const row = document.createElement('article');
  const copy = document.createElement('div');
  const heading = document.createElement('b');
  const text = document.createElement('p');
  const stamp = document.createElement('time');
  row.className = 'detail-log';
  heading.textContent = title;
  text.textContent = detail;
  stamp.textContent = fmt(time);
  copy.append(heading, text);
  row.append(copy, stamp);
  container.append(row);
}
function render() {
  const query = $('searchFarmers').value.trim().toLowerCase();
  const items = accounts.filter(account => [account.name, account.email, account.farm, account.latest?.deviceName]
    .some(value => String(value || '').toLowerCase().includes(query)));
  $('navCount').textContent = accounts.length;
  $('recordCount').textContent = `${items.length} of ${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  $('directoryTotal').textContent = accounts.length;
  $('directoryFarmers').textContent = accounts.length;
  $('directoryOnline').textContent = accounts.filter(online).length;
  $('directorySharing').textContent = accounts.filter(account => Boolean(account.consentAt)).length;
  const body = $('farmerRows');
  body.replaceChildren();
  if (!items.length) {
    const row = document.createElement('tr');
    const empty = cell(accounts.length ? 'No accounts match this search.' : 'No registered accounts yet.');
    empty.colSpan = 7;
    empty.className = 'empty-cell';
    row.append(empty);
    body.append(row);
    return;
  }
  for (const account of items) {
    const row = document.createElement('tr');
    const who = cell('', 'farmer-cell');
    const name = document.createElement('b');
    const email = document.createElement('small');
    name.textContent = account.name || 'RootRise Farmer';
    email.textContent = account.email || '—';
    who.append(name, email);
    row.append(who,
      cell(account.farm || 'Farm not named'),
      cell(account.latest?.deviceName || account.deviceName || 'No controller'),
      cell(account.latest?.soilMoisture == null ? '—' : `${account.latest.soilMoisture}%`),
      cell(account.latest?.airTemperature == null ? '—' : `${account.latest.airTemperature}°C`));
    const status = cell('');
    const badge = document.createElement('span');
    badge.className = `state${online(account) ? '' : ' offline'}`;
    badge.textContent = !account.consentAt ? 'Not sharing' : online(account) ? 'Online' : 'Offline';
    status.append(badge);
    row.append(status);
    const support = cell('');
    support.className = 'support-actions';
    support.append(makeButton('View details', 'support-btn', () => openDetails(account)));
    support.append(makeButton('Send reset', 'support-btn reset-btn', async event => {
      const resetButton = event.currentTarget;
      resetButton.disabled = true;
      try {
        await request(`/admin/users/${encodeURIComponent(account.id)}/password-reset`, { method: 'POST', body: '{}' });
        resetButton.textContent = 'Sent';
      } catch (error) {
        resetButton.textContent = 'Unavailable';
        say(error.message, true);
      } finally {
        setTimeout(() => { resetButton.disabled = false; resetButton.textContent = 'Send reset'; }, 3500);
      }
    }));
    row.append(support);
    body.append(row);
  }
}
async function openDetails(account) {
  activeDetailId = account.id;
  const dialog = $('farmerDetailDialog');
  $('detailTitle').textContent = account.name || 'Farmer details';
  $('detailProfile').replaceChildren();
  $('detailReadings').replaceChildren();
  $('detailIrrigation').replaceChildren();
  say('Loading account details…', false, 'detailMessage');
  if (!dialog.open) dialog.showModal();
  try {
    const data = await request(`/admin/users/${encodeURIComponent(account.id)}`);
    const user = data.user;
    const latest = user.latest || {};
    const gps = latest.farmLatitude == null || latest.farmLongitude == null
      ? 'Not reported'
      : `${latest.farmLatitude.toFixed(5)}, ${latest.farmLongitude.toFixed(5)}`;
    $('detailProfile').append(
      addInfo('Name', user.name || 'Not provided'),
      addInfo('Email', user.email),
      addInfo('Farm', user.farm || 'Not provided'),
      addInfo('Age', user.age == null ? 'Not provided' : String(user.age)),
      addInfo('Account created', fmt(user.createdAt)),
      addInfo('Last sign-in', fmt(user.lastLoginAt)),
      addInfo('Data sharing', user.consentAt ? `Enabled · ${fmt(user.consentAt)}` : 'Paused / not enabled'),
      addInfo('Controller', user.deviceName || 'Not connected'),
      addInfo('Connection mode', latest.transport || '—'),
      addInfo('Connection', online(user) ? 'Online' : 'Offline'),
      addInfo('Last device update', fmt(user.lastSeenAt)),
      addInfo('Soil moisture', latest.soilMoisture == null ? '—' : `${latest.soilMoisture}%`),
      addInfo('Air temperature', latest.airTemperature == null ? '—' : `${latest.airTemperature}°C`),
      addInfo('Air humidity', latest.airHumidity == null ? '—' : `${latest.airHumidity}%`),
      addInfo('Water used', latest.waterUsedLitres == null ? '—' : `${latest.waterUsedLitres} L`),
      addInfo('Pump', latest.pumpOn == null ? '—' : latest.pumpOn ? 'ON' : 'OFF'),
      addInfo('ESP32 GPS', gps)
    );
    const readings = $('detailReadings');
    if (!data.readings?.length) readings.textContent = user.consentAt ? 'No sensor snapshots received yet.' : 'No sensor snapshots have been received.';
    else data.readings.forEach(record => addLog(readings,
      `${record.deviceName || 'ESP32'} · ${fmt(record.recordedAt)}`,
      `Soil ${record.soilMoisture == null ? '—' : `${record.soilMoisture}%`} · Air ${record.airTemperature == null ? '—' : `${record.airTemperature}°C`} · Humidity ${record.airHumidity == null ? '—' : `${record.airHumidity}%`} · Water ${record.waterUsedLitres == null ? '—' : `${record.waterUsedLitres} L`} · Pump ${record.pumpOn == null ? '—' : record.pumpOn ? 'ON' : 'OFF'} · GPS ${record.farmLatitude == null || record.farmLongitude == null ? '—' : `${record.farmLatitude.toFixed(4)}, ${record.farmLongitude.toFixed(4)}`}`,
      record.recordedAt));
    const events = $('detailIrrigation');
    if (!data.irrigationEvents?.length) events.textContent = user.consentAt ? 'No pump state changes received yet.' : 'No pump state changes have been received.';
    else data.irrigationEvents.forEach(record => addLog(events,
      record.event === 'pump_started' ? 'Pump started' : record.event === 'pump_stopped' ? 'Pump stopped' : 'Irrigation event',
      `Run time ${record.pumpSeconds ?? 0}s · Controller total ${record.waterUsedLitres == null ? '—' : `${record.waterUsedLitres} L`}`,
      record.recordedAt));
    say('Account details loaded. Authentication secrets are excluded.');
  } catch (error) {
    say(error.message, true, 'detailMessage');
  }
}
async function loadAccounts() {
  say('Loading farmer accounts…');
  try {
    const data = await request('/admin/users');
    accounts = data.users || [];
    render();
    $('cloudHealth').textContent = 'Connected · MongoDB';
    say('Directory updated. Passwords and password hashes are never visible to staff.');
  } catch (error) {
    $('cloudHealth').textContent = 'Access unavailable';
    say(error.message, true);
  }
}
async function start() {
  try {
    const { user } = await request('/auth/me');
    if (user.role !== 'admin') { location.replace('index.html'); return; }
    $('adminLabel').textContent = user.email;
    await loadAccounts();
  } catch (_) {
    location.replace('index.html');
  }
}
$('searchFarmers').addEventListener('input', render);
$('refreshFarmers').addEventListener('click', loadAccounts);
$('closeFarmerDetail').addEventListener('click', () => { $('farmerDetailDialog').close(); activeDetailId = null; });
$('farmerDetailDialog').addEventListener('click', event => {
  if (event.target === $('farmerDetailDialog')) { $('farmerDetailDialog').close(); activeDetailId = null; }
});
$('directoryLogout').addEventListener('click', async () => {
  try { await request('/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
  location.replace('index.html');
});
start();
setInterval(async () => {
  if (document.hidden) return;
  await loadAccounts();
  if (activeDetailId && $('farmerDetailDialog').open) {
    const account = accounts.find(item => item.id === activeDetailId);
    if (account) openDetails(account);
  }
}, 30000);
