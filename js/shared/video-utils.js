import { APP } from './config.js';

// Débit H.264 adapté à la résolution : bits par pixel selon la qualité choisie
export const VIDEO_QUALITY_BPP = { standard: 0.12, high: 0.25, broadcast: 0.96 }; // ≈ 6 / 13 / 50 Mbps en 1080p25

export function computeVideoBitrate(w, h, fps, quality) {
  const bpp = VIDEO_QUALITY_BPP[quality] || VIDEO_QUALITY_BPP.high;
  return Math.round(Math.min(100_000_000, Math.max(2_000_000, w * h * fps * bpp)));
}

// Attend un événement du <video>, ou échoue sur erreur / délai dépassé
export function waitForVideoEvent(video, okEvent, timeoutMs = APP.SEEK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Délai dépassé (' + okEvent + ')')), timeoutMs);
    function done(err) {
      clearTimeout(timer);
      video.removeEventListener(okEvent, onOk);
      video.removeEventListener('error', onErr);
      err ? reject(err) : resolve();
    }
    const onOk = () => done();
    const onErr = () => done(new Error('Fichier vidéo illisible ou format non supporté'));
    video.addEventListener(okEvent, onOk);
    video.addEventListener('error', onErr);
  });
}

export function loadVideoMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return waitForVideoEvent(video, 'loadedmetadata');
}

export function seekVideo(video, time) {
  const p = waitForVideoEvent(video, 'seeked');
  video.currentTime = time;
  return p;
}

// Choisit une config H.264 réellement supportée (niveau selon la résolution, repli logiciel)
export async function getSupportedVideoEncoderConfig(width, height, fps, bitrate) {
  if (!('VideoEncoder' in window)) throw new Error("WebCodecs n'est pas supporté par ce navigateur");
  const w = width & ~1, h = height & ~1; // H.264 exige des dimensions paires
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
  const level = mbs <= 8192 ? '28' : (mbs <= 22080 ? '32' : '33'); // 4.0 / 5.0 / 5.1
  const codecs = ['avc1.6400' + level, 'avc1.4D00' + level, 'avc1.4200' + level];
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
    for (const codec of codecs) {
      const config = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration };
      try {
        const res = await VideoEncoder.isConfigSupported(config);
        if (res.supported) return res.config;
      } catch (e) {}
    }
  }
  throw new Error(`Aucun encodeur H.264 disponible pour ${w}×${h}`);
}
