import { showStatus } from './dom.js';
import { items } from './state.js';
import { dimsOf } from './dims.js';
import { renderImage } from './render.js';

export function formatBytes(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
}

export async function processImagesCustom(format, structure, targetFolders, { quality = 0.95, suffix = '' } = {}) {
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
      const ext = format === 'jpg' ? 'jpeg' : format; // .jpeg : extension reconnue partout (Premiere Pro compris)
      let pathInZip = `${dir}${cleanName}.${ext}`;
      for (let n = 2; usedPaths.has(pathInZip.toLowerCase()); n++) pathInZip = `${dir}${cleanName} (${n}).${ext}`;
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

export function resizeImage(file, dims, crop, shadow, blur, format, bgColor, isBlurPreset, drawCheckerboard, quality = 0.95) {
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
