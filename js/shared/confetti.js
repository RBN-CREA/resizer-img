// Confettis de réussite : ils jaillissent de l'élément donné (la fenêtre de notification) puis retombent.
const CONFETTI_COLORS = ['#a78bfa', '#6366f1', '#22c55e', '#facc15', '#f472b6', '#38bdf8'];

export function confettiBurst(origin, count = 56) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof Element.prototype.animate !== 'function') return;
  const rect = origin ? origin.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  // point de départ : le haut de la fenêtre, centré (là où se trouve l'icône)
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + Math.min(rect.height * 0.3, 90);

  const layer = document.createElement('div');
  layer.className = 'ui-confetti';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  const rand = (min, max) => min + Math.random() * (max - min);
  const GRAVITY = 1500;   // px/s²
  const DRAG = 1.6;       // frottement horizontal
  const FRAMES = 30;
  let remaining = count;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const w = rand(6, 11);
    const h = i % 4 === 0 ? w : rand(9, 16);
    if (i % 4 === 0) p.className = 'round';
    p.style.cssText = `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};`;
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
        opacity: u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1
      });
    }
    const anim = p.animate(frames, { duration: duration * 1000, delay: rand(0, 120), easing: 'linear', fill: 'both' });
    anim.finished.then(() => { p.remove(); if (--remaining === 0) layer.remove(); }).catch(() => {});
  }
  setTimeout(() => layer.remove(), 4500);
}
