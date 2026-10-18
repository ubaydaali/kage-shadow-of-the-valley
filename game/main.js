import * as THREE from 'three';
import { createWorld, heightAt, CAMPS, SHRINES, TEMPLE, WORLD_RADIUS } from './world.js';
import { loadNinja, createFighter } from './character.js';
import { GameAudio } from './audio.js';

const $=id=>document.getElementById(id);
const canvas=$('game');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(error){$('play-label').textContent='المتصفح لا يدعم WebGL';$('loading-label').textContent='افتح اللعبة في متصفح حديث مع تفعيل تسريع الرسوم.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x9eafa0,.009);
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,520);
scene.add(new THREE.HemisphereLight(0xd1e4da,0x45573c,2.1));
const sunlight=new THREE.DirectionalLight(0xffe3ad,3.6);sunlight.position.set(-35,65,-45);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-38;sunlight.shadow.camera.right=38;sunlight.shadow.camera.top=38;sunlight.shadow.camera.bottom=-38;sunlight.shadow.camera.near=1;sunlight.shadow.camera.far=160;sunlight.shadow.bias=-.00035;sunlight.shadow.normalBias=.08;scene.add(sunlight,sunlight.target);
const world=createWorld(scene);
const audio=new GameAudio();
const keys=new Set();const pointer={down:false,x:0,y:0,moved:0,button:0};
const up=new THREE.Vector3(0,1,0),moveVector=new THREE.Vector3(),camTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),temp=new THREE.Vector3();
const clock=new THREE.Clock();
let elapsed=0,mode='loading',player,hero,ready=false,yaw=0,pitch=.22,zoom=6.2,sensitivity=1,shake=0,hitStop=0;
let enemies=[],effects=[],pickups=[],cleared=[false,false,false],bossAwake=false,bossDefeated=false,kills=0,essence=0,potions=3;
let attackBuffer=0,comboIndex=0,lastAttack=-10,specialCooldown=0,blockStarted=-10;
let zoneTimer=0,messageTimer=0,hurtTimer=0,comboTimer=0,saveTimer=0,aiTimer=0,helpFrom='menu',currentZone='',victoryShown=false;
const touchMove={x:0,y:0};let lastHud=0;
const SAVE_KEY='kage-valley-v1';
const state={health:100,stamina:100,vy:0,air:0,speed:0,attack:0,attackDuration:.5,attackHit:false,dodge:0,dodgeDir:new THREE.Vector3(),special:0,invulnerable:0,block:false,dead:false};
const raycaster=new THREE.Raycaster();const mapCtx=$('map').getContext('2d');
let saved=null;try{saved=JSON.parse(localStorage.getItem(SAVE_KEY));}catch{}

function toast(message,duration=3){$('message').textContent=message;$('message').style.opacity=1;messageTimer=duration;}
function discover(name){if(name===currentZone)return;currentZone=name;$('zone').querySelector('h2').textContent=name;$('zone').style.opacity=1;zoneTimer=3.5;}
function save(){
  if(!player)return;
  const data={version:1,cleared,bossDefeated,kills,essence,potions,position:{x:player.position.x,z:player.position.z}};
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(data));$('save-status').textContent='تم حفظ الرحلة';}catch{$('save-status').textContent='الحفظ غير متاح في هذا المتصفح';}
}
function resetSave(){try{localStorage.removeItem(SAVE_KEY);}catch{}location.reload();}
function setMode(next){mode=next;keys.clear();touchMove.x=touchMove.y=0;state.block=false;pointer.down=false;if(document.pointerLockElement&&next!=='playing')document.exitPointerLock();}
function pause(){if(mode==='playing'){setMode('paused');$('pause-menu').classList.remove('hidden');}else if(mode==='paused')resume();}
function resume(){$('pause-menu').classList.add('hidden');$('help').classList.add('hidden');setMode('playing');audio.init();}
function showHelp(){helpFrom=mode;if(mode==='playing')setMode('paused');$('help').classList.remove('hidden');}
function closeHelp(){$('help').classList.add('hidden');if(helpFrom==='playing')resume();}

function setQuality(value){const low=value==='low';renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.7));renderer.shadowMap.enabled=!low;world.grassMesh.visible=!low;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}
function toggleSound(){audio.enabled=!audio.enabled;$('sound').textContent=audio.enabled?'♪':'♩';$('sound').style.opacity=audio.enabled?'1':'.45';$('audio-enabled').checked=audio.enabled;if(audio.enabled)audio.init();}
$('quality').addEventListener('change',e=>setQuality(e.target.value));$('sensitivity').addEventListener('input',e=>sensitivity=+e.target.value);
$('sound').addEventListener('click',toggleSound);$('audio-enabled').addEventListener('change',e=>{audio.enabled=e.target.checked;$('sound').style.opacity=audio.enabled?'1':'.45';});
$('pause').addEventListener('click',pause);$('brand').addEventListener('click',e=>{e.preventDefault();pause();});$('resume').addEventListener('click',resume);$('controls-button').addEventListener('click',showHelp);$('help-pause').addEventListener('click',showHelp);$('close-help').addEventListener('click',closeHelp);
$('reset').addEventListener('click',()=>{if($('reset').dataset.confirm==='yes')resetSave();else{$('reset').textContent='اضغط مرة أخرى لمسح التقدم والبدء';$('reset').dataset.confirm='yes';}});

