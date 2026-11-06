// Dotted-continent globe with animated arcs. Adapted from SimuAlpha's CapitalFlowGlobe:
// same look, but the arcs connect places behind the show's topics (faith, philosophy,
// history, politics, news, culture). Loaded lazily so three.js stays out of the main bundle.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LAND_MASK_H, LAND_MASK_PNG, LAND_MASK_W } from './land-mask';

const COLORS = {
  green: new THREE.Color('#00e87a'),
  amber: new THREE.Color('#f0a500'),
  blue: new THREE.Color('#4a9eff'),
  gold: new THREE.Color('#c9a84c'),
  wire: new THREE.Color('#2a2a32'),
  city: new THREE.Color('#f0ede8'),
};
type Signal = 'green' | 'amber' | 'blue' | 'gold';

const PLACES = [
  { id: 'JER', lat: 31.78, lon: 35.22 }, // Jerusalem: religion
  { id: 'ATH', lat: 37.98, lon: 23.73 }, // Athens: philosophy
  { id: 'ROM', lat: 41.9, lon: 12.5 }, // Rome: history
  { id: 'WIT', lat: 51.87, lon: 12.65 }, // Wittenberg: history / religion
  { id: 'LDN', lat: 51.51, lon: -0.13 }, // London: literature
  { id: 'PAR', lat: 48.86, lon: 2.35 }, // Paris: arts
  { id: 'DCA', lat: 38.91, lon: -77.04 }, // Washington: politics
  { id: 'NYC', lat: 40.71, lon: -74.01 }, // New York: news, economics
  { id: 'NSH', lat: 36.16, lon: -86.78 }, // Nashville: music
  { id: 'LAX', lat: 34.05, lon: -118.24 }, // Los Angeles: movies, pop culture
  { id: 'TYO', lat: 35.68, lon: 139.69 }, // Tokyo: science
  { id: 'SAO', lat: -23.55, lon: -46.63 }, // São Paulo
];

const FLOWS: [string, string, Signal][] = [
  ['JER', 'ROM', 'gold'],
  ['ATH', 'LDN', 'blue'],
  ['ROM', 'NYC', 'amber'],
  ['NYC', 'DCA', 'green'],
  ['LAX', 'NYC', 'amber'],
  ['NSH', 'LAX', 'green'],
  ['PAR', 'NYC', 'blue'],
  ['WIT', 'LDN', 'gold'],
  ['JER', 'ATH', 'gold'],
  ['TYO', 'LAX', 'blue'],
  ['DCA', 'JER', 'green'],
  ['SAO', 'NYC', 'amber'],
];

const RADIUS = 1;
const ARC_HEIGHT = 0.55;

function latLonToVec3(lat: number, lon: number, r = RADIUS) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), r * Math.cos(la) * Math.sin(lo));
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Arc {
  curve: THREE.CubicBezierCurve3;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  t: number;
  duration: number;
}

