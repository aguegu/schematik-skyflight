import * as THREE from 'three';
import { GATE_RADIUS } from './game.js';

const ORANGE = 0xef6a28;
const BURNT_ORANGE = 0xa94822;
const CREAM = 0xfff0cf;
const INK = 0x233d42;
const SEA = 0x397f8d;

function seeded(seed = 41) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
const random = seeded();
const range = (a, b) => a + random() * (b - a);
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });

function mesh(geometry, mat, parent, position = [0, 0, 0], scale = [1, 1, 1]) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(...position);
  object.scale.set(...scale);
  parent.add(object);
  return object;
}

function wingGeometry(points, depth = 0.13) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.06, bevelThickness: 0.04,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// loadTexture(name, done): the page's image loader, or in a worker (no images
// there) the bitmaps the page made of the same files
function makePlane(loadTexture) {
  const plane = new THREE.Group();
  const orange = material(ORANGE, { roughness: 0.34, metalness: 0.17 });
  const lightOrange = material(0xff8b3d, { roughness: 0.4 });
  const cream = material(CREAM, { roughness: 0.45 });
  const dark = material(INK, { roughness: 0.38, metalness: 0.3 });
  const black = material(0x253235);
  const seam = material(BURNT_ORANGE, { roughness: 0.5, metalness: 0.12 });
  const profile = [[0.08, -3.2], [0.25, -2.7], [0.42, -1.7], [0.7, -0.2], [0.78, 0.9], [0.65, 2.15], [0.48, 2.65], [0.14, 2.95]];
  const body = mesh(new THREE.LatheGeometry(profile.map(point => new THREE.Vector2(...point)), 24), orange, plane);
  body.rotation.x = -Math.PI / 2;
  body.scale.x = 0.88;

  // Broad, friendly silhouette first; restrained mechanical detail is layered over it.
  mesh(wingGeometry([[-.45, -.9], [-5.8, -.35], [-6.4, .6], [-6.1, 1.15], [-.5, 1.1], [.5, 1.1], [6.1, 1.15], [6.4, .6], [5.8, -.35], [.45, -.9]]), orange, plane, [0, -.05, 0]);
  mesh(wingGeometry([[-.2, 2], [-2.1, 2.6], [-2.3, 3.2], [2.3, 3.2], [2.1, 2.6], [.2, 2]]), lightOrange, plane, [0, .22, 0]);
  const finShape = new THREE.Shape();
  finShape.moveTo(1.65, .2); finShape.lineTo(2.4, 2.2); finShape.lineTo(3.1, 2.45); finShape.lineTo(3.25, .2); finShape.closePath();
  const fin = mesh(new THREE.ExtrudeGeometry(finShape, { depth: .13, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 2, steps: 1 }), orange, plane);
  fin.rotation.y = -Math.PI / 2;
  fin.position.x = .06;

  // Painted wing markings and fine control-surface seams.
  for (const side of [-1, 1]) {
    const stripe = mesh(new THREE.BoxGeometry(.32, .025, 1.18), cream, plane, [side * 4.9, .17, .37]);
    stripe.rotation.y = side * -.08;
    mesh(new THREE.BoxGeometry(.13, .03, 1.13), dark, plane, [side * 5.18, .17, .41]);
    mesh(new THREE.BoxGeometry(2.35, .018, .035), seam, plane, [side * 3.18, .188, 1.01]);
    const rib = mesh(new THREE.BoxGeometry(.025, .018, 1.5), seam, plane, [side * 4.05, .189, .27]);
    rib.rotation.y = side * -.06;
    mesh(new THREE.SphereGeometry(.12, 8, 6), material(side < 0 ? 0xee4732 : 0x80d6b8, { emissive: side < 0 ? 0xaa2200 : 0x22885e, emissiveIntensity: .5 }), plane, [side * 6.15, .16, .64]);

    // Wheel fairings and black tires, tucked under each wing.
    const strut = mesh(new THREE.CylinderGeometry(.045, .045, .72, 6), dark, plane, [side * 1.55, -.5, .15]);
    strut.rotation.z = side * -.28;
    mesh(new THREE.SphereGeometry(1, 12, 8), orange, plane, [side * 1.65, -.97, .18], [.19, .2, .5]);
    const wheel = mesh(new THREE.CylinderGeometry(.18, .18, .13, 12), black, plane, [side * 1.65, -1.08, .22]);
    wheel.rotation.z = Math.PI / 2;
  }

  // Fasteners are instanced so the extra aircraft detail remains one draw call.
  const fasteners = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 7, 5), dark, 24);
  const fastenerTransform = new THREE.Object3D();
  let fastenerIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 12; index++) {
      fastenerTransform.position.set(side * (1.0 + index * .43), .2, .82 - Math.abs(index - 5) * .025);
      fastenerTransform.scale.set(1, .35, 1);
      fastenerTransform.updateMatrix();
      fasteners.setMatrixAt(fastenerIndex++, fastenerTransform.matrix);
    }
  }
  plane.add(fasteners);

  // Fuselage panel bands, a dorsal seam and a glazed framed canopy.
  for (const z of [-1.62, -.72, .82, 1.75]) {
    const band = mesh(new THREE.TorusGeometry(.665 - Math.max(0, z - .8) * .09, .012, 4, 28), seam, plane, [0, 0, z]);
    band.scale.y = 1.08;
  }
  mesh(new THREE.BoxGeometry(.025, .025, 3.7), seam, plane, [0, .71, .48]);
  mesh(new THREE.SphereGeometry(1, 24, 16), dark, plane, [0, .66, -.28], [.53, .62, 1.18]);
  const canopyGlass = material(0x8cc5c8, { roughness: .18, metalness: .35 });
  mesh(new THREE.SphereGeometry(1, 20, 14), canopyGlass, plane, [0, .69, -.3], [.47, .56, 1.08]);
  const canopyFrame = mesh(new THREE.TorusGeometry(.53, .025, 6, 28, Math.PI), cream, plane, [0, .65, -.18]);
  canopyFrame.rotation.x = .1;
  mesh(new THREE.BoxGeometry(.035, .62, .055), cream, plane, [0, 1.05, -.38]).rotation.x = -.26;
  mesh(new THREE.SphereGeometry(1, 16, 12), material(0xc9eddf, { roughness: .2, metalness: .32 }), plane, [-.2, 1.02, -.58], [.065, .055, .57]);

  const cowling = mesh(new THREE.CylinderGeometry(.49, .49, .24, 20), dark, plane, [0, 0, -2.63]);
  cowling.rotation.x = Math.PI / 2;
  const exhausts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .075, .34, 7), dark, 6);
  const exhaustTransform = new THREE.Object3D();
  for (let index = 0; index < 6; index++) {
    const side = index < 3 ? -1 : 1;
    exhaustTransform.position.set(side * .47, -.23 - (index % 3) * .1, -2.29 + (index % 3) * .21);
    exhaustTransform.rotation.set(Math.PI / 2, 0, side * .18);
    exhaustTransform.updateMatrix();
    exhausts.setMatrixAt(index, exhaustTransform.matrix);
  }
  plane.add(exhausts);
  const spinner = mesh(new THREE.ConeGeometry(.35, .65, 20), cream, plane, [0, 0, -3.08]);
  spinner.rotation.x = -Math.PI / 2;
  const propeller = new THREE.Group();
  propeller.position.z = -2.83;
  plane.add(propeller);
  for (let index = 0; index < 3; index++) {
    const blade = mesh(new THREE.BoxGeometry(.17, 2.9, .055), dark, propeller);
    blade.rotation.z = index * Math.PI / 3;
  }
  const propDisc = mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0xe8ddd0, transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false }), propeller);
  propDisc.position.z = -.01;
  const pitot = mesh(new THREE.CylinderGeometry(.018, .018, .8, 6), dark, plane, [5.7, .04, -.55]);
  pitot.rotation.x = Math.PI / 2;

  // Supplied official Schematik artwork remains the hero livery.
  loadTexture('schematik-wordmark', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const decalMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) {
      const decal = mesh(new THREE.PlaneGeometry(3.4, .5), decalMaterial, plane, [side * 2.65, .205, .28]);
      decal.rotation.x = -Math.PI / 2;
    }
  });
  loadTexture('schematik-mark', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const markMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const side of [-1, 1]) {
      const decal = mesh(new THREE.PlaneGeometry(.55, .74), markMaterial, plane, [side * .153, 1.38, 2.77]);
      decal.rotation.y = side * Math.PI / 2;
    }
  });
  plane.traverse(object => { if (object.isMesh) object.castShadow = true; });
  return { plane, propeller };
}

