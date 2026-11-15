/**
 * All Owners — the web app's back end. Paste this into the Apps Script of the "All Owners" Google Sheet
 * (open the sheet → Extensions → Apps Script), then Deploy → New deployment → Web app
 * (Execute as: Me · Who has access: Anyone). Put the /exec address into config.js of the app.
 *
 * PINs: Project Settings → Script properties. Each person gets their own:  PIN_BARAA = 123456,  PIN_GHIDA = 654321 …
 * Delete a person's PIN property and their login stops working straight away.
 *
 * The sheet needs two tabs: Owners (Area, Building / Cluster, Unit, Owner, WhatsApp, Mobile, Email)
 * and Index (Area, Building / Cluster, First Row, Count). Owners must stay sorted by building.
 *
 * Alerts: every use is written to a "Log" tab, and you get an email when someone logs in, starts using the app
 * (first use after 30 minutes quiet), or types a wrong PIN. Optional Script properties:
 *   ALERT_EMAIL = where alerts go (default: the Google account that owns this script)
 *   ALERT_SKIP  = people who don't trigger alerts, e.g. BARAA  (comma separated; their use is still logged)
 * After pasting, run testAlert once (▷ Run) to allow sending email, then deploy a New version.
 */
const TOKEN_DAYS = 30, MAX_TRIES = 5, MAX_ROWS = 3000, MAX_SEARCH = 200;

const API = { getOwnerIndex: getOwnerIndex, getOwners: getOwners, searchOwners: searchOwners };

function doGet() {
  return ContentService.createTextOutput('All Owners is running. Open the app to use it.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    DEVICE = device_(req.ua);
    if (req.action === 'login') out = { ok: true, result: login_(req.pin) };
    else {
      const user = checkToken_(req.token);
      if (!Object.prototype.hasOwnProperty.call(API, req.action)) throw new Error('Unknown action: ' + req.action);
      out = { ok: true, user: user, result: API[req.action].apply(null, req.args || []) };
      track_(user, req.action, req.args || [], out.result);
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err), auth: !!(err && err.auth) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Login ---------- */
function authError_(msg) { const e = new Error(msg); e.auth = true; return e; }
function pins_() {
  const all = PropertiesService.getScriptProperties().getProperties(), out = {};
  Object.keys(all).forEach(function (k) { if (/^PIN_/.test(k) && String(all[k]).trim()) out[k.slice(4)] = String(all[k]).trim(); });
  return out;
}
function login_(pin) {
  const cache = CacheService.getScriptCache(), fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_TRIES) throw authError_('Too many wrong PINs. Try again in 15 minutes.');
  const p = pins_(), users = Object.keys(p);
  if (!users.length) throw authError_('No PIN set yet. Add PIN_YOURNAME in Script properties.');
  const user = users.filter(function (u) { return p[u] === String(pin || '').trim(); })[0];
  if (!user) {
    cache.put('fails', String(fails + 1), 900);
    log_('?', 'Wrong PIN', 'Attempt ' + (fails + 1) + ' of ' + MAX_TRIES, '');
    if (!cache.get('failAlert')) { cache.put('failAlert', '1', 900); alert_('Wrong PIN entered', 'Someone typed a wrong PIN (' + DEVICE + ').' + (fails + 1 >= MAX_TRIES ? ' Logins are now locked for 15 minutes.' : '')); }
    Utilities.sleep(800);
    throw authError_('Wrong PIN.' + (MAX_TRIES - fails - 1 > 0 ? ' ' + (MAX_TRIES - fails - 1) + ' tries left.' : ''));
  }
  cache.remove('fails');
  log_(nice_(user), 'Logged in', '', '');
  if (!skip_(user)) { cache.put('seen:' + nice_(user), '1', 1800); alert_(nice_(user) + ' logged in', nice_(user) + ' logged in to All Owners (' + DEVICE + ').'); }
  return { user: nice_(user), token: makeToken_(user) };
}
function nice_(u) { return u.charAt(0) + u.slice(1).toLowerCase(); }
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('TOKEN_SECRET', s); }
  return s;
}
function b64_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function makeToken_(user) {
  const payload = user + '|' + (Date.now() + TOKEN_DAYS * 864e5);
  return b64_(payload) + '.' + b64_(Utilities.computeHmacSha256Signature(payload, secret_()));
}
function checkToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw authError_('Please log in.');
  let payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0] + '==='.slice((parts[0].length + 3) % 4))).getDataAsString(); }
  catch (e) { throw authError_('Please log in.'); }
  if (b64_(Utilities.computeHmacSha256Signature(payload, secret_())) !== parts[1]) throw authError_('Please log in again.');
  const bits = payload.split('|');
  if (!pins_()[bits[0]]) throw authError_('This login was removed. Ask for a new PIN.');
  if (Number(bits[1]) < Date.now()) throw authError_('Your login expired. Please log in again.');
  return nice_(bits[0]);
}