function playerGround(x,z){if((Math.abs(x)<1.85||Math.abs(x-34)<1.85)&&Math.abs(z+51)<5.2){return .2+Math.cos((z+51)/5.2*Math.PI/2)*.6;}return heightAt(x,z);}
function resolvePosition(position,delta,radius=.38){
  const nx=position.x+delta.x,nz=position.z+delta.z;
  position.x=nx;position.z=nz;
  for(const c of world.colliders){const dx=position.x-c.x,dz=position.z-c.z,d=Math.hypot(dx,dz),r=c.r+radius;if(d<r&&d>.0001){position.x=c.x+dx/d*r;position.z=c.z+dz/d*r;}}
  if(!bossAwake&&!bossDefeated&&position.z<-97&&Math.abs(position.x)<8)position.z=-97;
  const distance=Math.hypot(position.x,position.z+35);if(distance>WORLD_RADIUS){position.x=position.x/distance*WORLD_RADIUS;position.z=(position.z+35)/distance*WORLD_RADIUS-35;}
}
function faceToward(root,x,z,dt,speed=14){const angle=Math.atan2(-x,-z);let delta=THREE.MathUtils.euclideanModulo(angle-root.rotation.y+Math.PI,Math.PI*2)-Math.PI;root.rotation.y+=delta*Math.min(1,dt*speed);}
function closestEnemy(max=5){let closest=null,distance=max;for(const e of enemies){if(e.dead||(!bossAwake&&e.boss))continue;const d=e.root.position.distanceTo(player.position);if(d<distance){closest=e;distance=d;}}return closest;}

