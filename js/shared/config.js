export const APP = {
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
  FACE_AI_WAIT_MS: 8000,           // attente max du modèle de détection de visages
  AUTOCROP_MAX_SIDE: 640,          // les détections (visage, sujet) travaillent sur une image réduite à ce côté max
  EXPORT_CONCURRENCY: Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) // images traitées en parallèle à l'export ZIP
};

export const defaultShadow = () => ({ enabled: false, opacity: 0.3, direction: 180, distance: 4 });
