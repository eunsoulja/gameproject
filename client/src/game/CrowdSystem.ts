import * as THREE from 'three';
import { DISTRICTS, PLOT_SLOTS, WORLD } from '../../../shared/layout';
import type { EventVisual } from '../../../shared/config';
import type { QualitySetting } from '../systems/Settings';
import { CrowdAvatar } from './CrowdAvatar';
import { clamp, makeRng, pick, range, type Random } from './utils';

export interface Customer {
  avatar: CrowdAvatar;
  name: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  state: 'walk' | 'browse' | 'scan' | 'chat' | 'queue' | 'waitFood' | 'eat' | 'leave' | 'sit' | 'vendor';
  timer: number;
  chatLine: number;
  chatPartner: Customer | null;
  talkCd: number;
  /** Karendero queue slot (-1 = not queuing). */
  queueIndex: number;
  atSlot: boolean;
  /** Dish id/name the customer ordered, while waiting for food. */
  orderDish: string | null;
  orderDishName: string | null;
  waitIndex: number;
  /** Seconds the order can sit before the customer gives up. */
  orderTimer: number;
  /** Plaza bench index while sitting (-1 = not seated). */
  sitIndex: number;
  /** Cooldown before this NPC acknowledges the player again. */
  reactCd: number;
  /** Vendor stall index while minding a shop (-1 = shopper). */
  vendorIndex: number;
  faceYaw: number;
  active: boolean;
  bob: number;
  hasUmbrella: boolean;
  role: 'walker' | 'sleeper' | 'linger' | 'kid' | 'elder';
}

const SHIRTS = ['#d9534a', '#3f8ccc', '#f0b64c', '#63a56c', '#9a66c4', '#ef8a52', '#ede3cc', '#3d4a5e', '#c56c93', '#5fb3a8'];
const PANTS = ['#283449', '#1a1f2a', '#414f63', '#665d4d', '#53313a', '#2f433c'];
const SKINS = ['#f2d2b4', '#e4b58d', '#c99767', '#a66e45', '#7d4f2f'];
const HAIRS = ['#191210', '#2e1f18', '#53331e', '#7f4b28', '#c79a55', '#24222c'];
const NAMES = [
  'Aling Nena', 'Mang Domeng', 'Child Care', 'Chef Boy', 'Tita Rosie',
  'Kuya Jayson', 'Manang Inday', 'Dodong', 'Perla', 'Ramon',
  'Lorna', 'Edong', 'Fe Dela Cruz', 'Gorio', 'Hetty',
  'Isko', 'Jing', 'Kulas', 'Luningning', 'Mando',
  'Narding', 'Onyok', 'Pacing', 'Quilo', 'Rosing',
  'Susing', 'Tatang', 'Uling', 'Vangie', 'Wena',
];
// Market chatter between neighbors.
const AMBIENT_LINES = [
  'Kumusta! Suki na kita ah!', 'Grabe, ang ganda ng prutas!',
  'Sige na, takbo na tayo!', 'Ang sarap ngulé!', 'Bayad na! Salamat ha!',
  'Sukli ha!', 'Ang init ng:init!', 'Sukli ko muna, ha!',
  'Pabili ka na ng danggit?', 'Uy, anong klaseng tawad iyan?',
  'Gising ka na, dilaw na!', 'Balik-balik ulit bukas, ha!',
  'Sarap ng kape sa may kanto!', 'Ingatan ka sa kanto, madulas!',
  'Tara, punta na tayo sa pizza!', 'Hoy, sulit ba iyan?',
  'Ang saya-saya ng mga bata!', 'Pirmi nangyayari ang ganyan!',
];
// Replies aimed at the player who walks up and chats.
const PLAYER_LINES = [
  'Kumusta! Good day, uy!', 'Uy, suki to! Balik-balik!',
  'Ang lakas ng tindahan mo!', 'Sarap ng amoy dito, ha!',
  'Sige, subukan ko iyan!', 'Ang bait mo, thank you!',
  'Isang beses lang, ha!', 'Hoy, ang sarap ng kwarta mo!',
  'Salamat sa pag-join!', 'Uy, ang galing mo, angas!',
  'Hoy brader! Masarap dito, di ba?', 'Kumusta sa tindahan!',
];
// Calls vendors make from behind their own counters.
const VENDOR_LINES = [
  'Sari-sari store! Pabili ka na!', 'Sobrang linis dito, ha!',
  'Isang bit bit lang, bes!', 'Ang ganda ng prutas ko!',
  'Tara, pumasok ka lang!', 'Suki treatment sa inyo!',
  'Babae, ang mura ng saging!', 'Hoy, discounted na ngayon!',
  'Sari na ko! Pumili ka na!', 'Sarap ng inihaw ko, amoy mo!',
  'Uy, kilala kita! Angas vendor ka!', 'Sarap ng lugar na ito!',
];

