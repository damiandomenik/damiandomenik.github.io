/* Marker layer.

   Every visible point — single camera or cluster — is one instance of a
   single InstancedMesh, so ten thousand data points still cost one draw
   call. Clustering is a longitude/latitude grid whose cell size follows
   the camera distance, which is what produces the world → continent →
   country → city → camera progression. */

import { GLOBE_RADIUS, latLonToVector3 } from './config.js';

const MAX_INSTANCES = 4000;
const LIFT = 1.012;

const MARKER_VERT = `
attribute vec3 aColor;
attribute float aScale;
attribute float aPhase;
attribute float aKind;
uniform float time;
varying vec3 vColor;
varying vec2 vUv;
varying float vKind;
void main(){
  vColor = aColor;
  vUv = uv;
  vKind = aKind;
  float pulse = 1.0 + sin(time * 1.6 + aPhase) * 0.05;
  vec4 world = instanceMatrix * vec4(position * aScale * pulse, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * world;
}`;

const MARKER_FRAG = `
varying vec3 vColor;
varying vec2 vUv;
varying float vKind;

// Map pin: a ring-shaped head with a stem running down to the tip, which
// sits exactly on the surface point. The tip is what marks the location.
float pinShape(vec2 uv, out float rim){
  vec2 head = vec2(0.5, 0.70);
  float dh = length((uv - head) * vec2(1.0, 1.0));
  float headFill = smoothstep(0.24, 0.20, dh);
  rim = smoothstep(0.25, 0.21, dh) * smoothstep(0.13, 0.17, dh);

  // Stem: narrows from the head down to a point at the bottom.
  float t = clamp((0.70 - uv.y) / 0.66, 0.0, 1.0);
  float halfWidth = mix(0.075, 0.004, pow(t, 0.75));
  float stem = step(uv.y, 0.70) * smoothstep(halfWidth, halfWidth * 0.45, abs(uv.x - 0.5));

  return max(headFill, stem);
}

void main(){
  if (vKind > 0.5) {
    // Cluster: a soft disc, centred on the quad.
    vec2 c = vec2(0.5, 0.5);
    float d = length(vUv - c) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.52, 0.10, d);
    float ring = smoothstep(0.60, 0.50, d) * smoothstep(0.36, 0.50, d);
    float halo = smoothstep(1.0, 0.30, d) * 0.28;
    vec3 col = mix(vColor, vec3(1.0), core * 0.45);
    gl_FragColor = vec4(col, min(1.0, core * 0.9 + ring * 0.8 + halo));
    return;
  }

  float rim;
  float body = pinShape(vUv, rim);
  float glow = smoothstep(0.34, 0.0, length((vUv - vec2(0.5, 0.70)))) * 0.35;
  if (body + rim + glow < 0.02) discard;
  vec3 col = mix(vColor, vec3(1.0), rim * 0.9);
  gl_FragColor = vec4(col, min(1.0, body * 0.92 + rim + glow));
}`;

