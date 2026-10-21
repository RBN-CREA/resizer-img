# Resize Studio

Redimensionneur d'images et montage vidéo « broadcast » qui tourne **entièrement dans le navigateur** : aucun fichier n'est envoyé à un serveur.

## Fonctionnalités

**Images**
- Import de fichiers ou de dossiers, groupement par dossier / série, tri, sélection multiple (clic, Maj+clic, rectangle, Ctrl/Cmd+A).
- Formats prédéfinis (horizontal 1920×1080, vertical 1080×1920, flou complet, une de presse 750×992) ou dimensions personnalisées propres à chaque image.
- Recadrage automatique (détection de visage, sinon de sujet) ; éditeur avec zoom, déplacement, ombre portée, flou de fond, couleur de fond, repères et zones de sécurité TV.
- Export ZIP en JPEG / PNG / WebP (qualité réglable, suffixe de nom) et diaporama MP4 H.264 (transitions, effet Ken Burns, débit adapté à la résolution).
- Annulation (Ctrl/Cmd+Z) des actions groupées.

**Vidéos**
- Détection des écrans noirs et blancs (cadence réelle de la source), repères sur la barre de lecture.
- Export H.264 / AAC avec coupe automatique des segments noirs (rapide via timecodes, ou précis image par image), recadrage, ombre, flou de fond.

## Utilisation

L'application est un site statique, sans étape de build. Pour que l'export vidéo (WebCodecs) fonctionne, servez-la depuis `localhost` ou en HTTPS plutôt que depuis `file://` :

```bash
python3 -m http.server 8000
```

puis ouvrez <http://localhost:8000>.

Navigateurs : l'export vidéo exige WebCodecs (Chrome / Edge, ou un Safari récent) ; l'export d'images n'en dépend pas. Seul Chrome a été testé.

## Raccourcis

| Contexte | Raccourci | Action |
|---|---|---|
| Galerie | Ctrl/Cmd+A · Suppr · Échap | tout sélectionner · supprimer · désélectionner |
| Galerie | Entrée · Espace (sur une vignette) | éditer · sélectionner |
| Éditeur | Flèches (Maj : ×10) · + / − · 0 · Entrée | déplacer · zoom · centrer · valider |
| Images | Ctrl/Cmd+Z | annuler la dernière action groupée |
| Lecteur vidéo | Flèches · Début / Fin | avancer / reculer · aller au début / à la fin |

## Structure

Le code est en modules ES (`<script type="module">`) : il doit être servi en HTTP(S) (Vercel, `localhost`…), pas ouvert en double-clic.

```
index.html              page et structure
css/                    fonts, base, components, layout, gallery, sidebar, status, modals, video, feedback, notify (chargement, messages, notification d'export, style classique), pixel (le même habillage en pixel art), pixel-theme (interface complète en pixel art, optionnelle), responsive
vendor/                 bibliothèques tierces, modèle de détection de visages, police Inter
js/main.js              point d'entrée
js/shared/              réglages (APP), échappement HTML, boîtes de dialogue, sprites pixel art, utilitaires d'encodage vidéo
js/images/              onglet Images
  state.js              liste des images (un objet par image), sélection, état partagé
  undo.js               annulation (Ctrl/Cmd+Z)
  dims.js               formats, dimensions personnalisées par image
  autocrop.js           détection de visage / sujet
  render.js             dessin d'une image, miniatures
  gallery.js            galerie, sélection, menu contextuel
  import.js             import de fichiers, application des formats
  editor.js             fenêtre d'édition (zoom, ombre, flou, repères)
  export-dialog.js      fenêtre d'export
  export-images.js      export ZIP d'images
  export-slideshow.js   diaporama MP4
  gallery-shortcuts.js  raccourcis clavier de la galerie
js/video/               onglet Vidéos : import, analyse, liste, aperçu, réglages, export
js/ui/                  onglets, thème (pixel / classique), accessibilité, écran de chargement pixel art, détection WebCodecs, préférences
```

Bibliothèques (JSZip, face-api et son modèle, smartcrop, mp4-muxer) et police Inter hébergées dans `vendor/` : l'application ne fait aucune requête vers un service externe (ni CDN, ni Google Fonts). Détails et licences dans `vendor/README.md`.
