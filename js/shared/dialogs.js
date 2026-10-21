import { APP } from './config.js';
import { pixelConfetti } from './pixel.js';

// Message non bloquant (remplace alert())
export let notifyTimer = null;

export function notify(message) {
  let el = document.getElementById('msgToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'msgToast';
    el.className = 'toast';
    el.setAttribute('role', 'alert');
    el.innerHTML = '<span></span><button type="button">OK</button>';
    el.querySelector('button').addEventListener('click', () => el.classList.remove('visible'));
    document.body.appendChild(el);
  }
  el.querySelector('span').textContent = message;
  el.classList.add('visible');
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => el.classList.remove('visible'), APP.TOAST_MS);
}

// Saisie d'un texte (remplace prompt()) — renvoie une Promise<string|null>
export function promptDialog(title, label, defaultValue = '', okLabel = 'Valider') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal px-dialog" style="max-width: 420px;">
        <div class="modal-header"><h2></h2></div>
        <form style="padding: 20px 24px; display: flex; flex-direction: column; gap: 8px;">
          <label style="font-size: 0.8125rem; color: var(--text-muted);"></label>
          <input type="text" class="format-select" style="background-image: none;">
          <div class="modal-footer" style="padding: 16px 0 0; border: none;">
            <div class="modal-footer-right" style="margin-left: auto;">
              <button type="button" class="btn btn-ghost" data-act="cancel">Annuler</button>
              <button type="submit" class="btn btn-primary"></button>
            </div>
          </div>
        </form>
      </div>`;
    overlay.querySelector('h2').textContent = title;
    const input = overlay.querySelector('input');
    const lab = overlay.querySelector('label');
    lab.textContent = label;
    input.id = 'promptDialogInput';
    lab.setAttribute('for', input.id);
    input.value = defaultValue;
    overlay.querySelector('[type="submit"]').textContent = okLabel;

    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-act="cancel"]')) finish(null);
    });
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      finish(input.value.trim() || null);
    });
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

// Boîte de confirmation intégrée (remplace confirm()) — renvoie une Promise<boolean>
export function confirmDialog(title, message, okLabel = 'Confirmer') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal px-dialog" style="max-width: 420px;">
        <div class="modal-header"><h2></h2></div>
        <div style="padding: 20px 24px; font-size: 0.9rem; color: var(--text-muted);"></div>
        <div class="modal-footer">
          <div class="modal-footer-right" style="margin-left: auto;">
            <button class="btn btn-ghost" data-act="cancel">Annuler</button>
            <button class="btn btn-danger" data-act="ok"></button>
          </div>
        </div>
      </div>`;
    overlay.querySelector('h2').textContent = title;
    overlay.querySelector('.modal-header + div').textContent = message;
    const okBtn = overlay.querySelector('[data-act="ok"]');
    okBtn.textContent = okLabel;

    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false);
      const act = e.target.closest('[data-act]');
      if (act) finish(act.dataset.act === 'ok');
    });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="cancel"]').focus();
  });
}

// ---------- Fenêtre de notification de fin d'export ----------
// Les exports signalent leur résultat avec reportExport(). Pendant un export combiné (images + diaporama),
// beginExportReport() / endExportReport() regroupent tout dans une seule fenêtre affichée à la fin.
let collectedReports = null;

export function beginExportReport() {
  collectedReports = [];
}

export function reportExport(entry) {
  if (collectedReports) collectedReports.push(entry);
  else showExportResult([entry]);
}

export function endExportReport() {
  const entries = collectedReports;
  collectedReports = null;
  if (entries && entries.length) showExportResult(entries);
}

// entry : { type: 'success' | 'error', lines: string[], errors?: string[] }
function showExportResult(entries) {
  const okCount = entries.filter(e => e.type === 'success').length;
  const type = okCount === entries.length ? 'success' : (okCount === 0 ? 'error' : 'warning');
  const title = { success: 'Export terminé !', warning: 'Export terminé avec des erreurs', error: 'Export échoué' }[type];
  const lines = entries.flatMap(e => e.lines || []);
  const errors = entries.flatMap(e => e.errors || []);

  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open px-result';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'exportResultTitle');
  overlay.innerHTML = `
    <div class="modal px-dialog px-result-box" data-type="${type}">
      <div class="px-result-icon" aria-hidden="true"></div>
      <h2 class="px-result-title" id="exportResultTitle"></h2>
      <ul class="px-result-lines"></ul>
      <ul class="px-result-errors"></ul>
      <button type="button" class="px-btn" data-act="ok">OK</button>
    </div>`;
  overlay.querySelector('.px-result-title').textContent = title;
  const fill = (sel, items) => {
    const ul = overlay.querySelector(sel);
    items.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    if (!items.length) ul.remove();
  };
  fill('.px-result-lines', lines);
  fill('.px-result-errors', errors);

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (previous && previous.focus && document.contains(previous)) previous.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-act="ok"]')) close(); });
  document.body.appendChild(overlay);
  overlay.querySelector('[data-act="ok"]').focus();
  if (type !== 'error') pixelConfetti();
}
