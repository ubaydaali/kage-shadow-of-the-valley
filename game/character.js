import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
let template;
export async function loadNinja(progress){
  const gltf=await new GLTFLoader().loadAsync('./assets/ninja.glb',e=>progress(e.total?e.loaded/e.total:.4));
  let source;gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o.isMesh&&!source)source=o;});
  if(!source)throw new Error('ملف الشخصية لا يحتوي على مجسم');
  const geometry=source.geometry.clone();geometry.applyMatrix4(source.matrixWorld);geometry.computeBoundingBox();
  const b=geometry.boundingBox,scale=2.05/(b.max.y-b.min.y);
  geometry.translate(-(b.max.x+b.min.x)/2,-b.min.y,-(b.max.z+b.min.z)/2);geometry.scale(scale,scale,scale);geometry.rotateY(Math.PI);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const material=source.material.clone();material.roughness=.88;material.metalness=.08;material.envMapIntensity=.55;material.side=THREE.FrontSide;
  // The supplied mesh has no rig. Bind it to a spatially weighted humanoid skeleton.
  const defs=[
    ['hips',-1,0,1.01,0],['spine',0,0,1.23,0],['chest',1,0,1.48,0],['head',2,0,1.78,0],
    ['armL',2,.29,1.53,0],['foreL',4,.42,1.16,0],['handL',5,.43,.86,0],
    ['armR',2,-.29,1.53,0],['foreR',7,-.42,1.16,0],['handR',8,-.43,.86,0],
    ['legL',0,.18,.96,0],['shinL',10,.23,.52,0],['footL',11,.24,.12,-.02],
    ['legR',0,-.18,.96,0],['shinR',13,-.23,.52,0],['footR',14,-.24,.12,-.02],
  ];
  const positions=geometry.attributes.position,indices=[],weights=[];
  function blend(a,b,t){t=clamp(t,0,1);return[[a,1-t],[b,t]];}
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),ax=Math.abs(x);const left=x>0;
    let w;
    if(y>1.67)w=blend(2,3,(y-1.67)/.13);
    else if(y>.77&&ax>.28&&ax>(y<.9?.35:(.29-(1.5-y)*.05))){
      const upper=left?4:7,fore=left?5:8,hand=left?6:9;
      if(y>1.42)w=blend(2,upper,(ax-.25)/.1);
      else if(y>1.08)w=blend(upper,fore,(1.29-y)/.2);
      else w=blend(fore,hand,(1.0-y)/.19);
    }else if(y<.92){const leg=left?10:13,shin=left?11:14,foot=left?12:15;
      if(y>.72)w=blend(0,leg,(.94-y)/.25*.65);
      else if(y>.4)w=blend(leg,shin,(.61-y)/.18);
      else w=blend(shin,foot,(.23-y)/.13);
    }else if(y>1.36)w=blend(1,2,(y-1.36)/.13);
    else w=blend(0,1,(y-1.05)/.26);
    while(w.length<4)w.push([0,0]);for(const [id,weight]of w){indices.push(id);weights.push(weight);}
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  template={geometry,material,defs};progress(1);return template;
}

