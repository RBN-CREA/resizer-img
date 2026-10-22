// Bouton « Accueil » : retour à la page d'import sans perdre le projet en cours
import { uploadView, editorView } from './dom.js';
import { items } from './state.js';

export function refreshResumeBar() {
  const bar = document.getElementById('resumeBar');
  bar.hidden = items.length === 0;
  document.getElementById('resumeLabel').textContent = `Reprendre le projet · ${items.length} image(s)`;
}

function showHome() {
  uploadView.classList.remove('hidden');
  editorView.classList.remove('active');
  refreshResumeBar();
}

function resumeProject() {
  if (items.length === 0) return;
  uploadView.classList.add('hidden');
  editorView.classList.add('active');
}

document.getElementById('homeBtn').addEventListener('click', showHome);
document.getElementById('resumeBtn').addEventListener('click', resumeProject);
