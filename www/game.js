(() => {
'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ---------- Original Flappy Bird tuning (per-frame values at 60 fps) ----------
const GRAVITY     = 0.25;   // px/frame^2
const FLAP_VEL    = -4.6;   // px/frame
const MAX_FALL    = 9;
const PIPE_SPEED  = 2;      // px/frame
const PIPE_W      = 52;
const PIPE_GAP    = 100;
const PIPE_EVERY  = 90;     // frames between pipes (~1.5 s)
const GROUND_H    = 112;
const BIRD_X      = 64;
const BIRD_R      = 12;     // hitbox radius
const GROUND_Y    = H - GROUND_H;

// ---------- Scrappy difficulty stages ----------
// Limbs are lost at these scores. Each stage changes how the bird responds.
const STAGE_AT = [0, 50, 100];

// ---------- Audio (tiny synth, no assets) ----------
let audioCtx = null, muted = false;
function beep(freq, dur, type, vol, slide) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + dur);
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  flap:  () => beep(500, 0.08, 'square', 0.05, 300),
  score: () => { beep(880, 0.07, 'square', 0.06, 0); setTimeout(() => beep(1320, 0.1, 'square', 0.06, 0), 70); },
  hit:   () => beep(150, 0.25, 'sawtooth', 0.12, -100),
  wing:  () => { beep(300, 0.15, 'sawtooth', 0.1, -150); setTimeout(() => beep(200, 0.3, 'sawtooth', 0.1, -150), 120); },
  pick:  () => beep(660, 0.06, 'square', 0.05, 200),
};

// ---------- Utilities ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ell = (x, y, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); };

// =====================================================================
//  CHARACTERS
//  Each bird has: a sprite (draw), a flight animation, a background,
//  a ground palette, a limb name and stage text for the wing-loss system.
// =====================================================================
const CHARACTERS = [
  {
    id: 'birdie', name: 'Birdie', tagline: 'The original. Mostly feathers.',
    limb: 'wing', limbs: 'wings', particle: '#f4d03f',
    stages: [
      ['Two wings',        'Just like you remember.'],
      ['Lost left wing!',  'Flaps are uneven. It drifts and rolls.'],
      ['Lost both wings!', 'Flapping with tail feathers only. Good luck.'],
    ],
    ground: { fill: '#ded895', top: '#73bf2e', topDark: '#5a9e1f', line: '#c9bd7a', style: 'grass' },
    drawBackground: drawBgSky, draw: drawScrappy,
  },
  {
    id: 'trumpet', name: 'Trumpet', tagline: 'Tremendous flapping. The best flapping.',
    limb: 'hand', limbs: 'hands', particle: '#f7d774',
    stages: [
      ['Both hands',        'Nobody flaps better than me. Believe me.'],
      ['Lost a hand! Sad!', 'Very unfair. Flaps are now totally rigged.'],
      ['No hands! Disaster!', 'Flying on tie power alone. Fake wings!'],
    ],
    ground: { fill: '#a8d672', top: '#4e9a2e', topDark: '#3c7d22', line: '#8fbf5a', style: 'grass' },
    drawBackground: drawBgWhiteHouse, draw: drawPresident, drawObstacle: drawBorderWall,
  },
  {
    id: 'sammich', name: 'Sammich', tagline: 'Crusty. Flaky. Slightly spicy.',
    limb: 'lettuce leaf', limbs: 'leaves', particle: '#6cbf3a',
    stages: [
      ['Two lettuce leaves', 'Fresh out of the oven.'],
      ['Lost a leaf!',       'Going stale. Flaps are wilting.'],
      ['No leaves! Just crust!', 'Crumbs for wings. Extra chili.'],
    ],
    ground: { fill: '#6b6b6b', top: '#8a8a8a', topDark: '#f2c230', line: '#4f4f4f', style: 'road' },
    drawBackground: drawBgSaigon, draw: drawBanhMi, drawObstacle: drawSteamers,
  },
  {
    id: 'persu', name: 'Persu', tagline: 'Just trying to reach Parliament.',
    limb: 'wing', limbs: 'wings', particle: '#e8b923', events: true,
    stages: [['Clean record', 'So far so good.'], ['', ''], ['', '']],
    ground: { fill: '#9a9a96', top: '#b8b8b2', topDark: '#7d7d78', line: '#6e6e6a', style: 'road' },
    drawBackground: drawBgParliament, draw: drawPersu, drawObstacle: drawJailBars,
  },
];

// Random scandal events for Persu. Minor ones fade; severe ones leave permanent damage.
const SCANDALS = {
  minor: [
    ['Flock member posts something awful', 'Screenshots everywhere. Flight gets shaky.'],
    ['Flock member "was hacked"', 'The post is still up. Wobble incoming.'],
    ['Late-night rant goes viral', '"Taken out of context." Sure.'],
    ['Flock member deletes tweet', 'Too late. The internet remembers.'],
    ['Old forum posts resurface', 'From 2009. Still counts.'],
  ],
  severe: [
    ['BREAKING: Felony charge in the flock', 'Serious damage. The flock is in freefall.'],
    ['BREAKING: Flock member indicted', 'Court date set. Flying is now a struggle.'],
    ['BREAKING: Flock member convicted', 'Permanent damage. Good luck reaching Parliament.'],
  ],
};
let charIndex = clamp(+localStorage.getItem('scrappy_char') || 0, 0, CHARACTERS.length - 1);
const CH = () => CHARACTERS[charIndex];
window.__currentBird = () => CH().id;

// ---------- Game state ----------
let state = 'ready';   // ready | play | dead
let frame = 0, score = 0, best = 0, runStart = 0;
function loadBest() {
  const local = +localStorage.getItem('scrappy_best_' + CH().id) || 0;
  const cloud = (window.Auth && window.Auth.bests && window.Auth.bests[CH().id]) || 0;
  best = Math.max(local, cloud);
}
window.addEventListener('scrappy:bests', loadBest);
let bird, pipes, groundX, stage, stageBanner, bannerTitle = '', bannerDesc = '', feathers, shake, deadTimer = 0;

function reset() {
  bird = { x: BIRD_X, y: H / 2 - 40, vy: 0, vx: 0, rot: 0, spin: 0, wingT: 99, squash: 0,
           wings: 2, leftWing: true, rightWing: true, wobble: 0,
           heat: 0, scars: 0, scandals: 0, nextEvent: 0, alert: 0 };
  pipes = []; feathers = [];
  groundX = 0; frame = 0; score = 0; stage = 0; stageBanner = 0; shake = 0;
}
reset(); loadBest();

