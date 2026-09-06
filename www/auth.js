// Scrappy Bird accounts: Supabase Auth (email + Facebook), cloud best scores, leaderboard.
// Exposes window.Auth. The game calls Auth.submitScore() and reads Auth.bests.
(() => {
'use strict';
const CFG = window.SCRAPPY_CONFIG;
const cap = window.Capacitor;
const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const BIRD_NAMES = { birdie: 'Birdie', trumpet: 'Trumpet', sammich: 'Sammich', persu: 'Persu' };

const client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,   // on native we handle the deep link ourselves
  },
});

const Auth = {
  user: null, profile: null, bests: {}, guest: localStorage.getItem('scrappy_guest') === '1',
  ready: false, _readyCbs: [],
  onReady(cb) { this.ready ? cb() : this._readyCbs.push(cb); },
  displayName() { return this.profile ? this.profile.display_name : (this.user ? (this.user.email || 'player') : null); },
};
window.Auth = Auth;

// ---------- UI ----------
const $ = (sel) => document.querySelector(sel);
const overlay = document.createElement('div');
overlay.id = 'auth';
overlay.innerHTML = `
  <div class="card" role="dialog" aria-labelledby="auth-title">
    <h2 id="auth-title">Scrappy Bird</h2>
    <p class="sub">Sign in to save your best scores and appear on the leaderboard.</p>
    <form id="auth-form" autocomplete="on">
      <input id="auth-email" type="email" placeholder="Email" autocomplete="email" required maxlength="120">
      <input id="auth-pass" type="password" placeholder="Password (8+ characters)" autocomplete="current-password" minlength="8" required maxlength="128">
      <div class="row">
        <button type="submit" class="primary" data-action="signin">Sign in</button>
        <button type="button" data-action="signup">Create account</button>
      </div>
    </form>
    <button type="button" class="fb" data-action="facebook">Continue with Facebook</button>
    <button type="button" class="link" data-action="forgot">Forgot password?</button>
    <button type="button" class="ghost" data-action="guest">Play as guest</button>
    <p id="auth-msg" class="msg" aria-live="polite"></p>
  </div>`;
const bar = document.createElement('div');
bar.id = 'authbar';
bar.innerHTML = `<button type="button" id="btn-account" title="Account">&#128100;</button><button type="button" id="btn-board" title="Leaderboard">&#127942;</button>`;
const board = document.createElement('div');
board.id = 'board';
board.innerHTML = `<div class="card"><h2 id="board-title">Leaderboard</h2><ol id="board-list"></ol><p id="board-msg" class="msg"></p><button type="button" class="primary" data-action="close-board">Close</button></div>`;
const style = document.createElement('style');
style.textContent = `
  #auth, #board { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.65); z-index:10; }
  #auth[hidden], #board[hidden] { display:none; }
  #auth .card, #board .card { width:min(92vw, 320px); background:#ded895; border:3px solid #3a2a00; border-radius:10px; padding:16px; box-sizing:border-box; color:#3a2a00; font-family:'Segoe UI',Arial,sans-serif; }
  #auth h2, #board h2 { margin:0 0 4px; font-size:22px; text-align:center; }
  #auth .sub { margin:0 0 12px; font-size:12px; text-align:center; color:#5a4a1a; }
  #auth input { width:100%; box-sizing:border-box; padding:10px; margin:0 0 8px; border:2px solid #3a2a00; border-radius:6px; font-size:14px; background:#fff8dc; }
  #auth .row { display:flex; gap:8px; }
  #auth button, #board button { width:100%; padding:10px; margin:0 0 8px; border:2px solid #3a2a00; border-radius:6px; font-size:14px; font-weight:bold; cursor:pointer; background:#fff3b0; color:#3a2a00; }
  #auth button.primary, #board button.primary { background:#f7e14a; }
  #auth button.fb { background:#1877f2; color:#fff; border-color:#0d4fa8; }
  #auth button.ghost { background:transparent; }
  #auth button.link { background:transparent; border:none; font-weight:normal; font-size:12px; text-decoration:underline; padding:2px; margin:0 0 6px; }
  #auth button:disabled { opacity:.6; cursor:default; }
  .msg { min-height:16px; margin:4px 0 0; font-size:12px; text-align:center; color:#8e1020; }
  .msg.ok { color:#2f6b12; }
  #authbar { position:fixed; top:8px; left:8px; z-index:5; display:flex; gap:6px; }
  #authbar button { width:36px; height:36px; border:2px solid #3a2a00; border-radius:8px; background:rgba(255,243,176,.9); font-size:18px; cursor:pointer; }
  #board ol { margin:8px 0 12px; padding-left:24px; font-size:14px; max-height:50vh; overflow:auto; }
  #board li { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(58,42,0,.2); }
  #board li.me { font-weight:bold; }
`;
document.head.appendChild(style);
document.body.appendChild(overlay); document.body.appendChild(bar); document.body.appendChild(board);
overlay.hidden = true; board.hidden = true;
if (!CFG.facebookLogin) overlay.querySelector('[data-action=facebook]').remove();

