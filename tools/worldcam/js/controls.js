/* Camera controls.

   Written by hand rather than pulled from an example folder, because the
   flight paths need to be driven from application code (fly to a camera,
   fly to a search result) and to blend with user input without fighting it. */

const MIN_DIST = 1.09;
const MAX_DIST = 5.2;
const EPS = 0.000001;

function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class GlobeControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.theta = -Math.PI / 2;      // azimuth
    this.phi = Math.PI / 2.35;      // polar
    this.dist = 3.2;

    this.targetTheta = this.theta;
    this.targetPhi = this.phi;
    this.targetDist = this.dist;

    this.autoRotate = true;
    this.autoSpeed = 0.02;
    this.flight = null;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.onTap = null;
    this.onDoubleTap = null;
    this.onChange = null;

    this._pointers = new Map();
    this._lastReported = 0;
    this._pinchStart = 0;
    this._moved = 0;
    this._downAt = 0;
    this._lastTap = 0;
    this._bind();
    this.apply(0);
  }

  _bind() {
    const el = this.dom;
    const down = (e) => {
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._moved = 0;
      this._downAt = performance.now();
      this.autoRotate = false;
      this.flight = null;
      if (this._pointers.size === 2) this._pinchStart = this._pinchDist() * this.targetDist;
      el.classList.add('dragging');
    };

    const move = (e) => {
      const prev = this._pointers.get(e.pointerId);
      if (!prev) {
        // Parallax only, no drag.
        this.parallax.tx = (e.clientX / window.innerWidth - 0.5) * 0.04;
        this.parallax.ty = (e.clientY / window.innerHeight - 0.5) * 0.03;
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._moved += Math.abs(dx) + Math.abs(dy);

      if (this._pointers.size === 1) {
        // Slower rotation the closer you are, so zoomed-in panning is precise.
        const k = 0.0042 * Math.max(0.28, (this.targetDist - 1) / 2.2);
        this.targetTheta += dx * k;
        this.targetPhi -= dy * k;
        this.targetPhi = Math.max(0.08, Math.min(Math.PI - 0.08, this.targetPhi));
      } else if (this._pointers.size === 2 && this._pinchStart) {
        const d = this._pinchDist();
        if (d > 0) this.setDistance(this._pinchStart / d);
      }
    };

    const up = (e) => {
      const wasSingle = this._pointers.size === 1;
      this._pointers.delete(e.pointerId);
      if (!this._pointers.size) el.classList.remove('dragging');
      if (wasSingle && this._moved < 8 && performance.now() - this._downAt < 500) {
        const now = performance.now();
        const ndc = {
          x: (e.clientX / window.innerWidth) * 2 - 1,
          y: -(e.clientY / window.innerHeight) * 2 + 1
        };
        if (now - this._lastTap < 320 && this.onDoubleTap) this.onDoubleTap(ndc);
        else if (this.onTap) this.onTap(ndc);
        this._lastTap = now;
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.autoRotate = false;
      this.flight = null;
      const f = Math.exp(e.deltaY * 0.0011);
      this.setDistance(this.targetDist * f);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
      const step = 0.12;
      if (e.key === 'ArrowLeft') { this.targetTheta -= step; this.autoRotate = false; }
      if (e.key === 'ArrowRight') { this.targetTheta += step; this.autoRotate = false; }
      if (e.key === 'ArrowUp') { this.targetPhi = Math.max(0.08, this.targetPhi - step); this.autoRotate = false; }
      if (e.key === 'ArrowDown') { this.targetPhi = Math.min(Math.PI - 0.08, this.targetPhi + step); this.autoRotate = false; }
      if (e.key === '+' || e.key === '=') this.setDistance(this.targetDist * 0.85);
      if (e.key === '-') this.setDistance(this.targetDist * 1.18);
    });
  }

  _pinchDist() {
    const p = [...this._pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  setDistance(d) {
    this.targetDist = Math.max(MIN_DIST, Math.min(MAX_DIST, d));
  }

  /** Angles that put the given lat/lon at the centre of the view.
   *  Derived from the surface mapping in config.js: a point sits at
   *  (-sinφ·cosθt, cosφ, sinφ·sinθt) with θt = (lon+180), while the camera
   *  sits at (sinφ·cosθc, cosφ, sinφ·sinθc). Matching the two gives
   *  θc = π − θt. Getting this wrong aims the camera at the opposite face
   *  of the globe, where every marker is culled. */
  anglesFor(lat, lon) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = Math.PI - (lon + 180) * Math.PI / 180;
    return { phi: Math.max(0.08, Math.min(Math.PI - 0.08, phi)), theta };
  }

  /** Smooth flight to a location. `duration` in ms. The path pulls back
   *  slightly before descending, which reads as travel rather than a jump. */
  flyTo(lat, lon, distance, duration = 2200) {
    const target = this.anglesFor(lat, lon);
    this.autoRotate = false;
    this.flight = {
      t0: performance.now(),
      dur: duration,
      fromTheta: this.targetTheta,
      dTheta: shortestAngle(this.targetTheta, target.theta),
      fromPhi: this.targetPhi,
      dPhi: target.phi - this.targetPhi,
      fromDist: this.targetDist,
      toDist: Math.max(MIN_DIST, Math.min(MAX_DIST, distance)),
      lift: Math.max(this.targetDist, distance) * 1.18
    };
    return new Promise((resolve) => { this.flight.resolve = resolve; });
  }

  apply(dt) {
    if (this.flight) {
      const f = this.flight;
      const raw = Math.min(1, (performance.now() - f.t0) / f.dur);
      const e = easeInOut(raw);
      this.targetTheta = f.fromTheta + f.dTheta * e;
      this.targetPhi = f.fromPhi + f.dPhi * e;
      // Arc: out, then in.
      const arc = Math.sin(raw * Math.PI);
      this.targetDist = (f.fromDist + (f.toDist - f.fromDist) * e) * (1 + arc * 0.14) +
                        arc * (f.lift - Math.max(f.fromDist, f.toDist)) * 0.10;
      if (raw >= 1) {
        this.targetDist = f.toDist;
        const done = f.resolve;
        this.flight = null;
        if (done) done();
      }
    } else if (this.autoRotate) {
      this.targetTheta += this.autoSpeed * dt;
    }

    const k = this.flight ? 1 : 1 - Math.pow(0.0018, dt);
    this.theta += shortestAngle(this.theta, this.targetTheta) * k;
    this.phi += (this.targetPhi - this.phi) * k;
    this.dist += (this.targetDist - this.dist) * k;

    this.parallax.x += (this.parallax.tx - this.parallax.x) * 0.06;
    this.parallax.y += (this.parallax.ty - this.parallax.y) * 0.06;

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.dist * sp * Math.cos(this.theta),
      this.dist * Math.cos(this.phi),
      this.dist * sp * Math.sin(this.theta)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.parallax.x, this.parallax.y, 0);

    if (Math.abs(this.dist - this._lastReported) > 0.004) {
      this._lastReported = this.dist;
      if (this.onChange) this.onChange(this.dist);
    }
  }

  get distance() { return this.dist; }
}
