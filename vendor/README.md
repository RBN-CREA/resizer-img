# Bibliothèques tierces hébergées

Ces fichiers sont copiés tels quels depuis leurs sources officielles, pour que l'application fonctionne sans réseau externe (aucun CDN, aucune police Google).

| Fichier | Projet | Version | Licence | Source |
|---|---|---|---|---|
| `jszip.min.js` | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT ou GPL-3.0 | cdnjs |
| `face-api.js` | [@vladmandic/face-api](https://github.com/vladmandic/face-api) | 1.7.15 | MIT | npm (jsDelivr) |
| `models/tiny_face_detector_model-*` | modèle Tiny Face Detector de face-api | 1.7.15 | MIT | npm (jsDelivr) |
| `smartcrop.js` | [smartcrop](https://github.com/jwagner/smartcrop.js) | 2.0.5 | MIT | npm (unpkg) |
| `mp4-muxer.js` | [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | 5.2.2 | MIT | npm (unpkg) |
| `fonts/inter-*.woff2` | [Inter](https://rsms.me/inter/) (variable, sous-ensembles latin et latin étendu) | 4.x | SIL Open Font License 1.1 | Google Fonts |

## Empreintes SHA-384

```
jszip.min.js   +mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG
face-api.js    M5nePoB6/w/a9JhtegEibSLGiJy/+QMZZMfvcxjWVCQW/HPwrQ7i21V/Px/8AyVA
smartcrop.js   fmGdARkBhudeaINzLQk8ABdsdI3AK++OtxbPyiSEW7+QldWLexH87+KBnd6O+IET
mp4-muxer.js   wr0AQH9RBAKio/g7bHM5245MBCU5B/b0Y9u42cTxRYQQJXKEijZvWEJKL9JG26hs
```

## Mettre à jour une bibliothèque

Télécharger la nouvelle version au même emplacement, tester l'application, puis mettre à jour ce tableau. Les polices exclues (cyrillique, grec, vietnamien) peuvent être ajoutées dans `css/fonts.css` si l'interface doit un jour les afficher.
