import { test, expect } from 'bun:test';
import { initializeCanvas, writePsdUint8Array, readPsd } from 'ag-psd';
import { splitStages, differenceLayer, compositeLayers, comparePixels } from '../stage-core.js';

initializeCanvas(() => { throw new Error('Canvas is not needed in pixel-data tests'); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
const frame = (pixels, width = pixels.length) => ({ width, height: pixels.length / width, data: new Uint8ClampedArray(pixels.flat()) });

test('percent partitions cover every stroke exactly once, including small and empty drawings', () => {
  for (const n of [0, 1, 3, 9, 10, 11, 113]) {
    const groups = splitStages(Array.from({ length: n }));
    expect(groups.length).toBe(10);
    const visited = groups.flatMap(g => Array.from({ length: g.end - g.start }, (_, i) => i + g.start));
    expect(visited).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(groups.at(-1).name).toContain('90–100%');
  }
});

test('stage splits preserve contiguous drawing order, including repeated labels', () => {
  const groups = splitStages(['底色', '底色', '細節', '底色'].map(stageName => ({ stageName })), 'stages');
  expect(groups.map(g => [g.stageName, g.start, g.end])).toEqual([['底色', 0, 2], ['細節', 2, 3], ['底色', 3, 4]]);
});

test('overlapping watercolor checkpoints survive PSD with exact layers, names, offsets and merged image', () => {
  const paper = frame(Array(12).fill([250, 246, 238, 255]), 4);
  const first = frame(Array(12).fill([250, 246, 238, 255]), 4);
  first.data.set([209, 105, 99, 255], 5 * 4);
  const second = frame(Array.from({ length: 12 }, (_, i) => Array.from(first.data.slice(i * 4, i * 4 + 4))), 4);
  second.data.set([125, 133, 178, 255], 5 * 4); // A later translucent wash over existing paint.
  second.data.set([71, 89, 92, 255], 10 * 4);
  const layers = [{ name: '00 紙張', imageData: paper }, differenceLayer(paper, first, '01 0–10%'), differenceLayer(first, second, '02 細節點睛'), differenceLayer(second, second, '03 空階段')];
  expect(layers[1].left).toBe(1);
  expect(layers[1].top).toBe(1);
  expect(layers[1].imageData.width).toBe(1);
  expect(layers[2].changedPixels).toBe(2);
  expect(comparePixels(first, compositeLayers(4, 3, layers.slice(0, 2))).differentPixels).toBe(0);
  const bytes = writePsdUint8Array({ width: 4, height: 3, imageData: second, children: layers });
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('8BPS');
  const decoded = readPsd(bytes, { useImageData: true, skipThumbnail: true });
  expect(decoded.children.map(l => l.name)).toEqual(layers.map(l => l.name));
  expect(comparePixels(second, decoded.imageData).differentPixels).toBe(0);
  expect(comparePixels(second, compositeLayers(4, 3, decoded.children)).differentPixels).toBe(0);
  expect(comparePixels(first, compositeLayers(4, 3, decoded.children.slice(0, 2))).differentPixels).toBe(0);
});

test('mismatched or transparent references fail explicitly', () => {
  expect(() => differenceLayer(frame([[0, 0, 0, 255]]), frame([[0, 0, 0, 0]]), 'bad')).toThrow('opaque');
  expect(() => differenceLayer(frame([[0, 0, 0, 255]]), frame([[0, 0, 0, 255], [0, 0, 0, 255]]), 'bad')).toThrow('dimensions');
});
