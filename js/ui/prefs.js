// Préférences mémorisées entre deux sessions (réglages d'export et tri)
export const PREF_IDS = ['sortSelect', 'unifiedExportFormat', 'unifiedExportStructure', 'unifiedExportQuality', 'unifiedExportSuffix',
  'unifiedSlideDuration', 'unifiedTransitionType', 'unifiedKenBurns', 'unifiedKenBurnsDirection', 'unifiedVideoQuality', 'videoExportQuality'];

export const PREF_KEY = 'resizeStudio.prefs.v1';

export let prefs = {};

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
