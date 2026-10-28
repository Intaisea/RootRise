# RootRise — Smart Irrigation Demo (v1.9)

Mobile-first prototype for the RootRise smart-irrigation project. It includes Dark/Light themes, animated Home/My Account navigation, a locally saved demo profile, an expanded crop-water planning selector, location-based Open-Meteo forecast data, and a device-first empty state.

## Source layout
- `www/index.html` — page structure and screen content.
- `www/css/styles.css` — layout, design tokens, theme palettes, responsive rules and animations.
- `www/js/app.js` — navigation, theme, local profile and crop-water estimates.
- `www/js/weather.js` — location permission, cached coordinates, place-name lookup and forecast refresh.
- `android/app/src/main/assets/www/` — matching web files loaded by Android WebView.
- `backend/` — Node.js authentication, MongoDB storage, admin dashboard API and password-reset email.
- `MONGODB_SETUP.md` — local/production setup instructions.

## Run
Open the `android/` folder in Android Studio, use JDK 17, wait for Gradle sync, then run on a device/emulator.

## Location permission behaviour
On Android, the OS permission remains controlled by the user and can be revoked at any time. After permission is granted, this version caches the coordinates locally and reuses them for each 15-minute forecast refresh, so it does not repeatedly call the location permission flow. The location can become stale if the user travels; clear the app's local data or add a future “Refresh location” control to update it. This is not background location tracking.

## Important limitations
- Optional account sign-in and cross-device sync use the MongoDB API in `backend/` when it is deployed and configured. Passwords are stored as Argon2id hashes, never plaintext. Email ownership verification is not implemented; enable SMTP password reset and verify admin emails before production use.
- ESP32 discovery and live sensor updates are not implemented. The app can display real data once firmware and a transport/backend protocol are implemented. Merely installing the APK will not automatically discover an ESP32.
- Sensor readings, water usage, irrigation history and pump controls remain unavailable until real device integration.
- Crop water rates are illustrative planning estimates in L/m²/day, not agronomic prescriptions. Validate them against local agriculture guidance, crop stage, soil, rainfall and irrigation efficiency.
- Weather is forecast/model data, not the farm's DHT22 measurement. Review Open-Meteo attribution and licensing before public/commercial release.


## v1.9 polish
- Improved light-mode text contrast in form inputs, placeholders, profile labels, tags, and notices.
- Removed the awkward location-permission reassurance text; weather status is now concise.
- Location permission remains controlled by Android/browser settings; coordinates are cached for forecast refreshes.


## v2.0 visual polish
- Dark mode is the default for users upgrading into this theme-default version; future theme choices are remembered.
- Improved light-mode contrast for metric values, weather details, recommendation totals, secondary labels, notices, and field setup.
- Weather location is still based on device permission and cached coordinates; this release does not change Android permission policy.


## v2.1: Farm location and field detail UI
- Dashboard now separates phone/local forecast from farm forecast. The farm forecast remains unavailable until an ESP32 integration supplies GPS coordinates.
- Intended device integration event: `window.dispatchEvent(new CustomEvent('rootrise:device-update', { detail: { connected: true, deviceName: 'RootRise ESP32', latitude: 26.1, longitude: 91.7, soilMoisture: 42, airTemperature: 29, airHumidity: 74, calibrated: false } }))`. Replace sample coordinates with GPS coordinates from a supported GPS module. This snippet documents the interface only; it is not a real device connection.
- ESP32 boards without a GPS module cannot determine their own coordinates. For automatic location, hardware must include GPS or a configured location service; the farmer does not manually enter a pin in this design.
- Field details modal supports soil moisture, air temperature/humidity, next watering, last watering, and automatic watering state. Live values remain blank until provided by the controller/backend.
- Actual discovery, authenticated device pairing, cloud streaming, and pump commands are not implemented by this UI-only build.

## v2.2: Location and weather error fix
- Fixed a missing weather-condition element that caused `Cannot set properties of null (setting 'textContent')` during forecast rendering.
- Removed duplicate HTML IDs for the location label and split the section heading and card place label into unique IDs.
- Weather UI updates now safely ignore absent optional elements rather than throwing a null-reference error.
- The app now refreshes geolocation during the 15-minute refresh cycle so the local forecast can follow device movement. It falls back to saved coordinates if a fresh location fix fails; OS permission decisions remain in control.
- Farm weather still waits for actual coordinates supplied by the ESP32 integration. This patch does not itself implement ESP32 GPS hardware or pairing.

