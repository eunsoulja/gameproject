import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Random = () => number;

/** Deterministic little PRNG so the street feels hand-built on every reload. */
export function makeRng(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Random, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length) % values.length];
}

export function range(rng: Random, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function jitterColor(hex: string, rng: Random, amount = 0.035): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h + range(rng, -0.012, 0.012),
    Math.max(0, hsl.s + range(rng, -amount, amount)),
    Math.max(0.02, Math.min(0.92, hsl.l + range(rng, -amount, amount))),
  );
  return `#${color.getHexString()}`;
}

function colorAttribute(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export interface Placement {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** A vertex-coloured box, ready to be merged into a district-sized draw call. */
export function box(
  width: number,
  height: number,
  depth: number,
  color: THREE.ColorRepresentation,
  placement: Placement = {},
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (placement.rx) geometry.rotateX(placement.rx);
  if (placement.ry) geometry.rotateY(placement.ry);
  if (placement.rz) geometry.rotateZ(placement.rz);
  geometry.translate(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
  return colorAttribute(geometry, color);
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  color: THREE.ColorRepresentation,
  placement: Placement = {},
  openEnded = false,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded);
  if (placement.rx) geometry.rotateX(placement.rx);
  if (placement.ry) geometry.rotateY(placement.ry);
  if (placement.rz) geometry.rotateZ(placement.rz);
  geometry.translate(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
  return colorAttribute(geometry, color);
}

export function sphere(
  radius: number,
  color: THREE.ColorRepresentation,
  placement: Placement = {},
  segments = 10,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.7)));
  if (placement.rx) geometry.rotateX(placement.rx);
  if (placement.ry) geometry.rotateY(placement.ry);
  if (placement.rz) geometry.rotateZ(placement.rz);
  geometry.translate(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
  return colorAttribute(geometry, color);
}

export function plane(
  width: number,
  height: number,
  color: THREE.ColorRepresentation,
  placement: Placement = {},
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  if (placement.rx) geometry.rotateX(placement.rx);
  if (placement.ry) geometry.rotateY(placement.ry);
  if (placement.rz) geometry.rotateZ(placement.rz);
  geometry.translate(placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
  return colorAttribute(geometry, color);
}

export interface MergedResult {
  geometry: THREE.BufferGeometry | null;
  dispose: () => void;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const cleaned = parts.map((part) => {
    const copy = part.index ? part.toNonIndexed() : part;
    if (copy !== part) part.dispose();
    // Strip attributes that differ between primitive types; colour + position are all we need.
    for (const key of Object.keys(copy.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
        copy.deleteAttribute(key);
      }
    }
    if (!copy.attributes.uv) {
      copy.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(copy.getAttribute('position').count * 2), 2));
    }
    if (!copy.attributes.normal) copy.computeVertexNormals();
    return copy;
  });
  const geometry = mergeGeometries(cleaned, false);
  for (const geometryPart of cleaned) geometryPart.dispose();
  if (!geometry) return null;
  geometry.computeBoundingSphere();
  return geometry;
}

export const MATERIALS = {
  structure: () =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.03,
    }),
  fabric: () =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  glow: () =>
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    }),
  transparentGlow: () =>
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  metal: () =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.65,
    }),
};

export function addMergedMesh(
  parent: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
): THREE.Mesh | null {
  const geometry = merge(geometries);
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

// ── Procedural canvas textures ──────────────────────────────────────────────

export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  repeat = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

export function makeGlowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,236,190,1)');
    gradient.addColorStop(0.18, 'rgba(255,203,120,0.75)');
    gradient.addColorStop(0.5, 'rgba(255,158,78,0.18)');
    gradient.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

export function makeAsphaltTexture(seed = 91): THREE.CanvasTexture {
  const rng = makeRng(seed);
  const texture = makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#2c3034';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 5400; i++) {
      const alpha = 0.025 + rng() * 0.09;
      ctx.fillStyle = rng() > 0.6 ? `rgba(190,185,170,${alpha})` : `rgba(8,10,12,${alpha})`;
      const size = rng() > 0.94 ? 2 + rng() * 4 : 1 + rng() * 1.6;
      ctx.fillRect(rng() * width, rng() * height, size, size);
    }
    ctx.strokeStyle = 'rgba(8,10,12,0.3)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let x = rng() * width;
      let y = rng() * height;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += range(rng, -40, 40);
        y += range(rng, 10, 45);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const x = rng() * width;
      const y = rng() * height;
      const gradient = ctx.createRadialGradient(x, y, 4, x, y, 40 + rng() * 70);
      gradient.addColorStop(0, 'rgba(0,0,0,0.22)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 100, 0, Math.PI * 2);
      ctx.fill();
    }
  }, true);
  texture.repeat.set(6, 70);
  return texture;
}

