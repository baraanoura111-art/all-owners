/* All Owners — talks to the Apps Script back end (config.js) with a PIN login token. */
var TK = 'aoToken', UK = 'aoUser', SK = 'aoState', DK = 'aoDesk', mem = {};
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || mem[k] || ''; if (v === null) { localStorage.removeItem(k); delete mem[k]; } else { localStorage.setItem(k, v); mem[k] = v; } } catch (e) { if (v === undefined) return mem[k] || ''; if (v === null) delete mem[k]; else mem[k] = v; } }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var tt; function toast(m) { var t = $('toast'); t.textContent = m; t.className = 'on'; clearTimeout(tt); tt = setTimeout(function () { t.className = ''; }, 2200); }

function api(action, args, tries) {
  tries = tries || 0;
  if (!window.API_URL || /PASTE/.test(window.API_URL)) return Promise.reject(new Error('The back-end address is not set yet (config.js).'));
  return fetch(window.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, args: args || [], token: store(TK), pin: action === 'login' ? args[0] : undefined, ua: navigator.userAgent }) })
    .then(function (r) { if (!r.ok) throw new Error('No response (' + r.status + ').'); return r.json(); })
    .then(function (j) { if (!j.ok) { var e = new Error(j.error || 'Something went wrong'); e.auth = !!j.auth; throw e; } return j.result; })
    .catch(function (e) {
      if (!e.auth && action !== 'login' && tries < 2 && /fetch|network|load failed/i.test(e.message)) return new Promise(function (r) { setTimeout(r, 1500 * (tries + 1)); }).then(function () { return api(action, args, tries + 1); });
      if (e.auth && action !== 'login') showLogin(e.message);
      throw e;
    });
}

/* ---------- Login ---------- */
function showLogin(msg) { $('app').style.display = 'none'; $('login').style.display = ''; $('loginErr').textContent = msg || ''; setTimeout(function () { $('pin').focus(); }, 50); }
function doLogin() {
  var pin = $('pin').value.trim(); if (!pin) return;
  $('loginBtn').disabled = true; $('loginErr').textContent = '';
  api('login', [pin]).then(function (r) { store(TK, r.token); store(UK, r.user); $('pin').value = ''; start(); })
    .catch(function (e) { $('loginErr').textContent = e.message; })
    .then(function () { $('loginBtn').disabled = false; });
}
function logout() { store(TK, null); store(UK, null); IDX = null; showLogin(''); }

/* ---------- Screen ---------- */
var IDX = null, S = { area: '', cl: '', unit: '' }, T = 0, seq = 0;
var lap = !/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
try { var st = JSON.parse(store(SK) || '{}'); S.area = st.area || ''; S.cl = st.cl || ''; } catch (e) {}
function save() { store(SK, JSON.stringify({ area: S.area, cl: S.cl })); }
function saveDesk() { store(DK, $('desk').checked ? '1' : null); }
function state(h) { return '<div class="note">' + h + '</div>'; }
function clearOut() { $('out').innerHTML = state('Pick an area and a building or cluster, then type a unit number. Or search every area by owner name, phone or email.'); }

