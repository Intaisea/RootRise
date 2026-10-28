/* RootRise app interactions
 * This file handles navigation, theme preferences, profile details, irrigation demo controls,
 * and crop-water estimates. Real ESP32/cloud integration is intentionally not simulated here.
 */
'use strict';

let automation = true;
const sprinklers = { 1: false, 2: false };
let toastTimer;

/** Switch between the Home and My Account screens. */
function showPage(which) {
  const isHome = which === 'home';
  const nextPage = document.getElementById(isHome ? 'homePage' : 'accountPage');
  const oldPage = document.querySelector('.page.active');
  if (oldPage && oldPage !== nextPage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    oldPage.classList.add('page-leaving');
    window.setTimeout(() => oldPage.classList.remove('page-leaving'), 360);
  }
  document.getElementById('homePage')?.classList.toggle('active', isHome);
  document.getElementById('accountPage')?.classList.toggle('active', !isHome);
  nextPage?.classList.remove('page-leaving');
  document.getElementById('homeTab')?.classList.toggle('active', isHome);
  document.getElementById('accountTab')?.classList.toggle('active', !isHome);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove('show'), 2600);
}

const languageCatalog = {
  en: { home:'Home', myAccount:'My Account', todayOverview:'Today’s overview', irrigationSystem:'Your irrigation system', deviceConnection:'Device connection', personalDetails:'Personal details', fullName:'Full name', emailAddress:'Email address', ageOptional:'Age (optional)', farmName:'Farm / village name', saveProfile:'Save profile', farmProfile:'Farm profile', farmVillage:'Farm / village', age:'Age', profileStatus:'Profile status', editDetails:'Edit personal details ↑', deviceSetup:'Device setup', esp32Controller:'ESP32 controller', connectionMode:'Connection mode', sensorCalibration:'Sensor calibration', requiredBeforeUse:'Required before field use', configureDevice:'Configure device', appPreferences:'App preferences', interface:'Interface', theme:'RootRise theme', language:'Language', dataStorage:'Data storage', savedOnDevice:'Saved on this device', resetProfile:'Reset profile', soilMoisture:'Soil moisture', waterUsed:'Water used', fieldDetails:'Field details', sensorTemperature:'Sensor temperature', airHumidity:'Air humidity', devicesOnline:'Devices online', connectUsb:'Connect USB Serial', connectBle:'Connect Bluetooth LE', pumpControl:'Pump control', timedWatering:'Timed watering', runTimed:'Run timed watering', turnPumpOn:'Turn pump ON', stopPump:'Stop pump', refreshReadings:'Refresh readings', liveSensorStream:'Live sensor stream', online:'Online', offline:'Offline', notConnected:'Not connected', notAdded:'Not added', notSaved:'Not saved' },
  hi: { home:'होम', myAccount:'मेरा खाता', todayOverview:'आज का सारांश', irrigationSystem:'आपकी सिंचाई प्रणाली', deviceConnection:'डिवाइस कनेक्शन', personalDetails:'व्यक्तिगत जानकारी', fullName:'पूरा नाम', emailAddress:'ईमेल पता', ageOptional:'आयु (वैकल्पिक)', farmName:'खेत / गाँव का नाम', saveProfile:'प्रोफ़ाइल सहेजें', farmProfile:'खेत की जानकारी', farmVillage:'खेत / गाँव', age:'आयु', profileStatus:'प्रोफ़ाइल स्थिति', editDetails:'जानकारी बदलें ↑', deviceSetup:'डिवाइस सेटअप', esp32Controller:'ESP32 नियंत्रक', connectionMode:'कनेक्शन माध्यम', sensorCalibration:'सेंसर अंशांकन', requiredBeforeUse:'खेत में उपयोग से पहले आवश्यक', configureDevice:'डिवाइस कनेक्ट करें', appPreferences:'ऐप सेटिंग', interface:'इंटरफ़ेस', theme:'RootRise थीम', language:'भाषा', dataStorage:'डेटा संग्रह', savedOnDevice:'इस डिवाइस पर सहेजा गया', resetProfile:'प्रोफ़ाइल रीसेट करें', soilMoisture:'मिट्टी की नमी', waterUsed:'इस्तेमाल किया पानी', fieldDetails:'खेत का विवरण', sensorTemperature:'सेंसर तापमान', airHumidity:'हवा की नमी', devicesOnline:'ऑनलाइन डिवाइस', connectUsb:'USB सीरियल जोड़ें', connectBle:'Bluetooth LE जोड़ें', pumpControl:'पंप नियंत्रण', timedWatering:'पानी देने का समय', runTimed:'समयबद्ध सिंचाई शुरू करें', turnPumpOn:'पंप चालू करें', stopPump:'पंप रोकें', refreshReadings:'रीडिंग रीफ़्रेश करें', liveSensorStream:'लाइव सेंसर डेटा', online:'ऑनलाइन', offline:'ऑफ़लाइन', notConnected:'कनेक्ट नहीं है', notAdded:'नहीं जोड़ी गई', notSaved:'सहेजा नहीं गया' },
  bn: { home:'হোম', myAccount:'আমার অ্যাকাউন্ট', todayOverview:'আজকের সারাংশ', irrigationSystem:'আপনার সেচ ব্যবস্থা', deviceConnection:'ডিভাইস সংযোগ', personalDetails:'ব্যক্তিগত তথ্য', fullName:'পুরো নাম', emailAddress:'ইমেল ঠিকানা', ageOptional:'বয়স (ঐচ্ছিক)', farmName:'খামার / গ্রামের নাম', saveProfile:'প্রোফাইল সংরক্ষণ', farmProfile:'খামারের তথ্য', farmVillage:'খামার / গ্রাম', age:'বয়স', profileStatus:'প্রোফাইলের অবস্থা', editDetails:'ব্যক্তিগত তথ্য সম্পাদনা ↑', deviceSetup:'ডিভাইস সেটআপ', esp32Controller:'ESP32 কন্ট্রোলার', connectionMode:'সংযোগের ধরন', sensorCalibration:'সেন্সর ক্যালিব্রেশন', requiredBeforeUse:'ক্ষেতে ব্যবহারের আগে প্রয়োজন', configureDevice:'ডিভাইস সংযোগ করুন', appPreferences:'অ্যাপ পছন্দ', interface:'ইন্টারফেস', theme:'RootRise থিম', language:'ভাষা', dataStorage:'ডেটা সংরক্ষণ', savedOnDevice:'এই ডিভাইসে সংরক্ষিত', resetProfile:'প্রোফাইল রিসেট', soilMoisture:'মাটির আর্দ্রতা', waterUsed:'ব্যবহৃত পানি', fieldDetails:'খেতের বিবরণ', sensorTemperature:'সেন্সরের তাপমাত্রা', airHumidity:'বাতাসের আর্দ্রতা', devicesOnline:'অনলাইন ডিভাইস', connectUsb:'USB সিরিয়াল সংযোগ', connectBle:'Bluetooth LE সংযোগ', pumpControl:'পাম্প নিয়ন্ত্রণ', timedWatering:'সময় নির্ধারিত সেচ', runTimed:'সময়মতো সেচ চালান', turnPumpOn:'পাম্প চালু করুন', stopPump:'পাম্প বন্ধ করুন', refreshReadings:'রিডিং রিফ্রেশ', liveSensorStream:'লাইভ সেন্সর ডেটা', online:'অনলাইন', offline:'অফলাইন', notConnected:'সংযুক্ত নয়', notAdded:'যোগ করা হয়নি', notSaved:'সংরক্ষিত নয়' },
  ta: { home:'முகப்பு', myAccount:'என் கணக்கு', todayOverview:'இன்றைய நிலவரம்', irrigationSystem:'உங்கள் நீர்ப்பாசன அமைப்பு', deviceConnection:'சாதன இணைப்பு', personalDetails:'தனிப்பட்ட விவரங்கள்', fullName:'முழுப் பெயர்', emailAddress:'மின்னஞ்சல் முகவரி', ageOptional:'வயது (விருப்பம்)', farmName:'பண்ணை / ஊர் பெயர்', saveProfile:'சுயவிவரத்தைச் சேமி', farmProfile:'பண்ணை விவரம்', farmVillage:'பண்ணை / ஊர்', age:'வயது', profileStatus:'சுயவிவர நிலை', editDetails:'விவரங்களைத் திருத்து ↑', deviceSetup:'சாதன அமைப்பு', esp32Controller:'ESP32 கட்டுப்படுத்தி', connectionMode:'இணைப்பு முறை', sensorCalibration:'சென்சார் அளவுத்திருத்தம்', requiredBeforeUse:'பயன்பாட்டிற்கு முன் தேவை', configureDevice:'சாதனத்தை இணை', appPreferences:'செயலி விருப்பங்கள்', interface:'இடைமுகம்', theme:'RootRise தோற்றம்', language:'மொழி', dataStorage:'தரவு சேமிப்பு', savedOnDevice:'இந்தச் சாதனத்தில் சேமிக்கப்பட்டது', resetProfile:'சுயவிவரத்தை மீட்டமை', soilMoisture:'மண் ஈரப்பதம்', waterUsed:'பயன்படுத்திய நீர்', fieldDetails:'வயல் விவரம்', sensorTemperature:'சென்சார் வெப்பநிலை', airHumidity:'காற்று ஈரப்பதம்', devicesOnline:'இணைந்த சாதனங்கள்', connectUsb:'USB Serial இணை', connectBle:'Bluetooth LE இணை', pumpControl:'பம்ப் கட்டுப்பாடு', timedWatering:'நேரக் கட்டுப்பாட்டு பாசனம்', runTimed:'நேரப் பாசனத்தைத் தொடங்கு', turnPumpOn:'பம்பை இயக்கு', stopPump:'பம்பை நிறுத்து', refreshReadings:'அளவீடுகளைப் புதுப்பி', liveSensorStream:'நேரடி சென்சார் தரவு', online:'இணைந்துள்ளது', offline:'இணைப்பில்லை', notConnected:'இணைக்கப்படவில்லை', notAdded:'சேர்க்கப்படவில்லை', notSaved:'சேமிக்கப்படவில்லை' },
  pa: { home:'ਮੁੱਖ ਪੰਨਾ', myAccount:'ਮੇਰਾ ਖਾਤਾ', todayOverview:'ਅੱਜ ਦੀ ਝਲਕ', irrigationSystem:'ਤੁਹਾਡਾ ਸਿੰਚਾਈ ਸਿਸਟਮ', deviceConnection:'ਡਿਵਾਈਸ ਕਨੈਕਸ਼ਨ', personalDetails:'ਨਿੱਜੀ ਵੇਰਵੇ', fullName:'ਪੂਰਾ ਨਾਮ', emailAddress:'ਈਮੇਲ ਪਤਾ', ageOptional:'ਉਮਰ (ਵਿਕਲਪਿਕ)', farmName:'ਖੇਤ / ਪਿੰਡ ਦਾ ਨਾਮ', saveProfile:'ਪ੍ਰੋਫ਼ਾਈਲ ਸੰਭਾਲੋ', farmProfile:'ਖੇਤ ਦੀ ਜਾਣਕਾਰੀ', farmVillage:'ਖੇਤ / ਪਿੰਡ', age:'ਉਮਰ', profileStatus:'ਪ੍ਰੋਫ਼ਾਈਲ ਸਥਿਤੀ', editDetails:'ਵੇਰਵੇ ਸੋਧੋ ↑', deviceSetup:'ਡਿਵਾਈਸ ਸੈੱਟਅੱਪ', esp32Controller:'ESP32 ਕੰਟਰੋਲਰ', connectionMode:'ਕਨੈਕਸ਼ਨ ਮੋਡ', sensorCalibration:'ਸੈਂਸਰ ਕੈਲੀਬ੍ਰੇਸ਼ਨ', requiredBeforeUse:'ਵਰਤੋਂ ਤੋਂ ਪਹਿਲਾਂ ਲੋੜੀਂਦਾ', configureDevice:'ਡਿਵਾਈਸ ਜੋੜੋ', appPreferences:'ਐਪ ਸੈਟਿੰਗਾਂ', interface:'ਇੰਟਰਫੇਸ', theme:'RootRise ਥੀਮ', language:'ਭਾਸ਼ਾ', dataStorage:'ਡਾਟਾ ਸੰਭਾਲ', savedOnDevice:'ਇਸ ਡਿਵਾਈਸ ਤੇ ਸੰਭਾਲਿਆ', resetProfile:'ਪ੍ਰੋਫ਼ਾਈਲ ਰੀਸੈੱਟ', soilMoisture:'ਮਿੱਟੀ ਦੀ ਨਮੀ', waterUsed:'ਵਰਤਿਆ ਪਾਣੀ', fieldDetails:'ਖੇਤ ਦੇ ਵੇਰਵੇ', sensorTemperature:'ਸੈਂਸਰ ਤਾਪਮਾਨ', airHumidity:'ਹਵਾ ਦੀ ਨਮੀ', devicesOnline:'ਆਨਲਾਈਨ ਡਿਵਾਈਸ', connectUsb:'USB ਸੀਰੀਅਲ ਜੋੜੋ', connectBle:'Bluetooth LE ਜੋੜੋ', pumpControl:'ਪੰਪ ਕੰਟਰੋਲ', timedWatering:'ਸਮੇਂ ਅਨੁਸਾਰ ਸਿੰਚਾਈ', runTimed:'ਸਮੇਂ ਵਾਲੀ ਸਿੰਚਾਈ ਚਲਾਓ', turnPumpOn:'ਪੰਪ ਚਾਲੂ ਕਰੋ', stopPump:'ਪੰਪ ਰੋਕੋ', refreshReadings:'ਰੀਡਿੰਗ ਤਾਜ਼ਾ ਕਰੋ', liveSensorStream:'ਲਾਈਵ ਸੈਂਸਰ ਡਾਟਾ', online:'ਆਨਲਾਈਨ', offline:'ਆਫ਼ਲਾਈਨ', notConnected:'ਕਨੈਕਟ ਨਹੀਂ', notAdded:'ਸ਼ਾਮਲ ਨਹੀਂ', notSaved:'ਸੰਭਾਲਿਆ ਨਹੀਂ ਗਿਆ' }
};
let activeLanguage = 'en';
function tr(key) { return languageCatalog[activeLanguage]?.[key] || languageCatalog.en[key] || key; }
function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); });
  document.documentElement.lang = activeLanguage;
  const accountStatus = document.getElementById('accountDeviceStatus');
  if (accountStatus) accountStatus.textContent = accountStatus.classList.contains('online') ? tr('online') : tr('offline');
  const ageInput = document.getElementById('ageInput');
  const ageSummary = document.getElementById('ageSummary');
  if (ageSummary && !ageInput?.value) ageSummary.textContent = tr('notAdded');
  const profileStatus = document.getElementById('profileStatus');
  if (profileStatus) profileStatus.textContent = getSavedProfile().saved ? tr('savedOnDevice') : tr('notSaved');  const mode = document.getElementById('accountConnectionMode');
  if (mode) {
    const value = mode.dataset.mode || 'notConnected';
    mode.textContent = value === 'usbSerial' ? tr('connectUsb').replace(/^Connect /,'') : value === 'ble' ? tr('connectBle').replace(/^Connect /,'') : value === 'connected' ? tr('online') : tr('notConnected');
  }
}
function initialiseLanguage() {
  const selector = document.getElementById('languageSelect');
  try { activeLanguage = localStorage.getItem('rootrise_language') || 'en'; } catch (_) { activeLanguage = 'en'; }
  if (!languageCatalog[activeLanguage]) activeLanguage = 'en';
  if (selector) {
    selector.value = activeLanguage;
    selector.addEventListener('change', () => {
      activeLanguage = languageCatalog[selector.value] ? selector.value : 'en';
      try { localStorage.setItem('rootrise_language', activeLanguage); } catch (_) {}
      applyTranslations();
      document.dispatchEvent(new CustomEvent('rootrise:language-change', { detail: { language: activeLanguage } }));
    });
  }
  applyTranslations();
}
/** Animate the theme from the toggle button, then persist the selected theme. */
function setTheme(theme, animate = true) {
  const root = document.documentElement;
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  const toggle = document.getElementById('themeToggle');
  const rect = toggle?.getBoundingClientRect();
  const wave = document.createElement('div');
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    wave.className = 'theme-wave';
    wave.style.setProperty('--wave-color', nextTheme === 'light' ? '#f2f4ed' : '#081519');
    wave.style.setProperty('--wave-x', `${rect ? rect.left + rect.width / 2 : window.innerWidth - 35}px`);
    wave.style.setProperty('--wave-y', `${rect ? rect.top + rect.height / 2 : 35}px`);
    document.body.appendChild(wave);
    window.setTimeout(() => wave.remove(), 1200);
  }
  root.dataset.theme = nextTheme;
  try { localStorage.setItem('rootrise_theme', nextTheme); } catch (_) { /* Storage can be disabled in private browsing. */ }
  const label = document.getElementById('themeLabel');
  const symbol = document.getElementById('themeSymbol');
  if (label) label.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';
  if (symbol) symbol.textContent = nextTheme === 'dark' ? '☾' : '☀';
  if (toggle) toggle.setAttribute('aria-label', `Switch to ${nextTheme === 'dark' ? 'light' : 'dark'} mode`);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = nextTheme === 'light' ? '#f2f4ed' : '#081519';
}

