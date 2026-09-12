/* Wires the scene, the data and the interface together, and owns the
   single render loop. */

import { Globe } from './globe.js';
import { MarkerLayer } from './markers.js';
import { GlobeControls } from './controls.js';
import { UI } from './ui.js';
import { loadWebcams, fetchWindy, getStoredKey, storeKey, demoData } from './webcams.js';

const canvas = document.getElementById('stage');

if (!window.THREE || !isWebGLAvailable()) {
  document.getElementById('loader').innerHTML =
    '<div class="loader-inner"><p id="loader-text">This browser could not start WebGL, so the globe cannot be drawn. ' +
    'Everything here needs hardware 3D — try a different browser or enable hardware acceleration.</p></div>';
} else {
  start();
}

function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function start() {
  const globe = new Globe(canvas);
  const markers = new MarkerLayer(globe.scene, globe.camera);
  const controls = new GlobeControls(globe.camera, canvas);
  const ui = new UI();

  let points = [];
  let source = 'demo';
  let needsRebuild = true;
  let lastBuildDist = 0;
  let selected = null;

  /* ---------------- data ---------------- */

  const filterFn = (p) => ui.category === 'all' || p.category === ui.category;

  function applyData(result) {
    points = result.points;
    source = result.source;
    markers.setData(points);
    ui.setPoints(points, source);
    needsRebuild = true;
  }

  function reload(showToastOnError) {
    ui.setLoading('Loading webcams', 0.6);
    return loadWebcams((p) => ui.setLoading(null, 0.6 + p * 0.35)).then((res) => {
      applyData(res);
      if (res.error && showToastOnError) {
        ui.toast('Webcam data is currently unavailable. ' + res.error, 'Retry', () => reload(true));
      }
      return res;
    });
  }

  /* ---------------- interaction ---------------- */

  function focusPoint(p, duration = 2000) {
    selected = p;
    markers.select(p.id);
    needsRebuild = true;
    ui.hidePanel();
    return controls.flyTo(p.lat, p.lon, 1.32, duration).then(() => {
      ui.showPoint(p);
      selected = p;
    });
  }

  controls.onTap = (ndc) => {
    const hit = markers.pick(ndc);
    if (!hit) return;
    if (hit.cluster) {
      // Dive one level into the cluster.
      controls.flyTo(hit.lat, hit.lon, Math.max(1.16, controls.distance * 0.55), 1100);
      needsRebuild = true;
    } else {
      focusPoint(hit.point, 1400);
    }
  };

  controls.onDoubleTap = (ndc) => {
    const hit = markers.pick(ndc);
    if (hit) {
      controls.flyTo(hit.lat, hit.lon, Math.max(1.16, controls.distance * 0.5), 1200);
    } else {
      controls.setDistance(controls.distance * 0.6);
    }
    needsRebuild = true;
  };

  controls.onChange = () => { needsRebuild = true; };

  ui.onFilter = () => { needsRebuild = true; };
  ui.onSearchPick = (p) => focusPoint(p, 2000);
  ui.onSelect = (p) => {
    if (!p) { selected = null; markers.select(null); needsRebuild = true; }
  };

  function surprise() {
    const pool = points.filter(filterFn);
    if (!pool.length) { ui.toast('No markers match the current filter.'); return; }
    const p = pool[Math.floor(Math.random() * pool.length)];
    ui.toast('Finding somewhere…');
    controls.autoRotate = false;
    focusPoint(p, 2600).then(() => {
      const where = [p.city || p.title, p.country].filter(Boolean).join(', ');
      ui.toast(p.demo ? 'You are now over ' + where + ' — demo marker, no live feed.'
                      : 'You are now in ' + where + '.');
      setTimeout(() => ui.hideToast(), 4200);
    });
  }

  document.getElementById('surprise').onclick = surprise;
  document.getElementById('surprise-start').onclick = () => { ui.hideStart(); surprise(); };
  document.getElementById('explore').onclick = () => { ui.hideStart(); controls.autoRotate = true; };

  /* ---------------- API key dialog ---------------- */

  document.getElementById('key-save').onclick = () => {
    const key = ui.el.keyInput.value.trim();
    if (!key) return;
    ui.el.settings.classList.add('hidden');
    ui.toast('Checking the key with Windy…');
    fetchWindy(key, 100).then((list) => {
      storeKey(key);
      applyData({ points: list, source: 'windy' });
      ui.toast(list.length.toLocaleString() + ' cameras loaded.');
      setTimeout(() => ui.hideToast(), 3500);
    }).catch((e) => {
      ui.toast(e.message, 'Try again', () => ui.el.settings.classList.remove('hidden'));
    });
  };

  document.getElementById('key-clear').onclick = () => {
    storeKey('');
    ui.el.settings.classList.add('hidden');
    applyData({ points: demoData(), source: 'demo' });
    ui.toast('Key removed. Back to the demo set.');
    setTimeout(() => ui.hideToast(), 3000);
  };

  /* ---------------- boot ---------------- */

  ui.setLoading('Connecting to Earth', 0.12);
  globe.loadTextures((p) => ui.setLoading(null, 0.12 + p * 0.45))
    .then((texturesOk) => {
      if (!texturesOk) {
        ui.toast('The Earth imagery could not be loaded from the CDN, so the globe is drawn plain. Everything else still works.');
      }
      return reload(false);
    })
    .then((res) => {
      ui.setLoading('Ready', 1);
      setTimeout(() => {
        ui.hideLoader();
        ui.showStart(res.source === 'demo'
          ? (getStoredKey()
              ? 'Live data could not be loaded, so the demo set is shown.'
              : 'Running on a small demo set. Add your own Windy API key under Source for real cameras.')
          : res.points.length.toLocaleString() + ' cameras loaded from Windy.');
      }, 320);
    })
    .catch((e) => {
      ui.setLoading('Something went wrong: ' + (e.message || e), 1);
      ui.toast('Webcam data is currently unavailable.', 'Retry', () => location.reload());
    });

  /* ---------------- loop ---------------- */

  let last = performance.now();
  let sunTick = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    controls.apply(dt);
    globe.update(dt);
    markers.update(now / 1000);

    // Rebuild clustering when the view changed enough to matter.
    if (needsRebuild || Math.abs(controls.distance - lastBuildDist) > 0.02 || controls.flight) {
      lastBuildDist = controls.distance;
      needsRebuild = false;
      const shown = markers.build(filterFn);
      ui.setVisibleCount(shown, points.filter(filterFn).length);
    }

    // The terminator only needs updating occasionally.
    sunTick += dt;
    if (sunTick > 20) {
      sunTick = 0;
      ui.setSun(globe.updateSun());
    }

    globe.render();
    requestAnimationFrame(frame);
  }

  ui.setSun(globe.updateSun());
  requestAnimationFrame(frame);

  /* ---------------- lifecycle ---------------- */

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => globe.resize(), 120);
  });

  window.addEventListener('pagehide', () => {
    markers.dispose();
    globe.dispose();
  });
}