const msg = (text, ok) => { const m = $('#auth-msg'); m.textContent = text || ''; m.className = 'msg' + (ok ? ' ok' : ''); };
const busy = (on) => overlay.querySelectorAll('button').forEach(b => b.disabled = on);
const emailOf = () => $('#auth-email').value.trim();
const passOf  = () => $('#auth-pass').value;

function friendly(err) {
  const m = (err && err.message) || String(err);
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Check your inbox and confirm your email first.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/password/i.test(m) && /short|least/i.test(m)) return 'Password must be at least 8 characters.';
  if (/rate limit/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(m)) return 'No connection. You can still play as a guest.';
  return m;
}

overlay.addEventListener('click', async (e) => {
  const action = e.target.dataset && e.target.dataset.action;
  if (!action) return;
  if (action === 'guest') { Auth.guest = true; localStorage.setItem('scrappy_guest', '1'); overlay.hidden = true; return; }
  if (action === 'signup') {
    if (!$('#auth-form').reportValidity()) return;
    busy(true); msg('');
    const { error } = await client.auth.signUp({ email: emailOf(), password: passOf(),
      options: { emailRedirectTo: isNative ? CFG.nativeRedirect : window.location.origin } });
    busy(false);
    msg(error ? friendly(error) : 'Account created. Check your email for a confirmation link.', !error);
    return;
  }
  if (action === 'forgot') {
    if (!emailOf()) { msg('Type your email first.'); return; }
    busy(true);
    const { error } = await client.auth.resetPasswordForEmail(emailOf(), { redirectTo: isNative ? CFG.nativeRedirect : window.location.origin });
    busy(false); msg(error ? friendly(error) : 'Password reset email sent.', !error);
    return;
  }
  if (action === 'facebook') { busy(true); msg(''); try { await oauth('facebook'); } catch (err) { msg(friendly(err)); } busy(false); return; }
  if (action === 'signout') { await client.auth.signOut(); Auth.guest = false; localStorage.removeItem('scrappy_guest'); renderOverlay(); return; }
});
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  busy(true); msg('');
  const { error } = await client.auth.signInWithPassword({ email: emailOf(), password: passOf() });
  busy(false);
  if (error) msg(friendly(error)); else overlay.hidden = true;
});
$('#btn-account').addEventListener('click', () => { renderOverlay(); overlay.hidden = false; });
$('#btn-board').addEventListener('click', showBoard);
board.addEventListener('click', (e) => { if (e.target.dataset.action === 'close-board') board.hidden = true; });

