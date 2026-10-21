import { defaultShadow } from '../shared/config.js';
import { V } from './state.js';
import { mainPlayer, playIcon, playPauseBtn, previewCanvas, previewCtx, scrubberFill, scrubberWrap, timeDisplay } from './dom.js';

export let isVideoDragging = false;

export let videoDragStart = { x: 0, y: 0 };

export function drawVideoFrame(ctx, videoElem, vidData, targetW, targetH) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, targetW, targetH);

    if (!videoElem.videoWidth) return;

    const preset = vidData.preset || '1920x1080';
    const zoom = vidData.zoom || 1;
    const offsetX = vidData.offsetX || 0;
    const offsetY = vidData.offsetY || 0;
    const shadow = vidData.shadow || defaultShadow();
    const blur = vidData.blur || { enabled: false, intensity: 20 };
    const isBlurActive = preset === 'blur' || blur.enabled;

    const vidAspect = videoElem.videoWidth / videoElem.videoHeight;
    const canvasAspect = targetW / targetH;
    let drawW, drawH;

    if (isBlurActive) {
        ctx.save();
        ctx.filter = `blur(${blur.intensity || 20}px) brightness(0.6)`;
        let bgW, bgH;
        if (vidAspect > canvasAspect) {
            bgH = targetH;
            bgW = targetH * vidAspect;
        } else {
            bgW = targetW;
            bgH = targetW / vidAspect;
        }
        ctx.translate(targetW/2, targetH/2);
        ctx.scale(1.2, 1.2); 
        ctx.drawImage(videoElem, -bgW/2, -bgH/2, bgW, bgH);
        ctx.restore();

        let fgZoom = zoom * (preset === 'blur' ? 0.85 : 1);
        if (vidAspect > canvasAspect) {
            drawW = targetW * fgZoom;
            drawH = (targetW / vidAspect) * fgZoom;
        } else {
            drawH = targetH * fgZoom;
            drawW = (targetH * vidAspect) * fgZoom;
        }
    } else {
        if (vidAspect > canvasAspect) {
            drawH = targetH * zoom;
            drawW = drawH * vidAspect;
        } else {
            drawW = targetW * zoom;
            drawH = drawW / vidAspect;
        }
    }

    const x = (targetW / 2) + offsetX - (drawW / 2);
    const y = (targetH / 2) + offsetY - (drawH / 2);

    ctx.save();
    if (shadow.enabled && shadow.opacity > 0) {
        const rad = (shadow.direction * Math.PI) / 180;
        ctx.shadowColor = `rgba(0, 0, 0, ${shadow.opacity})`;
        ctx.shadowBlur = isBlurActive ? 40 : 20;
        ctx.shadowOffsetX = Math.cos(rad) * shadow.distance;
        ctx.shadowOffsetY = Math.sin(rad) * shadow.distance;
    }
    ctx.drawImage(videoElem, x, y, drawW, drawH);
    ctx.restore();
}

export function updatePreviewCanvas() {
    if (V.activeVideoIndex === -1) return;
    const vid = V.analyzedVideos[V.activeVideoIndex];
    if (!vid) return;

    let targetW = 1920;
    let targetH = 1080;
    if (vid.preset === '1080x1920') {
        targetW = 1080;
        targetH = 1920;
    } else if (vid.preset === 'custom') {
        targetW = parseInt(document.getElementById('videoCustomW').value) || 1920;
        targetH = parseInt(document.getElementById('videoCustomH').value) || 1080;
    }

    if (previewCanvas.width !== targetW || previewCanvas.height !== targetH) {
      previewCanvas.width = targetW;
      previewCanvas.height = targetH;
    }
    previewCanvas.style.aspectRatio = `${targetW} / ${targetH}`;

    if (mainPlayer.readyState >= 2) {
        drawVideoFrame(previewCtx, mainPlayer, vid, targetW, targetH);
    }
}

export let previewUpdateQueued = false;

