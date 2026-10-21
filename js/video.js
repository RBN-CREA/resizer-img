(function() {
  const videoInput = document.createElement('input');
  videoInput.type = 'file';
  videoInput.multiple = true;
  videoInput.accept = 'video/*';
  videoInput.style.display = 'none';

  let analyzedVideos = [];
  let activeVideoIndex = -1;
  
  let isVideoDragging = false;
  let videoDragStart = { x: 0, y: 0 };

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

  function formatEta(seconds) {
    if (isNaN(seconds) || seconds === Infinity || seconds < 0) return "calcul...";
    const s = Math.round(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
  }

  async function handleVideoFiles(files) {
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
    if (analyzedVideos.length === 0) {
      document.getElementById('videoEditorView').style.display = 'none';
      document.getElementById('videoUploadView').classList.remove('hidden');
      if (failed.length) notify(`Impossible d'analyser : ${failed.join(', ')}`);
    } else if (failed.length) {
      showVideoStatus(`Impossible d'analyser : ${failed.join(', ')}`, "error");
      setTimeout(hideVideoStatus, 8000);
    }

    updateVideoListUI();
    if (activeVideoIndex === -1 && analyzedVideos.length > 0) {
      selectVideo(0);
    }
  }

  function formatTimecode(seconds, fps = APP.DEFAULT_FPS) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.min(Math.round(fps) - 1, Math.floor((seconds % 1) * fps));
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }

  // Cadence de la source : médiane des écarts entre images, ramenée à une cadence standard
  function estimateFps(samples) {
    const deltas = [];
    for (let i = 1; i < samples.length; i++) {
      const d = samples[i].t - samples[i - 1].t;
      if (d > 0.001) deltas.push(d);
    }
    if (deltas.length < 5) return 25;
    deltas.sort((a, b) => a - b);
    const raw = 1 / deltas[Math.floor(deltas.length / 2)];
    const standard = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
    const nearest = standard.reduce((best, f) => Math.abs(f - raw) < Math.abs(best - raw) ? f : best, standard[0]);
    return Math.abs(nearest - raw) / nearest < 0.03 ? nearest : 25;
  }

  // Mesure la luminance moyenne des images d'une vidéo.
  // Voie rapide : lecture accélérée + requestVideoFrameCallback (chaque image présentée).
  // Repli : sauts de lecture toutes les 0,1 s.
  async function collectLuminanceSamples(video, duration, onProgress) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const measure = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return total / (data.length / 4);
    };

    if ('requestVideoFrameCallback' in video) {
      try {
        const samples = await new Promise((resolve, reject) => {
          const out = [];
          let lastFrameAt = performance.now();
          let finished = false;
          const watchdog = setInterval(() => {
            if (performance.now() - lastFrameAt > APP.ANALYSIS_STALL_MS) finish(new Error('Lecture bloquée'));
          }, 1000);

          function finish(err) {
            if (finished) return;
            finished = true;
            clearInterval(watchdog);
            video.removeEventListener('ended', onEnded);
            video.pause();
            video.playbackRate = 1;
            err ? reject(err) : resolve(out);
          }
          const onEnded = () => finish();
          const onFrame = (now, meta) => {
            if (finished) return;
            lastFrameAt = performance.now();
            out.push({ t: meta.mediaTime, lum: measure() });
            if (onProgress && out.length % 10 === 0) onProgress(Math.min(1, meta.mediaTime / duration));
            video.requestVideoFrameCallback(onFrame);
          };

          video.addEventListener('ended', onEnded);
          video.playbackRate = APP.ANALYSIS_PLAYBACK_RATE;
          video.currentTime = 0;
          video.requestVideoFrameCallback(onFrame);
          video.play().catch(finish);
        });
        if (samples.length >= Math.max(2, duration * 2)) {
          samples.fps = estimateFps(samples);
          return samples;
        }
      } catch (e) {
        console.warn('Analyse par lecture impossible, repli sur les sauts de lecture :', e);
      }
    }

    const samples = [];
    const step = 0.1;
    const totalSteps = Math.ceil(duration / step);
    video.currentTime = 0;
    for (let k = 0, t = 0; t < duration; k++, t = k * step) {
      await seekVideo(video, t);
      samples.push({ t, lum: measure() });
      if (onProgress && k % 5 === 0) onProgress(k / totalSteps);
    }
    return samples;
  }

  async function analyzeVideoFile(file, onProgressCallback) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;

      const fail = (e) => {
        console.error('Analyse impossible :', file.name, e);
        URL.revokeObjectURL(video.src);
        resolve(false);
      };
      video.addEventListener('error', () => fail(video.error), { once: true });

      loadVideoMetadata(video).then(async () => {
        try {
        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) throw new Error('Durée invalide');
        let anomalies = [];
        let rawBlackSegments = [];
        let inBlack = false;
        let startBlack = 0;
        let currentWhite = null;

        // Une mesure de luminance par image réellement présentée (aucun flash manqué)
        const samples = await collectLuminanceSamples(video, duration, onProgressCallback);
        const fps = samples.fps || APP.DEFAULT_FPS;

        for (const { t, lum: avgLum } of samples) {
          if (avgLum < APP.BLACK_LUMINANCE) {
            if (!inBlack) { inBlack = true; startBlack = t; }
          } else {
            if (inBlack) {
                inBlack = false;
                rawBlackSegments.push({ start: startBlack, end: t });
            }
          }

          // Les images blanches consécutives forment un seul segment
          if (avgLum > APP.WHITE_LUMINANCE) {
            if (currentWhite && t - currentWhite.end <= APP.WHITE_MERGE_GAP_S) currentWhite.end = t;
            else {
              currentWhite = { type: 'white', start: t, end: t, keep: false };
              anomalies.push(currentWhite);
            }
          }
        }
        anomalies.forEach(a => { a.tcIn = formatTimecode(a.start, fps); a.tcOut = formatTimecode(a.end, fps); });
        
        if (inBlack) {
          rawBlackSegments.push({ start: startBlack, end: duration });
        }

        const timeMargin = APP.BLACK_MARGIN_FRAMES / fps;
        let paddedBlackSegments = rawBlackSegments.map(seg => ({
           start: Math.max(0, seg.start - timeMargin),
           end: Math.min(duration, seg.end + timeMargin),
           type: 'black',
           keep: false
        }));

        let blackSegments = [];
        if (paddedBlackSegments.length > 0) {
            paddedBlackSegments.sort((a, b) => a.start - b.start);
            let current = paddedBlackSegments[0];
            for (let i = 1; i < paddedBlackSegments.length; i++) {
                if (paddedBlackSegments[i].start <= current.end) {
                    current.end = Math.max(current.end, paddedBlackSegments[i].end);
                } else {
                    current.tcIn = formatTimecode(current.start, fps);
                    current.tcOut = formatTimecode(current.end, fps);
                    blackSegments.push(current);
                    current = paddedBlackSegments[i];
                }
            }
            current.tcIn = formatTimecode(current.start, fps);
            current.tcOut = formatTimecode(current.end, fps);
            blackSegments.push(current);
        }

        anomalies = anomalies.concat(blackSegments);
        anomalies.sort((a, b) => a.start - b.start);

        analyzedVideos.push({
          file,
          url: video.src,
          duration,
          preset: '1920x1080',
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          customW: 1920,
          customH: 1080,
          shadow: defaultShadow(),
          blur: { enabled: false, intensity: 20 },
          isMuted: false, // Variable Mute
          fps,
          anomalies,
          blackSegments,
          status: anomalies.length > 0 ? 'error' : 'ok'
        });

        resolve(true);
        } catch (e) { fail(e); }
      }).catch(fail);
    });
  }

  function updateVideoListUI() {
    const container = document.getElementById('videoListContainer');
    container.innerHTML = '';
    document.getElementById('videoCountNum').textContent = analyzedVideos.length;

    analyzedVideos.forEach((vid, index) => {
      const item = document.createElement('div');
      item.className = `video-item ${vid.status === 'ok' ? 'status-ok' : 'status-error'} ${index === activeVideoIndex ? 'active' : ''}`;

      // Icônes SVG pour le son
      const soundIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
      const muteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="1" x2="1" y2="23"></line><path d="M15.54 8.46a5 5 0 0 1 5.58-1.18"></path><path d="M19.07 4.93a10 10 0 0 1 2.27 11.45"></path></svg>`;

      item.innerHTML = `
        <div class="video-item-header">
          <div style="display:flex; align-items:center; gap:8px;">
             <input type="checkbox" class="video-export-cb" data-index="${index}" checked onclick="event.stopPropagation()">
             <span class="video-item-name" title="${escapeHtml(vid.file.name)}">${escapeHtml(vid.file.name)}</span>
          </div>

          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span class="video-item-badge">${vid.status === 'ok' ? 'OK' : vid.anomalies.length + ' défaut(s)'}</span>
              <button class="mute-toggle-btn" aria-label="${vid.isMuted ? 'Activer le son' : 'Couper le son'}" title="${vid.isMuted ? 'Activer le son' : 'Couper le son'}" style="background:transparent; border:none; cursor:pointer; color: ${vid.isMuted ? 'var(--error)' : 'var(--text-muted)'}; display:flex; align-items:center; padding:2px; margin-right:4px;">
                  ${vid.isMuted ? muteIcon : soundIcon}
              </button>
          </div>
        </div>
        <span style="font-size: 0.6875rem; color: var(--text-dim); margin-left:24px;">${Math.round(vid.duration)}s</span>
      `;

      // Gestion du clic pour Mute/Unmute avec répercussion sur le lecteur
      const muteBtn = item.querySelector('.mute-toggle-btn');
      muteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Évite de sélectionner la vidéo en arrière-plan
          analyzedVideos[index].isMuted = !analyzedVideos[index].isMuted;
          // Met à jour le lecteur principal si c'est la vidéo active
          if (index === activeVideoIndex) {
              mainPlayer.muted = analyzedVideos[index].isMuted;
          }
          updateVideoListUI(); // Met à jour l'icône instantanément
      });

      item.addEventListener('click', () => selectVideo(index));
      container.appendChild(item);
    });
  }

  const mainPlayer = document.getElementById('mainVideoPlayer');
  const previewCanvas = document.getElementById('videoPreviewCanvas');
  const previewCtx = previewCanvas.getContext('2d');
  
  const playPauseBtn = document.getElementById('videoPlayPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const scrubberWrap = document.getElementById('videoScrubberWrap');
  const scrubberFill = document.getElementById('videoScrubberFill');
  const timeDisplay = document.getElementById('videoTimeDisplay');

  let videoRenderRaf;

  function drawVideoFrame(ctx, videoElem, vidData, targetW, targetH) {
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

  function updatePreviewCanvas() {
      if (activeVideoIndex === -1) return;
      const vid = analyzedVideos[activeVideoIndex];
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

  let previewUpdateQueued = false;
  function schedulePreviewUpdate() {
    if (previewUpdateQueued) return;
    previewUpdateQueued = true;
    requestAnimationFrame(() => { previewUpdateQueued = false; updatePreviewCanvas(); });
  }

  function renderVideoLoop() {
      if (!mainPlayer.paused && !mainPlayer.ended) {
          updatePreviewCanvas();
          videoRenderRaf = requestAnimationFrame(renderVideoLoop);
      }
  }

  const vShadowToggle = document.getElementById('videoShadowToggle');
  const vShadowGroup = document.getElementById('videoShadowGroup');

  vShadowToggle.addEventListener('click', () => {
      if(activeVideoIndex === -1) return;
      const vid = analyzedVideos[activeVideoIndex];
      vid.shadow.enabled = !vid.shadow.enabled;
      vShadowToggle.classList.toggle('on', vid.shadow.enabled);
      vShadowGroup.classList.toggle('visible', vid.shadow.enabled);
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoShadowOpacitySlider').addEventListener('input', (e) => {
      if(activeVideoIndex === -1) return;
      analyzedVideos[activeVideoIndex].shadow.opacity = parseFloat(e.target.value);
      document.getElementById('videoShadowOpacityValue').textContent = Math.round(e.target.value * 100) + '%';
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoShadowDirectionSlider').addEventListener('input', (e) => {
      if(activeVideoIndex === -1) return;
      analyzedVideos[activeVideoIndex].shadow.direction = parseInt(e.target.value);
      document.getElementById('videoShadowDirectionValue').textContent = e.target.value + '°';
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoShadowDistanceSlider').addEventListener('input', (e) => {
      if(activeVideoIndex === -1) return;
      analyzedVideos[activeVideoIndex].shadow.distance = parseInt(e.target.value);
      document.getElementById('videoShadowDistanceValue').textContent = e.target.value + 'px';
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  const vBlurToggle = document.getElementById('videoBlurToggle');
  const vBlurGroup = document.getElementById('videoBlurIntensityGroup');

  vBlurToggle.addEventListener('click', () => {
      if(activeVideoIndex === -1) return;
      const vid = analyzedVideos[activeVideoIndex];
      vid.blur.enabled = !vid.blur.enabled;
      vBlurToggle.classList.toggle('on', vid.blur.enabled);
      vBlurGroup.classList.toggle('visible', vid.blur.enabled);
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoBlurIntensitySlider').addEventListener('input', (e) => {
      if(activeVideoIndex === -1) return;
      analyzedVideos[activeVideoIndex].blur.intensity = parseInt(e.target.value);
      document.getElementById('videoBlurIntensityValue').textContent = e.target.value + 'px';
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoZoomSlider').addEventListener('input', (e) => {
      if (activeVideoIndex === -1) return;
      const val = parseFloat(e.target.value);
      analyzedVideos[activeVideoIndex].zoom = val;
      document.getElementById('videoZoomValue').textContent = Math.round(val * 100) + '%';
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  document.getElementById('videoCenterBtn').addEventListener('click', () => {
      if (activeVideoIndex === -1) return;
      analyzedVideos[activeVideoIndex].offsetX = 0;
      analyzedVideos[activeVideoIndex].offsetY = 0;
      if (mainPlayer.paused) schedulePreviewUpdate();
  });

  previewCanvas.addEventListener('pointerdown', (e) => {
      if (activeVideoIndex === -1) return;
      isVideoDragging = true;
      videoDragStart = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('pointermove', (e) => {
      if (!isVideoDragging || activeVideoIndex === -1) return;
      const vid = analyzedVideos[activeVideoIndex];
      
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
  mainPlayer.addEventListener('pause', () => cancelAnimationFrame(videoRenderRaf));
  mainPlayer.addEventListener('seeked', () => updatePreviewCanvas());
  mainPlayer.addEventListener('loadeddata', () => updatePreviewCanvas());

  function formatMinSec(seconds) {
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

  let isScrubbingVideo = false;
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

  function updateVideoTimeFromPointer(e) {
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

  document.getElementById('videoPresetSelect').addEventListener('change', (e) => {
    if (activeVideoIndex !== -1) {
      const vid = analyzedVideos[activeVideoIndex];
      vid.preset = e.target.value;
      document.getElementById('videoCustomDimsUI').style.display = e.target.value === 'custom' ? 'flex' : 'none';
      
      if (e.target.value === 'blur') {
          vid.blur.enabled = true;
          document.getElementById('videoBlurToggle').classList.add('on');
          document.getElementById('videoBlurIntensityGroup').classList.add('visible');
      }
      
      updatePreviewCanvas();
    }
  });

  document.getElementById('videoCustomW').addEventListener('input', (e) => {
      if(activeVideoIndex !== -1) analyzedVideos[activeVideoIndex].customW = parseInt(e.target.value) || 1920;
      updatePreviewCanvas();
  });
  
  document.getElementById('videoCustomH').addEventListener('input', (e) => {
      if(activeVideoIndex !== -1) analyzedVideos[activeVideoIndex].customH = parseInt(e.target.value) || 1080;
      updatePreviewCanvas();
  });

  // Repères des segments noirs / blancs sur la barre de lecture (rouge : supprimé, vert : conservé)
  function renderScrubberMarkers(vid) {
    const track = scrubberWrap.querySelector('.video-scrubber-track');
    track.querySelectorAll('.video-scrubber-marker').forEach(m => m.remove());
    if (!vid || !vid.duration) return;
    vid.anomalies.forEach(anom => {
      const m = document.createElement('div');
      m.className = 'video-scrubber-marker' + (anom.keep ? ' keep' : '');
      m.style.left = (anom.start / vid.duration * 100) + '%';
      m.style.width = (Math.max(0, anom.end - anom.start) / vid.duration * 100) + '%';
      m.title = `${anom.type === 'black' ? 'Noir' : 'Blanc'} : ${anom.tcIn} → ${anom.tcOut}`;
      track.appendChild(m);
    });
  }

  function selectVideo(index) {
    activeVideoIndex = index;
    const vid = analyzedVideos[index];
    if (!vid) return;

    document.querySelectorAll('.video-item').forEach((el, idx) => el.classList.toggle('active', idx === index));

    mainPlayer.src = vid.url;
    mainPlayer.muted = vid.isMuted; // Sync du son
    document.getElementById('videoPresetSelect').value = vid.preset || '1920x1080';
    document.getElementById('videoCustomDimsUI').style.display = vid.preset === 'custom' ? 'flex' : 'none';
    
    document.getElementById('videoZoomSlider').value = vid.zoom || 1;
    document.getElementById('videoZoomValue').textContent = Math.round((vid.zoom || 1) * 100) + '%';
    
    document.getElementById('videoCustomW').value = vid.customW || 1920;
    document.getElementById('videoCustomH').value = vid.customH || 1080;

    const shadow = vid.shadow || defaultShadow();
    if(shadow.enabled) {
        vShadowToggle.classList.add('on');
        vShadowGroup.classList.add('visible');
    } else {
        vShadowToggle.classList.remove('on');
        vShadowGroup.classList.remove('visible');
    }
    document.getElementById('videoShadowOpacitySlider').value = shadow.opacity;
    document.getElementById('videoShadowDirectionSlider').value = shadow.direction;
    document.getElementById('videoShadowDistanceSlider').value = shadow.distance;
    document.getElementById('videoShadowOpacityValue').textContent = Math.round(shadow.opacity * 100) + '%';
    document.getElementById('videoShadowDirectionValue').textContent = shadow.direction + '°';
    document.getElementById('videoShadowDistanceValue').textContent = shadow.distance + 'px';

    const blur = vid.blur || { enabled: false, intensity: 20 };
    if(blur.enabled) {
        vBlurToggle.classList.add('on');
        vBlurGroup.classList.add('visible');
    } else {
        vBlurToggle.classList.remove('on');
        vBlurGroup.classList.remove('visible');
    }
    document.getElementById('videoBlurIntensitySlider').value = blur.intensity;
    document.getElementById('videoBlurIntensityValue').textContent = blur.intensity + 'px';

    updatePreviewCanvas();

    const previewBox = document.getElementById('videoPreviewBox');
    previewBox.className = `video-preview-container border-${vid.status === 'ok' ? 'success' : 'error'}`;

    document.getElementById('activeVideoTitle').textContent = vid.file.name;
    const badge = document.getElementById('videoStatusBadge');
    badge.style.background = vid.status === 'ok' ? 'var(--success-bg)' : 'var(--error-bg)';
    badge.style.color = vid.status === 'ok' ? '#86efac' : '#fca5a5';
    badge.textContent = vid.status === 'ok' ? 'Conforme Broadcast' : 'Montage Automatique programmé';

    renderScrubberMarkers(vid);

    const tcContainer = document.getElementById('timecodeListContainer');
    tcContainer.innerHTML = '';

    if (vid.anomalies.length === 0) {
      tcContainer.innerHTML = `<div style="font-size: 0.8125rem; color: var(--success); text-align: center; padding: 12px;">✓ Aucun écran noir ou blanc détecté. La vidéo est prête pour le broadcast.</div>`;
    } else {
      vid.anomalies.forEach((anom, anomIndex) => {
        const chip = document.createElement('div');
        chip.className = 'timecode-chip';
        const badgeColor = anom.type === 'black' ? 'var(--accent)' : 'var(--text-dim)';
        
        chip.style.borderLeftColor = anom.keep ? 'var(--success)' : 'var(--error)';
        chip.style.transition = 'border-color 0.2s, background 0.2s';
        const initialLabel = anom.keep ? 'Conserver' : 'Supprimer';
        
        chip.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:4px; width: 100%;">
            <div style="display:flex; justify-content: space-between; align-items: center;">
              <span>⚠️ Segment <strong style="color:${badgeColor}">${anom.type === 'black' ? 'Noir' : 'Blanc'}</strong></span>
              <div style="display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation()">
                <span style="font-size:11px; color:var(--text-muted); cursor:pointer;" class="keep-label">${initialLabel}</span>
                <div class="toggle keep-segment-toggle ${anom.keep ? 'on' : ''}" style="transform: scale(0.8); transform-origin: right center;"></div>
              </div>
            </div>
            <div style="font-family:monospace; font-size:11px;">IN: ${anom.tcIn} ➔ OUT: ${anom.tcOut}</div>
          </div>
        `;

        const keepToggle = chip.querySelector('.keep-segment-toggle');
        const keepLabel = chip.querySelector('.keep-label');
        
        const toggleKeepState = (e) => {
            e.stopPropagation();
            anom.keep = !anom.keep;
            keepToggle.classList.toggle('on', anom.keep);
            keepLabel.textContent = anom.keep ? 'Conserver' : 'Supprimer';
            chip.style.borderLeftColor = anom.keep ? 'var(--success)' : 'var(--error)';
            renderScrubberMarkers(vid);
        };

        keepToggle.addEventListener('click', toggleKeepState);
        keepLabel.addEventListener('click', toggleKeepState);

        chip.addEventListener('click', (e) => {
          if (e.target.closest('.keep-segment-toggle') || e.target.closest('.keep-label')) return;
          mainPlayer.currentTime = anom.start;
          mainPlayer.play();
          playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        });
        
        tcContainer.appendChild(chip);
      });
    }
  }

  document.getElementById('clearVideoBtn').addEventListener('click', async () => {
    if (analyzedVideos.length > 0 && !(await confirmDialog('Tout effacer ?', `${analyzedVideos.length} vidéo(s) et leurs réglages seront retirées de l'espace de travail.`, 'Tout effacer'))) return;
    analyzedVideos.forEach(v => URL.revokeObjectURL(v.url));
    analyzedVideos = [];
    activeVideoIndex = -1;
    mainPlayer.pause();
    mainPlayer.src = '';
    cancelAnimationFrame(videoRenderRaf);
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    document.getElementById('videoEditorView').style.display = 'none';
    document.getElementById('videoUploadView').classList.remove('hidden');
    videoInput.value = '';
  });

  async function exportSingleVideo(vidData, isFastExport, onProgressCallback, quality = 'broadcast') {
      let videoEncoder = null;
      let audioEncoder = null;
      let encoderError = null;
      const videoElem = document.createElement('video');

      try {
          // --- 1. DÉTECTION ET EXTRACTION DU SON ---
          let audioBuffer = null;
          // Ne tente d'extraire le son QUE si la vidéo n'a pas été "mutée" manuellement
          if (!vidData.isMuted) {
              try {
                  const arrayBuffer = await vidData.file.arrayBuffer();
                  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                  // Décode l'audio du fichier original
                  audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                  audioCtx.close();
              } catch (e) {
                  console.warn("Aucun son détecté ou format non supporté", e);
              }
          }

          let audioConfig = null;
          if (!vidData.isMuted && audioBuffer && audioBuffer.numberOfChannels > 0 && 'AudioEncoder' in window) {
              const candidate = {
                  codec: 'mp4a.40.2', // AAC-LC
                  sampleRate: audioBuffer.sampleRate,
                  numberOfChannels: audioBuffer.numberOfChannels,
                  bitrate: 128_000
              };
              try {
                  const res = await AudioEncoder.isConfigSupported(candidate);
                  if (res.supported) audioConfig = candidate;
                  else console.warn("Encodage AAC non supporté : export sans son");
              } catch (e) {
                  console.warn("Encodage AAC non supporté : export sans son", e);
              }
          }
          const hasAudio = !!audioConfig;

          // Préparation du lecteur Vidéo
          videoElem.src = vidData.url;
          videoElem.muted = true;
          videoElem.playsInline = true;
          await loadVideoMetadata(videoElem);

          let targetW = 1920, targetH = 1080;
          if (vidData.preset === '1080x1920') { targetW = 1080; targetH = 1920; }
          else if (vidData.preset === 'custom') {
              targetW = vidData.customW || 1920;
              targetH = vidData.customH || 1080;
          }

          const fps = vidData.fps || APP.DEFAULT_FPS;

          // --- 2. CONFIGURATION SUPPORTÉE PAR LE NAVIGATEUR ---
          const videoConfig = await getSupportedVideoEncoderConfig(targetW, targetH, fps, computeVideoBitrate(targetW, targetH, fps, quality));
          targetW = videoConfig.width;
          targetH = videoConfig.height;

          const canvas = document.createElement('canvas');
          canvas.width = targetW; canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          const lumCanvas = document.createElement('canvas');
          lumCanvas.width = 64; lumCanvas.height = 36;
          const lumCtx = lumCanvas.getContext('2d', { willReadFrequently: true });

          // --- 3. MUXER (avec piste audio si besoin) ---
          let muxerConfig = {
              target: new Mp4Muxer.ArrayBufferTarget(),
              video: { codec: 'avc', width: targetW, height: targetH },
              fastStart: 'in-memory'
          };
          if (hasAudio) {
              muxerConfig.audio = {
                  codec: 'aac',
                  sampleRate: audioConfig.sampleRate,
                  numberOfChannels: audioConfig.numberOfChannels
              };
          }
          let muxer = new Mp4Muxer.Muxer(muxerConfig);

          // --- 4. ENCODEURS ---
          videoEncoder = new VideoEncoder({
              output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
              error: e => { encoderError = e; console.error("Erreur VideoEncoder:", e); }
          });
          videoEncoder.configure(videoConfig);

          if (hasAudio) {
              audioEncoder = new AudioEncoder({
                  output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                  error: e => { encoderError = e; console.error("Erreur AudioEncoder:", e); }
              });
              audioEncoder.configure(audioConfig);
          }

          const totalFrames = Math.round(vidData.duration * fps);
          let exportFrameCounter = 0;
          let audioSamplesWritten = 0; // l'horodatage audio suit les échantillons réellement écrits (aucun trou ni chevauchement)

          for (let f = 0; f < totalFrames; f++) {
              if (encoderError) throw encoderError;
              const currentTime = f / fps;

              let inBlackSegment = false;
              if (vidData.blackSegments && vidData.blackSegments.length > 0) {
                  inBlackSegment = vidData.blackSegments.some(seg => !seg.keep && currentTime >= seg.start && currentTime <= seg.end);
              }

              // Si on est en export rapide (coupe auto) et qu'on détecte un segment noir, on saute la frame (le son sera sauté aussi !)
              if (isFastExport && inBlackSegment) {
                  if (f % 5 === 0 && onProgressCallback) onProgressCallback(f);
                  continue;
              }

              await seekVideo(videoElem, currentTime);

              drawVideoFrame(ctx, videoElem, vidData, targetW, targetH);

              if (!isFastExport) {
                  // Luminance mesurée sur une miniature (évite de relire l'image pleine résolution)
                  lumCtx.drawImage(canvas, 0, 0, lumCanvas.width, lumCanvas.height);
                  const imgData = lumCtx.getImageData(0, 0, lumCanvas.width, lumCanvas.height).data;
                  let totalLum = 0; let pixelCount = 0;
                  for (let i = 0; i < imgData.length; i += 4) {
                      totalLum += 0.299 * imgData[i] + 0.587 * imgData[i+1] + 0.114 * imgData[i+2];
                      pixelCount++;
                  }
                  if (totalLum / pixelCount < APP.EXPORT_BLACK_LUMINANCE) {
                      let isKept = vidData.blackSegments && vidData.blackSegments.some(seg => seg.keep && currentTime >= seg.start && currentTime <= seg.end);
                      if (!isKept) {
                          if (f % 5 === 0 && onProgressCallback) onProgressCallback(f);
                          continue;
                      }
                  }
              }

              // Calcul du Timestamp commun à la vidéo ET à l'audio
              const timestamp = (exportFrameCounter / fps) * 1_000_000;
              const duration = (1 / fps) * 1_000_000;

              // Traitement et Encodage Vidéo
              const frame = new VideoFrame(canvas, { timestamp, duration });

              videoEncoder.encode(frame, { keyFrame: exportFrameCounter % Math.round(fps) === 0 });
              frame.close();

              // Évite d'accumuler trop de frames en attente dans l'encodeur
              while (videoEncoder.encodeQueueSize > APP.ENCODER_QUEUE_MAX && !encoderError) {
                  await new Promise(r => setTimeout(r, 5));
              }

              // --- 5. EXTRACTION ET ENCODAGE DU CHUNK AUDIO SYNCHRONISÉ ---
              if (hasAudio) {
                  const startSample = Math.floor(currentTime * audioBuffer.sampleRate);
                  const endSample = Math.floor((currentTime + 1/fps) * audioBuffer.sampleRate);
                  const frameCount = endSample - startSample;

                  if (frameCount > 0 && startSample < audioBuffer.length) {
                      const validFrameCount = Math.min(frameCount, audioBuffer.length - startSample);
                      // WebCodecs s'attend à recevoir des données planaires (f32-planar)
                      const dataBuffer = new Float32Array(validFrameCount * audioBuffer.numberOfChannels);

                      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
                          const channelData = audioBuffer.getChannelData(c);
                          dataBuffer.set(channelData.subarray(startSample, startSample + validFrameCount), c * validFrameCount);
                      }

                      const audioData = new AudioData({
                          format: 'f32-planar',
                          sampleRate: audioBuffer.sampleRate,
                          numberOfFrames: validFrameCount,
                          numberOfChannels: audioBuffer.numberOfChannels,
                          timestamp: (audioSamplesWritten / audioBuffer.sampleRate) * 1_000_000, // continu, calé sur la nouvelle timeline
                          data: dataBuffer
                      });

                      audioEncoder.encode(audioData);
                      audioData.close();
                      audioSamplesWritten += validFrameCount;
                  }
              }

              exportFrameCounter++;
              if (f % 5 === 0 && onProgressCallback) onProgressCallback(f);
          }

          if (exportFrameCounter === 0) throw new Error("Aucune image à exporter (tout a été coupé)");

          // --- 6. CLÔTURE ET EXPORT ---
          await videoEncoder.flush();
          if (hasAudio) await audioEncoder.flush();
          if (encoderError) throw encoderError;
          muxer.finalize();

          return {
              name: `${vidData.file.name.replace(/\.[^/.]+$/, '')}.mp4`,
              blob: new Blob([muxer.target.buffer], { type: 'video/mp4' })
          };
      } finally {
          if (videoEncoder && videoEncoder.state !== 'closed') { try { videoEncoder.close(); } catch (e) {} }
          if (audioEncoder && audioEncoder.state !== 'closed') { try { audioEncoder.close(); } catch (e) {} }
          videoElem.removeAttribute('src');
          videoElem.load();
      }
  }

  function downloadBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function runVideoExportMultiple(isFastExport) {
      const checkboxes = document.querySelectorAll('.video-export-cb:checked');
      if (checkboxes.length === 0) {
          notify("Veuillez sélectionner au moins une vidéo en cochant la case dans la liste.");
          return;
      }

      if (!("VideoEncoder" in window)) {
          notify("Votre navigateur ne supporte pas WebCodecs pour l'encodage matériel.");
          return;
      }

      const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
      const quality = document.getElementById('videoExportQuality').value;

      const progressWrap = document.getElementById('videoProgressWrap');
      const progressBar = document.getElementById('videoProgressBar');
      progressWrap.classList.add('visible');
      
      const modeText = isFastExport ? "Rapide (via Timecodes)" : "Précis (Frame-Perfect)";
      
      let totalFramesAll = 0;
      selectedIndices.forEach(idx => {
          totalFramesAll += Math.round(analyzedVideos[idx].duration * (analyzedVideos[idx].fps || APP.DEFAULT_FPS));
      });

      let globalFramesProcessed = 0;
      const startTime = Date.now();
      const failures = [];
      const exported = [];

      for (let i = 0; i < selectedIndices.length; i++) {
          const vidData = analyzedVideos[selectedIndices[i]];
          
          try {
              const result = await exportSingleVideo(vidData, isFastExport, (framesDoneInVid) => {
                  const totalDone = globalFramesProcessed + framesDoneInVid;
                  const percent = totalDone / totalFramesAll;
                  const elapsed = (Date.now() - startTime) / 1000;
                  const estimatedTotal = percent > 0 ? elapsed / percent : 0;
                  const remaining = estimatedTotal - elapsed;

                  progressBar.style.width = `${percent * 100}%`;
                  showVideoStatus(`Export ${i+1}/${selectedIndices.length} - ${modeText} (${Math.round(percent * 100)}%) - Temps restant : ${formatEta(remaining)}`, "success");
              }, quality);
              exported.push(result);
          } catch (e) {
              console.error("Export échoué :", vidData.file.name, e);
              failures.push(`${vidData.file.name} (${e && e.message ? e.message : 'erreur inconnue'})`);
          }

          globalFramesProcessed += Math.round(vidData.duration * (vidData.fps || APP.DEFAULT_FPS));
      }

      // Un seul fichier : téléchargement direct. Plusieurs : un ZIP (les navigateurs bloquent les téléchargements en rafale)
      if (exported.length === 1) {
          downloadBlob(exported[0].blob, exported[0].name);
      } else if (exported.length > 1) {
          showVideoStatus('Création du ZIP...', 'success');
          const zip = new JSZip();
          const used = new Set();
          exported.forEach(({ name, blob }) => {
              let n = name;
              for (let k = 2; used.has(n.toLowerCase()); k++) n = name.replace(/\.mp4$/, ` (${k}).mp4`);
              used.add(n.toLowerCase());
              zip.file(n, blob);
          });
          downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }), 'videos_broadcast.zip');
      }

      progressWrap.classList.remove('visible');
      if (failures.length) {
          showVideoStatus(`Export terminé avec ${failures.length} échec(s) : ${failures.join(' ; ')}`, "error");
          setTimeout(hideVideoStatus, 12000);
      } else {
          showVideoStatus(`Export Broadcast Multiple terminé avec succès !`, "success");
          setTimeout(hideVideoStatus, 4000);
      }
  }

  document.getElementById('exportFastVideoBtn').addEventListener('click', () => runVideoExportMultiple(true));
  document.getElementById('exportPreciseBtn').addEventListener('click', () => runVideoExportMultiple(false));

  function showVideoStatus(message, type) {
    const bar = document.getElementById('videoStatusBar');
    bar.className = 'status-bar visible ' + type;
    document.getElementById('videoStatusText').textContent = message;
  }

  function hideVideoStatus() {
    document.getElementById('videoStatusBar').className = 'status-bar';
  }
})();
