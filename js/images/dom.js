export const dropZone = document.getElementById('dropZone');

export const uploadView = document.getElementById('uploadView');

export const editorView = document.getElementById('editorView');

export const galleryContainer = document.getElementById('galleryContainer');

export const galleryPanel = document.getElementById('galleryPanel');

export const editorModal = document.getElementById('editorModal');

export const cropCanvas = document.getElementById('cropCanvas');

export const cropCtx = cropCanvas.getContext('2d');

export const contextMenu = document.getElementById('contextMenu');

export const fileInput = document.createElement('input');

fileInput.type = 'file';

fileInput.multiple = true;

fileInput.accept = 'image/*';

fileInput.style.display = 'none';

document.body.appendChild(fileInput);

export const folderInput = document.createElement('input');

folderInput.type = 'file';

folderInput.webkitdirectory = true;

folderInput.accept = 'image/*';

folderInput.style.display = 'none';

document.body.appendChild(folderInput);

// --- LOGIQUE MODALE EXPORT UNIFIÉE & WEBCODECS ---
export const unifiedExportModal = document.getElementById('unifiedExportModal');

export function showStatus(message, type) {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar visible ' + type;
  document.getElementById('statusText').textContent = message;
}

export function hideStatus() {
  document.getElementById('statusBar').classList.remove('visible', 'success', 'error');
}