function beginAttack(){
  if(mode!=='playing'||state.dead||state.dodge>0||state.special>0)return;
  if(state.attack>0){attackBuffer=.3;return;}
  if(state.stamina<9){toast('الطاقة منخفضة — التقط أنفاسك',1);return;}
  comboIndex=elapsed-lastAttack<1?((comboIndex+1)%3):0;lastAttack=elapsed;
  state.stamina-=9;state.attackDuration=[.45,.48,.64][comboIndex];state.attack=state.attackDuration;state.attackHit=false;state.block=false;
  const target=closestEnemy(4);if(target){faceToward(player,target.root.position.x-player.position.x,target.root.position.z-player.position.z,1,100);}
  audio.play('swing');
}
function dodge(){
  if(mode!=='playing'||state.dead||state.dodge>0||state.special>0||state.stamina<22)return;
  state.stamina-=22;state.dodge=.48;state.invulnerable=.5;state.attack=0;state.block=false;
  getMoveVector(state.dodgeDir);if(state.dodgeDir.lengthSq()<.01)state.dodgeDir.set(-Math.sin(player.rotation.y),0,-Math.cos(player.rotation.y));
  faceToward(player,state.dodgeDir.x,state.dodgeDir.z,1,100);audio.play('dodge');
}
function special(){
  if(mode!=='playing'||state.dead||state.special>0||state.dodge>0)return;
  if(specialCooldown>0){toast('عاصفة الظل تستعيد طاقتها',1);return;}
  if(state.stamina<40){toast('تحتاج العاصفة إلى 40 من الطاقة',1.5);return;}
  state.stamina-=40;state.special=.85;state.invulnerable=.9;state.attack=0;specialCooldown=11;shake=.35;audio.play('special');
  for(const e of enemies)if(!e.dead&&(!e.boss||bossAwake)&&e.root.position.distanceTo(player.position)<5.2)damageEnemy(e,65,true);
  ringEffect(player.position,0xd7d4a0,5.4,.65);
}
function heal(){if(mode!=='playing'||state.dead)return;if(potions<=0){toast('لا توجد جرعات — استرح عند مزار',2);return;}if(state.health>=100){toast('حيويتك مكتملة',1.5);return;}potions--;state.health=Math.min(100,state.health+45);audio.play('heal');ringEffect(player.position,0xa8c68b,1.6,.7);toast('استعدت 45 من الحيوية');save();}
function rest(){if(mode!=='playing')return;const shrine=SHRINES.find(s=>Math.hypot(player.position.x-s.x,player.position.z-s.z)<3.5);if(!shrine)return;if(closestEnemy(10)){toast('لا يمكن الراحة أثناء القتال');return;}state.health=100;state.stamina=100;potions=3;audio.play('heal');toast('راحة المزار · استُعيدت الحيوية والجرعات');ringEffect(player.position,0xe0cb93,2.4,1);save();}
function damageEnemy(e,damage,strong=false){
  if(e.dead)return;e.health-=damage;e.fighter.flash=.17;e.stun=strong?1.25:.42;e.windup=0;e.attack=0;audio.play('hit');shake=Math.max(shake,strong?.22:.12);hitStop=.045;
  const push=temp.copy(e.root.position).sub(player.position).setY(0).normalize().multiplyScalar(strong?1.5:.45);resolvePosition(e.root.position,push,.38);
  spark(e.root.position.clone().add(new THREE.Vector3(0,1.1,0)),0xf1d19a,10);floatingText(e.root.position,damage.toString(),strong?'#f2d491':'#ebe8ca');
  if(e.health<=0){e.dead=true;e.deathTime=0;kills++;essence+=e.boss?200:25;state.stamina=Math.min(100,state.stamina+15);spawnPickup(e.root.position,e.boss?0:1);if(e.boss){bossDefeated=true;save();setTimeout(victory,1200);}else checkCamps();}
}
function hurt(damage,source){
  if(state.dead||state.invulnerable>0)return;
  if(state.block&&state.stamina>12){state.stamina-=12;const parry=elapsed-blockStarted<.25;if(parry){source.stun=1.8;audio.play('parry');toast('صدّ مثالي',1);essence+=3;state.stamina=Math.min(100,state.stamina+15);}else audio.play('block');spark(player.position.clone().add(new THREE.Vector3(0,1.3,0)),0xdde3c0,12);shake=.07;return;}
  state.health=Math.max(0,state.health-damage);state.invulnerable=.7;hero.flash=.2;hurtTimer=.3;shake=.3;audio.play('hurt');state.attack=0;attackBuffer=0;
  if(state.health<=0){state.dead=true;state.block=false;setTimeout(()=>{if(mode==='playing'){setMode('dead');$('end-kicker').textContent='THE JOURNEY CONTINUES';$('end-title').textContent='سقط الظل';$('end-description').textContent='عد إلى المزار، واستأنف عهدك.';$('end-stats').textContent=`${kills} أعداء هُزموا · ${essence} جوهر ظل`;$('restart').textContent='العودة إلى المزار ←';$('end').classList.remove('hidden');}},1100);}
}
function checkCamps(){for(let i=0;i<CAMPS.length;i++){if(cleared[i])continue;const members=enemies.filter(e=>e.camp===i);if(members.length&&members.every(e=>e.dead)){cleared[i]=true;world.freeCamp(i);essence+=75;potions=Math.min(5,potions+1);audio.play('clear');toast(`${CAMPS[i].name} تحرّر · +75 جوهر ظل`,4);ringEffect(new THREE.Vector3(CAMPS[i].x,0,CAMPS[i].z),0xdbbf7e,12,1.2);save();}}
  if(cleared.every(Boolean)&&!bossAwake&&!bossDefeated){bossAwake=true;world.openGate();toast('فُتحت بوابة المعبد — حارس الرماد ينتظرك في الشمال',6);save();}
}
function victory(){if(victoryShown)return;victoryShown=true;setMode('victory');$('end-kicker').textContent='THE VALLEY REMEMBERS';$('end-title').textContent='عاد النور إلى الوادي';$('end-description').textContent='أوفيت بعهدك. ما زالت الغابة تخبئ دروبًا لتستكشفها.';$('end-stats').textContent=`3 معسكرات محررة · ${kills} أعداء هُزموا · ${essence} جوهر ظل`;$('restart').textContent='متابعة استكشاف الوادي ←';$('end').classList.remove('hidden');audio.play('clear');}
$('restart').addEventListener('click',()=>{$('end').classList.add('hidden');if(bossDefeated){state.dead=false;state.health=100;resume();return;}state.health=100;state.stamina=100;state.dead=false;state.air=0;state.vy=0;state.invulnerable=2;state.attack=0;state.dodge=0;potions=Math.max(potions,2);player.position.set(0,heightAt(0,18),18);for(const e of enemies)if(!e.dead){e.root.position.copy(e.home);e.health=e.maxHealth;e.attack=0;e.windup=0;e.stun=0;}yaw=0;resume();save();});

function addEnemy(x,z,camp,boss=false){const fighter=createFighter({enemy:true,boss}),root=fighter.root;root.position.set(x,heightAt(x,z),z);root.rotation.y=Math.random()*Math.PI*2;root.visible=false;scene.add(root);const maxHealth=boss?420:80;const e={fighter,root,camp,boss,health:maxHealth,maxHealth,home:root.position.clone(),dead:false,deathTime:0,cooldown:1+Math.random(),windup:0,attack:0,stun:0,phase:Math.random()*6.28,speed:0,alert:false};enemies.push(e);if(boss&&bossDefeated){e.dead=true;root.visible=false;}return e;}
function spawnEnemies(){
  for(let i=0;i<CAMPS.length;i++){if(cleared[i]){world.freeCamp(i);continue;}const c=CAMPS[i];for(let j=0;j<3+i%2;j++){const angle=j/(3+i%2)*Math.PI*2;addEnemy(c.x+Math.cos(angle)*4,c.z+Math.sin(angle)*4,i);}}
  if(!bossDefeated)addEnemy(0,-106,3,true);
}
function getMoveVector(out){let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchMove.x;let z=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y;out.set(x,0,-z);if(out.lengthSq()>1)out.normalize();out.applyAxisAngle(up,yaw);return out;}
function jump(){if(mode==='playing'&&!state.dead&&state.air<=.001&&state.dodge<=0){state.vy=6;state.air=.001;audio.play('dodge');}}

