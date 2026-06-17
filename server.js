const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

const PORT = process.env.PORT || 3000;
const DEFAULT_RADIUS_MILES = 5;
const MAX_RADIUS_MILES = 50;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const users = new Map();
const directConversations = new Map();

const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const sessions = new Map();

app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts: [] }, null, 2));
}

function readAccounts() {
  ensureDataStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  ensureDataStore();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts }, null, 2));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 120);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, account) {
  const result = hashPassword(password, account.passwordSalt);
  try {
    return crypto.timingSafeEqual(Buffer.from(result.hash, 'hex'), Buffer.from(account.passwordHash, 'hex'));
  } catch {
    return false;
  }
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf('=');
      if (index === -1) return [part, ''];
      return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }));
}

function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { accountId, createdAt: Date.now() });
  return token;
}

function getSessionAccount(req) {
  const token = parseCookies(req).nearby_session;
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  const account = readAccounts().find(a => a.id === session.accountId);
  if (!account) return null;
  return account;
}

function getAccountFromCookieHeader(cookieHeader) {
  const fakeReq = { headers: { cookie: cookieHeader || '' } };
  return getSessionAccount(fakeReq);
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    bio: account.bio || '',
    skills: account.skills || '',
    interests: account.interests || '',
    profilePhoto: account.profilePhoto || '',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function chatProfile(account) {
  if (!account) return null;
  return {
    id: account.id,
    displayName: account.displayName || 'Nearby user',
    bio: account.bio || '',
    skills: account.skills || '',
    interests: account.interests || '',
    profilePhoto: account.profilePhoto || ''
  };
}

function conversationKey(accountIdA, accountIdB) {
  return [String(accountIdA || ''), String(accountIdB || '')].sort().join('::');
}

function conversationHistory(accountIdA, accountIdB) {
  return directConversations.get(conversationKey(accountIdA, accountIdB)) || [];
}

function saveDirectConversationMessage(message) {
  const key = conversationKey(message.fromAccountId, message.toAccountId);
  const history = directConversations.get(key) || [];
  history.push(message);
  if (history.length > 200) history.splice(0, history.length - 200);
  directConversations.set(key, history);
  return history;
}

function publicDirectHistory(history) {
  return history.map(message => ({
    id: message.id,
    fromAccountId: message.fromAccountId,
    toAccountId: message.toAccountId,
    from: message.from,
    to: message.to,
    text: message.text,
    sentAt: message.sentAt,
    senderProfile: message.senderProfile,
    recipientProfile: message.recipientProfile
  }));
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `nearby_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'nearby_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}



app.get('/api/auth/me', (req, res) => {
  res.json({ account: publicAccount(getSessionAccount(req)) });
});

app.post('/api/auth/register', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const displayName = safeString(req.body?.displayName, 32);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!displayName) return res.status(400).json({ error: 'Display name is required.' });

  const accounts = readAccounts();
  const existingAccount = accounts.find(a => normalizeEmail(a.email) === email);
  if (existingAccount) {
    return res.status(409).json({ error: 'An account already exists with this email address.' });
  }
  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  const account = {
    id: crypto.randomUUID(),
    email,
    displayName,
    bio: '',
    skills: '',
    interests: '',
    profilePhoto: '',
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now
  };
  accounts.push(account);
  writeAccounts(accounts);
  res.status(201).json({ account: publicAccount(account), created: true, signedIn: false, message: 'Account Created!' });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const account = readAccounts().find(a => a.email === email);
  if (!account || !verifyPassword(password, account)) return res.status(401).json({ error: 'Email or password was incorrect.' });
  const token = createSession(account.id);
  setSessionCookie(res, token);
  res.json({ account: publicAccount(account) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).nearby_session;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.put('/api/profile', (req, res) => {
  const sessionAccount = getSessionAccount(req);
  if (!sessionAccount) return res.status(401).json({ error: 'Log in before saving your profile.' });
  const accounts = readAccounts();
  const requestedAccountId = safeString(req.body?.accountId, 80);
  // In this demo app, each browser tab can maintain an active account while the
  // browser cookie may belong to the most recently logged-in tab. Prefer the
  // active account ID sent by the tab so profile photos do not overwrite the
  // wrong account during multi-account testing.
  const index = requestedAccountId
    ? accounts.findIndex(a => a.id === requestedAccountId)
    : accounts.findIndex(a => a.id === sessionAccount.id);
  if (index === -1) return res.status(404).json({ error: 'Account not found.' });
  accounts[index] = {
    ...accounts[index],
    displayName: safeString(req.body?.displayName, 32) || accounts[index].displayName,
    bio: safeString(req.body?.bio, 300),
    skills: safeString(req.body?.skills, 200),
    interests: safeString(req.body?.interests, 200),
    profilePhoto: safeProfilePhoto(req.body?.profilePhoto),
    updatedAt: new Date().toISOString()
  };
  writeAccounts(accounts);
  res.json({ account: publicAccount(accounts[index]) });
});

app.get('/version', (_req, res) => { res.type('text/plain').send('2026-06-17-create-account-single-submit-dm-history'); });


app.get('/api/debug/accounts', (_req, res) => {
  const accounts = readAccounts();
  res.json({
    count: accounts.length,
    emails: accounts.map(a => a.email),
    file: ACCOUNTS_FILE
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, connectedUsers: users.size, defaultRadiusMiles: DEFAULT_RADIUS_MILES, maxRadiusMiles: MAX_RADIUS_MILES, aiEnabled: Boolean(OPENAI_API_KEY) });
});

app.get('/debug/users', (_req, res) => {
  res.json([...users.entries()].map(([id, user]) => ({
    id,
    displayName: user.displayName,
    hasLocation: Boolean(user.location),
    locationUpdatedAt: user.location?.updatedAt || null,
    radiusMiles: user.radiusMiles || DEFAULT_RADIUS_MILES
  })));
});

function toRadians(degrees) { return degrees * Math.PI / 180; }

function distanceInMiles(a, b) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function safeString(value, maxLength) { return String(value || '').trim().slice(0, maxLength); }

function safeProfilePhoto(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const allowed = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
  if (!allowed.test(text)) return '';
  return text.slice(0, 1_200_000);
}

function clampRadiusMiles(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(0, radius));
}

function radiusMilesToMeters(radiusMiles) {
  return Math.round(clampRadiusMiles(radiusMiles) * 1609.344);
}

function nearbyUsersFor(socketId) {
  const sender = users.get(socketId);
  if (!sender || !sender.location) return [];
  return [...users.entries()]
    .filter(([id, user]) => id !== socketId && user.location)
    .map(([id, user]) => ({ id, displayName: user.displayName, distance: distanceInMiles(sender.location, user.location) }))
    .filter(user => user.distance <= (sender.radiusMiles ?? DEFAULT_RADIUS_MILES))
    .sort((a, b) => a.distance - b.distance);
}

function publicNearbyUsersFor(socketId) {
  return nearbyUsersFor(socketId).map(user => ({ displayName: user.displayName, distance: Number(user.distance.toFixed(2)) }));
}

function sendNearbyUpdate(socketId) {
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.emit('nearby:update', publicNearbyUsersFor(socketId));
}

function refreshAllNearbyCounts() { for (const socketId of users.keys()) sendNearbyUpdate(socketId); }

function classifyPlaceIntent(question) {
  const q = question.toLowerCase();
  const rules = [
    { terms: ['coffee', 'cafe', 'espresso'], overpass: 'nwr[amenity~"cafe|restaurant|fast_food"]', label: 'cafes and coffee nearby' },
    { terms: ['restaurant', 'food', 'eat', 'lunch', 'dinner', 'breakfast'], overpass: 'nwr[amenity~"restaurant|fast_food|cafe"]', label: 'places to eat nearby' },
    { terms: ['gas', 'fuel'], overpass: 'nwr[amenity=fuel]', label: 'gas stations nearby' },
    { terms: ['hospital', 'urgent care', 'emergency room', 'er'], overpass: 'nwr[amenity~"hospital|clinic|doctors"]', label: 'medical places nearby' },
    { terms: ['pharmacy', 'medicine', 'drug store', 'prescription'], overpass: 'nwr[amenity=pharmacy]', label: 'pharmacies nearby' },
    { terms: ['atm', 'cash'], overpass: 'nwr[amenity=atm]', label: 'ATMs nearby' },
    { terms: ['bank'], overpass: 'nwr[amenity=bank]', label: 'banks nearby' },
    { terms: ['park', 'trail', 'playground'], overpass: 'nwr[leisure~"park|playground|nature_reserve"]', label: 'parks nearby' },
    { terms: ['hotel', 'motel', 'stay'], overpass: 'nwr[tourism~"hotel|motel|guest_house"]', label: 'lodging nearby' },
    { terms: ['grocery', 'supermarket', 'groceries'], overpass: 'nwr[shop~"supermarket|convenience|grocery"]', label: 'grocery stores nearby' }
  ];
  return rules.find(rule => rule.terms.some(term => q.includes(term))) || {
    overpass: 'nwr[amenity~"restaurant|cafe|fast_food|fuel|pharmacy|hospital|clinic|atm|bank"]',
    label: 'useful nearby places'
  };
}

function overpassQueryForIntent(intent, radiusMeters, latitude, longitude) {
  return `
    [out:json][timeout:18];
    (
      ${intent.overpass}(around:${radiusMeters},${latitude},${longitude});
    );
    out center 25;
  `;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function fetchOverpass(endpoint, query) {
  // Most Overpass mirrors are more reliable with form-encoded `data=` payloads than raw text bodies.
  const body = new URLSearchParams({ data: query });
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Accept': 'application/json',
      'User-Agent': 'NearbyDeviceMessengerPortfolioApp/1.0'
    },
    body
  }, 15000);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Overpass status ${response.status}: ${errorText.slice(0, 120)}`);
  }

  return response.json();
}

