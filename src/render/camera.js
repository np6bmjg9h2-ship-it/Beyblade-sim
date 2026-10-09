// Camera rig. Modes: broadcast (fixed high angle behind the player's side),
// tracking (frames both tops, zooms with separation), player (close follow),
// overhead (top-down, clearest for steering), launch (close-up on the
// launcher), victory (orbit the winner). The right stick adds yaw/pitch/zoom
// offsets in every mode. Shake and impact emphasis never move the camera far
// enough to compromise control.

import * as THREE from 'three';

export const CAMERA_MODES = ['broadcast', 'tracking', 'player', 'overhead'];
export const CAMERA_NAMES = { broadcast: 'Broadcast', tracking: 'Dynamic Tracking', player: 'Player Focus', overhead: 'Overhead', launch: 'Launch', victory: 'Victory' };

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'broadcast';
    this.override = null; // 'launch' | 'victory' | 'showcase'
    this.baseYaw = Math.PI / 2; // camera sits on +z looking toward -z by default
    this.yawOff = 0;
    this.pitchOff = 0;
    this.zoomOff = 0;
    this.pos = new THREE.Vector3(0, 0.4, 0.5);
    this.target = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shakeAmt = 0;
    this.emphasis = 0;
    this.emphasisPoint = new THREE.Vector3();
    this.sensitivity = 1;
    this.invertY = false;
    this.orbitT = 0;
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  setPlayerSide(side) {
    // player 0 launches from -x; put the camera behind them
    this.baseYaw = side === 0 ? Math.PI : 0;
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
    return this.mode;
  }

  input(dx, dy, dt) {
    const k = 2.2 * this.sensitivity;
    this.yawOff += dx * k * dt;
    this.pitchOff = Math.max(-0.5, Math.min(0.55, this.pitchOff + (this.invertY ? -dy : dy) * k * 0.6 * dt));
  }

  zoom(dz) { this.zoomOff = Math.max(-0.2, Math.min(0.35, this.zoomOff + dz)); }

  shake(a) { this.shakeAmt = Math.min(0.012, this.shakeAmt + a); }

  emphasize(point) { this.emphasis = 1; this.emphasisPoint.set(point[0], point[1], point[2]); }

  get yaw() { return this.baseYaw + this.yawOff; }

  // Unit forward/right vectors on the floor plane (for camera-relative steering).
  basis() {
    const fx = this.lookAt.x - this.camera.position.x, fz = this.lookAt.z - this.camera.position.z;
    const l = Math.hypot(fx, fz) || 1;
    return { fx: fx / l, fz: fz / l, rx: -fz / l, rz: fx / l };
  }

  update(dt, ctx) {
    const { tops = [], playerIndex = 0, arenaRadius = 0.21, launch, victory } = ctx;
    const mode = this.override || this.mode;
    let dist = 0.55, pitch = 0.95, yaw = this.yaw;
    this._t.set(0, 0, 0);
    const active = tops.filter((t) => t && t.visible !== false);
    if (mode === 'launch' && launch) {
      this._t.set(launch.x * 0.6, 0.01, launch.z * 0.6);
      dist = 0.38; pitch = 0.7;
    } else if (mode === 'victory' && victory) {
      this.orbitT += dt * 0.5;
      this._t.copy(victory);
      dist = 0.22; pitch = 0.45; yaw = this.orbitT;
    } else if (mode === 'showcase') {
      this.orbitT += dt * 0.25;
      dist = 0.62; pitch = 0.8; yaw = this.orbitT;
    } else if (mode === 'overhead') {
      dist = arenaRadius * 2.9; pitch = 1.45;
      if (active.length) { for (const t of active) this._t.add(t.position); this._t.multiplyScalar(0.25 / active.length); }
    } else if (mode === 'player' && tops[playerIndex]) {
      this._t.copy(tops[playerIndex].position);
      dist = 0.26; pitch = 0.72;
    } else if (mode === 'tracking' && active.length) {
      for (const t of active) this._t.add(t.position);
      this._t.multiplyScalar(1 / active.length);
      let sep = 0;
      if (active.length > 1) sep = active[0].position.distanceTo(active[1].position);
      dist = 0.3 + sep * 1.2;
      pitch = 0.85;
    } else {
      // broadcast: arena-centred, drifts slightly toward the action
      if (active.length) { for (const t of active) this._t.add(t.position); this._t.multiplyScalar(0.35 / active.length); }
      dist = arenaRadius * 2.15; pitch = 0.95;
    }
    if (this.emphasis > 0) {
      this._t.lerp(this.emphasisPoint, 0.35 * this.emphasis);
      dist *= 1 - 0.18 * this.emphasis;
      this.emphasis = Math.max(0, this.emphasis - dt * 2.2);
    }
    dist *= 1 + this.zoomOff;
    pitch = Math.max(0.15, Math.min(1.52, pitch + this.pitchOff));
    const cy = Math.sin(pitch) * dist, ch = Math.cos(pitch) * dist;
    this._v.set(this._t.x + Math.cos(yaw) * ch, this._t.y + cy, this._t.z + Math.sin(yaw) * ch);
    const k = 1 - Math.exp(-dt * (mode === 'victory' ? 3 : 6));
    this.pos.lerp(this._v, k);
    this.lookAt.lerp(this._t, k);
    this.camera.position.copy(this.pos);
    if (this.shakeAmt > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.05);
    }
    this.camera.lookAt(this.lookAt);
  }

  snap() { this.pos.copy(this._v); this.lookAt.copy(this._t); }
}
