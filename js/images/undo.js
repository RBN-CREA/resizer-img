import { S, activeSelection, items, restoreItems } from './state.js';
import { APP } from '../shared/config.js';
import { editorModal, editorView, hideStatus, showStatus, unifiedExportModal, uploadView } from './dom.js';
import { updateGallery } from './gallery.js';

// --- ANNULER (Ctrl/Cmd+Z) : instantanés de l'état avant chaque action groupée ---
export const undoStack = [];

export     let toastTimer = null;

export function snapshotItems() {
  return items.map(it => ({
    id: it.id, file: it.file, folder: it.folder, preset: it.preset, customized: it.customized,
    customDims: it.customDims ? { ...it.customDims } : null,
    crop: { ...it.crop }, shadow: { ...it.shadow }, blur: { ...it.blur }, bgColor: { ...it.bgColor }
  }));
}

export function pushUndo(label) {
  undoStack.push({ label, snapshot: snapshotItems() });
  if (undoStack.length > APP.UNDO_LIMIT) undoStack.shift();
}

export function showUndoToast(message) {
  let toast = document.getElementById('undoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undoToast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<span></span><button type="button">Annuler</button>';
    toast.querySelector('button').addEventListener('click', undo);
    document.body.appendChild(toast);
  }
  toast.querySelector('span').textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), APP.TOAST_MS);
}

export function undo() {
  if (document.getElementById('progressWrap').classList.contains('visible')) return;
  const entry = undoStack.pop();
  if (!entry) return;
  restoreItems(entry.snapshot);
  activeSelection.clear();
  S.lastSelectedId = null;
  uploadView.classList.toggle('hidden', items.length > 0);
  editorView.classList.toggle('active', items.length > 0);
  updateGallery();
  const toast = document.getElementById('undoToast');
  if (toast) toast.classList.remove('visible');
  showStatus(`Annulé : ${entry.label}`, 'success');
  setTimeout(hideStatus, 2500);
}

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
  if (!document.getElementById('imageView').classList.contains('active')) return;
  if (editorModal.classList.contains('open') || unifiedExportModal.classList.contains('open')) return;
  if (document.querySelector('.modal-overlay.open')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  e.preventDefault();
  undo();
});
