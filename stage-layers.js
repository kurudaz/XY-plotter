import { writePsdUint8Array, readPsd } from 'ag-psd';
import { splitStages, differenceLayer, compositeLayers, comparePixels } from './stage-core.js';

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
let getScene, busy = false, generation = 0, readyKey = '', failedKey = '', queuedKey = '';
let prepared = null;
const urls = [];
const el = id => document.getElementById(id);
const status = message => { el('stage-status').textContent = message; };

function clearDownloads() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.length = 0;
  prepared = null;
  el('stage-downloads').hidden = true;
  el('stage-list').replaceChildren();
}

function snapshotKey(scene) {
  const p = scene.params;
  return JSON.stringify([scene.revision, scene.mode, scene.width, scene.height,
    p.penWidth, p.inkColor, p.fillColor, p.lineBrush, p.fillBrush, p.paper, p.wcGrain,
    el('stage-split').value]);
}

function frameFromGraphics(scene, graphics, target) {
  const ctx = target.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = scene.paper;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.drawImage(graphics.canvas, 0, 0);
  if (scene.mode === 'watercolor' && scene.params.wcGrain > 0) {
    // Exactly the same fixed paper grain as the live p5 canvas, drawn on top.
    ctx.fillStyle = `rgba(180,165,140,${scene.params.wcGrain / 255})`;
    for (let g = 0; g < 180; g++) ctx.fillRect(scene.random(g, 1, 11) * scene.width, scene.random(g, 2, 17) * scene.height, 2, 2);
  }
  return ctx.getImageData(0, 0, scene.width, scene.height);
}

function downloadLink(id, blob, filename) {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  el(id).href = url;
  el(id).download = filename;
}

