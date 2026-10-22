// Bouton « Accueil » : retour à la page d'import sans perdre les vidéos analysées
import { V } from './state.js';
import { mainPlayer } from './dom.js';

export function refreshVideoResumeBar() {
  const n = V.analyzedVideos.length;
  document.getElementById('videoResumeBar').hidden = n === 0;
  document.getElementById('videoResumeLabel').textContent = `Reprendre le projet · ${n} vidéo(s)`;
}

function showVideoHome() {
  mainPlayer.pause();
  document.getElementById('videoEditorView').style.display = 'none';
  document.getElementById('videoUploadView').classList.remove('hidden');
  refreshVideoResumeBar();
}

function resumeVideoProject() {
  if (V.analyzedVideos.length === 0) return;
  document.getElementById('videoUploadView').classList.add('hidden');
  document.getElementById('videoEditorView').style.display = 'flex';
}

document.getElementById('videoHomeBtn').addEventListener('click', showVideoHome);
document.getElementById('videoResumeBtn').addEventListener('click', resumeVideoProject);
