import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LAND_MASK_PNG, LAND_MASK_W, LAND_MASK_H } from './land-mask.js';

const COLORS = {
  green: new THREE.Color('#00e87a'),
  amber: new THREE.Color('#f0a500'),
  blue:  new THREE.Color('#4a9eff'),
  gold:  new THREE.Color('#c9a84c'),
  wire2: new THREE.Color('#2a2a32'),
  atmos: new THREE.Color('#00e87a'),
  city:  new THREE.Color('#f0ede8'),
};

const SIGNAL_COLORS = {
  green: '#00e87a', amber: '#f0a500', blue: '#4a9eff', gold: '#c9a84c',
};

const CITIES = [
  { id: 'NYC', name: 'New York',  lat:  40.71, lon:  -74.01 },
  { id: 'LDN', name: 'London',    lat:  51.51, lon:   -0.13 },
  { id: 'TYO', name: 'Tokyo',     lat:  35.68, lon:  139.69 },
  { id: 'HKG', name: 'Hong Kong', lat:  22.28, lon:  114.16 },
  { id: 'SNG', name: 'Singapore', lat:   1.35, lon:  103.82 },
  { id: 'ZRH', name: 'Zurich',    lat:  47.37, lon:    8.55 },
  { id: 'FRA', name: 'Frankfurt', lat:  50.11, lon:    8.68 },
  { id: 'SHA', name: 'Shanghai',  lat:  31.23, lon:  121.47 },
  { id: 'MUM', name: 'Mumbai',    lat:  19.08, lon:   72.88 },
  { id: 'SAO', name: 'São Paulo', lat: -23.55, lon:  -46.63 },
  { id: 'DXB', name: 'Dubai',     lat:  25.20, lon:   55.27 },
  { id: 'SYD', name: 'Sydney',    lat: -33.87, lon:  151.21 },
];

const FLOWS = [
  { from: 'NYC', to: 'TYO', signal: 'green', ticker: 'NVDA',  label: 'Load-the-Boat flow' },
  { from: 'LDN', to: 'NYC', signal: 'amber', ticker: 'BRK.B', label: 'Super-Investor rotation' },
  { from: 'HKG', to: 'SNG', signal: 'gold',  ticker: 'TSM',   label: 'Full-Stack Consensus' },
  { from: 'ZRH', to: 'FRA', signal: 'blue',  ticker: 'NESN',  label: 'AI model re-weight' },
  { from: 'NYC', to: 'LDN', signal: 'green', ticker: 'COST',  label: 'Wave C entry' },
  { from: 'SHA', to: 'HKG', signal: 'amber', ticker: 'BABA',  label: 'Accumulate zone' },
  { from: 'MUM', to: 'DXB', signal: 'blue',  ticker: 'TCS',   label: 'Macro flow' },
  { from: 'TYO', to: 'SYD', signal: 'green', ticker: '7203',  label: 'Wave 2 entry' },
  { from: 'SAO', to: 'NYC', signal: 'amber', ticker: 'VALE',  label: 'Politician net-buy' },
  { from: 'FRA', to: 'NYC', signal: 'green', ticker: 'SAP',   label: 'Load-the-Boat flow' },
  { from: 'LDN', to: 'SNG', signal: 'blue',  ticker: 'HSBC',  label: 'AI model signal' },
  { from: 'NYC', to: 'SAO', signal: 'gold',  ticker: 'MELI',  label: 'Full-Stack Consensus' },
];

const RADIUS = 1.0;
const ARC_HEIGHT = 0.55;