async function prepare(scene, key) {
  const token = ++generation;
  busy = true;
  queuedKey = key;
  clearDownloads();
  let pg;
  const current = () => token === generation && key === snapshotKey(getScene()) && !getScene().processing;
  try {
    status('正在整理各階段圖層…');
    const { width, height, params } = scene;
    pg = scene.p5.createGraphics(width, height);
    pg.pixelDensity(1);
    pg.clear();
    pg.noFill();
    pg.strokeCap(scene.p5.ROUND);
    pg.strokeJoin(scene.p5.ROUND);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    let previous = frameFromGraphics(scene, pg, canvas);
    const layers = [{ name: '00 紙張底色與紋理', left: 0, top: 0, blendMode: 'normal', imageData: previous }];
    const items = scene.mode === 'watercolor' ? scene.watercolor : scene.polylines;
    const mode = scene.mode === 'watercolor' ? el('stage-split').value : 'percent';
    const groups = splitStages(items, mode);
    const checkpoints = [];
    let replayComparison = null;
    const hasOverlay = scene.mode === 'watercolor' && scene.polylines.length > 0;
    const saveStage = (name, start, end, final = false) => {
      let frame = frameFromGraphics(scene, pg, canvas);
      if (final) {
        // Canvas implementations can round batched translucent paint differently
        // from the frame-by-frame live canvas (GPU flushes/readback). The last
        // incremental layer must reach the actual live result, not an approximation.
        const replay = frame;
        frame = frameFromGraphics(scene, scene.completed, canvas);
        replayComparison = comparePixels(replay, frame);
      }
      const layer = differenceLayer(previous, frame, name);
      layers.push(layer);
      checkpoints.push({ name, start, end, changedPixels: layer.changedPixels });
      previous = frame;
    };
    let lastYield = performance.now();
    for (const group of groups) {
      for (let i = group.start; i < group.end; i++) {
        if (scene.mode === 'watercolor') scene.drawWatercolor(pg, items[i]);
        else {
          for (let point = 0; point < items[i].pts.length - 1; point++) {
            scene.drawLine(pg, items[i], i, point, params);
          }
        }
        if (performance.now() - lastYield > 20) {
          await pause();
          if (!current()) return;
          lastYield = performance.now();
        }
      }
      saveStage(group.name, group.start, group.end, group === groups.at(-1) && !hasOverlay);
      status(`正在保存 ${group.name}…`);
      await pause();
      if (!current()) return;
    }
    if (scene.mode === 'watercolor' && scene.polylines.length) {
      for (let i = 0; i < scene.polylines.length; i++) {
        const poly = scene.polylines[i];
        for (let j = 0; j < poly.pts.length - 1; j++) scene.drawLine(pg, poly, i, j, params);
        if (performance.now() - lastYield > 20) {
          await pause();
          if (!current()) return;
          lastYield = performance.now();
        }
      }
      saveStage(`${String(groups.length + 1).padStart(2, '0')} 淡彩線稿輪廓`, 0, scene.polylines.length, true);
    }
    const reference = previous;
    const composite = compositeLayers(width, height, layers);
    const comparison = comparePixels(reference, composite);
    if (comparison.differentPixels) throw new Error('圖層疊合驗證失敗');
    // Compare to the live renderer separately (no travel/head overlays).
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = width; previewCanvas.height = height;
    const previewComparison = comparePixels(reference, frameFromGraphics(scene, scene.completed, previewCanvas));
    if (previewComparison.differentPixels) throw new Error('與目前預覽不一致，請重新轉換後再匯出');
    status('正在寫入並驗證 PSD…');
    await pause();
    if (!current()) return;
    const bytes = writePsdUint8Array({ width, height, channels: 3, bitsPerChannel: 8,
      colorMode: 3, imageData: reference, children: layers,
      imageResources: { resolutionInfo: { horizontalResolution: 72, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: 72, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } }
    });
    // Decode the actual PSD, not just its merged preview, and re-compose its layers.
    const decoded = readPsd(bytes, { useImageData: true, skipThumbnail: true });
    const roundTrip = comparePixels(reference, compositeLayers(width, height, decoded.children || []));
    if (roundTrip.differentPixels || comparePixels(reference, decoded.imageData).differentPixels) throw new Error('PSD 重新讀取驗證失敗');
    if (!current()) return;
    const stem = `xy-${scene.mode}-${mode}`;
    downloadLink('stage-psd', new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), `${stem}.psd`);
    const png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 編碼失敗')), 'image/png'));
    if (!current()) { clearDownloads(); return; }
    downloadLink('stage-png', png, `${stem}-final.png`);
    const report = { format: 'xy-plotter-stage-psd', version: 1, mode: scene.mode, split: mode,
      width, height, layerCount: layers.length, representation: 'opaque-changed-pixels-on-transparent',
      comparison, previewComparison, roundTrip, replayComparison, checkpoints, params,
      note: '每層只保存本階段改變的像素；顏色含當時底層混合。由下往上依序顯示可精準還原進度，不是獨立透明顏料。'
    };
    downloadLink('stage-report', new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${stem}-verification.json`);
    for (const layer of [...layers].reverse()) {
      const li = document.createElement('li');
      li.textContent = layer.name + (layer.changedPixels === 0 ? '（此段無新增像素）' : '');
      el('stage-list').append(li);
    }
    prepared = report;
    readyKey = key;
    el('stage-downloads').hidden = false;
    status(`完成：${layers.length} 個圖層，PSD 讀回疊合與最終畫面逐像素一致。`);
  } catch (error) {
    if (current()) {
      clearDownloads();
      failedKey = key;
      status(`匯出失敗：${error.message || error}。可按「重新整理圖層」重試。`);
    }
  } finally {
    if (pg) pg.remove();
    busy = false;
    queuedKey = '';
  }
}

window.stageLayerExport = {
  install(options) {
    getScene = options.getScene;
    el('stage-split').addEventListener('change', () => this.invalidate());
    el('stage-auto').addEventListener('change', () => this.invalidate());
    el('stage-refresh').addEventListener('click', () => {
      this.invalidate();
      if (!getScene().done) status('請等待描繪完成，或按「立即完成」。');
      else this.tick(true);
    });
  },
  invalidate() {
    generation++;
    readyKey = ''; failedKey = '';
    clearDownloads();
    status('完成描繪後，自動整理成 PSD 圖層。');
  },
  tick(force = false) {
    if (!getScene) return;
    const scene = getScene();
    const key = snapshotKey(scene);
    if ((readyKey && readyKey !== key) || (queuedKey && queuedKey !== key)) this.invalidate();
    if (!scene.done || scene.processing || busy || readyKey === key || failedKey === key) return;
    if (force || el('stage-auto').checked) void prepare(scene, key);
  },
  get report() { return prepared; }
};