function updatePlayer(dt){
  state.invulnerable=Math.max(0,state.invulnerable-dt);specialCooldown=Math.max(0,specialCooldown-dt);attackBuffer=Math.max(0,attackBuffer-dt);
  state.block=(keys.has('KeyF')||keys.has('MouseRight'))&&state.dodge<=0&&state.attack<=0&&state.special<=0&&!state.dead;
  let moving=getMoveVector(moveVector).lengthSq()>.005;
  const sprint=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&state.stamina>2&&moving&&!state.block;
  let targetSpeed=state.dead?0:state.block?1.5:sprint?7.5:4.3;
  if(state.attack>0)targetSpeed*=.25;if(state.special>0)targetSpeed=0;
  if(!moving)targetSpeed=0;state.speed=THREE.MathUtils.damp(state.speed,targetSpeed,12,dt);
  if(sprint&&state.attack<=0)state.stamina=Math.max(0,state.stamina-11*dt);else if(state.attack<=0&&state.dodge<=0&&state.special<=0)state.stamina=Math.min(100,state.stamina+(state.block?9:24)*dt);
  if(state.dodge>0){state.dodge=Math.max(0,state.dodge-dt);resolvePosition(player.position,temp.copy(state.dodgeDir).multiplyScalar(dt*10));}
  else if(!state.dead){resolvePosition(player.position,temp.copy(moveVector).multiplyScalar(state.speed*dt));if(moving&&!state.block&&state.attack<=0)faceToward(player,moveVector.x,moveVector.z,dt);}
  if(state.attack>0){state.attack=Math.max(0,state.attack-dt);const progress=1-state.attack/state.attackDuration;
    if(progress>.29&&!state.attackHit){state.attackHit=true;const forward=new THREE.Vector3(-Math.sin(player.rotation.y),0,-Math.cos(player.rotation.y));let count=0;for(const e of enemies){if(e.dead||e.boss&&!bossAwake)continue;const distance=e.root.position.distanceTo(player.position);const to=temp.copy(e.root.position).sub(player.position).normalize();if(distance<3.05&&forward.dot(to)>-.12){damageEnemy(e,[29,34,48][comboIndex],comboIndex===2);count++;}}
      if(count){$('combo').textContent=['一 · ضربة','二 · ضربتان','三 · ضربة قاضية'][comboIndex];$('combo').style.opacity=1;comboTimer=.9;}
    }
    if(progress<.45)resolvePosition(player.position,temp.set(-Math.sin(player.rotation.y),0,-Math.cos(player.rotation.y)).multiplyScalar(dt*1.5));
    if(state.attack<=0&&attackBuffer>0){attackBuffer=0;beginAttack();}
  }
  if(state.special>0)state.special=Math.max(0,state.special-dt);
  if(state.air>0||state.vy>0){state.vy-=16*dt;state.air+=state.vy*dt;if(state.air<0){state.air=0;state.vy=0;}}
  player.position.y=playerGround(player.position.x,player.position.z)+state.air;
  if(state.speed>2&&state.air===0&&elapsed-audio.lastStep>(sprint?.25:.36)){audio.lastStep=elapsed;audio.play('step');}
  hero.animate(dt,elapsed,{speed:state.speed,attack:state.attack>0?1-state.attack/state.attackDuration:0,combo:comboIndex,dodge:state.dodge>0?1-state.dodge/.48:0,block:state.block,jump:state.air,dead:state.dead,special:state.special>0?1-state.special/.85:0});
  for(const pickup of pickups){if(pickup.taken)continue;const d=pickup.mesh.position.distanceTo(player.position);if(d<2.1){pickup.taken=true;pickup.mesh.visible=false;state.health=Math.min(100,state.health+8);essence+=5;}else{pickup.mesh.position.y=pickup.y+.45+Math.sin(elapsed*3+pickup.y)*.15;pickup.mesh.rotation.y+=dt*2;}}
}
function updateEnemies(dt){
  let activeAttackers=enemies.filter(e=>!e.dead&&(e.windup>0||e.attack>0)).length;
  for(const e of enemies){
    if(e.dead){e.deathTime+=dt;if(e.deathTime<2){e.fighter.animate(dt,elapsed,{dead:true});if(e.deathTime>1.4)e.root.position.y-=dt*2;}else e.root.visible=false;continue;}
    e.root.visible=Math.hypot(player.position.x-e.root.position.x,player.position.z-e.root.position.z)<43;
    if(e.boss&&!bossAwake){e.fighter.animate(dt,elapsed,{});continue;}
    if(e.stun>0){e.stun-=dt;e.fighter.animate(dt,elapsed,{block:true});continue;}
    const dx=player.position.x-e.root.position.x,dz=player.position.z-e.root.position.z,distance=Math.hypot(dx,dz);
    const homeDistance=Math.hypot(e.root.position.x-e.home.x,e.root.position.z-e.home.z);
    e.cooldown=Math.max(0,e.cooldown-dt);e.speed=0;
    if(e.windup>0){e.windup-=dt;faceToward(e.root,dx,dz,dt,8);if(e.windup<=0){e.attack=.48;e.didHit=false;audio.play('swing');}}
    else if(e.attack>0){e.attack-=dt;if(e.attack<.3&&!e.didHit){e.didHit=true;if(distance<(e.boss?3.35:2.55)&&state.air<1.2)hurt(e.boss?27:15,e);}if(e.attack<=0)e.cooldown=e.boss?1.05:1.6+Math.random()*.9;}
    else if(!state.dead&&distance<(e.alert?21:e.boss?17:12)&&homeDistance<30){
      e.alert=true;faceToward(e.root,dx,dz,dt,5);
      const desiredDistance=e.boss?2.3:1.85;
      if(distance>desiredDistance){e.speed=e.boss?3.2:2.65;const step=temp.set(dx,0,dz).normalize().multiplyScalar(e.speed*dt);for(const other of enemies){if(other===e||other.dead)continue;const ox=e.root.position.x-other.root.position.x,oz=e.root.position.z-other.root.position.z,d=Math.hypot(ox,oz);if(d<1.3&&d>.01){step.x+=ox/d*dt*2;step.z+=oz/d*dt*2;}}resolvePosition(e.root.position,step,.42);}
      else if(e.cooldown<=0&&activeAttackers<2){e.windup=e.boss?.78:.68;activeAttackers++;}
    }else{
      e.alert=false;const px=e.home.x+Math.cos(elapsed*.22+e.phase)*2,pz=e.home.z+Math.sin(elapsed*.22+e.phase)*2;
      if(Math.hypot(px-e.root.position.x,pz-e.root.position.z)>.2){e.speed=.7;const step=temp.set(px-e.root.position.x,0,pz-e.root.position.z).normalize().multiplyScalar(dt*.7);resolvePosition(e.root.position,step,.4);faceToward(e.root,step.x,step.z,dt,3);}
    }
    e.root.position.y=heightAt(e.root.position.x,e.root.position.z);
    e.fighter.animate(dt,elapsed,{speed:e.speed,attack:e.attack>0?1-e.attack/.48:0,telegraph:e.windup,combo:e.boss?1:0});
  }
}

