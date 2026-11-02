/**
 * How the sea is drawn. Everything reads a SeaSim's cascade textures through sampleSea/seaNormal and a
 * `Look` set of uniforms (colours, sun, clarity). Materials are MeshBasicNodeMaterial with full custom
 * colour nodes — no three lighting pipeline — so the look is entirely in this file.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, If, uniform, float, vec2, vec3, vec4, texture, varying, positionGeometry, positionLocal, positionWorld, cameraPosition,
  modelWorldMatrix, Discard, mx_noise_float, mx_worley_noise_float, fwidth, cos, sin, exp, abs, max, min, mix, smoothstep,
  clamp, dot, normalize, cross, pow, fract, length, select, reflect,
} from 'three/tsl';
import type { SeaSim } from './sea-sim';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
type U<T = number> = { value: T } & N;
const V4 = vec4 as N;

/** Colours and light. Change `.value`s freely; nothing needs rebuilding. */
export interface Look {
  /** page / paper colour, reflected as the horizon */
  sceneCol: U<THREE.Color>;
  zenith: U<THREE.Color>;
  sunDir: U<THREE.Vector3>;
  sunCol: U<THREE.Color>;
  /** sun highlight strength, 1 = default */
  glint: U;
  /** water clarity, 1 = coastal; higher = clearer walls and seabed */
  clarity: U;
  /** 0 clear teal … 1 grey-green, usually tied to wind */
  murk: U;
  /** significant wave height, for the crest glow normalisation */
  hs: U;
  /** 1 at night (dark theme) */
  dark: U;
  /** radius of the column, metres (surface and seabed are clipped to it) */
  radius: U;
  /** mean water level, world y */
  waterY: U;
}

export function makeLook(): Look {
  return {
    sceneCol: uniform(new THREE.Color('#ECE9E1')), zenith: uniform(new THREE.Color('#7E97AD')),
    sunDir: uniform(new THREE.Vector3(-0.78, 0.60, -0.17).normalize()), sunCol: uniform(new THREE.Color(1.0, 0.94, 0.82)),
    glint: uniform(1), clarity: uniform(1), murk: uniform(0.3), hs: uniform(0.4), dark: uniform(0), radius: uniform(7), waterY: uniform(0),
  };
}

/** (Dx, h, Dz, 0) summed over cascades at a block-local xz; the sea's `off` uniform scrolls the world underneath. */
export function makeSampleSea(sea: SeaSim) {
  return Fn(([xz]: N[]) => {
    const w = xz.add(sea.U.off), acc = vec4(0).toVar();
    for (const c of sea.cascades) acc.xyz.addAssign(texture(c.tex, w.div(c.L), float(0)).xyz);
    return acc;
  });
}

/** Surface normal from central differences per cascade (bilinear → continuous), including the horizontal stretch of chop. */
export function makeSeaNormal(sea: SeaSim) {
  return (xz: N): N => {
    const w = xz.add(sea.U.off), ddx = vec3(0).toVar(), ddz = vec3(0).toVar(), N_ = sea.N;
    for (const c of sea.cascades) {
      const e = c.L / N_, inv = 1 / (2 * e), uv = w.div(c.L), du = vec2(1 / N_, 0), dv = vec2(0, 1 / N_);
      ddx.addAssign(texture(c.tex, uv.add(du), float(0)).xyz.sub(texture(c.tex, uv.sub(du), float(0)).xyz).mul(inv));
      ddz.addAssign(texture(c.tex, uv.add(dv), float(0)).xyz.sub(texture(c.tex, uv.sub(dv), float(0)).xyz).mul(inv));
    }
    const lam = sea.U.lambda;
    const Tx = vec3(lam.mul(ddx.x).add(1), ddx.y, lam.mul(ddx.z)), Tz = vec3(lam.mul(ddz.x), ddz.y, lam.mul(ddz.z).add(1));
    return normalize(cross(Tz, Tx));
  };
}

