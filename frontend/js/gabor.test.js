import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { drawGaborPatch } from './gabor.js';
import { TEMPORARY_STANDARD_PATTERNS } from './standard-patterns.js';

function render(params, size = 2, pixelsPerDegree = 32) {
  const side = Math.ceil(size * pixelsPerDegree);
  const ctx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: image => { ctx.data = image.data; }
  };
  drawGaborPatch(ctx, side / 2, side / 2, size, params, pixelsPerDegree);
  return ctx.data;
}

function hash(data) { return createHash('sha256').update(data).digest('hex'); }

test('legacy renderer defaults are pixel-identical to the original NeuroVision commit', () => {
  // SHA256 fixtures rendered from HEAD:frontend/js/gabor.js at the upstream commit.
  assert.equal(hash(render({})), '2dc530c14f7a4b643d7b75094eda82b2255fc01b0a6188403dd4ea0e620bd48e');
  assert.equal(hash(render({ theta: Math.PI / 4, lambda: 0.4, psi: Math.PI,
    sigma: 0.28, gamma: 0.6, contrast: 0.93 })),
  'b291d756f4bb126f8ed170a05b247a68586141b05b721a42f84880f306401804');
});

test('all six patterns render six distinguishable images on their own RGB backgrounds', () => {
  for (const pattern of TEMPORARY_STANDARD_PATTERNS) {
    const hashes = new Set();
    for (const patch of pattern.patches) {
      const params = { ...patch, backgroundRGB: pattern.backgroundRGB,
        modulationAmplitude: patch.modulationAmplitude ?? pattern.modulationAmplitude };
      const data = render(params, patch.sizeInDegrees, pattern.pixelsPerDegree);
      hashes.add(hash(data));
      // The Gaussian has a small nonzero tail; do not alter the renderer to
      // force an artificial hard cutoff at the finite canvas boundary.
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(data[c] - pattern.backgroundRGB[c]) <= 3);
      assert.equal(data[3], 255);
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        min = Math.min(min, data[i]); max = Math.max(max, data[i]);
        assert.equal(data[i + 3], 255);
      }
      assert.ok(max - min > 50, 'Visible stimulus, not a flat background');
      if (pattern === TEMPORARY_STANDARD_PATTERNS[5]) {
        assert.ok(max > 130, 'Bright lobes remain visible on the dark background');
        assert.ok(data[0] < 25, 'The envelope fades back into the dark background');
      }
    }
    assert.equal(hashes.size, 6);
  }
});

test('contrast zero returns the configured flat RGB background without changing alpha', () => {
  const data = render({ backgroundRGB: [173, 231, 231], modulationAmplitude: 190, contrast: 0 });
  for (let i = 0; i < data.length; i += 4) assert.deepEqual([...data.slice(i, i + 4)], [173, 231, 231, 255]);
});

test('phase changes center polarity while retaining the Gaussian background at the edge', () => {
  const base = { lambda: 0.66, sigma: 0.29, gamma: 0.62, backgroundRGB: [18, 18, 20],
    modulationAmplitude: 230, contrast: 0.97 };
  const bright = render({ ...base, psi: 0 });
  const double = render({ ...base, psi: Math.PI });
  const center = (32 * 64 + 32) * 4;
  assert.ok(bright[center] > 230);
  assert.equal(double[center], 0);
  assert.deepEqual([...bright.slice(0, 3)], [18, 18, 20]);
  assert.deepEqual([...double.slice(0, 3)], [18, 18, 20]);
});