function initialiseTheme() {
  // v2.0: default first launch of this release to Dark, then remember the user's choice.
  let savedTheme = 'dark';
  try {
    const themeVersion = localStorage.getItem('rootrise_theme_default_version');
    if (themeVersion === '2') savedTheme = localStorage.getItem('rootrise_theme') || 'dark';
    else {
      localStorage.setItem('rootrise_theme', 'dark');
      localStorage.setItem('rootrise_theme_default_version', '2');
    }
  } catch (_) { /* Use dark mode by default if storage is unavailable. */ }
  setTheme(savedTheme, false);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
}

function findEsp32Field() {
  document.getElementById('connectSerial')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('Choose USB Serial or Bluetooth LE below to connect your controller.');
}

function toggleSprinkler(zoneNumber) {
  sprinklers[zoneNumber] = !sprinklers[zoneNumber];
  const button = document.getElementById(`sprinkler${zoneNumber}`);
  const status = document.getElementById(`status${zoneNumber}`);
  if (button) {
    button.textContent = sprinklers[zoneNumber] ? 'Stop sprinkler' : 'Run sprinkler';
    button.className = sprinklers[zoneNumber] ? 'btn danger' : 'btn secondary';
  }
  if (status) {
    status.textContent = sprinklers[zoneNumber] ? 'Running (demo)' : 'Ready';
    status.className = sprinklers[zoneNumber] ? 'pill' : 'pill off';
  }
  toast(sprinklers[zoneNumber]
    ? `Zone ${zoneNumber} sprinkler started in demo mode.`
    : `Zone ${zoneNumber} sprinkler stopped in demo mode.`);
}

