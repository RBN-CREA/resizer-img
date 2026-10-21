import { APP } from './config.js';
import { confettiBurst } from './confetti.js';

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
      <div class="modal" style="max-width: 420px;">
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
      <div class="modal" style="max-width: 420px;">
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

// Icônes animées (le tracé se dessine à l'ouverture de la fenêtre)
const RESULT_ICONS = {
  success: '<svg class="ui-result-icon" viewBox="0 0 52 52" aria-hidden="true"><circle class="ui-ring" pathLength="1" cx="26" cy="26" r="24"/><path class="ui-mark" pathLength="1" d="M14 27l8 8 16-17"/></svg>',
  error: '<svg class="ui-result-icon" viewBox="0 0 52 52" aria-hidden="true"><circle class="ui-ring" pathLength="1" cx="26" cy="26" r="24"/><path class="ui-mark" pathLength="1" d="M18 18l16 16M34 18L18 34"/></svg>',
  warning: '<svg class="ui-result-icon" viewBox="0 0 52 52" aria-hidden="true"><path class="ui-ring" pathLength="1" d="M26 5L49 45H3Z"/><path class="ui-mark" pathLength="1" d="M26 20v13M26 38.5v.5"/></svg>'
};

// entry : { type: 'success' | 'error', files?: [{ name, detail }], lines?: string[], errors?: string[] }
//   files : un fichier créé = une seule tuile (nom + contenu et poids)
//   lines : message simple (une tuile de texte)
function showExportResult(entries) {
  const okCount = entries.filter(e => e.type === 'success').length;
  const type = okCount === entries.length ? 'success' : (okCount === 0 ? 'error' : 'warning');
  const title = { success: 'Export terminé !', warning: 'Export terminé avec des erreurs', error: 'Export échoué' }[type];
  const files = entries.flatMap(e => e.files || []);
  const lines = entries.flatMap(e => e.lines || []);
  const errors = entries.flatMap(e => e.errors || []);

  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open ui-result';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'exportResultTitle');
  overlay.innerHTML = `
    <div class="modal ui-result-box" data-type="${type}">
      ${RESULT_ICONS[type]}
      <h2 class="ui-result-title" id="exportResultTitle"></h2>
      <ul class="ui-result-lines"></ul>
      <ul class="ui-result-errors"></ul>
      <button type="button" class="ui-btn" data-act="ok">OK</button>
    </div>`;
  overlay.querySelector('.ui-result-title').textContent = title;

  const linesUl = overlay.querySelector('.ui-result-lines');
  files.forEach(({ name, detail }) => {
    const li = document.createElement('li');
    li.className = 'ui-result-file';
    const strong = document.createElement('strong');
    strong.textContent = name;
    const meta = document.createElement('span');
    meta.textContent = detail;
    li.append(strong, meta);
    linesUl.appendChild(li);
  });
  lines.forEach(t => { const li = document.createElement('li'); li.textContent = t; linesUl.appendChild(li); });
  if (!linesUl.children.length) linesUl.remove();

  const errorsUl = overlay.querySelector('.ui-result-errors');
  errors.forEach(t => { const li = document.createElement('li'); li.textContent = t; errorsUl.appendChild(li); });
  if (!errors.length) errorsUl.remove();

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
  if (type !== 'error') confettiBurst(overlay.querySelector('.ui-result-box'));
}
