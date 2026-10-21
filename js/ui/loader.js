// Écran de chargement pixel art + messages d'état stylés.
// Il observe les barres de progression existantes (images et vidéos) : aucun traitement n'a besoin de le connaître.
import { registerPixelSprites } from '../shared/pixel.js';

registerPixelSprites();

const SEGMENTS = 20;
const SHOW_DELAY_MS = 600; // les traitements rapides n'affichent pas d'écran de chargement

const SOURCES = [
  { wrap: 'progressWrap', bar: 'progressBar', text: 'statusText', status: 'statusBar' },
  { wrap: 'videoProgressWrap', bar: 'videoProgressBar', text: 'videoStatusText', status: 'videoStatusBar' }
];

let overlay = null;
let showTimer = null;
let dismissed = false;
let activeSource = null;

function titleFor(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('encodage')) return 'ENCODAGE';
  if (t.includes('export') || t.includes('zip') || t.includes('génération')) return 'EXPORT';
  if (t.includes('analyse')) return 'ANALYSE';
  if (t.includes('import')) return 'IMPORT';
  if (t.includes('recadrage') || t.includes('application')) return 'RECADRAGE';
  return 'CHARGEMENT';
}

function buildOverlay() {
  const el = document.createElement('div');
  el.className = 'px-loader';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="px-box px-loader-box">
      <div class="px-loader-title"><span class="px-loader-title-text">CHARGEMENT</span><span class="px-dots" aria-hidden="true"></span></div>
      <div class="px-loader-stage" aria-hidden="true">
        <div class="px-ghost"></div>
      </div>
      <div class="px-segments" aria-hidden="true">${'<i></i>'.repeat(SEGMENTS)}</div>
      <div class="px-loader-pct">0%</div>
      <div class="px-loader-text"></div>
      <button type="button" class="px-btn">MASQUER</button>
    </div>`;
  el.querySelector('.px-btn').addEventListener('click', () => { dismissed = true; hideOverlay(); });
  document.body.appendChild(el);
  return el;
}

function readProgress(src) {
  const w = parseFloat(document.getElementById(src.bar).style.width) || 0;
  return Math.max(0, Math.min(100, w));
}

function updateOverlay() {
  if (!overlay || !activeSource) return;
  const pct = readProgress(activeSource);
  const lit = Math.floor((pct / 100) * SEGMENTS);
  overlay.querySelectorAll('.px-segments i').forEach((seg, i) => seg.classList.toggle('on', i < lit));
  overlay.querySelector('.px-loader-pct').textContent = Math.round(pct) + '%';
  const text = document.getElementById(activeSource.text).textContent;
  overlay.querySelector('.px-loader-title-text').textContent = titleFor(text);
  overlay.querySelector('.px-loader-text').textContent = text;
  // le fantôme avance le long de la jauge
  overlay.querySelector('.px-ghost').style.left = `calc(${pct}% - ${(pct / 100) * 48}px)`;
}

function showOverlay() {
  if (dismissed) return;
  if (!overlay) overlay = buildOverlay();
  overlay.classList.add('visible');
  const app = document.querySelector('.app');
  if (app) app.inert = true; // pas de clics ni de focus derrière pendant le traitement
  updateOverlay();
}

function hideOverlay() {
  if (overlay) overlay.classList.remove('visible');
  const app = document.querySelector('.app');
  if (app) app.inert = false;
}

function onProgressChange(src) {
  const wrap = document.getElementById(src.wrap);
  const running = wrap.classList.contains('visible');
  if (running) {
    activeSource = src;
    if (overlay && overlay.classList.contains('visible')) updateOverlay();
    else if (!showTimer && !dismissed) showTimer = setTimeout(() => { showTimer = null; showOverlay(); }, SHOW_DELAY_MS);
  } else if (activeSource === src) {
    clearTimeout(showTimer);
    showTimer = null;
    dismissed = false;
    activeSource = null;
    hideOverlay();
  }
}

SOURCES.forEach(src => {
  const wrap = document.getElementById(src.wrap);
  const bar = document.getElementById(src.bar);
  const text = document.getElementById(src.text);
  new MutationObserver(() => onProgressChange(src)).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => updateOverlay()).observe(bar, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(() => updateOverlay()).observe(text, { childList: true, characterData: true, subtree: true });

  const status = document.getElementById(src.status);
  // Un message de réussite libère l'écran tout de suite, sans attendre que la barre de progression se retire
  new MutationObserver(() => {
    const done = status.classList.contains('success') && /export|succès|terminé/i.test(text.textContent) && !/en cours|%/.test(text.textContent);
    if (done) {
      clearTimeout(showTimer);
      showTimer = null;
      dismissed = true;
      hideOverlay();
    }
  }).observe(status, { attributes: true, attributeFilter: ['class'] });
});
