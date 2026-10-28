import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { MongoClient, ObjectId } from 'mongodb';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || '';
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://appassets.androidplatform.net',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
]);
if (isProd && sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
if (isProd && !process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

app.disable('x-powered-by');
app.set('trust proxy', isProd ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const origin = req.get('Origin');
  const sameOrigin = origin && origin === req.protocol + '://' + req.get('host');
  if (origin && (allowedOrigins.has(origin) || sameOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  } else if (origin) return res.status(403).json({ error: 'This app origin is not allowed.' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
let client;
async function connectToMongoWithRetry() {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = new MongoClient(mongoUri, {
      family: 4,
      autoSelectFamily: false,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });
    try {
      await candidate.connect();
      client = candidate;
      console.log('MongoDB connection established.');
      return;
    } catch (error) {
      await candidate.close().catch(() => {});
      const causeCode = error?.cause?.code || error?.code || '';
      const transient = error?.errorLabelSet?.has?.('RetryableError')
        || /MongoNetworkError|MongoServerSelectionError/.test(error?.name || '')
        || causeCode === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'
        || /TLS alert internal error/i.test(error?.message || '');
      if (!transient || attempt === maxAttempts) {
        if (transient) {
          throw new Error(`MongoDB Atlas connection failed after ${maxAttempts} attempts. Check the network/VPN/firewall, Atlas status, and IP access list.`, { cause: error });
        }
        throw error;
      }
      const delayMs = Math.min(2000 * (2 ** (attempt - 1)), 15000);
      console.warn(`Transient MongoDB connection failure (${attempt}/${maxAttempts}; ${error?.name || 'error'}${causeCode ? `, ${causeCode}` : ''}). Retrying in ${delayMs / 1000}s.`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
await connectToMongoWithRetry();
const db = client.db(process.env.MONGODB_DB || 'rootrise');
const users = db.collection('users'), sessions = db.collection('sessions'), resets = db.collection('passwordResets');
const deviceReadings = db.collection('deviceReadings'), irrigationEvents = db.collection('irrigationEvents');
await Promise.all([
  users.createIndex({ email: 1 }, { unique: true }),
  users.createIndex({ consentAt: 1, updatedAt: -1 }),
  sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  deviceReadings.createIndex({ userId: 1, recordedAt: -1 }),
  irrigationEvents.createIndex({ userId: 1, recordedAt: -1 })
]);
const dummyHash = await argon2.hash(crypto.randomBytes(24), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Wait a little and try again.' } });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 4, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'If the account exists, reset instructions will be sent.' } });
const cookieName = 'rootrise_session';
const cookieFlags = `Path=/; HttpOnly; Secure=${isProd}; SameSite=${isProd ? 'None' : 'Lax'}`;
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) { const [key, ...value] = part.trim().split('='); if (key === name) return decodeURIComponent(value.join('=')); }
  return '';
}
function publicUser(user) {
  return { id: String(user._id), email: user.email, name: user.name || '', farm: user.farm || '', age: user.age ?? null, role: user.role || 'farmer', consentAt: user.consentAt || null, createdAt: user.createdAt, updatedAt: user.updatedAt, lastLoginAt: user.lastLoginAt || null };
}
function cleanText(value, max = 100) { return String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max); }
function validEmail(value) { const email = String(value || '').trim().toLowerCase(); return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''; }
function passwordHash(password) { return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); }
async function createSession(user, res) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await sessions.insertOne({ _id: hashToken(raw), userId: user._id, expiresAt: new Date(Date.now() + 7 * 86400000), createdAt: new Date() });
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(raw)}; ${cookieFlags}; Max-Age=${7 * 86400}`);
}
async function requireUser(req, res, next) {
  try {
    const raw = readCookie(req, cookieName); if (!raw) return res.status(401).json({ error: 'Sign in to continue.' });
    const session = await sessions.findOne({ _id: hashToken(raw), expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    const user = await users.findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    req.user = user; req.sessionId = session._id; next();
  } catch (error) { next(error); }
}
function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' }); next(); }
function sharingRequired(req, res, next) { if (!req.user.consentAt) return res.status(403).json({ error: 'Enable data sharing in your account to sync farm data.' }); next(); }

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'RootRise API' }));
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const email = validEmail(req.body.email), password = String(req.body.password || ''), name = cleanText(req.body.name, 100), farm = cleanText(req.body.farm, 100);
    const ageInput = req.body.age == null || String(req.body.age).trim() === '' ? null : Number(req.body.age);
    if (ageInput !== null && (!Number.isInteger(ageInput) || ageInput < 18 || ageInput > 120)) return res.status(400).json({ error: 'Age must be between 18 and 120, or left blank.' });
    if (!email || email === String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Use a valid email and a password with at least 12 characters.' });
    const user = { _id: new ObjectId(), email, passwordHash: await passwordHash(password), name: req.body.shareData === true ? name : '', farm: req.body.shareData === true ? farm : '', age: req.body.shareData === true ? ageInput : null, role: 'farmer', consentAt: req.body.shareData === true ? new Date() : null, createdAt: new Date(), updatedAt: new Date(), deviceOnline: false, latest: null, lastLoginAt: new Date() };
    await users.insertOne(user); await createSession(user, res); res.status(201).json({ user: publicUser(user) });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' }); next(error); }
});
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = validEmail(req.body.email), password = String(req.body.password || '');
    const user = email ? await users.findOne({ email }) : null;
    const validPassword = await argon2.verify(user?.passwordHash || dummyHash, password).catch(() => false);
    const valid = Boolean(user && validPassword);
    if (!valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
    user.lastLoginAt = new Date(); await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } }); await createSession(user, res); res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', requireUser, async (req, res, next) => { try { await sessions.deleteOne({ _id: req.sessionId }); res.setHeader('Set-Cookie', `${cookieName}=; ${cookieFlags}; Max-Age=0`); res.json({ ok: true }); } catch (error) { next(error); } });
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/account/profile', requireUser, sharingRequired, async (req, res, next) => {
  try {
    const ageInput = req.body.age == null || String(req.body.age).trim() === '' ? null : Number(req.body.age);
    if (ageInput !== null && (!Number.isInteger(ageInput) || ageInput < 18 || ageInput > 120)) return res.status(400).json({ error: 'Age must be between 18 and 120, or left blank.' });
    const fields = { name: cleanText(req.body.name, 100), farm: cleanText(req.body.farm, 100), age: ageInput, updatedAt: new Date() };
    await users.updateOne({ _id: req.user._id }, { $set: fields });
    res.json({ user: publicUser({ ...req.user, ...fields }) });
  } catch (error) { next(error); }
});
app.patch('/api/account/consent', requireUser, async (req, res, next) => {
  try { if (req.body?.shareData !== true) return res.status(400).json({ error: "Confirm that you want to share farm data first." }); await users.updateOne({ _id: req.user._id }, { $set: { consentAt: new Date(), updatedAt: new Date() } }); res.json({ ok: true }); } catch (error) { next(error); }
});
app.delete('/api/account/sharing', requireUser, async (req, res, next) => {
  try { await users.updateOne({ _id: req.user._id }, { $set: { consentAt: null, deviceOnline: false, latest: null, updatedAt: new Date() } }); res.json({ ok: true, message: 'Sharing paused. Previously synced records remain stored for account support.' }); } catch (error) { next(error); }
});
app.post('/api/sync', requireUser, sharingRequired, async (req, res, next) => {
  try {
    const d = req.body || {}, latest = {
      deviceName: cleanText(d.deviceName, 80) || 'RootRise ESP32', connected: d.connected === true,
      transport: cleanText(d.transport, 24), airTemperature: Number.isFinite(d.airTemperature) ? d.airTemperature : null,
      airHumidity: Number.isFinite(d.airHumidity) ? d.airHumidity : null, soilMoisture: Number.isFinite(d.soilMoisture) ? d.soilMoisture : null,
      waterUsedLitres: Number.isFinite(d.waterUsedLitres) ? d.waterUsedLitres : null, pumpOn: typeof d.pumpOn === 'boolean' ? d.pumpOn : null,
      pumpSeconds: Number.isFinite(d.pumpSeconds) ? d.pumpSeconds : null,
      farmLatitude: Number.isFinite(d.latitude) && Math.abs(d.latitude) <= 90 ? d.latitude : null,
      farmLongitude: Number.isFinite(d.longitude) && Math.abs(d.longitude) <= 180 ? d.longitude : null,
      recordedAt: new Date()
    };
    const previous = await users.findOne({ _id: req.user._id }, { projection: { latest: 1, lastSeenAt: 1 } });
    const result = await users.updateOne({ _id: req.user._id, consentAt: { $ne: null } }, { $set: { latest, deviceName: latest.deviceName, deviceOnline: latest.connected, lastSeenAt: latest.connected ? new Date() : previous?.lastSeenAt || null, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(403).json({ error: 'Data sharing is not enabled for this account.' });
    if (latest.connected && [latest.airTemperature, latest.airHumidity, latest.soilMoisture, latest.waterUsedLitres].some(Number.isFinite)) {
      await deviceReadings.insertOne({ userId: req.user._id, deviceName: latest.deviceName, transport: latest.transport, airTemperature: latest.airTemperature, airHumidity: latest.airHumidity, soilMoisture: latest.soilMoisture, waterUsedLitres: latest.waterUsedLitres, pumpOn: latest.pumpOn, farmLatitude: latest.farmLatitude, farmLongitude: latest.farmLongitude, recordedAt: latest.recordedAt });
    }
    if (latest.connected && typeof latest.pumpOn === 'boolean' && typeof previous?.latest?.pumpOn === 'boolean' && previous.latest.pumpOn !== latest.pumpOn) {
      await irrigationEvents.insertOne({ userId: req.user._id, deviceName: latest.deviceName, event: latest.pumpOn ? 'pump_started' : 'pump_stopped', pumpSeconds: latest.pumpSeconds, waterUsedLitres: latest.waterUsedLitres, recordedAt: latest.recordedAt });
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.get('/api/admin/users', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const usersList = await users.find({ role: { $ne: 'admin' } }, { projection: { passwordHash: 0 } }).sort({ lastLoginAt: -1, createdAt: -1 }).limit(500).toArray();
    res.json({ users: usersList.map(user => ({ ...publicUser(user), name: user.consentAt ? user.name || '' : '', farm: user.consentAt ? user.farm || '' : '', age: user.consentAt ? user.age ?? null : null, latest: user.consentAt ? user.latest || null : null, deviceOnline: user.consentAt && user.deviceOnline === true, deviceName: user.consentAt ? user.deviceName || '' : '', lastSeenAt: user.consentAt ? user.lastSeenAt || null : null })) });
  } catch (error) { next(error); }
});
app.get('/api/admin/users/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Account not found.' });
    const user = await users.findOne({ _id: new ObjectId(req.params.id), role: { $ne: 'admin' } }, { projection: { passwordHash: 0 } });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const shared = Boolean(user.consentAt);
    const [readings, events] = await Promise.all([
      deviceReadings.find({ userId: user._id }).sort({ recordedAt: -1 }).limit(100).toArray(),
      irrigationEvents.find({ userId: user._id }).sort({ recordedAt: -1 }).limit(100).toArray()
    ]);
    res.json({ user: { ...publicUser(user), name: shared ? user.name || '' : '', farm: shared ? user.farm || '' : '', age: shared ? user.age ?? null : null, latest: shared ? user.latest || null : null, deviceOnline: shared && user.deviceOnline === true, deviceName: shared ? user.deviceName || '' : '', lastSeenAt: shared ? user.lastSeenAt || null : null }, readings: readings.map(({ _id, userId, ...reading }) => reading), irrigationEvents: events.map(({ _id, userId, ...event }) => event) });
  } catch (error) { next(error); }
});
app.post('/api/admin/users/:id/password-reset', requireUser, requireAdmin, authLimiter, async (req, res, next) => {
  try {
    if (!process.env.SMTP_HOST) return res.status(503).json({ error: 'Password reset email is not configured. Set SMTP_HOST in backend .env.' });
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Account not found.' });
    const user = await users.findOne({ _id: new ObjectId(req.params.id) }, { projection: { email: 1 } });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const raw = crypto.randomBytes(32).toString('base64url');
    await resets.insertOne({ userId: user._id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 30 * 60 * 1000), createdAt: new Date(), requestedBy: req.user._id });
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    const link = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/reset.html?token=${encodeURIComponent(raw)}`;
    await transporter.sendMail({ from: process.env.SMTP_FROM || 'RootRise Support <support@example.com>', to: user.email, subject: 'Reset your RootRise password', text: `A RootRise administrator requested a one-time password reset. Use this link within 30 minutes: ${link}\\nIf this was unexpected, ignore this email.` });
    res.json({ ok: true, message: 'One-time reset link sent to the registered email.' });
  } catch (error) { next(error); }
});
app.post('/api/auth/forgot-password', resetLimiter, async (req, res, next) => {
  const generic = { message: 'If an account exists for that email and email delivery is configured, reset instructions will be sent.' };
  try {
    const email = validEmail(req.body.email), user = email && process.env.SMTP_HOST ? await users.findOne({ email }, { projection: { _id: 1, email: 1 } }) : null;
    if (!user) return res.json(generic);
    const raw = crypto.randomBytes(32).toString('base64url'), expiry = new Date(Date.now() + 30 * 60 * 1000);
    await resets.insertOne({ userId: user._id, tokenHash: hashToken(raw), expiresAt: expiry, createdAt: new Date() });
    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
      const link = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/reset.html?token=${encodeURIComponent(raw)}`;
      await transporter.sendMail({ from: process.env.SMTP_FROM || 'RootRise Support <support@example.com>', to: user.email, subject: 'Reset your RootRise password', text: `Use this one-time link within 30 minutes to set a new password: ${link}\nIf you did not request this, ignore this email.` });
    }
    res.json(generic);
  } catch (error) { next(error); }
});
app.post('/api/auth/reset-password', authLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || ''), password = String(req.body.password || '');
    if (token.length < 30 || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Reset link is invalid or expired, or password is too short.' });
    const reset = await resets.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!reset) return res.status(400).json({ error: 'Reset link is invalid or expired. Request another reset email.' });
    await users.updateOne({ _id: reset.userId }, { $set: { passwordHash: await passwordHash(password), updatedAt: new Date() } });
    await Promise.all([resets.deleteMany({ userId: reset.userId }), sessions.deleteMany({ userId: reset.userId })]);
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  } catch (error) { next(error); }
});

app.get('/', (req, res) => res.redirect(302, '/admin/'));
app.use(express.static(path.resolve(here, '../www'), { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));
app.use((error, req, res, next) => { console.error(error); if (res.headersSent) return next(error); res.status(500).json({ error: 'The server could not complete that request.' }); });
app.listen(port, () => console.log(`RootRise API and website listening on port ${port}`));
process.on('SIGINT', async () => { await client.close(); process.exit(0); });



