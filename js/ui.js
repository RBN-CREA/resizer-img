(function() {
  // Interrupteurs : rôle switch, focus clavier, état annoncé
  function enhanceToggle(el) {
    if (el.dataset.a11y) return;
    el.dataset.a11y = '1';
    el.setAttribute('role', 'switch');
    el.tabIndex = 0;
    el.setAttribute('aria-checked', el.classList.contains('on') ? 'true' : 'false');
    if (!el.getAttribute('aria-label')) {
      const lab = el.parentElement && el.parentElement.querySelector('.toggle-label, span, .tool-section-title');
      if (lab && lab.textContent.trim()) el.setAttribute('aria-label', lab.textContent.trim());
    }
  }
  document.querySelectorAll('.toggle').forEach(enhanceToggle);

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if (m.target.classList && m.target.classList.contains('toggle')) {
          m.target.setAttribute('aria-checked', m.target.classList.contains('on') ? 'true' : 'false');
        }
      } else {
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.classList.contains('toggle')) enhanceToggle(n);
          n.querySelectorAll('.toggle').forEach(enhanceToggle);
        });
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('toggle')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // Fenêtres modales : focus à l'ouverture, restauré à la fermeture, Tab piégé dans la fenêtre
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const lastFocus = new WeakMap();
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    let wasOpen = overlay.classList.contains('open');
    new MutationObserver(() => {
      const isOpen = overlay.classList.contains('open');
      if (isOpen && !wasOpen) {
        lastFocus.set(overlay, document.activeElement);
        const first = overlay.querySelector('.modal-close') || overlay.querySelector(FOCUSABLE);
        if (first) first.focus();
      } else if (!isOpen && wasOpen) {
        const prev = lastFocus.get(overlay);
        if (prev && prev.focus && document.contains(prev)) prev.focus();
      }
      wasOpen = isOpen;
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const open = document.querySelectorAll('.modal-overlay.open');
    if (!open.length) return;
    const overlay = open[open.length - 1];
    const nodes = [...overlay.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

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

  // Préférences mémorisées entre deux sessions (réglages d'export et tri)
  const PREF_IDS = ['sortSelect', 'unifiedExportFormat', 'unifiedExportStructure', 'unifiedExportQuality', 'unifiedExportSuffix',
    'unifiedSlideDuration', 'unifiedTransitionType', 'unifiedKenBurns', 'unifiedKenBurnsDirection', 'unifiedVideoQuality', 'videoExportQuality'];
  const PREF_KEY = 'resizeStudio.prefs.v1';
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) {}

  PREF_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof prefs[id] === 'string' && prefs[id] !== el.value) {
      el.value = prefs[id];
      if (el.value === prefs[id]) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const save = () => {
      prefs[id] = el.value;
      try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
    };
    el.addEventListener('change', save);
    el.addEventListener('input', save);
  });
})();