function ringEffect(position,color,radius,duration){const mesh=new THREE.Mesh(new THREE.RingGeometry(.9,1,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,heightAt(position.x,position.z)+.12,position.z);scene.add(mesh);effects.push({type:'ring',mesh,duration,life:duration,radius});}
function spark(position,color,count){const data=new Float32Array(count*3),velocities=[];for(let i=0;i<count;i++){data.set([position.x,position.y,position.z],i*3);velocities.push(new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5));}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(data,3));const mesh=new THREE.Points(geo,new THREE.PointsMaterial({color,size:.065,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(mesh);effects.push({type:'spark',mesh,velocities,life:.45,duration:.45});}
function floatingText(position,text,color){const el=document.createElement('span');el.textContent=text;Object.assign(el.style,{position:'fixed',fontFamily:'Manrope',fontSize:'22px',color,fontWeight:'600',textShadow:'0 2px 8px #061811',pointerEvents:'none',zIndex:4});document.body.append(el);effects.push({type:'text',el,position:position.clone().add(new THREE.Vector3(0,1.8,0)),life:.75,duration:.75});}
function spawnPickup(position,count){if(!count)return;const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshStandardMaterial({color:0xd2ce8d,emissive:0xa1ae6d,emissiveIntensity:.6,metalness:.4,roughness:.2}));mesh.position.copy(position);scene.add(mesh);pickups.push({mesh,y:position.y,taken:false});}
function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const progress=1-e.life/e.duration;if(e.type==='ring'){e.mesh.scale.setScalar(.3+progress*e.radius);e.mesh.material.opacity=(1-progress)*.6;}else if(e.type==='spark'){const a=e.mesh.geometry.attributes.position;for(let j=0;j<a.count;j++){e.velocities[j].y-=dt*9;a.setXYZ(j,a.getX(j)+e.velocities[j].x*dt,a.getY(j)+e.velocities[j].y*dt,a.getZ(j)+e.velocities[j].z*dt);}a.needsUpdate=true;e.mesh.material.opacity=1-progress;}else{e.position.y+=dt*.8;const p=e.position.clone().project(camera);e.el.style.left=(p.x*.5+.5)*innerWidth+'px';e.el.style.top=(-p.y*.5+.5)*innerHeight+'px';e.el.style.opacity=1-progress;}
    if(e.life<=0){if(e.mesh){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}if(e.el)e.el.remove();effects.splice(i,1);}}
}
function updateCamera(dt){
  if(!player)return;
  if(mode==='menu'||mode==='loading'){
    const a=elapsed*.025;desiredCamera.set(-4.6+Math.sin(a)*.6,player.position.y+2.3,player.position.z+5.3);camTarget.set(player.position.x+.9,player.position.y+1.25,player.position.z-.6);
    camera.position.lerp(desiredCamera,1-Math.exp(-dt*2));camera.lookAt(camTarget);return;
  }
  camTarget.copy(player.position);camTarget.y+=1.45;
  desiredCamera.set(camTarget.x+Math.sin(yaw)*Math.cos(pitch)*zoom,camTarget.y+Math.sin(pitch)*zoom+1,camTarget.z+Math.cos(yaw)*Math.cos(pitch)*zoom);
  desiredCamera.y=Math.max(desiredCamera.y,heightAt(desiredCamera.x,desiredCamera.z)+.65);
  camera.position.lerp(desiredCamera,1-Math.exp(-dt*9));
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*1.5);}
  camera.lookAt(camTarget);
  sunlight.position.set(player.position.x-35,65,player.position.z-45);sunlight.target.position.copy(player.position);sunlight.target.updateMatrixWorld();
}
function updateHUD(){
  $('health-bar').style.width=state.health+'%';$('health-label').textContent=`${Math.ceil(state.health)} / 100`;$('stamina-bar').style.width=state.stamina+'%';$('essence').textContent=essence;$('potions').textContent=potions;
  const count=cleared.filter(Boolean).length;$('quest-count').textContent=`${count} / 3`;$('quest-bar').style.width=count/3*100+'%';
  $('level').textContent=String(1+Math.floor(essence/200)).padStart(2,'0');
  if(bossDefeated){$('quest-text').textContent='أُنجز العهد. الوادي حرّ — استكشف ما تشاء.';$('quest-hint').textContent='عاد السلام إلى المزارات';}
  else if(bossAwake){$('quest-text').textContent='اعبر البوابة واهزم حارس المعبد في الشمال.';$('quest-hint').textContent='المواجهة الأخيرة · معبد الصدى';}
  $('special-status').textContent=specialCooldown>0?`${Math.ceil(specialCooldown)} ث`:'جاهزة';$('special-cooldown').style.transform=`translateY(${100-specialCooldown/11*100}%)`;
  const near=closestEnemy(12);$('target').classList.toggle('hidden',!near);if(near){$('target-name').textContent=near.boss?'حارس المعبد · سيد الرماد':'حارس الرماد';$('target-health').style.width=Math.max(0,near.health/near.maxHealth*100)+'%';}
  const shrine=SHRINES.some(s=>Math.hypot(player.position.x-s.x,player.position.z-s.z)<3.5);$('interact').classList.toggle('hidden',!shrine);
  const directions=['N','NE','E','SE','S','SW','W','NW'];const idx=Math.round(THREE.MathUtils.euclideanModulo(-yaw,Math.PI*2)/(Math.PI/4))%8;$('heading').textContent=directions[idx];
  const objectives=bossAwake&&!bossDefeated?[TEMPLE]:CAMPS.filter((c,i)=>!cleared[i]);objectives.sort((a,b)=>Math.hypot(a.x-player.position.x,a.z-player.position.z)-Math.hypot(b.x-player.position.x,b.z-player.position.z));
  $('objective-marker').classList.toggle('hidden',!objectives.length);if(objectives.length){const o=objectives[0],dx=o.x-player.position.x,dz=o.z-player.position.z,angle=Math.atan2(-dx,-dz);const relative=THREE.MathUtils.euclideanModulo(angle-yaw+Math.PI,Math.PI*2)-Math.PI;$('objective-marker').style.left=(50-THREE.MathUtils.clamp(relative/Math.PI,-1,1)*48)+'%';$('objective-distance').textContent=Math.round(Math.hypot(dx,dz))+' m';}
  $('coords').textContent=`${Math.round(player.position.x)} · ${Math.round(-player.position.z)}`;drawMap();
  let name='غابة الأصداء';if(player.position.z>0&&Math.abs(player.position.x)<20)name='ممر الأرز';if(player.position.z<-95)name='معبد الصدى';else if(Math.abs(player.position.z+51)<10)name='جسر الضباب';else for(let i=0;i<CAMPS.length;i++)if(Math.hypot(player.position.x-CAMPS[i].x,player.position.z-CAMPS[i].z)<16)name=CAMPS[i].name;
  discover(name);
}
function drawMap(){const c=mapCtx,w=220,h=220,scale=1.25;c.clearRect(0,0,w,h);c.fillStyle='#1a3329';c.fillRect(0,0,w,h);c.strokeStyle='#a6af7830';c.lineWidth=.7;for(let x=0;x<220;x+=30){c.beginPath();c.moveTo(x,0);c.lineTo(x,220);c.moveTo(0,x);c.lineTo(220,x);c.stroke();}
  const point=(x,z)=>({x:110+(x-player.position.x)*scale,y:110+(z-player.position.z)*scale});
  c.strokeStyle='#628e7c';c.lineWidth=6;c.beginPath();for(let x=-160;x<160;x+=5){const p=point(x,-51-Math.sin(x*.035)*3);if(x===-160)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.stroke();
  c.strokeStyle='#b7b58b55';c.lineWidth=2;c.beginPath();for(let z=30;z>-120;z-=3){const p=point(Math.sin(z*.035)*3.3,z);if(z===30)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.stroke();
  for(let i=0;i<CAMPS.length;i++){const p=point(CAMPS[i].x,CAMPS[i].z);c.strokeStyle=cleared[i]?'#9fb78b':'#d7b76f';c.lineWidth=1.2;c.save();c.translate(p.x,p.y);c.rotate(Math.PI/4);c.strokeRect(-4,-4,8,8);if(cleared[i]){c.fillStyle='#9fb78b';c.fillRect(-2,-2,4,4);}c.restore();}
  for(const s of SHRINES){const p=point(s.x,s.z);c.fillStyle='#b7c2a6';c.beginPath();c.arc(p.x,p.y,2.5,0,6.28);c.fill();}
  const t=point(TEMPLE.x,TEMPLE.z);c.fillStyle=bossDefeated?'#9fb78b':'#d7b76f';c.fillRect(t.x-4,t.y-4,8,8);
  for(const e of enemies){if(e.dead||e.boss&&!bossAwake)continue;const p=point(e.root.position.x,e.root.position.z);c.fillStyle='#cb7860';c.beginPath();c.arc(p.x,p.y,e.boss?3.4:2,0,6.28);c.fill();}
  c.save();c.translate(110,110);c.rotate(-player.rotation.y);c.fillStyle='#efe6be';c.beginPath();c.moveTo(0,-6);c.lineTo(4.5,4);c.lineTo(0,2);c.lineTo(-4.5,4);c.closePath();c.fill();c.restore();c.strokeStyle='#efe6be33';c.beginPath();c.arc(110,110,14,0,6.28);c.stroke();
}

document.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(!$('help').classList.contains('hidden'))closeHelp();else pause();return;}
  if(mode!=='playing')return;if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','AltLeft','AltRight','Tab'].includes(e.code))e.preventDefault();
  if(!e.repeat){if(e.code==='KeyJ')beginAttack();if(e.code==='KeyK'||e.code==='AltLeft'||e.code==='AltRight')dodge();if(e.code==='KeyQ')special();if(e.code==='KeyE')heal();if(e.code==='KeyR')rest();if(e.code==='Space')jump();if(e.code==='KeyF')blockStarted=elapsed;if(e.code==='KeyV'){if(document.pointerLockElement)document.exitPointerLock();else{try{canvas.requestPointerLock()?.catch(()=>toast('اسحب الماوس لتدوير الكاميرا',2));}catch{toast('اسحب الماوس لتدوير الكاميرا',2);}}}}
  keys.add(e.code);
});document.addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(mode==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerdown',e=>{if(e.target.closest('button,a,input,select,#joystick,.touch-buttons'))return;if(mode!=='playing')return;pointer.down=true;pointer.x=e.clientX;pointer.y=e.clientY;pointer.moved=0;pointer.button=e.button;if(e.button===2){keys.add('MouseRight');blockStarted=elapsed;}if(document.pointerLockElement&&e.button===0)beginAttack();});
document.addEventListener('pointermove',e=>{if(mode!=='playing')return;if(pointer.down||document.pointerLockElement){const dx=document.pointerLockElement?e.movementX:e.clientX-pointer.x,dy=document.pointerLockElement?e.movementY:e.clientY-pointer.y;pointer.moved+=Math.abs(dx)+Math.abs(dy);yaw-=dx*.004*sensitivity;pitch=THREE.MathUtils.clamp(pitch+dy*.003*sensitivity,-.2,1.05);pointer.x=e.clientX;pointer.y=e.clientY;}});
document.addEventListener('pointerup',e=>{if(pointer.down&&e.button===0&&pointer.moved<8&&!document.pointerLockElement)beginAttack();pointer.down=false;keys.delete('MouseRight');});
canvas.addEventListener('wheel',e=>{if(mode==='playing'){e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.005,3.4,10);}}, {passive:false});
const stick=$('joystick'),knob=stick.querySelector('i');let stickId=null;
stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)updateStick(e);});
function updateStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,len=Math.hypot(dx,dy),s=Math.min(len,35)/(len||1);touchMove.x=dx*s/35;touchMove.y=dy*s/35;knob.style.transform=`translate(${dx*s}px,${dy*s}px)`;}
function resetStick(){stickId=null;touchMove.x=touchMove.y=0;knob.style.transform='';}stick.addEventListener('pointerup',resetStick);stick.addEventListener('pointercancel',resetStick);
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('pointerdown',e=>{e.preventDefault();({jump,dodge,attack:beginAttack,special})[b.dataset.action]();});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

