import * as THREE from 'three';

/**
 * One-shot join cinematic: a sweeping drone shot from the colon street arch
 * down the market aisle, ending settled behind the player's avatar where the
 * third-person camera takes over. Skippable with any input; ~7 seconds.
 */
export class IntroCinematic {
  private readonly duration = 7;
  private readonly positionCurve: THREE.CatmullRomCurve3;
  private readonly lookCurve: THREE.CatmullRomCurve3;
  private elapsed = 0;
  private finished = false;

  constructor(playerPos: THREE.Vector3, playerYaw: number) {
    // Landing spot mirrors the gameplay camera: behind the avatar, slightly above.
    const back = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
    const landing = playerPos
      .clone()
      .addScaledVector(back, -5.4)
      .add(new THREE.Vector3(0, 2.9, 0));

    // Sweep in from the arch side of the street, weave between the stall rows,
    // then dive onto the landing mark. z is clamped so the path stays plausible
    // for stalls near either end of the market.
    const pz = THREE.MathUtils.clamp(playerPos.z, -60, 90);
    const px = THREE.MathUtils.clamp(playerPos.x, -8, 8);
    this.positionCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(px * 0.4, 15, Math.min(pz + 72, 118)),
      new THREE.Vector3(-8.5, 10.5, pz + 46),
      new THREE.Vector3(7.5, 7, pz + 24),
      new THREE.Vector3(-5, 4.6, pz + 9),
      landing,
    ]);

    // Gaze leads down the aisle early, then settles on the vendor's head.
    this.lookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(px * 0.5, 3.2, pz + 30),
      new THREE.Vector3(-2, 3, pz + 12),
      new THREE.Vector3(2, 2.6, pz + 2),
      playerPos.clone().add(new THREE.Vector3(0, 1.7, 0)),
      playerPos.clone().add(new THREE.Vector3(0, 1.55, 0)),
    ]);
  }

  /** Returns true once the flyover has finished (or been skipped). */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (this.finished) return true;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.elapsed / this.duration;
    // Smoothstep ease — slow reveal, gentle settle.
    const eased = t * t * (3 - 2 * t);
    this.positionCurve.getPoint(eased, camera.position);
    this.lookCurve.getPoint(eased, _lookTarget);
    camera.lookAt(_lookTarget);
    if (t >= 1) this.finished = true;
    return this.finished;
  }

  skip(): void {
    this.finished = true;
  }

  get isFinished(): boolean {
    return this.finished;
  }
}

const _lookTarget = new THREE.Vector3();
