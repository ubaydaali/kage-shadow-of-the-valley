import * as THREE from 'three';

export const WORLD_RADIUS=155;
export const CAMPS=[{x:-31,z:-13,name:'مخيم الأرز',radius:12},{x:34,z:-40,name:'مخيم النهر',radius:13},{x:-12,z:-78,name:'مخيم الضباب',radius:12}];
export const SHRINES=[{x:-3,z:18},{x:-31,z:-4},{x:34,z:-27},{x:-12,z:-66}];
export const TEMPLE={x:0,z:-111};
export function heightAt(x,z){
  const edge=THREE.MathUtils.smoothstep(Math.hypot(x,z+40),65,155);
  const terrain=Math.sin(x*.055)*Math.sin(z*.043)*1.35+Math.cos(x*.07+z*.03)*.55+edge*(2+Math.sin(x*.08+z*.09)*2);
  const channel=1-THREE.MathUtils.smoothstep(Math.abs(z+51+Math.sin(x*.035)*3),3.5,6.8);
  return THREE.MathUtils.lerp(terrain,-1.35,channel);
}
let seed=781;function rnd(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}function range(a,b){return a+rnd()*(b-a);}
const v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),matrix=new THREE.Matrix4();

export function createWorld(scene){
  const colliders=[],flames=[],lanterns=[],campFlags=[];
  const mats={stone:new THREE.MeshStandardMaterial({color:0x77877b,roughness:.97}),darkStone:new THREE.MeshStandardMaterial({color:0x465b50,roughness:1}),wood:new THREE.MeshStandardMaterial({color:0x4c4535,roughness:.95}),red:new THREE.MeshStandardMaterial({color:0x8e4932,roughness:.83}),roof:new THREE.MeshStandardMaterial({color:0x293e38,roughness:.85}),gold:new THREE.MeshStandardMaterial({color:0xb89a5b,metalness:.4,roughness:.6}),cloth:new THREE.MeshStandardMaterial({color:0x884d36,side:THREE.DoubleSide,roughness:1})};
  function mesh(geometry,material,x,y,z,cast=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m;}
  function box(x,y,z,w,h,d,mat=mats.wood){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
  function cylinder(x,y,z,r1,r2,h,mat=mats.wood,segments=8){return mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat,x,y,z);}
  function collider(x,z,r){colliders.push({x,z,r});}
  function groupBox(group,x,y,z,w,h,d,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
  // Vertex-colored ground. The central paths stay gentle while the forest rises at the edges.
  const groundGeometry=new THREE.PlaneGeometry(360,360,150,150);groundGeometry.rotateX(-Math.PI/2);
  const pos=groundGeometry.attributes.position,colors=[];const color=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,heightAt(x,z));
    const path=Math.abs(x-4*Math.sin(z*.035));const clearing=CAMPS.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius);
    color.set(clearing?0x6c7355:path<3?0x7a8060:0x4a6450);
    color.multiplyScalar(.83+rnd()*.25);colors.push(color.r,color.g,color.b);
  }
  groundGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));groundGeometry.computeVertexNormals();
  const ground=mesh(groundGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),0,0,0,false);
  // A soft horizon and a large low sun.
  const sky=new THREE.Mesh(new THREE.SphereGeometry(500,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x557b7c)},bottom:{value:new THREE.Color(0xc5ccaf)}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(p).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.1,.7,h)),1.);}'}));scene.add(sky);
  const sun=mesh(new THREE.SphereGeometry(13,24,16),new THREE.MeshBasicMaterial({color:0xf6dfab,fog:false}),-130,82,-260,false);
  // Far mountain silhouettes.
  const mountainMats=[0x5f7d77,0x65837b,0x728e83].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1,flatShading:true}));
  for(let i=0;i<36;i++){const a=i/36*Math.PI*2,r=range(175,230);const h=range(40,93);const m=mesh(new THREE.ConeGeometry(range(24,49),h,range(5,8)|0),mountainMats[i%3],Math.sin(a)*r,h/2-8,Math.cos(a)*r-35,false);m.rotation.y=rnd()*Math.PI;m.scale.z=range(.6,1.6);}
  // Thin stepping stones lead from the starting shrine into the valley.
  const stepping=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,.11,7),mats.stone,100);let sc=0;
  for(let z=21;z>-118;z-=1.5){const x=Math.sin(z*.035)*3.3+range(-.35,.35);v.set(x,heightAt(x,z)+.07,z);q.setFromEuler(new THREE.Euler(0,rnd()*6.28,0));s.set(range(.55,.95),1,range(.45,.7));matrix.compose(v,q,s);stepping.setMatrixAt(sc++,matrix);}
  stepping.count=sc;stepping.receiveShadow=true;scene.add(stepping);
  // Reusable instancing keeps the forest inexpensive to draw.
  const trunks=[],canopies=[],grass=[],rocks=[],bamboos=[];
  for(let i=0;i<510;i++){
    const x=range(-150,150),z=range(-155,95);if(Math.hypot(x,z+35)>158)continue;
    if(Math.abs(x-Math.sin(z*.035)*3.3)<7&&z<35)continue;
    if(CAMPS.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+4)||SHRINES.some(c=>Math.hypot(x-c.x,z-c.z)<7)||Math.hypot(x,z+111)<20)continue;
    if(Math.abs(z+51+Math.sin(x*.035)*3)<5)continue;
    const h=range(8,17),y=heightAt(x,z);trunks.push({x,y:y+h*.48,z,sx:range(.34,.57),sy:h,sz:range(.34,.57),a:rnd()*6.28});
    const pine=rnd()>.23;
    if(pine)for(let j=0;j<3;j++)canopies.push({x,y:y+h*.58+j*h*.18,z,sx:h*(.24-j*.035),sy:h*.52,sz:h*(.24-j*.035),a:rnd()*6.28,pine:true});
    else for(let j=0;j<4;j++)canopies.push({x:x+range(-2,2),y:y+h*.76+range(-1,2),z:z+range(-2,2),sx:range(2.8,4.2),sy:range(1.8,2.8),sz:range(2.5,4.5),a:rnd()*6.28,pine:false});
    collider(x,z,.7);
  }
  function instances(data,geo,material,cast=true){if(!data.length)return;const m=new THREE.InstancedMesh(geo,material,data.length);for(let i=0;i<data.length;i++){const a=data[i];v.set(a.x,a.y,a.z);q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,a.a||0);s.set(a.sx,a.sy,a.sz);matrix.compose(v,q,s);m.setMatrixAt(i,matrix);if(a.color)m.setColorAt(i,new THREE.Color(a.color));}m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m;}
  instances(trunks,new THREE.CylinderGeometry(.5,1,1,7),mats.wood);
  const pineMat=new THREE.MeshStandardMaterial({color:0x274d3b,roughness:1,flatShading:true});
  instances(canopies.filter(c=>c.pine),new THREE.ConeGeometry(1,1,7),pineMat);
  const broad=canopies.filter(c=>!c.pine);broad.forEach((c,i)=>c.color=i%5===0?0xa3934f:0x4e6b43);
  instances(broad,new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}));
  // Mossy outcrops and clusters of bamboo.
  for(let i=0;i<180;i++){const x=range(-125,125),z=range(-140,75);if(Math.abs(x)<7||CAMPS.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+2))continue;const sz=range(.5,2.7);rocks.push({x,y:heightAt(x,z)+sz*.1,z,sx:sz,sy:sz*.7,sz:sz*.8,a:rnd()*6.28});if(sz>1.2)collider(x,z,sz*.7);}
  instances(rocks,new THREE.DodecahedronGeometry(1,0),mats.darkStone);
  for(let i=0;i<95;i++){const x=-15+range(-10,7),z=range(-47,18);if(Math.abs(x)<7)continue;const h=range(5,9);bamboos.push({x,y:heightAt(x,z)+h/2,z,sx:.09,sy:h,sz:.09,a:rnd()*6.28});}
  instances(bamboos,new THREE.CylinderGeometry(.7,1,1,6),new THREE.MeshStandardMaterial({color:0x6c8053,roughness:1}));
  // Crossed blades use a single instanced draw, with gentle vertex wind.
  const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([-.07,0,0,.07,0,0,.015,.72,0,0,0,-.07,0,0,.07,0,.65,.01],3));blade.computeVertexNormals();
  const grassMat=new THREE.MeshStandardMaterial({color:0x839365,roughness:1,side:THREE.DoubleSide});
  const wind={value:0};grassMat.onBeforeCompile=sh=>{sh.uniforms.time=wind;sh.vertexShader='uniform float time;\n'+sh.vertexShader;sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(time*1.7+instanceMatrix[3].x*.7+instanceMatrix[3].z*.8)*position.y*.14;');};
  for(let i=0;i<16500;i++){const x=range(-105,105),z=range(-135,65);if(Math.abs(x-Math.sin(z*.035)*3.3)<3.5||CAMPS.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius*.8)||Math.hypot(x,z+111)<16||Math.abs(z+51+Math.sin(x*.035)*3)<4)continue;grass.push({x,y:heightAt(x,z),z,sx:range(.7,1.4),sy:range(.35,1),sz:range(.7,1.4),a:rnd()*6.28});}
  const grassMesh=instances(grass,blade,grassMat,false);
  // A silver-green river winds under the footbridges.
  const riverGeometry=new THREE.PlaneGeometry(280,8,100,1);riverGeometry.rotateX(-Math.PI/2);const rp=riverGeometry.attributes.position;
  for(let i=0;i<rp.count;i++){const x=rp.getX(i);rp.setZ(i,rp.getZ(i)-51-Math.sin(x*.035)*3);rp.setY(i,-.48);}
  riverGeometry.computeVertexNormals();
  const water=mesh(riverGeometry,new THREE.MeshStandardMaterial({color:0x729a8d,metalness:.55,roughness:.28,transparent:true,opacity:.85}),0,0,0,false);
  function bridge(x,z){const y=.2;for(let j=-7;j<=7;j++){const yy=y+Math.cos(j/7*Math.PI/2)*.6;box(x,yy,z+j*.65,4,.18,.57,mats.wood);}for(const sign of [-1,1]){box(x+sign*1.9,y+1.25,z,.1,.15,10,mats.red);for(let j=-1;j<=1;j++)cylinder(x+sign*1.9,y+.65,z+j*4.3,.11,.13,2,mats.red);}}
  bridge(0,-51);bridge(34,-54);
  function torii(x,z,scale=1){const y=heightAt(x,z),g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);scene.add(g);for(const a of [-1,1]){groupBox(g,a*2.4,2.6,0,.43,5.2,.43,mats.red);groupBox(g,a*2.4,.2,0,.65,.4,.65,mats.darkStone);}groupBox(g,0,4.55,0,6.4,.32,.4,mats.red);groupBox(g,0,5.4,0,7.4,.35,.7,mats.darkStone);groupBox(g,0,5.13,0,6.6,.23,.5,mats.red);groupBox(g,0,4.95,0,.3,.8,.25,mats.gold);for(const a of [-1,1]){const e=groupBox(g,a*3.7,5.56,0,1.1,.3,.7,mats.darkStone);e.rotation.z=a*.2;}collider(x-2.4*scale,z,.4*scale);collider(x+2.4*scale,z,.4*scale);return g;}
  torii(0,4,1.1);torii(-1,-93,1.4);
  function lantern(x,z){const y=heightAt(x,z);cylinder(x,y+.12,z,.5,.6,.24,mats.stone);cylinder(x,y+.8,z,.19,.25,1.4,mats.stone);box(x,y+1.65,z,.7,.7,.7,mats.stone);const glow=new THREE.MeshStandardMaterial({color:0xf8d38c,emissive:0xe9af50,emissiveIntensity:.9});box(x,y+1.69,z-.357,.4,.4,.025,glow);box(x+.357,y+1.69,z,.025,.4,.4,glow);const roof=mesh(new THREE.ConeGeometry(.72,.4,4),mats.darkStone,x,y+2.2,z);roof.rotation.y=Math.PI/4;lanterns.push({x,y:y+1.7,z});}
  for(const z of [15,3,-15,-32,-68,-91,-103])for(const x of [-5.2,5.2])lantern(x,z);
  function shrine(x,z){const y=heightAt(x,z);cylinder(x,y+.12,z,1.8,2,.24,mats.stone,12);cylinder(x,y+.36,z,1.1,1.4,.25,mats.darkStone,12);box(x,y+1,z,.7,1.1,.65,mats.stone);const roof=mesh(new THREE.ConeGeometry(1.1,.7,4),mats.roof,x,y+1.8,z);roof.rotation.y=Math.PI/4;const glow=new THREE.Mesh(new THREE.TorusGeometry(.45,.025,6,40),new THREE.MeshBasicMaterial({color:0xe9d18e}));glow.position.set(x,y+1.1,z+.36);scene.add(glow);return glow;}
  const shrineRings=SHRINES.map(s=>shrine(s.x,s.z));
  function building(x,z,w=6,d=5,angle=0){const g=new THREE.Group(),y=heightAt(x,z);g.position.set(x,y,z);g.rotation.y=angle;scene.add(g);groupBox(g,0,.3,0,w+1,.6,d+1,mats.stone);groupBox(g,0,1.9,0,w,3,d,mats.wood);for(const xx of [-w/2+.2,w/2-.2])for(const zz of [-d/2+.2,d/2-.2])groupBox(g,xx,2,zz,.3,3.4,.3,mats.red);groupBox(g,0,1.7,d/2+.02,w*.35,2.6,.1,mats.darkStone);for(const sign of [-1,1]){const roof=groupBox(g,0,4.05,sign*d*.3,w+2,.25,d*.85,mats.roof);roof.rotation.x=sign*.43;const rim=groupBox(g,0,3.5,sign*(d/2+.9),w+2.4,.18,.25,mats.darkStone);}groupBox(g,0,4.65,0,w+2.5,.25,.35,mats.darkStone);colliders.push({x,z,r:Math.max(w,d)*.55});return g;}
  building(-12,14,6,5,-.3);building(15,-6,7,5,.25);building(-46,-13,7,6,.4);building(49,-36,8,6,-.3);building(-25,-87,6,5,.2);
  // Camp standards and fire pits are also the quest landmarks.
  const fireCanvas=document.createElement('canvas');fireCanvas.width=64;fireCanvas.height=64;const fc=fireCanvas.getContext('2d'),gr=fc.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#fff4bb');gr.addColorStop(.2,'#ffd077');gr.addColorStop(.5,'#e7772544');gr.addColorStop(1,'#e7772500');fc.fillStyle=gr;fc.fillRect(0,0,64,64);const fireTexture=new THREE.CanvasTexture(fireCanvas);
  function fire(x,z){const y=heightAt(x,z);for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const r=mesh(new THREE.DodecahedronGeometry(.33),mats.darkStone,x+Math.sin(a)*.8,y+.15,z+Math.cos(a)*.8);r.scale.y=.6;}for(let i=0;i<3;i++){const log=box(x,y+.13,z,1.2,.2,.2,mats.wood);log.rotation.y=i*2;}const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:fireTexture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.set(x,y+.8,z);sprite.scale.set(2.5,3,1);scene.add(sprite);flames.push(sprite);const light=new THREE.PointLight(0xffba63,4,9,2);light.position.set(x,y+1,z);scene.add(light);}
  for(let k=0;k<CAMPS.length;k++){const c=CAMPS[k],y=heightAt(c.x,c.z);fire(c.x+3,c.z+2);cylinder(c.x-4,y+2.7,c.z,.08,.1,5.4);const flag=box(c.x-3.2,y+4.3,c.z,1.5,1.7,.04,mats.cloth.clone());campFlags.push(flag);for(let j=0;j<5;j++){const a=j*1.2;const xx=c.x+Math.cos(a)*9,zz=c.z+Math.sin(a)*9;box(xx,heightAt(xx,zz)+.65,zz,1.1,1.3,1,mats.wood);}lantern(c.x-6,c.z+5);}
  fire(-6,20);
  // The final temple is a distinct destination, visible across the valley.
  const ty=heightAt(0,-111);for(let i=0;i<6;i++)box(0,ty+.13+i*.21,-99-i*.8,13,.25,1.2,mats.stone);
  const temple=building(0,-114,13,10,0);groupBox(temple,0,6.4,-.4,9,2.5,7,mats.red);for(const sign of [-1,1]){const roof=groupBox(temple,0,8.2,sign*2,12,.3,5.4,mats.roof);roof.rotation.x=sign*.4;}groupBox(temple,0,9.5,0,12,.3,.4,mats.gold);
  // Remove the temple body collider from the combat courtyard.
  const gate=new THREE.Group();gate.position.set(0,ty,-98);scene.add(gate);for(let i=-6;i<=6;i++)groupBox(gate,i*.65,1.8,0,.16,3.6,.16,mats.gold);
  for(const sign of [-1,1]){const x=sign*9;box(x,ty+1.5,-105,1,3,17,mats.darkStone);lantern(sign*6,-101);}
  // Small floating motes give the still forest life.
  const motePositions=new Float32Array(150*3);for(let i=0;i<150;i++){motePositions[i*3]=range(-60,60);motePositions[i*3+1]=range(.8,6);motePositions[i*3+2]=range(-100,30);}const moteGeo=new THREE.BufferGeometry();moteGeo.setAttribute('position',new THREE.BufferAttribute(motePositions,3));const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:0xf1d697,size:.055,transparent:true,opacity:.65,depthWrite:false}));scene.add(motes);
  return {colliders,grassMesh,gate,campFlags,shrineRings,
    update(t){wind.value=t;water.material.roughness=.29+Math.sin(t*.6)*.035;for(let i=0;i<flames.length;i++){const a=flames[i];a.scale.y=2.7+Math.sin(t*12+i)*.35;a.material.opacity=.8+Math.sin(t*9+i)*.15;}motes.position.x=Math.sin(t*.06)*2;for(let i=0;i<shrineRings.length;i++){shrineRings[i].material.color.setScalar(.85+Math.sin(t*2+i)*.15);}for(let i=0;i<campFlags.length;i++)campFlags[i].rotation.y=Math.sin(t*2+i)*.12;},
    freeCamp(index){campFlags[index].material.color.setHex(0xb0b889);},
    openGate(){gate.visible=false;},
    ground
  };
}