function makeFoamGeometry(width, length, rotation) {
  const positions = [];
  const segments = 48;
  const coastPoint = (radius, angle) => {
    const wobble = 1 + .12 * Math.sin(angle * 3 + rotation) + .09 * Math.cos(angle * 5 - rotation);
    return [Math.cos(angle) * width * radius * wobble, -.72, Math.sin(angle) * length * radius * wobble];
  };
  for (let index = 0; index < segments; index++) {
    const angleA = index / segments * Math.PI * 2;
    const angleB = (index + 1) / segments * Math.PI * 2;
    const innerA = coastPoint(.99, angleA), outerA = coastPoint(1.055, angleA);
    const innerB = coastPoint(.99, angleB), outerB = coastPoint(1.055, angleB);
    positions.push(...innerA, ...outerA, ...innerB, ...innerB, ...outerA, ...outerB);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeIsland(width, length, height) {
  const group = new THREE.Group();
  const positions = [], colors = [];
  const segments = 22, rings = 7, rotation = range(0, 6);
  const palette = [0xc69a71, 0xd7b38b, 0xb8af80, 0x88987c, 0xa0ab89, 0x728d7d].map(color => new THREE.Color(color));
  function point(radius, angle) {
    const wobble = 1 + .12 * Math.sin(angle * 3 + rotation) + .09 * Math.cos(angle * 5 - rotation);
    const y = radius === 1 ? -1 : Math.pow(1 - radius, 1.45) * height + (Math.sin(angle * 3 + rotation) * .13 + .14) * height * Math.sin(radius * Math.PI);
    return new THREE.Vector3(Math.cos(angle) * width * radius * wobble, y, Math.sin(angle) * length * radius * wobble);
  }
  function triangle(a, b, c) {
    const normalizedHeight = (a.y + b.y + c.y) / 3 / height;
    const paletteIndex = normalizedHeight < .08 ? (random() < .5 ? 0 : 1) : normalizedHeight < .18 ? 2 : 3 + Math.floor(random() * 3);
    const color = palette[paletteIndex].clone().multiplyScalar(range(.92, 1.08));
    for (const vertex of [a, b, c]) {
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let ring = 0; ring < rings; ring++) for (let segment = 0; segment < segments; segment++) {
    const a = point(ring / rings, segment / segments * Math.PI * 2);
    const b = point((ring + 1) / rings, segment / segments * Math.PI * 2);
    const c = point((ring + 1) / rings, (segment + 1) / segments * Math.PI * 2);
    const d = point(ring / rings, (segment + 1) / segments * Math.PI * 2);
    triangle(a, c, b);
    if (ring > 0) triangle(a, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const island = mesh(geometry, material(0xffffff, { vertexColors: true, flatShading: true }), group);
  island.receiveShadow = true;

  // A single irregular translucent ribbon gives every shore a soft foam line.
  const foam = mesh(makeFoamGeometry(width, length, rotation), new THREE.MeshBasicMaterial({ color: 0xfff4d7, transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide }), group);
  foam.renderOrder = 1;

  const treeCount = 16;
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), material(0x3c7063, { flatShading: true }), treeCount);
  const transform = new THREE.Object3D();
  for (let index = 0; index < treeCount; index++) {
    const position = point(range(.3, .64), range(0, Math.PI * 2));
    const treeHeight = range(4, 8);
    transform.position.set(position.x, position.y + treeHeight * .45, position.z);
    transform.scale.set(treeHeight * .28, treeHeight, treeHeight * .28);
    transform.rotation.y = range(0, 6);
    transform.updateMatrix();
    trees.setMatrixAt(index, transform.matrix);
  }
  trees.castShadow = true;
  group.add(trees);
  group.userData.summitHeight = height;
  return group;
}

function addCoastalOutpost(island) {
  const outpost = new THREE.Group();
  const cream = material(0xf8e8c5, { roughness: .78 });
  const orange = material(ORANGE, { roughness: .62 });
  const dark = material(INK, { roughness: .7 });
  const glass = material(0xfbd585, { emissive: 0xffb347, emissiveIntensity: 1.6, roughness: .25 });
  const height = island.userData.summitHeight;
  outpost.position.set(0, height - .5, 0);

  const tower = mesh(new THREE.CylinderGeometry(1.65, 2.6, 17, 12), cream, outpost, [0, 8.5, 0]);
  tower.castShadow = true;
  for (const y of [3.7, 8.2, 12.7]) {
    const band = mesh(new THREE.TorusGeometry(2.6 - y * .056, .07, 5, 18), orange, outpost, [0, y, 0]);
    band.rotation.x = Math.PI / 2;
  }
  mesh(new THREE.CylinderGeometry(2.05, 2.05, 2.7, 12), glass, outpost, [0, 18.1, 0]);
  mesh(new THREE.TorusGeometry(2.5, .08, 5, 24), dark, outpost, [0, 16.65, 0]).rotation.x = Math.PI / 2;
  const roof = mesh(new THREE.ConeGeometry(2.55, 2.6, 12), orange, outpost, [0, 20.75, 0]);
  roof.castShadow = true;
  mesh(new THREE.SphereGeometry(.28, 10, 7), glass, outpost, [0, 22.15, 0]);

  const beacon = new THREE.Group();
  beacon.position.y = 18.1;
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffd58b, transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beamGeometry = new THREE.ConeGeometry(2.1, 40, 12, 1, true);
  beamGeometry.rotateZ(-Math.PI / 2);
  mesh(beamGeometry, beamMaterial, beacon, [20, 0, 0]);
  outpost.add(beacon);

  // Two tiny expedition cabins make the landmark read as an inhabited outpost.
  for (const [x, z, rotation] of [[8, 4, -.25], [-7, 6, .22]]) {
    const cabin = new THREE.Group();
    cabin.position.set(x, -2.4, z);
    cabin.rotation.y = rotation;
    mesh(new THREE.BoxGeometry(5.2, 3.2, 4.2), cream, cabin, [0, 1.6, 0]);
    const cabinRoof = mesh(new THREE.ConeGeometry(3.7, 2.2, 4), orange, cabin, [0, 4.15, 0]);
    cabinRoof.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(.9, 1.7, .08), dark, cabin, [0, 1.45, -2.14]);
    outpost.add(cabin);
  }
  island.add(outpost);
  return beacon;
}

function makeGate() {
  const group = new THREE.Group();
  const outer = mesh(new THREE.TorusGeometry(GATE_RADIUS, .27, 8, 64), material(0xffcc79, { emissive: 0xffad42, emissiveIntensity: .32, metalness: .3, roughness: .3 }), group);
  const inner = mesh(new THREE.TorusGeometry(GATE_RADIUS - .43, .05, 5, 64), new THREE.MeshBasicMaterial({ color: 0xfff6c7 }), group);
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, 1.05, .3), material(0xf8f0d2), 8);
  const tickTransform = new THREE.Object3D();
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    tickTransform.position.set(Math.sin(angle) * GATE_RADIUS, Math.cos(angle) * GATE_RADIUS, 0);
    tickTransform.rotation.set(0, 0, -angle);
    tickTransform.updateMatrix();
    ticks.setMatrixAt(index, tickTransform.matrix);
  }
  group.add(ticks);

  const center = mesh(new THREE.RingGeometry(.22, .34, 18), new THREE.MeshBasicMaterial({ color: 0xfff7d9, transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false }), group);
  const guide = new THREE.Group();
  const guideMaterial = new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide });
  const arc = mesh(new THREE.TorusGeometry(GATE_RADIUS + .78, .105, 6, 36, Math.PI * .62), guideMaterial, guide);
  arc.rotation.z = .6;
  const chevronPositions = [];
  for (const x of [-1.0, 0, 1.0]) chevronPositions.push(x - .28, GATE_RADIUS + 1.22, .02, x + .28, GATE_RADIUS + 1.22, .02, x, GATE_RADIUS + .72, .02);
  const chevronGeometry = new THREE.BufferGeometry();
  chevronGeometry.setAttribute('position', new THREE.Float32BufferAttribute(chevronPositions, 3));
  mesh(chevronGeometry, guideMaterial, guide);
  group.add(guide);
  group.userData = { outer, inner, center, guide };
  return group;
}

