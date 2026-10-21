import { analyzeVideoFile } from './analysis.js';
import { hideVideoStatus, showVideoStatus } from './status.js';
import { V } from './state.js';
import { notify } from '../shared/dialogs.js';
import { selectVideo, updateVideoListUI } from './list.js';

export const videoInput = document.createElement('input');

videoInput.type = 'file';

videoInput.multiple = true;

videoInput.accept = 'video/*';

videoInput.style.display = 'none';

document.getElementById('selectVideoBtn').addEventListener('click', () => videoInput.click());

document.getElementById('addMoreVideoBtn').addEventListener('click', () => videoInput.click());

document.getElementById('videoDropZone').addEventListener('click', () => videoInput.click());

document.getElementById('videoDropZone').addEventListener('dragover', (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('dragover');
});

document.getElementById('videoDropZone').addEventListener('dragleave', (e) => {
  e.currentTarget.classList.remove('dragover');
});

document.getElementById('videoDropZone').addEventListener('drop', (e) => {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  handleVideoFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('video/') && !f.name.startsWith('.')));
});

videoInput.addEventListener('change', (e) => handleVideoFiles([...e.target.files].filter(f => !f.name.startsWith('.'))));

export function formatEta(seconds) {
  if (isNaN(seconds) || seconds === Infinity || seconds < 0) return "calcul...";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export async function handleVideoFiles(files) {
  if (!files.length) return;
  
  document.getElementById('videoUploadView').classList.add('hidden');
  document.getElementById('videoEditorView').style.display = 'flex';
  
  const progressWrap = document.getElementById('videoProgressWrap');
  const progressBar = document.getElementById('videoProgressBar');
  progressWrap.classList.add('visible');
  
  const startTime = Date.now();
  const totalFiles = files.length;

  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const ok = await analyzeVideoFile(files[i], (filePercent) => {
        const overallPercent = (i + filePercent) / totalFiles;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = overallPercent > 0 ? elapsed / overallPercent : 0;
        const remaining = speed - elapsed;
        
        progressBar.style.width = `${overallPercent * 100}%`;
        showVideoStatus(`Analyse ${i+1}/${totalFiles} (${Math.round(overallPercent * 100)}%) - Temps restant : ${formatEta(remaining)}`, "success");
    });
    if (!ok) failed.push(files[i].name);
  }

  progressWrap.classList.remove('visible');
  hideVideoStatus();
  if (V.analyzedVideos.length === 0) {
    document.getElementById('videoEditorView').style.display = 'none';
    document.getElementById('videoUploadView').classList.remove('hidden');
    if (failed.length) notify(`Impossible d'analyser : ${failed.join(', ')}`);
  } else if (failed.length) {
    showVideoStatus(`Impossible d'analyser : ${failed.join(', ')}`, "error");
    setTimeout(hideVideoStatus, 8000);
  }

  updateVideoListUI();
  if (V.activeVideoIndex === -1 && V.analyzedVideos.length > 0) {
    selectVideo(0);
  }
}