function renderOverlay() {
  const signedIn = !!Auth.user;
  $('#auth-form').hidden = signedIn;
  const fb = overlay.querySelector('[data-action=facebook]'); if (fb) fb.hidden = signedIn;
  overlay.querySelector('[data-action=forgot]').hidden = signedIn;
  const guestBtn = overlay.querySelector('[data-action=guest]');
  guestBtn.textContent = signedIn ? 'Sign out' : 'Play as guest';
  guestBtn.dataset.action = signedIn ? 'signout' : 'guest';
  overlay.querySelector('.sub').textContent = signedIn
    ? 'Signed in as ' + Auth.displayName() + '. Best scores are saved to your account.'
    : 'Sign in to save your best scores and appear on the leaderboard.';
  msg('');
}

// ---------- OAuth (Facebook) ----------
async function oauth(provider) {
  if (!isNative) {
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) throw error; return;
  }
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: CFG.nativeRedirect, skipBrowserRedirect: true } });
  if (error) throw error;
  await cap.Plugins.Browser.open({ url: data.url, presentationStyle: 'popover' });
}
// The deep link scrappybird://auth?code=... comes back here (OAuth, email confirm, password reset).
if (isNative) {
  cap.Plugins.App.addListener('appUrlOpen', async ({ url }) => {
    try {
      const u = new URL(url);
      const code = u.searchParams.get('code');
      if (code) { const { error } = await client.auth.exchangeCodeForSession(code); if (error) throw error; }
      try { await cap.Plugins.Browser.close(); } catch (e) {}
      overlay.hidden = true;
    } catch (err) { overlay.hidden = false; msg(friendly(err)); }
  });
}

// ---------- Session + data ----------
async function loadProfileAndBests() {
  Auth.profile = null; Auth.bests = {};
  if (!Auth.user) return;
  const [{ data: p }, { data: b }] = await Promise.all([
    client.from('profiles').select('display_name').eq('id', Auth.user.id).maybeSingle(),
    client.rpc('my_bests'),
  ]);
  Auth.profile = p || null;
  (b || []).forEach(r => { Auth.bests[r.bird] = r.best; });
  window.dispatchEvent(new CustomEvent('scrappy:bests'));
}
client.auth.onAuthStateChange(async (_event, session) => {
  Auth.user = session ? session.user : null;
  if (Auth.user) { Auth.guest = false; localStorage.removeItem('scrappy_guest'); overlay.hidden = true; }
  await loadProfileAndBests();
  if (!Auth.ready) { Auth.ready = true; Auth._readyCbs.splice(0).forEach(cb => cb()); }
  if (!Auth.user && !Auth.guest) { renderOverlay(); overlay.hidden = false; }
});

// Submit a finished run. Fails silently for guests / offline; the server validates everything.
Auth.submitScore = async function (bird, score, durationMs) {
  if (!Auth.user || score <= 0) return null;
  try {
    const { data, error } = await client.rpc('submit_score', { p_bird: bird, p_score: Math.floor(score), p_duration_ms: Math.floor(durationMs) });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) { Auth.bests[bird] = row.best; window.dispatchEvent(new CustomEvent('scrappy:bests')); }
    return row;
  } catch (err) { console.warn('score not saved:', err.message || err); return null; }
};

async function showBoard() {
  const bird = (window.__currentBird && window.__currentBird()) || 'birdie';
  $('#board-title').textContent = 'Top ' + BIRD_NAMES[bird];
  const list = $('#board-list'); list.innerHTML = ''; $('#board-msg').textContent = '';
  board.hidden = false;
  if (!Auth.user) { $('#board-msg').textContent = 'Sign in to see the leaderboard.'; return; }
  const { data, error } = await client.rpc('leaderboard', { p_bird: bird, p_limit: 10 });
  if (error) { $('#board-msg').textContent = friendly(error); return; }
  if (!data || !data.length) { $('#board-msg').textContent = 'No scores yet. Be the first!'; return; }
  const me = Auth.displayName();
  data.forEach(r => {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = r.display_name;   // textContent: never inject HTML from the server
    const sc = document.createElement('span'); sc.textContent = r.score;
    li.appendChild(name); li.appendChild(sc);
    if (r.display_name === me) li.className = 'me';
    list.appendChild(li);
  });
}
})();
