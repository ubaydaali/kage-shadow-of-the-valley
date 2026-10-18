import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await fs.mkdir('game/vendor/addons/loaders', { recursive: true });
await fs.mkdir('game/vendor/addons/utils', { recursive: true });
for (const name of ['three.core.js', 'three.module.js']) {
  await fs.copyFile(`node_modules/three/build/${name}`, `game/vendor/${name}`);
}
await fs.copyFile('node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'game/vendor/addons/loaders/GLTFLoader.js');
await fs.copyFile('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'game/vendor/addons/utils/BufferGeometryUtils.js');
await fs.copyFile('node_modules/three/LICENSE', 'game/vendor/LICENSE');
execFileSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' });
console.log('KAGE is ready. Run npm start to play, or serve the game/ directory as a static website.');