/** The studio "sky" the water reflects: paper at the horizon, cool zenith, a glow around the sun. */
export const skyColor = (look: Look, dir: N): N => {
  const t = pow(clamp(dir.y, 0, 1), 0.55), base = mix(look.sceneCol.mul(0.92), look.zenith, t);
  return base.add(look.sunCol.mul(pow(max(dot(dir, look.sunDir), 0), 14).mul(0.9)));
};

/** The sea surface: a plane displaced by the cascades, clipped to the column, Fresnel + crest glow + GGX glints. */
export function makeSurfaceMaterial(sea: SeaSim, look: Look): THREE.MeshBasicNodeMaterial {
  const sampleSea = makeSampleSea(sea), seaNormal = makeSeaNormal(sea), mat = new THREE.MeshBasicNodeMaterial();
  const base = positionGeometry.xz, d = sampleSea(base);
  const displaced = vec3(base.x.add(sea.U.lambda.mul(d.x)), d.y.add(look.waterY), base.y.add(sea.U.lambda.mul(d.z)));
  mat.positionNode = displaced;
  const vBase = varying(base), vPos = varying(displaced);
  mat.colorNode = Fn(() => {
    const p = vPos;
    If(length(p.xz).greaterThan(look.radius), () => { Discard(); });
    const n = seaNormal(vBase), V = normalize(cameraPosition.sub(p)), L = look.sunDir;
    const NdotV = max(dot(n, V), 0.001), NdotL = max(dot(n, L), 0);
    const Fr = float(0.02).add(pow(NdotV.oneMinus(), 5).mul(0.98)), sky = skyColor(look, reflect(V.negate(), n));
    const deep = mix(vec3(0.010, 0.060, 0.080), vec3(0.055, 0.105, 0.105), look.murk);
    const scatter = mix(vec3(0.060, 0.330, 0.320), vec3(0.120, 0.300, 0.250), look.murk);
    const hRel = p.y.sub(look.waterY).div(look.hs.add(0.08));
    const sss = clamp(hRel.mul(0.55).add(0.25), 0, 1).mul(NdotL.mul(0.5).add(0.5)).mul(look.dark.oneMinus().mul(0.7).add(0.3));
    const body = deep.add(scatter.mul(sss));
    const H = normalize(L.add(V)), NdotH = max(dot(n, H), 0), rough = float(0.085), a2 = rough.mul(rough).mul(rough).mul(rough);
    const dd = NdotH.mul(NdotH).mul(a2.sub(1)).add(1), D = a2.div(dd.mul(dd).mul(Math.PI)), VdotH = max(dot(V, H), 0);
    const Fs = float(0.02).add(pow(VdotH.oneMinus(), 5).mul(0.98));
    const spec = D.mul(Fs).mul(NdotL).mul(0.32).mul(look.glint), sheen = pow(NdotH, 24).mul(NdotL).mul(0.10).mul(look.glint.mul(0.5).add(0.5));
    return vec4(mix(body, sky, Fr).add(look.sunCol.mul(spec.add(sheen))), 1);
  })();
  return mat;
}

/** Seabed height above the ground, metres, evaluated anywhere (vertex, fragment, wall section). */
export function makeSeabed(travel: number) {
  const dir = [Math.cos(travel), Math.sin(travel)];
  return Fn(([xz]: N[]) => {
    const along = xz.x.mul(dir[0]).add(xz.y.mul(dir[1]));
    const n1 = mx_noise_float(vec3(xz.mul(0.16), 1.3)), n2 = mx_noise_float(vec3(xz.mul(0.42), 7.1));
    const warp = mx_noise_float(vec3(xz.mul(0.9), 3.3)).mul(1.1);
    const ripples = pow(sin(along.mul(2 * Math.PI / 0.42).add(warp)).mul(0.5).add(0.5), 1.6).mul(0.035);
    return max(float(0.40).add(along.mul(-0.028)).add(n1.mul(0.30)).add(n2.mul(0.09)).add(ripples), 0.04);
  });
}

