/* The scene itself: earth with a real day/night terminator,
   atmosphere, and a star field. No data logic lives here. */

import { GLOBE_RADIUS, TEXTURES, latLonToVector3, subsolarPoint, sublunarPoint } from './config.js';

const EARTH_VERT = `
varying vec2 vUv;
varying vec3 vNormalW;
void main(){
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EARTH_FRAG = `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D bumpMap;
uniform vec3 sunDir;
uniform float hasTextures;
uniform vec3 fallbackLand;
varying vec2 vUv;
varying vec3 vNormalW;

void main(){
  vec3 n = normalize(vNormalW);
  float lambert = dot(n, normalize(sunDir));

  // Soft terminator: roughly the width of real civil twilight.
  float daylight = smoothstep(-0.12, 0.18, lambert);

  vec3 day, night;
  if (hasTextures > 0.5) {
    day = texture2D(dayMap, vUv).rgb;
    night = texture2D(nightMap, vUv).rgb;
    float relief = texture2D(bumpMap, vUv).r;
    day *= 0.86 + relief * 0.28;
  } else {
    // Fallback if the CDN imagery is unavailable: a plain shaded sphere
    // rather than a broken black ball.
    float band = smoothstep(0.35, 0.36, fract(vUv.y * 18.0));
    day = mix(fallbackLand * 0.55, fallbackLand, band);
    night = day * 0.06;
  }

  vec3 col = mix(night * 1.15, day, daylight);

  // Slight warm scatter right at the terminator.
  float rim = smoothstep(0.0, 0.35, 1.0 - abs(lambert)) * daylight;
  col += vec3(0.16, 0.09, 0.03) * rim * 0.7;

  gl_FragColor = vec4(col, 1.0);
}`;

const ATMO_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const ATMO_FRAG = `
uniform vec3 glow;
uniform float strength;
uniform vec3 sunDir;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  float fres = pow(1.0 - max(dot(vNormalW, vViewDir), 0.0), 3.0);
  float lit = smoothstep(-0.55, 0.5, dot(normalize(vNormalW), normalize(sunDir)));
  gl_FragColor = vec4(glow, fres * strength * (0.25 + lit * 0.85));
}`;

export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposables = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x04060a, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(0, 0, 3.2);

    this.sunDir = new THREE.Vector3(1, 0, 0);
    this.moonDir = new THREE.Vector3(0, 0, 1);
    this._buildEarth();
    this._buildAtmosphere();
    this._buildStars();
    this._buildSun();
    this._buildMoon();
    this.updateSun();

    this.resize();
  }

  /* ---------------- construction ---------------- */

  _buildEarth() {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64);
    const blank = new THREE.Texture();
    this.earthUniforms = {
      dayMap:   { value: blank },
      nightMap: { value: blank },
      bumpMap:  { value: blank },
      sunDir:   { value: this.sunDir },
      hasTextures: { value: 0 },
      fallbackLand: { value: new THREE.Color(0x2b4668) }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG
    });
    this.earth = new THREE.Mesh(geo, mat);
    this.scene.add(this.earth);
    this.disposables.push(geo, mat, blank);
  }

  _buildAtmosphere() {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.022, 64, 48);
    this.atmoUniforms = {
      glow: { value: new THREE.Color(0x5b93e0) },
      strength: { value: 1.0 },
      sunDir: { value: this.sunDir }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.atmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.atmosphere);
    this.disposables.push(geo, mat);
  }

  _buildStars() {
    const count = 2600;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Even distribution on a large sphere.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 42 + Math.random() * 14;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(a);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(a);
      size[i] = Math.random() < 0.06 ? 0.28 : 0.10 + Math.random() * 0.09;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { pixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aSize;
        uniform float pixelRatio;
        varying float vA;
        void main(){
          vA = aSize;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 26.0 * pixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.06, d) * (0.35 + vA);
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);
        }`
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
    this.disposables.push(geo, mat);
  }

  /* The Sun: a bright disc with a corona, parked far out along the real
     sub-solar direction. The Earth occludes it when it is behind, which is
     what makes sunrise over the limb read correctly. */
  _buildSun() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          // Billboard: strip the rotation out of the model-view matrix.
          vec3 c = vec3(modelViewMatrix[3]);
          float s = length(vec3(modelMatrix[0]));
          gl_Position = projectionMatrix * vec4(c + vec3(position.xy * s, 0.0), 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float disc = smoothstep(0.16, 0.10, d);
          float corona = pow(max(0.0, 1.0 - d), 3.2) * 0.55;
          float spike = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 14.0), 6.0) * 0.16
                      + pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 14.0), 6.0) * 0.16;
          vec3 col = mix(vec3(1.0, 0.86, 0.62), vec3(1.0), disc);
          gl_FragColor = vec4(col, min(1.0, disc + corona + spike * (1.0 - d)));
        }`
    });
    this.sun = new THREE.Mesh(geo, mat);
    this.sun.scale.setScalar(9);
    this.sun.renderOrder = 1;
    this.scene.add(this.sun);
    this.disposables.push(geo, mat);
  }

  /* The Moon: a small sphere lit from the Sun's real direction, so the phase
     on screen is the phase in the sky tonight. */
  _buildMoon() {
    const geo = new THREE.SphereGeometry(1, 32, 24);
    this.moonUniforms = { sunDir: { value: this.sunDir } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.moonUniforms,
      vertexShader: `
        varying vec3 vN;
        varying vec2 vUv;
        void main(){
          vN = normalize(mat3(modelMatrix) * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vN;
        varying vec2 vUv;
        // Cheap crater mottling so it is not a flat grey ball.
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          float lit = smoothstep(-0.06, 0.12, dot(normalize(vN), normalize(sunDir)));
          float m = h(floor(vUv * 26.0)) * 0.16 + h(floor(vUv * 11.0)) * 0.10;
          vec3 col = vec3(0.80 - m) * (0.06 + lit * 0.98);
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.moon = new THREE.Mesh(geo, mat);
    this.scene.add(this.moon);
    this.disposables.push(geo, mat);
  }

  /* ---------------- textures ---------------- */

  /** Loads the earth imagery. Resolves either way — a failure downgrades
   *  the material instead of breaking the tool. */
  loadTextures(onProgress) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const keys = ['day', 'night', 'bump'];
    let done = 0;

    const one = (key) => new Promise((resolve) => {
      loader.load(TEXTURES[key],
        (tex) => {
          tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          this.earthUniforms[key === 'day' ? 'dayMap' : key === 'night' ? 'nightMap' : 'bumpMap'].value = tex;
          this.disposables.push(tex);
          resolve(true);
        },
        undefined,
        () => resolve(false)
      );
    }).then((okFlag) => {
      done++;
      if (onProgress) onProgress(done / keys.length);
      return okFlag;
    });

    return Promise.all(keys.map(one)).then((results) => {
      const allOk = results.every(Boolean);
      this.earthUniforms.hasTextures.value = allOk ? 1 : 0;
      return allOk;
    });
  }

  /* ---------------- per-frame ---------------- */

  /** Places the light using the real sub-solar point. */
  updateSun(date = new Date()) {
    const p = subsolarPoint(date);
    latLonToVector3(p.lat, p.lon, 1, this.sunDir);
    this.sunPoint = p;

    // Both bodies sit along their true directions. The distances are not to
    // scale — at true scale the Moon would be a pixel and the Sun invisible.
    this.sun.position.copy(this.sunDir).multiplyScalar(34);

    const m = sublunarPoint(date);
    latLonToVector3(m.lat, m.lon, 1, this.moonDir);
    this.moon.position.copy(this.moonDir).multiplyScalar(11);
    this.moon.scale.setScalar(0.42);
    this.moonPoint = m;
    return p;
  }

  /** Atmosphere thickens slightly as the camera approaches. */
  update(dt) {
    const dist = this.camera.position.length();
    this.atmoUniforms.strength.value = THREE.MathUtils.clamp(0.55 + (3.4 - dist) * 0.45, 0.45, 1.5);
    this.stars.rotation.y += dt * 0.0035;
    this.stars.rotation.x += dt * 0.0009;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposables.forEach((d) => d && d.dispose && d.dispose());
    this.renderer.dispose();
  }
}
