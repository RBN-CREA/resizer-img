import { V } from './state.js';
import { escapeHtml } from '../shared/html.js';
import { mainPlayer, playIcon, previewCanvas, previewCtx, scrubberWrap, vBlurGroup, vBlurToggle, vShadowGroup, vShadowToggle } from './dom.js';
import { defaultShadow } from '../shared/config.js';
import { updatePreviewCanvas } from './preview.js';
import { confirmDialog } from '../shared/dialogs.js';
import { videoInput } from './import.js';

export function updateVideoListUI() {
  const container = document.getElementById('videoListContainer');
  container.innerHTML = '';
  document.getElementById('videoCountNum').textContent = V.analyzedVideos.length;

  V.analyzedVideos.forEach((vid, index) => {
    const item = document.createElement('div');
    item.className = `video-item ${vid.status === 'ok' ? 'status-ok' : 'status-error'} ${index === V.activeVideoIndex ? 'active' : ''}`;

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
        V.analyzedVideos[index].isMuted = !V.analyzedVideos[index].isMuted;
        // Met à jour le lecteur principal si c'est la vidéo active
        if (index === V.activeVideoIndex) {
            mainPlayer.muted = V.analyzedVideos[index].isMuted;
        }
        updateVideoListUI(); // Met à jour l'icône instantanément
    });

    item.addEventListener('click', () => selectVideo(index));
    container.appendChild(item);
  });
}

// Repères des segments noirs / blancs sur la barre de lecture (rouge : supprimé, vert : conservé)
export function renderScrubberMarkers(vid) {
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

export function selectVideo(index) {
  V.activeVideoIndex = index;
  const vid = V.analyzedVideos[index];
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
  if (V.analyzedVideos.length > 0 && !(await confirmDialog('Tout effacer ?', `${V.analyzedVideos.length} vidéo(s) et leurs réglages seront retirées de l'espace de travail.`, 'Tout effacer'))) return;
  V.analyzedVideos.forEach(v => URL.revokeObjectURL(v.url));
  V.analyzedVideos = [];
  V.activeVideoIndex = -1;
  mainPlayer.pause();
  mainPlayer.src = '';
  cancelAnimationFrame(V.videoRenderRaf);
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  document.getElementById('videoEditorView').style.display = 'none';
  document.getElementById('videoUploadView').classList.remove('hidden');
  videoInput.value = '';
});
