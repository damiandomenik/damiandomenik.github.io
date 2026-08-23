import * as THREE from 'three';

/**
 * Umgebung: Farbverlaufs-Himmel, Sternenfeld und ein Gitter tief unter dem
 * Level. Das gibt dem Dungeon Tiefe und einen Horizont — vorher endete alles
 * in flachem Schwarz. Alles folgt der Kamera, ist unbeleuchtet und kostet
 * zusammen drei Draw Calls.
 */
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 glow;
uniform float time;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.65))
                     : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.5));
  // schwacher Lichtschein am Horizont, leicht atmend
  float band = exp(-abs(h) * 9.0) * (0.55 + 0.12 * sin(time * 0.4));
  col += glow * band;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Environment {
  constructor(scene, renderer, { horizon = 0x121a2e, top = 0x05070f, bottom = 0x03040a, glow = 0x1d3f63 } = {}) {
    this.scene = scene;
    this.renderer = renderer;

    // ---------- Renderer: filmisches Tone Mapping ----------
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ---------- Himmelskuppel ----------
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(top) },
        horizon: { value: new THREE.Color(horizon) },
        bottom: { value: new THREE.Color(bottom) },
        glow: { value: new THREE.Color(glow) },
        time: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ---------- Sternenfeld ----------
    const count = 700;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // gleichmäßig auf einer Kugelschale
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const d = 180 + Math.random() * 90;
      pos[i * 3] = Math.cos(a) * r * d;
      pos[i * 3 + 1] = u * d * 0.75 + 40;
      pos[i * 3 + 2] = Math.sin(a) * r * d;
      const t = Math.random();
      c.setHSL(0.5 + t * 0.16, 0.45, 0.55 + Math.random() * 0.35);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 1.5, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // ---------- Gitter in der Tiefe ----------
    this.grid = new THREE.GridHelper(700, 70, 0x2a4f78, 0x16304d);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.28;
    this.grid.material.depthWrite = false;
    this.grid.material.fog = true;
    this.grid.material.toneMapped = false;
    this.grid.frustumCulled = false;
    scene.add(this.grid);

    this.t = 0;
    this.gridDepth = 46;
  }

  /** Himmel, Sterne und Gitter der Kamera nachführen. */
  update(dt, camera, groundY = 0) {
    this.t += dt;
    this.skyMat.uniforms.time.value = this.t;
    this.sky.position.copy(camera.position);
    this.stars.position.set(camera.position.x, 0, camera.position.z);
    this.stars.rotation.y = this.t * 0.006;
    this.grid.position.set(
      Math.round(camera.position.x / 10) * 10,
      groundY - this.gridDepth,
      Math.round(camera.position.z / 10) * 10,
    );
  }

  dispose() {
    this.scene.remove(this.sky, this.stars, this.grid);
    this.sky.geometry.dispose(); this.skyMat.dispose();
    this.stars.geometry.dispose(); this.starMat.dispose();
    this.grid.geometry.dispose(); this.grid.material.dispose();
  }
}
