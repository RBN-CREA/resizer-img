import { showStatus } from './dom.js';
import { items } from './state.js';
import { dimsOf } from './dims.js';
import { renderImage } from './render.js';
import { reportExport } from '../shared/dialogs.js';
import { APP } from '../shared/config.js';

export function formatBytes(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
}

export async function processImagesCustom(format, structure, targetFolders, { quality = 0.95, suffix = '' } = {}) {
  document.getElementById('progressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
  document.getElementById('progressWrap').classList.add('visible');
  showStatus("Génération du fichier ZIP...", "success");

  const zip = new JSZip();
  const usedPaths = new Set();
  const failed = [];
  let countExported = 0;
  const todo = items.filter(it => targetFolders.includes(it.folder));

  // Les chemins dans le ZIP sont fixés d'avance (ordre stable, pas d'écrasement entre doublons)
  const ext = format === 'jpg' ? 'jpeg' : format; // .jpeg : extension reconnue partout (Premiere Pro compris)
  const jobs = todo.map(it => {
    const cleanName = it.file.name.replace(/\.[^.]+$/, '') + suffix;
    const dir = structure === 'folders' ? `${it.folder}/` : '';
    let pathInZip = `${dir}${cleanName}.${ext}`;
    for (let n = 2; usedPaths.has(pathInZip.toLowerCase()); n++) pathInZip = `${dir}${cleanName} (${n}).${ext}`;
    usedPaths.add(pathInZip.toLowerCase());
    return { it, pathInZip };
  });

  // Plusieurs images sont traitées en parallèle (décodage + rendu + encodage)
  let nextJob = 0;
  let finished = 0;
  async function worker() {
    while (nextJob < jobs.length) {
      const { it, pathInZip } = jobs[nextJob++];
      try {
        const preset = it.preset || '1920x1080';
        const blob = await resizeImage(it.file, dimsOf(it), it.crop, it.shadow, it.blur, format, it.bgColor, preset === 'blur', false, quality);
        zip.file(pathInZip, blob, { binary: true });
        countExported++;
      } catch (e) {
        console.error('Export image échoué :', it.file.name, e);
        failed.push(it.file.name);
      }
      finished++;
      document.getElementById('progressBar').style.width = (finished / jobs.length * 100) + '%';
    }
  }
  await Promise.all(Array.from({ length: Math.min(APP.EXPORT_CONCURRENCY, jobs.length) }, worker));

  if (countExported === 0) {
    document.getElementById('progressWrap').classList.remove('visible');
    const msg = failed.length ? `Erreur lors du traitement des images (${failed.join(', ')}).` : 'Aucune image à exporter.';
    showStatus(msg, 'error');
    reportExport({ type: 'error', lines: [failed.length ? 'Aucune image n\'a pu être exportée.' : 'Aucune image à exporter.'], errors: failed.map(n => `Échec : ${n}`) });
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
    reportExport({
      type: failed.length ? 'error' : 'success',
      lines: [`${countExported} image(s) en ${format === 'jpg' ? 'JPEG' : format.toUpperCase()} — ${formatBytes(blob.size)}`, 'Fichier : images_redimensionnees.zip'],
      errors: failed.map(n => `Échec : ${n}`)
    });
  } catch (e) {
    console.error(e);
    document.getElementById('progressWrap').classList.remove('visible');
    showStatus('Erreur lors de la création du ZIP.', 'error');
    reportExport({ type: 'error', lines: ['Le fichier ZIP n\'a pas pu être créé.'] });
  }
}

// Décode l'image hors du fil principal quand c'est possible (ImageBitmap), sinon via un <img>
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return { source: await createImageBitmap(file), release: (src) => src.close() };
    } catch (e) { /* format non pris en charge par createImageBitmap : repli sur <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Image illisible'));
      im.src = url;
    });
    return { source: img, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeImage(file, dims, crop, shadow, blur, format, bgColor, isBlurPreset, drawCheckerboard, quality = 0.95) {
  const { source, release } = await decodeImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    renderImage(canvas.getContext('2d'), source, dims, crop, shadow, blur, bgColor, isBlurPreset, drawCheckerboard, null);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Encodage impossible (image trop grande ?)'));
      }, format === 'jpg' ? 'image/jpeg' : 'image/' + format, format === 'png' ? undefined : quality);
    });
  } finally {
    release(source);
  }
}
