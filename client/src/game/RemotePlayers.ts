import * as THREE from 'three';
import type { RemotePlayer } from '../../../shared/types';
import { Avatar } from './Avatar';
import { lerpAngle } from './utils';

interface RemoteAvatar {
  avatar: Avatar;
  target: THREE.Vector3;
  targetRot: number;
  anim: RemotePlayer['anim'];
  speed: number;
  reputation: number;
  name: string;
  appearanceKey: string;
  lastSeen: number;
}

export class RemotePlayers {
  private scene: THREE.Scene;
  private records = new Map<string, RemoteAvatar>();
  private selfId = '';
  private showNames = true;
  private shadows = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setSelfId(id: string): void {
    this.selfId = id;
  }

  setShowNames(show: boolean): void {
    this.showNames = show;
    for (const record of this.records.values()) record.avatar.setNameVisible(show);
  }

  setShadows(enabled: boolean): void {
    this.shadows = enabled;
    for (const record of this.records.values()) record.avatar.setShadows(enabled);
  }

  upsert(player: RemotePlayer): void {
    if (player.id === this.selfId) return;
    let record = this.records.get(player.id);
    const appearanceKey = `${player.appearance.shirt}|${player.appearance.pants}|${player.appearance.skin}|${player.appearance.hair}`;
    if (!record) {
      const avatar = new Avatar({
        appearance: player.appearance,
        name: player.name,
        subtitle: `REP ${Math.floor(player.reputation)}`,
        shadows: this.shadows,
      });
      avatar.root.position.set(player.x, player.y, player.z);
      avatar.root.rotation.y = player.rot;
      avatar.setNameVisible(this.showNames);
      this.scene.add(avatar.root);
      record = {
        avatar,
        target: new THREE.Vector3(player.x, player.y, player.z),
        targetRot: player.rot,
        anim: player.anim,
        speed: 0,
        reputation: player.reputation,
        name: player.name,
        appearanceKey,
        lastSeen: performance.now(),
      };
      this.records.set(player.id, record);
      return;
    }

    record.target.set(player.x, player.y, player.z);
    record.targetRot = player.rot;
    record.anim = player.anim;
    record.lastSeen = performance.now();
    if (record.appearanceKey !== appearanceKey) {
      record.avatar.setAppearance(player.appearance);
      record.appearanceKey = appearanceKey;
    }
    const rep = Math.floor(player.reputation);
    if (record.name !== player.name || record.reputation !== rep) {
      record.name = player.name;
      record.reputation = rep;
      record.avatar.setNameTag(player.name, `REP ${rep}`);
      record.avatar.setNameVisible(this.showNames);
    }
  }

  syncAll(players: RemotePlayer[]): void {
    const seen = new Set<string>();
    for (const player of players) {
      if (player.id === this.selfId) continue;
      seen.add(player.id);
      this.upsert(player);
    }
    for (const id of [...this.records.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  remove(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.avatar.dispose();
    this.records.delete(id);
  }

  update(dt: number, elapsed: number): void {
    const now = performance.now();
    for (const [id, record] of this.records) {
      const distance = record.avatar.root.position.distanceTo(record.target);
      if (distance > 14) {
        record.avatar.root.position.copy(record.target);
      } else {
        const blend = 1 - Math.exp(-12 * dt);
        record.avatar.root.position.lerp(record.target, blend);
      }
      record.avatar.root.rotation.y = lerpAngle(record.avatar.root.rotation.y, record.targetRot, Math.min(1, dt * 12));
      const speed = record.anim === 'run' ? 6.2 : record.anim === 'walk' ? 3.2 : 0;
      record.speed += (speed - record.speed) * Math.min(1, dt * 8);
      if (record.anim === 'jump' || record.target.y > 0.1) record.avatar.setAnim('jump');
      else record.avatar.setAnim(record.anim);
      record.avatar.update(dt, elapsed + id.length, record.speed);

      // Drop anyone who stopped sending positions and wasn't explicitly removed.
      if (now - record.lastSeen > 25_000) {
        record.avatar.root.visible = false;
      } else {
        record.avatar.root.visible = true;
      }
    }
  }

  get count(): number {
    return this.records.size;
  }

  dispose(): void {
    for (const record of this.records.values()) record.avatar.dispose();
    this.records.clear();
  }
}