## v2.3 — weather and irrigation history
- The farm weather badge starts as **OFFLINE** and changes to **ONLINE** only when the device bridge dispatches a connected-device update.
- The Weather history panel requests archived daily weather from the Open-Meteo archive API for the phone's saved location (yesterday or the previous seven days). This is outdoor weather archive data, not a sensor log.
- Field sensor snapshots and watering events are stored locally only when a connected device update includes actual values. No sample sensor history is generated.
- History is currently local to this app installation. Cross-device history requires the planned authenticated cloud database/backend.
- Device integration event contract: dispatch `new CustomEvent('rootrise:device-update', { detail: { connected: true, deviceName: 'RootRise ESP32', latitude: 0, longitude: 0, fieldName: 'Field 01', soilMoisture: 42, airTemperature: 28, airHumidity: 68, waterUsedLitres: 186, irrigationEvent: { title: 'Irrigation completed', durationMinutes: 12, waterLitres: 30 } } })` from the future ESP32 bridge. Replace example numbers with values actually received from hardware. `latitude` and `longitude` must be real GPS/location coordinates. This browser event is an integration contract, not automatic ESP32 discovery by itself.


## v2.8 — Separate farm history
- Weather History remains dedicated to archived outdoor forecast data.
- A separate **Sensor & irrigation history** action is available in the irrigation-system section.
- The new history panel has Today, Yesterday, 7 days, and 30 days filters for locally stored ESP32 sensor snapshots and watering events.
- Empty states explicitly say when real device records have not been received. It does not fabricate measurements.
- Device records are currently stored locally; cross-device cloud sync requires backend integration.

## v3.1 integrated device dashboard
- Preserves the v3.1 weather, account/profile, crop-water recommendation, field details, and local weather/sensor/irrigation history.
- Adds the friend prototype's live DATA stream, DHT temperature/humidity display, pump state, timed watering, GET/PUMP/RUN serial commands, USB Serial connection, BLE UART connection, and field map.
- The expected device line format is `DATA,temp,humidity,pump,seconds` terminated by a newline. Commands are `GET`, `PUMP,0`, `PUMP,1`, and `RUN,seconds`, each terminated by a newline. Baud rate for USB serial is 115200.
- Web Serial works only in supported Chromium browsers on HTTPS or localhost. Web Bluetooth needs a secure supported browser and BLE UART firmware using the Nordic UART service UUIDs in `www/js/irrigation.js`. Bluetooth Classic SPP does not work through Web Bluetooth.
- The Android WebView build does not expose Web Serial or BLE. Its buttons report the limitation; Android USB/Bluetooth needs a native transport bridge and matching firmware. The screenshot supplied by the user displays `No link`, so it does not establish that a serial device was actually connected.
- Sensor history records only received values. Soil moisture and water usage remain blank unless firmware sends them through a future extended protocol. Pump safety/calibration automation is not enabled.
- `www/` is the editable web source; Android WebView loads its mirrored copy at `android/app/src/main/assets/www/`.

## v3.2 dashboard polish
- Paired the phone-location forecast with its map and the farm forecast with a separate ESP32 field map. The ESP32 map stays empty until the controller reports real GPS coordinates.
- A successful USB/BLE connection now creates a connected field card in “Your irrigation system”; it shows link state, sensor readings, pump state, and last-update time. Disconnects retain the last received values and mark the card offline.
- The current five-field line `DATA,temp,humidity,pump,seconds` updates temperature, humidity, timer and pump status. Optional fields 6–9 can provide `soil,litres,latitude,longitude`; absent values are labelled as not reported.
- Pump command strings remain `PUMP,1` and `PUMP,0`, as in the friend prototype. The blue pump indicator follows a device-reported pump state; this UI cannot verify the relay itself. Firmware must connect these commands to the actual relay GPIO and report `pump=1` when on.
- The revised controller cards and location maps are mirrored between `www/` and the Android asset copy.

