import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRenderFailure, detectWebGL2, maxRenderDpr, stepDpr } from '../src/utils/renderQuality.js';

const fakeWin = (extra = {}) => ({ document: { createElement: () => ({}) }, ...extra });

test('WebGL 2 API detection: present, missing (WebGL 1 only), no DOM — never creates a context', () => {
  let created = 0;
  const win = fakeWin({
    WebGL2RenderingContext: function WebGL2RenderingContext() {},
    document: { createElement: () => { created += 1; return {}; } },
  });
  assert.deepEqual(detectWebGL2(win), { supported: true, reason: null });
  assert.equal(created, 0, 'no probe canvas/context is created');

  const webgl1Only = detectWebGL2(fakeWin({ WebGLRenderingContext: function WebGLRenderingContext() {} }));
  assert.equal(webgl1Only.supported, false, 'WebGL 1 is not enough for three r187');
  assert.match(webgl1Only.reason, /WebGL 2/);

  assert.equal(detectWebGL2(undefined).supported, false);
  assert.equal(detectWebGL2({}).supported, false);
});

test('render DPR: capped at 2, never below 1, invalid → 1', () => {
  assert.equal(maxRenderDpr(3), 2);
  assert.equal(maxRenderDpr(1.25), 1.25);
  assert.equal(maxRenderDpr(0.5), 1);
  assert.equal(maxRenderDpr(undefined), 1);
  assert.equal(maxRenderDpr(NaN), 1);
});

test('adaptive DPR steps stay within [1, max] (no oscillation past bounds)', () => {
  assert.equal(stepDpr(2, -1, 2), 1.5);
  assert.equal(stepDpr(1.5, -1, 2), 1);
  assert.equal(stepDpr(1, -1, 2), 1, 'floor');
  assert.equal(stepDpr(1, +1, 2), 1.5);
  assert.equal(stepDpr(2, +1, 2), 2, 'ceiling');
  assert.equal(stepDpr(1.25, +1, 1.25), 1.25, 'device max below one step');
  assert.equal(stepDpr(NaN, +1, 2), 1.5);
  assert.equal(stepDpr(2, -1, undefined), 1);
});

test('render failure text', () => {
  assert.match(describeRenderFailure(new Error('Error creating WebGL context.')), /Konteks WebGL/);
  assert.match(describeRenderFailure(new Error('boom')), /boom/);
  assert.match(describeRenderFailure(null), /tidak diketahui/);
});