function makeWater() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: 0 }, uDeep: { value: new THREE.Color(SEA) }, uLight: { value: new THREE.Color(0x75b8b4) }, uGlint: { value: new THREE.Color(0xffe9bd) } },
  ]);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        p.z += sin(p.x * .018 + uTime * .34) * .22 + sin(p.y * .013 - uTime * .23) * .16;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      uniform vec3 uGlint;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float broad = noise(vWorld.xz * .006);
        float swell = noise(vWorld.xz * .025 + uTime * .015);
        float crest = smoothstep(.965, .999, sin(vWorld.z * .75 + swell * 5.0 + uTime * .65));
        float breakup = noise(vWorld.xz * vec2(.12, .5) + vec2(uTime * .03, 0));
        float glint = crest * smoothstep(.62, .82, breakup) * .28;
        vec3 color = mix(uDeep, uLight, broad * .22 + .11);
        color = mix(color, uGlint, glint);
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return { geometry: new THREE.PlaneGeometry(6000, 6000, 56, 56), material: waterMaterial, uniforms };
}

// a night sky's stars: points on the upper sky, fixed in size, no fog
function makeStars() {
  const count = 1400, radius = 2200, positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const azimuth = Math.random() * Math.PI * 2, elevation = Math.asin(0.03 + Math.random() * 0.97);
    positions.set([Math.cos(elevation) * Math.cos(azimuth) * radius, Math.sin(elevation) * radius, Math.cos(elevation) * Math.sin(azimuth) * radius], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf4f0ff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: .85, depthWrite: false }));
}

