import { contextMenu, editorView, fileInput, folderInput, galleryContainer, galleryPanel, hideStatus, uploadView } from './dom.js';
import { S, activeSelection, clearItems, getItem, items } from './state.js';
import { promptDialog } from '../shared/dialogs.js';
import { pushUndo, showUndoToast } from './undo.js';
import { escapeHtml } from '../shared/html.js';
import { cropMethodLabels, dimsOf, presetLabels } from './dims.js';
import { THUMB_MAX_W, getThumbSource, renderImage } from './render.js';
import { openEditorModal } from './editor.js';
import { refreshResumeBar } from './home.js';

export let currentSortMode = 'folder';

export let selectionBox = null;

export let dragStartPos = null;

export let isCreatingBox = false; 

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

export function updateGallerySelectionUI() {
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

export function updateGallery() {
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
  
  S.displayOrder = itemsArray.map(it => it.index);
  updateGallerySelectionUI();
}

export function renderGalleryItem(id, container) {
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
      S.editingId = id;
      openEditorModal(file.name);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (activeSelection.has(id)) activeSelection.delete(id); else activeSelection.add(id);
      S.lastSelectedId = id;
      updateGallerySelectionUI();
    }
  });
  item.addEventListener('mousedown', e => e.stopPropagation()); 
  item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.shiftKey && S.lastSelectedId !== null && S.displayOrder.includes(S.lastSelectedId)) {
          const from = S.displayOrder.indexOf(S.lastSelectedId);
          const to = S.displayOrder.indexOf(id);
          if (!e.ctrlKey && !e.metaKey) activeSelection.clear();
          for (let i = Math.min(from, to); i <= Math.max(from, to); i++) activeSelection.add(S.displayOrder[i]);
      } else if (e.ctrlKey || e.metaKey) {
          if (activeSelection.has(id)) activeSelection.delete(id);
          else activeSelection.add(id);
          S.lastSelectedId = id;
      } else {
          activeSelection.clear();
          activeSelection.add(id);
          S.lastSelectedId = id;
      }
      updateGallerySelectionUI();
  });

  item.querySelector('.edit-overlay-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    S.editingId = id;
    openEditorModal(file.name);
  });

  item.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    S.editingId = id;
    openEditorModal(file.name);
  });
}

export function resetAll() {
  clearItems();
  activeSelection.clear();
  S.lastSelectedId = null;
  S.displayOrder = [];
  uploadView.classList.remove('hidden');
  editorView.classList.remove('active');
  refreshResumeBar();
  hideStatus();
  fileInput.value = '';
  folderInput.value = '';
}