function toggleAutomation() {
  automation = Boolean(document.getElementById('autoToggle')?.checked);
  const description = document.getElementById('autoDesc');
  if (description) description.textContent = automation
    ? "Automatically water when soil moisture falls below each zone's threshold."
    : 'Automation paused. Manual control remains available in this demo.';
  toast(automation ? 'Automation enabled (demo).' : 'Automation paused (demo).');
}

function calculateWater() {
  const area = Math.max(0, Number(document.getElementById('area')?.value) || 0);
  const crop = document.getElementById('crop')?.value || 'tomato';
  // Indicative planning rates (L/m²/day), not agronomic prescriptions. Calibrate to local conditions.
  const rates = { tomato: 2.5, spinach: 3, rice: 5, maize: 2.2, potato: 2.8, wheat: 2.1, onion: 2.6, cabbage: 3.2, chilli: 2.7, okra: 3.1, cucumber: 3.4, beans: 2.8, soybean: 2.6, groundnut: 2.5, cotton: 3.5, banana: 4.5, tea: 3.2 };
  const cropNames = { tomato: 'tomato', spinach: 'spinach / leafy greens', rice: 'rice', maize: 'maize', potato: 'potato', wheat: 'wheat', onion: 'onion', cabbage: 'cabbage', chilli: 'chilli peppers', okra: 'okra', cucumber: 'cucumber', beans: 'beans / pulses', soybean: 'soybean', groundnut: 'groundnut', cotton: 'cotton', banana: 'banana', tea: 'tea' };
  const litres = document.getElementById('recLitres');
  const note = document.getElementById('recNote');
  if (litres) litres.textContent = Math.round(area * (rates[crop] || rates.tomato)).toLocaleString('en-IN');
  if (note) note.textContent = `Illustrative estimate for ${cropNames[crop] || 'selected crop'}. Actual need varies with climate, soil, crop stage and rainfall; validate with local agricultural guidance.`;
}