export default function Globe({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0c0c0e, 3.8, 6.5);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.set(0, 0.6, 3.6);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the page just shows without a globe
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    globe.rotation.y = 1.2; // start facing ~20°E (Mediterranean); spins westward toward the Americas
    scene.add(globe);

    globe.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 0.995, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.92 }),
      ),
    );
    globe.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(RADIUS, 36, 18)),
        new THREE.LineBasicMaterial({ color: COLORS.wire, transparent: true, opacity: 0.35 }),
      ),
    );

    // Dotted continents from the land mask (Fibonacci sphere sampling)
    const dotMat = new THREE.PointsMaterial({
      size: 0.014,
      color: new THREE.Color('#8fe4bf'),
      transparent: true,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = LAND_MASK_W;
      canvas.height = LAND_MASK_H;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, LAND_MASK_W, LAND_MASK_H).data;
      const isLand = (lat: number, lon: number) => {
        const x = Math.min(LAND_MASK_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * LAND_MASK_W)));
        const y = Math.min(LAND_MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LAND_MASK_H)));
        return data[(y * LAND_MASK_W + x) * 4] > 128;
      };
      const N = 14000;
      const pos: number[] = [];
      for (let i = 0; i < N; i++) {
        const k = i + 0.5;
        const lat = 90 - (Math.acos(1 - (2 * k) / N) * 180) / Math.PI;
        const lon = ((((Math.PI * (1 + Math.sqrt(5)) * k * 180) / Math.PI + 180) % 360) - 180);
        if (isLand(lat, lon)) pos.push(...latLonToVec3(lat, lon, RADIUS * 1.005).toArray());
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      globe.add(new THREE.Points(geo, dotMat));
      if (reduceMotion) renderer.render(scene, camera);
    };
    img.src = LAND_MASK_PNG;

    // Atmosphere
    globe.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 1.12, 48, 48),
        new THREE.ShaderMaterial({
          transparent: true,
          side: THREE.BackSide,
          uniforms: { color: { value: COLORS.green } },
          vertexShader: `varying vec3 vNormal;
            void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `varying vec3 vNormal; uniform vec3 color;
            void main() { float i = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0); gl_FragColor = vec4(color, 1.0) * i * 0.9; }`,
        }),
      ),
    );

    // Place markers with pulsing rings
    const placePos: Record<string, THREE.Vector3> = {};
    const rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
    for (const p of PLACES) {
      const v = latLonToVec3(p.lat, p.lon, RADIUS * 1.004);
      placePos[p.id] = v;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), new THREE.MeshBasicMaterial({ color: COLORS.city }));
      marker.position.copy(v);
      globe.add(marker);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.035, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0, side: THREE.DoubleSide }),
      );
      ring.position.copy(v);
      ring.lookAt(v.clone().multiplyScalar(2));
      ring.userData = { t: Math.random() * 3, place: p.id };
      globe.add(ring);
      rings.push(ring);
    }

    const glowTex = makeGlowTexture();
    const arcs: Arc[] = [];
    let flowIdx = 0;

    function fire() {
      const [from, to, signal] = FLOWS[flowIdx++ % FLOWS.length];
      const a = placePos[from];
      const b = placePos[to];
      const dist = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS + ARC_HEIGHT * (0.6 + dist * 0.55));
      const ctrlR = RADIUS + ARC_HEIGHT * 0.35 + dist * 0.18;
      const curve = new THREE.CubicBezierCurve3(
        a,
        a.clone().lerp(mid, 0.55).normalize().multiplyScalar(ctrlR),
        b.clone().lerp(mid, 0.55).normalize().multiplyScalar(ctrlR),
        b,
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)),
        new THREE.LineBasicMaterial({ color: COLORS[signal], transparent: true, opacity: 0 }),
      );
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: COLORS[signal], transparent: true, opacity: 0 }),
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: COLORS[signal],
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.set(0.22, 0.22, 1);
      globe.add(line, head, glow);
      arcs.push({ curve, line, head, glow, t: 0, duration: 2.4 + Math.random() * 0.8 });
      for (const r of rings) {
        if (r.userData.place === from || r.userData.place === to) {
          r.material.color = COLORS[signal];
          r.userData.t = 0;
        }
      }
    }

    function resize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduceMotion) renderer.render(scene, camera);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let targetRotX = 0;
    const onPointerMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      targetRotX = ((e.clientY - r.top) / r.height - 0.5) * 0.2;
    };
    container.addEventListener('pointermove', onPointerMove);

    // Only animate while on screen and the tab is visible (saves phone batteries).
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(container);
    const onVis = () => !document.hidden && start();
    document.addEventListener('visibilitychange', onVis);

    const clock = new THREE.Clock();
    let rafId = 0;
    let running = false;
    let sinceFire = 0;
    const timers = reduceMotion ? [] : [200, 600, 1000].map((ms) => window.setTimeout(fire, ms));

    function tick() {
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.1);
      globe.rotation.y += dt * 0.09;
      globe.rotation.x += (targetRotX - globe.rotation.x) * 0.03;

      sinceFire += dt;
      if (sinceFire > 0.7) {
        sinceFire = 0;
        fire();
      }

      for (const r of rings) {
        r.userData.t += dt;
        const phase = (r.userData.t % 3) / 3;
        r.material.opacity = Math.max(0, 0.55 * (1 - phase));
        const s = 1 + phase * 1.8;
        r.scale.set(s, s, s);
      }

      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.t += dt;
        const p = a.t / a.duration;
        if (p >= 1.1) {
          globe.remove(a.line, a.head, a.glow);
          a.line.geometry.dispose();
          a.line.material.dispose();
          a.head.geometry.dispose();
          a.head.material.dispose();
          a.glow.material.dispose();
          arcs.splice(i, 1);
          continue;
        }
        a.line.geometry.setFromPoints(a.curve.getPoints(64).slice(0, Math.max(2, Math.floor(64 * Math.min(1, p * 1.15)))));
        a.line.material.opacity = Math.min(0.75, p * 2) * (1 - Math.max(0, (p - 0.85) / 0.25));
        const at = a.curve.getPoint(Math.min(1, p / 0.85));
        a.head.position.copy(at);
        a.glow.position.copy(at);
        const alpha = Math.min(1, p * 4) * (1 - Math.max(0, (p - 0.75) / 0.3));
        a.head.material.opacity = alpha;
        a.glow.material.opacity = alpha * 0.9;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (reduceMotion || running) return;
      running = true;
      clock.getDelta();
      rafId = requestAnimationFrame(tick);
    }
    start();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      container.removeEventListener('pointermove', onPointerMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      glowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={ref} className={'globe ' + (className ?? '')} aria-hidden />;
}
