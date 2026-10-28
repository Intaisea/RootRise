/* RootRise device transport and DATA,<temp>,<humidity>,<pump>,<seconds> protocol. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const inAndroidApp = location.hostname === 'appassets.androidplatform.net';
  const hasNativeBridge = Boolean(window.RootRiseNative && typeof window.RootRiseNative.postMessage === 'function');
  function postNative(action, fields = {}) {
    if (!hasNativeBridge) return false;
    window.RootRiseNative.postMessage(JSON.stringify({ action, ...fields }));
    return true;
  }
  const BLE_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const BLE_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const BLE_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  let port = null, reader = null, writer = null, bleDevice = null, bleCharacteristic = null, readTask = null;
  let transport = '', rxBuffer = '', disconnecting = false, lastReading = null, automationLatched = false, automationRunning = false;
  const telemetry = {};
  let lastGpsPoint=null,lastGpsLogAt=0,lastGpsNoFixAt=0;

  function log(message) {
    const box = $('deviceLog');
    if (!box) return;
    box.textContent += `\n[${new Date().toLocaleTimeString()}] ${message}`;
    box.scrollTop = box.scrollHeight;
  }
  function setConnected(on, label = 'RootRise ESP32', kind = '') {
    transport = on ? kind : '';
    const status = $('transportStatus');
    if (status) status.textContent = !on ? 'NO LINK' : kind === 'android-spp' ? 'BLUETOOTH CONNECTED' : kind === 'android-ble' ? 'BLE CONNECTED' : `${kind.toUpperCase()} CONNECTED`;
    const conn = $('connectionText');
    if (conn) conn.textContent = on ? `Controller connected · ${label}` : 'Demo mode · ESP32 not connected';
    const discovery = $('deviceDiscoveryNote');
    if (discovery) discovery.textContent = on ? 'Controller connected. Live readings appear as the ESP32 sends them.' : inAndroidApp ? 'No device connected. Tap Connect Bluetooth and choose Classic SPP for BluetoothSerial firmware.' : 'No device connected. Use USB Serial or Bluetooth LE below to pair a controller.';
    const account = $('accountDeviceStatus');
    if (account) account.textContent = on ? 'Online' : 'Offline';
    const farmBadge = $('farmWeatherSource');
    if (farmBadge) { farmBadge.textContent = on ? 'ONLINE' : 'OFFLINE'; farmBadge.classList.toggle('online', on); farmBadge.classList.toggle('offline', !on); }
    const dot = document.querySelector('.fieldstatus .dot');
    if (dot) dot.classList.toggle('connected', on);
    ['runTimed','pumpOn','pumpOff','refreshDevice'].forEach(id => { const button = $(id); if (button) button.disabled = !on; });
    if ($('disconnectDevice')) $('disconnectDevice').disabled = !on;
    const pumpBadge = $('pumpStatus');
    if (pumpBadge) {
      pumpBadge.textContent = on ? 'CONNECTED · WAITING FOR DATA' : 'OFFLINE';
      pumpBadge.classList.remove('pump-reported-on');
      pumpBadge.classList.add('pump-reported-off');
    }
    const deviceName = kind === 'usb-serial' ? 'RootRise ESP32' : (label || 'RootRise ESP32');
    if ($('connectedDeviceName')) $('connectedDeviceName').textContent = on ? deviceName : 'RootRise-ESP32';
    window.dispatchEvent(new CustomEvent('rootrise:device-update', { detail: {
      connected: on, deviceName, transport: kind || transport
    }}));
    if (!on) { lastReading = null; automationLatched = false; }
    refreshAutomationState();
  }
  function receiveText(text) {
    rxBuffer = (rxBuffer + String(text).replace(/\0/g, '')).slice(-8192);
    const lines = rxBuffer.split(/\r?\n/);
    rxBuffer = lines.pop() || '';
    lines.forEach(parseLine);
  }
  function nmeaCoordinate(value, hemisphere) {
    const raw=Number.parseFloat(value); if (!Number.isFinite(raw) || !hemisphere) return NaN;
    const degrees=Math.floor(raw/100), minutes=raw-degrees*100;
    if (minutes<0 || minutes>=60) return NaN;
    const sign=(hemisphere==='S'||hemisphere==='W')?-1:1;
    return sign*(degrees+minutes/60);
  }
  function publishGps(latitude, longitude, source) {
    if (!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180) return false;
    const moved=!lastGpsPoint||Math.abs(lastGpsPoint.latitude-latitude)>0.001||Math.abs(lastGpsPoint.longitude-longitude)>0.001;
    if(moved||Date.now()-lastGpsLogAt>60000){log('GPS fix '+latitude.toFixed(6)+', '+longitude.toFixed(6)+' ('+source+').');lastGpsLogAt=Date.now();}
    lastGpsPoint={latitude,longitude}; telemetry.latitude=latitude; telemetry.longitude=longitude;
    window.dispatchEvent(new CustomEvent('rootrise:device-update',{detail:{...telemetry,connected:true,deviceName:bleDevice?.name||telemetry.deviceName||'RootRise ESP32',transport,latitude,longitude,gpsSource:source}}));
    return true;
  }
  function markGpsNoFix() {
    if(Date.now()-lastGpsNoFixAt<15000)return;lastGpsNoFixAt=Date.now();
    const status=$('esp32MapStatus');if(status)status.textContent='GPS DATA · NO FIX';
  }
  function parseGpsLine(line) {
    const fields=line.replace(/\*[^*]*$/,'').split(',');
    const head=(fields[0]||'').replace(':', '').replace(/^\$/,'');
    const type=head.slice(-3);
    if (type==='RMC') {
      if (fields[2]!=='A') { markGpsNoFix(); return false; }
      return publishGps(nmeaCoordinate(fields[3],fields[4]),nmeaCoordinate(fields[5],fields[6]),'NMEA RMC');
    }
    if (type==='GGA') {
      if (!(Number(fields[6])>0)) { markGpsNoFix(); return false; }
      return publishGps(nmeaCoordinate(fields[2],fields[3]),nmeaCoordinate(fields[4],fields[5]),'NMEA GGA');
    }
    if (type==='GLL') {
      if (fields[6]!=='A') { markGpsNoFix(); return false; }
      return publishGps(nmeaCoordinate(fields[1],fields[2]),nmeaCoordinate(fields[3],fields[4]),'NMEA GLL');
    }
    if (/^(GPS|LOCATION)$/i.test(head)) {
      const lat=Number.parseFloat(fields[1]),lon=Number.parseFloat(fields[2]);
      return publishGps(lat,lon,'ESP32 GPS line');
    }
    return false;
  }
  function numeric(value) {
    if (value == null || /^(?:|--|n\/a|null|nan|undefined)$/i.test(String(value).trim())) return undefined;
    const match = String(value).trim().replace(/%$/, '').match(/[-+]?(?:\d+\.?\d*|\.\d+)/);
    const parsed = match ? Number.parseFloat(match[0]) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  function renderMetric(id, noteId, value, unit, note, digits = 1) {
    if (!Number.isFinite(value)) return;
    const element = $(id);
    if (element) {
      element.innerHTML = `${Number(value.toFixed(digits))}<small>${unit}</small>`;
      element.closest('.metric')?.classList.remove('unavailable');
    }
    if ($(noteId)) $(noteId).textContent = note;
  }
  function applyTelemetry(values) {
    if (Number.isFinite(values.soilMoisture) && (values.soilMoisture < 0 || values.soilMoisture > 100)) {
      log('Soil value is outside 0–100%; firmware must send calibrated percent, not raw ADC.');
      values = { ...values, soilMoisture: undefined };
    }
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && (typeof value !== 'number' || Number.isFinite(value))) telemetry[key] = value;
    });
    const soil = telemetry.soilMoisture;
    renderMetric('overviewTemp', 'overviewTempNote', telemetry.airTemperature, '°C', 'Latest controller reading');
    renderMetric('overviewHumidity', 'overviewHumidityNote', telemetry.airHumidity, '%', 'Latest controller reading');
    renderMetric('overviewMoisture', 'overviewMoistureNote', soil, '%', 'Latest soil probe reading', 0);
    renderMetric('overviewWater', 'overviewWaterNote', telemetry.waterUsedLitres, ' L', 'Reported by controller');
    const meter = $('overviewMoisture')?.closest('.metric')?.querySelector('.meter span');
    if (meter && Number.isFinite(soil)) meter.style.width = `${Math.max(0, Math.min(100, soil))}%`;
    if (typeof telemetry.pumpOn === 'boolean') {
      const badge = $('pumpStatus');
      if (badge) {
        badge.textContent = telemetry.pumpOn ? `PUMP ON${Number.isFinite(telemetry.pumpSeconds) ? ` · ${telemetry.pumpSeconds}s` : ''}` : 'PUMP OFF';
        badge.classList.toggle('pump-reported-on', telemetry.pumpOn);
        badge.classList.toggle('pump-reported-off', !telemetry.pumpOn);
      }
    }
    const updated = $('updatedAt');
    if (updated) updated.textContent = `Device updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    const detail = { ...telemetry, connected: true, deviceName: bleDevice?.name || telemetry.deviceName || 'RootRise ESP32', transport };
    window.dispatchEvent(new CustomEvent('rootrise:device-update', { detail }));
    if (Number.isFinite(soil)) {
      lastReading = { connected: true, soilMoisture: soil, pumpOn: telemetry.pumpOn === true };
      refreshAutomationState();
      maybeAutomate();
    }
    return detail;
  }
  function fieldText(fields, aliases, index) {
    const keyed = Object.fromEntries(fields.filter(item => /[=:]/.test(item)).map(item => {
      const separator = item.search(/[=:]/);
      const key = item.slice(0, separator);
      const value = item.slice(separator + 1);
      return [key.trim().toLowerCase().replace(/[^a-z]/g, ''), value.trim()];
    }));
    for (const alias of aliases) {
      const normalized = alias.toLowerCase().replace(/[^a-z]/g, '');
      if (Object.hasOwn(keyed, normalized)) return keyed[normalized];
    }
    return fields[index];
  }
  function fieldValue(fields, aliases, index) { return numeric(fieldText(fields, aliases, index)); }
  function parseLine(raw) {
    const line = String(raw).trim();
    if (!line) return;
    log(`RX  ${line}`);
    if (/^ACK,/i.test(line)) { log(`Device: ${line.slice(4)}`); return; }
    if (line.startsWith('$')) { parseGpsLine(line); return; }
    if (/^(GPS|LOCATION)[:,]/i.test(line)) { parseGpsLine(line); return; }
    const soilLabel = line.match(/(?:soil[\s_-]*(?:moisture)?|moisture)\s*(?:reading\s*)?(?:[:=]|\bis\b|\s)\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?/i);
    if (soilLabel && !/^DATA\s*[,;]/i.test(line)) {
      const soil = numeric(soilLabel[1]);
      if (Number.isFinite(soil) && soil >= 0 && soil <= 100) applyTelemetry({ soilMoisture: soil });
      else log('Soil message needs a calibrated 0–100 percent value.');
      return;
    }
    if (line.startsWith('{')) {
      try {
        const data = JSON.parse(line);
        const latitude = numeric(data.latitude ?? data.lat);
        const longitude = numeric(data.longitude ?? data.lon ?? data.lng);
        const values = {
          airTemperature: numeric(data.airTemperature ?? data.temperature ?? data.temp),
          airHumidity: numeric(data.airHumidity ?? data.humidity),
          soilMoisture: numeric(data.soilMoisture ?? data.soil ?? data.moisture),
          waterUsedLitres: numeric(data.waterUsedLitres ?? data.waterUsed ?? data.litres ?? data.water),
          latitude: Number.isFinite(latitude) && Number.isFinite(longitude) ? latitude : undefined,
          longitude: Number.isFinite(latitude) && Number.isFinite(longitude) ? longitude : undefined,
          pumpSeconds: numeric(data.pumpSeconds ?? data.seconds)
        };
        const pump = data.pumpOn ?? data.pump;
        if (pump != null) values.pumpOn = ['1','ON','TRUE','YES'].includes(String(pump).trim().toUpperCase());
        if (Number.isFinite(values.latitude)) publishGps(latitude, longitude, 'JSON GPS');
        if (Object.values(values).some(value => value !== undefined)) applyTelemetry(values);
      } catch (_) { log('Ignored malformed JSON telemetry.'); }
      return;
    }
    const parts = line.split(',').map(value => value.trim());
    const kind = (parts[0] || '').toUpperCase();
    if (kind === 'SOIL' || kind === 'MOISTURE') {
      // RootRise firmware sends SOIL,<raw ADC>,<calibrated percent>.
      // Prefer the last value when both are present; the raw ADC can exceed 100.
      const reported = parts.length >= 3 ? parts[2] : parts[1];
      const soil = numeric(reported?.includes('=') ? reported.split('=').slice(1).join('=') : reported);
      if (Number.isFinite(soil) && soil >= 0 && soil <= 100) applyTelemetry({ soilMoisture: soil });
      else log('Soil message needs a calibrated 0–100 percent value.');
      return;
    }
    if (kind === 'GPS' || kind === 'LOCATION') { parseGpsLine(line); return; }
    if (['TEMP','TEMPERATURE'].includes(kind)) { applyTelemetry({ airTemperature: numeric(parts[1]) }); return; }
    if (['HUMIDITY','AIRHUMIDITY'].includes(kind)) { applyTelemetry({ airHumidity: numeric(parts[1]) }); return; }
    if (['WATER','LITRES','LITERS'].includes(kind)) { applyTelemetry({ waterUsedLitres: numeric(parts[1]) }); return; }
    if (kind === 'PUMP') {
      const value = (parts[1] || '').toUpperCase();
      if (['0','1','ON','OFF','TRUE','FALSE'].includes(value)) applyTelemetry({ pumpOn: ['1','ON','TRUE'].includes(value), pumpSeconds: numeric(parts[2]) });
      return;
    }
    if (!['DATA','SENSOR','READING'].includes(kind)) return;
    if (parts.length < 4 && !line.includes('=')) { log('Ignored malformed DATA line.'); return; }
    const temperature = fieldValue(parts, ['temp','temperature','airtemperature'], 1);
    const humidity = fieldValue(parts, ['humidity','airhumidity'], 2);
    const pumpRaw = String(fieldText(parts, ['pump','pumpon'], 3) || '').trim().toUpperCase();
    const values = {
      airTemperature: temperature,
      airHumidity: humidity,
      soilMoisture: fieldValue(parts, ['soil','moisture','soilmoisture','soil_percent'], 5),
      waterUsedLitres: fieldValue(parts, ['litres','liters','water','waterused','waterusedlitres'], 6),
      pumpSeconds: fieldValue(parts, ['seconds','pumpseconds','runtime'], 4)
    };
    if (['0','1','ON','OFF','TRUE','FALSE','YES','NO'].includes(pumpRaw)) values.pumpOn = ['1','ON','TRUE','YES'].includes(pumpRaw);
    const latitude = fieldValue(parts, ['lat','latitude'], 7);
    const longitude = fieldValue(parts, ['lon','lng','longitude'], 8);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      values.latitude = latitude; values.longitude = longitude;
      publishGps(latitude, longitude, 'DATA GPS fields');
    }
    if (Number.isFinite(values.soilMoisture) && (values.soilMoisture < 0 || values.soilMoisture > 100)) {
      log('Soil value is outside 0–100%; firmware must send calibrated percent, not raw ADC.');
      values.soilMoisture = undefined;
    }
    const snapshot = applyTelemetry(values);
    if (typeof snapshot.pumpOn === 'boolean') {
      const badge = $('pumpStatus');
      if (badge) badge.textContent = snapshot.pumpOn ? `PUMP ON${Number.isFinite(snapshot.pumpSeconds) ? ` · ${snapshot.pumpSeconds}s` : ''}` : 'PUMP OFF';
    }
  }
  function refreshAutomationState() {
    const toggle = $('autoToggle'), status = $('autoStatus'), badge = $('autoBadge');
    if (!toggle) return;
    const ready = Boolean(transport && lastReading && Number.isFinite(lastReading.soilMoisture));
    toggle.disabled = !ready;
    if (!ready && toggle.checked) { toggle.checked = false; automationLatched = false; }
    if (status) status.textContent = !transport ? 'Connect an ESP32 to enable automation' : !ready ? 'Waiting for ESP32 soil moisture (DATA field 6)' : toggle.checked ? 'Armed · monitoring live soil moisture' : 'Ready · automation is off';
    if (badge) { badge.textContent = !transport ? 'OFFLINE' : !ready ? 'NEEDS SOIL DATA' : toggle.checked ? 'ARMED' : 'STANDBY'; badge.classList.toggle('automation-active', Boolean(ready && toggle.checked)); }
  }
  async function maybeAutomate() {
    const toggle = $('autoToggle');
    if (!toggle?.checked || !transport || !lastReading || !Number.isFinite(lastReading.soilMoisture) || automationRunning) return;
    const threshold = Math.min(90, Math.max(5, Number($('autoThreshold')?.value) || 35));
    const soil = lastReading.soilMoisture;
    if (soil > threshold + 5) automationLatched = false;
    if (soil <= threshold && !lastReading.pumpOn && !automationLatched) {
      automationLatched = true; automationRunning = true;
      const duration = [5,10,30,60,120,300].includes(Number($('autoRunDuration')?.value)) ? Number($('autoRunDuration').value) : 10;
      if ($('autoStatus')) $('autoStatus').textContent = `Soil is ${soil}% · starting ${duration}s watering`;
      log(`Automation: soil ${soil}% is at/below ${threshold}%; requesting ${duration}s watering.`);
      await sendCommand(`RUN,${duration}`); automationRunning = false;
    }
  }
  async function sendCommand(command) {
    if (!transport) { log('No device connected.'); return; }
    const bytes = new TextEncoder().encode(`${command}\n`);
    try {
      if (transport.startsWith('android-') && hasNativeBridge) {
        if (!postNative('send', { data: command + String.fromCharCode(10) })) throw new Error('Native transport is not ready');
      } else if (transport === 'usb-serial' && writer) await writer.write(bytes);
      else if (transport === 'ble' && bleCharacteristic) {
        for (let offset = 0; offset < bytes.length; offset += 20) {
          const chunk = bytes.slice(offset, offset + 20);
          if (bleCharacteristic.writeValueWithoutResponse) await bleCharacteristic.writeValueWithoutResponse(chunk);
          else await bleCharacteristic.writeValue(chunk);
        }
      }
      log(`TX  ${command}`);
    } catch (error) { log(`Send error: ${error.message}`); }
  }
  async function readSerial() {
    try {
      reader = port.readable.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) receiveText(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      if (!disconnecting) log(`USB read ended: ${error.message}`);
    } finally {
      try { reader?.releaseLock(); } catch (_) {}
      reader = null;
      if (!disconnecting && transport === 'usb-serial') { setConnected(false); log('USB serial disconnected.'); }
    }
  }
  async function connectSerial() {
    if (inAndroidApp) { if (!postNative('connectUsbSerial')) log('Android connection bridge unavailable. Update Android System WebView.'); return; }
    if (!('serial' in navigator)) {
      log('USB Serial is unavailable in this runtime. Use Chrome or Edge on desktop over HTTPS/localhost; Android WebView requires native USB serial support.');
      return;
    }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      writer = port.writable.getWriter();
      setConnected(true, 'USB Serial', 'usb-serial');
      log('USB serial connected at 115200 baud.');
      readTask = readSerial();
      await sendCommand('GET');
    } catch (error) {
      log(`USB connection failed: ${error.message}`);
      try { if (port?.readable || port?.writable) await port.close(); } catch (_) {}
      port = null;
    }
  }
  async function connectBle() {
    if (inAndroidApp) { if (!postNative('connectBluetooth')) log('Android connection bridge unavailable. Update Android System WebView.'); return; }
    if (!navigator.bluetooth) {
      log('Web Bluetooth is unavailable in this runtime. BLE UART requires Chrome/Edge on a supported HTTPS page and BLE UART firmware.');
      return;
    }
    try {
      bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'RootRise' }, { services: [BLE_SERVICE] }], optionalServices: [BLE_SERVICE] });
      bleDevice.addEventListener('gattserverdisconnected', () => {
        bleCharacteristic = null;
        if (!disconnecting) { setConnected(false); log('Bluetooth disconnected.'); }
      });
      const server = await bleDevice.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE);
      const [rx, tx] = await Promise.all([service.getCharacteristic(BLE_RX), service.getCharacteristic(BLE_TX)]);
      bleCharacteristic = rx;
      await tx.startNotifications();
      tx.addEventListener('characteristicvaluechanged', event => receiveText(new TextDecoder().decode(event.target.value)));
      setConnected(true, bleDevice.name || 'BLE UART', 'ble');
      log(`BLE UART connected${bleDevice.name ? ` to ${bleDevice.name}` : ''}.`);
      await sendCommand('GET');
    } catch (error) { log(`BLE connection failed: ${error.message}`); }
  }
  async function disconnect() {
    if (transport.startsWith('android-') && hasNativeBridge) {
      postNative('disconnect'); setConnected(false); rxBuffer = ''; log('Disconnected.'); return;
    }
    disconnecting = true;
    try { if (reader) await reader.cancel(); } catch (_) {}
    try { writer?.releaseLock(); } catch (_) {}
    writer = null;
    try { if (port) await port.close(); } catch (error) { log(`USB close note: ${error.message}`); }
    port = null;
    try { if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect(); } catch (_) {}
    bleCharacteristic = null;
    rxBuffer = '';
    setConnected(false);
    disconnecting = false;
    log('Disconnected.');
  }
  $('connectSerial')?.addEventListener('click', connectSerial);
  $('connectBle')?.addEventListener('click', connectBle);
  $('disconnectDevice')?.addEventListener('click', disconnect);
  $('runTimed')?.addEventListener('click', () => sendCommand(`RUN,${$('runDuration')?.value || 10}`));
  $('pumpOn')?.addEventListener('click', () => sendCommand('PUMP,1'));
  $('pumpOff')?.addEventListener('click', () => sendCommand('PUMP,0'));
  $('refreshDevice')?.addEventListener('click', () => sendCommand('GET'));
  $('clearDeviceLog')?.addEventListener('click', () => { if ($('deviceLog')) $('deviceLog').textContent = 'Log cleared.'; });
  window.addEventListener('rootrise:native-unavailable', () => {
    const help = $('transportHelp');
    if (help) help.textContent = 'Update Android System WebView to enable secure Bluetooth and USB device access.';
  });
  window.addEventListener('rootrise:native-data', event => receiveText(String(event.detail || '')));
  window.addEventListener('rootrise:native-status', event => {
    const detail = event.detail || {};
    if (detail.connected) {
      setConnected(true, detail.message || 'ESP32', detail.transport || 'android-spp');
      log('Native device connected: ' + (detail.message || detail.transport || 'ESP32') + '.');
      sendCommand('GET');
    } else {
      if (detail.message) log(detail.message);
      if (transport.startsWith('android-')) setConnected(false);
      const status = $('transportStatus');
      if (status && /connecting|searching/i.test(detail.message || '')) status.textContent = 'CONNECTING';
    }
  });  $('autoToggle')?.addEventListener('change', () => { automationLatched = false; refreshAutomationState(); maybeAutomate(); });
  $('autoThreshold')?.addEventListener('change', () => { automationLatched = false; maybeAutomate(); });
  $('autoRunDuration')?.addEventListener('change', refreshAutomationState);
  refreshAutomationState();
  if (inAndroidApp) {
    const usbButton = $('connectSerial');
    if (usbButton) usbButton.style.display = 'none';
    const bluetoothButton = $('connectBle');
    if (bluetoothButton) { bluetoothButton.textContent = 'Connect Bluetooth'; bluetoothButton.classList.remove('secondary'); }
    const help = $('transportHelp');
    if (help) help.textContent = hasNativeBridge
      ? 'Connect your ESP32 over Bluetooth. Pair Bluetooth Classic SPP in Android settings first; choose BLE UART only if your firmware uses BLE UART.'
      : 'Update Android System WebView to enable the app Bluetooth bridge.';
    const protocol = document.querySelector('.device-protocol');
    if (protocol) protocol.insertAdjacentHTML('beforeend', '<br>Soil: calibrated 0–100% in DATA field 6 or SOIL,percent. GPS: forward NMEA GGA/RMC or GPS,latitude,longitude.');
  }
  window.addEventListener('beforeunload', () => { try { if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect(); } catch (_) {} });
  function setMap(frameId, placeholderId, statusId, coords, statusText) {
    const frame = $(frameId), placeholder = $(placeholderId), status = $(statusId);
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
    const delta = 0.01;
    const bounds = `${coords.longitude-delta},${coords.latitude-delta},${coords.longitude+delta},${coords.latitude+delta}`;
    const url = new URL('https://www.openstreetmap.org/export/embed.html');
    url.search = new URLSearchParams({ bbox: bounds, layer: 'mapnik', marker: `${coords.latitude},${coords.longitude}` });
    if (frame) {
      const oldLat=Number(frame.dataset.latitude),oldLon=Number(frame.dataset.longitude);
      const moved=!Number.isFinite(oldLat)||!Number.isFinite(oldLon)||Math.abs(oldLat-coords.latitude)>=0.001||Math.abs(oldLon-coords.longitude)>=0.001;
      if (moved) { frame.src=url.toString(); frame.dataset.latitude=String(coords.latitude); frame.dataset.longitude=String(coords.longitude); }
      frame.parentElement?.classList.add('loaded');
    }
    if (placeholder) placeholder.hidden = true;
    if (status) status.textContent = statusText;
    const link=$(frameId==='esp32FieldMap'?'esp32MapLink':'localMapLink');
    if(link){link.href='https://maps.google.com/?q='+encodeURIComponent(coords.latitude+','+coords.longitude);link.setAttribute('aria-disabled','false');link.setAttribute('aria-label','Open map at '+coords.latitude.toFixed(5)+', '+coords.longitude.toFixed(5));}
  }
  function updateLocalMap(coords) { setMap('localFieldMap','localMapPlaceholder','localMapStatus',coords,'Near your saved location'); }
  function updateEsp32Map(coords) { setMap('esp32FieldMap','esp32MapPlaceholder','esp32MapStatus',coords,'GPS FIX'); }
  ['esp32MapLink','localMapLink'].forEach(id=>$(id)?.addEventListener('click',event=>{if(event.currentTarget.getAttribute('aria-disabled')==='true')event.preventDefault();}));
  window.addEventListener('rootrise:location-update', event => updateLocalMap(event.detail));
  window.addEventListener('rootrise:device-update', event => {
    const device = event.detail || {};
    if (Number.isFinite(device.latitude) && Number.isFinite(device.longitude)) updateEsp32Map(device);
  });
  try { updateLocalMap(JSON.parse(localStorage.getItem('rootrise_weather_coordinates') || 'null')); }
  catch (_) { /* Location is optional; weather.js owns location access. */ }
})();