/** Ambient shoppers and browsers that make Colon feel alive. */
export class CrowdSystem {
  private scene: THREE.Scene;
  private rng: Random = makeRng(77123);
  private customers: Customer[] = [];
  private maxCount = 44;
  private targetCount = 26;
  private quality: QualitySetting = 'high';
  private ownX = 0;
  private ownZ = 0;
  private ownInward = 1;
  private ownConfigured = false;
  private ownIsFood = false;
  private eventVisual: EventVisual = 'none';
  private rainy = false;
  private progress = START_PROGRESS;
  private built = false;
  private benchSpots: Array<{ x: number; z: number }> = [];
  private playerX = 0;
  private playerZ = 0;
  private hasPlayer = false;
  private playerEmoting = false;
  private vendorSpots: Array<{ x: number; z: number; yaw: number }> = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    for (let i = 0; i < this.maxCount; i++) {
      this.customers.push(this.createCustomer(i));
    }
    // Plaza benches — same layout MarketGenerator builds.
    const plaza = DISTRICTS.find((d) => d.id === 'plaza');
    if (plaza) {
      for (let z = plaza.zMin + 6; z < plaza.zMax - 4; z += 14) {
        for (const s of [-1, 1] as Array<-1 | 1>) {
          this.benchSpots.push({ x: s * 5.4, z });
        }
      }
    }
    this.applyDensity();
  }

  setOwnStall(plotIndex: number, foodStall = false): void {
    const slot = PLOT_SLOTS[plotIndex];
    if (!slot) return;
    this.ownX = slot.x;
    this.ownZ = slot.z;
    this.ownInward = slot.side === 'west' ? 1 : -1;
    this.ownIsFood = foodStall;
    this.ownConfigured = true;
  }

  setQuality(quality: QualitySetting): void {
    this.quality = quality;
    this.applyDensity();
  }

  /** Reveal hand umbrellas on roughly two-fifths of the crowd when it rains. */
  setRainy(on: boolean): void {
    if (this.rainy === on) return;
    this.rainy = on;
    for (const customer of this.customers) {
      customer.avatar.setUmbrella(on && customer.hasUmbrella);
    }
  }

  /** 0 = dry, ~0.5 = rain, 1 = typhoon — drives hunch, shuffle and umbrella tilt. */
  setStorm(level: number): void {
    for (const customer of this.customers) customer.avatar.setStorm(level);
  }

  setAtmosphere(progress: number, eventVisual: EventVisual, quality: QualitySetting): void {
    this.progress = progress;
    this.eventVisual = eventVisual;
    this.quality = quality;
    this.applyDensity();
  }

  private applyDensity(): void {
    let target = 24;
    if (this.progress >= 0.47 && this.progress < 0.82) target = 34;
    else if (this.progress >= 0.82) target = 27;
    else target = 18;
    if (this.eventVisual === 'crowd') target = 44;
    if (this.eventVisual === 'rain') target = Math.round(target * 0.62);
    if (this.eventVisual === 'flood') target = Math.round(target * 0.4);
    if (this.quality === 'low') target = Math.round(target * 0.55);
    else if (this.quality === 'medium') target = Math.round(target * 0.78);
    // Vendor slots are reserved up front — shoppers fill whatever remains.
    this.targetCount = clamp(target, 8, Math.max(8, this.maxCount - this.vendorSpots.length));
  }

  private createCustomer(index: number): Customer {
    const appearance = {
      shirt: pick(this.rng, SHIRTS),
      pants: pick(this.rng, PANTS),
      skin: pick(this.rng, SKINS),
      hair: pick(this.rng, HAIRS),
    };
    const avatar = new CrowdAvatar(appearance, range(this.rng, 0.88, 1.03));
    // Roughly one shopper in nine is a kid — smaller, quicker, skips sometimes.
    const isKid = index % 11 === 4;
    // And one in thirteen is an elder — slower, a little more stooped.
    const isElder = !isKid && index % 13 === 7;
    if (isKid) {
      avatar.root.scale.multiplyScalar(0.58);
      avatar.setKid(true);
    } else if (isElder) {
      avatar.setElder(true);
    }
    avatar.root.visible = false;
    this.scene.add(avatar.root);
    const x = range(this.rng, -7.5, 7.5);
    const z = range(this.rng, WORLD.playableMinZ + 6, WORLD.playableMaxZ - 6);
    avatar.root.position.set(x, 0, z);
    return {
      avatar,
      name: NAMES[index % NAMES.length],
      x,
      z,
      targetX: x,
      targetZ: z,
      speed: 0,
      state: 'scan',
      timer: range(this.rng, 0, 2),
      chatLine: 0,
      chatPartner: null,
      talkCd: 0,
      queueIndex: -1,
      atSlot: false,
      orderDish: null,
      orderDishName: null,
      waitIndex: -1,
      orderTimer: 0,
      sitIndex: -1,
      reactCd: 0,
      vendorIndex: -1,
      faceYaw: 0,
      active: false,
      bob: index * 0.13,
      hasUmbrella: index % 5 < 2,
      role: isKid ? 'kid' : isElder ? 'elder' : index % 9 === 0 ? 'sleeper' : index % 7 === 0 ? 'linger' : 'walker',
    };
  }

  update(dt: number, elapsed: number, playerPos?: THREE.Vector3, playerEmoting = false): void {
    if (!this.built) return;
    if (playerPos) {
      this.playerX = playerPos.x;
      this.playerZ = playerPos.z;
      this.hasPlayer = true;
    }
    this.playerEmoting = playerEmoting;
    this.applyDensity();
    const vendorCount = Math.min(this.vendorSpots.length, this.customers.length);
    let active = 0;
    for (let i = 0; i < this.customers.length; i++) {
      const customer = this.customers[i];
      const shouldBeActive = i < vendorCount || i - vendorCount < this.targetCount;
      if (shouldBeActive && !customer.active) {
        this.activate(customer, i);
        customer.active = true;
      } else if (!shouldBeActive && customer.active) {
        customer.active = false;
        customer.avatar.root.visible = false;
        continue;
      }
      if (!customer.active) continue;
      active++;
      this.updateCustomer(customer, dt, elapsed);
    }
    this.separateCustomers(dt);
    this.reactToPlayer(dt, elapsed);
    if (active === 0) this.targetCount = Math.max(6, this.targetCount);
  }

  /** Soft-body separation — shoppers nudge apart instead of overlapping. */
  private separateCustomers(dt: number): void {
    const act = this.customers.filter((c) => c.active && c.vendorIndex < 0);
    for (let i = 0; i < act.length; i++) {
      const a = act[i];
      for (let j = i + 1; j < act.length; j++) {
        const b = act[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.36 || d2 === 0) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = ((0.6 - d) / d) * 0.5 * Math.min(1, dt * 8);
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  }

  /** NPCs acknowledge the player — wave back at emotes, step out of the way. */
  private reactToPlayer(dt: number, elapsed: number): void {
    if (!this.hasPlayer) return;
    for (const c of this.customers) {
      if (!c.active) continue;
      c.reactCd = Math.max(0, c.reactCd - dt);
      const dx = c.x - this.playerX;
      const dz = c.z - this.playerZ;
      const d2 = dx * dx + dz * dz;
      // Step aside — shoppers give the vendor a wide berth.
      if (d2 < 1.7 && d2 > 0.001) {
        const movable =
          c.state === 'walk' || c.state === 'scan' || c.state === 'browse' || c.state === 'chat';
        if (movable) {
          const d = Math.sqrt(d2);
          const push = ((1.3 - d) / d) * dt * 2.2;
          c.x += dx * push;
          c.z += dz * push;
        }
      }
      // Wave back when the player emotes nearby.
      if (this.playerEmoting && d2 < 10.5 && c.reactCd <= 0) {
        c.reactCd = range(this.rng, 5, 12);
        c.faceYaw = Math.atan2(this.playerX - c.x, this.playerZ - c.z);
        c.avatar.say(pick(this.rng, ['Hello!', 'Oy!', 'Hi!', 'Kumusta!']), 1.8);
        c.avatar.react();
      }
    }
  }

  /** NPC stall keepers — posted behind their own counters, calling out wares. */
  setVendorSpots(spots: Array<{ x: number; z: number; yaw: number }>): void {
    this.vendorSpots = spots.slice(0, 10);
    this.applyDensity();
  }

  private activate(customer: Customer, index: number): void {
    const vendorSpot = index < this.vendorSpots.length ? this.vendorSpots[index] : null;
    if (vendorSpot) {
      customer.vendorIndex = index;
      customer.x = vendorSpot.x;
      customer.z = vendorSpot.z;
      customer.targetX = vendorSpot.x;
      customer.targetZ = vendorSpot.z;
      customer.faceYaw = vendorSpot.yaw;
      customer.state = 'vendor';
      customer.timer = range(this.rng, 2, 6);
      customer.speed = 0;
      customer.avatar.root.position.set(customer.x, 0, customer.z);
      customer.avatar.root.rotation.y = vendorSpot.yaw;
      customer.avatar.root.visible = true;
      return;
    }
    customer.vendorIndex = -1;
    const x = range(this.rng, -7.6, 7.6);
    const z = range(this.rng, WORLD.playableMinZ + 8, WORLD.playableMaxZ - 8);
    customer.x = x;
    customer.z = z;
    customer.avatar.root.position.set(x, 0, z);
    customer.avatar.root.visible = true;
    customer.state = 'scan';
    customer.timer = range(this.rng, 0.2, 2.5);
    customer.speed = 0;
    customer.queueIndex = -1;
    customer.atSlot = false;
    customer.orderDish = null;
    customer.orderDishName = null;
    customer.waitIndex = -1;
    customer.orderTimer = 0;
    customer.sitIndex = -1;
    customer.reactCd = 0;
    customer.avatar.setSit(false);
  }

  private updateCustomer(customer: Customer, dt: number, elapsed: number): void {
    customer.talkCd = Math.max(0, customer.talkCd - dt);
    // Stall keepers stay posted — they call out, tidy up, wave at browsers.
    if (customer.vendorIndex >= 0 && customer.state === 'vendor') {
      const spot = this.vendorSpots[customer.vendorIndex];
      if (!spot) {
        customer.state = 'scan';
        customer.timer = 1;
      } else {
        customer.timer -= dt;
        customer.speed += (0 - customer.speed) * Math.min(1, dt * 5);
        customer.faceYaw = spot.yaw;
        if (customer.timer <= 0) {
          customer.timer = range(this.rng, 4, 9);
          customer.avatar.say(pick(this.rng, VENDOR_LINES), 2.6);
          if (this.rng() < 0.3) customer.avatar.react();
        }
        customer.avatar.setLean(0.04);
        customer.avatar.root.position.set(customer.x, 0, customer.z);
        customer.avatar.root.rotation.y +=
          (customer.faceYaw - customer.avatar.root.rotation.y) * Math.min(1, dt * 4);
        customer.avatar.update(dt, elapsed + customer.bob, 0.001);
        return;
      }
    }
    // Sleepers doze on the walkway — they mostly stand still, shifting weight.
    // A shopper pulled into a chat wakes up for the conversation.
    if (customer.role === 'sleeper' && customer.state !== 'chat') {
      customer.timer -= dt;
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 3);
      if (customer.timer <= 0) {
        customer.timer = range(this.rng, 14, 30);
        customer.x += range(this.rng, -0.5, 0.5);
        customer.z += range(this.rng, -0.5, 0.5);
        customer.faceYaw = range(this.rng, -0.6, 0.6) + (customer.x < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      customer.avatar.root.position.set(customer.x, 0, customer.z);
      customer.avatar.setLean(0.05);
      customer.avatar.root.rotation.y += (customer.faceYaw - customer.avatar.root.rotation.y) * Math.min(1, dt * 2);
      customer.avatar.update(dt, elapsed + customer.bob, 0.001);
      return;
    }
    customer.timer -= dt;
    if (customer.state === 'scan') {
      if (customer.timer <= 0) {
        // Neighbors stop to gossip now and then — pairs face off and chat.
        if (this.rng() < 0.12 && this.tryStartChat(customer)) {
          // handled inside tryStartChat
        } else {
          this.chooseTarget(customer);
          if (customer.queueIndex < 0) customer.state = 'walk';
        }
      }
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 5);
    } else if (customer.state === 'walk') {
      const dx = customer.targetX - customer.x;
      const dz = customer.targetZ - customer.z;
      const distance = Math.hypot(dx, dz);
      const targetSpeed = customer.speed > 0.1 ? customer.speed : range(this.rng, 1.15, 1.75);
      if (distance < 0.42) {
        customer.state = 'browse';
        customer.timer =
          range(this.rng, 1.8, 5.6) *
          (this.eventVisual === 'crowd' ? 1.35 : 1) *
          (customer.role === 'linger' ? 2.4 : 1) *
          (customer.role === 'kid' ? 0.7 : customer.role === 'elder' ? 1.5 : 1);
        if (this.eventVisual === 'crowd') customer.timer += 1.2;
        customer.faceYaw = this.browseYaw(customer);
      } else {
        const nx = dx / distance;
        const nz = dz / distance;
        const pace = customer.role === 'kid' ? 1.3 : customer.role === 'elder' ? 0.72 : 1;
        const step = Math.min(distance, targetSpeed * pace * dt);
        customer.x += nx * step;
        customer.z += nz * step;
        customer.speed += (targetSpeed - customer.speed) * Math.min(1, dt * 4);
        customer.faceYaw = Math.atan2(nx, nz);
      }
    } else if (customer.state === 'chat') {
      // Standing conversation — face the partner (or the player) and trade lines.
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 6);
      const partner = customer.chatPartner;
      if (partner) {
        const pdx = partner.x - customer.x;
        const pdz = partner.z - customer.z;
        if (Math.hypot(pdx, pdz) > 0.2) customer.faceYaw = Math.atan2(pdx, pdz);
      }
      customer.chatLine -= dt;
      if (customer.chatLine <= 0) {
        customer.chatLine = range(this.rng, 1.4, 2.1);
        const lines = partner ? AMBIENT_LINES : PLAYER_LINES;
        customer.avatar.say(pick(this.rng, lines));
        if (this.rng() < 0.35) customer.avatar.react();
      }
      if (customer.timer <= 0) {
        customer.state = 'scan';
        customer.timer = range(this.rng, 0.5, 1.8);
        const other = customer.chatPartner;
        if (other && other.state === 'chat') {
          other.state = 'scan';
          other.timer = range(this.rng, 0.5, 1.8);
          other.chatPartner = null;
        }
        customer.chatPartner = null;
      }
    } else if (customer.state === 'queue' || customer.state === 'waitFood') {
      // Karendero: walk to your spot, then idle facing the counter.
      const dx = customer.targetX - customer.x;
      const dz = customer.targetZ - customer.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.45) {
        const targetSpeed = customer.speed > 0.1 ? customer.speed : range(this.rng, 1.15, 1.75);
        const nx = dx / distance;
        const nz = dz / distance;
        const step = Math.min(distance, targetSpeed * dt);
        customer.x += nx * step;
        customer.z += nz * step;
        customer.speed += (targetSpeed - customer.speed) * Math.min(1, dt * 4);
        customer.faceYaw = Math.atan2(nx, nz);
        if (customer.state === 'queue') customer.atSlot = false;
      } else {
        customer.speed += (0 - customer.speed) * Math.min(1, dt * 6);
        customer.faceYaw = -this.ownInward * Math.PI / 2;
        if (customer.state === 'queue') customer.atSlot = true;
      }
      if (customer.state === 'waitFood') {
        customer.orderTimer -= dt;
        if (customer.orderTimer <= 0) this.sendAway(customer, 'Sayang, nilipas na!');
      }
    } else if (customer.state === 'sit') {
      // Walk to a plaza bench, sit for a spell, then move on.
      const dx = customer.targetX - customer.x;
      const dz = customer.targetZ - customer.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.5) {
        const targetSpeed = customer.speed > 0.1 ? customer.speed : range(this.rng, 1.0, 1.5);
        const nx = dx / distance;
        const nz = dz / distance;
        const step = Math.min(distance, targetSpeed * dt);
        customer.x += nx * step;
        customer.z += nz * step;
        customer.speed += (targetSpeed - customer.speed) * Math.min(1, dt * 4);
        customer.faceYaw = Math.atan2(nx, nz);
        customer.avatar.setSit(false);
      } else {
        customer.speed += (0 - customer.speed) * Math.min(1, dt * 6);
        // Face the walkway — benches look out onto the street.
        customer.faceYaw = customer.targetX < 0 ? Math.PI / 2 : -Math.PI / 2;
        customer.avatar.setSit(true);
        if (customer.timer <= 0) {
          customer.avatar.setSit(false);
          customer.sitIndex = -1;
          customer.state = 'scan';
          customer.timer = range(this.rng, 0.4, 1.5);
        }
      }
    } else if (customer.state === 'eat') {
      // Finished meal — stand a moment, then head out.
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 6);
      if (customer.timer <= 0) this.sendAway(customer);
    } else if (customer.state === 'leave') {
      // Walk off the market edge, then recycle.
      const dx = customer.targetX - customer.x;
      const dz = customer.targetZ - customer.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.7) {
        const targetSpeed = customer.speed > 0.1 ? customer.speed : 1.5;
        const nx = dx / distance;
        const nz = dz / distance;
        const step = Math.min(distance, targetSpeed * dt);
        customer.x += nx * step;
        customer.z += nz * step;
        customer.speed += (targetSpeed - customer.speed) * Math.min(1, dt * 4);
        customer.faceYaw = Math.atan2(nx, nz);
      } else {
        customer.active = false;
        customer.avatar.root.visible = false;
        customer.speed = 0;
      }
    } else {
      customer.speed += (0 - customer.speed) * Math.min(1, dt * 7);
      if (customer.timer <= 0) {
        this.chooseTarget(customer);
        if (customer.queueIndex < 0) customer.state = 'walk';
      }
    }

    customer.avatar.root.position.set(customer.x, 0, customer.z);
    // Browsers lean in toward the stall — a tiny posture cue that sells the stall visit.
    customer.avatar.setLean(customer.state === 'browse' ? 0.12 : customer.state === 'chat' ? 0.07 : 0);
    const current = customer.avatar.root.rotation.y;
    let delta = customer.faceYaw - current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    customer.avatar.root.rotation.y = current + delta * Math.min(1, dt * 7);
    const moving =
      customer.state === 'walk' ||
      customer.state === 'queue' ||
      customer.state === 'waitFood' ||
      customer.state === 'leave' ||
      customer.state === 'sit';
    customer.avatar.update(dt, elapsed + customer.bob, moving ? customer.speed : 0.001);
  }

  private browseYaw(customer: Customer): number {
    // Face the nearest side of the street (where the stalls are).
    const side = customer.x < -3 ? -1 : customer.x > 3 ? 1 : this.rng() > 0.5 ? 1 : -1;
    return side > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  /** Pick a z biased toward busy districts — plaza and drag pull crowds. */
  private pickCrowdZ(): number {
    const total = DISTRICTS.reduce((s, d) => s + d.crowd, 0);
    let roll = this.rng() * total;
    for (const zone of DISTRICTS) {
      roll -= zone.crowd;
      if (roll <= 0) return range(this.rng, zone.zMin + 5, zone.zMax - 5);
    }
    return range(this.rng, WORLD.playableMinZ + 8, WORLD.playableMaxZ - 8);
  }

  private chooseTarget(customer: Customer): void {
    // Food stalls run a real queue — hungry shoppers line up at the counter.
    if (this.ownIsFood && this.ownConfigured && this.rng() < 0.5 && this.tryJoinQueue(customer)) {
      return;
    }
    // Rest stop — plaza benches invite a spell of people-watching.
    if (this.rng() < 0.12 && this.trySit(customer)) {
      return;
    }
    const roll = this.rng();
    if (this.ownConfigured && roll < 0.38) {
      // Walk up to the player's counter.
      customer.targetX = this.ownX + this.ownInward * range(this.rng, 1.0, 2.0);
      customer.targetZ = this.ownZ + range(this.rng, -2.2, 2.2);
      return;
    }
    if (roll < 0.74) {
      // Browse one of the long rows of NPC stalls, biased to busy districts.
      const side = this.rng() > 0.5 ? 1 : -1;
      let z = this.pickCrowdZ();
      if (z > -30 && z < 88) {
        z = this.rng() > 0.5 ? range(this.rng, 94, 214) : range(this.rng, -214, -38);
      }
      customer.targetX = side * range(this.rng, 7.2, 8.6);
      customer.targetZ = z;
      return;
    }
    // Stroll along the middle of Colon.
    const direction = this.rng() > 0.5 ? 1 : -1;
    const distance = range(this.rng, 14, 48);
    customer.targetX = clamp(customer.x + range(this.rng, -6, 6), -8.2, 8.2);
    customer.targetZ = clamp(customer.z + direction * distance, WORLD.playableMinZ + 6, WORLD.playableMaxZ - 6);
  }

  /** Pair two nearby shoppers into a short gossip session. */
  private tryStartChat(customer: Customer): boolean {
    let partner: Customer | null = null;
    let best = 4.4;
    for (const other of this.customers) {
      if (other === customer || !other.active || other.state === 'chat') continue;
      if (other.state !== 'scan' && other.state !== 'browse') continue;
      const d = Math.hypot(other.x - customer.x, other.z - customer.z);
      if (d < best) {
        best = d;
        partner = other;
      }
    }
    if (!partner) return false;
    const duration = range(this.rng, 3.5, 6.5);
    customer.state = 'chat';
    customer.chatPartner = partner;
    customer.timer = duration;
    customer.chatLine = range(this.rng, 0.2, 1.0);
    customer.speed = 0;
    partner.state = 'chat';
    partner.chatPartner = customer;
    partner.timer = duration;
    partner.chatLine = range(this.rng, 0.9, 1.9);
    partner.speed = 0;
    return true;
  }

  /** Nearest chat-able shopper to a world position — used for the talk prompt. */
  nearestForTalk(x: number, z: number, radius: number): Customer | null {
    let best: Customer | null = null;
    let bestD = radius;
    for (const c of this.customers) {
      if (!c.active || c.state === 'chat' || c.queueIndex >= 0) continue;
      if (c.state === 'waitFood' || c.state === 'eat' || c.state === 'leave') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Player-initiated chat: the shopper turns, greets and gossips for a few seconds. */
  talkTo(customer: Customer, px: number, pz: number): boolean {
    if (!customer.active || customer.talkCd > 0) return false;
    if (customer.queueIndex >= 0 || customer.state === 'waitFood' || customer.state === 'eat' || customer.state === 'leave') {
      return false;
    }
    const other = customer.chatPartner;
    if (other && other.state === 'chat') {
      other.state = 'scan';
      other.timer = range(this.rng, 0.4, 1.5);
      other.chatPartner = null;
    }
    customer.chatPartner = null;
    customer.state = 'chat';
    customer.timer = range(this.rng, 3, 4.5);
    customer.chatLine = 0.25;
    customer.talkCd = 7;
    customer.speed = 0;
    customer.sitIndex = -1;
    customer.avatar.setSit(false);
    customer.faceYaw = Math.atan2(px - customer.x, pz - customer.z);
    customer.avatar.say(pick(this.rng, ['Kumusta!', 'Uy!', 'Hello, uy!']), 1.6);
    customer.avatar.react();
    return true;
  }

  // --- Karendero queue -------------------------------------------------

  private queueSlotPos(index: number): { x: number; z: number } {
    return { x: this.ownX + this.ownInward * 3.35, z: this.ownZ + 1.4 + index * 1.75 };
  }

  private waitSpotPos(index: number): { x: number; z: number } {
    const spots = [
      { x: this.ownX + this.ownInward * 3.35, z: this.ownZ - 2.4 },
      { x: this.ownX + this.ownInward * 4.7, z: this.ownZ - 0.6 },
      { x: this.ownX + this.ownInward * 4.7, z: this.ownZ - 3.4 },
    ];
    return spots[index % spots.length];
  }

  /** Claim the lowest free queue slot; false when the line is full. */
  private tryJoinQueue(customer: Customer): boolean {
    const used = new Set<number>();
    for (const c of this.customers) {
      if (c.active && c.state === 'queue') used.add(c.queueIndex);
    }
    let slot = -1;
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return false;
    const pos = this.queueSlotPos(slot);
    customer.queueIndex = slot;
    customer.state = 'queue';
    customer.atSlot = false;
    customer.targetX = pos.x;
    customer.targetZ = pos.z;
    customer.timer = 0;
    return true;
  }

  /** Claim a free plaza bench and settle in for a while. */
  private trySit(customer: Customer): boolean {
    if (!this.benchSpots.length) return false;
    const used = new Set<number>();
    for (const c of this.customers) {
      if (c.active && c.state === 'sit') used.add(c.sitIndex);
    }
    const free = this.benchSpots.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) return false;
    const idx = free[Math.floor(this.rng() * free.length)];
    const spot = this.benchSpots[idx];
    customer.sitIndex = idx;
    customer.state = 'sit';
    customer.atSlot = false;
    customer.targetX = spot.x;
    customer.targetZ = spot.z;
    customer.timer = range(this.rng, 14, 30);
    customer.speed = 0;
    return true;
  }

  /** Shift everyone in line up after the front customer leaves. */
  private advanceQueue(): void {
    const queued = this.customers
      .filter((c) => c.active && c.state === 'queue')
      .sort((a, b) => a.queueIndex - b.queueIndex);
    queued.forEach((c, i) => {
      if (c.queueIndex !== i) {
        c.queueIndex = i;
        const pos = this.queueSlotPos(i);
        c.targetX = pos.x;
        c.targetZ = pos.z;
        c.atSlot = false;
      }
    });
  }

  /** The customer at the front of the line, ready to order. */
  queueFront(): Customer | null {
    for (const c of this.customers) {
      if (c.active && c.state === 'queue' && c.queueIndex === 0 && c.atSlot) return c;
    }
    return null;
  }

  frontSlotPos(): { x: number; z: number } {
    return this.queueSlotPos(0);
  }

  queueLength(): number {
    return this.customers.filter((c) => c.active && c.state === 'queue').length;
  }

  /** Order taken — the customer leaves the line and waits for their plate. */
  startOrderFlow(customer: Customer, dishId: string, dishName: string): void {
    customer.orderDish = dishId;
    customer.orderDishName = dishName;
    customer.queueIndex = -1;
    customer.state = 'waitFood';
    customer.orderTimer = 55;
    const used = new Set<number>();
    for (const c of this.customers) {
      if (c.active && c.state === 'waitFood') used.add(c.waitIndex);
    }
    let wi = -1;
    for (let i = 0; i < 3; i++) {
      if (!used.has(i)) {
        wi = i;
        break;
      }
    }
    customer.waitIndex = wi < 0 ? 2 : wi;
    const pos = this.waitSpotPos(customer.waitIndex);
    customer.targetX = pos.x;
    customer.targetZ = pos.z;
    customer.speed = 0;
    customer.avatar.say(`1 ${dishName}`, 7);
    this.advanceQueue();
  }

  /** Plate served — the customer eats for a moment, then leaves happy. */
  markServed(customer: Customer): void {
    customer.state = 'eat';
    customer.timer = 3.4;
    customer.speed = 0;
    customer.avatar.say(pick(this.rng, ['Salamat!', 'Sarap!', 'Ang saya!']), 2.6);
    customer.avatar.react();
  }

  /** Send a customer off the market — angry line optional. */
  private sendAway(customer: Customer, line?: string): void {
    if (line) customer.avatar.say(line, 2.2);
    customer.state = 'leave';
    customer.queueIndex = -1;
    const dir = this.ownInward > 0 ? -1 : 1;
    customer.targetX = dir * 15;
    customer.targetZ = customer.z + range(this.rng, -5, 5);
    customer.speed = 0;
    this.advanceQueue();
  }

  /** Nearest customer waiting for a plate — for the serve prompt. */
  nearestWaiting(x: number, z: number, radius: number): Customer | null {
    let best: Customer | null = null;
    let bestD = radius;
    for (const c of this.customers) {
      if (!c.active || c.state !== 'waitFood') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** Nearest waitFood customer holding a specific dish. */
  nearestWaitingForDish(x: number, z: number, radius: number, dishId: string): Customer | null {
    let best: Customer | null = null;
    let bestD = radius;
    for (const c of this.customers) {
      if (!c.active || c.state !== 'waitFood' || c.orderDish !== dishId) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  get activeCount(): number {
    return this.customers.filter((c) => c.active).length;
  }

  setShadows(_enabled: boolean): void {
    // Crowd meshes are intentionally unshadowed to keep draw cost down.
  }

  dispose(): void {
    for (const customer of this.customers) customer.avatar.dispose();
    this.customers = [];
  }
}

const START_PROGRESS = 0.52;
