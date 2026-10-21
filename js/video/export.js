import { computeVideoBitrate, getSupportedVideoEncoderConfig, loadVideoMetadata, seekVideo } from '../shared/video-utils.js';
import { APP } from '../shared/config.js';
import { drawVideoFrame } from './preview.js';
import { notify, reportExport } from '../shared/dialogs.js';
import { V } from './state.js';
import { hideVideoStatus, showVideoStatus } from './status.js';
import { formatEta } from './import.js';

export async function exportSingleVideo(vidData, isFastExport, onProgressCallback, quality = 'broadcast') {
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

export function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function runVideoExportMultiple(isFastExport) {
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
    document.getElementById('videoProgressBar').style.width = '0%'; // repart de zéro (évite de réafficher l'ancien pourcentage)
    progressWrap.classList.add('visible');
    
    const modeText = isFastExport ? "Rapide (via Timecodes)" : "Précis (Frame-Perfect)";
    
    let totalFramesAll = 0;
    selectedIndices.forEach(idx => {
        totalFramesAll += Math.round(V.analyzedVideos[idx].duration * (V.analyzedVideos[idx].fps || APP.DEFAULT_FPS));
    });

    let globalFramesProcessed = 0;
    const startTime = Date.now();
    const failures = [];
    const exported = [];

    for (let i = 0; i < selectedIndices.length; i++) {
        const vidData = V.analyzedVideos[selectedIndices[i]];
        
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
    let outputName = null;
    let outputSize = 0;
    if (exported.length === 1) {
        outputName = exported[0].name;
        outputSize = exported[0].blob.size;
        downloadBlob(exported[0].blob, outputName);
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
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
        outputName = 'videos_broadcast.zip';
        outputSize = zipBlob.size;
        downloadBlob(zipBlob, outputName);
    }

    progressWrap.classList.remove('visible');
    const sizeText = outputSize >= 1048576 ? (outputSize / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(outputSize / 1024)) + ' Ko';
    if (failures.length) {
        showVideoStatus(`Export terminé avec ${failures.length} échec(s) : ${failures.join(' ; ')}`, "error");
        setTimeout(hideVideoStatus, 12000);
    } else {
        showVideoStatus(`${exported.length} vidéo(s) exportée(s) avec succès ! (${sizeText})`, "success");
        setTimeout(hideVideoStatus, 4000);
    }
    if (exported.length) {
        reportExport({
            type: failures.length ? 'error' : 'success',
            files: [{ name: outputName, detail: `${exported.length} vidéo(s) MP4 H.264 / AAC · ${sizeText}` }],
            errors: failures.map(f => `Échec : ${f}`)
        });
    } else if (failures.length) {
        reportExport({ type: 'error', lines: ['Aucune vidéo n\'a pu être exportée.'], errors: failures.map(f => `Échec : ${f}`) });
    }
}

document.getElementById('exportFastVideoBtn').addEventListener('click', () => runVideoExportMultiple(true));

document.getElementById('exportPreciseBtn').addEventListener('click', () => runVideoExportMultiple(false));
