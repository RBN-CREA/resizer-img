import { S, activeSelection, editingItem, getItem, items } from './state.js';
import { updateGallery } from './gallery.js';
import { editorModal } from './dom.js';
import { drawCanvasPreview } from './editor.js';

export let customRatio = 1.777778;

export let isRatioLocked = true;

export const presetDimensions = {
  '1920x1080': { w: 1920, h: 1080 },
  '1080x1920': { w: 1080, h: 1920 },
  'blur': { w: 1920, h: 1080 },
  'une': { w: 750, h: 992 },
  'custom': { w: S.customW, h: S.customH }
};

// Dimensions d'une image : les images « Personnalisé » gardent chacune leurs propres dimensions
export function dimsOf(it) {
  if (it && it.preset === 'custom') return it.customDims || { w: S.customW, h: S.customH };
  return presetDimensions[it && it.preset] || presetDimensions['1920x1080'];
}

// Méthode ayant servi au recadrage automatique (affichée sous chaque vignette)
export const cropMethodLabels = { face: '👤 visage', object: '🎯 sujet' };

export const presetLabels = {
  '1920x1080': 'Horizontal',
  '1080x1920': 'Vertical',
  'blur': 'Flou complet',
  'une': 'Une de presse',
  'custom': 'Personnalisé'
};

export function initScrubbableInputs() {
  const inputs = document.querySelectorAll('.scrubbable');
  let scrubDrag = false;
  let moved = false;
  let startX, startVal, activeInput;

  inputs.forEach(input => {
    input.addEventListener('dragstart', e => e.preventDefault());
    input.addEventListener('mousedown', (e) => {
      scrubDrag = true;
      moved = false;
      activeInput = input;
      startX = e.clientX;
      startVal = parseFloat(input.value) || 0;
    });
    input.addEventListener('input', () => {
       if(!moved) triggerChange(input);
    });
  });

  window.addEventListener('mousemove', (e) => {
    if (!scrubDrag || !activeInput) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 3) {
      moved = true;
      activeInput.blur(); 
      document.body.classList.add('scrubbing');
    }
    if (moved) {
      e.preventDefault(); 
      window.getSelection().removeAllRanges(); 
      const speed = e.shiftKey ? 10 : 1; 
      let newVal = startVal + (dx * speed);
      newVal = Math.max(1, Math.round(newVal));
      activeInput.value = newVal;
      triggerChange(activeInput);
    }
  });

  window.addEventListener('mouseup', () => {
    if (scrubDrag) {
      scrubDrag = false;
      document.body.classList.remove('scrubbing');
      if (!moved && activeInput) activeInput.focus();
      activeInput = null;
    }
  });

  function triggerChange(input) {
    if (input.id.toLowerCase().includes('w') && input.id !== 'videoCustomW') handleWChange(input);
    else if (input.id.toLowerCase().includes('h') && input.id !== 'videoCustomH') handleHChange(input);
  }
}

initScrubbableInputs();

export let galleryRefreshQueued = false;

export function queueGalleryRefresh() {
  if (galleryRefreshQueued) return;
  galleryRefreshQueued = true;
  requestAnimationFrame(() => { galleryRefreshQueued = false; updateGallery(); });
}

// apply=false : met seulement à jour les champs (ex. ouverture de l'éditeur sur une image « Personnalisé »)
export function syncCustomDims(w, h, r, selectValue = null, apply = true) {
  S.customW = w; S.customH = h; customRatio = r;
  presetDimensions['custom'].w = w;
  presetDimensions['custom'].h = h;

  if (apply) {
    // Les nouvelles dimensions ne concernent que l'image en cours d'édition, ou la sélection
    // (à défaut, toutes les images « Personnalisé ») — pas les autres tailles déjà définies.
    const editing = editorModal.classList.contains('open') ? editingItem() : null;
    if (editing) {
      if (editing.preset === 'custom') editing.customDims = { w, h };
    } else {
      const targets = activeSelection.size > 0 ? [...activeSelection].map(getItem) : items;
      let touched = false;
      targets.forEach(it => {
        if (it && it.preset === 'custom') { it.customDims = { w, h }; touched = true; }
      });
      if (touched) queueGalleryRefresh();
    }
  }
  
  document.getElementById('customW').value = w;
  document.getElementById('modalCustomW').value = w;
  document.getElementById('customH').value = h;
  document.getElementById('modalCustomH').value = h;
  
  if (!selectValue) {
     selectValue = 'custom';
     const ratios = {
         "1.777778": 16/9, "0.5625": 9/16, "1.333333": 4/3, 
         "0.75": 3/4, "1": 1, "2.333333": 21/9
     };
     for (let key in ratios) {
         if (Math.abs(r - ratios[key]) < 0.01) {
             selectValue = key;
             break;
         }
     }
  }
  document.getElementById('customRatio').value = selectValue;
  document.getElementById('modalCustomRatio').value = selectValue;
  
  if(editorModal.classList.contains('open') && editingItem() && editingItem().preset === 'custom') {
     drawCanvasPreview();
  }
}

export function handleWChange(input) {
  let w = parseInt(input.value) || 1;
  let h = S.customH;
  let r = customRatio;
  if (isRatioLocked) h = Math.max(1, Math.round(w / r));
  else r = w / h;
  syncCustomDims(w, h, r);
}

export function handleHChange(input) {
  let h = parseInt(input.value) || 1;
  let w = S.customW;
  let r = customRatio;
  if (isRatioLocked) w = Math.max(1, Math.round(h * r));
  else r = w / h;
  syncCustomDims(w, h, r);
}

export function handleRatioSelect(e) {
  const val = e.target.value;
  if (val === 'custom') {
      if (isRatioLocked) toggleLock(); 
      return;
  }
  if (!isRatioLocked) toggleLock(); 
  customRatio = parseFloat(val);
  let w = S.customW;
  let h = Math.max(1, Math.round(w / customRatio));
  syncCustomDims(w, h, customRatio, val);
}

document.getElementById('customRatio').addEventListener('change', handleRatioSelect);

document.getElementById('modalCustomRatio').addEventListener('change', handleRatioSelect);

export function toggleLock() {
  isRatioLocked = !isRatioLocked;
  const icon = isRatioLocked ? '🔒' : '🔓';
  document.getElementById('ratioLock').textContent = icon;
  document.getElementById('modalRatioLock').textContent = icon;
  if (isRatioLocked) {
      customRatio = S.customW / S.customH;
      syncCustomDims(S.customW, S.customH, customRatio);
  } else {
      document.getElementById('customRatio').value = 'custom';
      document.getElementById('modalCustomRatio').value = 'custom';
  }
}

document.getElementById('ratioLock').addEventListener('click', toggleLock);

document.getElementById('modalRatioLock').addEventListener('click', toggleLock);
