import * as THREE from 'three';

/**
 * Set dressing shared by the playable courtyard and every qualityCapture observer.
 * Placements use simulation coordinates and cross to render space at the presentation
 * boundary. Nothing here changes simulation collision or navigation, so between the
 * floor and head height no solid mesh may stand more than DRESSING_WALL_MARGIN (foliage:
 * DRESSING_FOLIAGE_MARGIN) off an existing wall box (tests/offline-training-v1/courtyard-dressing.test.ts): anything further out
 * would look like cover that bodies and bullets pass through.
 */

const H = 1.75;
export const DRESSING_WALL_MARGIN = .35;
/** Wall creeper may overhang further: brushing through leaves is expected and they read as no cover. */
export const DRESSING_FOLIAGE_MARGIN = .7;
export const DRESSING_ID = 'courtyard-dressing-v1';
/** Opt-in switch, valid only on the courtyard environment it dresses. */
export function dressingEnabled(search: string) {
  const p = new URLSearchParams(search), values = p.getAll('dressing');
  return values.length === 1 && values[0] === DRESSING_ID && p.getAll('environment').length === 1 && p.get('environment') === 'courtyard-v1';
}
const BODY = 1.8 * H;

type Tracked = {
  geometry(geometry: THREE.BufferGeometry): void;
  material(material: THREE.Material): void;
  texture(texture: THREE.Texture): void;
};

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic crackle for low-poly foliage silhouettes. */
function lumpGeometry(seed: number, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, detail), position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const hash = Math.sin(x * 91.73 + y * 47.11 + z * 73.37 + seed * .917) * 43758.5453;
    const scale = .82 + (hash - Math.floor(hash)) * .33;
    position.setXYZ(i, x * scale, y * scale, z * scale);
  }
  position.needsUpdate = true; geometry.computeVertexNormals();
  return geometry;
}