/** Shade anything under the surface: refracted key light, caustics, then the water column above it. */
export function makeUnderwater(sea: SeaSim, look: Look) {
  const sampleSea = makeSampleSea(sea);
  return Fn(([albedo, n, p]: N[]) => {
    const xz = p.xz, level = sampleSea(xz).y.add(look.waterY), depth = max(level.sub(p.y), 0.05);
    const Lw = normalize(mix(look.sunDir, vec3(0, 1, 0), 0.45)), NdotL = max(dot(n, Lw), 0);
    const c1 = mx_worley_noise_float(vec3(xz.mul(0.55), sea.U.tSim.mul(0.25)));
    const c2 = mx_worley_noise_float(vec3(xz.mul(0.85).add(3.7), sea.U.tSim.mul(0.19).add(5.0)));
    const caust = c1.mul(c2).mul(2.2).mul(NdotL).mul(mix(1.4, 0.6, smoothstep(0.7, 1.7, depth)));
    const lit = albedo.mul(n.y.mul(0.25).add(0.35).add(NdotL.mul(0.75)).add(caust));
    const trans = exp(vec3(0.38, 0.15, 0.09).mul(depth.div(look.clarity).mul(-1.6)));
    const scatter = mix(vec3(0.045, 0.22, 0.21), vec3(0.09, 0.19, 0.16), look.murk);
    return lit.mul(trans).add(scatter.mul(exp(depth.div(look.clarity).mul(-0.9)).oneMinus()));
  });
}

/** The cut wall of the column: see-through water above the sand, sand strata below it, nothing above the water line. */
export function makeWallMaterial(sea: SeaSim, look: Look, seabed: N): THREE.MeshBasicNodeMaterial {
  const sampleSea = makeSampleSea(sea), mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  mat.colorNode = Fn(() => {
    const p = positionWorld, xz = p.xz, q = xz.toVar();
    q.assign(xz.sub(sampleSea(q).xz.mul(sea.U.lambda))); q.assign(xz.sub(sampleSea(q).xz.mul(sea.U.lambda)));   // undo the chop at this column
    const level = sampleSea(q).y.add(look.waterY);
    If(p.y.greaterThan(level), () => { Discard(); });
    const depth = level.sub(p.y);
    const deep = mix(vec3(0.010, 0.060, 0.080), vec3(0.055, 0.105, 0.105), look.murk), near = mix(vec3(0.075, 0.360, 0.345), vec3(0.130, 0.310, 0.260), look.murk);
    let col = mix(near, deep, exp(depth.div(look.clarity).mul(-0.95)).oneMinus());
    col = col.add(vec3(0.20, 0.42, 0.40).mul(exp(depth.mul(-7)).mul(0.35)));
    const nrm = normalize(vec3(p.x, 0, p.z)), lit = max(dot(nrm, look.sunDir), 0).mul(0.25).add(0.80);
    const alpha = mix(float(0.40), float(0.74), smoothstep(0.0, 1.6, depth)).add(look.murk.mul(0.12));
    const fh = seabed(xz), strata = sin(p.y.mul(26).add(mx_noise_float(vec3(xz.mul(1.3), 4.0)).mul(3))).mul(0.5).add(0.5);
    const section = mix(vec3(0.27, 0.21, 0.13), vec3(0.40, 0.32, 0.20), strata).mul(lit), underBed = p.y.lessThan(fh);
    return vec4(select(underBed, section, col.mul(lit)), select(underBed, float(1), clamp(alpha, 0, 0.9)));
  })();
  return mat;
}

