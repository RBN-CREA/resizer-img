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

// Gerbe de carrés qui retombent (réussite d'un export)
const CONFETTI_COLORS = ['#a78bfa', '#6366f1', '#22c55e', '#facc15', '#f472b6', '#38bdf8'];

export function pixelConfetti(count = 28) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'px-confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const size = [6, 8, 10][i % 3];
    p.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};` +
      `animation-delay:${(Math.random() * 0.4).toFixed(2)}s;animation-duration:${(1.1 + Math.random() * 0.9).toFixed(2)}s;`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}
