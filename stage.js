// Escenario de Herbie sobre el QR: pedestal de luz, anillos, destellos y el carro flotando.
// Espacio de la tarjeta (MindAR): plano X-Y, ancho de tarjeta = 1, Z sale de la tarjeta hacia la cámara.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TEAL = 0x1A6E64, TEAL_L = 0x2E938A, AMBER = 0xE4972E;

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(190,240,232,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

export function setupLighting(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(0.6, 0.8, 1.5); scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

export function buildStage(qr, modelUrl) {
  const root = new THREE.Group();          // se cuelga del ancla de la tarjeta
  const base = new THREE.Group();
  base.position.set(qr.x, qr.y, 0);
  root.add(base);

  // Halo sobre el QR
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(46,147,138,0.30)'], [0.45, 'rgba(46,147,138,0.12)'], [1, 'rgba(46,147,138,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.z = 0.003; base.add(halo);

  // Anillos del pedestal
  const ringMat = new THREE.MeshBasicMaterial({ color: TEAL_L, transparent: true, opacity: 0.95 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.006, 12, 120), ringMat);
  ring1.position.z = 0.006; base.add(ring1);
  const ring2 = new THREE.Group(); ring2.position.z = 0.008; base.add(ring2);
  const arcMat = new THREE.MeshBasicMaterial({ color: AMBER });
  for (let i = 0; i < 6; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.005, 8, 40, Math.PI / 6), arcMat);
    arc.rotation.z = i * Math.PI / 3; ring2.add(arc);
  }

  // Haz de luz
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.42, 64, 1, true), new THREE.MeshBasicMaterial({
    map: beamTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = Math.PI / 2; beam.position.z = 0.21; base.add(beam);

  // Destellos que suben girando (posiciones fijas, sin azar)
  const N = 28, sp = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ a: i * 2.399, r: 0.16 + (i % 5) * 0.035, h: (i * 0.137) % 1, s: 0.6 + (i % 3) * 0.25 });
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({
    size: 0.022, map: radialTexture([[0, 'rgba(255,236,190,1)'], [0.35, 'rgba(228,151,46,0.8)'], [1, 'rgba(228,151,46,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  base.add(sparks);

  // Sombra del carro
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.18)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  shadow.position.z = 0.004; base.add(shadow);

  // Carro: pivote que flota y gira alrededor del eje de la tarjeta
  const pivot = new THREE.Group(); base.add(pivot);
  const upright = new THREE.Group(); upright.rotation.x = Math.PI / 2; pivot.add(upright);
  new GLTFLoader().load(modelUrl, (gltf) => {
    const car = gltf.scene;
    car.scale.setScalar(1.15);
    const box = new THREE.Box3().setFromObject(car);
    car.position.y = -box.min.y - 0.02;  // las ruedas quedan justo sobre el pivote
    car.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.envMapIntensity = 1.1; }); });
    upright.add(car);
  });

  let shown = 0, target = 0, last = 0;
  const easeOutBack = x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

  return {
    root,
    show() { target = 1; },
    hide() { target = 0; },
    update(t) {
      const dt = Math.min(0.05, t - last); last = t;
      shown += (target - shown) * Math.min(1, dt * 3.2);   // aparece suave
      const k = target ? easeOutBack(Math.min(1, shown)) : shown;
      base.scale.setScalar(Math.max(0.001, k));

      const bob = Math.sin(t * 1.4);
      pivot.position.z = 0.24 + 0.025 * bob;
      pivot.rotation.z = t * 0.5;                          // una vuelta cada ~12 s
      pivot.rotation.x = 0.06 * Math.sin(t * 0.9);         // leve vaivén
      shadow.scale.setScalar(0.5 - 0.06 * bob);
      ring1.rotation.z = t * 0.3; ring2.rotation.z = -t * 0.45;
      ringMat.opacity = 0.75 + 0.2 * Math.sin(t * 2.2);
      for (let i = 0; i < N; i++) {
        const s = seeds[i], h = (s.h + t * 0.08 * s.s) % 1, a = s.a + t * 0.4 * s.s;
        sp[i * 3] = Math.cos(a) * s.r * (1 - h * 0.3); sp[i * 3 + 1] = Math.sin(a) * s.r * (1 - h * 0.3); sp[i * 3 + 2] = 0.02 + h * 0.45;
      }
      sgeo.attributes.position.needsUpdate = true;
    },
  };
}