// day and night: every colour the scene changes between them
const DAY = {
  background: 0xe9e7d9, fog: 0xc8dcce, fogNear: 195, fogFar: 1120, exposure: 1.05,
  hemiSky: 0xfff2d7, hemiGround: 0x4d837d, hemi: 1.9, sun: 0xffdb9d, sunIntensity: 2.65,
  skyTop: 0x79b4c8, skyBottom: 0xf1e4c9, disc: 0xffe5aa, discScale: 1,
  deep: SEA, light: 0x75b8b4, glint: 0xffe9bd, cloud: 0xfff4df, beam: .05, ripple: .13,
  planeLight: 0, glow: 1, stars: false,
};
const NIGHT = {
  background: 0x0b1424, fog: 0x14213a, fogNear: 140, fogFar: 950, exposure: .95,
  hemiSky: 0x5d6f9e, hemiGround: 0x0d1a22, hemi: .6, sun: 0xb9c8ff, sunIntensity: .55,
  skyTop: 0x060c1a, skyBottom: 0x1c2a4a, disc: 0xeef1ff, discScale: .55,
  deep: 0x0c2433, light: 0x1b4556, glint: 0xc9d6ff, cloud: 0x46536f, beam: .22, ripple: .05,
  planeLight: 45, glow: 3, stars: true,
};