function mapOverpassElementsToPlaces(elements, latitude, longitude) {
  const origin = { latitude, longitude };
  const seen = new Set();

  return (elements || [])
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const tags = el.tags || {};
      const name = tags.name || tags.brand || tags.operator || 'Unnamed place';
      const category = tags.amenity || tags.shop || tags.tourism || tags.leisure || 'place';
      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
      const key = `${name}|${category}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        name,
        category,
        address,
        latitude: lat,
        longitude: lon,
        distanceMiles: Number(distanceInMiles(origin, { latitude: lat, longitude: lon }).toFixed(2))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 8);
}

function nominatimTermsForQuestion(question) {
  const q = question.toLowerCase();
  if (q.includes('coffee') || q.includes('cafe')) return ['coffee', 'cafe'];
  if (q.includes('restaurant') || q.includes('food') || q.includes('eat') || q.includes('lunch') || q.includes('dinner')) return ['restaurant', 'food'];
  if (q.includes('gas') || q.includes('fuel')) return ['gas station', 'fuel'];
  if (q.includes('pharmacy') || q.includes('medicine') || q.includes('drug')) return ['pharmacy'];
  if (q.includes('hospital') || q.includes('urgent') || q.includes('clinic')) return ['hospital', 'clinic'];
  if (q.includes('atm')) return ['atm'];
  if (q.includes('bank')) return ['bank'];
  if (q.includes('park') || q.includes('trail')) return ['park'];
  if (q.includes('grocery') || q.includes('supermarket')) return ['grocery', 'supermarket'];
  return ['restaurant', 'pharmacy', 'gas station'];
}

async function fetchNominatimFallback(latitude, longitude, question, radiusMiles) {
  // Backup lookup when Overpass mirrors are down/rate-limited. It uses a small viewbox around the user.
  const delta = Math.max(0.01, clampRadiusMiles(radiusMiles) / 69);
  const left = longitude - delta;
  const right = longitude + delta;
  const top = latitude + delta;
  const bottom = latitude - delta;
  const origin = { latitude, longitude };
  const terms = nominatimTermsForQuestion(question);
  const all = [];

  for (const term of terms) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: term,
      limit: '8',
      addressdetails: '1',
      bounded: '1',
      viewbox: `${left},${top},${right},${bottom}`
    });

    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NearbyDeviceMessengerPortfolioApp/1.0'
      }
    }, 10000);

    if (!response.ok) throw new Error(`Nominatim status ${response.status}`);
    const data = await response.json();
    for (const item of data || []) {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distanceMiles = Number(distanceInMiles(origin, { latitude: lat, longitude: lon }).toFixed(2));
      if (distanceMiles > clampRadiusMiles(radiusMiles)) continue;
      all.push({
        name: item.name || item.display_name?.split(',')[0] || term,
        category: item.type || item.class || 'place',
        address: item.display_name || '',
        latitude: lat,
        longitude: lon,
        distanceMiles
      });
    }
  }

  const seen = new Set();
  return all
    .filter(place => {
      const key = `${place.name}|${place.latitude.toFixed(5)}|${place.longitude.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 8);
}