// ---------- Input ----------
function flap() {
  if (state === 'dead') {
    if (deadTimer > 30) { reset(); state = 'ready'; }
    return;
  }
  if (state === 'ready') { state = 'play'; runStart = performance.now(); }
  doFlap();
}
function doFlap() {
  bird.wingT = 0; bird.squash = 8;
  sfx.flap();
  if (CH().events) {
    // Persu: how badly the flap goes depends on current scandal damage (0..1).
    const d = damage();
    bird.vy = FLAP_VEL * (1 + rand(-d, d) * 0.55);
    bird.vx += rand(-d, d) * 2.2;
    bird.spin += rand(-d, d) * 0.22;
    if (d > 0.3) spawnFeathers(1);
    return;
  }
  if (stage === 0) {
    // Original: deterministic impulse.
    bird.vy = FLAP_VEL;
    return;
  }
  if (stage === 1) {
    // One limb: lift is weaker and inconsistent; each flap also shoves the bird
    // sideways and kicks a roll.
    bird.vy = FLAP_VEL * rand(0.75, 1.25);
    bird.vx += rand(-1.6, -0.4);
    bird.spin += rand(-0.12, 0.12);
    spawnFeathers(2);
    return;
  }
  // No limbs: sometimes a dud, sometimes an over-flap.
  const roll = Math.random();
  let mult;
  if (roll < 0.18)      mult = 0.35;          // dud flap
  else if (roll < 0.33) mult = 1.55;          // panic over-flap
  else                  mult = rand(0.7, 1.3);
  bird.vy = FLAP_VEL * mult;
  bird.vx += rand(-1.8, 1.8);
  bird.spin += rand(-0.25, 0.25);
  spawnFeathers(1);
}
function damage() { return clamp(bird.heat + bird.scars, 0, 1); }
function scandal(severe) {
  const list = severe ? SCANDALS.severe : SCANDALS.minor;
  const pick = list[Math.floor(Math.random() * list.length)];
  bannerTitle = pick[0]; bannerDesc = pick[1]; stageBanner = severe ? 200 : 140;
  bird.scandals++; bird.alert = severe ? 120 : 70;
  if (severe) { bird.heat = 1; bird.scars = Math.min(0.6, bird.scars + 0.18); shake = 14; sfx.wing(); }
  else         { bird.heat = Math.min(1, bird.heat + 0.4); shake = 6; sfx.hit(); }
  for (let i = 0; i < (severe ? 14 : 5); i++)
    feathers.push({ x: bird.x, y: bird.y, vx: rand(-4, 2), vy: rand(-4, 1),
                    rot: rand(0, 6.28), life: rand(60, 120), t: 0, color: CH().particle });
  bird.nextEvent = frame + rand(240, 520);
}
function selectChar(i) {
  charIndex = (i + CHARACTERS.length) % CHARACTERS.length;
  localStorage.setItem('scrappy_char', charIndex);
  loadBest();
  sfx.pick();
}

// Portrait boxes on the title screen (canvas coordinates).
const PORTRAIT = { y: 286, size: 56, xs: [42, 110, 178, 246] };
function portraitAt(cx, cy) {
  if (cy < PORTRAIT.y || cy > PORTRAIT.y + PORTRAIT.size) return -1;
  for (let i = 0; i < PORTRAIT.xs.length; i++)
    if (Math.abs(cx - PORTRAIT.xs[i]) <= PORTRAIT.size / 2) return i;
  return -1;
}
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * W / r.width, y: (src.clientY - r.top) * H / r.height };
}
function pointerDown(e) {
  e.preventDefault();
  if (dialogOpen()) return;
  if (state === 'ready') {
    const p = canvasPoint(e), i = portraitAt(p.x, p.y);
    if (i >= 0) { selectChar(i); return; }
  }
  flap();
}
const dialogOpen = () => document.querySelector('#auth:not([hidden]), #board:not([hidden])');
window.addEventListener('keydown', e => {
  if (dialogOpen()) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) flap(); }
  if (e.code === 'KeyM') muted = !muted;
  if (state === 'ready' && e.code === 'ArrowLeft')  selectChar(charIndex - 1);
  if (state === 'ready' && e.code === 'ArrowRight') selectChar(charIndex + 1);
});
canvas.addEventListener('mousedown', pointerDown);
canvas.addEventListener('touchstart', pointerDown, { passive: false });

// ---------- Update ----------
function spawnPipe() {
  const minTop = 40, maxTop = GROUND_Y - PIPE_GAP - 40;
  pipes.push({ x: W + 10, top: rand(minTop, maxTop), passed: false });
}
function spawnFeathers(n, color) {
  for (let i = 0; i < n; i++)
    feathers.push({ x: bird.x - 6, y: bird.y, vx: rand(-2.5, -0.5), vy: rand(-1.5, 0.5),
                    rot: rand(0, 6.28), life: rand(40, 80), t: 0, color: color || CH().particle });
}
function loseWing() {
  sfx.wing(); shake = 12; stageBanner = 150;
  bannerTitle = CH().stages[stage][0]; bannerDesc = CH().stages[stage][1];
  if (bird.leftWing) bird.leftWing = false; else bird.rightWing = false;
  bird.wings--;
  for (let i = 0; i < 14; i++)
    feathers.push({ x: bird.x, y: bird.y, vx: rand(-4, 2), vy: rand(-4, 1),
                    rot: rand(0, 6.28), life: rand(60, 120), t: 0, color: CH().particle });
}
function checkStage() {
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (score >= STAGE_AT[i]) s = i;
  while (stage < s) { stage++; loseWing(); }
}

function update() {
  frame++;
  if (state !== 'dead') groundX = (groundX - PIPE_SPEED) % 24;

  if (state === 'ready') {
    bird.y = H / 2 - 40 + Math.sin(frame / 12) * 5;
    bird.rot = 0; bird.wingT++;
    if (bird.squash > 0) bird.squash--;
    return;
  }

  if (state === 'play') {
    bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);

    if (CH().events) {
      if (bird.nextEvent === 0) bird.nextEvent = frame + rand(200, 360);
      if (frame >= bird.nextEvent) scandal(Math.random() < 0.28);
      bird.heat = Math.max(0, bird.heat - 0.0035);
      if (bird.alert > 0) bird.alert--;
      const d = damage();
      if (d > 0) {
        bird.wobble += rand(-1, 1) * 0.16 * d;
        bird.wobble *= 0.96;
        bird.vy += bird.wobble;
        bird.spin += rand(-1, 1) * 0.03 * d;
        bird.spin *= 0.9;
        bird.vx += (BIRD_X - bird.x) * 0.015;
        bird.vx *= 0.94;
        bird.x = clamp(bird.x + bird.vx, 24, W - PIPE_W - 30);
      }
    } else if (stage >= 1) {
      // Constant turbulence: an unbalanced bird cannot hold a line.
      const turb = stage === 1 ? 0.06 : 0.14;
      bird.wobble += rand(-turb, turb);
      bird.wobble *= 0.96;
      bird.vy += bird.wobble;
      bird.spin += stage === 1 ? rand(-0.01, 0.01) : rand(-0.03, 0.03);
      bird.spin *= 0.9;
      bird.vx += (BIRD_X - bird.x) * 0.015;   // spring back toward home column
      bird.vx *= 0.94;
      bird.x = clamp(bird.x + bird.vx, 24, W - PIPE_W - 30);
    }
    bird.y += bird.vy;
    bird.wingT++;
    if (bird.squash > 0) bird.squash--;

    // Rotation: tilt up on flap, nose down when falling (like the original).
    const targetRot = bird.vy < 0 ? -0.45 : clamp(bird.vy / MAX_FALL * 1.4, 0, 1.4);
    bird.rot += (targetRot - bird.rot) * 0.12 + bird.spin;

    if (frame % PIPE_EVERY === 0) spawnPipe();
    for (const p of pipes) {
      p.x -= PIPE_SPEED;
      if (!p.passed && p.x + PIPE_W < bird.x) {
        p.passed = true; score++; sfx.score(); if (!CH().events) checkStage();
      }
    }
    pipes = pipes.filter(p => p.x > -PIPE_W - 10);

    if (bird.y + BIRD_R >= GROUND_Y) { bird.y = GROUND_Y - BIRD_R; die(); }
    if (bird.y - BIRD_R <= 0) { bird.y = BIRD_R; bird.vy = 0; }
    for (const p of pipes) {
      const cx = clamp(bird.x, p.x, p.x + PIPE_W);
      const inX = Math.abs(bird.x - cx) < BIRD_R;
      const hitTop = bird.y - BIRD_R < p.top;
      const hitBot = bird.y + BIRD_R > p.top + PIPE_GAP;
      if (inX && (hitTop || hitBot)) { die(); break; }
    }
  }

  if (state === 'dead') {
    deadTimer++;
    if (bird.y + BIRD_R < GROUND_Y) {
      bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);
      bird.y += bird.vy;
      bird.rot = Math.min(bird.rot + 0.1, 1.5);
    } else bird.y = GROUND_Y - BIRD_R;
  }

  for (const f of feathers) { f.t++; f.x += f.vx; f.y += f.vy; f.vy += 0.05; f.vx *= 0.98; f.rot += 0.1; }
  feathers = feathers.filter(f => f.t < f.life);
  if (shake > 0) shake--;
  if (stageBanner > 0) stageBanner--;
}

