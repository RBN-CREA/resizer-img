import { APP, defaultShadow } from '../shared/config.js';
import { loadVideoMetadata, seekVideo } from '../shared/video-utils.js';
import { V } from './state.js';

export function formatTimecode(seconds, fps = APP.DEFAULT_FPS) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.min(Math.round(fps) - 1, Math.floor((seconds % 1) * fps));
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// Cadence de la source : médiane des écarts entre images, ramenée à une cadence standard
export function estimateFps(samples) {
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
export async function collectLuminanceSamples(video, duration, onProgress) {
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

export async function analyzeVideoFile(file, onProgressCallback) {
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

      V.analyzedVideos.push({
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
