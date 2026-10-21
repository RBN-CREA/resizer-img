import { dropZone, editorView, fileInput, folderInput, hideStatus, showStatus, uploadView } from './dom.js';
import { S, activeSelection, addItem, defaultBgColor, defaultBlur, defaultCrop, getItem, items, removeItems } from './state.js';
import { pushUndo, showUndoToast } from './undo.js';
import { resetAll, updateGallery, updateGallerySelectionUI } from './gallery.js';
import { confirmDialog } from '../shared/dialogs.js';
import { runAutoCropLogic } from './autocrop.js';
import { dimsOf } from './dims.js';

// --- EVENEMENTS GLOBAUX ---
document.getElementById('selectFilesBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

document.getElementById('selectFolderBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  folderInput.click();
});

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => loadImages([...e.target.files].filter(f => f.type.startsWith('image/') && !f.name.startsWith('.'))));

folderInput.addEventListener('change', (e) => {
  loadImages([...e.target.files].filter(f => f.type.startsWith('image/') && !f.name.startsWith('.')));
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  loadImages([...e.dataTransfer.files].filter(f => f.type.startsWith('image/') && !f.name.startsWith('.')));
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const preset = btn.dataset.preset;
    document.getElementById('customDimsUI').style.display = (preset === 'custom') ? 'flex' : 'none';
    await applyAllAutoCrop(preset);
  });
});

document.getElementById('newUploadBtn').addEventListener('click', () => fileInput.click());

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (items.length === 0) return;
  if (activeSelection.size > 0 && activeSelection.size < items.length) {
      const n = activeSelection.size;
      pushUndo(`${n} image(s) supprimée(s)`);
      removeItems(activeSelection);
      activeSelection.clear();
      S.lastSelectedId = null;
      updateGallery();
      showUndoToast(`${n} image(s) supprimée(s)`);
  } else {
      const n = items.length;
      const ok = await confirmDialog('Tout effacer ?', `${n} image(s) et tous leurs réglages seront retirées. Vous pourrez annuler juste après avec Ctrl/Cmd+Z.`, 'Tout effacer');
      if (!ok) return;
      pushUndo(`${n} image(s) supprimée(s)`);
      resetAll();
      showUndoToast(`${n} image(s) supprimée(s)`);
  }
});

export async function applyAllAutoCrop(preset) {
  if (items.length === 0) return;
  const targets = activeSelection.size > 0 ? Array.from(activeSelection) : items.map(it => it.id);

  pushUndo('Changement de format');
  document.getElementById('progressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
  document.getElementById('progressWrap').classList.add('visible');
  showStatus("Recadrage automatique en cours...", "success");

  for (let i = 0; i < targets.length; i++) {
    const idx = targets[i];
    const it = getItem(idx);
    if (!it) continue;
    it.preset = preset;
    it.customDims = preset === 'custom' ? { w: S.customW, h: S.customH } : null;
    it.crop = defaultCrop(preset);
    it.blur = defaultBlur(preset);
    it.bgColor = defaultBgColor(preset);

    await applyAutoCrop(idx, it.file);
    document.getElementById('progressBar').style.width = (((i + 1) / targets.length) * 100) + '%';
  }

  document.getElementById('progressWrap').classList.remove('visible');
  hideStatus();
  updateGallery();
  showUndoToast(`Format appliqué à ${targets.length} image(s)`);
}

export async function loadImages(files) {
  const images = files.filter(f => f.type.startsWith('image/') && !f.name.startsWith('.'));
  if (!images.length) return;

  uploadView.classList.add('hidden');
  editorView.classList.add('active');
  document.getElementById('progressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
  document.getElementById('progressWrap').classList.add('visible');
  showStatus("Importation et analyse IA en cours...", "success");

  const currentActivePreset = document.querySelector('.preset-btn.active').dataset.preset || '1920x1080';
  for (let i = 0; i < images.length; i++) {
    const file = images[i];

    let folderName = "Divers";
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/');
      if (parts.length > 1) {
        folderName = parts[parts.length - 2];
      }
    }

    const idx = addItem(file, folderName, currentActivePreset).id;

    await applyAutoCrop(idx, file);
    document.getElementById('progressBar').style.width = (((i + 1) / images.length) * 100) + '%';
  }

  document.getElementById('progressWrap').classList.remove('visible');
  hideStatus();
  
  activeSelection.clear();
  updateGallerySelectionUI();
  document.getElementById('fileCountNum').textContent = items.length;
  updateGallery();
}

export function applyAutoCrop(id, file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const it = getItem(id);
      if (it) {
        const zoomLvl = it.crop.zoom || (it.preset === 'blur' ? 0.85 : 1);
        const offsets = await runAutoCropLogic(img, it.preset || '1920x1080', zoomLvl, dimsOf(it));
        it.crop.offsetX = offsets.offsetX;
        it.crop.offsetY = offsets.offsetY;
        it.crop.rawOffsetX = offsets.rawOffsetX; // Sauvegarde pour zoom intelligent
        it.crop.rawOffsetY = offsets.rawOffsetY;
        it.crop.method = offsets.method;
      }
      URL.revokeObjectURL(img.src);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(); };
    img.src = URL.createObjectURL(file);
  });
}