## v3.3 account and theme refinement
- Kept the existing dark palette and replaced the light palette with warm ivory surfaces, forest-green actions, restrained shadows, and higher-contrast text. The logo uses a single dark-green R in light mode.
- Removed the subscription/plan card and the duplicate preferences card. Added a persistent language selector for English, Hindi, Bengali, Tamil, and Punjabi; core navigation, dashboard, device, and account labels change with the selected language.
- “Configure device” opens Home and scrolls to the existing USB Serial / Bluetooth LE connection panel. Account device status and connection mode follow the active transport.
- Existing placeholder email data (`demo@rootrise.local`) is displayed as “No email added” and is not copied into the email field.


## v3.4 dashboard and automation
- Overview cards now wrap to a readable grid instead of shrinking into a single row; local-weather and ESP32 maps sit side-by-side on wider screens, with paired cards on small screens.
- BLE chooser accepts RootRise device names or the Nordic UART service; RX/TX characteristic discovery runs concurrently to reduce connection setup work.
- Smart watering can be explicitly armed with a moisture threshold and bounded run duration. It only sends RUN when a live soil value is at/below threshold and the pump is reported off, and it requires soil to recover by 5 percentage points before another cycle. Disconnect resets automation.
- Automation requires ESP32 soil moisture in DATA field 6. Water usage requires field 7, GPS latitude/longitude fields 8-9. The original five-field firmware line cannot provide those values, so they remain clearly unavailable until firmware sends them. The app can issue relay commands but cannot verify physical relay wiring.
- Updated browser files are mirrored in the Android asset directory. JavaScript syntax and duplicate static-ID checks passed.


## v3.5 location and history
- Combined the two location views into one locations dashboard, with ESP32 farm location first and the phone location below it.
- USB/BLE accepts valid NMEA GGA/RMC fixes and direct GPS,latitude,longitude or LOCATION,latitude,longitude lines, in addition to latitude/longitude in DATA fields 8-9. NMEA must be forwarded by the ESP32 to the selected serial/BLE connection; the browser cannot read the GPS module UART pins directly. Forecast requests are limited to one per 15 minutes per nearby location, and the field map reloads only after meaningful movement.
- Sensor & irrigation history now has Today and Yesterday in six-hour blocks, plus 7 days, month, 6 months, and all saved records. Device snapshots are stored at most once every 15 minutes rather than on every serial update.
- Soil moisture and water use require physical sensors: a capacitive analog soil-moisture probe with dry/wet calibration, and an inline pulse flow meter for delivered water. Firmware must emit DATA,temp,humidity,pump,seconds,soil_percent,water_litres,latitude,longitude. Confirm ESP32 pin compatibility and signal voltage before wiring; some flow-meter variants output 5 V pulses and must not drive a 3.3 V GPIO directly. Use a level shifter/divider where required.
- This project copy has no Arduino/ESP32 firmware or pin assignments. Wiring-specific firmware needs the exact board, sensor models, and pin map.


## v3.6 map, GPS and field-log cleanup
- Field detail now compacts previously saved sensor snapshots into one latest reading per 15-minute interval, migrates the old duplicated localStorage rows, and caps the visible list to the latest 12 entries. The list refreshes only while its history dialog is open.
- The map UI uses a single app-friendly location card, GPS status badges, coordinate-aware Open map actions, and launches Google Maps externally from the Android WebView shell.
- GPS input recognizes NMEA GGA, GLL, and RMC (the GY-GPS6MU2 / NEO-6 defaults include these); it also accepts GPS/LOCATION comma or colon lines, JSON coordinates, or DATA fields 8-9. A no-fix NMEA message now changes the map badge so lack of satellites is distinguishable from no GPS data reaching the app.
- Dark colors shifted to ink teal and muted sage. No firmware sketch is present here; the ESP32 must read the GPS UART and forward NMEA/coordinates to the connected USB/BLE stream. Check the GPS UART default baud (typically 9600 for NEO-6), correct TX-to-RX wiring, and outdoor satellite visibility.

