  // Réglages et seuils de l'application (plutôt que des valeurs « magiques » dans le code)
  const APP = {
    DEFAULT_FPS: 25,                 // cadence supposée quand la source ne la révèle pas
    BLACK_LUMINANCE: 8,              // luminance moyenne (0-255) en dessous de laquelle une image est « noire »
    WHITE_LUMINANCE: 248,            // au-dessus : image « blanche »
    EXPORT_BLACK_LUMINANCE: 6,       // seuil de coupe des images noires à l'export précis
    WHITE_MERGE_GAP_S: 0.25,         // écart max entre deux images blanches d'un même segment
    BLACK_MARGIN_FRAMES: 5,          // marge ajoutée autour d'un segment noir
    ANALYSIS_PLAYBACK_RATE: 4,       // vitesse de lecture pendant l'analyse
    ANALYSIS_STALL_MS: 8000,         // lecture considérée bloquée sans nouvelle image
    SEEK_TIMEOUT_MS: 15000,          // délai max pour un saut de lecture / chargement
    ENCODER_QUEUE_MAX: 20,           // images en attente max dans l'encodeur
    SNAP_PX: 15,                     // distance d'aimantation aux repères de l'éditeur
    UNDO_LIMIT: 20,                  // étapes d'annulation conservées
    TOAST_MS: 8000,                  // durée d'affichage des messages
    FACE_AI_WAIT_MS: 8000            // attente max du modèle de détection de visages
  };

  const defaultShadow = () => ({ enabled: false, opacity: 0.3, direction: 180, distance: 4 });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Message non bloquant (remplace alert())
  let notifyTimer = null;
  function notify(message) {
    let el = document.getElementById('msgToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'msgToast';
      el.className = 'toast';
      el.setAttribute('role', 'alert');
      el.innerHTML = '<span></span><button type="button">OK</button>';
      el.querySelector('button').addEventListener('click', () => el.classList.remove('visible'));
      document.body.appendChild(el);
    }
    el.querySelector('span').textContent = message;
    el.classList.add('visible');
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => el.classList.remove('visible'), APP.TOAST_MS);
  }

  // Saisie d'un texte (remplace prompt()) — renvoie une Promise<string|null>
  function promptDialog(title, label, defaultValue = '', okLabel = 'Valider') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="modal" style="max-width: 420px;">
          <div class="modal-header"><h2></h2></div>
          <form style="padding: 20px 24px; display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 0.8125rem; color: var(--text-muted);"></label>
            <input type="text" class="format-select" style="background-image: none;">
            <div class="modal-footer" style="padding: 16px 0 0; border: none;">
              <div class="modal-footer-right" style="margin-left: auto;">
                <button type="button" class="btn btn-ghost" data-act="cancel">Annuler</button>
                <button type="submit" class="btn btn-primary"></button>
              </div>
            </div>
          </form>
        </div>`;
      overlay.querySelector('h2').textContent = title;
      const input = overlay.querySelector('input');
      const lab = overlay.querySelector('label');
      lab.textContent = label;
      input.id = 'promptDialogInput';
      lab.setAttribute('for', input.id);
      input.value = defaultValue;
      overlay.querySelector('[type="submit"]').textContent = okLabel;

      const finish = (value) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
      };
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-act="cancel"]')) finish(null);
      });
      overlay.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        finish(input.value.trim() || null);
      });
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  // Boîte de confirmation intégrée (remplace confirm()) — renvoie une Promise<boolean>
  function confirmDialog(title, message, okLabel = 'Confirmer') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="modal" style="max-width: 420px;">
          <div class="modal-header"><h2></h2></div>
          <div style="padding: 20px 24px; font-size: 0.9rem; color: var(--text-muted);"></div>
          <div class="modal-footer">
            <div class="modal-footer-right" style="margin-left: auto;">
              <button class="btn btn-ghost" data-act="cancel">Annuler</button>
              <button class="btn btn-danger" data-act="ok"></button>
            </div>
          </div>
        </div>`;
      overlay.querySelector('h2').textContent = title;
      overlay.querySelector('.modal-header + div').textContent = message;
      const okBtn = overlay.querySelector('[data-act="ok"]');
      okBtn.textContent = okLabel;

      const finish = (value) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      };
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(false);
        const act = e.target.closest('[data-act]');
        if (act) finish(act.dataset.act === 'ok');
      });
      document.body.appendChild(overlay);
      overlay.querySelector('[data-act="cancel"]').focus();
    });
  }

  // Débit H.264 adapté à la résolution : bits par pixel selon la qualité choisie
  const VIDEO_QUALITY_BPP = { standard: 0.12, high: 0.25, broadcast: 0.96 }; // ≈ 6 / 13 / 50 Mbps en 1080p25
  function computeVideoBitrate(w, h, fps, quality) {
    const bpp = VIDEO_QUALITY_BPP[quality] || VIDEO_QUALITY_BPP.high;
    return Math.round(Math.min(100_000_000, Math.max(2_000_000, w * h * fps * bpp)));
  }

  // Attend un événement du <video>, ou échoue sur erreur / délai dépassé
  function waitForVideoEvent(video, okEvent, timeoutMs = APP.SEEK_TIMEOUT_MS) {
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

  function loadVideoMetadata(video) {
    if (video.readyState >= 1) return Promise.resolve();
    return waitForVideoEvent(video, 'loadedmetadata');
  }

  function seekVideo(video, time) {
    const p = waitForVideoEvent(video, 'seeked');
    video.currentTime = time;
    return p;
  }

  // Choisit une config H.264 réellement supportée (niveau selon la résolution, repli logiciel)
  async function getSupportedVideoEncoderConfig(width, height, fps, bitrate) {
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

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
      
      btn.classList.add('active');
      const tabName = btn.dataset.tab;
      if (tabName === 'images') {
        document.getElementById('imageView').classList.add('active');
      } else if (tabName === 'video') {
        document.getElementById('videoView').classList.add('active');
      }
    });
  });