function latLonToVec3(lat, lon, r = RADIUS) {
  const la = lat * Math.PI / 180;
  const lo = lon * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.cos(la) * Math.cos(lo),
     r * Math.sin(la),
     r * Math.cos(la) * Math.sin(lo),
  );
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export default function CapitalFlowGlobe() {
  const containerRef = useRef(null);
  const [flow, setFlow] = useState({
    signal: 'green', from: 'NYC', to: 'TYO', ticker: 'NVDA', label: 'Load-the-Boat flow',
  });
  const [tickerVisible, setTickerVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0c0c0e, 3.8, 6.5);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.set(0, 0.6, 3.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Solid near-invisible core for depth-write
    const coreGeo = new THREE.SphereGeometry(RADIUS * 0.995, 64, 64);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x0c0c0e, transparent: true, opacity: 0.92,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Wire mesh graticule
    const wireGeo = new THREE.SphereGeometry(RADIUS, 36, 18);
    const wireMat = new THREE.LineBasicMaterial({
      color: COLORS.wire2, transparent: true, opacity: 0.35,
    });
    globeGroup.add(new THREE.LineSegments(new THREE.WireframeGeometry(wireGeo), wireMat));

    // Dotted continents from inlined land mask
    const DOT_COUNT = 14000;
    const dotMat = new THREE.PointsMaterial({
      size: 0.014,
      color: new THREE.Color('#8fe4bf'),
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const img = new Image();
    img.onload = () => {
      const W = LAND_MASK_W, H = LAND_MASK_H;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H).data;
      const isLand = (lat, lon) => {
        const u = (lon + 180) / 360;
        const v = (90 - lat) / 180;
        const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
        const y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
        return imgData[(y * W + x) * 4] > 128;
      };
      const positions = [];
      for (let i = 0; i < DOT_COUNT; i++) {
        const k = i + 0.5;
        const phi = Math.acos(1 - 2 * k / DOT_COUNT);
        const theta = Math.PI * (1 + Math.sqrt(5)) * k;
        const lat  = 90 - (phi * 180 / Math.PI);
        const lonN = (((theta * 180 / Math.PI) + 180) % 360) - 180;
        if (!isLand(lat, lonN)) continue;
        const la = lat  * Math.PI / 180;
        const lo = lonN * Math.PI / 180;
        const r = RADIUS * 1.005;
        positions.push(
          -Math.cos(la) * Math.cos(lo) * r,
           Math.sin(la)                * r,
           Math.cos(la) * Math.sin(lo) * r,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      globeGroup.add(new THREE.Points(geo, dotMat));
    };
    img.src = LAND_MASK_PNG;

    // Atmosphere glow (back-side green haze)
    const atmGeo = new THREE.SphereGeometry(RADIUS * 1.12, 48, 48);
    const atmMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: { color: { value: COLORS.atmos } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 color;
        void main() {
          float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(color, 1.0) * intensity * 0.9;
        }
      `,
    });
    globeGroup.add(new THREE.Mesh(atmGeo, atmMat));

    // City markers
    const cityPositions = {};
    const cityRings = [];
    for (const c of CITIES) {
      const pos = latLonToVec3(c.lat, c.lon, RADIUS * 1.004);
      cityPositions[c.id] = pos;

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({ color: COLORS.city }),
      );
      marker.position.copy(pos);
      globeGroup.add(marker);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.035, 24),
        new THREE.MeshBasicMaterial({
          color: COLORS.green, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
        }),
      );
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      ring.userData = { t: Math.random() * 4, city: c.id };
      globeGroup.add(ring);
      cityRings.push(ring);
    }

    function makeArc(fromId, toId, colorKey) {
      const a = cityPositions[fromId];
      const b = cityPositions[toId];
      if (!a || !b) return null;

      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dist = a.distanceTo(b);
      const lift = RADIUS + ARC_HEIGHT * (0.6 + dist * 0.55);
      mid.normalize().multiplyScalar(lift);

      const curve = new THREE.CubicBezierCurve3(
        a,
        a.clone().lerp(mid, 0.55).normalize().multiplyScalar(RADIUS + ARC_HEIGHT * 0.35 + dist * 0.18),
        b.clone().lerp(mid, 0.55).normalize().multiplyScalar(RADIUS + ARC_HEIGHT * 0.35 + dist * 0.18),
        b,
      );
      const points = curve.getPoints(64);

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: COLORS[colorKey], transparent: true, opacity: 0.0,
      });
      const line = new THREE.Line(geo, mat);
      globeGroup.add(line);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: COLORS[colorKey], transparent: true, opacity: 0.0 }),
      );
      globeGroup.add(head);

      const spriteMat = new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: COLORS[colorKey],
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Sprite(spriteMat);
      glow.scale.set(0.22, 0.22, 1);
      globeGroup.add(glow);

      return { curve, line, head, glow, colorKey };
    }

    let arcs = [];
    let flowIdx = 0;

    function fireNextFlow() {
      const f = FLOWS[flowIdx % FLOWS.length];
      flowIdx++;

      const arc = makeArc(f.from, f.to, f.signal);
      if (!arc) return;

      arc.t = 0;
      arc.duration = 2.4 + Math.random() * 0.8;
      arcs.push(arc);

      // Update React state for the flow ticker
      setTickerVisible(false);
      setTimeout(() => {
        setFlow(f);
        setTickerVisible(true);
      }, 180);

      for (const ring of cityRings) {
        if (ring.userData.city === f.from || ring.userData.city === f.to) {
          ring.material.color = COLORS[f.signal];
          ring.userData.t = 0;
        }
      }
    }

    const t1 = setTimeout(fireNextFlow, 200);
    const t2 = setTimeout(fireNextFlow, 600);
    const t3 = setTimeout(fireNextFlow, 1000);
    const cadence = setInterval(fireNextFlow, 700);

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let targetRotY = 0, targetRotX = 0;
    const onPointerMove = (e) => {
      const r = container.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width  - 0.5;
      const ny = (e.clientY - r.top)  / r.height - 0.5;
      targetRotY = nx * 0.4;
      targetRotX = ny * 0.2;
    };
    container.addEventListener('pointermove', onPointerMove);

    let running = true;
    let rafId;
    const clock = new THREE.Clock();

    function tick() {
      if (!running) return;
      const dt = clock.getDelta();

      globeGroup.rotation.y += dt * 0.09;
      globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.03;

      for (const ring of cityRings) {
        ring.userData.t += dt;
        const t = ring.userData.t;
        const cycle = 3.0;
        const phase = (t % cycle) / cycle;
        ring.material.opacity = Math.max(0, 0.55 * (1 - phase));
        const s = 1 + phase * 1.8;
        ring.scale.set(s, s, s);
      }

      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.t += dt;
        const p = a.t / a.duration;

        if (p >= 1.1) {
          globeGroup.remove(a.line);
          globeGroup.remove(a.head);
          globeGroup.remove(a.glow);
          a.line.geometry.dispose();
          a.line.material.dispose();
          a.head.geometry.dispose();
          a.head.material.dispose();
          a.glow.material.dispose();
          arcs.splice(i, 1);
          continue;
        }

        const reveal = Math.min(1, p * 1.15);
        const totalPts = 64;
        const visible = Math.max(2, Math.floor(totalPts * reveal));
        const points = a.curve.getPoints(totalPts).slice(0, visible);
        a.line.geometry.setFromPoints(points);

        a.line.material.opacity = Math.min(0.75, p * 2) * (1 - Math.max(0, (p - 0.85) / 0.25));

        const headT = Math.min(1, p / 0.85);
        const pos = a.curve.getPoint(headT);
        a.head.position.copy(pos);
        a.glow.position.copy(pos);

        const headAlpha = Math.min(1, p * 4) * (1 - Math.max(0, (p - 0.75) / 0.3));
        a.head.material.opacity = headAlpha;
        a.glow.material.opacity = headAlpha * 0.9;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearInterval(cadence);
      ro.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="hero-globe">
      <div
        ref={containerRef}
        id="globe"
        style={{ position: 'absolute', inset: 0, cursor: 'grab', zIndex: 2 }}
      />
      <div
        className="flow-ticker"
        style={{ opacity: tickerVisible ? 1 : 0 }}
      >
        <span className="dot" style={{ background: SIGNAL_COLORS[flow.signal] }} />
        <span className="pair">
          {flow.from}<span className="arrow">→</span>{flow.to}
        </span>
        <span className="tk">{flow.ticker}</span>
        <span className="label">· {flow.label}</span>
        <span className="meta">Live</span>
      </div>
    </div>
  );
}
