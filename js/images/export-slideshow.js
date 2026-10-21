import { showStatus } from './dom.js';
import { reportExport } from '../shared/dialogs.js';
import { formatBytes } from './export-images.js';
import { S, getItem, items } from './state.js';
import { dimsOf } from './dims.js';
import { computeVideoBitrate, getSupportedVideoEncoderConfig } from '../shared/video-utils.js';
import { renderImage } from './render.js';
import { APP } from '../shared/config.js';

// --- ENCODEUR MATÉRIEL (WEBCODECS) POUR LES IMAGES ---
export async function generateVideoWebCodecs(targetFolders, durationInSeconds, transitionType, kenBurnsPercent) {
  const state = { encoder: null };
  const progressBar = document.getElementById('progressBar');
  const originalProgressBg = progressBar.style.background;
  try {
    await generateVideoWebCodecsInner(targetFolders, durationInSeconds, transitionType, kenBurnsPercent, state);
  } catch (e) {
    console.error("Export diaporama échoué :", e);
    const reason = e && e.message ? e.message : 'erreur inconnue';
    showStatus(`Échec de l'export vidéo : ${reason}`, 'error');
    reportExport({ type: 'error', lines: ['Le diaporama vidéo n\'a pas pu être créé.'], errors: [reason] });
    document.getElementById('progressWrap').classList.remove('visible');
    progressBar.style.background = originalProgressBg;
  } finally {
    if (state.encoder && state.encoder.state !== 'closed') { try { state.encoder.close(); } catch (e) {} }
  }
}

export async function generateVideoWebCodecsInner(targetFolders, durationInSeconds, transitionType, kenBurnsPercent, state) {
  document.getElementById('progressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
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
        if (!S.isKenBurnsEnabled) return null;
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
    const count = Object.keys(zip.files).length;
    showStatus(`${count} diaporama(s) MP4 exporté(s) ! (${formatBytes(blob.size)})`, 'success');
    reportExport({ type: 'success', files: [{ name: 'diaporamas_video_H264.zip', detail: `${count} diaporama(s) MP4 H.264 · ${formatBytes(blob.size)}` }] });
  } catch (e) {
    showStatus('Erreur lors de la création du ZIP vidéo.', 'error');
    reportExport({ type: 'error', lines: ['Le ZIP des diaporamas n\'a pas pu être créé.'] });
    console.error(e);
  }

  setTimeout(() => {
    document.getElementById('progressWrap').classList.remove('visible');
    progressBar.style.background = originalProgressBg;
  }, 3000);
}
