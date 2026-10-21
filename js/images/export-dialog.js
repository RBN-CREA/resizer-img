import { S, items } from './state.js';
import { escapeHtml } from '../shared/html.js';
import { hideStatus, showStatus, unifiedExportModal } from './dom.js';
import { processImagesCustom } from './export-images.js';
import { notify } from '../shared/dialogs.js';
import { generateVideoWebCodecs } from './export-slideshow.js';

export const enableImageToggle = document.getElementById('enableImageToggle');

export const imageExportOptions = document.getElementById('imageExportOptions');

export const enableVideoToggle = document.getElementById('enableVideoToggle');

export const videoExportOptions = document.getElementById('videoExportOptions');

// UI Ken Burns Toggle
export const kenBurnsToggle = document.getElementById('kenBurnsToggle');

export const kenBurnsGroup = document.getElementById('kenBurnsGroup');

export let isImageExportEnabled = true;

export let isVideoExportEnabled = false;

document.getElementById('openUnifiedExportBtn').addEventListener('click', () => {
  if (items.length === 0) return;
  
  const folders = [...new Set(items.map(it => it.folder))];
  
  const imgFolderList = document.getElementById('imageFolderSelectionList');
  const vidFolderList = document.getElementById('videoFolderSelectionList');
  
  imgFolderList.innerHTML = '';
  vidFolderList.innerHTML = '';
  
  folders.forEach(folder => {
    // Liste pour l'export des Images
    const labelImg = document.createElement('label');
    labelImg.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer; background: var(--surface); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);';
    labelImg.innerHTML = `<input type="checkbox" value="${escapeHtml(folder)}" checked style="accent-color: var(--accent);"> ${escapeHtml(folder)}`;
    imgFolderList.appendChild(labelImg);
    
    // Liste pour l'export Vidéo
    const labelVid = document.createElement('label');
    labelVid.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer; background: var(--surface); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);';
    labelVid.innerHTML = `<input type="checkbox" value="${escapeHtml(folder)}" checked style="accent-color: var(--accent);"> ${escapeHtml(folder)}`;
    vidFolderList.appendChild(labelVid);
  });

  unifiedExportModal.classList.add('open');
});

document.getElementById('unifiedExportClose').addEventListener('click', () => unifiedExportModal.classList.remove('open'));

document.getElementById('unifiedExportCancel').addEventListener('click', () => unifiedExportModal.classList.remove('open'));

// Toggle Image Export
enableImageToggle.addEventListener('click', () => {
  isImageExportEnabled = !isImageExportEnabled;
  enableImageToggle.classList.toggle('on', isImageExportEnabled);
  imageExportOptions.style.display = isImageExportEnabled ? 'flex' : 'none';
});

// Toggle Video Export
enableVideoToggle.addEventListener('click', () => {
  isVideoExportEnabled = !isVideoExportEnabled;
  enableVideoToggle.classList.toggle('on', isVideoExportEnabled);
  videoExportOptions.style.display = isVideoExportEnabled ? 'flex' : 'none';
});

// Toggle Ken Burns
kenBurnsToggle.addEventListener('click', () => {
  S.isKenBurnsEnabled = !S.isKenBurnsEnabled;
  kenBurnsToggle.classList.toggle('on', S.isKenBurnsEnabled);
  kenBurnsGroup.classList.toggle('visible', S.isKenBurnsEnabled);
});

// Qualité JPEG / WebP (sans effet sur le PNG)
export const exportQualitySlider = document.getElementById('unifiedExportQuality');

export const exportFormatSelect = document.getElementById('unifiedExportFormat');

export function syncExportQualityUI() {
  document.getElementById('unifiedExportQualityVal').textContent = exportQualitySlider.value + '%';
  exportQualitySlider.disabled = exportFormatSelect.value === 'png';
  exportQualitySlider.style.opacity = exportQualitySlider.disabled ? '0.4' : '1';
}

exportQualitySlider.addEventListener('input', syncExportQualityUI);

exportFormatSelect.addEventListener('change', syncExportQualityUI);

syncExportQualityUI();

// Slider Durée
document.getElementById('unifiedSlideDuration').addEventListener('input', (e) => {
  document.getElementById('unifiedSlideDurationVal').textContent = parseFloat(e.target.value).toFixed(1) + 's';
});

// Slider Ken Burns
document.getElementById('unifiedKenBurns').addEventListener('input', (e) => {
  document.getElementById('unifiedKenBurnsVal').textContent = e.target.value + '%';
});

document.getElementById('unifiedExportConfirm').addEventListener('click', async () => {
  unifiedExportModal.classList.remove('open');
  let hasExported = false;

  if (isImageExportEnabled) {
    const selectedImgFolders = Array.from(document.querySelectorAll('#imageFolderSelectionList input:checked')).map(cb => cb.value);
    if (selectedImgFolders.length > 0) {
        const imageFormat = document.getElementById('unifiedExportFormat').value;
        const structure = document.getElementById('unifiedExportStructure').value;
        await processImagesCustom(imageFormat, structure, selectedImgFolders, {
          quality: parseInt(document.getElementById('unifiedExportQuality').value, 10) / 100,
          suffix: document.getElementById('unifiedExportSuffix').value.replace(/[\\/:*?"<>|]/g, '_')
        });
        hasExported = true;
    }
  }

  if (isVideoExportEnabled) {
    const selectedVidFolders = Array.from(document.querySelectorAll('#videoFolderSelectionList input:checked')).map(cb => cb.value);
    if (selectedVidFolders.length > 0) {
        const duration = parseFloat(document.getElementById('unifiedSlideDuration').value);
        const transition = document.getElementById('unifiedTransitionType').value;
        const kenBurnsPercent = S.isKenBurnsEnabled ? parseFloat(document.getElementById('unifiedKenBurns').value) : 0;

        if (!("VideoEncoder" in window)) {
            notify("Votre navigateur ne supporte pas WebCodecs. Utilisez un navigateur basé sur Chromium ou un Safari récent.");
            return;
        }
        await generateVideoWebCodecs(selectedVidFolders, duration, transition, kenBurnsPercent);
        hasExported = true;
    }
  }
  
  if (!hasExported) {
      showStatus("Aucun dossier sélectionné (ou aucun type d'export activé).", "error");
      setTimeout(hideStatus, 4000);
  }
});

unifiedExportModal.addEventListener('click', (e) => {
  if (e.target === unifiedExportModal) unifiedExportModal.classList.remove('open');
});