function die() {
  if (state === 'dead') return;
  state = 'dead'; deadTimer = 0; shake = 10; sfx.hit();
  if (score > best) { best = score; localStorage.setItem('scrappy_best_' + CH().id, best); }
  if (window.Auth) window.Auth.submitScore(CH().id, score, performance.now() - runStart);
}

// =====================================================================
//  BACKGROUNDS
// =====================================================================
function skyGradient(c1, c2, c3) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, c1); if (c3) { g.addColorStop(0.55, c2); g.addColorStop(1, c3); } else g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);
}
// Repeats a drawing every `period` px, scrolled at `speed` px/frame.
function tiled(period, speed, drawAt) {
  const off = (frame * speed) % period;
  for (let x = -off - period; x < W + period; x += period) drawAt(x);
}
function clouds(speed, color) {
  ctx.fillStyle = color;
  tiled(200, speed, x => {
    ell(x + 30, 60, 22, 10); ctx.fill(); ell(x + 48, 54, 16, 12); ctx.fill();
    ell(x + 140, 110, 18, 8); ctx.fill(); ell(x + 154, 105, 12, 9); ctx.fill();
  });
}

// 1. Classic: pastel sky, distant city, bushes.
function drawBgSky() {
  skyGradient('#4ec0ca', '#a6e3e9');
  ctx.fillStyle = '#d7f3e9';
  for (let i = 0; i < 12; i++) {
    const bx = ((i * 40) - (frame * 0.2) % 40 + W) % (W + 40) - 40;
    const bh = 30 + (i * 37) % 40;
    ctx.fillRect(bx, GROUND_Y - bh, 22, bh);
  }
  ctx.fillStyle = '#9edb6b';
  for (let i = 0; i < 14; i++) {
    const bx = ((i * 34) - (frame * 0.5) % 34 + W) % (W + 34) - 34;
    ctx.beginPath(); ctx.arc(bx, GROUND_Y + 4, 22, Math.PI, 0); ctx.fill();
  }
}

// 2. The White House: blue sky, clouds, columns, flag, hedges.
function drawBgWhiteHouse() {
  skyGradient('#5aa9e6', '#cfe8fb');
  clouds(0.15, 'rgba(255,255,255,.85)');
  tiled(440, 0.25, x => {
    const bx = x + 40, by = GROUND_Y, bw = 250, bh = 84;
    // main block
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(bx, by - bh, bw, bh);
    ctx.fillStyle = '#dcdcd4'; ctx.fillRect(bx, by - bh, bw, 6);           // roofline shadow
    ctx.fillStyle = '#e9e9e2'; ctx.fillRect(bx - 6, by - bh - 8, bw + 12, 8); // balustrade
    ctx.fillStyle = '#f4f4f0';
    for (let i = 0; i < 16; i++) ctx.fillRect(bx - 4 + i * 16, by - bh - 14, 6, 6); // balusters
    // windows
    ctx.fillStyle = '#7fa9c9';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) {
      const wx = bx + 8 + c * 25, wy = by - bh + 14 + r * 34;
      if (wx > bx + 70 && wx < bx + 170) continue; // skip behind portico
      ctx.fillRect(wx, wy, 9, 16);
    }
    // portico: pediment + columns
    const px = bx + 74, pw = 102;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(px - 8, by - bh - 10); ctx.lineTo(px + pw / 2, by - bh - 34); ctx.lineTo(px + pw + 8, by - bh - 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e4e4dc'; ctx.fillRect(px - 8, by - bh - 12, pw + 16, 6);
    for (let i = 0; i < 6; i++) {
      const cx = px + 6 + i * 18;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx, by - bh, 8, bh);
      ctx.fillStyle = '#d0d0c8'; ctx.fillRect(cx + 6, by - bh, 2, bh);
      ctx.fillStyle = '#eeeee6'; ctx.fillRect(cx - 2, by - bh, 12, 4); ctx.fillRect(cx - 2, by - 5, 12, 5);
    }
    // door
    ctx.fillStyle = '#3d3d3d'; ctx.fillRect(px + pw / 2 - 7, by - 26, 14, 26);
    ctx.fillStyle = '#c9a227'; ctx.fillRect(px + pw / 2 - 12, by - 30, 24, 4);
    // flag
    const fx = px + pw / 2, fy = by - bh - 34;
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30); ctx.stroke();
    const wave = Math.sin(frame / 8) * 2;
    for (let s = 0; s < 7; s++) { ctx.fillStyle = s % 2 ? '#fff' : '#c8102e'; ctx.fillRect(fx, fy - 30 + s * 2.5, 18 + wave, 2.5); }
    ctx.fillStyle = '#1f3a93'; ctx.fillRect(fx, fy - 30, 8, 9);
    // hedges and lawn
    ctx.fillStyle = '#2f7d32';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(bx - 10 + i * 34, by + 2, 14, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#3e9142';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(bx + 7 + i * 34, by + 4, 10, Math.PI, 0); ctx.fill(); }
  });
  // fountain spray, static foreground bit
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  tiled(440, 0.25, x => { ell(x + 165, GROUND_Y - 8 - Math.abs(Math.sin(frame / 10)) * 3, 3, 10); ctx.fill(); });
}