function makeCloudField() {
  const clusterCount = 20, puffsPerCluster = 4;
  const clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material(0xfff4df, { flatShading: true, roughness: 1 }), clusterCount * puffsPerCluster);
  const data = [];
  for (let index = 0; index < clusterCount; index++) {
    const cluster = { x: range(-800, 800), y: range(130, 230), z: range(-1900, 150), drift: range(-.7, .7), puffs: [] };
    for (let puff = 0; puff < puffsPerCluster; puff++) cluster.puffs.push({ x: puff * 14 - 20, y: range(-2, 4), z: range(-5, 5), sx: range(14, 24), sy: range(5, 10), sz: range(9, 15) });
    data.push(cluster);
  }
  clouds.castShadow = false;
  clouds.frustumCulled = false; // Instances circulate beyond their initial aggregate bounds.
  return { mesh: clouds, data, puffsPerCluster };
}

function makeSailFleet() {
  const boatCount = 6;
  const hullGeometry = new THREE.ConeGeometry(1, 4.8, 4);
  hullGeometry.rotateX(Math.PI / 2);
  hullGeometry.scale(1.45, 1, 1);
  const mastGeometry = new THREE.CylinderGeometry(.08, .1, 5.5, 6);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(.15, .2); sailShape.lineTo(.15, 5.1); sailShape.lineTo(3.1, .45); sailShape.closePath();
  const sailGeometry = new THREE.ShapeGeometry(sailShape);
  const hulls = new THREE.InstancedMesh(hullGeometry, material(BURNT_ORANGE, { roughness: .62 }), boatCount);
  const masts = new THREE.InstancedMesh(mastGeometry, material(INK, { roughness: .75 }), boatCount);
  const sails = new THREE.InstancedMesh(sailGeometry, material(0xffe5b5, { side: THREE.DoubleSide, roughness: .9 }), boatCount);
  const data = [];
  for (let index = 0; index < boatCount; index++) data.push({ x: (index % 2 ? -1 : 1) * range(70, 310), z: -170 - index * 245 + range(-45, 45), heading: range(-.28, .28), phase: range(0, Math.PI * 2), scale: range(.78, 1.15) });
  const group = new THREE.Group();
  group.add(hulls, masts, sails);
  for (const instances of [hulls, masts, sails]) instances.frustumCulled = false;
  return { group, hulls, masts, sails, data };
}

function makeBirdFlock() {
  const positions = [];
  for (let index = 0; index < 11; index++) {
    const x = (index - 5) * 5.3 + range(-2, 2), y = Math.abs(index - 5) * -1.2 + range(-1, 1), z = range(-5, 5);
    positions.push(x - 2.4, y, z, x, y + .65, z, x, y + .65, z, x + 2.4, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const flock = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x355e59, transparent: true, opacity: .72 }));
  flock.position.set(-100, 72, -390);
  return flock;
}