function getSavedProfile() {
  try { return JSON.parse(localStorage.getItem('rootrise_profile') || '{}'); }
  catch (_) { return {}; }
}

function getGreetingName() {
  const profile = getSavedProfile();
  const name = String(profile.name || '').trim();
  // Never show the default placeholder as if the farmer has already created an account.
  return name && name.toLowerCase() !== 'rootrise farmer' ? name.split(/\s+/)[0] : 'farmer';
}

function updateGreeting() {
  const greeting = document.getElementById('greeting');
  if (!greeting) return;
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  greeting.textContent = `${partOfDay}, ${getGreetingName()} 👋`;
}

function renderProfile() {
  const data = getSavedProfile();
  const name = data.name || 'RootRise Farmer';
  const email = data.email && data.email !== 'demo@rootrise.local' ? data.email : 'No email added';
  const age = data.age || '';
  const farm = data.farm || 'My Farm';
  const nameInput = document.getElementById('nameInput');
  const emailInput = document.getElementById('emailInput');
  const ageInput = document.getElementById('ageInput');
  const farmInput = document.getElementById('farmInput');
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = email === 'No email added' ? '' : email;
  if (ageInput) ageInput.value = age;
  if (farmInput) farmInput.value = farm;
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  const initial = (name.trim()[0] || 'R').toUpperCase();
  const bigAvatar = document.getElementById('bigAvatar');
  if (bigAvatar) bigAvatar.textContent = initial;
  const farmSummary = document.getElementById('farmSummary');
  const ageSummary = document.getElementById('ageSummary');
  const profileStatus = document.getElementById('profileStatus');
  if (farmSummary) farmSummary.textContent = farm;
  if (ageSummary) ageSummary.textContent = age ? `${age} years` : tr('notAdded');
  if (profileStatus) profileStatus.textContent = data.saved ? tr('savedOnDevice') : tr('notSaved');
  updateGreeting();
}

function saveProfile() {
  const name = document.getElementById('nameInput')?.value.trim() || 'RootRise Farmer';
  const email = document.getElementById('emailInput')?.value.trim() || 'No email added';
  const age = document.getElementById('ageInput')?.value.trim() || '';
  const farm = document.getElementById('farmInput')?.value.trim() || 'My Farm';
  const profile = { name, email, age, farm, saved: true };
  try {
    localStorage.setItem('rootrise_profile', JSON.stringify(profile));
    renderProfile();
    window.dispatchEvent(new CustomEvent('rootrise:profile-saved', { detail: profile }));
    toast('Profile saved on this device ✓');
  } catch (_) {
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    if (profileName) profileName.textContent = name;
    if (profileEmail) profileEmail.textContent = email;
    updateGreeting();
    toast('Profile updated for this session.');
  }
}

function resetProfile() {
  try { localStorage.removeItem('rootrise_profile'); } catch (_) { /* Ignore unavailable storage. */ }
  renderProfile();
  toast(tr('resetProfile') + ' ✓');
}

