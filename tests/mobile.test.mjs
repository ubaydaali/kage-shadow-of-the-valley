import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let server, browser;
let base = process.env.GAME_URL;
const errors = [], results = [];
await fs.mkdir('qa-output', { recursive: true });

async function openGame({ width = 844, height = 390, mobile = true, seed, portraitStart = false } = {}) {
  if(portraitStart){width=390;height=844;}
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
  if (seed) await context.addInitScript(data => localStorage.setItem('kage-valley-v1', JSON.stringify(data)), { version: 1, cleared: [false, false, false], bossDefeated: false, kills: 0, essence: 0, potions: 1, position: { x: 0, z: 18 }, ...seed });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#play').disabled, null, { timeout: 60000 });
  await page.evaluate(async () => { window.readGame = (await import('./main.js')).inspectGame; });
  await page.evaluate(()=>{window.touchLog=[];for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>window.touchLog.push({type,id:e.pointerId,target:e.target.id||e.target.closest('[data-action]')?.dataset.action}),true);});
  if(portraitStart){
    assert.equal(await page.locator('#orientation-gate').isVisible(),true,'Portrait launch asks the player to rotate');
    await page.locator('#play').evaluate(e=>e.click());
    assert.equal(await page.evaluate(()=>window.readGame().mode),'menu','Portrait cannot start the game');
    await page.screenshot({path:'qa-output/phone-portrait-gate.png',scale:'css'});
    await page.setViewportSize({width:844,height:390});
    await page.locator('#orientation-gate').waitFor({state:'hidden'});
  }
  if (mobile) await page.screenshot({ path: 'qa-output/phone-menu.png', scale: 'css' });
  if (mobile) await page.locator('#play').tap(); else await page.locator('#play').click();
  const snap = () => page.evaluate(() => window.readGame());
  const wait = async seconds => {
    const start = await snap();
    await page.waitForFunction(time => window.readGame().time >= time || window.readGame().mode !== 'playing', start.time + seconds, { timeout: 90000 });
  };
  const session = await context.newCDPSession(page);
  const points = new Map();
  const send = type => session.send('Input.dispatchTouchEvent', { type, touchPoints: [...points].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 3, radiusY: 3, force: 1 })) });
  const touch = {
    async down(id, x, y) { points.set(id, { x, y }); await send('touchStart'); },
    async move(id, x, y) { assert.ok(points.has(id)); points.set(id, { x, y }); await send('touchMove'); },
    async up(id) { const p=points.get(id);points.delete(id);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,x:p.x,y:p.y,radiusX:3,radiusY:3,force:0}]}); },
    async cancel() { points.clear(); await send('touchCancel'); },
    async tap(selector, id = 9) { const r = await page.locator(selector).boundingBox(); assert.ok(r, selector); await this.down(id, r.x + r.width / 2, r.y + r.height / 2); await this.up(id); },
  };
  return { context, page, snap, wait, touch };
}

async function checkLayout(page, label) {
  const issues = await page.evaluate(() => {
    const selectors = ['#joystick', '#touch-sprint', '[data-action="block"]', '[data-action="jump"]', '[data-action="dodge"]', '[data-action="special"]', '[data-action="attack"]', '[data-action="heal"]', '#pause', '#sound', '#interact'];
    const items = selectors.map(selector => ({ selector, element: document.querySelector(selector) })).filter(({ element }) => element && element.getClientRects().length);
    const problems = [];
    for (const item of items) {
      const r = item.element.getBoundingClientRect();
      if (r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) problems.push(`${item.selector} outside viewport`);
      if (r.width < 44 || r.height < 44) problems.push(`${item.selector} smaller than 44px`);
      if (!item.element.disabled) {
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!item.element.contains(hit)) problems.push(`${item.selector} is covered`);
      }
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].element.getBoundingClientRect(), b = items[j].element.getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) problems.push(`${items[i].selector} overlaps ${items[j].selector}`);
    }
    if (document.documentElement.scrollWidth > innerWidth) problems.push('Page overflows horizontally');
    return problems;
  });
  assert.deepEqual(issues, [], label);
}