function tileBoxUv(geometry: THREE.BoxGeometry, width: number, height: number, depth: number, tile: number) {
  const uv = geometry.getAttribute('uv');
  const spans: ReadonlyArray<readonly [number, number]> = [
    [depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height],
  ];
  for (let face = 0; face < 6; face++) {
    const [u, v] = spans[face]!;
    for (let vertex = 0; vertex < 4; vertex++) {
      const index = face * 4 + vertex;
      uv.setXY(index, uv.getX(index) * u / tile, uv.getY(index) * v / tile);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

class DressingBuilder {
  private random = randomSource(0xc0a7);
  private metal!: THREE.MeshStandardMaterial;
  private sheet!: THREE.MeshStandardMaterial;
  private trim!: THREE.MeshStandardMaterial;
  private lamp!: THREE.MeshStandardMaterial;
  private brick!: THREE.MeshStandardMaterial;
  private concrete!: THREE.MeshStandardMaterial;
  private coverConcrete!: THREE.MeshStandardMaterial;
  private trainingPaint!: THREE.MeshStandardMaterial;
  private dark!: THREE.MeshStandardMaterial;
  private wood!: THREE.MeshStandardMaterial;
  private painted!: THREE.MeshStandardMaterial;
  private shutter!: THREE.MeshStandardMaterial;
  private hazard!: THREE.MeshStandardMaterial;
  private plywood!: THREE.MeshStandardMaterial;
  private targetPaper!: THREE.MeshStandardMaterial;
  private deadLeaf!: THREE.MeshStandardMaterial;
  private greens!: THREE.MeshStandardMaterial[];
  private leafMasks!: THREE.MeshStandardMaterial[];
  private leafDepth!: THREE.MeshDepthMaterial;
  private leafCard!: THREE.PlaneGeometry;
  private lumps!: THREE.BufferGeometry[];

  private target: THREE.Object3D;

  constructor(private readonly root: THREE.Group, private readonly track: Tracked) { this.target = root; }

  private texture(size: number, paint: (context: CanvasRenderingContext2D, size: number) => void, srgb = true) {
    let texture: THREE.Texture;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (context) paint(context, size);
      texture = new THREE.CanvasTexture(canvas);
    } else {
      // Node-side construction and tests only need lifecycle-correct placeholders.
      const data = new Uint8Array(size * size * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = srgb ? 142 : 220; data[i + 3] = 255; }
      texture = new THREE.DataTexture(data, size, size);
    }
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 1; texture.needsUpdate = true;
    this.track.texture(texture);
    return texture;
  }

  private material<T extends THREE.Material>(material: T) { this.track.material(material); return material; }

  private buildMaterials() {
    const metalMap = this.texture(256, (context, size) => {
      context.fillStyle = '#aab1ae'; context.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 4) {
        const value = 146 + Math.floor(this.random() * 24);
        context.fillStyle = `rgb(${value},${value + 3},${value + 1})`;
        context.fillRect(0, y, size, 2);
      }
      context.globalAlpha = .16;
      for (let i = 0; i < 140; i++) {
        const x = this.random() * size, y = this.random() * size, long = 4 + this.random() * 34;
        context.fillStyle = this.random() < .5 ? '#3b4243' : '#ddd9c9';
        context.fillRect(x, y, 1 + this.random() * 2, long);
      }
      context.globalAlpha = 1;
      context.strokeStyle = '#596162'; context.lineWidth = 2;
      for (let x = 0; x < size; x += 64) context.strokeRect(x + 1, 2, 62, size - 4);
    });
    this.metal = this.material(new THREE.MeshStandardMaterial({ map: metalMap, color: 0xdfe4de, roughness: .56, metalness: .3 }));
    // Roof sheets are deliberately less metallic than the frame: the canopy
    // underside must keep a readable galvanised value in its own shadow.
    this.sheet = this.material(new THREE.MeshStandardMaterial({ map: metalMap, color: 0xf0ecdf, roughness: .7, metalness: .05 }));
    this.trim = this.material(new THREE.MeshStandardMaterial({ map: metalMap, color: 0xe8e4d8, roughness: .68, metalness: .16 }));
    this.lamp = this.material(new THREE.MeshStandardMaterial({ color: 0x37352d, emissive: 0xffb65b, emissiveIntensity: 1.35, roughness: .6, metalness: .15 }));

    const brickMap = this.texture(256, (context, size) => {
      context.fillStyle = '#6f675a'; context.fillRect(0, 0, size, size);
      const brickWidth = 43, brickHeight = 21, gap = 3;
      for (let row = 0; row * (brickHeight + gap) < size + brickHeight; row++) {
        const offset = row % 2 ? -brickWidth / 2 : 0;
        for (let column = -1; column * (brickWidth + gap) < size + brickWidth; column++) {
          const value = this.random();
          const red = 132 + Math.floor(value * 28), green = 119 + Math.floor(value * 23), blue = 99 + Math.floor(value * 19);
          context.fillStyle = `rgb(${red},${green},${blue})`;
          context.fillRect(column * (brickWidth + gap) + offset, row * (brickHeight + gap), brickWidth, brickHeight);
          context.fillStyle = 'rgba(228,219,196,.06)';
          context.fillRect(column * (brickWidth + gap) + offset + 2, row * (brickHeight + gap) + 2, brickWidth - 4, 2);
        }
      }
      for (let i = 0; i < 90; i++) {
        context.fillStyle = this.random() < .55 ? 'rgba(54,47,39,.16)' : 'rgba(215,198,168,.13)';
        context.fillRect(this.random() * size, this.random() * size, 1 + this.random() * 4, 1 + this.random() * 2);
      }
    });
    this.brick = this.material(new THREE.MeshStandardMaterial({ map: brickMap, color: 0xffffff, roughness: .93, metalness: .01 }));

    const concreteMap = this.texture(256, (context, size) => {
      context.fillStyle = '#8d8b80'; context.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i++) {
        const light = this.random() < .5;
        context.fillStyle = light ? 'rgba(218,215,197,.12)' : 'rgba(48,51,47,.11)';
        const radius = .5 + this.random() * 2.4;
        context.beginPath(); context.arc(this.random() * size, this.random() * size, radius, 0, Math.PI * 2); context.fill();
      }
      context.strokeStyle = 'rgba(50,51,45,.18)'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(0, 128); context.lineTo(256, 128); context.stroke();
    });
    this.concrete = this.material(new THREE.MeshStandardMaterial({ map: concreteMap, roughness: .96, metalness: 0 }));

    // Cast training concrete: form-board seams, chipped arrises and splash
    // staining at the foot. Deliberately warmer and coarser than the bay floor.
    const coverMap = this.texture(256, (context, size) => {
      context.fillStyle = '#9a968a'; context.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 42) {
        context.fillStyle = 'rgba(58,57,50,.22)'; context.fillRect(0, y, size, 2);
        context.fillStyle = 'rgba(212,207,190,.16)'; context.fillRect(0, y + 2, size, 1);
      }
      for (let i = 0; i < 420; i++) {
        const x = this.random() * size, y = this.random() * size, radius = .6 + this.random() * 3.4;
        context.fillStyle = this.random() < .52 ? 'rgba(224,219,201,.12)' : 'rgba(54,57,51,.11)';
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      }
      for (let i = 0; i < 44; i++) {
        const x = this.random() * size, y = size * (.55 + this.random() * .45);
        context.fillStyle = `rgba(63,68,56,${.035 + this.random() * .05})`;
        context.fillRect(x, y, 2 + this.random() * 12, 4 + this.random() * 30);
      }
      for (let i = 0; i < 18; i++) {
        const x = this.random() * size, y = this.random() * size;
        context.fillStyle = 'rgba(232,227,209,.28)';
        context.beginPath(); context.arc(x, y, 1 + this.random() * 2, 0, Math.PI * 2); context.fill();
      }
    });
    this.coverConcrete = this.material(new THREE.MeshStandardMaterial({ map: coverMap, roughness: .94, metalness: .01 }));

    // Spray-painted training steel: olive-grey paint with brush streaks, bare
    // scuffs and a darker recessed band where hands and crates have worn it.
    const paintMap = this.texture(256, (context, size) => {
      context.fillStyle = '#77806f'; context.fillRect(0, 0, size, size);
      for (let i = 0; i < 240; i++) {
        const y = this.random() * size;
        context.fillStyle = this.random() < .5 ? `rgba(52,59,48,${.04 + this.random() * .07})` : `rgba(196,202,182,${.04 + this.random() * .06})`;
        context.fillRect(0, y, size, .6 + this.random() * 2.2);
      }
      context.fillStyle = 'rgba(46,52,42,.18)'; context.fillRect(0, size * .58, size, size * .2);
      for (let i = 0; i < 70; i++) {
        const x = this.random() * size, y = this.random() * size, length = 3 + this.random() * 22;
        context.strokeStyle = this.random() < .5 ? 'rgba(38,43,35,.28)' : 'rgba(214,216,198,.22)';
        context.lineWidth = .7 + this.random(); context.beginPath(); context.moveTo(x, y);
        context.lineTo(x + (this.random() - .5) * 3, y + length); context.stroke();
      }
      context.fillStyle = 'rgba(31,37,31,.20)';
      for (let x = 0; x < size; x += 64) context.fillRect(x, 0, 3, size);
    });
    this.trainingPaint = this.material(new THREE.MeshStandardMaterial({ map: paintMap, roughness: .6, metalness: .22 }));

    // Painted service steel, stronger galvanising on the shutters, and warm
    // hazard paint. These three read apart from the galvanised canopy frame.
    this.painted = this.material(new THREE.MeshStandardMaterial({ map: metalMap, color: 0xb4beb6, roughness: .58, metalness: .16 }));
    this.shutter = this.material(new THREE.MeshStandardMaterial({ map: metalMap, color: 0xf1f3ee, roughness: .5, metalness: .38 }));
    this.hazard = this.material(new THREE.MeshStandardMaterial({ color: 0xbd7c3d, roughness: .74, metalness: .16 }));
    this.plywood = this.material(new THREE.MeshStandardMaterial({ color: 0x8b7150, roughness: .93, metalness: .01 }));

    const targetMap = this.texture(128, (context, size) => {
      context.fillStyle = '#d9d1b8'; context.fillRect(0, 0, size, size);
      context.fillStyle = 'rgba(86,79,58,.10)'; context.fillRect(0, 0, size, 6);
      context.strokeStyle = '#9b5d39'; context.lineWidth = 3;
      for (const radius of [46, 31, 17]) { context.beginPath(); context.arc(size / 2, size / 2, radius, 0, Math.PI * 2); context.stroke(); }
      context.fillStyle = '#4f4c3e'; context.beginPath(); context.arc(size / 2, size / 2, 6, 0, Math.PI * 2); context.fill();
      for (let i = 0; i < 40; i++) { context.fillStyle = `rgba(70,64,48,${.03 + this.random() * .05})`; context.fillRect(this.random() * size, this.random() * size, 1 + this.random() * 4, 1 + this.random() * 3); }
    });
    this.targetPaper = this.material(new THREE.MeshStandardMaterial({ map: targetMap, roughness: .9, metalness: .01 }));

    this.dark = this.material(new THREE.MeshStandardMaterial({ color: 0x121b1e, roughness: .98, metalness: .02 }));
    this.wood = this.material(new THREE.MeshStandardMaterial({ color: 0x514435, roughness: .97, metalness: 0, flatShading: true }));
    this.deadLeaf = this.material(new THREE.MeshStandardMaterial({ color: 0x685535, roughness: .98, metalness: 0, flatShading: true }));

    this.greens = [0x334b2a, 0x4d6937, 0x708b4d].map(color => this.material(
      new THREE.MeshStandardMaterial({ color, roughness: .93, metalness: 0, flatShading: true })));

    const leafMask = this.texture(256, (context, size) => {
      context.fillStyle = '#000'; context.fillRect(0, 0, size, size);
      context.fillStyle = '#fff';
      const foliage = randomSource(0x71eaf);
      for (let cluster = 0; cluster < 5; cluster++) {
        const cx = 34 + foliage() * (size - 68), cy = 28 + foliage() * (size - 56);
        context.save(); context.translate(cx, cy); context.rotate(foliage() * Math.PI);
        for (let leaf = 0; leaf < 8; leaf++) {
          const angle = foliage() * Math.PI * 2, distance = foliage() * 37;
          context.save();
          context.translate(Math.cos(angle) * distance, Math.sin(angle) * distance * .8);
          context.rotate(foliage() * Math.PI);
          context.beginPath(); context.ellipse(0, 0, 8 + foliage() * 14, 3.5 + foliage() * 5, 0, 0, Math.PI * 2); context.fill();
          context.restore();
        }
        context.restore();
      }
      // Keep card corners empty so alpha-tested foliage never reads as a rectangle.
      context.fillStyle = '#000';
      context.fillRect(0, 0, size, 22); context.fillRect(0, 0, 22, size);
      context.fillRect(size - 22, 0, 22, size); context.fillRect(0, size - 22, size, 22);
    }, false);
    this.leafMasks = this.greens.map(green => this.material(new THREE.MeshStandardMaterial({
      color: green.color, alphaMap: leafMask, alphaTest: .43, side: THREE.DoubleSide,
      roughness: .92, metalness: 0,
    })));
    // The alpha mask is shared by literal shadow depth so cut-outs never cast slabs.
    this.leafDepth = this.material(new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, alphaMap: leafMask, alphaTest: .43, side: THREE.DoubleSide,
    }));
    this.leafCard = new THREE.PlaneGeometry(1, 1); this.track.geometry(this.leafCard);
    this.lumps = [lumpGeometry(2, 1), lumpGeometry(7, 1), lumpGeometry(13, 0)];
    for (const geometry of this.lumps) this.track.geometry(geometry);
  }

  private box(width: number, height: number, depth: number, material: THREE.MeshStandardMaterial,
    x: number, y: number, z: number, tile = 1.5, rotationY = 0) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if (material.map) tileBoxUv(geometry, width, height, depth, tile);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, -z); mesh.rotation.y = rotationY;
    this.track.geometry(geometry); this.target.add(mesh);
    return mesh;
  }

  private point(x: number, y: number, z: number) { return new THREE.Vector3(x, y, -z); }

  private strut(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.MeshStandardMaterial, sides = 5) {
    const offset = to.clone().sub(from), length = offset.length();
    if (length < .001) return;
    const geometry = new THREE.CylinderGeometry(radius * .76, radius, length, sides, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), offset.normalize());
    this.track.geometry(geometry); this.target.add(mesh);
  }

  /** Prop-local helpers: group origin is on the floor, +Z faces the courtyard. */
  private prop(x: number, z: number, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, -z); group.rotation.y = rotationY;
    this.root.add(group);
    return group;
  }

  private localBox(parent: THREE.Object3D, width: number, height: number, depth: number,
    material: THREE.MeshStandardMaterial, x: number, y: number, z: number, tile = 1.5) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if (material.map) tileBoxUv(geometry, width, height, depth, tile);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    this.track.geometry(geometry); parent.add(mesh);
    return mesh;
  }

  private localStrut(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, radius: number,
    material: THREE.MeshStandardMaterial, sides = 5) {
    const offset = to.clone().sub(from), length = offset.length();
    if (length < .001) return;
    const geometry = new THREE.CylinderGeometry(radius * .76, radius, length, sides, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), offset.normalize());
    this.track.geometry(geometry); parent.add(mesh);
  }

  /** North-wall repair bay: shallow piers, framed roller shutter, aprons and an
   *  overhead hood. Below head height nothing stands more than 35 cm off the wall. */
  private northRepairBay() {
    const cx = 3.15, front = 17.83;
    this.box(3.9, .07, 1.5, this.concrete, cx, .035, 16.55, 1.6);
    for (const px of [1.45, 4.85]) {
      this.box(.55, 3.2, .3, this.concrete, px, 1.66, front, 1.25);
      this.box(.72, .2, .34, this.concrete, px, .1, front, 1.25);
      this.box(.66, .1, 1, this.metal, px, 3.18, front, 1);
      this.box(.56, .18, .025, this.hazard, px, 1.02, front - .16, .7);
      this.box(.08, 2.5, .08, this.dark, px + (px < 3 ? .29 : -.29), 1.34, front - .1, .8);
    }
    this.box(3.9, .6, .9, this.concrete, cx, 2.99, 17.52, 1.35);
    this.box(4.4, .16, 1.5, this.concrete, cx, 3.4, front, 1.35);
    this.box(4.4, .34, .16, this.trim, cx, 3.29, 16.8, 1.2);
    this.box(2.95, .52, .28, this.concrete, cx, 2.7, 17.12, 1.1);
    // Door frame sits inside the pier reveal; shutter slats are separate ridges.
    this.box(.12, 2.5, .14, this.metal, 1.79, 1.42, 17.87, 1);
    this.box(.12, 2.5, .14, this.metal, 4.51, 1.42, 17.87, 1);
    this.box(2.84, .13, .14, this.metal, cx, 2.67, 17.87, 1);
    this.box(2.96, .1, .18, this.metal, cx, .2, 17.9, 1);
    for (let i = 0; i < 20; i++) this.box(2.8, .105, .05, this.shutter, cx, .3 + i * .12, 17.93, 1.4);
    for (const px of [1.87, 4.43]) this.box(.09, 2.45, .16, this.metal, px, 1.42, 17.84, 1);
    this.box(.46, .12, .2, this.dark, cx, 2.82, 17.0, .9);
    this.box(.34, .04, .13, this.lamp, cx, 2.75, 17.0, .8);
    this.box(.42, .28, .08, this.hazard, cx, 3.06, 16.86, .9);
    return front;
  }

  /** Left-divider repair bay: the right wall of the west lane in both player
   *  and third-observer views. Same 35 cm body-height limit as the north bay. */
  private dividerRepairBay() {
    const cz = -2.6, front = -4.75;
    this.box(1.1, .07, 3.4, this.concrete, -5.2, .035, cz, 1.5);
    for (const pz of [-.05, 3.25]) {
      this.box(.3, 3.05, .5, this.concrete, front, 1.56, pz, 1.25);
      this.box(.34, .2, .66, this.concrete, front, .1, pz, 1.25);
      this.box(1.05, .1, .6, this.metal, front, 3.02, pz, 1);
      this.box(.025, .18, .52, this.hazard, front - .16, 1.02, pz, .7);
    }
    this.box(1, .5, 3.3, this.concrete, -5.08, 2.78, cz, 1.3);
    this.box(1.25, .14, 3.7, this.concrete, -5.14, 3.12, cz, 1.3);
    this.box(.14, .3, 3.7, this.trim, -5.66, 3.02, cz, 1.15);
    this.box(.28, .46, 2.75, this.concrete, -4.72, 2.52, cz, 1);
    this.box(.12, 2.35, .1, this.metal, -4.69, 1.37, .2, 1);
    this.box(.12, 2.35, .1, this.metal, -4.69, 1.37, 3, 1);
    this.box(.12, .11, 2.85, this.metal, -4.69, 2.52, cz, 1);
    this.box(.16, .09, 2.9, this.metal, -4.7, .19, cz, 1);
    for (let i = 0; i < 20; i++) this.box(.045, .1, 2.78, this.shutter, -4.67, .28 + i * .112, cz, 1.35);
    for (const pz of [.28, 2.92]) this.box(.14, 2.32, .08, this.metal, -4.72, 1.37, pz, 1);
    this.box(.12, .1, .36, this.dark, -5.54, 2.6, cz, .8);
    this.box(.04, .035, .3, this.lamp, -5.54, 2.54, cz, .7);
    this.box(.06, .24, .36, this.hazard, -5.6, 2.83, cz, .8);
  }


  private leafCardMesh(color: number, x: number, y: number, z: number, size: number, yaw: number, tilt: number, roll: number) {
    const mesh = new THREE.Mesh(this.leafCard, this.leafMasks[color]!);
    mesh.position.set(x, y, -z); mesh.rotation.set(tilt, yaw, roll); mesh.scale.setScalar(size);
    mesh.customDepthMaterial = this.leafDepth; mesh.userData.foliage = true;
    this.target.add(mesh);
    return mesh;
  }

  /** L-shaped steel shelter: one long wall bay plus a return over the north-west training corner. */
  private shelter() {
    const canopy = new THREE.Group(); this.root.add(canopy);
    const previous = this.target; this.target = canopy;
    const underside = BODY;
    const roof = underside + .09;
    const main = { left: -13, right: -6.6, south: 1, north: 15.5 };
    const wing = { left: -6.6, right: -4, south: 8, north: 15.5 };
    const beamY = underside - .17;
    const mainCenter = (main.left + main.right) / 2;
    const mainWidth = main.right - main.left;
    const wingCenter = (wing.left + wing.right) / 2;
    const wingWidth = wing.right - wing.left;

    // Wall seats and columns keep the canopy tied into the existing boundary wall.
    for (const z of [2.2, 5.6, 9, 12.4, 14.8]) {
      this.box(.6, .22, .72, this.metal, -12.83, 3.23, z, 1.1);
      this.box(.22, underside - .1, .22, this.metal, -12.84, (underside - .1) / 2, z, 1.2);
      this.box(.66, .06, .66, this.metal, -12.84, .04, z, 1.1);
      for (const [dx, dz] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]] as const)
        this.box(.055, .06, .055, this.trim, -12.84 + dx, .085, z + dz, .5);
      this.box(.34, .3, .34, this.metal, -12.84, underside - .2, z, .9);
      this.box(.06, .34, .68, this.metal, -12.84, beamY, z, .8);
      this.box(.3, .36, .07, this.metal, -12.55, beamY, z, .6);
      this.strut(this.point(-12.86, 2.3, z), this.point(-11.5, underside - .21, z), .075, this.metal);
      this.strut(this.point(-12.86, 2.3, z), this.point(-12.86, underside - .22, z + 1.2), .055, this.metal);
    }

    // The open edge is cantilevered: long braces rise from the wall seats above
    // head height, so no post stands in the west lane without a collider.
    for (const z of [2.4, 5.8, 9.2, 12.6, 14.9]) {
      this.strut(this.point(-12.86, 2.05, z), this.point(-7.2, underside - .21, z), .065, this.metal);
      this.box(.4, .32, .4, this.metal, -7.2, underside - .2, z, .9);
    }

    // Cross-beams and purlins describe the roof plane from below.
    for (const z of [1.5, 4.4, 7.3, 10.2, 13.1, 15.1]) {
      this.box(mainWidth - .05, .26, .18, this.metal, mainCenter, beamY, z, 1.4);
      this.box(mainWidth - .02, .035, .21, this.metal, mainCenter, beamY + .145, z, 1.2);
      this.box(mainWidth - .02, .035, .21, this.metal, mainCenter, beamY - .145, z, 1.2);
      this.box(.34, .32, .34, this.metal, -12.86, beamY, z, .9);
      this.box(.34, .32, .34, this.metal, -6.63, beamY, z, .9);
      for (const px of [-12.86, -6.63]) for (const dz of [-.12, .12])
        this.box(.07, .07, .07, this.trim, px, beamY, z + dz, .45);
    }
    for (const x of [-11.8, -9.7, -7.7, -6.75]) this.box(.13, .16, 14.4, this.metal, x, underside - .08, 8.25, 1.5);
    for (const z of [8.4, 10.5, 12.6, 14.85]) {
      this.box(wingWidth - .08, .22, .15, this.metal, wingCenter, beamY, z, 1.3);
      if (z !== 14.85) this.box(.3, .3, .3, this.metal, -6.63, beamY, z, .85);
      if (z !== 14.85) this.box(.3, .3, .3, this.metal, wing.right + .04, beamY, z, .85);
    }
    for (const x of [-6.25, -4.35]) this.box(.15, .18, 7.65, this.metal, x, underside - .075, 11.75, 1.4);

    // Deep fascia and corner returns make the roof line read at thumbnail scale.
    this.box(.26, .44, 14.9, this.trim, main.left + .02, underside + .02, 8.25, 1.2);
    this.box(.26, .44, 14.9, this.trim, main.right - .01, underside + .02, 8.25, 1.2);
    this.box(mainWidth - .1, .44, .26, this.trim, mainCenter, underside + .02, main.south - .03, 1.2);
    this.box(mainWidth - .1, .44, .26, this.trim, mainCenter, underside + .02, main.north + .03, 1.2);
    this.box(wingWidth + .04, .4, .24, this.trim, wingCenter, underside + .01, wing.south - .02, 1.2);
    this.box(wingWidth + .04, .4, .24, this.trim, wingCenter, underside + .01, wing.north + .03, 1.2);
    this.box(.24, .4, 7.55, this.trim, wing.right + .02, underside + .01, 11.75, 1.2);

    // Broad opaque sheets, with two limited open grilles for sky and striped shadow.
    const bays = 4, span = (main.north - main.south) / bays;
    for (let bay = 0; bay < bays; bay++) {
      const z = main.south + span * (bay + .5);
      if (bay === 2) {
        this.grille(main.left + .15, main.right - .15, z - span * .46, z + span * .46, roof + .02);
        continue;
      }
      this.box(mainWidth - .12, .11, span - .12, this.sheet, mainCenter, roof, z, 1.8);
      this.box(.1, .1, span - .18, this.sheet, main.left + .08, roof + .08, z, 1.6);
      this.box(.1, .1, span - .18, this.sheet, main.right - .08, roof + .08, z, 1.6);
    }
    // Hanging work lamps explain the warm pools under the low canopy.
    for (const z of [4, 11]) {
      this.box(.58, .08, .22, this.metal, -8.4, 3.06, z, 1);
      this.box(.44, .035, .16, this.lamp, -8.4, 2.995, z, 1);
      this.strut(this.point(-8.4, 3.09, z), this.point(-8.4, underside - .18, z), .018, this.metal, 3);
    }

    const wingBays = 3, wingSpan = (wing.north - wing.south) / wingBays;
    for (let bay = 0; bay < wingBays; bay++) {
      const z = wing.south + wingSpan * (bay + .5);
      if (bay === 1) {
        this.grille(-6.35, -4.2, z - wingSpan * .43, z + wingSpan * .43, roof + .02);
        continue;
      }
      this.box(wingWidth - .1, .11, wingSpan - .12, this.sheet, wingCenter, roof, z, 1.7);
    }
    this.target = previous;
  }

  private grille(left: number, right: number, south: number, north: number, y: number) {
    const width = right - left, depth = north - south, centerX = (left + right) / 2, centerZ = (south + north) / 2;
    this.box(width, .18, .13, this.metal, centerX, y, south, 1.2);
    this.box(width, .18, .13, this.metal, centerX, y, north, 1.2);
    this.box(.13, .18, depth, this.metal, left, y, centerZ, 1.2);
    this.box(.13, .18, depth, this.metal, right, y, centerZ, 1.2);
    for (let i = 1; i <= 5; i++) {
      const z = south + depth * i / 6;
      this.box(width - .18, .09, .075, this.metal, centerX, y - .01, z, 1.2);
    }
    this.box(.075, .095, depth - .18, this.metal, centerX - width * .27, y + .01, centerZ, 1.2);
    this.box(.075, .095, depth - .18, this.metal, centerX + width * .27, y + .01, centerZ, 1.2);
  }

  /** North observation block: brick mass, deep dark window, wall-top platform and aerial. */
  private tower() {
    const x = -2, width = 4.6, depth = 3.8, height = 6.55;
    const left = x - width / 2, right = x + width / 2;
    // The front face is pulled 24 cm proud of the north wall. That is enough to
    // show the full doorway and observation room from the playable side while
    // leaving the simulation wall solid and walkable underneath.
    const front = 17.76, back = front + depth, rearCore = front + 1.25;
    const win = { left: x - 1.34, right: x + 1.48, bottom: 4.75, top: 5.92 };

    // Rear mass and deep front piers read as one brick building above the wall.
    this.box(width, height, back - rearCore, this.brick, x, height / 2, (rearCore + back) / 2, 1.28);
    this.box(win.left - left, height - 4, 1.25, this.brick, (left + win.left) / 2, (height + 4) / 2, front + .625, 1.28);
    this.box(right - win.right, height - 4, 1.25, this.brick, (win.right + right) / 2, (height + 4) / 2, front + .625, 1.28);
    this.box(win.right - win.left, win.bottom - 4, 1.25, this.brick, x, (4 + win.bottom) / 2, front + .625, 1.28);
    this.box(win.right - win.left + .16, .09, .3, this.concrete, x, win.bottom - .045, front + .58, 1.1);
    this.box(win.right - win.left, height - win.top, 1.25, this.brick, x, (height + win.top) / 2, front + .625, 1.28);

    // Ground storey: a real door void, jambs, lintel and a shallow dark reveal.
    const door = { left: x - .66, right: x + .66, top: 2.55 };
    this.box(door.left - left, 4, .3, this.brick, (left + door.left) / 2, 2, front + .15, 1.28);
    this.box(right - door.right, 4, .3, this.brick, (door.right + right) / 2, 2, front + .15, 1.28);
    this.box(door.right - door.left, 4 - door.top, .3, this.brick, x, (4 + door.top) / 2, front + .15, 1.28);
    this.box(door.right - door.left + .2, .08, .2, this.metal, x, .04, front - .02, 1);
    this.box(.09, door.top, .14, this.metal, door.left - .045, door.top / 2, front - .03, 1);
    this.box(.09, door.top, .14, this.metal, door.right + .045, door.top / 2, front - .03, 1);
    this.box(door.right - door.left + .2, .09, .14, this.metal, x, door.top + .045, front - .03, 1);
    this.box(door.right - door.left - .02, door.top - .04, .12, this.dark, x, door.top / 2, front + .16, 1);
    this.box(door.right - door.left + .6, .08, .5, this.concrete, x, .04, front - .2, 1.1);

    // The upper opening is a metre-deep dark room, not a black decal.
    this.box(win.right - win.left, win.top - win.bottom, .08, this.dark, x, (win.top + win.bottom) / 2, rearCore - .05, 1);
    this.box(.08, win.top - win.bottom, rearCore - front, this.dark, win.left, (win.top + win.bottom) / 2, (front + rearCore) / 2, 1);
    this.box(.08, win.top - win.bottom, rearCore - front, this.dark, win.right, (win.top + win.bottom) / 2, (front + rearCore) / 2, 1);
    this.box(win.right - win.left, .08, rearCore - front, this.dark, x, win.bottom, (front + rearCore) / 2, 1);
    this.box(win.right - win.left, .08, rearCore - front, this.dark, x, win.top, (front + rearCore) / 2, 1);
    // Frame and a narrow projecting hood sharpen the recess against the sky.
    for (const fx of [win.left, win.right]) this.box(.1, win.top - win.bottom + .16, .18, this.metal, fx, (win.top + win.bottom) / 2, front - .09, 1);
    this.box(win.right - win.left + .2, .1, .18, this.metal, x, win.bottom - .05, front - .09, 1);
    this.box(win.right - win.left + .2, .1, .18, this.metal, x, win.top + .05, front - .09, 1);
    this.box(win.right - win.left + .55, .14, .7, this.metal, x, win.top + .24, front - .28, 1.1);
    this.box(win.right - win.left + .2, .18, .16, this.concrete, x, 4, front - .06, 1.1);

    // Roof cap, parapet, corner pilasters and aerial interrupt the flat skyline.
    this.box(width + .3, .22, depth + .3, this.concrete, x, height + .11, (front + back) / 2, 1.1);
    this.box(width + .3, .28, .2, this.concrete, x, height + .33, front - .04, 1.1);
    this.box(.2, .28, depth + .3, this.concrete, left - .06, height + .33, (front + back) / 2, 1.1);
    this.box(.2, .28, depth + .3, this.concrete, right + .06, height + .33, (front + back) / 2, 1.1);
    for (const fx of [left + .15, right - .15]) this.box(.24, .4, .3, this.concrete, fx, 4.16, front - .06, 1.1);
    this.box(.8, .38, .64, this.metal, x + 1.3, height + .42, 20.4, 1.2);
    this.strut(this.point(x + 1.3, height + .52, 20.4), this.point(x + 1.3, height + 1.42, 20.4), .045, this.metal, 4);

    // Exposed east platform on the wall top. Its stair is omitted: a climbable-looking
    // flight without a collider would promise a route the simulation does not have.
    this.box(1.55, .12, 1.25, this.metal, right + .76, 4.02, 17.25, 1.2);
    this.strut(this.point(right + 1.46, 4.0, 17.8), this.point(right + .1, 3.38, 17.8), .05, this.metal);
    for (const px of [right + .08, right + 1.46]) for (const pz of [16.66, 17.84]) this.box(.07, 1.08, .07, this.metal, px, 4.57, pz, 1);
    for (const pz of [16.66, 17.84]) {
      this.box(1.46, .055, .055, this.metal, right + .76, 5.08, pz, 1);
      this.box(.055, .055, 1.18, this.metal, right + 1.46, 5.08, (16.66 + 17.84) / 2, 1);
    }
  }

  /** One continuous creeper on the north wall; stems sit about 20 cm off the face to avoid coplanar flicker. */
  private vine() {
    // North-wall creeper: a vertical patch climbing from the wall foot to the cap,
    // clear of the observation stair, window and both spawn lanes.
    const zWall = 17.9, x0 = 6.35, width = 2.55;
    const stemXs = [0, .72, 1.48, 2.2];
    for (let stem = 0; stem < stemXs.length; stem++) {
      const sx = x0 + stemXs[stem]!;
      const points = Array.from({ length: 5 }, (_, i) => {
        const t = i / 4;
        return this.point(sx + Math.sin(t * 5.4 + stem) * .2, .08 + t * 4.38, zWall - .11 + Math.cos(t * 7 + stem) * .04);
      });
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, 20, .026, 5, false);
      const mesh = new THREE.Mesh(geometry, this.wood); mesh.userData.foliage = true; this.track.geometry(geometry); this.root.add(mesh);
    }
    for (let i = 0; i < 42; i++) {
      const stem = i % stemXs.length, tier = Math.floor(i / stemXs.length), t = (tier + this.random()) / 11;
      const geometry = this.lumps[i % this.lumps.length]!;
      const mesh = new THREE.Mesh(geometry, this.greens[(tier + stem) % 3]!);
      mesh.position.set(x0 + stemXs[stem]! + Math.sin(t * 5.4 + stem) * .22 + (this.random() - .5) * .35,
        .32 + t * 4.15, -(zWall - .22 - this.random() * .06));
      // Flattened against the wall and only slightly turned, so the creeper stays within its overhang budget.
      mesh.scale.set(.26 + this.random() * .2, .22 + this.random() * .2, .12 + this.random() * .08);
      mesh.rotation.set(this.random() * .45, (this.random() - .5) * .4, this.random() * .4); mesh.userData.foliage = true; this.root.add(mesh);
    }
    for (let i = 0; i < 74; i++) {
      const stem = i % stemXs.length, t = (Math.floor(i / stemXs.length) + this.random()) / 8;
      this.leafCardMesh(i % 3 === 0 ? 2 : 1,
        x0 + stemXs[stem]! + (this.random() - .5) * .85, .24 + Math.min(1, t) * 4.25 + (this.random() - .5) * .34,
        zWall - .24 - this.random() * .08, .38 + this.random() * .45, (this.random() - .5) * .6, (this.random() - .5) * .5, this.random() * Math.PI);
    }
    // A few leaves crest the wall so the silhouette is not a straight cap line.
    for (let i = 0; i < 13; i++) {
      this.leafCardMesh(i % 3 ? 1 : 2, x0 + this.random() * width, 4.06 + this.random() * .46,
        zWall - .2 - this.random() * .08, .46 + this.random() * .45, (this.random() - .5) * 1.2, .35 + this.random() * .5, this.random() * Math.PI);
    }
  }

  build() {
    this.buildMaterials();
    this.shelter();
    this.tower();
    // Repair bays interrupt the long right-hand wall in the mid-ground of both
    // fixed observers. Free-standing props are deliberately absent: without
    // simulation colliders they would read as cover that bullets and bodies pass through.
    this.northRepairBay();
    this.dividerRepairBay();
    this.vine();
  }
}

export function addCourtyardDressing(scene: THREE.Scene, track: Tracked) {
  const root = new THREE.Group(); root.name = 'courtyard-training-build';
  scene.add(root);
  new DressingBuilder(root, track).build();
}
