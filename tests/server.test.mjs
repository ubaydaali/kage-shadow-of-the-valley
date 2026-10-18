import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('game can be hosted on a configured port from any working directory', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], {
    cwd: tmpdir(), env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start: ${stderr}`)), 10000);
      child.stdout.on('data', data => {
        const match = data.toString().match(/Local: (http:\/\/localhost:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1].replace('localhost', '127.0.0.1')); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${stderr}`)); });
    });
    for (const file of ['/', '/main.js', '/mobile-controls.js', '/mobile.css', '/vendor/three.module.js']) {
      const response = await fetch(base + file);
      assert.equal(response.status, 200, file);
      if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
      await response.arrayBuffer();
    }
    const model = await fetch(base + '/assets/ninja.glb');
    assert.equal(model.status, 200);
    const bytes = new Uint8Array(await model.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'glTF');
    const head = await fetch(base + '/mobile.css', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(base + '/main.js', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/..%2fLICENSE')).status, 403);
    assert.equal((await fetch(base + '/missing.js')).status, 404);
  } finally {
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  }
});
