import * as THREE from 'three';
import type { ArenaDefinition } from '../config/arenas';

type Mood = ArenaDefinition['mood'];

/**
 * Sky, fog and the key/fill lighting rig. Every arena carries its own mood so
 * the five maps do not all read as the same grey box; swapping arenas only
 * re-tints these objects instead of rebuilding them.
 */
export class Environment {
  private hemisphere: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x202028, 0.6);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x0a0d13) },
          bottom: { value: new THREE.Color(0x1a2130) },
        },
        vertexShader: `
          varying float vH;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vH = normalize(world.xyz).y;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 bottom;
          varying float vH;
          void main() {
            float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
            gl_FragColor = vec4(mix(bottom, top, pow(t, 0.65)), 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.userData.noCollision = true;
    scene.add(this.sky);
  }

  applyMood(mood: Mood, worldRadius: number): void {
    const material = this.sky.material as THREE.ShaderMaterial;
    material.uniforms.top.value.setHex(mood.sky);
    material.uniforms.bottom.value.setHex(mood.horizon);

    this.scene.fog = new THREE.FogExp2(mood.fog, mood.fogDensity);

    this.hemisphere.color.setHex(mood.horizon);
    this.hemisphere.groundColor.setHex(mood.ground);
    this.hemisphere.intensity = mood.ambientIntensity;

    this.sun.color.setHex(mood.sunColor);
    this.sun.intensity = mood.sunIntensity;

    const distance = Math.max(40, worldRadius * 1.4);
    const [dx, dy, dz] = mood.sunDirection;
    this.sun.position.set(dx * distance, dy * distance, dz * distance);
    this.sun.target.position.set(0, 0, 0);

    const extent = Math.max(30, worldRadius * 1.15);
    const shadow = this.sun.shadow.camera;
    shadow.left = -extent;
    shadow.right = extent;
    shadow.top = extent;
    shadow.bottom = -extent;
    shadow.near = 1;
    shadow.far = distance * 2.4;
    shadow.updateProjectionMatrix();
  }

  followCamera(position: THREE.Vector3): void {
    this.sky.position.copy(position);
  }
}
