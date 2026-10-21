import { cropCanvas, cropCtx, editorModal, hideStatus, showStatus, unifiedExportModal } from './dom.js';
import { S, activeSelection, editingItem, getItem, items } from './state.js';
import { dimsOf, syncCustomDims } from './dims.js';
import { runAutoCropLogic } from './autocrop.js';
import { computeDrawSize, renderImage } from './render.js';
import { APP } from '../shared/config.js';
import { pushUndo, showUndoToast } from './undo.js';
import { applyAutoCrop } from './import.js';
import { updateGallery } from './gallery.js';

export let currentImage = null;

export let zoomLevel = 1;

export let offsetX = 0;

export let offsetY = 0;

export let rawOffsetX = 0;

export let rawOffsetY = 0; 

export let isDragging = false;

export let dragStart = { x: 0, y: 0 };

export let showShadow = false;

export let shadowOpacity = 0.3;

export let shadowDirection = 180;

export let shadowDistance = 4;

export let showBackgroundBlur = false;

export let backgroundBlurIntensity = 20;

export let backgroundBlurZoom = 1.3; // NOUVEAU

export let showBgColor = false;

export let bgColorValue = '#ffffff';

export let showGuides = true;

export let showSafeZones = false;

export let enableSnapping = true;

export let showBorderBox = true;

document.getElementById('modalClose').addEventListener('click', () => closeModal(false));

document.getElementById('modalCancelBtn').addEventListener('click', () => closeModal(false));

document.getElementById('modalApplyBtn').addEventListener('click', () => closeModal(true));

editorModal.addEventListener('click', (e) => {
  if (e.target === editorModal) closeModal(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (editorModal.classList.contains('open')) closeModal(false);
    if (unifiedExportModal.classList.contains('open')) unifiedExportModal.classList.remove('open');
  }
});

// --- EVENEMENTS EDITEUR ---
document.getElementById('toggleGuidesBtn').addEventListener('click', (e) => {
  showGuides = !showGuides;
  e.currentTarget.textContent = showGuides ? '⌖ Guides : ON' : '⌖ Guides : OFF';
  e.currentTarget.style.color = showGuides ? 'var(--accent)' : 'var(--text)';
  e.currentTarget.style.borderColor = showGuides ? 'var(--accent)' : 'transparent';
  drawCanvasPreview();
});

document.getElementById('toggleSafeZonesBtn').addEventListener('click', (e) => {
  showSafeZones = !showSafeZones;
  e.currentTarget.textContent = showSafeZones ? '📺 Safe Zones : ON' : '📺 Safe Zones : OFF';
  e.currentTarget.style.color = showSafeZones ? 'var(--accent)' : 'var(--text)';
  e.currentTarget.style.borderColor = showSafeZones ? 'var(--accent)' : 'transparent';
  drawCanvasPreview();
});

document.getElementById('toggleSnapBtn').addEventListener('click', (e) => {
  enableSnapping = !enableSnapping;
  e.currentTarget.textContent = enableSnapping ? '🧲 Magnétisme : ON' : '🧲 Magnétisme : OFF';
  e.currentTarget.style.color = enableSnapping ? 'var(--accent)' : 'var(--text)';
  e.currentTarget.style.borderColor = enableSnapping ? 'var(--accent)' : 'transparent';
});

document.getElementById('toggleBorderBoxBtn').addEventListener('click', (e) => {
  showBorderBox = !showBorderBox;
  e.currentTarget.textContent = showBorderBox ? '🖼️ Limites cadre : ON' : '🖼️ Limites cadre : OFF';
  e.currentTarget.style.color = showBorderBox ? 'var(--accent)' : 'var(--text)';
  e.currentTarget.style.borderColor = showBorderBox ? 'var(--accent)' : 'transparent';
  
  if (showBorderBox) {
    cropCanvas.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    cropCanvas.style.outline = '1px solid rgba(0, 0, 0, 0.8)';
  } else {
    cropCanvas.style.border = 'none';
    cropCanvas.style.outline = 'none';
  }
});