/* ---------- Log and alerts ---------- */
var DEVICE = '';
function device_(ua) {
  ua = String(ua || '');
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'unknown device';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
function skip_(user) {
  const s = String(PropertiesService.getScriptProperties().getProperty('ALERT_SKIP') || '').toUpperCase().split(/[\s,]+/);
  return s.indexOf(String(user).toUpperCase()) !== -1;
}
function what_(action, args) {
  if (action === 'getOwners') return 'Opened ' + args[0] + (args[1] ? ' · unit ' + args[1] : '');
  if (action === 'searchOwners') return 'Searched "' + args[0] + '"';
  return 'Opened the app';
}
function track_(user, action, args, result) {
  const shown = result && result.rows ? result.rows.length : '';
  log_(user, what_(action, args), '', shown);
  if (skip_(user)) return;
  const cache = CacheService.getScriptCache(), key = 'seen:' + user;
  if (!cache.get(key)) alert_(user + ' is using All Owners', user + ' started using All Owners (' + DEVICE + '): ' + what_(action, args) + '.');
  cache.put(key, '1', 1800);
}
function log_(user, what, note, shown) {
  try {
    const b = book_(); let sh = b.getSheetByName('Log');
    if (!sh) { sh = b.insertSheet('Log'); sh.appendRow(['Time', 'User', 'What', 'Owners shown', 'Device', 'Note']); sh.setFrozenRows(1); }
    sh.appendRow([new Date(), user, what, shown, DEVICE, note || '']);
  } catch (e) {}
}
function alert_(subject, text) {
  try {
    const to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL') || Session.getEffectiveUser().getEmail();
    if (!to) return;
    const when = Utilities.formatDate(new Date(), 'Asia/Dubai', 'EEE d MMM, h:mm a');
    MailApp.sendEmail(to, 'All Owners · ' + subject, text + '\n\n' + when + ' (Dubai time)\nEvery use is listed in the Log tab of the All Owners sheet.');
  } catch (e) {}
}
/** Run once from the editor (▷ Run) to allow email alerts; sends you a test alert. */
function testAlert() {
  DEVICE = 'test from the script editor';
  alert_('test alert', 'Alerts are working. You will get one when someone logs in, starts using the app, or types a wrong PIN.');
}

/* ---------- Owners ---------- */
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function tab_(name) {
  const sh = book_().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing in the sheet.');
  return sh;
}
/** Areas and their buildings / clusters with owner counts (Index tab). Cached 30 minutes. */
function getOwnerIndex() {
  const cache = CacheService.getScriptCache(), hit = cache.get('aoIndex');
  if (hit) return JSON.parse(hit);
  const sh = tab_('Index');
  const v = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 4).getValues().filter(function (r) { return r[1]; });
  const out = { total: 0, list: v.map(function (r) { return { area: String(r[0]), cl: String(r[1]), start: Number(r[2]), n: Number(r[3]) }; }) };
  out.list.forEach(function (x) { out.total += x.n; });
  try { cache.put('aoIndex', JSON.stringify(out), 1800); } catch (e) {}
  return out;
}
function row_(r, n) { return { row: n, area: String(r[0]), cl: String(r[1]), u: String(r[2]), n: String(r[3]), wa: String(r[4]).replace(/\D/g, ''), ph: String(r[5]), e: String(r[6]) }; }
/** Owners in one building / cluster, optionally filtered by unit (exact matches first). */
function getOwners(cl, unit) {
  const ix = getOwnerIndex().list.filter(function (x) { return x.cl === String(cl); })[0];
  if (!ix) throw new Error('Building not found: ' + cl);
  const v = tab_('Owners').getRange(ix.start, 1, ix.n, 7).getValues();
  const q = String(unit || '').trim().toLowerCase(), out = [];
  v.forEach(function (r, i) {
    if (String(r[1]) !== ix.cl) return;
    if (q && String(r[2]).toLowerCase().indexOf(q) === -1) return;
    out.push(row_(r, ix.start + i));
  });
  if (q) out.sort(function (a, b) { return (a.u.toLowerCase() === q ? 0 : 1) - (b.u.toLowerCase() === q ? 0 : 1); });
  return { cl: ix.cl, area: ix.area, rows: out.slice(0, MAX_ROWS), more: Math.max(0, out.length - MAX_ROWS) };
}
/** Search every owner by name, phone or email. */
function searchOwners(q) {
  q = String(q || '').trim();
  if (q.length < 3) throw new Error('Type at least 3 letters or digits.');
  const sh = tab_('Owners'), digits = q.replace(/[\s+\-()]/g, '');
  const term = /^\d{5,}$/.test(digits) ? digits.replace(/^00/, '').replace(/^0(?=5)/, '') : q;
  const cells = sh.createTextFinder(term).matchCase(false).findAll();
  const seen = {}, rows = [];
  for (let i = 0; i < cells.length && rows.length < MAX_SEARCH; i++) {
    const r = cells[i].getRow(); if (r < 2 || seen[r]) continue; seen[r] = 1; rows.push(r);
  }
  rows.sort(function (a, b) { return a - b; });
  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i; while (j + 1 < rows.length && rows[j + 1] - rows[j] <= 60) j++;
    const from = rows[i], v = sh.getRange(from, 1, rows[j] - from + 1, 7).getValues();
    for (let k = i; k <= j; k++) out.push(row_(v[rows[k] - from], rows[k]));
    i = j + 1;
  }
  return { rows: out, more: rows.length >= MAX_SEARCH };
}