// 3. Saigon street at sunset: tube houses, lanterns, scooters.
function drawBgSaigon() {
  skyGradient('#ff8c5a', '#ffc98a', '#ffe9b8');
  // sun
  ctx.fillStyle = '#ffd166'; ell(W * 0.72, 90, 26, 26); ctx.fill();
  ctx.fillStyle = 'rgba(255,209,102,.35)'; ell(W * 0.72, 90, 40, 40); ctx.fill();
  // tube houses (narrow, tall, pastel)
  const cols = ['#f4c27a', '#7ec8c8', '#f28b82', '#c5e1a5', '#ffe082', '#b39ddb', '#80cbc4'];
  tiled(336, 0.4, x => {
    let hx = x;
    for (let i = 0; i < 7; i++) {
      const w = 40 + (i % 3) * 6, h = 90 + ((i * 53) % 60);
      const c = cols[i % cols.length];
      ctx.fillStyle = c; ctx.fillRect(hx, GROUND_Y - h, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(hx + w - 5, GROUND_Y - h, 5, h);   // side shade
      // balconies + windows
      for (let f = 0; f < Math.floor(h / 28); f++) {
        const fy = GROUND_Y - h + 12 + f * 28;
        ctx.fillStyle = '#5a3e2b'; ctx.fillRect(hx + 6, fy, w - 12, 12);
        ctx.fillStyle = f % 2 ? '#ffe9a8' : '#8fd3ff'; ctx.fillRect(hx + 9, fy + 2, w - 18, 8);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(hx + 4, fy + 12, w - 8, 3);            // balcony ledge
      }
      // shop awning at street level
      ctx.fillStyle = i % 2 ? '#e53935' : '#1e88e5'; ctx.fillRect(hx - 2, GROUND_Y - 24, w + 4, 8);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(hx + 8, GROUND_Y - 16, w - 16, 16);
      hx += w + 2;
    }
  });
  // lantern strings
  tiled(180, 0.6, x => {
    ctx.strokeStyle = 'rgba(60,30,10,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 150); ctx.quadraticCurveTo(x + 90, 190, x + 180, 150); ctx.stroke();
    for (let i = 1; i < 5; i++) {
      const t = i / 5, lx = x + t * 180, ly = 150 + (1 - Math.pow(2 * t - 1, 2)) * 20 + Math.sin(frame / 20 + i) * 2;
      ctx.fillStyle = '#e53935'; ell(lx, ly + 8, 6, 8); ctx.fill();
      ctx.fillStyle = '#f9d342'; ctx.fillRect(lx - 3, ly - 1, 6, 2); ctx.fillRect(lx - 1, ly + 16, 2, 5);
    }
  });
  // scooters zipping along the road edge
  tiled(230, 1.4, x => {
    const sy = GROUND_Y - 6;
    ctx.fillStyle = '#333'; ell(x + 8, sy, 5, 5); ctx.fill(); ell(x + 26, sy, 5, 5); ctx.fill();
    ctx.fillStyle = '#d32f2f'; ctx.fillRect(x + 6, sy - 9, 22, 6);
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(x + 12, sy - 20, 8, 11);        // rider
    ctx.fillStyle = '#ffd54f'; ell(x + 16, sy - 23, 5, 4); ctx.fill();      // helmet
  });
}

function drawGround() {
  const g = CH().ground, y = GROUND_Y;
  ctx.fillStyle = g.fill; ctx.fillRect(0, y, W, GROUND_H);
  ctx.fillStyle = g.top; ctx.fillRect(0, y, W, 12);
  if (g.style === 'grass') {
    ctx.fillStyle = g.topDark;
    for (let x = groundX - 24; x < W + 24; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + 12, y + 12); ctx.lineTo(x + 24, y); ctx.lineTo(x + 12, y); ctx.fill();
    }
  } else {
    // road: kerb + dashed centre line
    ctx.fillStyle = '#bdbdbd'; ctx.fillRect(0, y, W, 4);
    ctx.fillStyle = g.topDark;
    for (let x = groundX - 24; x < W + 24; x += 24) ctx.fillRect(x, y + 40, 14, 3);
  }
  ctx.fillStyle = g.line; ctx.fillRect(0, y + 12, W, 3);
}
function drawPipe(p) {
  const drawSeg = (x, y, w, h) => {
    ctx.fillStyle = '#73bf2e'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#9ee85a'; ctx.fillRect(x + 4, y, 8, h);
    ctx.fillStyle = '#4f8f1c'; ctx.fillRect(x + w - 8, y, 6, h);
    ctx.strokeStyle = '#2f5a10'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  drawSeg(p.x, -2, PIPE_W, p.top + 2);
  drawSeg(p.x - 3, p.top - 24, PIPE_W + 6, 24);
  const by = p.top + PIPE_GAP;
  drawSeg(p.x, by, PIPE_W, GROUND_Y - by + 2);
  drawSeg(p.x - 3, by, PIPE_W + 6, 24);
}

// Jail-bar gate: a steel frame with several vertical bars. Same hitbox as a pipe.
function drawJailBars(p) {
  const gate = (x, y, w, h) => {
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(x, y, w, h);                  // dark backplate
    ctx.fillStyle = '#5b626c';
    for (let i = 0; i < 4; i++) {                                          // vertical bars
      const bx = x + 6 + i * 12;
      ctx.fillRect(bx, y, 6, h);
      ctx.fillStyle = '#8b939e'; ctx.fillRect(bx + 1, y, 2, h); ctx.fillStyle = '#5b626c';
    }
    for (let cy = y + 20; cy < y + h - 8; cy += 44) {                      // cross braces
      ctx.fillStyle = '#4d535c'; ctx.fillRect(x, cy, w, 5);
      ctx.fillStyle = '#7e8791'; ctx.fillRect(x, cy, w, 1);
    }
    ctx.strokeStyle = '#1f2328'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  const plate = (x, y, w) => {
    ctx.fillStyle = '#6b727c'; ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = '#9aa2ac'; ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = '#1f2328'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, 12);
    ctx.fillStyle = '#c9ced4'; for (let i = 0; i < 4; i++) { ell(x + 8 + i * 14, y + 8, 1.5, 1.5); ctx.fill(); } // rivets
  };
  gate(p.x, -2, PIPE_W, p.top + 2);
  plate(p.x - 3, p.top - 14, PIPE_W + 6);
  const by = p.top + PIPE_GAP;
  gate(p.x, by, PIPE_W, GROUND_Y - by + 2);
  plate(p.x - 3, by, PIPE_W + 6);
}

// Border wall: tall rusty steel bollards on a concrete footing, barbed wire on the gap side.
function drawBorderWall(p) {
  const wall = (x, y, w, h) => {
    ctx.fillStyle = '#6e3b1f'; ctx.fillRect(x, y, w, h);                    // rusty backing
    for (let i = 0; i < 5; i++) {                                           // bollard slats
      const bx = x + 3 + i * 10;
      ctx.fillStyle = '#9a5a2e'; ctx.fillRect(bx, y, 7, h);
      ctx.fillStyle = '#c9803f'; ctx.fillRect(bx + 1, y, 2, h);
      ctx.fillStyle = '#5a2e14'; ctx.fillRect(bx + 5, y, 2, h);
    }
    ctx.strokeStyle = '#3a1c0a'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  const footing = (x, y, w) => {
    ctx.fillStyle = '#a9a49c'; ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = '#d0cbc2'; ctx.fillRect(x, y, w, 4);
    ctx.strokeStyle = '#4a4640'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, 14);
  };
  const wire = (x, y, w) => {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= w; i += 6) { ctx.lineTo(x + i, y + (i / 6 % 2 ? -3 : 3)); }
    ctx.stroke();
  };
  wall(p.x, -2, PIPE_W, p.top + 2);
  footing(p.x - 3, p.top - 16, PIPE_W + 6);
  const by = p.top + PIPE_GAP;
  wall(p.x, by, PIPE_W, GROUND_Y - by + 2);
  footing(p.x - 3, by, PIPE_W + 6);
  wire(p.x - 3, by - 4, PIPE_W + 6);
}