document.getElementById('modalPresetSelect').addEventListener('change', async (e) => {
  const newPreset = e.target.value;
  const item = editingItem();
  item.preset = newPreset;
  if (newPreset === 'custom') {
    item.customDims = item.customDims || { w: S.customW, h: S.customH };
    syncCustomDims(item.customDims.w, item.customDims.h, item.customDims.w / item.customDims.h, null, false);
  }
  
  const isBlur = (newPreset === 'blur');
  const isUne = (newPreset === 'une');
  zoomLevel = isBlur ? 0.85 : 1;
  
  document.getElementById('zoomSlider').value = zoomLevel;
  document.getElementById('zoomValue').textContent = Math.round(zoomLevel * 100) + '%';
  
  showBackgroundBlur = isBlur;
  item.blur.enabled = isBlur;
  blurToggle.classList.toggle('on', showBackgroundBlur);
  blurIntensityGroup.classList.toggle('visible', showBackgroundBlur);
  if (isBlur && item.blur.intensity < 10) {
      item.blur.intensity = 20;
      backgroundBlurIntensity = 20;
      document.getElementById('blurIntensitySlider').value = 20;
      document.getElementById('blurIntensityValue').textContent = '20px';
  }

  showBgColor = isUne;
  item.bgColor.enabled = isUne;
  const bgColorToggle = document.getElementById('bgColorToggle');
  const bgColorGroup = document.getElementById('bgColorGroup');
  bgColorToggle.classList.toggle('on', showBgColor);
  bgColorGroup.classList.toggle('visible', showBgColor);
  
  document.getElementById('modalCustomDimsUI').style.display = (newPreset === 'custom') ? 'flex' : 'none';

  const btn = document.getElementById('smartCropBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = "⏳ Analyse...";
  
  const offsets = await runAutoCropLogic(currentImage, newPreset, zoomLevel, dimsOf(item));
  offsetX = offsets.offsetX;
  offsetY = offsets.offsetY;
  item.crop.rawOffsetX = offsets.rawOffsetX; // Sauvegarde pour zoom intelligent
  item.crop.rawOffsetY = offsets.rawOffsetY;
  item.crop.method = offsets.method; 
  rawOffsetX = offsetX;
  rawOffsetY = offsetY;
  
  btn.innerHTML = origText;
  drawCanvasPreview();
});

document.getElementById('zoomSlider').addEventListener('input', (e) => {
  zoomLevel = parseFloat(e.target.value);
  document.getElementById('zoomValue').textContent = Math.round(zoomLevel * 100) + '%';
  drawCanvasPreview();
});

cropCanvas.addEventListener('pointerdown', (e) => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  rawOffsetX = offsetX;
  rawOffsetY = offsetY;
});

document.addEventListener('pointermove', (e) => {
  if (!isDragging || !editorModal.classList.contains('open')) return;
  
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;

  rawOffsetX += (e.clientX - dragStart.x) * scaleX;
  rawOffsetY += (e.clientY - dragStart.y) * scaleY;
  
  if (enableSnapping && currentImage) {
    const preset = editingItem().preset || '1920x1080';
    const dims = dimsOf(editingItem());
    const isBlurPreset = (preset === 'blur');
    const { drawWidth, drawHeight } = computeDrawSize(dims, { zoom: zoomLevel }, isBlurPreset, currentImage);
    const SNAP = APP.SNAP_PX;

    const snapXPoints = [0, (drawWidth - dims.w) / 2, (dims.w - drawWidth) / 2];
    const snapYPoints = [0, (drawHeight - dims.h) / 2, (dims.h - drawHeight) / 2];

    let bestX = rawOffsetX;
    let minXDist = SNAP + 1;
    for (let p of snapXPoints) {
      let dist = Math.abs(rawOffsetX - p);
      if (dist < SNAP && dist < minXDist) { minXDist = dist; bestX = p; }
    }
    offsetX = (minXDist <= SNAP) ? bestX : rawOffsetX;

    let bestY = rawOffsetY;
    let minYDist = SNAP + 1;
    for (let p of snapYPoints) {
      let dist = Math.abs(rawOffsetY - p);
      if (dist < SNAP && dist < minYDist) { minYDist = dist; bestY = p; }
    }
    offsetY = (minYDist <= SNAP) ? bestY : rawOffsetY;
  } else {
    offsetX = rawOffsetX;
    offsetY = rawOffsetY;
  }
  
  dragStart = { x: e.clientX, y: e.clientY };
  drawCanvasPreview();
});

