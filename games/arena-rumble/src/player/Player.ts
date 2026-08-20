import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import { PlayerState } from '../game/GameState';
import type { CharacterInstance } from '../assets/CharacterLoader';
import { damp, lerpAngle } from '../core/MathUtils';

interface TransformSample {
  time: number;
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  grounded: boolean;
}

/**
 * A remote player's visible body.
 *
 * Snapshots arrive at 20 Hz, so the body is rendered a fixed delay in the past
 * and interpolated between the two samples bracketing that time. That is what
 * stops everyone else looking like they are teleporting.
 */
export class Player {
  readonly root = new THREE.Group();
  readonly hand = new THREE.Group();

  state: PlayerState = PlayerState.CONNECTED;
  health: number = GAME_CONFIG.player.maxHealth;

  private buffer: TransformSample[] = [];
  private character: CharacterInstance | null = null;
  private nameplate: THREE.Sprite | null = null;
  private renderedYaw = 0;
  private weapon: THREE.Object3D | null = null;

  constructor(
    readonly id: string,
    public name: string,
  ) {
    this.root.name = `player:${id}`;
    this.root.add(this.hand);
  }

  attachCharacter(character: CharacterInstance): void {
    this.character = character;
    this.root.add(character.root);

    // The hand follows a bone if the rig has one, otherwise it sits at a
    // plausible chest-height offset so weapons are not floating at the feet.
    const bone = findHandBone(character.root);
    if (bone) {
      bone.add(this.hand);
      this.hand.position.set(0, 0, 0);
      this.hand.scale.setScalar(1);
    } else {
      this.hand.position.set(0.28, 1.3, 0.16);
    }
  }

  attachNameplate(sprite: THREE.Sprite): void {
    this.nameplate = sprite;
    sprite.position.set(0, 2.15, 0);
    this.root.add(sprite);
  }

  setWeapon(weapon: THREE.Object3D | null): void {
    if (this.weapon) this.weapon.removeFromParent();
    this.weapon = weapon;
    if (weapon) this.hand.add(weapon);
  }

  /** Push a transform sample from a world snapshot. */
  pushSample(
    time: number,
    position: THREE.Vector3,
    yaw: number,
    speed: number,
    grounded: boolean,
  ): void {
    this.buffer.push({ time, position: position.clone(), yaw, speed, grounded });
    // keep half a second of history, no more
    while (this.buffer.length > 2 && time - this.buffer[0].time > 500) {
      this.buffer.shift();
    }
  }

  /** Immediately snap, used on teleports and spawns. */
  snapTo(position: THREE.Vector3, yaw: number): void {
    this.buffer = [];
    this.root.position.copy(position);
    this.renderedYaw = yaw;
    this.root.rotation.y = yaw;
  }

  update(renderTime: number, dt: number): void {
    this.character?.mixer?.update(dt);

    const sample = this.sampleAt(renderTime);
    if (sample) {
      this.root.position.copy(sample.position);
      this.renderedYaw = lerpAngle(this.renderedYaw, sample.yaw, 1 - Math.exp(-14 * dt));
      this.root.rotation.y = this.renderedYaw;

      if (this.state === PlayerState.ELIMINATED) {
        this.character?.play('death');
      } else if (!sample.grounded) {
        this.character?.play('fall');
      } else if (sample.speed > 6.0) {
        this.character?.play('run', 1.35);
      } else if (sample.speed > 0.5) {
        this.character?.play('walk', 0.55 + sample.speed * 0.12);
      } else {
        this.character?.play('idle', 0.85);
      }
    }

    if (this.nameplate) {
      const opacity = this.state === PlayerState.ELIMINATED ? 0.3 : 1;
      const material = this.nameplate.material as THREE.SpriteMaterial;
      material.opacity = damp(material.opacity, opacity, 6, dt);
    }
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /** Capsule used for hit detection on the host. */
  hitCapsule(): { bottom: THREE.Vector3; top: THREE.Vector3; radius: number } {
    const cfg = GAME_CONFIG.player;
    return {
      bottom: new THREE.Vector3(
        this.root.position.x,
        this.root.position.y + cfg.radius,
        this.root.position.z,
      ),
      top: new THREE.Vector3(
        this.root.position.x,
        this.root.position.y + cfg.height - cfg.radius,
        this.root.position.z,
      ),
      radius: cfg.radius + 0.06,
    };
  }

  private sampleAt(renderTime: number): TransformSample | null {
    if (!this.buffer.length) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    for (let i = this.buffer.length - 1; i > 0; i--) {
      const next = this.buffer[i];
      const previous = this.buffer[i - 1];
      if (previous.time <= renderTime && renderTime <= next.time) {
        const span = next.time - previous.time;
        const t = span > 0 ? (renderTime - previous.time) / span : 1;
        return {
          time: renderTime,
          position: previous.position.clone().lerp(next.position, t),
          yaw: lerpAngle(previous.yaw, next.yaw, t),
          speed: previous.speed + (next.speed - previous.speed) * t,
          grounded: t < 0.5 ? previous.grounded : next.grounded,
        };
      }
    }
    // renderTime is outside the buffer: clamp to the closest end
    return renderTime < this.buffer[0].time
      ? this.buffer[0]
      : this.buffer[this.buffer.length - 1];
  }

  dispose(): void {
    this.character?.dispose();
    this.weapon?.removeFromParent();
    this.nameplate?.material.dispose();
    this.root.removeFromParent();
  }
}

function findHandBone(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found) return;
    const name = child.name.toLowerCase();
    if (name.includes('righthand') || name.includes('hand_r') || name.includes('r_hand')) {
      found = child;
    }
  });
  return found;
}

/** Small canvas sprite so you can tell who is who on the terraces. */
export function makeNameplate(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.font = 'bold 64px "Bebas Neue", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = name.toUpperCase().slice(0, 14);
  const width = ctx.measureText(text).width + 46;
  ctx.fillStyle = 'rgba(6,8,12,0.72)';
  ctx.fillRect((canvas.width - width) / 2, 26, width, 76);
  ctx.fillStyle = '#f2b544';
  ctx.fillRect((canvas.width - width) / 2, 26, width, 3);

  ctx.fillStyle = '#e8ecf4';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sprite.scale.set(1.7, 0.42, 1);
  sprite.userData.noCollision = true;
  return sprite;
}
