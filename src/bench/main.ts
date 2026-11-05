import '../controls/tokens.css';
import '../controls/controls.css';
import './style.css';
import * as THREE from 'three/webgpu';
import { SeaSim, SeaColumn, SeaWeather, seaStats, swellAmpForHs, travelFromCompass, G, type SeaParams } from '../sea';
import { slider, dots } from '../controls';
import { BenchUI, $ } from './ui';
import { loadState, DEFAULTS, WEATHER, weatherName, shareUrl, seaWord, compass, beaufort, gust, sunFromTod, type BenchState } from './state';
import { BenchCamera } from './camera';
import { startAnalytics } from './analytics';
import { typeTitle } from './title';
import { createLog } from './log';

const D2R = Math.PI / 180, KN = 0.5144;
const q = new URLSearchParams(location.search);

async function main() {
  // ---------- renderer: WebGPU only; the FFT needs compute
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (!(navigator as Navigator & { gpu?: unknown }).gpu) { $('nogpu').classList.add('show'); return; }
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) { $('nogpu').classList.add('show'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ---------- the sea and its column
  const N = +(q.get('n') || 128);
  const sea = new SeaSim(renderer, { N });
  const column = new SeaColumn(sea, { radius: 7, segments: +(q.get('seg') || 260) });
  const scene = new THREE.Scene();
  scene.add(column);
  const look = column.look;
  // the weather lives inside the column, over the water: cloud, rain, fog, squalls and lightning
  // the deck floats well above the water, so the sea stays in view under it
  const weather = new SeaWeather(sea, column, { cloudBase: 8, cloudTop: 11.2 });
  const cam = new BenchCamera(canvas, new THREE.Vector3(0, column.waterY * 0.55, 0), 9.4, () => (window.innerWidth > 720 ? 320 + 16 + 18 : 0));
  $('vGrid').textContent = `${N}² · ${sea.cascades.length} cascades`;

  // ---------- state → sea
  const { state: S, fromUrl } = loadState();
  const ui = new BenchUI(S, { onSea: () => rebuild(), onLook: () => applyLook(), onReplace: () => { applyLook(); applyWeather(); ui.repaintAll(); rebuild(); } });
  if (fromUrl) ui.preset = '';

  function seaParams(): SeaParams {
    const Uw = Math.max(1.5, S.windKn * KN), travel = travelFromCompass(S.windFrom);
    const base: SeaParams = { windU: Uw, fetch: S.fetchKm * 1000, travel, spreadP: S.spread, gamma: S.gamma, swellAmp: 0, swellT: S.swellT, swellDir: travel + S.swellOff * D2R, ampScale: S.height, ripple: S.ripple };
    if (S.swellH > 0.01) base.swellAmp = swellAmpForHs(S.swellH, seaStats({ ...base, swellAmp: 1 }, N, sea.cascades), S.height);
    return base;
  }
  function rebuild() {
    sea.setParams(seaParams());
    look.murk.value = THREE.MathUtils.clamp((sea.params.windU - 3) / 10, 0, 1);
    look.hs.value = Math.hypot(sea.stats.hs, sea.stats.hsSwell);
    paintReadout();
  }
  function applyLook() {
    if (!S.sunManual) { const s = sunFromTod(S.tod); S.sunEl = s.el; S.sunAz = s.az; }
    const el = S.sunEl * D2R, az = S.sunAz * D2R;
    look.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const warm = THREE.MathUtils.smoothstep(S.sunEl, 6, 32);
    look.sunCol.value.setRGB(1.0, 0.80 + 0.14 * warm, 0.58 + 0.24 * warm);
    look.glint.value = S.glint; look.clarity.value = S.clarity; sea.U.lambda.value = S.chop;
  }
  function applyWeather() {
    weather.set({ cloud: S.cloud, rain: S.rain, fog: S.fog, lightning: S.lightning });
    $('wxTag').textContent = weatherName(S) || 'custom';
  }
  function paintReadout() {
    const st = sea.stats, hs = Math.hypot(st.hs, st.hsSwell), steep = hs > 0.01 ? Math.round(st.lambdaP / hs) : 0;
    ui.tick($('vState'), seaWord(hs)); ui.tick($('vHs'), hs.toFixed(2) + ' m'); ui.tick($('vTp'), st.tp.toFixed(1) + ' s');
    ui.tick($('vLp'), st.lambdaP.toFixed(0) + ' m'); ui.tick($('vSteep'), steep ? '1/' + steep : '—');
    ui.tick($('vWind'), `${S.windKn} kn from ${compass(S.windFrom)}`); ui.tick($('vSeed'), String(sea.U.seed.value));
    $('wBft').textContent = beaufort(S.windKn); $('wHs').textContent = hs.toFixed(2) + ' m'; $('wTp').textContent = st.tp.toFixed(1) + ' s'; $('wLp').textContent = st.lambdaP.toFixed(0) + ' m';
    $('seaTag').textContent = ui.preset || 'custom';
  }

  // ---------- theme
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#ECE9E1';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    look.sceneCol.value.set(css); look.zenith.value.set(dark ? '#2A3540' : '#7E97AD'); look.dark.value = dark ? 1 : 0;
    renderer.setClearColor(new THREE.Color(css), 1);
  }
  ui.wireTheme(mq, applyTheme);

  // ---------- controls
  const seaIn = ui.seaIn, lookIn = () => applyLook();
  ui.windRow(seaIn);
  ui.slider('slFetch',    { label: 'Fetch',        min: 2,    max: 60,  step: 1,    key: 'fetchKm',  fmt: (v) => v + ' km', onInput: seaIn });
  ui.slider('slSpread',   { label: 'Spread',       min: 1,    max: 16,  step: 0.5,  key: 'spread',   fmt: (v) => (v <= 1.5 ? 'wide' : v <= 3 ? 'open' : v <= 8 ? 'narrow' : 'long crests'), onInput: seaIn, snap: [1, 2, 5, 12] });
  ui.slider('slGamma',    { label: 'Peakedness',   min: 1,    max: 7,   step: 0.1,  key: 'gamma',    fmt: (v) => 'γ ' + v.toFixed(1), onInput: seaIn });
  ui.slider('slHeight',   { label: 'Height',       min: 0.1,  max: 2.5, step: 0.05, key: 'height',   fmt: (v) => v.toFixed(2) + ' ×', onInput: seaIn });
  ui.slider('slRipple',   { label: 'Ripples',      min: 0,    max: 2.5, step: 0.05, key: 'ripple',   fmt: (v) => (v < 0.03 ? 'none' : v.toFixed(2) + ' ×'), onInput: seaIn });
  ui.slider('slSwell',    { label: 'Swell height', min: 0,    max: 1.2, step: 0.05, key: 'swellH',   fmt: (v) => (v < 0.03 ? 'none' : v.toFixed(2) + ' m'), onInput: seaIn });
  ui.slider('slSwellT',   { label: 'Swell period', min: 4,    max: 9,   step: 0.1,  key: 'swellT',   fmt: (v) => v.toFixed(1) + ' s', onInput: seaIn });
  ui.slider('slSwellOff', { label: 'Swell from',   min: -90,  max: 90,  step: 5,    key: 'swellOff', fmt: (v) => (v > 0 ? '+' : '') + v + '° off the wind', onInput: seaIn });
  ui.slider('slChop',     { label: 'Chop',         min: 0.4,  max: 1.9, step: 0.05, key: 'chop',     fmt: (v) => (v < 0.7 ? 'soft' : v < 1.2 ? 'rounded' : v < 1.6 ? 'sharp' : 'breaking'), onInput: lookIn, snap: [0.6, 1.0, 1.4, 1.8] });
  ui.slider('slTime',     { label: 'Time',         min: 0.1,  max: 2,   step: 0.05, key: 'timeK',    fmt: (v) => v.toFixed(2) + ' ×', onInput: () => {} });
  ui.dial('dGlint',   { label: 'Glint',   min: 0,   max: 3,   step: 0.05, key: 'glint',   fmt: (v) => v.toFixed(2) + ' ×', onInput: lookIn });
  ui.dial('dClarity', { label: 'Clarity', min: 0.4, max: 2.5, step: 0.05, key: 'clarity', fmt: (v) => (v < 0.7 ? 'murky' : v < 1.3 ? 'coastal' : v < 2 ? 'clear' : 'tropical'), onInput: lookIn });
  const manual = () => { S.sunManual = true; applyLook(); ui.repaintAll(); };
  ui.slider('slSunEl', { label: 'Sun height', min: 8,    max: 80,  step: 1, key: 'sunEl', fmt: (v) => v + '°', onInput: manual });
  ui.slider('slSunAz', { label: 'Sun around', min: -180, max: 180, step: 5, key: 'sunAz', fmt: (v) => (v > 0 ? '+' : '') + v + '°', onInput: manual });
  ui.dayCircle(() => { applyLook(); ui.repaintAll(); });
  // the weather: a few skies on the dots, the four sliders under them, and a squall or a strike on demand
  const wx = (key: 'cloud' | 'rain' | 'fog' | 'lightning') => ({ get: () => S[key], set: (v: number) => { S[key] = v; paintWx(); applyWeather(); } });
  const pct = (v: number) => Math.round(v * 100) + '%';
  const paintWx = dots('segWeather', { get: () => weatherName(S), set: (v) => { Object.assign(S, WEATHER[v]); applyWeather(); ui.repaintAll(); } });
  ui.paints.push(paintWx);
  ui.paints.push(slider('slCloud',     { label: 'Cloud',     min: 0, max: 1, step: 0.01, ...wx('cloud'),     fmt: (v) => (v < 0.05 ? 'clear' : v < 0.35 ? 'a few, ' + pct(v) : v < 0.7 ? 'broken, ' + pct(v) : v < 0.92 ? 'mostly, ' + pct(v) : 'overcast') }));
  ui.paints.push(slider('slRain',      { label: 'Rain',      min: 0, max: 1, step: 0.01, ...wx('rain'),      fmt: (v) => (v < 0.03 ? 'none' : v < 0.3 ? 'drizzle' : v < 0.6 ? 'rain' : v < 0.85 ? 'heavy' : 'downpour') }));
  ui.paints.push(slider('slFog',       { label: 'Fog',       min: 0, max: 1, step: 0.01, ...wx('fog'),       fmt: (v) => (v < 0.03 ? 'none' : v < 0.3 ? 'haze' : v < 0.6 ? 'mist' : v < 0.85 ? 'fog' : 'thick') }));
  ui.paints.push(slider('slLightning', { label: 'Lightning', min: 0, max: 1, step: 0.01, ...wx('lightning'), fmt: (v) => (v < 0.03 ? 'none' : v < 0.35 ? 'now and then' : v < 0.75 ? 'often' : 'overhead') }));
  $('bSquall').addEventListener('click', () => weather.squall());
  $('bStrike').addEventListener('click', () => weather.strike(true));
  let paused = false;
  ui.wireChrome({
    onPreset: () => { applyLook(); ui.repaintAll(); rebuild(); },
    onReset: () => { Object.assign(S, DEFAULTS); applyLook(); applyWeather(); ui.repaintAll(); rebuild(); },
    onReseed: () => { sea.reseed(); paintReadout(); },
    onPause: (p) => { paused = p; },
    shareUrl: () => shareUrl(S),
  });
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); cam.resize(); });

  // ---------- go
  ui.paintPreset(); applyLook(); applyWeather(); ui.repaintAll(); rebuild();

  // headless verification hook: ?check=1 compiles every material and runs the sea without presenting a frame
  if (q.get('check')) {
    try {
      await renderer.compileAsync(scene, cam.camera);
      sea.step(1 / 60);
      (window as unknown as { __check: unknown }).__check = { ok: true, stats: sea.stats, h: sea.heightAt(0, 0), comps: sea['comps' as keyof SeaSim] ? 'yes' : 'no' };
    } catch (e) { (window as unknown as { __check: unknown }).__check = { err: String(e) }; }
    return;
  }

  let last = performance.now(), fpsAvg = 60, acc = 0, accW = 1;
  renderer.setAnimationLoop(() => {
    const now = performance.now(), raw = Math.min(0.05, (now - last) / 1000); last = now;
    fpsAvg += (1 / Math.max(raw, 1e-3) - fpsAvg) * 0.05;
    if (!paused) { sea.step(raw * S.timeK); weather.step(raw * S.timeK, { speed: Math.max(1.5, S.windKn * KN), travel: travelFromCompass(S.windFrom) }); }
    // with a sky over the column the view backs off to take in the cloud; a clear sky frames the column alone
    const sky = Math.max(S.cloud, S.rain) > 0.01 || weather.squalling;
    cam.frameTo(sky ? column.waterY + 3.6 : column.waterY * 0.55, sky ? 13.6 : 9.4); cam.step(raw);
    renderer.render(scene, cam.camera);
    acc += raw; accW += raw;
    // the wind in the ring wanders with the gusts about eight times a second, unless a hand is on the bar
    if (accW > 0.12) { accW = 0; if (!$('windBar').classList.contains('on')) $('windKn').textContent = (S.windKn * gust(sea.time) * (1 + 0.6 * weather.squallHere)).toFixed(1); }
    if (acc > 0.5) {
      acc = 0;
      const t = Math.floor(sea.time), mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
      ui.tick($('vTime'), `T+${mm}:${ss}`, false); ui.tick($('vFps'), Math.round(fpsAvg) + ' fps', false);
    }
  });
  (window as unknown as { __bench: unknown }).__bench = { renderer, sea, column, weather, state: S, G };
}

// before main(), so a visitor without WebGPU still counts
startAnalytics();
typeTitle($('title'));
createLog();
main();
export type { BenchState };
