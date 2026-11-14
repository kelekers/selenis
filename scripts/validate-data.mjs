import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export async function validateData(root = 'public', required = false) {
  const base = await realpath(root);
  const manifest = JSON.parse(await readFile(path.join(base, 'data/manifest.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1, 'Unsupported manifest version');
  assert(['scaffold', 'ready'].includes(manifest.status), 'Invalid dataset status');
  assert(Array.isArray(manifest.assets), 'assets must be an array');
  assert(!required || manifest.status === 'ready', 'Scientific dataset is required for release');
  assert(manifest.status !== 'ready' || manifest.assets.length > 0, 'Ready dataset cannot be empty');
  assert(manifest.status !== 'scaffold' || manifest.assets.length === 0, 'Scaffold must have no assets');
  const listed = new Set();
  let total = 0;
  for (const asset of manifest.assets) {
    assert(typeof asset.path === 'string' && /^(data|textures)\/[\w./-]+\.(json|webp)$/.test(asset.path), 'Invalid asset path');
    assert(!asset.path.split('/').includes('..'), 'Path traversal is forbidden');
    assert(asset.path !== 'data/manifest.json' && !listed.has(asset.path), 'Duplicate/reserved asset');
    listed.add(asset.path);
    assert(typeof asset.source_url === 'string' && new URL(asset.source_url).protocol === 'https:', 'HTTPS source required');
    for (const field of ['dataset_id', 'processing', 'units', 'reference_frame']) {
      assert(typeof asset[field] === 'string' && asset[field].trim(), `Missing ${field}`);
    }
    assert(typeof asset.retrieved_at === 'string' && asset.retrieved_at.endsWith('Z') && Number.isFinite(Date.parse(asset.retrieved_at)), 'UTC retrieval date required');
    assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'SHA-256 required');
    const filename = await realpath(path.join(base, asset.path));
    assert(filename.startsWith(base + path.sep), 'Asset escapes public directory');
    const info = await stat(filename);
    assert(info.isFile() && info.size > 0 && info.size <= 10 * 1024 * 1024, 'Asset must be 1 byte to 10 MiB');
    total += info.size;
    const bytes = await readFile(filename);
    if (asset.path.endsWith('.json')) {
      assert(!bytes.includes(Buffer.from('\r\n')), `JSON must use LF line endings: ${asset.path}`);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Checksum mismatch: ${asset.path}`);
    if (asset.path.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
  }
  assert(total <= 50 * 1024 * 1024, 'Dataset exceeds 50 MiB budget');
  for (const folder of ['data', 'textures']) {
    for (const entry of await readdir(path.join(base, folder), { recursive: true, withFileTypes: true })) {
      if (entry.isDirectory() || entry.name === '.gitkeep') continue;
      const relative = path.relative(base, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      assert(relative === 'data/manifest.json' || listed.has(relative), `Unregistered public asset: ${relative}`);
    }
  }
  return manifest.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const status = await validateData('public', process.env.REQUIRE_SCIENCE_DATA === 'true');
    console.log(`Dataset validation passed (${status}). Scientific correctness requires review by the data team.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