export function makeConcreteTexture(seed = 41): THREE.CanvasTexture {
  const rng = makeRng(seed);
  const texture = makeCanvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = '#6b6661';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,240,220,${0.02 + rng() * 0.08})` : `rgba(20,18,16,${0.02 + rng() * 0.08})`;
      ctx.fillRect(rng() * width, rng() * height, 1 + rng() * 2, 1 + rng() * 2);
    }
    ctx.strokeStyle = 'rgba(25,22,18,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }, true);
  texture.repeat.set(8, 60);
  return texture;
}

export function makeStripeTexture(colors: [string, string], stripes = 12): THREE.CanvasTexture {
  return makeCanvasTexture(256, 128, (ctx, width, height) => {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors[1];
    const stripe = width / stripes;
    for (let i = 0; i < stripes; i += 2) ctx.fillRect(i * stripe, 0, stripe, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, true);
}

export function makeSignTexture(
  title: string,
  subtitle: string,
  options: { accent?: string; dark?: string; vertical?: boolean } = {},
): THREE.CanvasTexture {
  const accent = options.accent ?? '#d97e17';
  const width = 1024;
  const height = 384;
  return makeCanvasTexture(width, height, (ctx) => {
    // Hand-painted stall sign: cream paper face, ink lettering, accent trim.
    const paper = ctx.createLinearGradient(0, 0, 0, height);
    paper.addColorStop(0, '#fff8e4');
    paper.addColorStop(0.6, '#f7e7c2');
    paper.addColorStop(1, '#eed9ac');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);

    // Ink frame with a thin accent pinline inside.
    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, width - 60, height - 60);
    ctx.globalAlpha = 1;

    // Accent ribbon under the title block.
    ctx.fillStyle = accent;
    ctx.fillRect(60, 268, width - 120, 10);
    ctx.beginPath();
    ctx.moveTo(width / 2 - 14, 262);
    ctx.lineTo(width / 2 + 14, 262);
    ctx.lineTo(width / 2, 282);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b5335';
    ctx.font = '700 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(subtitle.toUpperCase(), width / 2, 96);

    ctx.fillStyle = '#1c1008';
    ctx.shadowColor = 'rgba(28,16,8,0.25)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 5;
    const fontSize = title.length > 20 ? 78 : title.length > 13 ? 98 : 118;
    ctx.font = `${fontSize}px "Lilita One", "Arial Black", sans-serif`;
    ctx.fillText(title.toUpperCase(), width / 2, 196);
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = accent;
    ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('COLON STREET · CEBU', width / 2, 336);
  });
}

export function makeNameTagTexture(name: string, subtitle = ''): THREE.CanvasTexture {
  const width = 512;
  const height = 160;
  return makeCanvasTexture(width, height, (ctx) => {
    ctx.clearRect(0, 0, width, height);
    const radius = 40;
    ctx.fillStyle = 'rgba(8,12,18,0.82)';
    ctx.beginPath();
    ctx.roundRect(6, 6, width - 12, height - 12, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,180,87,0.38)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff3db';
    ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(name, width / 2, subtitle ? 64 : 82);
    if (subtitle) {
      ctx.fillStyle = '#d3a55f';
      ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(subtitle, width / 2, 114);
    }
  });
}

export function makeLabelTexture(text: string, color = '#ffe0a3', background = 'rgba(10,14,20,0.82)'): THREE.CanvasTexture {
  const width = 512;
  const height = 160;
  return makeCanvasTexture(width, height, (ctx) => {
    ctx.clearRect(0, 0, width, height);
    const transparent = /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(background.trim());
    if (transparent) {
      // Floating label — glowing text only, no board.
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 58px "Lilita One", "Arial Black", sans-serif';
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillText(text.toUpperCase(), width / 2, height / 2 + 2);
      ctx.shadowBlur = 0;
      return;
    }
    // Painted board — cream face, ink text, accent underline.
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.roundRect(6, 6, width - 12, height - 12, 30);
    ctx.fill();
    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = '#1c1008';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 52px "Lilita One", "Arial Black", sans-serif';
    ctx.fillText(text.toUpperCase(), width / 2, height / 2 - 6);
    ctx.fillStyle = color;
    ctx.fillRect(width / 2 - 60, height - 34, 120, 8);
  });
}

export function makeGlowSprite(texture: THREE.Texture, color: THREE.ColorRepresentation, scale: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export function makePointLight(color: THREE.ColorRepresentation, intensity: number, distance: number): THREE.PointLight {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.castShadow = false;
  return light;
}

export function setShadow(mesh: THREE.Object3D, cast = true, receive = true): void {
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerpAngle(current: number, target: number, t: number): number {
  const delta = ((((target - current) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + delta * t;
}
