import { notify } from '../shared/dialogs.js';

// Export vidéo : prévenir dès le départ si le navigateur n'a pas WebCodecs
if (!('VideoEncoder' in window)) {
  const msg = "Export vidéo indisponible : ce navigateur ne supporte pas WebCodecs (utilisez Chrome, Edge ou un Safari récent).";
  ['exportFastVideoBtn', 'exportPreciseBtn'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = true; b.title = msg; b.style.opacity = '0.5'; b.style.cursor = 'not-allowed'; }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#enableVideoToggle')) {
      e.stopImmediatePropagation();
      notify(msg);
    }
  }, true);
}
