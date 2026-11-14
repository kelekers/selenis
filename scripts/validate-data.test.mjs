import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateData } from './validate-data.mjs';

test('dataset gate rejects missing provenance, corruption and unregistered files', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'selenis-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'data'));
  await mkdir(path.join(root, 'textures'));
  const manifest = { schema_version: 1, status: 'scaffold', assets: [] };
  const save = () => writeFile(path.join(root, 'data/manifest.json'), JSON.stringify(manifest));
  await save();
  assert.equal(await validateData(root), 'scaffold');
  await assert.rejects(validateData(root, true), /required/);
  manifest.status = 'ready';
  await save();
  await assert.rejects(validateData(root), /empty/);
  const content = '{"test_fixture":true}';
  const asset = {
    path: 'data/test.json', source_url: 'https://example.org/test-fixture',
    dataset_id: 'TEST-ONLY', processing: 'Unit test fixture, not science data',
    units: 'none', reference_frame: 'none', retrieved_at: '2026-01-01T00:00:00Z',
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  manifest.assets.push(asset);
  await writeFile(path.join(root, asset.path), content);
  await save();
  assert.equal(await validateData(root, true), 'ready');
  const crlf = `${content}\r\n`;
  asset.sha256 = createHash('sha256').update(crlf).digest('hex');
  await writeFile(path.join(root, asset.path), crlf);
  await save();
  await assert.rejects(validateData(root), /must use LF/);
  asset.sha256 = createHash('sha256').update(content).digest('hex');
  await writeFile(path.join(root, asset.path), content);
  asset.processing = '';
  await save();
  await assert.rejects(validateData(root), /processing/);
  asset.processing = 'fixture';
  asset.path = 'data/../test.json';
  await save();
  await assert.rejects(validateData(root), /traversal/);
  asset.path = 'data/test.json';
  await save();
  await writeFile(path.join(root, asset.path), '{}');
  await assert.rejects(validateData(root), /Checksum/);
  await writeFile(path.join(root, asset.path), content);
  await writeFile(path.join(root, 'textures/unregistered.webp'), 'test');
  await assert.rejects(validateData(root), /Unregistered/);
});