export function createFighter({enemy=false,boss=false}={}){
  const {geometry,material,defs}=template;const root=new THREE.Group();const visual=new THREE.Group();root.add(visual);
  const mat=material.clone();if(enemy){mat.color.setHex(boss?0xc59878:0x9da89b);mat.emissive.setHex(0x20110b);mat.emissiveIntensity=.05;}
  const skin=new THREE.SkinnedMesh(geometry,mat);skin.castShadow=true;skin.receiveShadow=true;skin.boundingSphere=new THREE.Sphere(V(0,1,0),2.3);visual.add(skin);
  const bones=[],byName={};for(let i=0;i<defs.length;i++){const [name,parent,x,y,z]=defs[i],bone=new THREE.Bone();bone.name=name;bone.position.set(x,y,z);if(parent>=0){bone.position.sub(V(...defs[parent].slice(2)));bones[parent].add(bone);}else skin.add(bone);bones.push(bone);byName[name]=bone;}
  root.updateMatrixWorld(true);skin.bind(new THREE.Skeleton(bones));
  // A new, independently moving katana is attached to the hand bone.
  const weapon=new THREE.Group();byName.handR.add(weapon);weapon.rotation.x=.65;
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.035,.94,.07),new THREE.MeshStandardMaterial({color:0xd2e3da,metalness:.82,roughness:.24}));blade.position.y=-.56;blade.castShadow=true;weapon.add(blade);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.035,.14,3),blade.material);tip.rotation.z=Math.PI;tip.position.y=-1.09;weapon.add(tip);
  const guard=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.025,8),new THREE.MeshStandardMaterial({color:0xb8a273,metalness:.65,roughness:.4}));guard.position.y=-.08;weapon.add(guard);
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.22,7),new THREE.MeshStandardMaterial({color:0x302c20}));handle.position.y=.025;weapon.add(handle);
  // A dark sash makes hostile silhouettes distinct without replacing the user's model.
  if(enemy){const sash=new THREE.Mesh(new THREE.TorusGeometry(.19,.055,6,16),new THREE.MeshStandardMaterial({color:boss?0xad7448:0x8b3d31,roughness:1}));sash.position.set(0,.25,0);sash.rotation.x=Math.PI/2;byName.chest.add(sash);}
  if(boss)root.scale.setScalar(1.3);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.55,24),new THREE.MeshBasicMaterial({color:0x102018,transparent:true,opacity:.23,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;root.add(shadow);
  const trail=new THREE.Mesh(new THREE.RingGeometry(.65,1.95,36,1,0,Math.PI*1.15),new THREE.MeshBasicMaterial({color:enemy?0xd88c66:0xe1d4a2,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));trail.rotation.x=-Math.PI/2;trail.position.y=1.1;visual.add(trail);
  const state={root,visual,skin,bones:byName,weapon,trail,shadow,enemy,boss,walk:0,flash:0,fall:0};
  state.animate=(dt,time,{speed=0,attack=0,combo=0,dodge=0,block=false,jump=0,telegraph=0,dead=false,special=0}={})=>{
    const n=byName;for(const bone of bones)bone.rotation.set(0,0,0);
    const movement=clamp(speed/4.2,0,1.45);state.walk+=dt*(speed>0.3?9+speed*.7:1.2);const phase=state.walk;
    n.hips.position.y=1.01+Math.sin(phase*2)*.035*movement+Math.sin(time*2)*.008;
    n.spine.rotation.x=-.07*movement;n.chest.rotation.y=Math.sin(phase)*.06*movement;
    n.armL.rotation.z=.13;n.armR.rotation.z=-.13;
    n.armL.rotation.x=Math.sin(phase)*.6*movement+.1;n.armR.rotation.x=-Math.sin(phase)*.55*movement+.12;
    n.foreL.rotation.x=.18+.3*movement;n.foreR.rotation.x=.2+.35*movement;
    n.legL.rotation.x=-Math.sin(phase)*.69*movement;n.legR.rotation.x=Math.sin(phase)*.69*movement;
    n.shinL.rotation.x=-Math.max(0,Math.sin(phase))*.95*movement;n.shinR.rotation.x=-Math.max(0,-Math.sin(phase))*.95*movement;
    n.footL.rotation.x=-n.shinL.rotation.x*.4;n.footR.rotation.x=-n.shinR.rotation.x*.4;
    visual.rotation.set(0,0,0);visual.position.y=0;
    if(jump>.05){n.legL.rotation.x=.5;n.legR.rotation.x=-.4;n.shinL.rotation.x=-.85;n.shinR.rotation.x=-.6;n.armL.rotation.z=.5;}
    if(block){n.armR.rotation.x=1.55;n.armR.rotation.z=-.45;n.foreR.rotation.x=1.1;n.armL.rotation.x=1.3;n.foreL.rotation.x=.9;n.chest.rotation.y=-.18;}
    if(telegraph>0){n.armR.rotation.z=-.75;n.armR.rotation.x=2.5;n.foreR.rotation.x=.8;visual.position.y=-.07;}
    if(attack>0){const a=clamp(attack,0,1),swing=Math.sin(a*Math.PI);const dir=combo%2===0?1:-1;
      n.chest.rotation.y=dir*(-.55+a*1.3);n.spine.rotation.x=-swing*.18;
      n.armR.rotation.x=1.5+swing*.7;n.armR.rotation.z=dir*(.9-a*1.8);n.foreR.rotation.x=.45;
      n.armL.rotation.x=.6;n.foreL.rotation.x=.65;weapon.rotation.z=dir*swing*.45;
      trail.material.opacity=(a>.17&&a<.73)?Math.sin((a-.17)/.56*Math.PI)*.5:0;trail.rotation.z=dir*a*2.6;
    }else{trail.material.opacity=0;weapon.rotation.z=0;}
    if(special>0){visual.rotation.y=special*Math.PI*4;n.armR.rotation.z=-1.5;n.foreR.rotation.x=0;trail.material.opacity=.75;trail.scale.setScalar(1.7);trail.rotation.z=time*15;}else trail.scale.setScalar(1);
    if(dodge>0){n.hips.rotation.x=dodge*Math.PI*2;visual.position.y=-Math.sin(dodge*Math.PI)*.25;n.legL.rotation.x=.8;n.legR.rotation.x=.8;n.shinL.rotation.x=-1.4;n.shinR.rotation.x=-1.4;n.armL.rotation.x=1.3;n.armR.rotation.x=1.1;}
    if(dead){state.fall=THREE.MathUtils.damp(state.fall,1.55,5,dt);n.hips.rotation.z=state.fall;visual.position.y=-.7;}else state.fall=0;
    if(state.flash>0){state.flash-=dt;mat.emissive.setHex(0xffd3a0);mat.emissiveIntensity=state.flash*3;}else{mat.emissive.setHex(telegraph>0?0xc23e22:0x000000);mat.emissiveIntensity=telegraph>0?.6:0;}
  };
  return state;
}
