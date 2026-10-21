import { presetDimensions } from './dims.js';
import { APP } from '../shared/config.js';
import { computeDrawSize } from './render.js';

export let isFaceApiLoaded = false;

export let faceAIPromise = null;

export function loadFaceAI() {
  if (!faceAIPromise) {
    faceAIPromise = (async () => {
      try {
        const MODEL_URL = 'vendor/models'; // hébergé dans le dépôt
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

export async function runAutoCropLogic(img, preset, zoomLvl, dims) {
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
