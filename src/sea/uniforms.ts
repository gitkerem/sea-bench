import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { DEFAULT_SEA, spreadNorm, type SeaParams } from './spectrum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type U<T = number> = { value: T } & any;

/** Everything the GPU sea reads. Set values, call SeaSim.rebuild() for spectrum changes; lambda, tSim and off are live. */
export interface SeaUniforms {
  windU: U; fetch: U; travel: U; spreadP: U; spreadNorm: U; gamma: U;
  swellAmp: U; swellT: U; swellDir: U;
  ampScale: U; ripple: U; seed: U;
  /** choppiness: horizontal displacement scale, 0 = none, ~1.2 = sharp crests */
  lambda: U;
  /** simulation time, seconds */
  tSim: U;
  /** world offset added to sampling positions, metres (lets a scene scroll the sea under a boat) */
  off: U<THREE.Vector2>;
}

export function makeSeaUniforms(p: SeaParams = DEFAULT_SEA): SeaUniforms {
  return {
    windU: uniform(p.windU), fetch: uniform(p.fetch), travel: uniform(p.travel),
    spreadP: uniform(p.spreadP), spreadNorm: uniform(spreadNorm(p.spreadP)), gamma: uniform(p.gamma),
    swellAmp: uniform(p.swellAmp), swellT: uniform(p.swellT), swellDir: uniform(p.swellDir),
    ampScale: uniform(p.ampScale), ripple: uniform(p.ripple), seed: uniform(1),
    lambda: uniform(1.15), tSim: uniform(0), off: uniform(new THREE.Vector2()),
  };
}

export function writeSeaUniforms(U: SeaUniforms, p: SeaParams): void {
  U.windU.value = p.windU; U.fetch.value = p.fetch; U.travel.value = p.travel;
  U.spreadP.value = p.spreadP; U.spreadNorm.value = spreadNorm(p.spreadP); U.gamma.value = p.gamma;
  U.swellAmp.value = p.swellAmp; U.swellT.value = p.swellT; U.swellDir.value = p.swellDir;
  U.ampScale.value = p.ampScale; U.ripple.value = p.ripple;
}