async function fetchNearbyPlaces(latitude, longitude, question, radiusMiles = DEFAULT_RADIUS_MILES) {
  const intent = classifyPlaceIntent(question);
  const selectedRadiusMeters = radiusMilesToMeters(radiusMiles);
  const radii = selectedRadiusMeters === 0 ? [25] : [selectedRadiusMeters, Math.max(25, Math.round(selectedRadiusMeters / 2))];
  const overpassEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ];

  const errors = [];

  for (const radius of radii) {
    const query = overpassQueryForIntent(intent, radius, latitude, longitude);
    for (const endpoint of overpassEndpoints) {
      try {
        const data = await fetchOverpass(endpoint, query);
        const places = mapOverpassElementsToPlaces(data.elements, latitude, longitude);
        if (places.length > 0) return { places, source: 'Overpass/OpenStreetMap', warning: '' };
        errors.push(`${endpoint} responded but returned no places for ${intent.label} at ${Math.round(radius / 1609.344)} miles.`);
      } catch (error) {
        errors.push(`${endpoint}: ${error.message || error}`);
        console.error(`Overpass endpoint failed: ${endpoint}`, error.message || error);
      }
    }
  }

  try {
    const fallbackPlaces = await fetchNominatimFallback(latitude, longitude, question, radiusMiles);
    if (fallbackPlaces.length > 0) {
      return {
        places: fallbackPlaces,
        source: 'Nominatim/OpenStreetMap fallback',
        warning: 'Overpass was unavailable or returned no matches, so these results came from the backup OpenStreetMap search.'
      };
    }
  } catch (error) {
    errors.push(`Nominatim fallback: ${error.message || error}`);
    console.error('Nominatim fallback failed:', error.message || error);
  }

  console.error('All place lookups failed or returned no results:', errors);
  return {
    places: [],
    source: 'none',
    warning: 'I could not reach the OpenStreetMap place lookup or no matching places were found. Try a broader category like restaurants, gas stations, pharmacies, parks, or ATMs.'
  };
}