// Stacked bamboo steamer baskets, lid on the gap side.
function drawSteamers(p) {
  const stack = (x, y, w, h, fromTop) => {
    const n = Math.ceil(h / 26) + 1;
    for (let i = 0; i < n; i++) {
      const by = fromTop ? y + h - (i + 1) * 26 : y + i * 26;
      if (by + 26 < y - 2 || by > y + h) continue;
      ctx.fillStyle = '#d9b36a'; ctx.fillRect(x, by, w, 26);
      ctx.fillStyle = '#c39a4f'; ctx.fillRect(x, by, w, 3); ctx.fillRect(x, by + 23, w, 3);   // rims
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 1;
      for (let s = 4; s < w; s += 6) { ctx.beginPath(); ctx.moveTo(x + s, by + 4); ctx.lineTo(x + s, by + 22); ctx.stroke(); } // weave
      ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, by + 1, w - 2, 24);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y, w + 8, h); ctx.clip(); ctx.restore();
  };
  const lid = (x, y, w) => {
    ctx.fillStyle = '#e2c27f'; ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = '#c39a4f'; ctx.fillRect(x, y, w, 3);
    ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, 10);
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(x + w / 2 - 6, y + 4, 12, 3);   // handle
  };
  // clip so the stack does not spill past its segment
  ctx.save(); ctx.beginPath(); ctx.rect(p.x - 4, -2, PIPE_W + 8, p.top + 4); ctx.clip();
  stack(p.x, -2, PIPE_W, p.top + 2, true); ctx.restore();
  lid(p.x - 3, p.top - 12, PIPE_W + 6);
  const by = p.top + PIPE_GAP;
  ctx.save(); ctx.beginPath(); ctx.rect(p.x - 4, by, PIPE_W + 8, GROUND_Y - by + 2); ctx.clip();
  stack(p.x, by, PIPE_W, GROUND_Y - by + 2, false); ctx.restore();
  lid(p.x - 3, by, PIPE_W + 6);
  // steam wisps rising from the top of the lower stack
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  for (let i = 0; i < 3; i++) { const t = (frame / 20 + i) % 1; ell(p.x + 12 + i * 14, by - 4 - t * 16, 4 - t * 2, 3 - t * 2); ctx.fill(); }
}

// 4. Parliament: granite building with a big PARLIAMENT sign. It grows closer as you score.
function drawBgParliament() {
  skyGradient('#8fb8de', '#dfe9f2');
  clouds(0.1, 'rgba(255,255,255,.7)');
  // approach: 0 (far) .. 1 (arrived) based on score
  const t = clamp(score / 100, 0, 1);
  const sc = 0.45 + t * 0.9;
  const bw = 200 * sc, bh = 70 * sc, bx = W / 2 - bw / 2, by = GROUND_Y - 2;
  // birch trees behind the far plaza
  ctx.fillStyle = 'rgba(70,90,60,.35)';
  tiled(90, 0.12, x => { ctx.fillRect(x + 10, GROUND_Y - 38, 3, 38); ell(x + 11, GROUND_Y - 44, 9, 12); ctx.fill(); });
  // wide stairs
  ctx.fillStyle = '#b9a79c';
  for (let i = 0; i < 5; i++) ctx.fillRect(bx - 20 * sc - i * 6 * sc, by - i * 3 * sc, bw + 40 * sc + i * 12 * sc, 3 * sc);
  // podium + main block (pinkish granite)
  ctx.fillStyle = '#c9a99a'; ctx.fillRect(bx, by - bh, bw, bh);
  ctx.fillStyle = '#b48f82'; ctx.fillRect(bx, by - bh, bw, 4 * sc);         // entablature shadow
  ctx.fillStyle = '#d7bcaf'; ctx.fillRect(bx - 6 * sc, by - bh - 10 * sc, bw + 12 * sc, 10 * sc); // cornice
  // 14 columns
  const n = 14, cw = 6 * sc, gap = (bw - 16 * sc) / n;
  for (let i = 0; i < n; i++) {
    const cx = bx + 8 * sc + i * gap;
    ctx.fillStyle = '#e2cabf'; ctx.fillRect(cx, by - bh + 4 * sc, cw, bh - 4 * sc);
    ctx.fillStyle = '#a8877a'; ctx.fillRect(cx + cw - 2 * sc, by - bh + 4 * sc, 2 * sc, bh - 4 * sc);
  }
  // doors
  ctx.fillStyle = '#4a3a30'; ctx.fillRect(W / 2 - 8 * sc, by - 22 * sc, 16 * sc, 22 * sc);
  // the big sign
  const sw = 120 * sc, sh = 22 * sc, sx = W / 2 - sw / 2, sy = by - bh - 10 * sc - sh - 6 * sc;
  ctx.fillStyle = '#5b5b5b'; ctx.fillRect(W / 2 - 30 * sc, sy + sh, 3 * sc, 6 * sc); ctx.fillRect(W / 2 + 27 * sc, sy + sh, 3 * sc, 6 * sc);
  ctx.fillStyle = '#0b2f8f'; ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = '#e8b923'; ctx.lineWidth = Math.max(1, 2 * sc); ctx.strokeRect(sx + 2 * sc, sy + 2 * sc, sw - 4 * sc, sh - 4 * sc);
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(6, 13 * sc) + "px Arial, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PARLIAMENT', W / 2, sy + sh / 2 + 1);
  // flags on the cornice (blue cross on white, drawn small and generic)
  for (const fx of [bx + 10 * sc, bx + bw - 10 * sc]) {
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, by - bh - 10 * sc); ctx.lineTo(fx, by - bh - 30 * sc); ctx.stroke();
    const w = 14 * sc + Math.sin(frame / 9) * 1.5, h = 9 * sc;
    ctx.fillStyle = '#fff'; ctx.fillRect(fx, by - bh - 30 * sc, w, h);
    ctx.fillStyle = '#1f3a93'; ctx.fillRect(fx, by - bh - 30 * sc + h * 0.38, w, h * 0.24); ctx.fillRect(fx + w * 0.3, by - bh - 30 * sc, w * 0.18, h);
  }
  // distance readout
  ctx.font = "bold 9px 'Segoe UI', Arial, sans-serif"; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,.45)';
  if (state === 'play') ctx.fillText(t >= 1 ? 'Arrived at Parliament!' : Math.round(t * 100) + '% of the way to Parliament', W - 8, GROUND_Y - 6);
}

// =====================================================================
//  BIRD SPRITES
//  Each draw(a) receives an animation object:
//    a.flap   0..2π burst phase right after a flap (0 when idle)
//    a.idle   slow continuous phase
//    a.left / a.right  whether each limb is still attached
//    a.stage  0,1,2
//  The sprite is drawn centred on the origin, facing right, ~28x22 px.
// =====================================================================
function bandage(x, y, w) {
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, 3);
  ctx.strokeStyle = '#c33'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 3);
}