try {
  if (!base) {
    server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview server did not start')), 10000);
      server.stdout.on('data', data => { const match = data.toString().match(/Local: (http:\/\/localhost:\d+)/); if (match) { clearTimeout(timer); resolve(match[1].replace('localhost', '127.0.0.1') + '/'); } });
      server.once('error', error => { clearTimeout(timer); reject(error); });
    });
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
  const g = await openGame({ seed: { potions: 1 },portraitStart:true });
  const { page, snap, wait, touch } = g;
  assert.equal((await snap()).controls.touch, true);
  assert.equal((await snap()).quality, 'low', 'Phones start with light graphics');
  assert.equal((await snap()).pixelRatio, 1, 'High-DPI phone rendering stays bounded');
  await wait(.2);
  await page.locator('#interact').waitFor({ state: 'visible' });
  await touch.tap('#interact');
  assert.equal((await snap()).potions, 3, 'Touch shrine rest replenishes potions');
  await checkLayout(page, '844×390 landscape');

  const stick = await page.locator('#joystick').boundingBox(), sx = stick.x + stick.width / 2, sy = stick.y + stick.height / 2;
  const initial = await snap();
  await touch.down(1, sx, sy); await touch.move(1, sx, sy - 38); await wait(.8);
  assert.ok((await snap()).player.z < initial.player.z - 2, 'Joystick moves the character');
  await touch.tap('#touch-sprint', 2); await wait(.6);
  const sprinting=await snap();assert.ok(sprinting.sprint && sprinting.speed > 6, 'Sprint toggle accelerates movement: '+JSON.stringify({sprint:sprinting.sprint,speed:sprinting.speed,move:sprinting.controls.move,mode:sprinting.mode,events:await page.evaluate(()=>window.touchLog)}));
  const yaw = (await snap()).controls.yaw;
  await touch.down(3, 230, 360); await touch.move(3, 270, 375);
  await wait(.1);const turned=await snap();assert.ok(Math.abs(turned.controls.yaw - yaw) > .1, 'Camera turns while moving: '+JSON.stringify({before:yaw,after:turned.controls.yaw,events:await page.evaluate(()=>window.touchLog)}));
  await touch.tap('[data-action="attack"]', 4);
  assert.ok((await snap()).attack > 0, 'Third-finger attack works during movement and camera drag');
  await touch.up(3);
  assert.ok(Math.abs((await snap()).controls.move.y) > .9, 'Releasing camera/attack fingers preserves joystick');
  await touch.cancel(); await wait(.6);
  assert.equal((await snap()).controls.move.y, 0, 'Cancelled joystick stops moving');

  await touch.down(5, 200, 340); await touch.down(6, 270, 340);
  const beforeZoom = (await snap()).controls.zoom;
  await touch.move(6, 310, 340);
  assert.ok((await snap()).controls.zoom < beforeZoom, 'Pinch zoom changes camera distance');
  await touch.cancel();
  await touch.tap('#touch-sprint');
  await touch.tap('[data-action="jump"]'); await wait(.2);
  assert.ok((await snap()).air > .3, 'Touch jump leaves ground'); await wait(.9);
  await touch.tap('[data-action="dodge"]'); await wait(.15);
  assert.ok((await snap()).dodge > 0, 'Touch dodge activates'); await wait(.55);
  const block = await page.locator('[data-action="block"]').boundingBox();
  await touch.down(7, block.x + block.width / 2, block.y + block.height / 2); await wait(.1);
  assert.equal((await snap()).block, true, 'Holding shield blocks');
  await touch.cancel(); await wait(.1);
  assert.equal((await snap()).block, false, 'Cancelled shield releases block');

  await page.locator('#pause').tap();
  assert.equal((await snap()).mode, 'paused');
  assert.equal((await snap()).sprint, false, 'Pause clears toggled sprint');
  await page.waitForTimeout(200); const pausedFrame = (await snap()).render.frame;
  await page.waitForTimeout(200); assert.equal((await snap()).render.frame, pausedFrame, 'Pause stops GPU rendering');
  await page.locator('#resume').tap();
  await touch.tap('[data-action="attack"]'); assert.ok((await snap()).attack > 0, 'Buttons work again after reset'); await wait(.8);
  const special = await page.locator('[data-action="special"]').boundingBox();
  await touch.down(8, special.x + special.width / 2, special.y + special.height / 2); await wait(.2); await touch.up(8); await wait(.15);
  assert.ok((await snap()).specialCooldown > 9, 'Special button activates cooldown');
  assert.equal(await page.locator('[data-action="special"]').evaluate(e => e.classList.contains('is-pressed')), false, 'Cooldown button releases cleanly');
  results.push({ test: 'multi-touch movement, camera, pinch, attack, sprint, jump, dodge, block, rest, special and pause', passed: true });
  console.log('PASS: multi-touch gameplay');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#orientation-gate').waitFor({state:'visible'});
  assert.equal((await snap()).mode,'paused','Rotating upright pauses the game');
  const portraitTime=(await snap()).time;await page.waitForTimeout(250);assert.equal((await snap()).time,portraitTime,'Portrait stops simulation');
  await page.locator('#resume').evaluate(e=>e.click());assert.equal((await snap()).mode,'paused','Portrait cannot resume');
  await page.setViewportSize({width:844,height:390});await page.locator('#orientation-gate').waitFor({state:'hidden'});await page.locator('#resume').tap();
  results.push({test:'landscape-only launch, portrait pause, and landscape resume',passed:true});
  await g.context.close();

  const layouts=await openGame({seed:{potions:1}});
  await layouts.page.locator('#interact').waitFor({state:'visible'});
  for (const [width, height] of [[568, 320], [640, 360], [740, 360], [844, 390], [932, 430]]) {
    await layouts.page.setViewportSize({ width, height }); await layouts.wait(.15);
    await checkLayout(layouts.page, `${width}×${height}`);
    await layouts.page.screenshot({ path: `qa-output/phone-${width}x${height}.png`, scale: 'css' });
  }
  results.push({ test: 'five landscape layouts, reachable controls and no overlapping buttons', passed: true });
  console.log('PASS: mobile layouts');
  await layouts.context.close();

  const combat = await openGame({ width: 844, height: 390, seed: { potions: 3, position: { x: -31, z: -9 } } });
  await combat.page.waitForFunction(() => window.readGame().health <= 85 || window.readGame().mode !== 'playing', null, { timeout: 90000 });
  const hurt = await combat.snap(); assert.equal(hurt.mode, 'playing');
  await combat.touch.tap('[data-action="heal"]');
  const healed = await combat.snap(); assert.ok(healed.health > hurt.health, 'Touch potion heals battle damage'); assert.equal(healed.potions, hurt.potions - 1);
  await combat.touch.tap('[data-action="special"]');
  for (let i = 0; i < 12; i++) { await combat.touch.tap('[data-action="attack"]'); await combat.wait(.55); if ((await combat.snap()).cleared[0]) break; }
  assert.equal((await combat.snap()).cleared[0], true, 'Camp can be liberated entirely with touch controls');
  results.push({ test: 'enemy combat, touch healing and camp liberation', passed: true });
  console.log('PASS: touch combat'); await combat.context.close();

  const desktop = await openGame({ width: 1280, height: 800, mobile: false });
  assert.equal(await desktop.page.locator('#touch').isVisible(), false, 'Desktop HUD retains keyboard controls');
  const start = await desktop.snap(); await desktop.page.keyboard.down('w'); await desktop.wait(.8); await desktop.page.keyboard.up('w');
  assert.ok((await desktop.snap()).player.z < start.player.z - 2, 'Desktop movement is unchanged');
  await desktop.page.keyboard.press('j'); assert.ok((await desktop.snap()).attack > 0, 'Desktop keyboard attack still works');
  await desktop.page.screenshot({ path: 'qa-output/desktop.png', scale: 'css' });
  results.push({ test: 'desktop controls preserved', passed: true }); await desktop.context.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await fs.writeFile('qa-output/mobile-results.json', JSON.stringify({ passed: true, results, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, results, errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error.stack, results, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) { server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); }); }
}