document.addEventListener('pointerup', () => { isDragging = false; });

document.addEventListener('pointercancel', () => { isDragging = false; });

export const shadowToggle = document.getElementById('shadowToggle');

export const shadowGroup = document.getElementById('shadowGroup');

shadowToggle.addEventListener('click', () => {
  showShadow = !showShadow;
  shadowToggle.classList.toggle('on', showShadow);
  shadowGroup.classList.toggle('visible', showShadow);
  drawCanvasPreview();
});

document.getElementById('shadowOpacitySlider').addEventListener('input', (e) => {
  shadowOpacity = parseFloat(e.target.value);
  document.getElementById('shadowOpacityValue').textContent = Math.round(shadowOpacity * 100) + '%';
  drawCanvasPreview();
});

document.getElementById('shadowDirectionSlider').addEventListener('input', (e) => {
  shadowDirection = parseInt(e.target.value);
  document.getElementById('shadowDirectionValue').textContent = shadowDirection + '°';
  drawCanvasPreview();
});

document.getElementById('shadowDistanceSlider').addEventListener('input', (e) => {
  shadowDistance = parseInt(e.target.value);
  document.getElementById('shadowDistanceValue').textContent = shadowDistance + 'px';
  drawCanvasPreview();
});

export const blurToggle = document.getElementById('blurToggle');

export const blurIntensityGroup = document.getElementById('blurIntensityGroup');

blurToggle.addEventListener('click', () => {
  showBackgroundBlur = !showBackgroundBlur;
  blurToggle.classList.toggle('on', showBackgroundBlur);
  blurIntensityGroup.classList.toggle('visible', showBackgroundBlur);
  editingItem().blur.enabled = showBackgroundBlur;
  drawCanvasPreview();
});

document.getElementById('blurIntensitySlider').addEventListener('input', (e) => {
  backgroundBlurIntensity = parseInt(e.target.value);
  editingItem().blur.intensity = backgroundBlurIntensity;
  document.getElementById('blurIntensityValue').textContent = backgroundBlurIntensity + 'px';
  drawCanvasPreview();
});

// Événement pour le nouveau slider du zoom du fond flou
document.getElementById('blurBgZoomSlider').addEventListener('input', (e) => {
  backgroundBlurZoom = parseFloat(e.target.value);
  editingItem().blur.bgZoom = backgroundBlurZoom;
  document.getElementById('blurBgZoomValue').textContent = Math.round(backgroundBlurZoom * 100) + '%';
  drawCanvasPreview();
});

document.getElementById('bgColorToggle').addEventListener('click', () => {
  showBgColor = !showBgColor;
  document.getElementById('bgColorToggle').classList.toggle('on', showBgColor);
  document.getElementById('bgColorGroup').classList.toggle('visible', showBgColor);
  if (showBgColor) editingItem().bgColor.enabled = true;
  drawCanvasPreview();
});

document.getElementById('bgColorPicker').addEventListener('input', (e) => {
  bgColorValue = e.target.value;
  editingItem().bgColor.color = bgColorValue;
  drawCanvasPreview();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  const preset = editingItem().preset || '1920x1080';
  zoomLevel = preset === 'blur' ? 0.85 : 1;
  offsetX = 0; offsetY = 0; rawOffsetX = 0; rawOffsetY = 0;
  document.getElementById('zoomSlider').value = zoomLevel;
  document.getElementById('zoomValue').textContent = Math.round(zoomLevel * 100) + '%';
  drawCanvasPreview();
});

