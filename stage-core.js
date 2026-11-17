// Pure data helpers shared by the browser exporter and regression tests.
export function splitStages(items, mode = 'percent') {
  if (mode === 'stages' && items.length) {
    const result = [];
    items.forEach((item, index) => {
      const name = item.stageName || '描繪';
      const previous = result.at(-1);
      if (previous && previous.stageName === name) previous.end = index + 1;
      else result.push({ stageName: name, start: index, end: index + 1 });
    });
    return result.map((group, i) => ({ ...group, name: `${String(i + 1).padStart(2, '0')} ${group.stageName}` }));
  }
  return Array.from({ length: 10 }, (_, i) => ({
    name: `${String(i + 1).padStart(2, '0')} 描繪 ${i * 10}–${(i + 1) * 10}%`,
    start: Math.ceil(items.length * i / 10),
    end: Math.ceil(items.length * (i + 1) / 10)
  }));
}

// The reference is opaque (paper + rendered strokes). An opaque pixel patch at
// each changed location avoids re-blending translucent paint from earlier stages.
// Outside changed locations pixels are transparent. This gives exact checkpoints
// across normal-compositing editors, including their different rounding rules.
export function differenceLayer(previous, current, name) {
  const { width, height, data } = current;
  if (previous.width !== width || previous.height !== height || data.length !== width * height * 4 || previous.data.length !== data.length) {
    throw new Error('Stage dimensions do not match');
  }
  let left = width, top = height, right = 0, bottom = 0, changedPixels = 0;
  const changed = i => data[i] !== previous.data[i] || data[i + 1] !== previous.data[i + 1] || data[i + 2] !== previous.data[i + 2];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] !== 255 || previous.data[i + 3] !== 255) throw new Error('Stage reference must have opaque paper');
    if (!changed(i)) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    changedPixels++;
  }
  const layer = { name, blendMode: 'normal', opacity: 1, hidden: false, changedPixels };
  if (!changedPixels) return layer;
  const out = new Uint8ClampedArray((right - left) * (bottom - top) * 4);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const src = (y * width + x) * 4;
    if (changed(src)) out.set(data.subarray(src, src + 4), ((y - top) * (right - left) + x - left) * 4);
  }
  return { ...layer, left, top, right, bottom, imageData: { width: right - left, height: bottom - top, data: out } };
}

export function compositeLayers(width, height, layers) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const layer of layers) {
    if (!layer.imageData || layer.hidden) continue;
    const img = layer.imageData;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const src = (y * img.width + x) * 4;
      if (!img.data[src + 3]) continue;
      if (img.data[src + 3] !== 255) throw new Error('Expected exact opaque pixel patch');
      const tx = (layer.left || 0) + x, ty = (layer.top || 0) + y;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) throw new Error('Layer is outside the canvas');
      data.set(img.data.subarray(src, src + 4), (ty * width + tx) * 4);
    }
  }
  return { width, height, data };
}

export function comparePixels(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) throw new Error('Image dimensions do not match');
  let differentPixels = 0, maxChannelError = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let error = 0;
    for (let c = 0; c < 4; c++) error = Math.max(error, Math.abs(a.data[i + c] - b.data[i + c]));
    if (error) differentPixels++;
    maxChannelError = Math.max(maxChannelError, error);
  }
  return { differentPixels, maxChannelError };
}