// Explicit pointer/click listeners make the bottom navigation dependable in mobile WebViews.
function initialiseNavigation() {
  const bindings = [['homeTab', 'home'], ['accountTab', 'account']];
  bindings.forEach(([id, page]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      showPage(page);
    });
    button.addEventListener('touchend', (event) => {
      // Do not preventDefault here; allow normal browser click synthesis/accessibility.
      if (event.changedTouches?.length) button.dataset.lastTouch = String(Date.now());
    }, { passive: true });
  });
}

document.getElementById('addFieldButton')?.addEventListener('click', findEsp32Field);
document.getElementById('configureDevice')?.addEventListener('click', () => {
  showPage('home');
  window.setTimeout(() => {
    const panel = document.getElementById('deviceConnectionSection');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel?.classList.add('attention-pulse');
    window.setTimeout(() => panel?.classList.remove('attention-pulse'), 1400);
    document.getElementById('connectBle')?.focus({ preventScroll: true });
  }, 360);
});
initialiseTheme();
initialiseNavigation();
initialiseLanguage();
calculateWater();
renderProfile();


// v2.1 field details: populated only from an actual controller update; never fabricate sensor values.
function openFieldInfo(field = {}) {
  const dialog = document.getElementById('fieldInfoDialog');
  const values = {
    detailMoisture: field.soilMoisture == null ? '—' : `${field.soilMoisture}%`,
    detailAirTemp: field.airTemperature == null ? '—' : `${field.airTemperature}°C`,
    detailAirHumidity: field.airHumidity == null ? '—' : `${field.airHumidity}%`,
    detailNextWatering: field.nextWatering || 'Not scheduled',
    detailLastWatered: field.lastWatered || 'No history yet'
  };
  Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
  const toggle = document.getElementById('fieldAutoToggle');
  if (toggle) { toggle.checked = field.automaticWatering === true; toggle.disabled = field.connected !== true || field.calibrated !== true; }
  const status = document.getElementById('fieldDetailStatus');
  if (status) status.textContent = field.connected ? (field.calibrated ? 'Live controller data. Automatic watering can be enabled when the controller reports healthy safety checks.' : 'Controller connected; calibrate the sensors before enabling automatic watering.') : 'Waiting for a connected ESP32. Live readings and pump controls remain unavailable until a controller is paired.';
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
  renderDeviceHistories(true);
}
document.getElementById('closeFieldInfo')?.addEventListener('click', () => document.getElementById('fieldInfoDialog')?.close());
document.getElementById('fieldInfoDialog')?.addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
function updateControllerField(device) {
  const container = document.getElementById('zonesContainer');
  if (!container) return;
  const previous = container._deviceDetail || {};
  const current = { ...previous, ...device, transport: device.transport || previous.transport };
  container._deviceDetail = current;
  let card = container.querySelector('.connected-zone');
  if (!card) {
    card = document.createElement('article');
    card.className = 'zone connected-zone';
    card.innerHTML = '<div class="zonetop"><div><div class="zonename" id="controllerFieldName"></div><div class="zoneseed" id="controllerTransport"></div></div><span class="pill controller-status-online" id="controllerConnectionBadge">CONNECTED</span></div><div class="controller-readings"><div class="controller-reading"><span data-i18n="soilMoisture">Soil moisture</span><strong id="controllerSoil">—</strong></div><div class="controller-reading"><span data-i18n="sensorTemperature">Air temperature</span><strong id="controllerTemperature">—</strong></div><div class="controller-reading"><span data-i18n="airHumidity">Air humidity</span><strong id="controllerHumidity">—</strong></div><div class="controller-reading"><span>Pump status</span><strong id="controllerPump">Waiting for data</strong></div><div class="controller-reading"><span data-i18n="waterUsed">Water used</span><strong id="controllerWater">—</strong></div><div class="controller-reading"><span>Run timer</span><strong id="controllerTimer">—</strong></div></div><div class="zonebottom"><span class="smallmuted" id="controllerFieldUpdate">Waiting for first device reading</span><button type="button" class="btn secondary" id="controllerDetails" data-i18n="fieldDetails">Field details</button></div>';
    container.replaceChildren(card);
    applyTranslations(card);
    container.classList.remove('zones-empty-state');
    card.querySelector('#controllerDetails')?.addEventListener('click', () => openFieldInfo(container._deviceDetail || {}));
  }
  const put = (id, text) => { const node = card.querySelector(`#${id}`); if (node) node.textContent = text; };
  put('controllerFieldName', current.deviceName || 'RootRise ESP32');
  put('controllerTransport', current.transport ? `${String(current.transport).replace('-', ' ').toUpperCase()} · LIVE DEVICE` : 'Live controller');
  put('controllerSoil', Number.isFinite(current.soilMoisture) ? `${current.soilMoisture}%` : 'Not reported');
  put('controllerTemperature', Number.isFinite(current.airTemperature) ? `${Number(current.airTemperature).toFixed(1)} °C` : 'Waiting for sensor');
  put('controllerHumidity', Number.isFinite(current.airHumidity) ? `${Number(current.airHumidity).toFixed(1)}%` : 'Waiting for sensor');
  put('controllerPump', typeof current.pumpOn === 'boolean' ? (current.pumpOn ? 'ON' : 'OFF') : 'Waiting for data');
  put('controllerWater', Number.isFinite(current.waterUsedLitres) ? `${current.waterUsedLitres} L` : 'Not reported');
  put('controllerTimer', Number.isFinite(current.pumpSeconds) ? `${current.pumpSeconds} sec` : '—');
  put('controllerFieldUpdate', current.airTemperature != null || current.airHumidity != null ? `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for first device reading');
  const badge = card.querySelector('#controllerConnectionBadge');
  if (badge) {
    badge.textContent = current.connected === false ? 'DISCONNECTED' : 'CONNECTED';
    badge.classList.toggle('controller-status-online', current.connected !== false);
    badge.classList.toggle('controller-status-offline', current.connected === false);
  }
  const count = document.getElementById('zoneCount'); if (count) count.textContent = current.connected === false ? '1 field · offline' : '1 field · online';
  const accountStatus = document.getElementById('accountDeviceStatus');
  if (accountStatus) { accountStatus.textContent = current.connected === false ? tr('offline') : tr('online'); accountStatus.classList.toggle('online', current.connected !== false); accountStatus.classList.toggle('offline', current.connected === false); }
  const connectionMode = document.getElementById('accountConnectionMode');
  if (connectionMode) { connectionMode.dataset.mode = current.connected === false ? 'notConnected' : current.transport === 'usb-serial' ? 'usbSerial' : current.transport === 'ble' ? 'ble' : 'connected'; applyTranslations(); }
  const subtitle = document.getElementById('systemSubtitle'); if (subtitle) subtitle.textContent = current.connected === false ? 'Controller disconnected · showing last received data' : 'Live RootRise controller and field data';
  const soilNote = document.getElementById('overviewMoistureNote'); if (soilNote && !Number.isFinite(current.soilMoisture)) soilNote.textContent = 'Not included in current ESP32 DATA line';
  const waterNote = document.getElementById('overviewWaterNote'); if (waterNote && !Number.isFinite(current.waterUsedLitres)) waterNote.textContent = 'Not included in current ESP32 DATA line';
  const discovery = document.getElementById('deviceDiscoveryNote');
  if (discovery) discovery.textContent = current.connected === false ? 'Controller disconnected. The last field readings are shown for reference.' : 'Controller connected. Values update from the live ESP32 stream.';
  if (Number.isFinite(current.soilMoisture)) document.getElementById('overviewMoisture')?.closest('.metric')?.classList.remove('unavailable');
  if (Number.isFinite(current.waterUsedLitres)) document.getElementById('overviewWater')?.closest('.metric')?.classList.remove('unavailable');
  if (Number.isFinite(current.airTemperature)) document.getElementById('overviewTemp')?.closest('.metric')?.classList.remove('unavailable');
  if (Number.isFinite(current.airHumidity)) document.getElementById('overviewHumidity')?.closest('.metric')?.classList.remove('unavailable');
}
window.addEventListener('rootrise:device-update', event => {
  const device = event.detail || {};
  if (Number.isFinite(device.latitude) && Number.isFinite(device.longitude) && typeof window.updateFarmWeather === 'function') {
    window.updateFarmWeather(device.latitude, device.longitude, device.deviceName || 'ESP32 GPS');
  }
  if (device.connected === true || device.connected === false) updateControllerField(device);
  if (device.connected === true) {
    const label = document.getElementById('connectionText'); if (label) label.textContent = `Controller connected · ${device.deviceName || 'RootRise ESP32'}`;
    const count = document.getElementById('deviceCount'); if (count) count.innerHTML = '1<small> connected</small>';
  } else if (device.connected === false) {
    const count = document.getElementById('deviceCount'); if (count) count.innerHTML = '0<small> connected</small>';
  }
});
// v2.3: history is populated only from the weather archive or real device updates.
function readHistory(key) {
  try {
    const data=JSON.parse(localStorage.getItem(key)||'[]'); if (!Array.isArray(data)) return [];
    if (key !== 'rootrise_field_history') return data;
    const compact=new Map();
    data.forEach((record,index)=>{
      if(!record||typeof record!=='object')return;
      const date=recordDate(record); const title=record.title||record.deviceName||'RootRise ESP32';
      const slot=date?Math.floor(date.getTime()/(15*60*1000)):String(record.time||'legacy-'+index);
      compact.set(title+'|'+slot,record);
    });
    const cleaned=Array.from(compact.values()).sort((a,b)=>(recordDate(a)?.getTime()||0)-(recordDate(b)?.getTime()||0));
    if(cleaned.length!==data.length) localStorage.setItem(key,JSON.stringify(cleaned.slice(-18000)));
    return cleaned;
  } catch (_) { return []; }
}
function writeHistory(key, records, limit = 18000) {
  try { localStorage.setItem(key, JSON.stringify(records.slice(-limit))); } catch (_) { /* Local history is best-effort until cloud sync is configured. */ }
}
function historyRow(title, detail, time) {
  const row = document.createElement('div'); row.className = 'history-row';
  const main = document.createElement('div'); main.className = 'history-row-main';
  const strong = document.createElement('strong'); strong.textContent = title;
  const sub = document.createElement('span'); sub.textContent = detail;
  const stamp = document.createElement('time'); stamp.textContent = time;
  main.append(strong, sub); row.append(main, stamp); return row;
}
function formatDay(date) {
  // Use local calendar dates to match the user's location and avoid UTC day shifts.
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
let weatherHistoryRequestId = 0;
async function loadWeatherHistory(period = 'yesterday') {
  const list = document.getElementById('weatherHistoryList');
  const status = document.getElementById('weatherHistoryStatus');
  if (!list || !status) return;
  const requestId = ++weatherHistoryRequestId;
  let coords = null;
  try { coords = JSON.parse(localStorage.getItem('rootrise_weather_coordinates') || 'null'); } catch (_) {}
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    status.textContent = 'Location is not available yet. Allow location access and try again.';
    list.replaceChildren(); list.append(historyRow('No location available', 'Archived weather needs the saved GPS coordinates.', '—')); return;
  }
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end);
    if (period === '30days') {
      // Calendar-month view: from the first day of the previous month through yesterday.
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
    } else {
      start.setDate(start.getDate() - (period === '7days' ? 6 : 0));
    }
  status.textContent = period === '30days' ? 'Loading the last 30 days of archived weather…' : period === '7days' ? 'Loading the last 7 days of archived weather…' : 'Loading yesterday’s archived weather…'; list.replaceChildren();
  try {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.search = new URLSearchParams({ latitude: String(coords.latitude), longitude: String(coords.longitude), start_date: formatDay(start), end_date: formatDay(end), daily: 'temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,weather_code', timezone: 'auto' });
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Archive service unavailable');
    const data = await response.json(); const daily = data.daily;
    if (requestId !== weatherHistoryRequestId) return; // Ignore stale responses after switching tabs.
    if (!daily || !Array.isArray(daily.time) || !daily.time.length) throw new Error('No archived data returned');
    daily.time.forEach((day, i) => {
      const temp = daily.temperature_2m_mean?.[i]; const hum = daily.relative_humidity_2m_mean?.[i]; const rain = daily.precipitation_sum?.[i];
      const weather = describeWeather(daily.weather_code?.[i], true);
      const detail = `${weather.label} · ${Number.isFinite(temp) ? `${Math.round(temp)}°C` : '—°C'} · Humidity ${Number.isFinite(hum) ? `${Math.round(hum)}%` : '—'} · Rain ${Number.isFinite(rain) ? `${rain.toFixed(1)} mm` : '—'}`;
      list.append(historyRow(new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), detail, 'Daily average'));
    });
    status.textContent = 'Historical forecast archive · Weather estimates, not farm sensor measurements.';
  } catch (_) {
    if (requestId !== weatherHistoryRequestId) return;
    status.textContent = 'Could not load archived weather. Check your internet connection and try again.';
    list.replaceChildren(); list.append(historyRow('History unavailable', 'The archive service did not return data for this period.', '—'));
  }
  // Show the most recent date first (e.g. Oct 23 down to Sep 1).
  Array.from(list.children).reverse().forEach(card => list.append(card));

}
let lastDeviceHistoryRenderAt=0;
function renderDeviceHistories(force=false) {
  const open=Boolean(document.getElementById('fieldInfoDialog')?.open||document.getElementById('weatherHistoryDialog')?.open);
  if(!force&&!open) return;
  if(!force&&Date.now()-lastDeviceHistoryRenderAt<10000) return;
  lastDeviceHistoryRenderAt=Date.now();
  const fields = document.getElementById('fieldHistoryList');
  const irrigation = document.getElementById('irrigationHistoryList');
  const fieldRecords = readHistory('rootrise_field_history').slice().reverse();
  const waterRecords = readHistory('rootrise_irrigation_history').slice().reverse();
  if (fields) {
    fields.replaceChildren();
    if (!fieldRecords.length) fields.append(historyRow('No field readings yet', 'History starts when the ESP32 sends actual sensor data.', '—'));
    fieldRecords.slice(0, 12).forEach(r => fields.append(historyRow(r.title || 'Sensor snapshot', r.detail || 'Device reading', r.time || '')));
  }
  if (irrigation) {
    irrigation.replaceChildren();
    if (!waterRecords.length) irrigation.append(historyRow('No watering events yet', 'Actual water-use and sprinkler events will appear here.', '—'));
    waterRecords.slice(0, 12).forEach(r => irrigation.append(historyRow(r.title || 'Irrigation event', r.detail || 'Device event', r.time || '')));
  }
}
function openWeatherHistory() {
  const dialog = document.getElementById('weatherHistoryDialog');
  if (dialog && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  renderDeviceHistories(true);
  const activeTab = document.querySelector('[data-history-period].active');
  loadWeatherHistory(activeTab?.dataset.historyPeriod || '7days');
}
document.getElementById('weatherHistoryButton')?.addEventListener('click', openWeatherHistory);
document.getElementById('overviewHistoryButton')?.addEventListener('click', openWeatherHistory);
document.getElementById('closeWeatherHistory')?.addEventListener('click', () => document.getElementById('weatherHistoryDialog')?.close());
document.getElementById('weatherHistoryDialog')?.addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.querySelectorAll('[data-history-period]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-history-period]').forEach(tab => tab.classList.toggle('active', tab === button));
  loadWeatherHistory(button.dataset.historyPeriod);
}));


// v2.8: separate sensor and irrigation history (distinct from archived weather history).
let sensorHistoryPeriod = 'today';
function recordDate(record) {
  if (record && record.timestamp) { const d = new Date(record.timestamp); if (!Number.isNaN(d.getTime())) return d; }
  if (record && record.time) { const d = new Date(record.time); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}
function matchesSensorPeriod(record, period) {
  const date = recordDate(record), now = new Date();
  if (period === "all") return true;
  if (!date) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today - day) / 86400000);
  if (period === "today") return diff === 0;
  if (period === "yesterday") return diff === 1;
  if (period === "7days") return diff >= 0 && diff < 7;
  if (period === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === "6months") { const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6); return date >= cutoff && date <= now; }
  return false;
}
function renderHistoryList(list, records, period, kind) {
  list.replaceChildren();
  const row = (record) => historyRow(record.title || (kind === "water" ? "Irrigation event" : "Sensor snapshot"), record.detail || "Device record", record.time || "");
  if (period === "today" || period === "yesterday") {
    const base = new Date(); if (period === "yesterday") base.setDate(base.getDate() - 1);
    const dayLabel = base.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    for (let hour=0; hour<24; hour+=6) {
      const group=document.createElement("section"); group.className="history-group";
      const heading=document.createElement("h3"); heading.className="history-group-title";
      heading.textContent=dayLabel + " · " + String(hour).padStart(2,"0") + ":00–" + String(hour+6).padStart(2,"0") + ":00"; group.append(heading);
      const entries=records.filter(record => { const date=recordDate(record); return date && date.getHours()>=hour && date.getHours()<hour+6; });
      if (!entries.length) group.append(historyRow("No entries in this 6-hour period", "New controller data will appear here.", "—"));
      else entries.slice(0,100).forEach(record => group.append(row(record)));
      list.append(group);
    }
    return;
  }
  if (!records.length) { list.append(historyRow("No records for this period", "ESP32 measurements and reported watering events appear here.", "—")); return; }
  records.slice(0,500).forEach(record => list.append(row(record)));
}
function renderSensorHistory(period = sensorHistoryPeriod) {
  sensorHistoryPeriod=period;
  const sensorList=document.getElementById("sensorHistoryList"), waterList=document.getElementById("sensorIrrigationHistoryList"), status=document.getElementById("sensorHistoryStatus");
  if (!sensorList || !waterList || !status) return;
  const sortNewest=records => records.filter(record=>matchesSensorPeriod(record,period)).sort((a,b)=>(recordDate(b)?.getTime()||0)-(recordDate(a)?.getTime()||0));
  renderHistoryList(sensorList,sortNewest(readHistory("rootrise_field_history")),period,"sensor");
  renderHistoryList(waterList,sortNewest(readHistory("rootrise_irrigation_history")),period,"water");
  const labels={today:"today in 6-hour blocks",yesterday:"yesterday in 6-hour blocks","7days":"the last 7 days",month:"this month","6months":"the last 6 months",all:"all locally saved records"};
  status.textContent="Showing " + (labels[period]||labels.today) + ". Records are saved on this device.";
}
function openSensorHistory() {
  const dialog = document.getElementById('sensorHistoryDialog');
  if (dialog && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  renderSensorHistory(sensorHistoryPeriod);
}
document.getElementById('sensorHistoryButton')?.addEventListener('click', openSensorHistory);
document.getElementById('closeSensorHistory')?.addEventListener('click', () => document.getElementById('sensorHistoryDialog')?.close());
document.getElementById('sensorHistoryDialog')?.addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.querySelectorAll('[data-sensor-period]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-sensor-period]').forEach(tab => tab.classList.toggle('active', tab === button));
  renderSensorHistory(button.dataset.sensorPeriod);
}));

// The ESP32 bridge/backend should dispatch rootrise:device-update with a timestamped payload.
// We store only values actually received; no sample sensor values or watering events are fabricated.
let lastSensorPersistAt = 0;
let lastSensorHistoryRenderAt = 0;
let lastReportedPumpState = null;
window.addEventListener('rootrise:device-update', event => {
  const d = event.detail || {};
  if (d.connected === false) { lastReportedPumpState = null; return; }
  if (d.connected !== true) return;
  const now = new Date(); const time = now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const status = document.getElementById('farmWeatherSource');
  if (status) { status.textContent = 'ONLINE'; status.classList.remove('offline'); status.classList.add('online'); }
  const accountStatus = document.getElementById('accountDeviceStatus'); if (accountStatus) accountStatus.textContent = tr('online');
  const connection = document.getElementById('connectionText'); if (connection) connection.textContent = `Controller connected · ${d.deviceName || 'RootRise ESP32'}`;
  const count = document.getElementById('deviceCount'); if (count) count.innerHTML = '1<small> connected</small>';
  const moisture = document.getElementById('overviewMoisture'); const moistureNote = document.getElementById('overviewMoistureNote');
  if (Number.isFinite(d.soilMoisture)) { if (moisture) moisture.innerHTML = `${d.soilMoisture}<small>%</small>`; if (moistureNote) moistureNote.textContent = 'Latest controller reading'; }
  const water = document.getElementById('overviewWater'); const waterNote = document.getElementById('overviewWaterNote');
  if (Number.isFinite(d.waterUsedLitres)) { if (water) water.innerHTML = `${d.waterUsedLitres}<small> L</small>`; if (waterNote) waterNote.textContent = 'Reported by controller'; }
  const temp = document.getElementById('overviewTemp'); const tempNote = document.getElementById('overviewTempNote');
  if (Number.isFinite(d.airTemperature)) { if (temp) temp.innerHTML = `${d.airTemperature}<small>°C</small>`; if (tempNote) tempNote.textContent = 'Latest DHT22 reading'; }
  const humidityValue = document.getElementById('overviewHumidity'); const humidityNote = document.getElementById('overviewHumidityNote');
  if (Number.isFinite(d.airHumidity)) { if (humidityValue) humidityValue.innerHTML = `${d.airHumidity}<small>%</small>`; if (humidityNote) humidityNote.textContent = 'Latest controller reading'; }
  const humidity = Number.isFinite(d.airHumidity) ? `${d.airHumidity}%` : '—';
  const soil = Number.isFinite(d.soilMoisture) ? `${d.soilMoisture}%` : '—';
  const air = Number.isFinite(d.airTemperature) ? `${d.airTemperature}°C` : '—';
  const record = { title: d.fieldName || d.deviceName || 'Field sensor snapshot', detail: `Soil ${soil} · Air ${air} · Humidity ${humidity}`, time, timestamp: now.toISOString() };
  if ((Number.isFinite(d.soilMoisture) || Number.isFinite(d.airTemperature) || Number.isFinite(d.airHumidity)) && Date.now() - lastSensorPersistAt >= 15 * 60 * 1000) {
    const records = readHistory('rootrise_field_history'); records.push(record); writeHistory('rootrise_field_history', records, 18000); lastSensorPersistAt = Date.now();
  }
  if (typeof d.pumpOn === 'boolean') {
    if (lastReportedPumpState !== null && lastReportedPumpState !== d.pumpOn) {
      const logs=readHistory('rootrise_irrigation_history');
      logs.push({title:d.pumpOn?'Pump started':'Pump stopped',detail:Number.isFinite(d.waterUsedLitres)?'Controller reported total: '+d.waterUsedLitres+' L':'Pump state reported by ESP32; delivered volume not measured',time,timestamp:now.toISOString()});
      writeHistory('rootrise_irrigation_history',logs,18000);
    }
    lastReportedPumpState=d.pumpOn;
  }
  const waterEvent = d.irrigationEvent || d.wateringEvent;
  if (waterEvent) {
    const logs = readHistory('rootrise_irrigation_history');
    logs.push({ title: waterEvent.title || 'Watering event', detail: `${waterEvent.durationMinutes ?? '—'} min · ${waterEvent.waterLitres ?? d.waterUsedLitres ?? '—'} L`, time, timestamp: now.toISOString() });
    writeHistory('rootrise_irrigation_history', logs);
  }
  renderDeviceHistories();
  if (document.getElementById("sensorHistoryDialog")?.open && Date.now()-lastSensorHistoryRenderAt>=10000) { lastSensorHistoryRenderAt=Date.now(); renderSensorHistory(sensorHistoryPeriod); }
});