document.getElementById('smartCropBtn').addEventListener('click', async () => {
  if (!currentImage) return;
  const btn = document.getElementById('smartCropBtn');
  const originalText = btn.innerHTML;
  btn.textContent = "⏳ Analyse...";

  const item = editingItem();
  const preset = item.preset || '1920x1080';
  const offsets = await runAutoCropLogic(currentImage, preset, zoomLevel, dimsOf(item));
  offsetX = offsets.offsetX;
  offsetY = offsets.offsetY;
  item.crop.rawOffsetX = offsets.rawOffsetX; // Sauvegarde pour zoom intelligent
  item.crop.rawOffsetY = offsets.rawOffsetY;
  item.crop.method = offsets.method; 
  rawOffsetX = offsetX;
  rawOffsetY = offsetY;

  drawCanvasPreview();
  btn.innerHTML = originalText;
});

document.getElementById('centerBtn').addEventListener('click', () => {
  offsetX = 0;
  offsetY = 0;
  rawOffsetX = 0;
  rawOffsetY = 0;
  drawCanvasPreview();
});

export async function applyCurrentSettingsToTargets(targets) {
  pushUndo('Réglages appliqués');
  document.getElementById('progressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
  document.getElementById('progressWrap').classList.add('visible');
  showStatus("Application en cours...", "success");

  const presetToApply = editingItem().preset;
  const dimsToApply = presetToApply === 'custom' ? { ...dimsOf(editingItem()) } : null;

  for (let i = 0; i < targets.length; i++) {
      const idx = targets[i];
      const oldPreset = getItem(idx).preset;
      const oldDims = getItem(idx).customDims;
      const zoomChanged = getItem(idx).crop.zoom !== zoomLevel;
      
      getItem(idx).preset = presetToApply;
      getItem(idx).customDims = dimsToApply ? { ...dimsToApply } : null;
      getItem(idx).crop.zoom = zoomLevel;
      getItem(idx).shadow = { enabled: showShadow, opacity: shadowOpacity, direction: shadowDirection, distance: shadowDistance };
      getItem(idx).blur = { enabled: showBackgroundBlur, intensity: backgroundBlurIntensity, bgZoom: backgroundBlurZoom };
      getItem(idx).bgColor = { enabled: showBgColor, color: bgColorValue };
      getItem(idx).customized = true;

      const dimsChanged = !!dimsToApply && (!oldDims || oldDims.w !== dimsToApply.w || oldDims.h !== dimsToApply.h);
      if (oldPreset !== presetToApply || zoomChanged || dimsChanged) {
          await applyAutoCrop(idx, getItem(idx).file);
      }

      document.getElementById('progressBar').style.width = (((i + 1) / targets.length) * 100) + '%';
  }

  document.getElementById('progressWrap').classList.remove('visible');
  hideStatus();
  updateGallery();
  showUndoToast(`Réglages appliqués à ${targets.length} image(s)`);
}

document.getElementById('modalApplyAllBtn').addEventListener('click', async () => {
  const targets = items.map(it => it.id);
  await applyCurrentSettingsToTargets(targets);
  closeModal(false);
});

document.getElementById('modalApplySelectionBtn').addEventListener('click', async () => {
  const targets = activeSelection.size > 0 ? Array.from(activeSelection) : [S.editingId];
  await applyCurrentSettingsToTargets(targets);
  closeModal(false);
});

export function saveEditorState() {
  if (!editingItem()) return;
  editingItem().crop.zoom = zoomLevel;
  editingItem().crop.offsetX = offsetX;
  editingItem().crop.offsetY = offsetY;
  editingItem().shadow = {
    opacity: shadowOpacity, direction: shadowDirection,
    distance: shadowDistance, enabled: showShadow
  };
  editingItem().blur = {
    enabled: showBackgroundBlur, intensity: backgroundBlurIntensity, bgZoom: backgroundBlurZoom
  };
  editingItem().bgColor = {
    enabled: showBgColor, color: bgColorValue
  };
  editingItem().customized = true;
  updateGallery();
}

export function openEditorModal(filename) {
  document.getElementById('modalTitle').textContent = `Éditer — ${filename}`;
  editorModal.classList.add('open');

  const img = new Image();
  img.onload = () => {
    if (!editingItem()) { URL.revokeObjectURL(img.src); return; }
    currentImage = img;
    const preset = editingItem().preset || '1920x1080';
    const crop = editingItem().crop || { zoom: 1, offsetX: 0, offsetY: 0 };

    const initialZoom = crop.zoom ?? (preset === 'blur' ? 0.85 : 1);
    zoomLevel = initialZoom;
    offsetX = crop.offsetX;
    offsetY = crop.offsetY;
    rawOffsetX = offsetX;
    rawOffsetY = offsetY;
    
    document.getElementById('modalPresetSelect').value = preset;
    if (preset === 'custom') {
      const d = dimsOf(editingItem());
      syncCustomDims(d.w, d.h, d.w / d.h, null, false);
    }
    document.getElementById('modalCustomDimsUI').style.display = (preset === 'custom') ? 'flex' : 'none';
    
    document.getElementById('zoomSlider').value = zoomLevel;
    document.getElementById('zoomValue').textContent = Math.round(zoomLevel * 100) + '%';

    const shadow = editingItem().shadow || {};
    showShadow = shadow.enabled === true;
    shadowOpacity = shadow.opacity ?? 0.3;
    shadowDirection = shadow.direction ?? 180;
    shadowDistance = shadow.distance ?? 4;
    shadowToggle.classList.toggle('on', showShadow);
    shadowGroup.classList.toggle('visible', showShadow);
    document.getElementById('shadowOpacitySlider').value = shadowOpacity;
    document.getElementById('shadowDirectionSlider').value = shadowDirection;
    document.getElementById('shadowDistanceSlider').value = shadowDistance;
    document.getElementById('shadowOpacityValue').textContent = Math.round(shadowOpacity * 100) + '%';
    document.getElementById('shadowDirectionValue').textContent = shadowDirection + '°';
    document.getElementById('shadowDistanceValue').textContent = shadowDistance + 'px';

    const blur = editingItem().blur || {};
    showBackgroundBlur = blur.enabled || false;
    backgroundBlurIntensity = blur.intensity || 20;
    backgroundBlurZoom = blur.bgZoom || 1.3;

    blurToggle.classList.toggle('on', showBackgroundBlur);
    blurIntensityGroup.classList.toggle('visible', showBackgroundBlur);
    document.getElementById('blurIntensitySlider').value = backgroundBlurIntensity;
    document.getElementById('blurIntensityValue').textContent = backgroundBlurIntensity + 'px';
    document.getElementById('blurBgZoomSlider').value = backgroundBlurZoom;
    document.getElementById('blurBgZoomValue').textContent = Math.round(backgroundBlurZoom * 100) + '%';
    
    const bgColor = editingItem().bgColor || { enabled: false, color: '#ffffff' };
    showBgColor = bgColor.enabled;
    bgColorValue = bgColor.color;
    document.getElementById('bgColorToggle').classList.toggle('on', showBgColor);
    document.getElementById('bgColorGroup').classList.toggle('visible', showBgColor);
    document.getElementById('bgColorPicker').value = bgColorValue;

    URL.revokeObjectURL(img.src);
    drawCanvasPreview();
  };
  img.src = URL.createObjectURL(editingItem().file);
}

export function closeModal(save = false) {
  if (save && editingItem()) { pushUndo('Modification d\'image'); saveEditorState(); }
  editorModal.classList.remove('open');
  S.editingId = null;
  currentImage = null;
}

// Regroupe les demandes de redessin (curseurs, glisser) : au plus un rendu par image affichée
export let previewDrawQueued = false;

export function drawCanvasPreview() {
  if (previewDrawQueued) return;
  previewDrawQueued = true;
  requestAnimationFrame(() => { previewDrawQueued = false; drawCanvasPreviewNow(); });
}

export function drawCanvasPreviewNow() {
  if (!currentImage) return;
  const preset = editingItem().preset || '1920x1080';
  const dims = dimsOf(editingItem());
  const isBlurPreset = (preset === 'blur');

  if (cropCanvas.width !== dims.w || cropCanvas.height !== dims.h) {
    cropCanvas.width = dims.w;
    cropCanvas.height = dims.h;
  }

  const shadow = { opacity: shadowOpacity, direction: shadowDirection, distance: shadowDistance, enabled: showShadow };
  const blur = { enabled: showBackgroundBlur, intensity: backgroundBlurIntensity, bgZoom: backgroundBlurZoom };
  const bgColor = { enabled: showBgColor, color: bgColorValue };
  const drawCheckerboard = (!showBgColor || !bgColor.enabled);

  renderImage(cropCtx, currentImage, dims, { zoom: zoomLevel, offsetX, offsetY }, shadow, blur, bgColor, isBlurPreset, drawCheckerboard);

  if (showSafeZones) {
    cropCtx.save();
    const w = dims.w, h = dims.h;
    cropCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    cropCtx.lineWidth = 2;
    cropCtx.setLineDash([8, 8]);
    cropCtx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
    
    cropCtx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    cropCtx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
    
    cropCtx.font = "bold 14px Inter, sans-serif";
    cropCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    cropCtx.fillText("Action Safe", w * 0.05 + 8, h * 0.05 + 20);
    cropCtx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    cropCtx.fillText("Title Safe", w * 0.1 + 8, h * 0.1 + 20);
    cropCtx.restore();
  }

  if (showGuides) {
    cropCtx.save();
    const centerX = dims.w / 2;
    const centerY = dims.h / 2;
    const dashedStyle = 'rgba(255, 255, 255, 0.4)';
    const solidStyle = '#22c55e'; 

    cropCtx.beginPath();
    cropCtx.setLineDash(Math.abs(offsetX) < 1 ? [] : [12, 12]);
    cropCtx.strokeStyle = Math.abs(offsetX) < 1 ? solidStyle : dashedStyle;
    cropCtx.lineWidth = Math.abs(offsetX) < 1 ? 2 : 1.5;
    cropCtx.moveTo(centerX, 0); cropCtx.lineTo(centerX, dims.h); cropCtx.stroke();

    cropCtx.beginPath();
    cropCtx.setLineDash(Math.abs(offsetY) < 1 ? [] : [12, 12]);
    cropCtx.strokeStyle = Math.abs(offsetY) < 1 ? solidStyle : dashedStyle;
    cropCtx.lineWidth = Math.abs(offsetY) < 1 ? 2 : 1.5;
    cropCtx.moveTo(0, centerY); cropCtx.lineTo(dims.w, centerY); cropCtx.stroke();
    
    cropCtx.beginPath();
    cropCtx.setLineDash([]);
    cropCtx.strokeStyle = (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) ? solidStyle : 'rgba(255, 255, 255, 0.8)';
    cropCtx.lineWidth = 2;
    cropCtx.moveTo(centerX - 12, centerY); cropCtx.lineTo(centerX + 12, centerY);
    cropCtx.moveTo(centerX, centerY - 12); cropCtx.lineTo(centerX, centerY + 12);
    cropCtx.stroke();
    cropCtx.restore();
  }
}

// --- RACCOURCIS CLAVIER DE L'ÉDITEUR ---
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || !editorModal.classList.contains('open')) return;
  const t = e.target;
  const tag = t && t.tagName;
  const isRange = tag === 'INPUT' && t.type === 'range';
  const typing = tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || (tag === 'INPUT' && !isRange && t.type !== 'checkbox');
  if (typing) return;
  const step = e.shiftKey ? 10 : 1;
  const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (arrows[e.key] && !isRange) {
    e.preventDefault();
    offsetX += arrows[e.key][0]; offsetY += arrows[e.key][1];
    rawOffsetX = offsetX; rawOffsetY = offsetY;
    drawCanvasPreview();
  } else if ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const slider = document.getElementById('zoomSlider');
    const delta = (e.key === '+' || e.key === '=') ? 0.05 : -0.05;
    zoomLevel = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), +(zoomLevel + delta).toFixed(2)));
    slider.value = zoomLevel;
    document.getElementById('zoomValue').textContent = Math.round(zoomLevel * 100) + '%';
    drawCanvasPreview();
  } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('centerBtn').click();
  } else if (e.key === 'Enter' && tag !== 'BUTTON' && !isRange) {
    e.preventDefault();
    document.getElementById('modalApplyBtn').click();
  }
}, true); // capture : lit l'état avant que Échap ne ferme la fenêtre