function start() {
  $('login').style.display = 'none'; $('app').style.display = '';
  $('who').textContent = store(UK) ? 'Signed in as ' + store(UK) + ' ·' : '';
  document.body.classList.toggle('lap', lap); $('desk').checked = !!store(DK);
  $('out').innerHTML = state('Loading areas…');
  api('getOwnerIndex').then(function (x) {
    IDX = x;
    if (S.cl && !IDX.list.some(function (b) { return b.cl === S.cl; })) S.cl = '';
    draw();
    if (S.cl) fetchOwners(); else clearOut();
  }).catch(function (e) { if (!e.auth) $('out').innerHTML = state('<b>Not loaded</b>' + esc(e.message)); });
}
function n(x) { return Number(x).toLocaleString('en-US'); }
function draw() {
  if (!IDX) return;
  var areas = {}; IDX.list.forEach(function (x) { areas[x.area] = (areas[x.area] || 0) + x.n; });
  $('area').innerHTML = '<option value="">All areas · ' + n(IDX.total) + ' owners</option>' + Object.keys(areas).sort().map(function (a) {
    return '<option value="' + esc(a) + '"' + (a === S.area ? ' selected' : '') + '>' + esc(a) + ' · ' + n(areas[a]) + '</option>'; }).join('');
  var bl = IDX.list.filter(function (x) { return !S.area || x.area === S.area; }).sort(function (a, b) { return a.cl.localeCompare(b.cl, 'en', { numeric: true, sensitivity: 'base' }); });
  $('cl').innerHTML = '<option value="">Building or cluster · ' + bl.length + '</option>' + bl.map(function (x) {
    return '<option value="' + esc(x.cl) + '"' + (x.cl === S.cl ? ' selected' : '') + '>' + esc(x.cl) + (S.area ? '' : ' (' + esc(x.area) + ')') + ' · ' + n(x.n) + '</option>'; }).join('');
  $('unit').disabled = !S.cl;
}
function fetchOwners() {
  if (!S.cl) { clearOut(); return; }
  var my = ++seq, label = S.cl + (S.unit ? ' · unit ' + S.unit : '');
  $('out').innerHTML = state('Loading owners…');
  api('getOwners', [S.cl, S.unit]).then(function (r) { if (my === seq) list(r, label, false); })
    .catch(function (e) { if (my === seq && !e.auth) $('out').innerHTML = state('<b>Not loaded</b>' + esc(e.message)); });
}
function search() {
  var q = $('q').value.trim(); if (q.length < 3) { toast('Type at least 3 letters or digits'); return; }
  var my = ++seq; $('out').innerHTML = state('Searching all owners…'); $('q').blur();
  api('searchOwners', [q]).then(function (r) { if (my === seq) list(r, '“' + q + '”', true); })
    .catch(function (e) { if (my === seq && !e.auth) $('out').innerHTML = state('<b>Not done</b>' + esc(e.message)); });
}
function waUrl(p) { return (lap && $('desk').checked) ? 'whatsapp://send?phone=' + p : 'https://wa.me/' + p; }
function copy(t) {
  var done = function () { toast('Copied ' + t); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  function fallback() { var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); }
}
var LEFT = null, LIMIT = 100, WIDE = false;
function leftTxt() { return LEFT === null ? '' : LEFT + ' of ' + LIMIT + ' contacts left today'; }
function rowHtml(o) {
  var num = o.wa ? '+' + o.wa : o.ph, acts;
  if (o.shown) {
    acts = (o.wa ? '<a class="wa" href="' + esc(waUrl(o.wa)) + '" target="_blank" rel="noopener">WhatsApp</a><a href="tel:+' + esc(o.wa) + '">Call</a>' : (o.ph ? '<a href="tel:' + esc(o.ph) + '">Call</a>' : '')) +
      (num ? '<button type="button" data-c="' + esc(num) + '">Copy</button>' : '') +
      (o.e ? '<a href="mailto:' + esc(o.e) + '">Email</a>' : '') || '<span class="none">No contact details</span>';
  } else acts = o.has ? '<button type="button" class="show" data-r="' + o.row + '">Show contact</button>' : '<span class="none">No contact details</span>';
  var sub = [WIDE ? o.cl + ' · ' + o.area : '', o.shown ? num : '', o.shown ? o.e : ''].filter(Boolean).join(' · ');
  return '<div class="r" id="r' + o.row + '"><div class="u">' + esc(o.u || '—') + '</div><div class="m"><b>' + esc(o.n || 'No name') + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div><div class="a">' + acts + '</div></div>';
}
function list(r, label, wide) {
  WIDE = wide; if (r.left !== undefined) { LEFT = r.left; LIMIT = r.limit || LIMIT; }
  if (!r.rows.length) { $('out').innerHTML = state('<b>No owners found</b>' + esc(label)); return; }
  var h = '<div class="h"><span>' + n(r.rows.length) + (r.more ? '+' : '') + ' owner' + (r.rows.length === 1 ? '' : 's') + ' · ' + esc(label) + '</span><em id="left">' + leftTxt() + '</em></div>';
  h += r.rows.map(rowHtml).join('');
  if (r.more) h += '<div class="note">Showing the first ' + n(r.rows.length) + '. Narrow it down with a unit number or a fuller name.</div>';
  $('out').innerHTML = h;
}
function reveal(b) {
  var row = b.getAttribute('data-r'); b.disabled = true; b.textContent = 'Loading…';
  api('revealOwner', [Number(row)]).then(function (x) {
    LEFT = x.left; var el = $('r' + row); if (el) el.outerHTML = rowHtml(x.o);
    if ($('left')) $('left').textContent = leftTxt();
  }).catch(function (e) { b.disabled = false; b.textContent = 'Show contact'; if (!e.auth) toast(e.message); });
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-c]'); if (b) copy(b.getAttribute('data-c'));
  var s = e.target.closest('[data-r]'); if (s && !s.disabled) reveal(s);
});

if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
if (store(TK)) start(); else showLogin('');
