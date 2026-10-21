import { editorView } from './dom.js';
import { activeSelection, items } from './state.js';
import { updateGallerySelectionUI } from './gallery.js';

// --- RACCOURCIS CLAVIER DE LA GALERIE ---
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey) return;
  const t = e.target;
  const tag = t && t.tagName;
  const isRange = tag === 'INPUT' && t.type === 'range';
  const typing = tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || (tag === 'INPUT' && !isRange && t.type !== 'checkbox');

  if (document.querySelector('.modal-overlay.open')) return;
  if (!document.getElementById('imageView').classList.contains('active') || !editorView.classList.contains('active')) return;
  if (typing) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    items.forEach(it => activeSelection.add(it.id));
    updateGallerySelectionUI();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeSelection.size > 0) {
    e.preventDefault();
    document.getElementById('clearBtn').click();
  } else if (e.key === 'Escape' && activeSelection.size > 0) {
    activeSelection.clear();
    updateGallerySelectionUI();
  }
}, true); // capture : lit l'état des fenêtres avant que Échap ne les ferme