export class FlightScene {
  // container: an element to draw in, on the page's thread; or null, with
  // opts.canvas an OffscreenCanvas, in a worker (render-worker.js): its size,
  // pixel ratio, pointer and motion preference then come in opts, as a
  // worker has no window
  constructor(container, opts = {}) {
    this.offscreen = Boolean(opts.canvas);
    this.width = opts.width ?? innerWidth; this.height = opts.height ?? innerHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.mobileQuality = opts.mobile ?? window.matchMedia('(pointer:coarse)').matches;
    this.maxPixelRatio = Math.min(opts.dpr ?? devicePixelRatio, this.mobileQuality ? 1.5 : 2);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.setSize(this.width, this.height, !this.offscreen);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container?.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9e7d9);
    this.scene.fog = new THREE.Fog(0xc8dcce, 195, 1120);
    this.camera = new THREE.PerspectiveCamera(48, this.width / this.height, .5, 3500);
    this.camera.position.set(24, 35, 33);
    this.lookAt = new THREE.Vector3(0, 22, -25);
    this.cameraTarget = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.trailTip = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xfff2d7, 0x4d837d, 1.9);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffdb9d, 2.65);
    sun.position.set(-100, 160, 100);
    sun.castShadow = true;
    const shadowSize = this.mobileQuality ? 512 : 1024;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -75; sun.shadow.camera.right = 75; sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -30; sun.shadow.camera.far = 350;
    sun.shadow.bias = -.001;
    this.scene.add(sun);

    const skyGeometry = new THREE.SphereGeometry(2400, 32, 20);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x79b4c8) }, bottom: { value: new THREE.Color(0xf1e4c9) } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vPosition; void main(){float h=normalize(vPosition).y; gl_FragColor=vec4(mix(bottom,top,smoothstep(-0.05,0.62,h)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    this.skyUniforms = skyMaterial.uniforms;
    mesh(skyGeometry, skyMaterial, this.scene);
    this.sunDisc = mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe5aa, fog: false }), this.scene, [-520, 460, -1700]);

    const water = makeWater();
    this.waterUniforms = water.uniforms;
    this.water = mesh(water.geometry, water.material, this.scene, [0, -1, 0]);
    this.water.rotation.x = -Math.PI / 2;
    this.water.receiveShadow = true;

    // Long, low instanced highlights supplement the shader without particle churn.
    this.ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffefc9, transparent: true, opacity: .13, depthWrite: false }), 150);
    this.ripples.frustumCulled = false;
    this.rippleData = [];
    for (let index = 0; index < 150; index++) this.rippleData.push({ x: range(-600, 600), z: range(-1500, 200), length: range(1.5, 5), phase: range(0, Math.PI * 2) });
    this.scene.add(this.ripples);

    this.islands = [];
    for (let index = 0; index < 12; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const island = makeIsland(range(52, 98), range(90, 165), range(26, 88));
      island.position.set(side * range(165, 310), 0, 140 - Math.floor(index / 2) * 300 + range(-70, 70));
      this.scene.add(island);
      this.islands.push(island);
    }
    for (let index = 0; index < 5; index++) {
      const island = makeIsland(range(90, 160), range(120, 200), range(90, 150));
      island.position.set((index % 2 ? -1 : 1) * range(440, 650), 0, -index * 360 - 130);
      island.scale.y = .88;
      this.scene.add(island);
      this.islands.push(island);
    }
    const outpostIsland = makeIsland(58, 82, 32);
    outpostIsland.position.set(-150, 0, -330);
    this.lighthouseBeacon = addCoastalOutpost(outpostIsland);
    this.scene.add(outpostIsland);
    this.islands.push(outpostIsland);

    this.cloudField = makeCloudField();
    this.scene.add(this.cloudField.mesh);
    this.fleet = makeSailFleet();
    this.scene.add(this.fleet.group);
    this.birds = makeBirdFlock();
    this.scene.add(this.birds);

    const loadTexture = opts.images
      ? (name, done) => { const bitmap = opts.images[name]; if (bitmap) { const t = new THREE.Texture(bitmap); t.needsUpdate = true; done(t); } }
      : (name, done) => new THREE.TextureLoader().load(`./${name}.svg`, done);
    const { plane, propeller } = makePlane(loadTexture);
    this.plane = plane;
    // night: a warm light carried by the plane, so it shows against the dark
    this.planeLight = new THREE.PointLight(0xffd9a8, 0, 45, 2);
    this.planeLight.position.set(0, 4, 2);
    plane.add(this.planeLight);
    this.stars = makeStars();
    this.stars.visible = false;
    this.scene.add(this.stars);
    this.glow = 1;
    this.propeller = propeller;
    this.plane.position.set(0, 24, 0);
    this.scene.add(plane);
    this.gates = Array.from({ length: 9 }, () => { const gate = makeGate(); this.scene.add(gate); return gate; });

    // Wingtip trails: short reusable ribbons rather than emitters.
    this.trails = [];
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 35 }, () => new THREE.Vector3(side * 6, 24, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xfff8df, transparent: true, opacity: .32, depthWrite: false }));
      this.scene.add(line);
      this.trails.push({ side, points, line });
    }

    this.particles = [];
    this.particleGeo = new THREE.OctahedronGeometry(.2);
    this.particleMat = new THREE.MeshBasicMaterial({ color: 0xffc973, transparent: true });
    this.perfectParticleMat = new THREE.MeshBasicMaterial({ color: 0xfff2b6, transparent: true });
    this.elapsed = 0;
    this.motionTime = 0;
    this.lastDistance = 0;
    this.showcase = true;
    this.transform = new THREE.Object3D();
    if (container) {
      this.reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reducedMotion = Boolean(this.reducedMotionQuery?.matches);
      this.reducedMotionQuery?.addEventListener?.('change', event => { this.reducedMotion = event.matches; });
      window.addEventListener('resize', () => this.resize(innerWidth, innerHeight));
    } else this.reducedMotion = Boolean(opts.reducedMotion);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (opts.onContextLost) opts.onContextLost(); else container.dispatchEvent(new CustomEvent('renderlost'));
    });
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = width; this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, !this.offscreen);
  }

  // stats for nerds: the last frame's draw calls and triangles, the pixel ratio
  glStats() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, dpr: this.renderer.getPixelRatio(), w: this.width, h: this.height };
  }

  burst(x, y, perfect = false) {
    const count = this.reducedMotion ? 6 : perfect ? 28 : 20;
    const burstMaterial = perfect ? this.perfectParticleMat : this.particleMat;
    for (let index = 0; index < count; index++) {
      const particle = mesh(this.particleGeo, burstMaterial, this.scene, [x, y, 0]);
      this.particles.push({ mesh: particle, velocity: new THREE.Vector3(range(-8, 8), range(-5, 9), range(-3, 10)), life: perfect ? 1.3 : 1.05 });
    }
  }

  updateClouds(dt, motion, animateScenery) {
    let instance = 0;
    for (const cluster of this.cloudField.data) {
      cluster.z += motion * .55;
      if (cluster.z > 350) cluster.z -= 2300;
      if (animateScenery) cluster.x += cluster.drift * dt;
      for (const puff of cluster.puffs) {
        this.transform.position.set(cluster.x + puff.x, cluster.y + puff.y, cluster.z + puff.z);
        this.transform.rotation.set(0, 0, 0);
        this.transform.scale.set(puff.sx, puff.sy, puff.sz);
        this.transform.updateMatrix();
        this.cloudField.mesh.setMatrixAt(instance++, this.transform.matrix);
      }
    }
    this.cloudField.mesh.instanceMatrix.needsUpdate = true;
  }

  updateFleet(dt, motion, animateScenery) {
    for (let index = 0; index < this.fleet.data.length; index++) {
      const boat = this.fleet.data[index];
      boat.z += motion * .88;
      if (boat.z > 230) boat.z -= 1850;
      if (animateScenery) boat.x += Math.sin(this.motionTime * .1 + boat.phase) * dt * .15;
      const bob = animateScenery ? Math.sin(this.motionTime * .7 + boat.phase) * .12 : 0;
      this.transform.position.set(boat.x, -.15 + bob, boat.z);
      this.transform.rotation.set(0, boat.heading, Math.sin(boat.phase) * .03);
      this.transform.scale.setScalar(boat.scale);
      this.transform.updateMatrix();
      this.fleet.hulls.setMatrixAt(index, this.transform.matrix);
      this.transform.position.set(boat.x, 2.65 + bob, boat.z);
      this.transform.updateMatrix();
      this.fleet.masts.setMatrixAt(index, this.transform.matrix);
      this.transform.position.set(boat.x, .3 + bob, boat.z);
      this.transform.updateMatrix();
      this.fleet.sails.setMatrixAt(index, this.transform.matrix);
    }
    this.fleet.hulls.instanceMatrix.needsUpdate = true;
    this.fleet.masts.instanceMatrix.needsUpdate = true;
    this.fleet.sails.instanceMatrix.needsUpdate = true;
  }

  // night flying: a moonlit sky with stars, dark water with the moon's glint,
  // the lighthouse's beam, the navigation lights and the rings glowing
  // brighter, and a warm light carried by the plane; or the day again
  setNight(on) {
    const v = on ? NIGHT : DAY;
    this.night = on;
    this.scene.background.set(v.background);
    this.scene.fog.color.set(v.fog); this.scene.fog.near = v.fogNear; this.scene.fog.far = v.fogFar;
    this.renderer.toneMappingExposure = v.exposure;
    this.hemi.color.set(v.hemiSky); this.hemi.groundColor.set(v.hemiGround); this.hemi.intensity = v.hemi;
    this.sun.color.set(v.sun); this.sun.intensity = v.sunIntensity;
    this.skyUniforms.top.value.set(v.skyTop); this.skyUniforms.bottom.value.set(v.skyBottom);
    this.sunDisc.material.color.set(v.disc); this.sunDisc.scale.setScalar(v.discScale);
    this.waterUniforms.uDeep.value.set(v.deep); this.waterUniforms.uLight.value.set(v.light); this.waterUniforms.uGlint.value.set(v.glint);
    this.ripples.material.opacity = v.ripple;
    this.planeLight.intensity = v.planeLight;
    this.stars.visible = v.stars;
    this.glow = v.glow;
    this.cloudField.mesh.material.color.set(v.cloud);
    this.lighthouseBeacon.traverse(o => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending) o.material.opacity = v.beam; });
    // every glowing material's own glow (lamps, windows, navigation lights), from its day value
    this.scene.traverse(o => {
      if (!o.isMesh || !o.material.emissive || o.material.emissive.getHex() === 0) return;
      const m = o.material;
      m.userData.dayEmissive ??= m.emissiveIntensity;
      m.emissiveIntensity = m.userData.dayEmissive * v.glow;
    });
  }

  update(dt, game, sensorPose = null) {
    this.elapsed += dt;
    const menu = game.status === 'menu';
    const running = game.status === 'running';
    const animateScenery = !this.reducedMotion && (running || menu);
    if (running || (menu && animateScenery)) this.motionTime += dt;
    let motion = running ? game.distance - this.lastDistance : menu && animateScenery ? dt * 12 : 0;
    if (motion < 0 || motion > 10) motion = 0;
    this.lastDistance = game.distance;

    for (const island of this.islands) {
      island.position.z += motion;
      if (island.position.z > 350) island.position.z -= 2100;
    }
    this.updateClouds(dt, motion, animateScenery);
    this.updateFleet(dt, motion, animateScenery);
    this.birds.position.z += motion * .62;
    if (this.birds.position.z > 260) this.birds.position.z -= 1900;
    if (animateScenery) {
      this.birds.position.x += Math.sin(this.motionTime * .18) * dt * .5;
      this.birds.position.y = 91 + Math.sin(this.motionTime * .48) * 1.2;
      this.lighthouseBeacon.rotation.y = this.motionTime * .24;
    }

    for (let index = 0; index < this.rippleData.length; index++) {
      const ripple = this.rippleData[index];
      ripple.z += motion;
      if (ripple.z > 200) ripple.z -= 1700;
      const shimmer = animateScenery ? .75 + Math.sin(this.motionTime * .7 + ripple.phase) * .25 : .82;
      this.transform.position.set(ripple.x, -.91, ripple.z);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.set(ripple.length * shimmer, .045, 1);
      this.transform.updateMatrix();
      this.ripples.setMatrixAt(index, this.transform.matrix);
    }
    this.ripples.instanceMatrix.needsUpdate = true;
    this.waterUniforms.uTime.value = this.reducedMotion ? 0 : this.motionTime;

    if (menu) {
      this.plane.position.set(0, 24 + (animateScenery ? Math.sin(this.motionTime * .8) * .35 : 0), 0);
      this.plane.rotation.set(sensorPose ? sensorPose.pitch * .45 : .05, 0, sensorPose ? -sensorPose.roll * .65 : (animateScenery ? Math.sin(this.motionTime * .45) * .07 : 0) - .12);
    } else {
      this.plane.position.set(game.x, game.y, 0);
      this.plane.rotation.set(game.pitch, -game.vx * .008, game.roll);
    }
    const propellerSpeed = animateScenery ? 70 : 0;
    this.propeller.rotation.z += dt * propellerSpeed;

    const nextGate = game.gates.find(gate => gate.z < 0);
    for (let index = 0; index < this.gates.length; index++) {
      const gate = this.gates[index], data = game.gates[index];
      const isNext = data === nextGate;
      // Passed gates vanish at the crossing plane, preventing camera-sized rings behind the craft.
      gate.visible = !menu && game.mode === 'rings' && data.z < 0 && data.z > -1020;
      gate.position.set(data.x, data.y, data.z);
      gate.userData.outer.material.emissiveIntensity = (isNext ? .95 : .28) * this.glow;
      gate.userData.inner.rotation.z = animateScenery ? this.motionTime * .12 : 0;
      gate.userData.center.visible = isNext;
      gate.userData.guide.visible = isNext;
      const pulse = animateScenery ? 1 + Math.sin(this.motionTime * 1.8) * .055 : 1;
      gate.userData.center.scale.setScalar(pulse);
      gate.userData.guide.rotation.z = animateScenery ? Math.sin(this.motionTime * .7) * .045 : 0;
    }

    const aspect = this.camera.aspect;
    if (menu) {
      // Desktop remains right of the copy; portrait remains safely below the intro controls.
      if (aspect > 1.05) {
        this.cameraTarget.set(16, 33, 21);
        this.lookTarget.set(-10, 23, 0);
      } else {
        this.cameraTarget.set(25, 40, 37);
        this.lookTarget.set(0, 34, 0);
      }
    } else {
      this.cameraTarget.set(game.x * .72, game.y + (aspect < .8 ? 11 : 9), aspect < .8 ? 33 : 25);
      this.lookTarget.set(game.x * .9, game.y + 2, -48);
    }
    const cameraRate = this.showcase !== menu ? 3 : 4;
    const cameraAlpha = this.reducedMotion ? 1 : 1 - Math.exp(-dt * cameraRate);
    this.camera.position.lerp(this.cameraTarget, cameraAlpha);
    this.lookAt.lerp(this.lookTarget, cameraAlpha);
    this.camera.lookAt(this.lookAt);
    this.showcase = menu;

    for (const trail of this.trails) {
      trail.line.visible = !this.reducedMotion && !menu && (running || game.status === 'paused');
      if (running) {
        for (const point of trail.points) point.z += motion;
        for (let index = trail.points.length - 1; index > 0; index--) trail.points[index].copy(trail.points[index - 1]);
        this.trailTip.set(trail.side * 6.1, .1, .65).applyEuler(this.plane.rotation).add(this.plane.position);
        trail.points[0].copy(this.trailTip);
        const attribute = trail.line.geometry.attributes.position;
        for (let index = 0; index < trail.points.length; index++) {
          const point = trail.points[index];
          attribute.setXYZ(index, point.x, point.y, point.z);
        }
        attribute.needsUpdate = true;
        trail.line.geometry.computeBoundingSphere();
      } else if (menu) {
        for (const point of trail.points) point.set(trail.side * 6, 24, 0);
      }
    }

    if (running || menu) for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.life -= dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.position.z += motion;
      particle.mesh.scale.setScalar(Math.max(.01, particle.life));
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        this.particles.splice(index, 1);
      }
    }
    const renderAt = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.renderMs = performance.now() - renderAt; // stats for nerds: the draw call's own time
  }
}
