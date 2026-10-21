(function() {
  const dropZone = document.getElementById('dropZone');
  const uploadView = document.getElementById('uploadView');
  const editorView = document.getElementById('editorView');
  const galleryContainer = document.getElementById('galleryContainer');
  const galleryPanel = document.getElementById('galleryPanel');
  const editorModal = document.getElementById('editorModal');
  const cropCanvas = document.getElementById('cropCanvas');
  const cropCtx = cropCanvas.getContext('2d');
  const contextMenu = document.getElementById('contextMenu');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.webkitdirectory = true;
  folderInput.accept = 'image/*';
  folderInput.style.display = 'none';
  document.body.appendChild(folderInput);

  // État unique des images : un objet par image, identifié par un id stable.
  // { id, file, folder, preset, crop, shadow, blur, bgColor, customized }
  let items = [];
  const itemsById = new Map();
  let nextItemId = 1;

  const defaultCrop = (preset) => ({ zoom: preset === 'blur' ? 0.85 : 1, offsetX: 0, offsetY: 0, rawOffsetX: 0, rawOffsetY: 0, method: 'center' });
  const defaultBlur = (preset) => preset === 'blur'
    ? { enabled: true, intensity: 20, bgZoom: 1.3 }
    : { enabled: false, intensity: 10, bgZoom: 1.3 };
  const defaultBgColor = (preset) => ({ enabled: preset === 'une', color: '#ffffff' });

  function getItem(id) { return itemsById.get(id); }

  function addItem(file, folder, preset) {
    const item = {
      id: nextItemId++,
      file,
      folder: folder || 'Divers',
      preset,
      crop: defaultCrop(preset),
      shadow: defaultShadow(),
      blur: defaultBlur(preset),
      bgColor: defaultBgColor(preset),
      customDims: preset === 'custom' ? { w: customW, h: customH } : null,
      customized: false
    };
    items.push(item);
    itemsById.set(item.id, item);
    return item;
  }

  function removeItems(ids) {
    items = items.filter(it => !ids.has(it.id));
    ids.forEach(id => itemsById.delete(id));
  }

  function clearItems() {
    items = [];
    itemsById.clear();
  }

  // --- ANNULER (Ctrl/Cmd+Z) : instantanés de l'état avant chaque action groupée ---
  const undoStack = [];
      let toastTimer = null;

  function snapshotItems() {
    return items.map(it => ({
      id: it.id, file: it.file, folder: it.folder, preset: it.preset, customized: it.customized,
      customDims: it.customDims ? { ...it.customDims } : null,
      crop: { ...it.crop }, shadow: { ...it.shadow }, blur: { ...it.blur }, bgColor: { ...it.bgColor }
    }));
  }

  function pushUndo(label) {
    undoStack.push({ label, snapshot: snapshotItems() });
    if (undoStack.length > APP.UNDO_LIMIT) undoStack.shift();
  }

  function showUndoToast(message) {
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

  function undo() {
    if (document.getElementById('progressWrap').classList.contains('visible')) return;
    const entry = undoStack.pop();
    if (!entry) return;
    items = entry.snapshot;
    itemsById.clear();
    items.forEach(it => itemsById.set(it.id, it));
    activeSelection.clear();
    lastSelectedId = null;
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

  // Sélection : ensemble d'ids (insensible aux suppressions / tris)
  let activeSelection = new Set();
  let lastSelectedId = null;
  let displayOrder = []; // ids dans l'ordre d'affichage (pour Maj+clic)

  let editingId = null;
  const editingItem = () => (editingId === null ? undefined : getItem(editingId));
  let currentImage = null;
  let zoomLevel = 1;
  
  let offsetX = 0;
  let offsetY = 0;
  let rawOffsetX = 0;
  let rawOffsetY = 0; 
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  
  let showShadow = false;
  let shadowOpacity = 0.3;
  let shadowDirection = 180;
  let shadowDistance = 4;
  
  let showBackgroundBlur = false;
  let backgroundBlurIntensity = 20;
  let backgroundBlurZoom = 1.3; // NOUVEAU
  
  let showBgColor = false;
  let bgColorValue = '#ffffff';
  
  let showGuides = true;
  let showSafeZones = false;
  let enableSnapping = true;
  let showBorderBox = true;
  let currentSortMode = 'folder';

  let customW = 1920;
  let customH = 1080;
  let customRatio = 1.777778;
  let isRatioLocked = true;

  const presetDimensions = {
    '1920x1080': { w: 1920, h: 1080 },
    '1080x1920': { w: 1080, h: 1920 },
    'blur': { w: 1920, h: 1080 },
    'une': { w: 750, h: 992 },
    'custom': { w: customW, h: customH }
  };

  // Dimensions d'une image : les images « Personnalisé » gardent chacune leurs propres dimensions
  function dimsOf(it) {
    if (it && it.preset === 'custom') return it.customDims || { w: customW, h: customH };
    return presetDimensions[it && it.preset] || presetDimensions['1920x1080'];
  }

  // Méthode ayant servi au recadrage automatique (affichée sous chaque vignette)
  const cropMethodLabels = { face: '👤 visage', object: '🎯 sujet' };

  const presetLabels = {
    '1920x1080': 'Horizontal',
    '1080x1920': 'Vertical',
    'blur': 'Flou complet',
    'une': 'Une de presse',
    'custom': 'Personnalisé'
  };

  let isFaceApiLoaded = false;
  let faceAIPromise = null;
  function loadFaceAI() {
    if (!faceAIPromise) {
      faceAIPromise = (async () => {
        try {
          const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
          await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
          isFaceApiLoaded = true;
        } catch (err) {
          console.warn("Détection de visages indisponible (modèle non chargé) :", err);
        }
      })();
    }
    return faceAIPromise;
  }
  // Chargé en tâche de fond une fois la page prête ; attendu (8 s max) avant le premier recadrage
  window.addEventListener('load', () => {
    (window.requestIdleCallback || setTimeout)(loadFaceAI);
  });

  async function runAutoCropLogic(img, preset, zoomLvl, dims) {
    dims = dims || presetDimensions[preset] || presetDimensions['1920x1080'];
    let subjectX = img.width / 2;
    let subjectY = img.height / 2;
    let method = 'center';

    if (!isFaceApiLoaded) {
      await Promise.race([loadFaceAI(), new Promise(res => setTimeout(res, APP.FACE_AI_WAIT_MS))]);
    }
    if (isFaceApiLoaded) {
      try {
        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions());
        if (detection) {
          subjectX = detection.box.x + (detection.box.width / 2);
          subjectY = detection.box.y + (detection.box.height / 2);
          method = 'face';
        }
      } catch (e) { console.warn('Détection de visage échouée :', e); }
    }

    if (method === 'center' && window.SmartCrop) {
      try {
        const result = await SmartCrop.crop(img, { width: dims.w, height: dims.h });
        if (result && result.topCrop) {
          subjectX = result.topCrop.x + (result.topCrop.width / 2);
          subjectY = result.topCrop.y + (result.topCrop.height / 2);
          method = 'object';
        }
      } catch (e) { console.warn('Détection de sujet échouée :', e); }
    }

    const isBlurPreset = (preset === 'blur');
    const { drawWidth, drawHeight } = computeDrawSize(dims, { zoom: zoomLvl }, isBlurPreset, img);
    const scale = drawWidth / img.width;

    let targetOffsetX = ((img.width / 2) - subjectX) * scale;
    let targetOffsetY = ((img.height / 2) - subjectY) * scale;

    const maxOffsetX = Math.max(0, (drawWidth - dims.w) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - dims.h) / 2);

    return {
      offsetX: Math.max(-maxOffsetX, Math.min(maxOffsetX, targetOffsetX)),
      offsetY: Math.max(-maxOffsetY, Math.min(maxOffsetY, targetOffsetY)),
      rawOffsetX: targetOffsetX,
      rawOffsetY: targetOffsetY,
      method: method
    };
  }

  let selectionBox = null;
  let dragStartPos = null;
  let isCreatingBox = false; 

  galleryPanel.addEventListener('mousedown', (e) => {
    contextMenu.style.display = 'none';
    if (e.button !== 0) return; 
    if (e.target.closest('.gallery-item') || e.target.closest('button') || e.target.closest('select') || e.target.closest('.gallery-section-title')) return;

    const rect = galleryPanel.getBoundingClientRect();
    const startX = e.clientX - rect.left + galleryPanel.scrollLeft;
    const startY = e.clientY - rect.top + galleryPanel.scrollTop;
    
    dragStartPos = { x: startX, y: startY, clientX: e.clientX, clientY: e.clientY };
    isCreatingBox = true;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isCreatingBox) return;
    
    const dx = e.clientX - dragStartPos.clientX;
    const dy = e.clientY - dragStartPos.clientY;
    
    if (!selectionBox) {
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { 
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                activeSelection.clear();
            }
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            galleryPanel.appendChild(selectionBox);
        } else {
            return;
        }
    }
    
    const rect = galleryPanel.getBoundingClientRect();
    const currentX = e.clientX - rect.left + galleryPanel.scrollLeft;
    const currentY = e.clientY - rect.top + galleryPanel.scrollTop;

    const left = Math.min(currentX, dragStartPos.x);
    const top = Math.min(currentY, dragStartPos.y);
    const width = Math.abs(currentX - dragStartPos.x);
    const height = Math.abs(currentY - dragStartPos.y);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';

    const boxRect = selectionBox.getBoundingClientRect();
    document.querySelectorAll('.gallery-item').forEach((item) => {
        const id = parseInt(item.dataset.id);
        const itemRect = item.getBoundingClientRect();
        const intersect = !(itemRect.right < boxRect.left || 
                            itemRect.left > boxRect.right || 
                            itemRect.bottom < boxRect.top || 
                            itemRect.top > boxRect.bottom);
        
        if (intersect) activeSelection.add(id);
        else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) activeSelection.delete(id);
    });
    updateGallerySelectionUI();
  });

  window.addEventListener('mouseup', (e) => {
    if (isCreatingBox && !selectionBox) {
        if (e.target === galleryPanel) {
            activeSelection.clear();
            updateGallerySelectionUI();
        }
    }
    isCreatingBox = false;
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
  });

  galleryContainer.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    e.preventDefault();
    
    const idx = parseInt(item.dataset.id);
    if (!activeSelection.has(idx)) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) activeSelection.clear();
      activeSelection.add(idx);
      updateGallerySelectionUI();
    }

    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
  });

  window.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  document.getElementById('ctxGroupBtn').addEventListener('click', async () => {
    if (activeSelection.size === 0) return;
    const groupName = await promptDialog('Déplacer vers un groupe', 'Nom du groupe / dossier de destination', 'Série Personnalisée');
    if (!groupName) return;

    pushUndo('Changement de groupe');
    activeSelection.forEach(idx => {
      const it = getItem(idx);
      if (it) it.folder = groupName.trim();
    });
    activeSelection.clear();
    updateGallery();
    showUndoToast(`Déplacé vers « ${groupName.trim()} »`);
  });

  function updateGallerySelectionUI() {
    const items = document.querySelectorAll('.gallery-item');
    items.forEach((item) => {
        const idx = parseInt(item.dataset.id);
        const selected = activeSelection.has(idx);
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    
    const count = activeSelection.size;
    document.getElementById('clearBtn').textContent = count > 0 ? `Effacer sélection (${count})` : `Tout effacer`;
  }

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSortMode = e.target.value;
    updateGallery();
  });

  function initScrubbableInputs() {
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

  let galleryRefreshQueued = false;
  function queueGalleryRefresh() {
    if (galleryRefreshQueued) return;
    galleryRefreshQueued = true;
    requestAnimationFrame(() => { galleryRefreshQueued = false; updateGallery(); });
  }

  // apply=false : met seulement à jour les champs (ex. ouverture de l'éditeur sur une image « Personnalisé »)
  function syncCustomDims(w, h, r, selectValue = null, apply = true) {
    customW = w; customH = h; customRatio = r;
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

  function handleWChange(input) {
    let w = parseInt(input.value) || 1;
    let h = customH;
    let r = customRatio;
    if (isRatioLocked) h = Math.max(1, Math.round(w / r));
    else r = w / h;
    syncCustomDims(w, h, r);
  }
  
  function handleHChange(input) {
    let h = parseInt(input.value) || 1;
    let w = customW;
    let r = customRatio;
    if (isRatioLocked) w = Math.max(1, Math.round(h * r));
    else r = w / h;
    syncCustomDims(w, h, r);
  }

  function handleRatioSelect(e) {
    const val = e.target.value;
    if (val === 'custom') {
        if (isRatioLocked) toggleLock(); 
        return;
    }
    if (!isRatioLocked) toggleLock(); 
    customRatio = parseFloat(val);
    let w = customW;
    let h = Math.max(1, Math.round(w / customRatio));
    syncCustomDims(w, h, customRatio, val);
  }

  document.getElementById('customRatio').addEventListener('change', handleRatioSelect);
  document.getElementById('modalCustomRatio').addEventListener('change', handleRatioSelect);

  function toggleLock() {
    isRatioLocked = !isRatioLocked;
    const icon = isRatioLocked ? '🔒' : '🔓';
    document.getElementById('ratioLock').textContent = icon;
    document.getElementById('modalRatioLock').textContent = icon;
    if (isRatioLocked) {
        customRatio = customW / customH;
        syncCustomDims(customW, customH, customRatio);
    } else {
        document.getElementById('customRatio').value = 'custom';
        document.getElementById('modalCustomRatio').value = 'custom';
    }
  }

  document.getElementById('ratioLock').addEventListener('click', toggleLock);
  document.getElementById('modalRatioLock').addEventListener('click', toggleLock);

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

  document.getElementById('modalClose').addEventListener('click', () => closeModal(false));
  document.getElementById('modalCancelBtn').addEventListener('click', () => closeModal(false));
  document.getElementById('modalApplyBtn').addEventListener('click', () => closeModal(true));
  document.getElementById('newUploadBtn').addEventListener('click', () => fileInput.click());
  
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (items.length === 0) return;
    if (activeSelection.size > 0 && activeSelection.size < items.length) {
        const n = activeSelection.size;
        pushUndo(`${n} image(s) supprimée(s)`);
        removeItems(activeSelection);
        activeSelection.clear();
        lastSelectedId = null;
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

  // --- LOGIQUE MODALE EXPORT UNIFIÉE & WEBCODECS ---
  const unifiedExportModal = document.getElementById('unifiedExportModal');
  const enableImageToggle = document.getElementById('enableImageToggle');
  const imageExportOptions = document.getElementById('imageExportOptions');
  const enableVideoToggle = document.getElementById('enableVideoToggle');
  const videoExportOptions = document.getElementById('videoExportOptions');
  
  // UI Ken Burns Toggle
  const kenBurnsToggle = document.getElementById('kenBurnsToggle');
  const kenBurnsGroup = document.getElementById('kenBurnsGroup');
  
  let isImageExportEnabled = true;
  let isVideoExportEnabled = false;
  let isKenBurnsEnabled = false;

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
    isKenBurnsEnabled = !isKenBurnsEnabled;
    kenBurnsToggle.classList.toggle('on', isKenBurnsEnabled);
    kenBurnsGroup.classList.toggle('visible', isKenBurnsEnabled);
  });

  // Qualité JPEG / WebP (sans effet sur le PNG)
  const exportQualitySlider = document.getElementById('unifiedExportQuality');
  const exportFormatSelect = document.getElementById('unifiedExportFormat');
  function syncExportQualityUI() {
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
          const kenBurnsPercent = isKenBurnsEnabled ? parseFloat(document.getElementById('unifiedKenBurns').value) : 0;

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

  // --- ENCODEUR MATÉRIEL (WEBCODECS) POUR LES IMAGES ---
  async function generateVideoWebCodecs(targetFolders, durationInSeconds, transitionType, kenBurnsPercent) {
    const state = { encoder: null };
    const progressBar = document.getElementById('progressBar');
    const originalProgressBg = progressBar.style.background;
    try {
      await generateVideoWebCodecsInner(targetFolders, durationInSeconds, transitionType, kenBurnsPercent, state);
    } catch (e) {
      console.error("Export diaporama échoué :", e);
      showStatus(`Échec de l'export vidéo : ${e && e.message ? e.message : 'erreur inconnue'}`, 'error');
      document.getElementById('progressWrap').classList.remove('visible');
      progressBar.style.background = originalProgressBg;
    } finally {
      if (state.encoder && state.encoder.state !== 'closed') { try { state.encoder.close(); } catch (e) {} }
    }
  }

  async function generateVideoWebCodecsInner(targetFolders, durationInSeconds, transitionType, kenBurnsPercent, state) {
    document.getElementById('progressWrap').classList.add('visible');
    const progressBar = document.getElementById('progressBar');
    const originalProgressBg = progressBar.style.background;
    progressBar.style.background = 'var(--success)';
    
    showStatus("Préparation de l'encodeur matériel...", "success");

    const zip = new JSZip();
    const fps = 25;
    const framesPerSlide = Math.round(durationInSeconds * fps);
    const transitionFrames = transitionType === 'fade' ? Math.round(1 * fps) : 0; 
    const kenBurnsIntensity = kenBurnsPercent / 100;

    let groups = {};
    items.forEach((it) => {
      if (targetFolders.includes(it.folder)) {
        if (!groups[it.folder]) groups[it.folder] = [];
        groups[it.folder].push(it.id);
      }
    });

    // Tri alphabétique (naturel) des fichiers pour chaque dossier
    for (let folderName in groups) {
      groups[folderName].sort((a, b) => {
        return getItem(a).file.name.localeCompare(getItem(b).file.name, undefined, {numeric: true});
      });
    }

    let totalFramesToProcess = 0;
    for (let folderName in groups) {
      totalFramesToProcess += groups[folderName].length * framesPerSlide;
    }
    let totalProcessedFrames = 0;

    for (let folderName in groups) {
      const indices = groups[folderName];
      if (indices.length === 0) continue;

      let groupImages = [];
      for (let idx of indices) {
        const file = getItem(idx).file;
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => { URL.revokeObjectURL(im.src); resolve(im); };
          im.onerror = () => { URL.revokeObjectURL(im.src); reject(new Error(`Image illisible : ${file.name}`)); };
          im.src = URL.createObjectURL(file);
        });
        groupImages.push({ img, index: idx });
      }

      // Une vidéo = une seule taille : on retient la plus fréquente du dossier,
      // les autres images sont ajustées (contain) dans le cadre.
      const sizeCounts = new Map();
      indices.forEach(id => {
        const d = dimsOf(getItem(id));
        const key = d.w + 'x' + d.h;
        sizeCounts.set(key, { d, n: (sizeCounts.get(key)?.n || 0) + 1 });
      });
      let dims = [...sizeCounts.values()].sort((a, b) => b.n - a.n)[0].d;

      const videoConfig = await getSupportedVideoEncoderConfig(dims.w, dims.h, fps, computeVideoBitrate(dims.w, dims.h, fps, document.getElementById('unifiedVideoQuality').value));
      // H.264 exige des dimensions paires : le canvas suit la config validée
      const outW = videoConfig.width, outH = videoConfig.height;
      dims = { w: outW, h: outH };

      const canvas = document.createElement('canvas');
      canvas.width = dims.w;
      canvas.height = dims.h;
      const ctx = canvas.getContext('2d');

      // Dessine une slide dans le cadre de la vidéo, quelle que soit sa propre taille
      const slideBuffers = new Map();
      function drawSlide(targetCtx, slide, kb) {
        const it = getItem(slide.index);
        const own = dimsOf(it);
        const isBlur = it.preset === 'blur';
        if (Math.abs(own.w - dims.w) <= 1 && Math.abs(own.h - dims.h) <= 1) {
          renderImage(targetCtx, slide.img, dims, it.crop, it.shadow, it.blur, it.bgColor, isBlur, false, kb);
          return;
        }
        const key = own.w + 'x' + own.h;
        let buf = slideBuffers.get(key);
        if (!buf) {
          buf = document.createElement('canvas');
          buf.width = own.w; buf.height = own.h;
          slideBuffers.set(key, buf);
        }
        renderImage(buf.getContext('2d'), slide.img, own, it.crop, it.shadow, it.blur, it.bgColor, isBlur, false, kb);
        const k = Math.min(dims.w / own.w, dims.h / own.h);
        const w = own.w * k, h = own.h * k;
        targetCtx.save();
        targetCtx.fillStyle = '#0a0a0f';
        targetCtx.fillRect(0, 0, dims.w, dims.h);
        targetCtx.drawImage(buf, (dims.w - w) / 2, (dims.h - h) / 2, w, h);
        targetCtx.restore();
      }

      // PRÉ-CALCUL DU COMPORTEMENT KEN BURNS POUR CHAQUE SLIDE DE CE DOSSIER
      let kbParamsArray = [];
      for(let i = 0; i < groupImages.length; i++) {
          const kbDirectionSetting = document.getElementById('unifiedKenBurnsDirection').value;
          const crop = getItem(groupImages[i].index).crop || { offsetX: 0, offsetY: 0, rawOffsetX: 0, rawOffsetY: 0, method: 'center' };
          
          // Le Residual = différence entre le "cadrage parfait" et le "cadrage bloqué par les bords"
          let resX = (crop.rawOffsetX !== undefined) ? (crop.rawOffsetX - crop.offsetX) : 0;
          let resY = (crop.rawOffsetY !== undefined) ? (crop.rawOffsetY - crop.offsetY) : 0;

          // Dérive artificielle si l'image est déjà PARFAITEMENT centrée
          if (Math.abs(resX) < 1) resX = (Math.random() - 0.5) * (dims.w * 0.05);
          if (Math.abs(resY) < 1) resY = (Math.random() - 0.5) * (dims.h * 0.05);

          let mode = kbDirectionSetting;
          
          // LOGIQUE D'INTELLIGENCE
          if (mode === 'smart') {
              if (crop.method === 'face') {
                  mode = 'in';
              } else if (crop.method === 'object') {
                  mode = Math.random() > 0.2 ? 'out' : 'in'; 
              } else {
                  mode = Math.random() > 0.5 ? 'in' : 'out';
              }
          }

          kbParamsArray.push({ mode, residualX: resX, residualY: resY });
      }

      function getKbState(slideIdx, absoluteFrame) {
          if (!isKenBurnsEnabled) return null;
          const params = kbParamsArray[slideIdx];
          const progress = absoluteFrame / framesPerSlide; // 0.0 -> 1.0

          let scale = 1; 
          if (params.mode === 'in') {
              scale = 1 + (kenBurnsIntensity * progress);
          } else { // out
              scale = (1 + kenBurnsIntensity) - (kenBurnsIntensity * progress);
          }

          const maxSafeMarginX = kenBurnsIntensity * (dims.w / 2);
          const maxSafeMarginY = kenBurnsIntensity * (dims.h / 2);

          let finalPanX = Math.max(-maxSafeMarginX, Math.min(maxSafeMarginX, params.residualX));
          let finalPanY = Math.max(-maxSafeMarginY, Math.min(maxSafeMarginY, params.residualY));

          let panX = 0; let panY = 0;

          if (params.mode === 'in') {
              panX = finalPanX * progress;
              panY = finalPanY * progress;
          } else { // out
              panX = finalPanX * (1 - progress);
              panY = finalPanY * (1 - progress);
          }

          return { scale, panX, panY };
      }

      // Configuration du Muxer (Mp4Box)
      let muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width: dims.w, height: dims.h },
        fastStart: 'in-memory' 
      });

      let encoderError = null;
      let videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => { encoderError = e; console.error("Erreur de l'encodeur:", e); }
      });
      state.encoder = videoEncoder;
      videoEncoder.configure(videoConfig);

      let frameCounter = 0;
      
      for (let currentSlide = 0; currentSlide < groupImages.length; currentSlide++) {
        const item = groupImages[currentSlide];

        for (let f = 0; f < framesPerSlide; f++) {
          if (encoderError) throw encoderError;

          // LA FRAME ABSOLUE : Permet de ne pas repartir de 0 si la slide a déjà commencé pendant la transition
          const currentAbsoluteFrame = (currentSlide > 0) ? (f + transitionFrames) : f;
          const currentKb = getKbState(currentSlide, currentAbsoluteFrame);

          drawSlide(ctx, item, currentKb);

          if (transitionType === 'fade' && transitionFrames > 0 && currentSlide < groupImages.length - 1) {
            const framesRemainingInSlide = framesPerSlide - f;
            if (framesRemainingInSlide <= transitionFrames) {
              const nextItem = groupImages[currentSlide + 1];

              const alpha = 1 - (framesRemainingInSlide / transitionFrames);
              
              // La slide suivante commence son mouvement dès la transition
              const frameWithinFade = transitionFrames - framesRemainingInSlide;
              const nextKb = getKbState(currentSlide + 1, frameWithinFade);

              ctx.save();
              ctx.globalAlpha = alpha;
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = dims.w;
              tempCanvas.height = dims.h;
              const tempCtx = tempCanvas.getContext('2d');
              drawSlide(tempCtx, nextItem, nextKb);
              ctx.drawImage(tempCanvas, 0, 0);
              ctx.restore();
            }
          }

          const timestamp = (frameCounter / fps) * 1_000_000;
          const duration = (1 / fps) * 1_000_000;
          const videoFrame = new VideoFrame(canvas, { timestamp, duration });
          
          const isKeyFrame = (frameCounter % fps === 0);
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
          
          videoFrame.close();

          // Évite d'accumuler trop de frames en attente dans l'encodeur
          while (videoEncoder.encodeQueueSize > APP.ENCODER_QUEUE_MAX && !encoderError) {
            await new Promise(r => setTimeout(r, 5));
          }

          frameCounter++;
          totalProcessedFrames++;
          
          if (totalProcessedFrames % 5 === 0) { 
              const percent = Math.min(100, Math.round((totalProcessedFrames / totalFramesToProcess) * 100));
              progressBar.style.width = percent + '%';
              document.getElementById('statusText').textContent = `Encodage matériel (H.264 / ${Math.round(videoConfig.bitrate / 1e6)} Mbps) : ${percent}%`;
              await new Promise(r => setTimeout(r, 0));
          }
        }
      }

      await videoEncoder.flush();
      if (encoderError) throw encoderError;
      muxer.finalize();
      videoEncoder.close();
      state.encoder = null;

      const buffer = muxer.target.buffer;
      zip.file(`${folderName}_diaporama.mp4`, buffer);
    }

    showStatus("Compression du fichier ZIP vidéo...", "success");
    try {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diaporamas_video_H264.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      showStatus("Séquences MP4 exportées !", 'success');
    } catch (e) {
      showStatus('Erreur lors de la création du ZIP vidéo.', 'error');
      console.error(e);
    }

    setTimeout(() => {
      document.getElementById('progressWrap').classList.remove('visible');
      progressBar.style.background = originalProgressBg;
    }, 3000);
  }

  editorModal.addEventListener('click', (e) => {
    if (e.target === editorModal) closeModal(false);
  });

  unifiedExportModal.addEventListener('click', (e) => {
    if (e.target === unifiedExportModal) unifiedExportModal.classList.remove('open');
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
      item.customDims = item.customDims || { w: customW, h: customH };
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

  const shadowToggle = document.getElementById('shadowToggle');
  const shadowGroup = document.getElementById('shadowGroup');

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

  const blurToggle = document.getElementById('blurToggle');
  const blurIntensityGroup = document.getElementById('blurIntensityGroup');

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

  async function applyCurrentSettingsToTargets(targets) {
    pushUndo('Réglages appliqués');
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
    const targets = activeSelection.size > 0 ? Array.from(activeSelection) : [editingId];
    await applyCurrentSettingsToTargets(targets);
    closeModal(false);
  });

  function saveEditorState() {
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
  
  async function applyAllAutoCrop(preset) {
    if (items.length === 0) return;
    const targets = activeSelection.size > 0 ? Array.from(activeSelection) : items.map(it => it.id);

    pushUndo('Changement de format');
    document.getElementById('progressWrap').classList.add('visible');
    showStatus("Recadrage automatique en cours...", "success");

    for (let i = 0; i < targets.length; i++) {
      const idx = targets[i];
      const it = getItem(idx);
      if (!it) continue;
      it.preset = preset;
      it.customDims = preset === 'custom' ? { w: customW, h: customH } : null;
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

  async function loadImages(files) {
    const images = files.filter(f => f.type.startsWith('image/') && !f.name.startsWith('.'));
    if (!images.length) return;

    uploadView.classList.add('hidden');
    editorView.classList.add('active');
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

  function applyAutoCrop(id, file) {
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

  function updateGallery() {
    galleryContainer.innerHTML = '';
    document.getElementById('fileCountNum').textContent = items.length;

    let itemsArray = items.map(it => ({ file: it.file, index: it.id, folder: it.folder, preset: it.preset }));

    if (currentSortMode === 'name-asc') {
      itemsArray.sort((a, b) => a.file.name.localeCompare(b.file.name));
    } else if (currentSortMode === 'name-desc') {
      itemsArray.sort((a, b) => b.file.name.localeCompare(a.file.name));
    } else if (currentSortMode === 'folder') {
      itemsArray.sort((a, b) => a.folder.localeCompare(b.folder) || a.file.name.localeCompare(b.file.name));
    }

    if (currentSortMode === 'folder') {
      let grouped = {};
      itemsArray.forEach(item => {
        if (!grouped[item.folder]) grouped[item.folder] = [];
        grouped[item.folder].push(item);
      });

      for (let folderName in grouped) {
        const section = document.createElement('div');
        section.className = 'gallery-section';
        section.innerHTML = `
          <div class="gallery-section-title" title="Cliquer pour sélectionner toutes les photos du dossier">
            📁 ${escapeHtml(folderName)} <span style="font-weight: normal; color: var(--text-dim);">(${grouped[folderName].length})</span>
          </div>
          <div class="gallery"></div>
        `;
        
        section.querySelector('.gallery-section-title').addEventListener('click', (e) => {
          const folderIndices = grouped[folderName].map(item => item.index);
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            folderIndices.forEach(idx => activeSelection.add(idx));
          } else {
            activeSelection.clear();
            folderIndices.forEach(idx => activeSelection.add(idx));
          }
          updateGallerySelectionUI();
        });

        galleryContainer.appendChild(section);
        const galleryGrid = section.querySelector('.gallery');
        grouped[folderName].forEach(item => renderGalleryItem(item.index, galleryGrid));
      }
    } else {
      const section = document.createElement('div');
      section.className = 'gallery-section';
      section.innerHTML = `<div class="gallery" id="flatGallery"></div>`;
      galleryContainer.appendChild(section);
      const galleryGrid = section.querySelector('.gallery');
      itemsArray.forEach(item => renderGalleryItem(item.index, galleryGrid));
    }
    
    displayOrder = itemsArray.map(it => it.index);
    updateGallerySelectionUI();
  }

  const THUMB_MAX_W = 360;
  const THUMB_SOURCE_MAX = 720;

  // Version réduite de l'image, décodée une seule fois puis réutilisée à chaque rafraîchissement de la galerie
  function getThumbSource(it) {
    if (!it.thumb) {
      it.thumb = (async () => {
        try {
          const bmp = await createImageBitmap(it.file);
          const k = Math.min(1, THUMB_SOURCE_MAX / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(bmp.width * k));
          c.height = Math.max(1, Math.round(bmp.height * k));
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          bmp.close();
          return c;
        } catch (e) {
          console.warn('Miniature indisponible :', it.file.name, e);
          return null;
        }
      })();
    }
    return it.thumb;
  }

  function renderGalleryItem(id, container) {
    const it = getItem(id);
    const file = it.file;
    const preset = it.preset || '1920x1080';
    const dims = dimsOf(it);
    // Miniature : canvas réduit (≤ 360 px de large) au lieu de la pleine résolution
    const thumbScale = Math.min(1, THUMB_MAX_W / dims.w);
    const thumbW = Math.max(1, Math.round(dims.w * thumbScale));
    const thumbH = Math.max(1, Math.round(dims.h * thumbScale));
    
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.id = id;
    if (activeSelection.has(id)) item.classList.add('selected');

    item.innerHTML = `
      <div class="gallery-item-preview"><canvas width="${thumbW}" height="${thumbH}"></canvas></div>
      <div class="gallery-item-label">
        <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="preset-tag">${presetLabels[preset] || preset}${cropMethodLabels[it.crop.method] ? ' · ' + cropMethodLabels[it.crop.method] : ''}</div>
      </div>
      <button class="edit-overlay-btn" title="Éditer l'image" aria-label="Éditer l'image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>
    `;
    
    container.appendChild(item);

    getThumbSource(it).then(src => {
      if (!src || !item.isConnected) return;
      const { crop, shadow, blur, bgColor } = it;
      const isBlurPreset = (preset === 'blur');
      const canvas = item.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.scale(thumbScale, thumbScale);
        renderImage(ctx, src, dims, crop, shadow, blur, bgColor, isBlurPreset, true);
      }
    });

    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${file.name} — ${presetLabels[preset] || preset}`);
    item.setAttribute('aria-pressed', activeSelection.has(id) ? 'true' : 'false');
    item.addEventListener('keydown', (e) => {
      if (e.target !== item) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        editingId = id;
        openEditorModal(file.name);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (activeSelection.has(id)) activeSelection.delete(id); else activeSelection.add(id);
        lastSelectedId = id;
        updateGallerySelectionUI();
      }
    });
    item.addEventListener('mousedown', e => e.stopPropagation()); 
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.shiftKey && lastSelectedId !== null && displayOrder.includes(lastSelectedId)) {
            const from = displayOrder.indexOf(lastSelectedId);
            const to = displayOrder.indexOf(id);
            if (!e.ctrlKey && !e.metaKey) activeSelection.clear();
            for (let i = Math.min(from, to); i <= Math.max(from, to); i++) activeSelection.add(displayOrder[i]);
        } else if (e.ctrlKey || e.metaKey) {
            if (activeSelection.has(id)) activeSelection.delete(id);
            else activeSelection.add(id);
            lastSelectedId = id;
        } else {
            activeSelection.clear();
            activeSelection.add(id);
            lastSelectedId = id;
        }
        updateGallerySelectionUI();
    });

    item.querySelector('.edit-overlay-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editingId = id;
      openEditorModal(file.name);
    });

    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editingId = id;
      openEditorModal(file.name);
    });
  }

  function computeDrawSize(dims, crop, isBlurPreset, img) {
    const imgAspect = img.width / img.height;
    const canvasAspect = dims.w / dims.h;
    const zoom = crop.zoom ?? 1;

    if (isBlurPreset) {
      const drawHeight = dims.h * zoom;
      return { drawWidth: drawHeight * imgAspect, drawHeight };
    }

    if (imgAspect > canvasAspect) {
      const drawHeight = dims.h * zoom;
      return { drawWidth: drawHeight * imgAspect, drawHeight };
    }

    const drawWidth = dims.w * zoom;
    return { drawWidth, drawHeight: drawWidth / imgAspect };
  }

  function drawCheckerboardPattern(ctx, w, h) {
    const size = 16;
    ctx.save();
    for (let x = 0; x < w; x += size) {
      for (let y = 0; y < h; y += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#181822' : '#222233';
        ctx.fillRect(x, y, size, size);
      }
    }
    ctx.restore();
  }

  function renderImage(ctx, img, dims, crop, shadow, blur, bgColor, isBlurPreset, drawCheckerboard = false, kenBurns = null) {
    ctx.save();

    if (kenBurns && (kenBurns.scale !== 1 || kenBurns.panX !== 0 || kenBurns.panY !== 0)) {
      ctx.translate(dims.w / 2 + kenBurns.panX, dims.h / 2 + kenBurns.panY);
      ctx.scale(kenBurns.scale, kenBurns.scale);
      ctx.translate(-dims.w / 2, -dims.h / 2);
    }

    if (bgColor && bgColor.enabled) {
      ctx.fillStyle = bgColor.color;
      ctx.fillRect(-dims.w, -dims.h, dims.w * 3, dims.h * 3);
    } else if (drawCheckerboard) {
      drawCheckerboardPattern(ctx, dims.w, dims.h);
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(-dims.w, -dims.h, dims.w * 3, dims.h * 3);
    }

    if (blur && blur.enabled) {
      drawBlurredBg(ctx, img, dims.w, dims.h, blur.intensity || 20, blur.bgZoom || 1.3);
    }

    const { drawWidth, drawHeight } = computeDrawSize(dims, crop, isBlurPreset, img);
    const x = dims.w / 2 + crop.offsetX - drawWidth / 2;
    const y = dims.h / 2 + crop.offsetY - drawHeight / 2;

    if (shadow && shadow.enabled && shadow.opacity > 0) {
      const rad = (shadow.direction * Math.PI) / 180;
      ctx.shadowColor = `rgba(0, 0, 0, ${shadow.opacity})`;
      ctx.shadowBlur = (blur && blur.enabled) ? 40 : 20;
      ctx.shadowOffsetX = Math.cos(rad) * shadow.distance;
      ctx.shadowOffsetY = Math.sin(rad) * shadow.distance;
    }
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
    
    ctx.restore();
  }

  function openEditorModal(filename) {
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

  function closeModal(save = false) {
    if (save && editingItem()) { pushUndo('Modification d\'image'); saveEditorState(); }
    editorModal.classList.remove('open');
    editingId = null;
    currentImage = null;
  }

  function resetAll() {
    clearItems();
    activeSelection.clear();
    lastSelectedId = null;
    displayOrder = [];
    uploadView.classList.remove('hidden');
    editorView.classList.remove('active');
    hideStatus();
    fileInput.value = '';
    folderInput.value = '';
  }

  // Regroupe les demandes de redessin (curseurs, glisser) : au plus un rendu par image affichée
  let previewDrawQueued = false;
  function drawCanvasPreview() {
    if (previewDrawQueued) return;
    previewDrawQueued = true;
    requestAnimationFrame(() => { previewDrawQueued = false; drawCanvasPreviewNow(); });
  }

  function drawCanvasPreviewNow() {
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

  function drawBlurredBg(ctx, img, canvasW, canvasH, intensity, bgZoom = 1.3) {
    ctx.save();
    ctx.filter = `blur(${intensity}px) brightness(0.6)`;
    const imgRatio = img.width / img.height;
    const canvasRatio = canvasW / canvasH;
    let drawW, drawH;
    if (imgRatio < canvasRatio) { drawW = canvasW; drawH = canvasW / imgRatio; } 
    else { drawH = canvasH; drawW = canvasH * imgRatio; }
    ctx.translate(canvasW/2, canvasH/2);
    ctx.scale(bgZoom, bgZoom); 
    ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
    ctx.restore();
  }

  function formatBytes(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
  }

  async function processImagesCustom(format, structure, targetFolders, { quality = 0.95, suffix = '' } = {}) {
    document.getElementById('progressWrap').classList.add('visible');
    showStatus("Génération du fichier ZIP...", "success");

    const zip = new JSZip();
    const usedPaths = new Set();
    const failed = [];
    let countExported = 0;
    const todo = items.filter(it => targetFolders.includes(it.folder));

    for (let i = 0; i < todo.length; i++) {
      const it = todo[i];
      try {
        const preset = it.preset || '1920x1080';
        const dims = dimsOf(it);
        const isBlurPreset = (preset === 'blur');

        const blob = await resizeImage(it.file, dims, it.crop, it.shadow, it.blur, format, it.bgColor, isBlurPreset, false, quality);

        const cleanName = it.file.name.replace(/\.[^.]+$/, '') + suffix;
        const dir = structure === 'folders' ? `${it.folder}/` : '';

        // Deux fichiers de même nom (dossiers regroupés) ne doivent pas s'écraser
        let pathInZip = `${dir}${cleanName}.${format}`;
        for (let n = 2; usedPaths.has(pathInZip.toLowerCase()); n++) pathInZip = `${dir}${cleanName} (${n}).${format}`;
        usedPaths.add(pathInZip.toLowerCase());

        zip.file(pathInZip, blob, { binary: true });
        countExported++;
      } catch (e) {
        console.error('Export image échoué :', it.file.name, e);
        failed.push(it.file.name);
      }
      document.getElementById('progressBar').style.width = ((i + 1) / todo.length * 100) + '%';
    }

    if (countExported === 0) {
      document.getElementById('progressWrap').classList.remove('visible');
      showStatus(failed.length ? `Erreur lors du traitement des images (${failed.join(', ')}).` : 'Aucune image à exporter.', 'error');
      return;
    }

    try {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'images_redimensionnees.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      document.getElementById('progressWrap').classList.remove('visible');
      showStatus(failed.length
        ? `${countExported} image(s) exportée(s) (${formatBytes(blob.size)}) — échec : ${failed.join(', ')}`
        : `${countExported} image(s) exportée(s) avec succès ! (${formatBytes(blob.size)})`, failed.length ? 'error' : 'success');
    } catch (e) {
      console.error(e);
      document.getElementById('progressWrap').classList.remove('visible');
      showStatus('Erreur lors de la création du ZIP.', 'error');
    }
  }

  function resizeImage(file, dims, crop, shadow, blur, format, bgColor, isBlurPreset, drawCheckerboard, quality = 0.95) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = dims.w;
        canvas.height = dims.h;
        renderImage(canvas.getContext('2d'), img, dims, crop, shadow, blur, bgColor, isBlurPreset, drawCheckerboard, null);
        canvas.toBlob(blob => {
           URL.revokeObjectURL(img.src);
           if (blob) resolve(blob);
           else reject(new Error('Encodage impossible (image trop grande ?)'));
        }, format === 'jpg' ? 'image/jpeg' : 'image/' + format, format === 'png' ? undefined : quality);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Image illisible')); };
      img.src = URL.createObjectURL(file);
    });
  }

  // --- RACCOURCIS CLAVIER (éditeur et galerie) ---
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    const isRange = tag === 'INPUT' && t.type === 'range';
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || (tag === 'INPUT' && !isRange && t.type !== 'checkbox');

    if (editorModal.classList.contains('open')) {
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
      return;
    }

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

  function showStatus(message, type) {
    const bar = document.getElementById('statusBar');
    bar.className = 'status-bar visible ' + type;
    document.getElementById('statusText').textContent = message;
  }

  function hideStatus() {
    document.getElementById('statusBar').classList.remove('visible', 'success', 'error');
  }
})();