function localPlaceAnswer(question, places) {
  if (!places.length) {
    return `I couldn't find matching mapped places within your selected radius. Try increasing the radius or asking for a broader category like restaurants, gas stations, pharmacies, parks, or ATMs.`;
  }
  const lines = places.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} (${p.category}) — ${p.distanceMiles} miles away${p.address ? ` — ${p.address}` : ''}`);
  return `Here are the closest matches I found:\n\n${lines.join('\n')}\n\nThis answer uses OpenStreetMap place data, so hours, ratings, and business details may be incomplete.`;
}

async function askOpenAI(question, latitude, longitude, places) {
  if (!OPENAI_API_KEY) return localPlaceAnswer(question, places);

  const prompt = `You are a nearby places assistant inside a location-based map app. Use only the provided nearby place data. Do not invent ratings, hours, phone numbers, or addresses. If data is missing, say so. Be concise and helpful. User location: ${latitude}, ${longitude}. User question: ${question}. Nearby places JSON: ${JSON.stringify(places)}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: prompt })
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`OpenAI request failed: ${response.status} ${text.slice(0, 300)}`);
    return localPlaceAnswer(question, places);
  }
  const data = await response.json();
  return data.output_text || localPlaceAnswer(question, places);
}

app.post('/api/assistant/nearby', async (req, res) => {
  try {
    const question = safeString(req.body?.question, 500);
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const radiusMiles = clampRadiusMiles(req.body?.radiusMiles);
    if (!question) return res.status(400).json({ error: 'Ask a question first.' });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: 'Share your location before asking about nearby places.' });
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'Location coordinates were outside the valid range.' });

    const lookup = await fetchNearbyPlaces(latitude, longitude, question, radiusMiles);
    const places = lookup.places || [];
    const answer = await askOpenAI(question, latitude, longitude, places);
    res.json({
      answer: lookup.warning ? `${answer}\n\n${lookup.warning}` : answer,
      places,
      aiEnabled: Boolean(OPENAI_API_KEY),
      radiusMiles,
      lookupWarning: lookup.warning,
      placesSource: lookup.source
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Assistant failed.' });
  }
});