$('play').addEventListener('click',()=>{if(!ready)return;audio.init();$('menu').classList.add('hidden');$('hud').classList.remove('hidden');setMode('playing');yaw=0;player.rotation.y=0;discover('ممر الأرز');toast('العهد يبدأ هنا · حرّك الشخصية باستخدام WASD',4);});

async function init(){
  try{
    await loadNinja(progress=>{$('loading-bar').style.width=Math.max(5,progress*100)+'%';});
    hero=createFighter();player=hero.root;player.position.set(0,heightAt(0,18),18);player.rotation.y=Math.PI;scene.add(player);
    if(saved&&saved.version===1){cleared=Array.isArray(saved.cleared)&&saved.cleared.length===3?saved.cleared.map(Boolean):[false,false,false];essence=Math.max(0,Number(saved.essence)||0);kills=Math.max(0,Number(saved.kills)||0);potions=THREE.MathUtils.clamp(Number(saved.potions)||0,0,5);bossDefeated=!!saved.bossDefeated;bossAwake=cleared.every(Boolean);if(saved.position&&Number.isFinite(saved.position.x)&&Number.isFinite(saved.position.z)){const x=THREE.MathUtils.clamp(saved.position.x,-120,120),z=THREE.MathUtils.clamp(saved.position.z,-130,80);player.position.set(x,heightAt(x,z),z);}}
    spawnEnemies();if(bossAwake||bossDefeated)world.openGate();
    camera.position.set(player.position.x-4.6,player.position.y+2.3,player.position.z+5.3);camera.lookAt(player.position.clone().add(new THREE.Vector3(.9,1.25,-.6)));
    ready=true;mode='menu';$('play').disabled=false;$('play-label').textContent=saved?'متابعة الرحلة':'ادخل الوادي';$('loading-bar').style.width='100%';$('loading-label').textContent='الوادي جاهز · سماعات الرأس تمنحك تجربة أفضل';
    if(bossDefeated)victoryShown=true;
  }catch(error){console.error('Unable to load ninja',error);$('play-label').textContent='إعادة محاولة التحميل';$('play').disabled=false;$('loading-label').textContent='تعذر تحميل الشخصية. تحقق من الاتصال ثم أعد المحاولة.';$('play').addEventListener('click',()=>location.reload(),{once:true});}
}
init();
function loop(){requestAnimationFrame(loop);const rawDt=Math.min(clock.getDelta(),.05);let dt=rawDt;if(mode==='playing'&&hitStop>0){hitStop-=rawDt;dt*=.12;}if(mode==='playing'||mode==='menu'||mode==='loading')elapsed+=dt;
  if(mode==='playing'){
    updatePlayer(dt);updateEnemies(dt);updateEffects(dt);world.update(elapsed);
    zoneTimer-=dt;if(zoneTimer<=0)$('zone').style.opacity=0;messageTimer-=dt;if(messageTimer<=0)$('message').style.opacity=0;comboTimer-=dt;if(comboTimer<=0)$('combo').style.opacity=0;
    hurtTimer=Math.max(0,hurtTimer-dt);$('hurt').style.opacity=hurtTimer>0?Math.min(1,hurtTimer*2):0;
    saveTimer+=dt;if(saveTimer>8){saveTimer=0;save();}if(elapsed-lastHud>.1){lastHud=elapsed;updateHUD();}
  }else if(mode==='menu'||mode==='loading'){world.update(elapsed);if(hero)hero.animate(dt,elapsed,{});}
  if(mode==='playing'||mode==='menu'||mode==='loading')updateCamera(rawDt);
  renderer.render(scene,camera);
}
loop();

// Read-only state for diagnostics and integrations; gameplay uses the same live state.
export function inspectGame(){return {mode,time:elapsed,player:player?{x:player.position.x,y:player.position.y,z:player.position.z,rotation:player.rotation.y}:null,health:state.health,stamina:state.stamina,air:state.air,attack:state.attack,dodge:state.dodge,special:state.special,specialCooldown,cleared:[...cleared],bossAwake,bossDefeated,kills,essence,potions,enemies:enemies.map(e=>({x:e.root.position.x,z:e.root.position.z,health:e.health,dead:e.dead,boss:e.boss,camp:e.camp,windup:e.windup,attack:e.attack})),render:renderer.info.render};}
