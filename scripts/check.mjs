import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

for (const name of ['main', 'world', 'character', 'audio', 'mobile-controls']) {
  execFileSync(process.execPath, ['--check', `game/${name}.js`], { stdio: 'inherit' });
}
for (const file of ['game/index.html', 'game/style.css', 'game/mobile.css', 'game/assets/ninja.glb', 'game/vendor/three.core.js', 'game/vendor/three.module.js', 'game/vendor/addons/loaders/GLTFLoader.js', 'game/vendor/addons/utils/BufferGeometryUtils.js', 'game/vendor/LICENSE']) {
  await fs.access(file);
}
console.log('JavaScript syntax and required game files verified.');
