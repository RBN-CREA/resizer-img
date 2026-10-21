export const THUMB_MAX_W = 360;

export const THUMB_SOURCE_MAX = 720;

// Version réduite de l'image, décodée une seule fois puis réutilisée à chaque rafraîchissement de la galerie
export function getThumbSource(it) {
  if (!it.thumb) {
    it.thumb = (async () => {
      try {
        const bmp = await createImageBitmap(it.file);
        const k = Math.min(1, THUMB_SOURCE_MAX / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        return c;
      } catch (e) {
        console.warn('Miniature indisponible :', it.file.name, e);
        return null;
      }
    })();
  }
  return it.thumb;
}

export function computeDrawSize(dims, crop, isBlurPreset, img) {
  const imgAspect = img.width / img.height;
  const canvasAspect = dims.w / dims.h;
  const zoom = crop.zoom ?? 1;

  if (isBlurPreset) {
    const drawHeight = dims.h * zoom;
    return { drawWidth: drawHeight * imgAspect, drawHeight };
  }

  if (imgAspect > canvasAspect) {
    const drawHeight = dims.h * zoom;
    return { drawWidth: drawHeight * imgAspect, drawHeight };
  }

  const drawWidth = dims.w * zoom;
  return { drawWidth, drawHeight: drawWidth / imgAspect };
}

export function drawCheckerboardPattern(ctx, w, h) {
  const size = 16;
  ctx.save();
  for (let x = 0; x < w; x += size) {
    for (let y = 0; y < h; y += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#181822' : '#222233';
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.restore();
}

export function renderImage(ctx, img, dims, crop, shadow, blur, bgColor, isBlurPreset, drawCheckerboard = false, kenBurns = null) {
  ctx.save();

  if (kenBurns && (kenBurns.scale !== 1 || kenBurns.panX !== 0 || kenBurns.panY !== 0)) {
    ctx.translate(dims.w / 2 + kenBurns.panX, dims.h / 2 + kenBurns.panY);
    ctx.scale(kenBurns.scale, kenBurns.scale);
    ctx.translate(-dims.w / 2, -dims.h / 2);
  }

  if (bgColor && bgColor.enabled) {
    ctx.fillStyle = bgColor.color;
    ctx.fillRect(-dims.w, -dims.h, dims.w * 3, dims.h * 3);
  } else if (drawCheckerboard) {
    drawCheckerboardPattern(ctx, dims.w, dims.h);
  } else {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(-dims.w, -dims.h, dims.w * 3, dims.h * 3);
  }

  if (blur && blur.enabled) {
    drawBlurredBg(ctx, img, dims.w, dims.h, blur.intensity || 20, blur.bgZoom || 1.3);
  }

  const { drawWidth, drawHeight } = computeDrawSize(dims, crop, isBlurPreset, img);
  const x = dims.w / 2 + crop.offsetX - drawWidth / 2;
  const y = dims.h / 2 + crop.offsetY - drawHeight / 2;

  if (shadow && shadow.enabled && shadow.opacity > 0) {
    const rad = (shadow.direction * Math.PI) / 180;
    ctx.shadowColor = `rgba(0, 0, 0, ${shadow.opacity})`;
    ctx.shadowBlur = (blur && blur.enabled) ? 40 : 20;
    ctx.shadowOffsetX = Math.cos(rad) * shadow.distance;
    ctx.shadowOffsetY = Math.sin(rad) * shadow.distance;
  }
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
  
  ctx.restore();
}

export function drawBlurredBg(ctx, img, canvasW, canvasH, intensity, bgZoom = 1.3) {
  ctx.save();
  ctx.filter = `blur(${intensity}px) brightness(0.6)`;
  const imgRatio = img.width / img.height;
  const canvasRatio = canvasW / canvasH;
  let drawW, drawH;
  if (imgRatio < canvasRatio) { drawW = canvasW; drawH = canvasW / imgRatio; } 
  else { drawH = canvasH; drawW = canvasH * imgRatio; }
  ctx.translate(canvasW/2, canvasH/2);
  ctx.scale(bgZoom, bgZoom); 
  ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
  ctx.restore();
}
