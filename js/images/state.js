import { defaultShadow } from '../shared/config.js';

// État partagé entre les modules de l'onglet Images
export const S = {
  lastSelectedId: null,   // dernière vignette cliquée (Maj+clic)
  displayOrder: [],       // ids dans l'ordre d'affichage de la galerie
  editingId: null,        // image ouverte dans l'éditeur
  customW: 1920,          // dimensions du préréglage « Personnalisé » (champs du panneau)
  customH: 1080,
  isKenBurnsEnabled: false
};

// État unique des images : un objet par image, identifié par un id stable.
// { id, file, folder, preset, crop, shadow, blur, bgColor, customized }
export let items = [];

export const itemsById = new Map();

export let nextItemId = 1;

export const defaultCrop = (preset) => ({ zoom: preset === 'blur' ? 0.85 : 1, offsetX: 0, offsetY: 0, rawOffsetX: 0, rawOffsetY: 0, method: 'center' });

export const defaultBlur = (preset) => preset === 'blur'
  ? { enabled: true, intensity: 20, bgZoom: 1.3 }
  : { enabled: false, intensity: 10, bgZoom: 1.3 };

export const defaultBgColor = (preset) => ({ enabled: preset === 'une', color: '#ffffff' });

export function getItem(id) { return itemsById.get(id); }

export function addItem(file, folder, preset) {
  const item = {
    id: nextItemId++,
    file,
    folder: folder || 'Divers',
    preset,
    crop: defaultCrop(preset),
    shadow: defaultShadow(),
    blur: defaultBlur(preset),
    bgColor: defaultBgColor(preset),
    customDims: preset === 'custom' ? { w: S.customW, h: S.customH } : null,
    customized: false
  };
  items.push(item);
  itemsById.set(item.id, item);
  return item;
}

export function removeItems(ids) {
  items = items.filter(it => !ids.has(it.id));
  ids.forEach(id => itemsById.delete(id));
}

export function clearItems() {
  items = [];
  itemsById.clear();
}

// Sélection : ensemble d'ids (insensible aux suppressions / tris)
export const activeSelection = new Set();

export const editingItem = () => (S.editingId === null ? undefined : getItem(S.editingId));

// Remplace toute la liste d'images (utilisé par l'annulation)
export function restoreItems(snapshot) {
  items = snapshot;
  itemsById.clear();
  items.forEach(it => itemsById.set(it.id, it));
}