/** The sand floor: the seabed heightfield with analytic normals, shaded underwater. */
export function makeSeabedMaterial(look: Look, seabed: N, underwater: N): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.positionNode = vec3(positionGeometry.x, seabed(positionGeometry.xz), positionGeometry.z);
  mat.colorNode = Fn(() => {
    const p = positionWorld, xz = p.xz;
    If(length(xz).greaterThan(look.radius.sub(0.004)), () => { Discard(); });
    const e = 0.05;
    const hx = seabed(xz.add(vec2(e, 0))).sub(seabed(xz.sub(vec2(e, 0)))).div(2 * e), hz = seabed(xz.add(vec2(0, e))).sub(seabed(xz.sub(vec2(0, e)))).div(2 * e);
    const n = normalize(vec3(hx.negate(), 1, hz.negate()));
    const grain = mx_noise_float(vec3(xz.mul(3.0), 9.0)).mul(0.5).add(0.5);
    const sand = mix(vec3(0.40, 0.32, 0.19), vec3(0.62, 0.52, 0.33), grain.mul(0.6).add(n.y.mul(0.4)));
    const patch = smoothstep(0.35, 0.7, mx_noise_float(vec3(xz.mul(0.25).add(11.0), 2.0)).mul(0.5).add(0.5));
    return vec4(underwater(mix(sand, vec3(0.16, 0.22, 0.14), patch.mul(0.55)), n, p), 1);
  })();
  return mat;
}

/** Boulders: a noise-displaced sphere with normals rebuilt from the displacement, shaded underwater. */
export function makeRockMaterial(underwater: N): THREE.MeshBasicNodeMaterial {
  const shape = (q: N) => q.mul(mx_noise_float(q.mul(1.7)).mul(0.32).add(1)), mat = new THREE.MeshBasicNodeMaterial();
  mat.positionNode = shape(positionLocal);
  mat.colorNode = Fn(() => {
    const q = positionGeometry, nl = normalize(q);
    const t1 = normalize(cross(nl, select(abs(nl.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0)))), t2 = cross(nl, t1), e = 0.03;
    const d1 = shape(q.add(t1.mul(e))).sub(shape(q.sub(t1.mul(e)))), d2 = shape(q.add(t2.mul(e))).sub(shape(q.sub(t2.mul(e))));
    const n = normalize(cross(d1, d2).transformDirection(modelWorldMatrix));
    const mottle = mx_noise_float(q.mul(4.0).add(2.0)).mul(0.5).add(0.5);
    let albedo = mix(vec3(0.17, 0.18, 0.16), vec3(0.31, 0.30, 0.26), mottle);
    albedo = mix(albedo, vec3(0.13, 0.23, 0.13), smoothstep(0.3, 0.9, n.y).mul(0.5));
    return vec4(underwater(albedo, n, positionWorld), 1);
  })();
  return mat;
}

/** The paper the column stands on: a metre grid with a heavier line every 5 m, and the column's soft shadow. */
export function makeGroundMaterial(look: Look, shadowOffset = new THREE.Vector2(1.35, 0.30)): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.toneMapped = false;
  mat.colorNode = Fn(() => {
    const p = positionWorld.xz;
    const g = abs(fract(p.sub(0.5)).sub(0.5)).div(fwidth(p)), g5 = abs(fract(p.div(5).sub(0.5)).sub(0.5)).mul(5).div(fwidth(p));
    const line = min(min(g.x, g.y), 1).oneMinus().mul(0.55).add(min(min(g5.x, g5.y), 1).oneMinus().mul(1.3));
    const fade = smoothstep(70, 14, length(p));
    const dist = length(p.sub(vec2(shadowOffset.x, shadowOffset.y))).sub(look.radius);
    const sh = smoothstep(-0.6, 2.8, dist).oneMinus().mul(0.26), gl = line.mul(fade);
    const col = mix(look.sceneCol.mul(gl.mul(0.24).oneMinus()), look.sceneCol.add(gl.mul(0.07)), look.dark).mul(sh.oneMinus());
    return V4(col, 1);
  })();
  return mat;
}