export function schedulePreviewUpdate() {
  if (previewUpdateQueued) return;
  previewUpdateQueued = true;
  requestAnimationFrame(() => { previewUpdateQueued = false; updatePreviewCanvas(); });
}

export function renderVideoLoop() {
    if (!mainPlayer.paused && !mainPlayer.ended) {
        updatePreviewCanvas();
        V.videoRenderRaf = requestAnimationFrame(renderVideoLoop);
    }
}

previewCanvas.addEventListener('pointerdown', (e) => {
    if (V.activeVideoIndex === -1) return;
    isVideoDragging = true;
    videoDragStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener('pointermove', (e) => {
    if (!isVideoDragging || V.activeVideoIndex === -1) return;
    const vid = V.analyzedVideos[V.activeVideoIndex];
    
    const rect = previewCanvas.getBoundingClientRect();
    const scaleX = previewCanvas.width / rect.width;
    const scaleY = previewCanvas.height / rect.height;

    vid.offsetX = (vid.offsetX || 0) + (e.clientX - videoDragStart.x) * scaleX;
    vid.offsetY = (vid.offsetY || 0) + (e.clientY - videoDragStart.y) * scaleY;
    
    videoDragStart = { x: e.clientX, y: e.clientY };
    if (mainPlayer.paused) schedulePreviewUpdate();
});

window.addEventListener('pointerup', () => { isVideoDragging = false; });

window.addEventListener('pointercancel', () => { isVideoDragging = false; });

playPauseBtn.addEventListener('click', () => {
  if (mainPlayer.paused) {
    mainPlayer.play();
    playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  } else {
    mainPlayer.pause();
    playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  }
});

mainPlayer.addEventListener('play', () => renderVideoLoop());

mainPlayer.addEventListener('pause', () => cancelAnimationFrame(V.videoRenderRaf));

mainPlayer.addEventListener('seeked', () => updatePreviewCanvas());

mainPlayer.addEventListener('loadeddata', () => updatePreviewCanvas());

export function formatMinSec(seconds) {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

mainPlayer.addEventListener('timeupdate', () => {
  if (!mainPlayer.duration) return;
  const pct = (mainPlayer.currentTime / mainPlayer.duration) * 100;
  scrubberFill.style.width = pct + '%';
  scrubberWrap.setAttribute('aria-valuenow', Math.round(pct));
  timeDisplay.textContent = `${formatMinSec(mainPlayer.currentTime)} / ${formatMinSec(mainPlayer.duration)}`;
});

mainPlayer.addEventListener('ended', () => {
  playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
});

export let isScrubbingVideo = false;

scrubberWrap.addEventListener('pointerdown', (e) => {
  isScrubbingVideo = true;
  updateVideoTimeFromPointer(e);
});

window.addEventListener('pointermove', (e) => {
  if (!isScrubbingVideo) return;
  updateVideoTimeFromPointer(e);
});

window.addEventListener('pointerup', () => {
  isScrubbingVideo = false;
});

export function updateVideoTimeFromPointer(e) {
  if (!mainPlayer.duration) return;
  const rect = scrubberWrap.getBoundingClientRect();
  let pos = (e.clientX - rect.left) / rect.width;
  pos = Math.max(0, Math.min(1, pos));
  mainPlayer.currentTime = pos * mainPlayer.duration;
}

scrubberWrap.addEventListener('keydown', (e) => {
  if (!mainPlayer.duration) return;
  const step = e.shiftKey ? 10 : 1;
  let handled = true;
  if (e.key === 'ArrowRight') mainPlayer.currentTime = Math.min(mainPlayer.duration, mainPlayer.currentTime + step);
  else if (e.key === 'ArrowLeft') mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - step);
  else if (e.key === 'Home') mainPlayer.currentTime = 0;
  else if (e.key === 'End') mainPlayer.currentTime = mainPlayer.duration;
  else handled = false;
  if (handled) e.preventDefault();
});
