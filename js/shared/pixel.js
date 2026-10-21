// Sprites pixel art : chaque sprite est une grille de caractères convertie en SVG (un <rect> par pixel),
// exposée à la CSS sous forme de variables (--px-ghost, --px-ok, --px-err…).

const PALETTE = {
  x: '#a78bfa', // corps du fantôme
  w: '#ffffff',
  b: '#312e81', // pupille
  g: '#22c55e', // vert (succès)
  r: '#ef4444', // rouge (erreur)
  y: '#facc15', // jaune
  k: '#0a0a0f'  // noir
};

// Fantôme (mascotte du chargement) : 2 images de marche, côte à côte dans une même planche
const GHOST_A = [
  '....xxxx....',
  '..xxxxxxxx..',
  '.xxxxxxxxxx.',
  '.xwwxxxwwxx.',
  'xxwbxxxwbxxx',
  'xxwwxxxwwxxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xx.xxxx.xxxx',
  'x...xx...xx.'
];
const GHOST_B = [
  '....xxxx....',
  '..xxxxxxxx..',
  '.xxxxxxxxxx.',
  '.xxwwxxxwwx.',
  'xxxwbxxxwbxx',
  'xxxwwxxxwwxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xxxxxxxxxxxx',
  'xxxx.xxxx.xx',
  '.xx...xx...x'
];

const OK = [
  '..........',
  '........gg',
  '.......ggg',
  '.gg...ggg.',
  '.ggg.ggg..',
  '..ggggg...',
  '...ggg....',
  '....g.....'
];

const ERR = [
  '..rrrrrr..',
  '.rrrrrrrr.',
  'rrrrrrrrrr',
  'rrkkrrkkrr',
  'rrkkrrkkrr',
  'rrrrrrrrrr',
  '.rrkrrkrr.',
  '..rrrrrr..',
  '..r.rr.r..'
];

const STAR = [
  '....y....',
  '....y....',
  '...yyy...',
  'yyyyyyyyy',
  '.yyyyyyy.',
  '..yyyyy..',
  '.yyy.yyy.',
  '.yy...yy.'
];

function rects(grid, offsetX = 0) {
  let out = '';
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== '.' && PALETTE[ch]) out += `<rect x="${x + offsetX}" y="${y}" width="1" height="1" fill="${PALETTE[ch]}"/>`;
    });
  });
  return out;
}

function toDataUri(width, height, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function registerPixelSprites() {
  const root = document.documentElement.style;
  const w = GHOST_A[0].length, h = GHOST_A.length;
  root.setProperty('--px-ghost', toDataUri(w * 2, h, rects(GHOST_A) + rects(GHOST_B, w)));
  root.setProperty('--px-ok', toDataUri(OK[0].length, OK.length, rects(OK)));
  root.setProperty('--px-err', toDataUri(ERR[0].length, ERR.length, rects(ERR)));
  root.setProperty('--px-star', toDataUri(STAR[0].length, STAR.length, rects(STAR)));
}

// Confettis de réussite : ils jaillissent de l'élément donné (la fenêtre de notification) puis retombent.
// Style pixel : carrés qui avancent par paliers. Style classique : papillotes arrondies qui tournent.
const CONFETTI_COLORS = ['#a78bfa', '#6366f1', '#22c55e', '#facc15', '#f472b6', '#38bdf8'];

export function pixelConfetti(origin, count = 56) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof Element.prototype.animate !== 'function') return;
  const pixel = document.documentElement.classList.contains('px-theme');
  const rect = origin ? origin.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  // point de départ : le haut de la fenêtre, centré (là où se trouve l'icône)
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + Math.min(rect.height * 0.3, 90);

  const layer = document.createElement('div');
  layer.className = 'px-confetti';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  const rand = (min, max) => min + Math.random() * (max - min);
  const GRAVITY = 1500;   // px/s²
  const DRAG = 1.6;       // frottement horizontal
  const FRAMES = pixel ? 14 : 30;
  let remaining = count;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    let w, h;
    if (pixel) { w = h = [6, 8, 10][i % 3]; }
    else { w = rand(6, 11); h = i % 4 === 0 ? w : rand(9, 16); if (i % 4 === 0) p.className = 'round'; }
    p.style.cssText = `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${color};`;
    layer.appendChild(p);

    // vitesse initiale : éventail vers le haut, plus ou moins large selon la pièce
    const angle = -Math.PI / 2 + rand(-1.25, 1.25);
    const speed = rand(420, 1000);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const spin = rand(-900, 900);
    const duration = rand(2.0, 3.0);

    const frames = [];
    for (let f = 0; f <= FRAMES; f++) {
      const u = f / FRAMES;
      const t = u * duration;
      const x = vx * (1 - Math.exp(-DRAG * t)) / DRAG;
      const y = vy * t + 0.5 * GRAVITY * t * t;
      frames.push({
        offset: u,
        transform: `translate(${(ox + x).toFixed(1)}px, ${(oy + y).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg)`,
        opacity: u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1,
        easing: pixel ? 'steps(1, end)' : 'linear'
      });
    }
    const anim = p.animate(frames, { duration: duration * 1000, delay: rand(0, 120), fill: 'both' });
    anim.finished.then(() => { p.remove(); if (--remaining === 0) layer.remove(); }).catch(() => {});
  }
  setTimeout(() => layer.remove(), 4500);
}
