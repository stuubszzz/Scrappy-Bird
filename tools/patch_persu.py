"""One-off patch: rename birds, add Persu (events-based difficulty, jail bars, parliament)."""
import re, io
p = 'www/index.html'
s = open(p, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    assert old in s, 'missing: ' + old[:60]
    s = s.replace(old, new, count)

# ---- 1. Names ----
rep("id: 'scrappy', name: 'Scrappy', tagline: 'The original. Mostly feathers.',",
    "id: 'birdie', name: 'Birdie', tagline: 'The original. Mostly feathers.',")
rep("id: 'president', name: 'President Bird', tagline: 'Tremendous flapping. The best flapping.',",
    "id: 'trumpet', name: 'Trumpet', tagline: 'Tremendous flapping. The best flapping.',")
rep("id: 'banhmi', name: 'Banh Mi Bird', tagline: 'Crusty. Flaky. Slightly spicy.',",
    "id: 'sammich', name: 'Sammich', tagline: 'Crusty. Flaky. Slightly spicy.',")
rep("if (CH().id === 'president')", "if (CH().id === 'trumpet')")

# ---- 2. Persu character entry ----
rep("""    drawBackground: drawBgSaigon, draw: drawBanhMi,
  },
];""", """    drawBackground: drawBgSaigon, draw: drawBanhMi, drawObstacle: drawSteamers,
  },
  {
    id: 'persu', name: 'Persu', tagline: 'Just trying to reach Parliament.',
    limb: 'wing', limbs: 'wings', particle: '#3b6fd6', events: true,
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
    ['BREAKING: Flock member charged with a felony', 'Serious damage. The flock is in freefall.'],
    ['BREAKING: Flock member indicted', 'Court date set. Flying is now a struggle.'],
    ['BREAKING: Flock member convicted', 'Permanent damage. Good luck reaching Parliament.'],
  ],
};""")

# ---- 3. Four portraits ----
rep("const PORTRAIT = { y: 284, size: 60, xs: [60, 144, 228] };",
    "const PORTRAIT = { y: 286, size: 56, xs: [42, 110, 178, 246] };")

# ---- 4. State: generic banner + persu damage fields ----
rep("let bird, pipes, groundX, stage, stageBanner, feathers, shake, deadTimer = 0;",
    "let bird, pipes, groundX, stage, stageBanner, bannerTitle = '', bannerDesc = '', feathers, shake, deadTimer = 0;")
rep("""           wings: 2, leftWing: true, rightWing: true, wobble: 0 };""",
    """           wings: 2, leftWing: true, rightWing: true, wobble: 0,
           heat: 0, scars: 0, scandals: 0, nextEvent: 0, alert: 0 };""")

# ---- 5. Flap: damage-driven randomness for events birds ----
rep("""  bird.wingT = 0; bird.squash = 8;
  sfx.flap();
  if (stage === 0) {""", """  bird.wingT = 0; bird.squash = 8;
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
  if (stage === 0) {""")
rep("""function selectChar(i) {""", """function damage() { return clamp(bird.heat + bird.scars, 0, 1); }
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
function selectChar(i) {""")

# ---- 6. loseWing sets the banner text ----
rep("  sfx.wing(); shake = 12; stageBanner = 150;",
    "  sfx.wing(); shake = 12; stageBanner = 150;\n  bannerTitle = CH().stages[stage][0]; bannerDesc = CH().stages[stage][1];")

# ---- 7. Update: per-frame damage turbulence + scheduling ----
rep("""    if (stage >= 1) {
      // Constant turbulence: an unbalanced bird cannot hold a line.""",
"""    if (CH().events) {
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
      // Constant turbulence: an unbalanced bird cannot hold a line.""")
rep("        p.passed = true; score++; sfx.score(); checkStage();",
    "        p.passed = true; score++; sfx.score(); if (!CH().events) checkStage();")

# ---- 8. Obstacles: per-character drawer ----
rep("  for (const p of pipes) drawPipe(p);", "  for (const p of pipes) (CH().drawObstacle || drawPipe)(p);")
rep("""// =====================================================================
//  BIRD SPRITES""", """// Jail-bar gate: a steel frame with several vertical bars. Same hitbox as a pipe.
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
  const t = clamp(score / 40, 0, 1);
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
  ctx.fillStyle = '#1f3a93'; ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, 2 * sc); ctx.strokeRect(sx + 2 * sc, sy + 2 * sc, sw - 4 * sc, sh - 4 * sc);
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
  if (state === 'play') ctx.fillText(t >= 1 ? 'Arrived at Parliament!' : Math.round((1 - t) * 100) + '% of the way', W - 8, GROUND_Y - 6);
}

// =====================================================================
//  BIRD SPRITES""")

# ---- 9. Persu sprite ----
rep("""function animFor(b) {""", """// --- 4. Persu: blue-and-white bird with a flat cap and a phone that lights up with every scandal ---
function persuWing(side, phase, alert) {
  const a = Math.sin(phase) * 0.9;
  ctx.save(); ctx.translate(-2, 2); ctx.rotate(a * (side === 1 ? 1 : 0.6));
  ctx.fillStyle = side === 1 ? '#2f5fbf' : '#234a99'; ctx.strokeStyle = '#122a5c'; ctx.lineWidth = 2;
  ell(-4, -2, 11, 6, -0.3); ctx.fill(); ctx.stroke();
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
  // tail
  ctx.fillStyle = '#234a99'; ctx.strokeStyle = '#122a5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-22, -6); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  // body: blue back, white belly
  ctx.fillStyle = '#2f5fbf'; ell(0, 0, 14, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f4f7fb'; ell(2, 4, 10, 6.5); ctx.fill();
  // scandal bruises grow with damage
  if (d > 0.25) { ctx.fillStyle = 'rgba(120,40,140,.55)'; ell(-5, -3, 3.5, 2.5); ctx.fill(); }
  if (d > 0.6)  { ctx.fillStyle = 'rgba(120,40,140,.55)'; ell(4, 6, 3, 2); ctx.fill(); bandage(-9, 3, 7); }
  // eye with a heavy, furrowed brow
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#122a5c'; ell(6, -4, 5, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222'; ell(7.5, -3.5, 2, 2); ctx.fill();
  ctx.strokeStyle = '#122a5c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, -10); ctx.lineTo(11, -7); ctx.stroke();
  // sweat drop when things are bad
  if (d > 0.5) { ctx.fillStyle = '#7fd0ff'; ell(12, -9 + (frame % 20) * 0.2, 1.5, 2.2); ctx.fill(); }
  // flat cap
  ctx.fillStyle = '#4b4b4b'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-9, -8); ctx.quadraticCurveTo(0, -17, 10, -10); ctx.lineTo(15, -9); ctx.lineTo(10, -7); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
  // beak, slightly downturned
  ctx.fillStyle = '#f0a030'; ctx.strokeStyle = '#122a5c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(20, 3); ctx.lineTo(10, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  persuWing(1, phase, alert);
}

function animFor(b) {""")

# ---- 10. UI: banner text, status, ready text, dead card ----
rep("""    text(c.stages[stage][0], W / 2, 210, 20, 'center', '#ff6b6b');
    text(c.stages[stage][1], W / 2, 234, 11, 'center', '#fff');""",
    """    text(bannerTitle, W / 2, 210, bannerTitle.length > 26 ? 13 : 20, 'center', '#ff6b6b');
    text(bannerDesc, W / 2, 234, 11, 'center', '#fff');""")
rep("""  text('Lose a ' + c.limb + ' at ' + STAGE_AT[1] + ' and ' + STAGE_AT[2], W / 2, 380, 11, 'center', '#ffe6a0');""",
    """  if (c.events) text('Scandals strike at random. Reach Parliament.', W / 2, 380, 11, 'center', '#ffe6a0');
  else text('Lose a ' + c.limb + ' at ' + STAGE_AT[1] + ' and ' + STAGE_AT[2], W / 2, 380, 11, 'center', '#ffe6a0');""")
rep("""function drawLimbStatus() {
  ctx.save(); ctx.translate(W - 12, 16);""", """function drawLimbStatus() {
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
  ctx.save(); ctx.translate(W - 12, 16);""")
rep("""    text(bird.wings + ' ' + (bird.wings === 1 ? c.limb : c.limbs) + ' left', 96, y + 108, 10, 'center', '#3a2a00');""",
    """    if (c.events) text(bird.scandals + ' scandal' + (bird.scandals === 1 ? '' : 's') + ' survived', 96, y + 108, 10, 'center', '#3a2a00');
    else text(bird.wings + ' ' + (bird.wings === 1 ? c.limb : c.limbs) + ' left', 96, y + 108, 10, 'center', '#3a2a00');""")

# ---- 11. Test hook ----
rep("window.__select = selectChar;", "window.__select = selectChar; window.__scandal = scandal;")

open(p, 'w', encoding='utf-8').write(s)
print('patched')