// --- 1. Scrappy: classic yellow bird, feather wings ---
function scrappyWing(side, phase) {
  const a = Math.sin(phase) * 0.9;
  ctx.save(); ctx.translate(-2, 2); ctx.rotate(a * (side === 1 ? 1 : 0.6));
  ctx.fillStyle = side === 1 ? '#f4d03f' : '#d4a917'; ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 2;
  ell(-4, -2, 11, 6, -0.3); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function scrappyStump() {
  ctx.save(); ctx.translate(-2, 2);
  ctx.fillStyle = '#b8863a'; ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 2;
  ell(-3, -1, 4, 3); ctx.fill(); ctx.stroke();
  bandage(-7, -3, 7);
  ctx.restore();
}
function drawScrappy(a) {
  const phase = a.flap || (state === 'ready' ? a.idle * 2.4 : 0);
  if (a.left) scrappyWing(-1, phase + 0.3); else scrappyStump();
  ctx.fillStyle = '#f7e14a'; ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 2;
  ell(0, 0, 14, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff3b0'; ell(1, 4, 9, 6); ctx.fill();
  ctx.fillStyle = '#e0b43c';
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-22, -6 + (a.stage === 2 ? Math.sin(phase) * 6 : 0)); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (a.stage >= 1) { ctx.fillStyle = '#c99a2e'; ctx.fillRect(3, -6, 4, 3); ctx.fillRect(-6, 5, 3, 3); }
  ctx.fillStyle = '#fff'; ell(6, -4, 5, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ell(7.5, -4, 2, 2); ctx.fill();
  if (a.stage === 2) { ctx.strokeStyle = '#5a3a00'; ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(11, -8); ctx.stroke(); }
  ctx.fillStyle = '#f0682f';
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(20, 2); ctx.lineTo(10, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (a.right) scrappyWing(1, phase); else scrappyStump();
}

// --- 2. President Bird: navy suit, red tie, golden swoop, fists that do the dance ---
function presidentHand(side, t, boost) {
  // The dance: fists pump alternately at waist height, elbows tucked.
  // t runs continuously; boost (0..1) exaggerates the pump right after a flap.
  const amp = 4 + boost * 5;
  const hx = -3 + Math.cos(t) * 3 * (side === 1 ? 1 : -1);
  const hy = 5 + Math.sin(t) * amp;
  ctx.save();
  // sleeve from body edge to fist
  ctx.strokeStyle = side === 1 ? '#1f2f5c' : '#172347'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(side === 1 ? 2 : -6, 2); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;                     // shirt cuff
  ctx.beginPath(); ctx.moveTo(hx - 2, hy - 3); ctx.lineTo(hx + 2, hy - 3); ctx.stroke();
  // fist
  ctx.fillStyle = side === 1 ? '#f2a65a' : '#d98c3f'; ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 1.5;
  ell(hx, hy, 3.6, 3.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,74,26,.6)'; ctx.lineWidth = 1;         // knuckle lines
  ctx.beginPath(); ctx.moveTo(hx - 2, hy + 1); ctx.lineTo(hx + 2, hy + 1); ctx.stroke();
  ctx.restore();
}
function presidentStump(side) {
  ctx.save();
  ctx.strokeStyle = side === 1 ? '#1f2f5c' : '#172347'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(side === 1 ? 2 : -6, 2); ctx.lineTo(-4, 6); ctx.stroke();
  bandage(-8, 4, 7);
  ctx.restore();
}
function drawPresident(a) {
  const dance = a.idle * 3.2 + (a.flap ? a.flap * 1.5 : 0);   // speeds up on a flap
  const boost = a.flap ? Math.sin(a.flap / 2) : 0;
  if (a.left) presidentHand(-1, dance + Math.PI, boost); else presidentStump(-1);
  // tail feathers (navy coat tails)
  ctx.fillStyle = '#172347'; ctx.strokeStyle = '#0d1530'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-22, -6); ctx.lineTo(-20, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  // suit body
  ctx.fillStyle = '#1f2f5c'; ctx.strokeStyle = '#0d1530'; ctx.lineWidth = 2;
  ell(0, 1, 14, 11); ctx.fill(); ctx.stroke();
  // shirt V + lapels
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(9, -2); ctx.lineTo(5, 10); ctx.lineTo(2, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#16244a'; ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(0, 9); ctx.lineTo(2, 10); ctx.lineTo(4, -3); ctx.closePath(); ctx.fill();
  // long red tie (extra long, flutters when falling)
  const tieSwing = a.stage >= 1 ? Math.sin(a.idle * 6) * 2 : 0;
  ctx.fillStyle = '#d7263d'; ctx.strokeStyle = '#8e1020'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(8, 0); ctx.lineTo(6 + tieSwing, 14); ctx.lineTo(3 + tieSwing, 12); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  // head: tan face on the front-top of the body
  ctx.fillStyle = '#f2a65a'; ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 2;
  ell(7, -5, 9, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ell(6, -12, 5, 2.2); ctx.fill();            // pale eye-area band
  // hair: golden swoop, combed forward and over
  ctx.fillStyle = '#f7d774'; ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, -6); ctx.quadraticCurveTo(-4, -16, 6, -15); ctx.quadraticCurveTo(14, -16, 17, -11);
  ctx.quadraticCurveTo(14, -12, 12, -10); ctx.quadraticCurveTo(9, -14, 3, -12);
  ctx.quadraticCurveTo(1, -9, -1, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -10); ctx.quadraticCurveTo(19, -12, 17, -6); ctx.quadraticCurveTo(15, -9, 12, -8); ctx.closePath(); ctx.fill(); ctx.stroke(); // front flick
  // squinting eye + raised brow
  ctx.fillStyle = '#fff'; ell(10, -5, 3.2, 2); ctx.fill();
  ctx.fillStyle = '#2b6cb0'; ell(11, -5, 1.4, 1.4); ctx.fill();
  ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, -9); ctx.lineTo(13, -8); ctx.stroke();
  // pursed lips / beak
  ctx.fillStyle = '#e8735a'; ctx.strokeStyle = '#8e3a2a'; ctx.lineWidth = 1.5;
  ell(15.5, 0, 3, 2.2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8e3a2a'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(18, 0); ctx.stroke();
  // flag pin
  ctx.fillStyle = '#c8102e'; ctx.fillRect(-3, -1, 3, 2); ctx.fillStyle = '#1f3a93'; ctx.fillRect(-3, -1, 1.2, 1);
  if (a.right) presidentHand(1, dance, boost); else presidentStump(1);
}

// --- 3. Banh Mi Bird: baguette body, fillings, lettuce-leaf wings ---
function lettuceLeaf(side, t, boost) {
  // A frilly leaf that flutters fast; the tip wiggles independently.
  const rot = Math.sin(t) * (0.5 + boost * 0.5) * (side === 1 ? 1 : 0.7);
  ctx.save(); ctx.translate(-3, side === 1 ? 0 : 3); ctx.rotate(rot);
  ctx.fillStyle = side === 1 ? '#7ccc4a' : '#5ea63a'; ctx.strokeStyle = '#2e6b1a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0);
  const w = Math.sin(t * 2.3) * 2;
  ctx.quadraticCurveTo(-6, -9 + w, -12, -4);
  ctx.quadraticCurveTo(-16, -8 + w, -18, -2);
  ctx.quadraticCurveTo(-20, 3, -14, 4);
  ctx.quadraticCurveTo(-8, 7, 0, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(46,107,26,.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-1, 1); ctx.lineTo(-16, -1); ctx.stroke();  // midrib
  ctx.restore();
}
function lettuceStump(side) {
  ctx.save(); ctx.translate(-3, side === 1 ? 0 : 3);
  ctx.fillStyle = '#9c8a4a'; ctx.strokeStyle = '#5a4a1a'; ctx.lineWidth = 1.5;
  ell(-4, 1, 4, 2.5); ctx.fill(); ctx.stroke();   // wilted stub
  bandage(-8, -1, 6);
  ctx.restore();
}
function drawBanhMi(a) {
  const flutter = a.idle * 10 + (a.flap ? a.flap * 2 : 0);
  const boost = a.flap ? Math.sin(a.flap / 2) : 0;
  ctx.save();
  // squash on flap: a fresh baguette springs
  const sq = 1 - boost * 0.12;
  ctx.scale(1 + (1 - sq), sq);
  if (a.left) lettuceLeaf(-1, flutter + 1.2, boost); else lettuceStump(-1);
  // crust body (elongated)
  ctx.fillStyle = '#e8b96b'; ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
  ell(0, 0, 19, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f3d29a'; ell(-2, -4, 13, 3.5); ctx.fill();               // top crust highlight
  // baker's slashes
  ctx.strokeStyle = '#b4783a'; ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 8 - 3, -8); ctx.lineTo(i * 8 + 1, -4); ctx.stroke(); }
  // the slit with fillings
  ctx.fillStyle = '#c98a45'; ctx.beginPath(); ctx.moveTo(-14, 1); ctx.quadraticCurveTo(0, -3, 14, 1); ctx.quadraticCurveTo(0, 5, -14, 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2; ctx.lineCap = 'round';     // cilantro
  ctx.beginPath(); ctx.moveTo(-11, 1); ctx.quadraticCurveTo(-6, -3, -1, 0); ctx.quadraticCurveTo(4, 3, 10, 0); ctx.stroke();
  ctx.strokeStyle = '#ff8c1a'; ctx.lineWidth = 1.5;                            // pickled carrot
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-9 + i * 5, 3); ctx.lineTo(-6 + i * 5, 1); ctx.stroke(); }
  ctx.fillStyle = '#f4a0a0'; for (let i = 0; i < 3; i++) { ell(-7 + i * 7, 2.2, 2.2, 1.2); ctx.fill(); }  // pork
  ctx.fillStyle = '#e53935'; ell(-3, 0, 1.3, 1.3); ctx.fill(); ell(6, 1.5, 1.3, 1.3); ctx.fill();      // chili
  if (a.stage >= 1) { ctx.fillStyle = '#a9743a'; ell(-9, -6, 2.5, 1.5); ctx.fill(); ell(9, 5, 2, 1.5); ctx.fill(); } // stale spots
  // eye + crusty beak tip
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1.5; ell(11, -3, 4, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ell(12.5, -3, 1.7, 1.7); ctx.fill();
  if (a.stage === 2) { ctx.strokeStyle = '#8b5a2b'; ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(15, -6.5); ctx.stroke(); }
  ctx.fillStyle = '#c98a45'; ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(24, 2); ctx.lineTo(17, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  // sesame seeds
  ctx.fillStyle = '#fff4d6'; ell(-5, -7, 1.2, 0.7, 0.4); ctx.fill(); ell(5, -7.5, 1.2, 0.7, -0.3); ctx.fill(); ell(0, -8.3, 1.2, 0.7, 0.1); ctx.fill();
  if (a.right) lettuceLeaf(1, flutter, boost); else lettuceStump(1);
  ctx.restore();
}

// --- 4. Persu: royal blue with gold trim and a big gold S on the flank, phone that lights up with every scandal ---
const P_BLUE = '#0b2f8f', P_BLUE_DK = '#071f5e', P_GOLD = '#e8b923', P_GOLD_DK = '#a77a0c';
function persuWing(side, phase, alert) {
  const a = Math.sin(phase) * 0.9;
  ctx.save(); ctx.translate(-2, 2); ctx.rotate(a * (side === 1 ? 1 : 0.6));
  ctx.fillStyle = side === 1 ? P_BLUE : P_BLUE_DK; ctx.strokeStyle = P_GOLD; ctx.lineWidth = 2;
  ell(-4, -2, 11, 6, -0.3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 1; ell(-4, -2, 11, 6, -0.3); ctx.stroke();
  if (side === 1) {
    // smartphone clutched in the wing tip
    ctx.save(); ctx.translate(-12, -3); ctx.rotate(-0.5 + a * 0.3);
    ctx.fillStyle = '#222'; ctx.fillRect(-3, -5, 6, 10);
    ctx.fillStyle = alert > 0 && Math.floor(alert / 6) % 2 === 0 ? '#ff3b3b' : '#9fd3ff'; ctx.fillRect(-2, -4, 4, 8);
    if (alert > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 6px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 0); }
    ctx.restore();
  }
  ctx.restore();
}
function drawPersu(a) {
  const phase = a.flap || (state === 'ready' ? a.idle * 2.4 : 0);
  const alert = (state === 'ready') ? 0 : (bird ? bird.alert : 0);
  const d = state === 'ready' ? 0 : (bird ? clamp(bird.heat + bird.scars, 0, 1) : 0);
  persuWing(-1, phase + 0.3, 0);
  // gold tail feathers
  ctx.fillStyle = P_GOLD; ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-22, -7); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  // body: royal blue with a gold outline
  ctx.fillStyle = P_BLUE; ctx.strokeStyle = P_GOLD; ctx.lineWidth = 2.5;
  ell(0, 0, 14, 11); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 1; ell(0, 0, 14, 11); ctx.stroke();
  // scandal bruises grow with damage
  if (d > 0.25) { ctx.fillStyle = 'rgba(120,40,140,.6)'; ell(-7, -4, 3.5, 2.5); ctx.fill(); }
  if (d > 0.6)  { ctx.fillStyle = 'rgba(120,40,140,.6)'; ell(6, 6, 3, 2); ctx.fill(); bandage(-10, 4, 7); }
  // eye with a heavy, furrowed brow (white with gold ring)
  ctx.fillStyle = '#fff'; ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 1.5; ell(7, -4, 5, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ell(8.5, -3.5, 2, 2); ctx.fill();
  ctx.strokeStyle = P_BLUE_DK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(12, -7); ctx.stroke();
  // sweat drop when things are bad
  if (d > 0.5) { ctx.fillStyle = '#7fd0ff'; ell(13, -9 + (frame % 20) * 0.2, 1.5, 2.2); ctx.fill(); }
  // gold crest swept back like the logo's S flick
  ctx.fillStyle = P_GOLD; ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-2, -10); ctx.quadraticCurveTo(4, -18, 12, -13); ctx.quadraticCurveTo(6, -13, 3, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
  // gold beak
  ctx.fillStyle = P_GOLD; ctx.strokeStyle = P_GOLD_DK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(21, 3); ctx.lineTo(11, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  persuWing(1, phase, alert);
  // big gold S emblem on the flank (the logo's swoosh)
  ctx.save(); ctx.translate(2, 3); ctx.rotate(-0.15);
  ctx.font = "italic bold 16px 'Times New Roman', Georgia, serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.5; ctx.strokeStyle = P_GOLD_DK; ctx.strokeText('S', 0, 0);
  ctx.fillStyle = P_GOLD; ctx.fillText('S', 0, 0);
  ctx.fillStyle = '#fff3b0'; ctx.font = "italic bold 16px 'Times New Roman', Georgia, serif"; ctx.globalAlpha = 0.35; ctx.fillText('S', -0.6, -0.8); ctx.globalAlpha = 1;
  ctx.restore();
}

function animFor(b) {
  return {
    flap: b.wingT < 14 ? (b.wingT / 14) * Math.PI * 2 : 0,
    idle: frame / 12,
    left: b.leftWing, right: b.rightWing, stage,
  };
}
function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);
  CH().draw(animFor(bird));
  ctx.restore();
}
function drawFeathers() {
  for (const f of feathers) {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
    ctx.globalAlpha = 1 - f.t / f.life;
    ctx.fillStyle = f.color; ell(0, 0, 5, 2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function text(str, x, y, size, align, color) {
  align = align || 'center'; color = color || '#fff';
  ctx.font = 'bold ' + size + "px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 8); ctx.strokeStyle = '#3a2a00'; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function drawLimbStatus() {
  if (CH().events) {
    // scandal damage meter
    const d = damage();
    ctx.save(); ctx.translate(W - 70, 10);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, 60, 10);
    ctx.fillStyle = d < 0.4 ? '#7bd66b' : d < 0.7 ? '#f5c542' : '#ff4d4d'; ctx.fillRect(1, 1, 58 * d, 8);
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, 60, 10);
    ctx.restore();
    text('damage', W - 40, 26, 8, 'center', '#fff');
    return;
  }
  ctx.save(); ctx.translate(W - 12, 16);
  for (let i = 0; i < 2; i++) {
    const has = i === 0 ? bird.rightWing : bird.leftWing;
    const ox = -i * 20;
    ctx.fillStyle = has ? CH().particle : 'rgba(0,0,0,.25)';
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5;
    if (CH().id === 'trumpet') { ell(ox, 0, 5.5, 5); } else { ell(ox, 0, 8, 4, -0.3); }
    ctx.fill(); ctx.stroke();
    if (!has) {
      ctx.strokeStyle = '#c33'; ctx.beginPath();
      ctx.moveTo(ox - 6, -5); ctx.lineTo(ox + 6, 5); ctx.moveTo(ox + 6, -5); ctx.lineTo(ox - 6, 5); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawCharacterSelect() {
  const c = CH();
  text(c.name, W / 2, 250, 16, 'center', '#f7e14a');
  text(c.tagline, W / 2, 268, 10, 'center', '#fff');
  for (let i = 0; i < CHARACTERS.length; i++) {
    const cx = PORTRAIT.xs[i], y = PORTRAIT.y, s = PORTRAIT.size, sel = i === charIndex;
    ctx.fillStyle = sel ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)';
    ctx.strokeStyle = sel ? '#f7e14a' : '#3a2a00'; ctx.lineWidth = sel ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(cx - s / 2, y, s, s, 8); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(cx, y + s / 2 + 2);
    const sc = sel ? 1.35 + Math.sin(frame / 10) * 0.05 : 1.1;
    ctx.scale(sc, sc);
    CHARACTERS[i].draw({ flap: 0, idle: sel ? frame / 12 : 0, left: true, right: true, stage: 0 });
    ctx.restore();
  }
  text('Tap to flap  •  ◀ ▶ pick a bird', W / 2, 362, 11);
  if (c.events) text('Scandals strike at random. Reach Parliament.', W / 2, 380, 11, 'center', '#ffe6a0');
  else text('Lose a ' + c.limb + ' at ' + STAGE_AT[1] + ' and ' + STAGE_AT[2], W / 2, 380, 11, 'center', '#ffe6a0');
}
function drawUI() {
  const c = CH();
  if (state === 'ready') {
    text('Scrappy Bird', W / 2, 60, 34, 'center', '#fff');
    text('Get Ready!', W / 2, 105, 20, 'center', '#f7e14a');
    drawCharacterSelect();
    if (best) text('Best: ' + best, W / 2, GROUND_Y + 24, 12);
    const who = window.Auth && window.Auth.user ? 'Signed in as ' + window.Auth.displayName() : 'Guest (scores not saved)';
    text(who, W / 2, GROUND_Y + 44, 10, 'center', '#fff8dc');
  }
  if (state === 'play') text(String(score), W / 2, 50, 40);
  if (state !== 'ready') drawLimbStatus();

  if (stageBanner > 0 && state === 'play') {
    ctx.globalAlpha = Math.min(1, stageBanner / 30);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 190, W, 60);
    text(bannerTitle, W / 2, 210, bannerTitle.length > 30 ? 12 : bannerTitle.length > 22 ? 15 : 20, 'center', '#ff6b6b');
    text(bannerDesc, W / 2, 234, 11, 'center', '#fff');
    ctx.globalAlpha = 1;
  }

  if (state === 'dead') {
    const t = Math.min(1, deadTimer / 20);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.45 * t) + ')'; ctx.fillRect(0, 0, W, H);
    const y = 150 + (1 - t) * 40;
    text('Game Over', W / 2, y, 32, 'center', '#ff8b3d');
    ctx.fillStyle = '#ded895'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 3;
    ctx.fillRect(44, y + 40, 200, 110); ctx.strokeRect(44, y + 40, 200, 110);
    text('SCORE', 200, y + 62, 12, 'center', '#e07a1f');
    text(String(score), 200, y + 84, 24, 'center');
    text('BEST', 200, y + 110, 12, 'center', '#e07a1f');
    text(String(best), 200, y + 132, 24, 'center');
    ctx.save(); ctx.translate(96, y + 70); ctx.scale(1.2, 1.2);
    c.draw({ flap: 0, idle: 0, left: bird.leftWing, right: bird.rightWing, stage }); ctx.restore();
    if (c.events) text(bird.scandals + ' scandal' + (bird.scandals === 1 ? '' : 's') + ' survived', 96, y + 108, 10, 'center', '#3a2a00');
    else text(bird.wings + ' ' + (bird.wings === 1 ? c.limb : c.limbs) + ' left', 96, y + 108, 10, 'center', '#3a2a00');
    text(c.name, 96, y + 126, 10, 'center', '#3a2a00');
    if (deadTimer > 30 && Math.floor(deadTimer / 30) % 2 === 0) text('Tap to retry', W / 2, y + 180, 14);
  }
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake / 2, shake / 2), rand(-shake / 2, shake / 2));
  CH().drawBackground();
  for (const p of pipes) (CH().drawObstacle || drawPipe)(p);
  drawGround();
  drawFeathers();
  drawBird();
  ctx.restore();
  drawUI();
}

// ---------- Loop (fixed 60 Hz step) ----------
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  acc += Math.min(now - last, 100); last = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function fit() {
  const s = Math.min(window.innerWidth / W, (window.innerHeight - 24) / H);
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
window.addEventListener('resize', fit); fit();

// ---------- Native (Capacitor) integration ----------
const cap = window.Capacitor;
if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
  document.getElementById('hint').hidden = true;
  try { cap.Plugins.StatusBar.hide(); } catch (e) {}
  // Android back button: return to title instead of leaving the app mid-run.
  try {
    cap.Plugins.App.addListener('backButton', () => {
      if (state === 'play') { die(); }
      else if (state === 'dead') { reset(); state = 'ready'; }
      else cap.Plugins.App.exitApp();
    });
  } catch (e) {}
}

// Test hooks for the automated play-through. Not exposed inside the native app.
if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) {
window.__dbg = () => ({ state, frame, score, stage, wings: bird.wings, char: CH().id, pipes: pipes.length, bird: { x: bird.x, y: bird.y, vy: bird.vy } });
window.__step = (n) => { for (let i = 0; i < n; i++) update(); render(); };
window.__flap = flap; window.__pipes = () => pipes; window.__setScore = (s) => { score = s; checkStage(); };
window.__select = selectChar; window.__scandal = scandal; window.__chars = CHARACTERS; window.__ctx = ctx;
}
})();
