// Écran de chargement pixel art + messages d'état stylés.
// Il observe les barres de progression existantes (images et vidéos) : aucun traitement n'a besoin de le connaître.
import { registerPixelSprites } from '../shared/pixel.js';

registerPixelSprites();

const SEGMENTS = 20;
const SHOW_DELAY_MS = 600; // les traitements rapides n'affichent pas d'écran de chargement
const EXPORT_RE = /export|zip|encodage|encodeur|génération|compression/i; // ces traitements ouvrent la fenêtre sans délai

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
        <svg class="cl-ghost" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
          <defs><linearGradient id="clGhostGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
          <ellipse class="cl-ghost-shadow" cx="32" cy="62" rx="18" ry="2.5"/>
          <g class="cl-ghost-body">
            <path class="cl-skirt cl-skirt-a" d="M8 56V30C8 15 18 6 32 6s24 9 24 24v26q-4 -7 -8 0q-4 7 -8 0q-4 -7 -8 0q-4 7 -8 0q-4 -7 -8 0q-4 7 -8 0Z"/>
            <path class="cl-skirt cl-skirt-b" d="M8 56V30C8 15 18 6 32 6s24 9 24 24v26q-4 7 -8 0q-4 -7 -8 0q-4 7 -8 0q-4 -7 -8 0q-4 7 -8 0q-4 -7 -8 0Z"/>
            <ellipse cx="23" cy="29" rx="6.5" ry="7.5" fill="#fff"/><ellipse cx="41" cy="29" rx="6.5" ry="7.5" fill="#fff"/>
            <circle class="cl-pupil" cx="25.5" cy="30" r="3.4" fill="#312e81"/><circle class="cl-pupil" cx="43.5" cy="30" r="3.4" fill="#312e81"/>
          </g>
        </svg>
      </div>
      <div class="px-segments" aria-hidden="true">${'<i></i>'.repeat(SEGMENTS)}</div>
      <div class="cl-bar" aria-hidden="true"><div class="cl-bar-fill"></div></div>
      <div class="px-loader-pct">0%</div>
      <div class="px-loader-text"></div>
      <button type="button" class="px-btn">Masquer</button>
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
  overlay.querySelector('.cl-bar-fill').style.width = pct + '%';
  const text = document.getElementById(activeSource.text).textContent;
  overlay.querySelector('.px-loader-title-text').textContent = titleFor(text);
  overlay.querySelector('.px-loader-text').textContent = text;
  // le fantôme avance le long de la jauge
  overlay.querySelector('.px-ghost').style.left = `calc(${pct}% - ${(pct / 100) * 48}px)`;
  overlay.querySelector('.cl-ghost').style.left = `calc(${pct}% - ${(pct / 100) * 56}px)`;
}

function showOverlay() {
  if (dismissed) return;
  if (!overlay) overlay = buildOverlay();
  overlay.classList.add('visible');
  // la fenêtre remplace la barre de progression du haut et le texte d'avancement du bas
  document.documentElement.classList.add('px-loading');
  const app = document.querySelector('.app');
  if (app) app.inert = true; // pas de clics ni de focus derrière pendant le traitement
  updateOverlay();
}

function hideOverlay() {
  if (overlay) overlay.classList.remove('visible');
  document.documentElement.classList.remove('px-loading');
  const app = document.querySelector('.app');
  if (app) app.inert = false;
}

function onProgressChange(src) {
  const wrap = document.getElementById(src.wrap);
  const running = wrap.classList.contains('visible');
  if (running) {
    activeSource = src;
    if (overlay && overlay.classList.contains('visible')) updateOverlay();
    else if (!showTimer && !dismissed) {
      // Les exports affichent la fenêtre tout de suite ; les traitements courts attendent un instant
      const text = document.getElementById(src.text).textContent;
      if (EXPORT_RE.test(text)) showOverlay();
      else showTimer = setTimeout(() => { showTimer = null; showOverlay(); }, SHOW_DELAY_MS);
    }
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
  let lastPct = 0;
  new MutationObserver(() => {
    // Un nouveau traitement qui redémarre à 0 % rouvre la fenêtre, même si la précédente avait été masquée
    const pct = readProgress(src);
    if (pct < lastPct - 1 && dismissed && document.getElementById(src.wrap).classList.contains('visible')) {
      dismissed = false;
      activeSource = src;
      showOverlay();
    }
    lastPct = pct;
    updateOverlay();
  }).observe(bar, { attributes: true, attributeFilter: ['style'] });
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
