import { mainPlayer, vBlurGroup, vBlurToggle, vShadowGroup, vShadowToggle } from './dom.js';
import { V } from './state.js';
import { schedulePreviewUpdate, updatePreviewCanvas } from './preview.js';

vShadowToggle.addEventListener('click', () => {
    if(V.activeVideoIndex === -1) return;
    const vid = V.analyzedVideos[V.activeVideoIndex];
    vid.shadow.enabled = !vid.shadow.enabled;
    vShadowToggle.classList.toggle('on', vid.shadow.enabled);
    vShadowGroup.classList.toggle('visible', vid.shadow.enabled);
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoShadowOpacitySlider').addEventListener('input', (e) => {
    if(V.activeVideoIndex === -1) return;
    V.analyzedVideos[V.activeVideoIndex].shadow.opacity = parseFloat(e.target.value);
    document.getElementById('videoShadowOpacityValue').textContent = Math.round(e.target.value * 100) + '%';
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoShadowDirectionSlider').addEventListener('input', (e) => {
    if(V.activeVideoIndex === -1) return;
    V.analyzedVideos[V.activeVideoIndex].shadow.direction = parseInt(e.target.value);
    document.getElementById('videoShadowDirectionValue').textContent = e.target.value + '°';
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoShadowDistanceSlider').addEventListener('input', (e) => {
    if(V.activeVideoIndex === -1) return;
    V.analyzedVideos[V.activeVideoIndex].shadow.distance = parseInt(e.target.value);
    document.getElementById('videoShadowDistanceValue').textContent = e.target.value + 'px';
    if (mainPlayer.paused) schedulePreviewUpdate();
});

vBlurToggle.addEventListener('click', () => {
    if(V.activeVideoIndex === -1) return;
    const vid = V.analyzedVideos[V.activeVideoIndex];
    vid.blur.enabled = !vid.blur.enabled;
    vBlurToggle.classList.toggle('on', vid.blur.enabled);
    vBlurGroup.classList.toggle('visible', vid.blur.enabled);
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoBlurIntensitySlider').addEventListener('input', (e) => {
    if(V.activeVideoIndex === -1) return;
    V.analyzedVideos[V.activeVideoIndex].blur.intensity = parseInt(e.target.value);
    document.getElementById('videoBlurIntensityValue').textContent = e.target.value + 'px';
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoZoomSlider').addEventListener('input', (e) => {
    if (V.activeVideoIndex === -1) return;
    const val = parseFloat(e.target.value);
    V.analyzedVideos[V.activeVideoIndex].zoom = val;
    document.getElementById('videoZoomValue').textContent = Math.round(val * 100) + '%';
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoCenterBtn').addEventListener('click', () => {
    if (V.activeVideoIndex === -1) return;
    V.analyzedVideos[V.activeVideoIndex].offsetX = 0;
    V.analyzedVideos[V.activeVideoIndex].offsetY = 0;
    if (mainPlayer.paused) schedulePreviewUpdate();
});

document.getElementById('videoPresetSelect').addEventListener('change', (e) => {
  if (V.activeVideoIndex !== -1) {
    const vid = V.analyzedVideos[V.activeVideoIndex];
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
    if(V.activeVideoIndex !== -1) V.analyzedVideos[V.activeVideoIndex].customW = parseInt(e.target.value) || 1920;
    updatePreviewCanvas();
});

document.getElementById('videoCustomH').addEventListener('input', (e) => {
    if(V.activeVideoIndex !== -1) V.analyzedVideos[V.activeVideoIndex].customH = parseInt(e.target.value) || 1080;
    updatePreviewCanvas();
});
