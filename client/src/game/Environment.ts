import * as THREE from 'three';
import type { EventVisual } from '../../../shared/config';
import { WORLD } from '../../../shared/layout';
import type { QualitySetting } from '../systems/Settings';
import type { CollisionSystem } from './CollisionSystem';
import {
  MATERIALS,
  addMergedMesh,
  box,
  clamp,
  cylinder,
  makeAsphaltTexture,
  makeCanvasTexture,
  makeConcreteTexture,
  makeGlowSprite,
  makeGlowTexture,
  makePointLight,
  merge,
  plane,
  range,
  makeRng,
  sphere,
} from './utils';

const ROAD_HALF = 19.6;
const STREET_LENGTH = 500;

interface AmbientLightState {
  sky: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  glowLights: Array<{ light: THREE.PointLight; base: number }>;
}

export class Environment {
  private scene: THREE.Scene;
  private skyMaterial: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uCityGlow: { value: THREE.Color };
    uNight: { value: number };
    uSunY: { value: number };
  };
  private lights: AmbientLightState;
  private moon: THREE.Mesh;
  private moonHalo: THREE.Sprite;
  private glowTexture = makeGlowTexture();
  private pointLights: Array<{ light: THREE.PointLight; base: number }> = [];
  private warmSprites: THREE.Sprite[] = [];
  private dust!: THREE.Points;
  private dustPositions!: Float32Array;
  private dustBase!: Float32Array;
  private fog: THREE.Fog;
  private blackout = false;
  private lightning = 0;
  private elapsed = 0;
  private puddles: THREE.Mesh[] = [];
  /** Expanding raindrop rings spawned on puddles while it pours. */
  private rainRings: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private ringGeometry: THREE.RingGeometry | null = null;
  private roadMaterial: THREE.MeshStandardMaterial | null = null;
  private wetTarget = 0;
  private wetness = 0;
  private archLights: THREE.Sprite[] = [];
  private eventVisual: EventVisual = 'none';
  /** Parol lights go up in December. */
  private festive = new Date().getMonth() === 11;

  /** Actual rainfall wets the street — separate from market rain events. */
  setWetness(level: number): void {
    this.wetTarget = level;
  }

  /** Market-calendar seasons (fiesta week / parol season) drive the lamp colors. */
  setFestive(on: boolean): void {
    this.festive = on;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.background = new THREE.Color('#04070e');
    this.fog = new THREE.Fog(new THREE.Color('#07101a'), 45, 220);
    this.scene.fog = this.fog;

    const uniforms = {
      uTopColor: { value: new THREE.Color('#040811') },
      uHorizonColor: { value: new THREE.Color('#33231a') },
      uCityGlow: { value: new THREE.Color('#a6542a') },
      uNight: { value: 1 },
      uSunY: { value: -0.2 },
    };
    this.skyUniforms = uniforms;
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uCityGlow;
        uniform float uNight;
        uniform float uSunY;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vDirection);
          float y = dir.y;
          float horizon = smoothstep(-0.12, 0.65, y);
          vec3 color = mix(uHorizonColor, uTopColor, horizon);
          float band = pow(max(0.0, 1.0 - abs(y + 0.02) * 2.5), 5.0);
          color += uCityGlow * band * 0.24 * uNight;
          color += uCityGlow * 0.1 * pow(max(0.0, 1.0 - abs(y)), 12.0);
          vec3 p = floor(dir * 720.0);
          float star = step(0.9982, hash(p));
          float twinkle = 0.45 + 0.55 * sin(hash(p + 1.0) * 80.0 + 3.0);
          color += vec3(0.92, 0.96, 1.0) * star * uNight * twinkle * smoothstep(0.02, 0.3, y) * 0.9;
          float sun = smoothstep(0.997, 0.999, dot(dir, normalize(vec3(-0.45, uSunY, -0.7))));
          color += vec3(1.0, 0.55, 0.22) * sun * (1.0 - uNight) * 0.45;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 22), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Moon and its soft halo.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#ffefd0', toneMapped: false }),
    );
    this.moon.position.set(-138, 145, -185);
    this.scene.add(this.moon);
    this.moonHalo = makeGlowSprite(this.glowTexture, '#ffe3ac', 48);
    this.moonHalo.position.copy(this.moon.position);
    (this.moonHalo.material as THREE.SpriteMaterial).opacity = 0.42;
    this.scene.add(this.moonHalo);

    this.lights = this.createLights();
    this.buildGround();
    this.buildStreetDetails();
    this.buildOverheadNetwork();
    this.buildLampPosts();
    this.buildArch(108, 'MERKADO DE \'COLON', 'COLON STREET NIGHT MARKET');
    this.buildArch(-226, 'COLON STREET', 'PASILONG SA MERKADO');
    this.buildDistantCity();
    this.buildDust();
    this.applyTime(0.52);
  }

  private createLights(): AmbientLightState {
    const sky = new THREE.AmbientLight(new THREE.Color('#3b4c70'), 0.55);
    this.scene.add(sky);
    const hemi = new THREE.HemisphereLight(new THREE.Color('#596d9e'), new THREE.Color('#1d130c'), 0.62);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color('#ffd6a0'), 1.25);
    sun.position.set(-38, 58, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -38;
    sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 38;
    sun.shadow.camera.bottom = -38;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);

    return { sky, hemi, sun, glowLights: [] };
  }

  private addPointLight(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number): void {
    const light = makePointLight(color, intensity, distance);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.lights.glowLights.push({ light, base: intensity });
    this.pointLights.push({ light, base: intensity });
  }

  private buildGround(): void {
    const asphalt = makeAsphaltTexture(71);
    const roadMaterial = new THREE.MeshStandardMaterial({
      map: asphalt,
      color: '#9b958b',
      roughness: 0.88,
      metalness: 0.06,
      emissive: new THREE.Color('#100c08'),
      emissiveIntensity: 0.55,
    });
    this.roadMaterial = roadMaterial;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, STREET_LENGTH, 1, 1),
      roadMaterial,
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    this.scene.add(road);

    const concrete = makeConcreteTexture(12);
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      map: concrete,
      color: '#9b9387',
      roughness: 0.9,
      metalness: 0.02,
      emissive: new THREE.Color('#0f0c09'),
      emissiveIntensity: 0.5,
    });
    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(7.2, STREET_LENGTH), sidewalkMaterial);
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(side * 16.1, 0.025, 0);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);

      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.12, STREET_LENGTH),
        new THREE.MeshStandardMaterial({ color: '#868073', roughness: 0.92 }),
      );
      curb.position.set(side * 12.55, 0.03, 0);
      curb.receiveShadow = true;
      this.scene.add(curb);

      const tactile = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, STREET_LENGTH),
        new THREE.MeshStandardMaterial({ color: '#b69342', roughness: 0.8 }),
      );
      tactile.rotation.x = -Math.PI / 2;
      tactile.position.set(side * 15.1, 0.031, 0);
      this.scene.add(tactile);
    }

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 640),
      new THREE.MeshStandardMaterial({ color: '#141512', roughness: 1 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.06;
    this.scene.add(base);

    // A few glistening puddles catch the lantern light.
    const puddleMaterial = new THREE.MeshPhysicalMaterial({
      color: '#0a1218',
      roughness: 0.12,
      metalness: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.75,
    });
    const rng = makeRng(204);
    for (let i = 0; i < 18; i++) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(range(rng, 0.5, 2.3), 18), puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      const side = rng() > 0.5 ? 1 : -1;
      puddle.position.set(side * range(rng, 2.4, 16.7), 0.012, range(rng, -236, 236));
      puddle.scale.set(1, range(rng, 0.35, 0.75), 1);
      this.puddles.push(puddle);
      this.scene.add(puddle);
    }
  }

  private buildStreetDetails(): void {
    const solids: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const rng = makeRng(511);

    // Crosswalk stripes near side streets and the arches.
    const stripeZs = [-170, -70, 120, 210, 108, -226];
    for (const z of stripeZs) {
      for (let i = -4; i <= 4; i++) {
        solids.push(
          box(1.7, 0.008, 0.42, i % 2 === 0 ? '#aa9c7d' : '#80755f', {
            x: i * 2.3,
            y: 0.014,
            z,
          }),
        );
      }
    }

    // Manholes, drain grates and power boxes give the asphalt life.
    for (let i = 0; i < 12; i++) {
      const x = (rng() > 0.5 ? 1 : -1) * range(rng, 2, 11);
      const z = range(rng, -230, 230);
      solids.push(cylinder(0.65, 0.65, 0.025, 14, '#39352e', { x, y: 0.012, z, rx: Math.PI / 2 }));
    }
    for (let i = 0; i < 14; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      solids.push(
        box(0.55, 0.04, 0.9, '#252723', {
          x: side * 12.6,
          y: 0.025,
          z: range(rng, -228, 228),
        }),
      );
    }

    // Stray crates and sacks outside the stalls.
    for (let i = 0; i < 70; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      const x = side * range(rng, 18.2, 24.5);
      const z = range(rng, -230, 230);
      if (side < 0) continue; // building line on this pass; props handled by market generator
      const kind = rng();
      if (kind < 0.4) {
        solids.push(box(range(rng, 0.6, 1.1), range(rng, 0.5, 0.9), range(rng, 0.6, 1.1), pickCrateColor(rng), { x, y: 0.3, z, ry: range(rng, 0, Math.PI) }));
      } else if (kind < 0.75) {
        solids.push(cylinder(0.28, 0.33, range(rng, 0.5, 0.85), 9, '#3a3127', { x, y: 0.35, z }));
      } else {
        solids.push(sphereishSack(0.46, x, z, rng));
      }
    }

    // Drain grates along the curb get a subtle highlight.
    for (const z of [-196, -142, -84, -12, 46, 98, 156, 221]) {
      glows.push(box(0.05, 0.015, 1.3, '#2c2b25', { x: 12.45, y: 0.03, z }));
    }

    addMergedMesh(this.scene, solids, MATERIALS.structure(), 'street-props');
    addMergedMesh(this.scene, glows, MATERIALS.glow(), 'street-glow');
  }

  private buildOverheadNetwork(): void {
    const rng = makeRng(777);
    const wood: THREE.BufferGeometry[] = [];
    const wires: THREE.Vector3[][] = [];
    const poles: Array<{ x: number; z: number }> = [];

    for (const side of [-1, 1]) {
      for (let z = -232; z <= 232; z += 29) {
        const zz = z + range(rng, -2, 2);
        const x = side * 18.4;
        wood.push(cylinder(0.13, 0.2, 8.4, 7, '#2e241b', { x, y: 4.2, z: zz }));
        wood.push(box(2.2, 0.12, 0.16, '#211a14', { x, y: 7.3, z: zz }));
        wood.push(box(1.5, 0.1, 0.15, '#211a14', { x, y: 6.7, z: zz }));
        poles.push({ x, z: zz });
      }
    }

    // Wires along the street and crossing from pole to pole with a natural sag.
    for (const side of [-1, 1]) {
      for (let i = 0; i < poles.length; i++) {
        if (Math.sign(poles[i].x) !== side) continue;
        const next = poles.find((pole, index) => index > i && Math.sign(pole.x) === side);
        if (!next) continue;
        const height = 7.0 + range(rng, -0.15, 0.15);
        const mid = new THREE.Vector3((poles[i].x + next.x) / 2, height - 0.55, (poles[i].z + next.z) / 2);
        wires.push([
          new THREE.Vector3(poles[i].x, height, poles[i].z),
          mid,
          new THREE.Vector3(next.x, height, next.z),
        ]);
        if (rng() > 0.56) {
          wires.push([
            new THREE.Vector3(poles[i].x, height - 0.4, poles[i].z),
            new THREE.Vector3(mid.x - 0.2, height - 1.1, mid.z),
            new THREE.Vector3(next.x, height - 0.5, next.z),
          ]);
        }
      }
    }
    for (let i = 0; i < 22; i++) {
      const z = range(rng, -225, 225);
      wires.push([
        new THREE.Vector3(-18.4, range(rng, 6.1, 7.15), z),
        new THREE.Vector3(0, range(rng, 5.2, 6.0), z + range(rng, -1.5, 1.5)),
        new THREE.Vector3(18.4, range(rng, 6.1, 7.2), z + range(rng, -1, 1)),
      ]);
    }

    // Transformers and breaker boxes hugging the poles.
    for (let i = 0; i < poles.length; i += 3) {
      const pole = poles[i];
      wood.push(cylinder(0.38, 0.38, 0.7, 10, '#4b4d42', { x: pole.x + (pole.x < 0 ? 0.35 : -0.35), y: 5.8, z: pole.z }));
      wood.push(box(0.45, 0.85, 0.32, '#5a5b4e', { x: pole.x + (pole.x < 0 ? -0.3 : 0.3), y: 4.1, z: pole.z + 0.2 }));
    }
    addMergedMesh(this.scene, wood, MATERIALS.structure(), 'utility-poles');

    const linePoints: THREE.Vector3[] = [];
    for (const wire of wires) {
      for (let i = 0; i < 16; i++) {
        const t0 = i / 16;
        const t1 = (i + 1) / 16;
        linePoints.push(pointOnSag(wire, t0), pointOnSag(wire, t1));
      }
    }
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const line = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: '#070707', transparent: true, opacity: 0.88 }),
    );
    line.frustumCulled = false;
    this.scene.add(line);

    // Warm bulbs hanging from the wires.
    const bulbGeometry = new THREE.SphereGeometry(0.075, 5, 4);
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: '#fff3d1', toneMapped: false });
    const count = 220;
    const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, count);
    bulbs.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const bulbColors = ['#ffd58a', '#ffc16b', '#fff0c2', '#ffad5b'];
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const z = -228 + (456 * i) / count;
      const x = Math.sin(i * 1.7) * 9;
      dummy.position.set(x, 5.25 + Math.sin(i * 0.9) * 0.35, z);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
      bulbs.setColorAt(i, color.set(bulbColors[i % bulbColors.length]));
    }
    bulbs.instanceMatrix.needsUpdate = true;
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    this.scene.add(bulbs);

    // Banderitas — the unmistakable Filipino fiesta bunting.
    const flagGeometry = triangleGeometry(0.28, 0.42);
    const flagMaterial = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide, toneMapped: false });
    const flagCount = 260;
    const flags = new THREE.InstancedMesh(flagGeometry, flagMaterial, flagCount);
    flags.frustumCulled = false;
    const flagColors = ['#e4574a', '#f1b74e', '#57a6c9', '#79b55c', '#d77eb2', '#f4e4c6'];
    let flagIndex = 0;
    for (const z of [-185, -110, -35, 35, 110, 185]) {
      for (let i = 0; i < 34 && flagIndex < flagCount; i++) {
        const x = -14.7 + (29.4 * i) / 34;
        dummy.position.set(x, 5.15 + Math.sin((i / 34) * Math.PI) * -0.65, z + Math.sin(i * 1.2) * 0.15);
        dummy.rotation.set(0, 0, Math.PI);
        dummy.updateMatrix();
        flags.setMatrixAt(flagIndex, dummy.matrix);
        flags.setColorAt(flagIndex, color.set(flagColors[flagIndex % flagColors.length]));
        flagIndex++;
      }
    }
    for (let i = flagIndex; i < flagCount; i++) {
      dummy.position.set(0, -20, 0);
      dummy.updateMatrix();
      flags.setMatrixAt(i, dummy.matrix);
    }
    flags.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    this.scene.add(flags);

    // A handful of parol star lanterns under the arch and along the row.
    for (const [x, y, z, colorHex] of [
      [-8.5, 6.5, 108, '#ffb23f'],
      [8.5, 6.5, 108, '#ff8d4a'],
      [-8.5, 6.6, -226, '#ffbf55'],
      [8.5, 6.6, -226, '#ff8d4a'],
      [-17.2, 5.9, 43, '#f5cf68'],
      [17.2, 5.7, -18, '#f5cf68'],
      [-17.2, 5.8, -135, '#f5cf68'],
      [17.2, 5.9, 167, '#f5cf68'],
    ] as const) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false }),
      );
      star.position.set(x, y, z);
      star.scale.set(1, 1.5, 0.55);
      this.scene.add(star);
      const glow = makeGlowSprite(this.glowTexture, colorHex, 3.2);
      glow.position.set(x, y, z);
      this.archLights.push(glow);
      this.scene.add(glow);
    }
  }

  private buildLampPosts(): void {
    const solids: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const lampPositions: Array<{ x: number; z: number }> = [];
    const zs = [-212, -150, -88, -16, 52, 114, 176, 228];
    for (const z of zs) {
      for (const side of [-1, 1]) {
        const x = side * 16.9;
        solids.push(cylinder(0.075, 0.12, 4.3, 8, '#232320', { x, y: 2.15, z }));
        solids.push(box(0.08, 0.08, 0.9, '#232320', { x, y: 4.4, z }));
        solids.push(cylinder(0.22, 0.22, 0.18, 8, '#f4c06d', { x, y: 4.28, z: z + 0.44 }));
        glows.push(cylinder(0.2, 0.2, 0.14, 8, '#ffd387', { x, y: 4.28, z: z + 0.44 }));
        const halo = makeGlowSprite(this.glowTexture, '#ffbd73', 3.6);
        halo.position.set(x, 4.25, z + 0.44);
        halo.material.opacity = 0.7;
        this.scene.add(halo);
        this.warmSprites.push(halo);
        if (side === 1 && z % 2 === 0) lampPositions.push({ x, z });
      }
    }
    addMergedMesh(this.scene, solids, MATERIALS.structure(), 'lamp-posts');
    addMergedMesh(this.scene, glows, MATERIALS.glow(), 'lamp-globes');

    // A few real lights for pools of warmth — enough to sell the lighting.
    for (const position of lampPositions.slice(0, 5)) {
      this.addPointLight(position.x, 4.1, position.z, '#ffb568', 44, 22);
    }
    // Extra warmth around the vendor bays where every player starts.
    this.addPointLight(0, 4.4, 78, '#ffb168', 52, 24);
    this.addPointLight(0, 4.4, 112, '#ffab5f', 44, 22);
    this.addPointLight(0, 7, 105, '#ffad5c', 42, 26);
    this.addPointLight(0, 7, -223, '#ffad5c', 36, 24);
    this.addPointLight(0, 4.4, 22, '#ff9f50', 28, 20);
    this.addPointLight(0, 4.4, -84, '#ff9f50', 25, 18);
  }

  private buildArch(z: number, title: string, subtitle: string): void {
    const frame: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    frame.push(box(1.2, 8.8, 1.2, '#4c2b18', { x: -11.8, y: 4.4, z }));
    frame.push(box(1.2, 8.8, 1.2, '#4c2b18', { x: 11.8, y: 4.4, z }));
    frame.push(box(1.5, 0.7, 2.2, '#5c351d', { x: -11.8, y: 0.35, z }));
    frame.push(box(1.5, 0.7, 2.2, '#5c351d', { x: 11.8, y: 0.35, z }));
    frame.push(box(25, 1.8, 1.1, '#381f10', { x: 0, y: 8.1, z }));
    frame.push(box(25, 0.3, 1.6, '#b7803e', { x: 0, y: 7.2, z }));
    frame.push(box(25, 0.22, 1.25, '#b7803e', { x: 0, y: 9.0, z }));
    for (let i = -5; i <= 5; i++) glow.push(sphere(0.16, i % 2 === 0 ? '#ffd37e' : '#ff9d50', { x: i * 2.18, y: 8.95, z }, 6));
    addMergedMesh(this.scene, frame, MATERIALS.structure(), 'arch-frame');
    addMergedMesh(this.scene, glow, MATERIALS.glow(), 'arch-bulbs');

    const texture = makeCanvasTexture(1024, 220, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#2b1608');
      gradient.addColorStop(0.5, '#4f2d12');
      gradient.addColorStop(1, '#2b1608');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#dba24e';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, width - 24, height - 24);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff1ce';
      ctx.shadowColor = '#ffb34f';
      ctx.shadowBlur = 22;
      ctx.font = '800 92px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(title, width / 2, 98);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e6b66d';
      ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('★  ' + subtitle + '  ★', width / 2, 172);
    });
    const planeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(19.8, 4.2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    );
    planeMesh.position.set(0, 10.6, z - 0.4);
    this.scene.add(planeMesh);

    const back = planeMesh.clone();
    back.rotation.y = Math.PI;
    back.position.z = z + 0.4;
    this.scene.add(back);

    const glowSprite = makeGlowSprite(this.glowTexture, '#ffb25c', 26);
    glowSprite.position.set(0, 9.2, z);
    (glowSprite.material as THREE.SpriteMaterial).opacity = 0.22;
    this.scene.add(glowSprite);
  }

  private buildDistantCity(): void {
    const rng = makeRng(9123);
    const buildings: THREE.BufferGeometry[] = [];
    const windows: THREE.BufferGeometry[] = [];
    const palettes = ['#171a21', '#20242c', '#25262a', '#1b202a', '#2d2722', '#1a2126'];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const width = range(rng, 10, 24);
        const height = range(rng, 18, 46);
        const depth = range(rng, 12, 28);
        const x = side * range(rng, 72, 145);
        const z = -270 + i * 21 + range(rng, -5, 5);
        buildings.push(box(width, height, depth, palettes[Math.floor(rng() * palettes.length)], { x, y: height / 2, z }));
        for (let row = 0; row < Math.floor(height / 4); row++) {
          for (let col = 0; col < Math.floor(width / 4); col++) {
            if (rng() > 0.64) continue;
            const wx = x + side * (width / 2 + 0.03);
            const wz = z - width / 2 + 2 + col * 4 + range(rng, -0.4, 0.4);
            windows.push(box(0.08, 0.65, 1.4, rng() > 0.32 ? '#ffc273' : '#9cc2db', { x: wx, y: 5 + row * 4, z: wz }));
          }
        }
      }
    }
    addMergedMesh(this.scene, buildings, MATERIALS.structure(), 'distant-city');
    addMergedMesh(this.scene, windows, MATERIALS.glow(), 'distant-windows');
  }

  private buildDust(): void {
    const rng = makeRng(671);
    const count = 500;
    const positions = new Float32Array(count * 3);
    this.dustBase = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = range(rng, -17, 17);
      const y = range(rng, 0.2, 6.5);
      const z = range(rng, -235, 235);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this.dustBase[i * 3] = x;
      this.dustBase[i * 3 + 1] = y;
      this.dustBase[i * 3 + 2] = z;
    }
    this.dustPositions = positions;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#d7a565',
      size: 0.055,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });
    this.dust = new THREE.Points(geometry, material);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  addBoundaryAndProps(collision: CollisionSystem): void {
    // The market's frontage is solid; invisible colliders close the side-street mouths.
    for (const side of [-1, 1]) {
      for (const z of WORLD.sideStreets) {
        collision.addBox(side * 19.7, side * 80, z - WORLD.sideStreetHalfWidth, z + WORLD.sideStreetHalfWidth, 0, 12, 'side-street-closure');
      }
    }
    // Arch posts.
    collision.addBox(-12.6, -11.1, 107, 109, 0, 9);
    collision.addBox(11.1, 12.6, 107, 109, 0, 9);
    collision.addBox(-12.6, -11.1, -227, -225, 0, 9);
    collision.addBox(11.1, 12.6, -227, -225, 0, 9);
    // Lamp posts.
    for (const z of [-212, -150, -88, -16, 52, 114, 176, 228]) {
      for (const side of [-1, 1]) collision.addBox(side * 16.9 - 0.2, side * 16.9 + 0.2, z - 0.2, z + 0.2, 0, 4.3);
    }
  }

  update(dt: number, progress: number, focus: THREE.Vector3, visual: EventVisual): void {
    this.elapsed += dt;
    this.lightning = Math.max(0, this.lightning - dt * 2.6);
    this.eventVisual = visual;
    this.applyTime(progress, dt);
    // Golden hour makes the lanterns swell; near close they gutter down.
    const hour = (8 + progress * 18) % 24;
    const duskK = hour >= 16.4 && hour < 19.6 ? clamp(1 - Math.abs(hour - 17.8) / 1.8, 0, 1) : 0;
    const closeK = progress > 0.9 ? clamp((progress - 0.9) / 0.08, 0, 1) : 0;
    const lampK = (1 + duskK * 0.55) * (1 - closeK * 0.55);
    this.sky.position.set(focus.x, 0, focus.z);
    this.moon.position.set(focus.x - 138, 155, focus.z - 185);
    this.moonHalo.position.copy(this.moon.position);

    this.lights.sun.position.set(focus.x - 38, 58, focus.z + 24);
    this.lights.sun.target.position.set(focus.x, 0, focus.z);
    this.lights.sun.target.updateMatrixWorld();

    const flicker = visual === 'outage' ? 0.28 : 1;
    for (const entry of this.pointLights) {
      entry.light.intensity = entry.base * flicker * lampK;
    }
    for (const sprite of this.warmSprites) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity =
        (0.6 + Math.sin(this.elapsed * 2.4 + sprite.position.z) * 0.055) * flicker * lampK;
      // December parol season — lamp halos drift red and green like festival lights.
      if (this.festive) {
        material.color.setHSL(Math.sin(sprite.position.z * 0.7) > 0 ? 0.0 : 0.33, 0.72, 0.6);
      }
    }

    // Slow, low-cost particles drifting through the lamplight.
    const positions = this.dustPositions;
    const base = this.dustBase;
    for (let i = 0; i < positions.length / 3; i++) {
      const phase = this.elapsed * 0.17 + i * 0.83;
      positions[i * 3] = base[i * 3] + Math.sin(phase) * 0.32;
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(phase * 0.6) * 0.28;
      positions[i * 3 + 2] = base[i * 3 + 2] + Math.cos(phase * 0.8) * 0.28;
    }
    const attr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = visual === 'outage' ? 0.22 : 0.5;
  }

  private applyTime(progress: number, dt = 0.016): void {
    const hour = (8 + progress * 18) % 24;
    const daylight =
      hour >= 6 && hour < 17.4
        ? clamp(Math.sin(((hour - 6) / 11.4) * Math.PI) * 1.15, 0, 1)
        : hour >= 17.4 && hour < 19.3
          ? 1 - (hour - 17.4) / 1.9
          : 0;
    const dusk = hour >= 16.4 && hour < 19.6 ? clamp(1 - Math.abs(hour - 17.8) / 1.8, 0, 1) : 0;
    const night = 1 - clamp(daylight * 1.15 + dusk * 0.3, 0, 1);

    const top = new THREE.Color().lerpColors(new THREE.Color('#070d18'), new THREE.Color('#326ba6'), daylight);
    const horizon = new THREE.Color()
      .lerpColors(new THREE.Color('#3e2617'), new THREE.Color('#e5a76e'), dusk)
      .lerp(new THREE.Color('#b9d7e5'), daylight * 0.78);
    const glow = new THREE.Color()
      .lerpColors(new THREE.Color('#b75a24'), new THREE.Color('#ffba67'), dusk)
      .lerp(new THREE.Color('#fff1c8'), daylight * 0.5);

    this.skyUniforms.uTopColor.value.copy(top);
    this.skyUniforms.uHorizonColor.value.copy(horizon);
    this.skyUniforms.uCityGlow.value.copy(glow);
    this.skyUniforms.uNight.value = night;
    this.skyUniforms.uSunY.value = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.7;

    const sunColor = new THREE.Color().lerpColors(new THREE.Color('#ffd7a5'), new THREE.Color('#fff3d8'), daylight);
    this.lights.sun.color.copy(sunColor);
    this.lights.sun.intensity = 0.95 + daylight * 2.2;
    this.lights.sky.intensity = 0.42 + daylight * 0.7;
    this.lights.hemi.intensity = 0.44 + daylight * 0.85;
    this.lights.hemi.color.set(daylight > 0.5 ? '#b8d2e8' : '#50618d');
    this.lights.hemi.groundColor.set(daylight > 0.5 ? '#544331' : '#1b120a');

    const fogColor = new THREE.Color().lerpColors(new THREE.Color('#08111c'), new THREE.Color('#9fb2b9'), daylight * 0.7);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fogColor);
      this.scene.fog.near = daylight > 0.5 ? 65 : 42;
      this.scene.fog.far = daylight > 0.5 ? 270 : 210;
    }
    this.scene.background = fogColor;
    this.moon.visible = night > 0.25;
    this.moonHalo.visible = night > 0.25;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = night;
    (this.moonHalo.material as THREE.SpriteMaterial).opacity = night * 0.42;
    const dim = this.eventVisual === 'outage' ? 0.22 : 1;
    const flash = this.lightning;
    this.lights.hemi.intensity += flash * 1.6;
    this.lights.sky.intensity += flash * 1.1;
    this.lights.sun.intensity += flash * 0.8;
    if (flash > 0.01) this.lights.hemi.color.lerp(new THREE.Color('#cfe0ff'), flash * 0.7);
    for (const entry of this.pointLights) entry.light.intensity = entry.base * dim * (0.65 + night * 0.5) * (1 + flash * 0.6);
    this.wetness += (this.wetTarget - this.wetness) * 0.03;
    const wet = Math.max(
      this.eventVisual === 'rain' || this.eventVisual === 'flood' ? 1 : 0,
      this.wetness,
    );
    // The road darkens and turns glossy as the rain soaks in.
    if (this.roadMaterial) {
      this.roadMaterial.color.set('#9b958b').lerp(new THREE.Color('#5d5a55'), wet * 0.55);
      this.roadMaterial.roughness = 0.88 - wet * 0.38;
    }
    for (let i = 0; i < this.puddles.length; i++) {
      const puddle = this.puddles[i];
      const material = puddle.material as THREE.MeshPhysicalMaterial;
      material.opacity = (daylight > 0.45 ? 0.28 : 0.75) + wet * 0.15;
      // Rain rings: puddles breathe and shimmer while the sky pours.
      const ripple = wet * (0.06 + 0.05 * Math.sin(this.elapsed * 2.6 + i * 1.9));
      puddle.scale.set(1 + ripple, 1, 1 - ripple * 0.6);
    }
    // Raindrop rings expand and fade on random puddles.
    if (wet > 0.3 && this.puddles.length && this.rainRings.length < 20 && Math.random() < dt * 6) {
      const puddle = this.puddles[(Math.random() * this.puddles.length) | 0];
      if (!this.ringGeometry) this.ringGeometry = new THREE.RingGeometry(0.86, 1, 20);
      const mesh = new THREE.Mesh(
        this.ringGeometry,
        new THREE.MeshBasicMaterial({ color: '#a8c8dc', transparent: true, opacity: 0.4, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(puddle.position.x, 0.035, puddle.position.z);
      this.scene.add(mesh);
      this.rainRings.push({ mesh, life: 0 });
    }
    for (let i = this.rainRings.length - 1; i >= 0; i--) {
      const ring = this.rainRings[i];
      ring.life += dt;
      const t = ring.life / 1.1;
      if (t >= 1) {
        this.scene.remove(ring.mesh);
        (ring.mesh.material as THREE.Material).dispose();
        this.rainRings.splice(i, 1);
        continue;
      }
      const s = 0.4 + t * 2.4;
      ring.mesh.scale.set(s, s, 1);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - t);
    }
  }

  applyQuality(quality: QualitySetting): void {
    const shadows = quality === 'high';
    this.lights.sun.castShadow = shadows;
    if (shadows) {
      const size = 2048;
      if (this.lights.sun.shadow.mapSize.x !== size) {
        this.lights.sun.shadow.mapSize.set(size, size);
        this.lights.sun.shadow.map?.dispose();
        this.lights.sun.shadow.map = null;
      }
    }
    (this.dust.material as THREE.PointsMaterial).size = quality === 'low' ? 0.04 : 0.055;
  }

  /** Called when lightning fires — briefly floods the scene with cool light. */
  strike(): void {
    this.lightning = 1;
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
    this.eventVisual = on ? 'outage' : this.eventVisual;
  }

  dispose(): void {
    this.glowTexture.dispose();
    this.skyMaterial.dispose();
    this.scene.remove(this.sky);
    this.scene.remove(this.moon);
    this.scene.remove(this.moonHalo);
    this.scene.remove(this.dust);
    // Shared materials/geometries added elsewhere are released with the scene by Game.
    void this.blackout;
  }
}

function pickCrateColor(rng: () => number): string {
  return ['#6a4a2a', '#8a6534', '#4b3b28', '#74512e'][Math.floor(rng() * 4)];
}

function sphereishSack(radius: number, x: number, z: number, rng: () => number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  geometry.scale(1, 0.72, 0.9);
  geometry.rotateY(range(rng, 0, Math.PI));
  geometry.translate(x, radius * 0.62, z);
  const color = new THREE.Color('#b9a17b').lerp(new THREE.Color('#6d563a'), rng());
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function pointOnSag(wire: THREE.Vector3[], t: number): THREE.Vector3 {
  if (wire.length === 2) return new THREE.Vector3().lerpVectors(wire[0], wire[1], t);
  const first = new THREE.Vector3().lerpVectors(wire[0], wire[1], t);
  const second = new THREE.Vector3().lerpVectors(wire[1], wire[2], t);
  return first.lerp(second, t);
}

function triangleGeometry(width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width / 2, 0, 0,
    width / 2, 0, 0,
    0, -height, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geometry.computeVertexNormals();
  return geometry;
}

void plane;
void merge;
void range;