export class MarkerLayer {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.points = [];
    this.visible = [];          // what is currently drawn, in instance order
    this.selectedId = null;

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);   // pivot at the tip, so a pin stands on the ground
    this.colors = new Float32Array(MAX_INSTANCES * 3);
    this.scales = new Float32Array(MAX_INSTANCES);
    this.phases = new Float32Array(MAX_INSTANCES);
    this.kinds = new Float32Array(MAX_INSTANCES);   // 0 = pin, 1 = cluster
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(this.scales, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(this.phases, 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(this.kinds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: MARKER_VERT,
      fragmentShader: MARKER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    this.geo = geo;
    this.mat = mat;
    this._m = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._scaleVec = new THREE.Vector3(1, 1, 1);
    this._rotM = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._camDir = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
  }

  setData(points) {
    this.points = points || [];
    this.selectedId = null;
  }

  /** Grid cell size in degrees, from the camera distance.
   *  Far away: coarse cells and few, large clusters. Close in:
   *  fine cells until individual cameras separate out. */
  _cellSize(distance) {
    const t = THREE.MathUtils.clamp((distance - 1.15) / 2.4, 0, 1);   // 0 near, 1 far
    return THREE.MathUtils.lerp(0.35, 26, Math.pow(t, 0.75));
  }

  /** Rebuilds the instance buffers. Called when the data, the filter or
   *  the camera distance changes meaningfully — not every frame. */
  build(filterFn) {
    const dist = this.camera.position.length();
    const cell = this._cellSize(dist);
    const camDir = this._camDir.copy(this.camera.position).normalize();

    const buckets = new Map();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (filterFn && !filterFn(p)) continue;

      // Cull the far side of the globe: nothing behind the horizon.
      const v = latLonToVector3(p.lat, p.lon, 1, this._pos);
      if (v.dot(camDir) < 0.06) continue;

      const key = Math.floor((p.lat + 90) / cell) + ':' + Math.floor((p.lon + 180) / cell);
      let b = buckets.get(key);
      if (!b) { b = { items: [], lat: 0, lon: 0 }; buckets.set(key, b); }
      b.items.push(p);
    }

    const list = [];
    buckets.forEach((b) => {
      if (b.items.length === 1) {
        list.push({ cluster: false, point: b.items[0], lat: b.items[0].lat, lon: b.items[0].lon, n: 1 });
      } else {
        let la = 0, lo = 0;
        for (const it of b.items) { la += it.lat; lo += it.lon; }
        list.push({
          cluster: true, items: b.items, n: b.items.length,
          lat: la / b.items.length, lon: lo / b.items.length
        });
      }
    });

    // Largest clusters first so the cap keeps the meaningful ones.
    list.sort((a, b) => b.n - a.n);
    if (list.length > MAX_INSTANCES) list.length = MAX_INSTANCES;

    this.visible = list;
    const near = THREE.MathUtils.clamp((3.6 - dist) / 2.2, 0, 1);
    const base = THREE.MathUtils.lerp(0.052, 0.020, near);

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      latLonToVector3(item.lat, item.lon, GLOBE_RADIUS * LIFT, this._pos);

      if (item.cluster) {
        // Clusters are plain discs, so a camera-facing billboard is right.
        this._m.lookAt(this._pos, this.camera.position, this._up);
        this._rotM.extractRotation(this._m);
        this._quat.setFromRotationMatrix(this._rotM);
      } else {
        // Pin: +Y along the surface normal so it stands up, spun about that
        // normal to face the viewer. The tip stays on the exact point.
        this._normal.copy(this._pos).normalize();
        this._toCam.copy(this.camera.position).sub(this._pos).normalize();
        this._right.crossVectors(this._normal, this._toCam);
        if (this._right.lengthSq() < 1e-8) this._right.set(1, 0, 0);
        this._right.normalize();
        this._fwd.crossVectors(this._right, this._normal).normalize();
        this._rotM.makeBasis(this._right, this._normal, this._fwd);
        this._quat.setFromRotationMatrix(this._rotM);
      }
      this._m.compose(this._pos, this._quat, this._scaleVec);
      this.mesh.setMatrixAt(i, this._m);

      const selected = !item.cluster && item.point.id === this.selectedId;
      const size = item.cluster
        ? base * (1.2 + Math.min(1.4, Math.log10(item.n + 1)))
        : base * (selected ? 1.9 : 1.15);
      this.scales[i] = size;
      this.phases[i] = (i % 17) * 0.7;
      this.kinds[i] = item.cluster ? 1 : 0;

      let c;
      if (selected) c = [1.0, 1.0, 1.0];
      else if (item.cluster) c = [0.42, 0.60, 0.92];
      else if (item.point.demo) c = [0.91, 0.64, 0.24];
      else c = [0.40, 0.86, 0.62];
      this.colors[i * 3] = c[0];
      this.colors[i * 3 + 1] = c[1];
      this.colors[i * 3 + 2] = c[2];
    }

    this.mesh.count = list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aScale.needsUpdate = true;
    this.geo.attributes.aPhase.needsUpdate = true;
    this.geo.attributes.aKind.needsUpdate = true;
    return list.length;
  }

  update(t) { this.mat.uniforms.time.value = t; }

  select(id) { this.selectedId = id; }

  /** Returns the visible entry under normalised device coordinates,
   *  or null. Clusters return { cluster:true } so the caller can zoom in. */
  pick(ndc) {
    if (!this.mesh.count) return null;
    this._raycaster.setFromCamera(ndc, this.camera);
    // Generous threshold: markers are small, fingers are not.
    const hits = this._raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const idx = hits[0].instanceId;
    if (idx == null || idx >= this.visible.length) return null;
    return this.visible[idx];
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