## v3.9 native Android device connections
- The Android WebView now exposes a local-only RootRiseNative bridge to the app's device panel. Android can connect Bluetooth Classic SPP (the original ESP32 BluetoothSerial firmware), BLE UART (the Nordic UART service), and supported USB OTG serial adapters at 115200 baud.
- Bluetooth Classic requires the ESP32 to be paired in Android Bluetooth settings first. Android BLE scanning and connection permissions are requested when needed. USB requires a phone/tablet with USB host/OTG support and Android's USB permission prompt.
- Native input is passed to the existing DATA/NMEA parser; GET, PUMP, and RUN commands are written to the selected native transport. The app does not restart the pump after reconnecting.
- The Android BLE path expects the Nordic UART UUIDs already used by the website. Bluetooth Classic SPP expects the standard Serial Port Profile UUID.
- USB adapter support comes from usb-serial-for-android 3.11.0 (CDC/ACM, FTDI, CP210x, CH340 and supported PL2303 devices). This dependency is resolved from JitPack. OTG and the particular ESP32 USB bridge still need a hardware check.
- The phone-location map remains based on Android location permission. The ESP32 field map still requires the ESP32 firmware to read the GPS module and forward NMEA or GPS,latitude,longitude lines over the selected connection. The project ZIP contains no ESP32 sketch.
- Android native transport changes require rebuilding and reinstalling the APK; editing www alone cannot add Android Bluetooth or USB APIs.

## Android build and device setup
1. Open the `android/` folder in Android Studio, use JDK 17, and let Gradle sync. The project includes a Gradle 8.9 wrapper and pins the distribution checksum.
2. Build and install the debug APK with `gradlew.bat :app:assembleDebug` (or Android Studio > Build > Build APK(s)). The APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.
3. For the existing `BluetoothSerial` firmware, pair the ESP32 in Android Bluetooth settings first. In the app choose Connect ESP32 Bluetooth > Bluetooth Classic SPP, then select the paired board. For the BLE sketch, choose BLE UART and allow Nearby devices.
4. For a wired connection, connect the ESP32 to an Android USB OTG host adapter, tap Connect USB Serial, and grant access to the selected serial device. The library supports common CDC/ACM, CP210x, CH340, FTDI, and supported PL2303 adapters.
5. Pump and sensor cards update only when firmware sends the expected newline-terminated DATA protocol. The ESP32 firmware must read the GPS module and forward valid NMEA or coordinates for the farm map; the phone map uses Android location permission.

Native Bluetooth and USB flows have been compiled against Android 35 APIs and their libraries. This environment has no attached ESP32/Android device, so pairing, OTG hardware, GPS forwarding, and relay switching still require a device-side smoke check.

## v2.0 Android Bluetooth and sensor update
- Android app connection panel now presents Bluetooth as the connection action; its desktop-only USB Serial button is hidden in the APK. The app supports Bluetooth Classic SPP for ESP32 `BluetoothSerial` firmware and BLE UART for firmware using the Nordic UART service.
- Classic SPP tries the standard secure RFCOMM socket and falls back to insecure RFCOMM if the secure attempt fails. BLE reports a successful link only after it finds the UART characteristics and enables TX notifications.
- Telemetry parser accepts the existing CSV `DATA,temp,humidity,pump,seconds[,soil,litres,lat,lon]`, keyed CSV fields (for example `DATA,temp=24.5,humidity=60,pump=0,seconds=0,soil=42`), JSON sensor messages, individual `SOIL,percent` / `MOISTURE,percent` messages, and NMEA GGA/GLL/RMC or `GPS,latitude,longitude` location lines. Lines must end with a newline; partial Bluetooth notifications are buffered until complete.
- Soil values outside 0–100 are rejected with a log message. The ESP32 firmware must convert calibrated dry/wet probe readings to percent before sending them; raw analog ADC counts are not soil percentages. Water used likewise requires a flow meter and a litres value from firmware.
- The Android asset copy is the app source of truth for this release. This project folder does not include an ESP32 `.ino` sketch, so GPS UART reading, soil calibration, relay behavior, and sensor wiring cannot be changed here. The firmware should forward GPS NMEA sentences or `GPS,lat,lon` and the calibrated telemetry line over Bluetooth.
- Android app version is 2.0 (versionCode 7). Rebuild the APK after syncing Gradle; installing it over the prior v1.9 APK requires the same signing key.