io.on('connection', socket => {
  const account = getAccountFromCookieHeader(socket.handshake.headers.cookie);
  users.set(socket.id, {
    displayName: account?.displayName || `User-${socket.id.slice(0, 4)}`,
    accountId: account?.id || null,
    profilePhoto: account?.profilePhoto || '',
    location: null,
    radiusMiles: DEFAULT_RADIUS_MILES,
    joinedAt: Date.now()
  });
  console.log(`Connected: ${socket.id}. Users online: ${users.size}. Signed in: ${Boolean(account)}`);
  socket.emit('server:ready', { socketId: socket.id, defaultRadiusMiles: DEFAULT_RADIUS_MILES, maxRadiusMiles: MAX_RADIUS_MILES });
  refreshAllNearbyCounts();

  socket.on('profile:update', payload => {
    const user = users.get(socket.id);
    if (!user) return;

    // The browser logs in through normal HTTP routes, then tells the socket
    // which signed-in profile is active. Some browsers keep the original
    // Socket.IO handshake cookie even after login, so relying only on
    // socket.handshake.headers.cookie can incorrectly block valid users.
    const payloadAccountId = safeString(payload?.accountId, 80);
    const accounts = readAccounts();

    // Prefer the account explicitly selected in this browser tab. A single browser
    // can share one cookie across multiple tabs, so relying on the Socket.IO
    // handshake cookie can make every tab look like the most recently logged-in
    // profile. Using the tab's active account ID keeps each message tied to the
    // actual sender profile.
    const matchingAccount = accounts.find(a => a.id === payloadAccountId)
      || getAccountFromCookieHeader(socket.handshake.headers.cookie);

    if (!matchingAccount) {
      user.accountId = null;
      user.displayName = `User-${socket.id.slice(0, 4)}`;
      socket.emit('auth:state', { loggedIn: false });
      return refreshAllNearbyCounts();
    }

    user.accountId = matchingAccount.id;
    user.displayName = safeString(payload?.displayName, 32) || matchingAccount.displayName || user.displayName;
    user.profilePhoto = matchingAccount.profilePhoto || '';
    socket.emit('auth:state', { loggedIn: true, displayName: user.displayName, accountId: user.accountId });
    refreshAllNearbyCounts();
  });

  socket.on('coverage:update', payload => {
    const user = users.get(socket.id);
    if (!user) return;
    user.radiusMiles = clampRadiusMiles(payload?.radiusMiles);
    socket.emit('nearby:update', publicNearbyUsersFor(socket.id));
    refreshAllNearbyCounts();
  });

  socket.on('location:update', payload => {
    const latitude = Number(payload?.latitude);
    const longitude = Number(payload?.longitude);
    const accuracy = Number(payload?.accuracy || 0);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return socket.emit('message:error', 'Invalid location was received by the server.');
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return socket.emit('message:error', 'Location coordinates were outside the valid range.');
    const user = users.get(socket.id);
    if (!user) return;
    user.radiusMiles = clampRadiusMiles(payload?.radiusMiles ?? user.radiusMiles);
    user.location = { latitude, longitude, accuracy, updatedAt: Date.now() };
    socket.emit('location:accepted', { nearbyUsers: publicNearbyUsersFor(socket.id) });
    refreshAllNearbyCounts();
  });


  socket.on('location:clear', () => {
    const user = users.get(socket.id);
    if (!user) return;
    user.location = null;
    socket.emit('location:cleared', { nearbyUsers: [] });
    refreshAllNearbyCounts();
  });

  socket.on('message:send', payload => {
    const user = users.get(socket.id);
    if (!user?.accountId) {
      return socket.emit('message:error', 'Log in before posting a nearby message.');
    }

    const account = readAccounts().find(a => a.id === user.accountId);
    if (!account) {
      user.accountId = null;
      return socket.emit('message:error', 'Your login session could not be found. Log out, log back in, then try again.');
    }

    user.displayName = account.displayName || user.displayName;
    user.profilePhoto = account.profilePhoto || '';
    if (!user.location) return socket.emit('message:error', 'Share your location before sending a nearby message.');
    const text = safeString(payload?.text, 500);
    if (!text) return socket.emit('message:error', 'Type a message before sending.');
    const recipients = nearbyUsersFor(socket.id);
    const senderProfile = chatProfile(account);
    const message = {
      from: user.displayName,
      text,
      sentAt: new Date().toISOString(),
      radiusMiles: user.radiusMiles ?? DEFAULT_RADIUS_MILES,
      senderProfile
    };
    recipients.forEach(recipient => io.to(recipient.id).emit('message:received', { ...message, distanceMiles: Number(recipient.distance.toFixed(2)) }));
    socket.emit('message:sent', { ...message, recipientCount: recipients.length });
  });

  socket.on('direct:history', payload => {
    const user = users.get(socket.id);
    if (!user?.accountId) return socket.emit('direct:error', 'Log in before viewing private messages.');
    const targetAccountId = safeString(payload?.targetAccountId, 80);
    if (!targetAccountId) return socket.emit('direct:error', 'Choose a user to view message history.');
    const accounts = readAccounts();
    const targetAccount = accounts.find(a => a.id === targetAccountId);
    if (!targetAccount) return socket.emit('direct:error', 'That user profile could not be found.');
    const history = publicDirectHistory(conversationHistory(user.accountId, targetAccountId));
    socket.emit('direct:history', {
      targetAccountId,
      targetProfile: chatProfile(targetAccount),
      messages: history
    });
  });

  socket.on('direct:send', payload => {
    const user = users.get(socket.id);
    if (!user?.accountId) {
      return socket.emit('direct:error', 'Log in before sending a private message.');
    }

    const accounts = readAccounts();
    const senderAccount = accounts.find(a => a.id === user.accountId);
    if (!senderAccount) {
      user.accountId = null;
      return socket.emit('direct:error', 'Your login session could not be found. Log out, log back in, then try again.');
    }

    const targetAccountId = safeString(payload?.targetAccountId, 80);
    if (!targetAccountId) {
      return socket.emit('direct:error', 'Choose a user to message.');
    }

    if (targetAccountId === senderAccount.id) {
      return socket.emit('direct:error', 'You cannot send a private message to yourself.');
    }

    const targetAccount = accounts.find(a => a.id === targetAccountId);
    if (!targetAccount) {
      return socket.emit('direct:error', 'That user profile could not be found.');
    }

    const text = safeString(payload?.text, 500);
    if (!text) return socket.emit('direct:error', 'Type a private message before sending.');

    const senderProfile = chatProfile(senderAccount);
    const recipientProfile = chatProfile(targetAccount);
    const directMessage = {
      id: crypto.randomUUID(),
      fromAccountId: senderAccount.id,
      toAccountId: targetAccount.id,
      from: senderAccount.displayName || user.displayName || 'Nearby user',
      to: targetAccount.displayName || 'Nearby user',
      text,
      sentAt: new Date().toISOString(),
      senderProfile,
      recipientProfile
    };

    const history = publicDirectHistory(saveDirectConversationMessage(directMessage));
    const recipientSocketIds = [];
    for (const [id, connectedUser] of users.entries()) {
      if (connectedUser.accountId === targetAccountId) recipientSocketIds.push(id);
    }

    const recipientPayload = {
      ...directMessage,
      conversationWithAccountId: senderAccount.id,
      conversationWithProfile: senderProfile,
      history
    };
    recipientSocketIds.forEach(id => io.to(id).emit('direct:received', recipientPayload));

    socket.emit('direct:sent', {
      id: directMessage.id,
      to: targetAccount.displayName || 'Nearby user',
      targetAccountId,
      recipientCount: recipientSocketIds.length,
      text,
      sentAt: directMessage.sentAt,
      conversationWithAccountId: targetAccount.id,
      conversationWithProfile: recipientProfile,
      history
    });
  });

  socket.on('disconnect', reason => {
    users.delete(socket.id);
    console.log(`Disconnected: ${socket.id}. Reason: ${reason}. Users online: ${users.size}`);
    refreshAllNearbyCounts();
  });
});

server.listen(PORT, () => {
  console.log(`Nearby location messaging app running at http://localhost:${PORT}`);
  console.log(`AI nearby assistant: ${OPENAI_API_KEY ? 'enabled with OpenAI' : 'fallback mode, set OPENAI_API_KEY to enable AI summaries'}`);
});
