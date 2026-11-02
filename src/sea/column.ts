/**
 * The cut-away column: a disc of sea on a seabed, inside a see-through wall, standing on a gridded
 * ground. One Group, so a scene can add, hide or resize it.
 */
import * as THREE from 'three/webgpu';
import type { SeaSim } from './sea-sim';
import { makeLook, makeSeabed, makeUnderwater, makeSurfaceMaterial, makeWallMaterial, makeSeabedMaterial, makeRockMaterial, makeGroundMaterial, type Look } from './shading';

export interface ColumnOptions {
  /** radius, metres */
  radius?: number;
  /** mean water level above the ground, metres */
  waterY?: number;
  /** how far above the mean level the wall reaches (must clear the highest crest) */
  wallTop?: number;
  /** surface mesh segments across the disc */
  segments?: number;
  /** direction the sand ripples align to (radians, xz plane) */
  rippleDir?: number;
  /** boulders: [x, z, size, yaw] */
  rocks?: [number, number, number, number][];
}

export class SeaColumn extends THREE.Group {
  readonly look: Look;
  readonly surface: THREE.Mesh;
  readonly wall: THREE.Mesh;
  readonly floor: THREE.Mesh;
  readonly ground: THREE.Mesh;
  readonly rocks: THREE.Mesh[] = [];
  readonly radius: number;

  constructor(sea: SeaSim, opts: ColumnOptions = {}) {
    super();
    const radius = opts.radius ?? 7, waterY = opts.waterY ?? 1.7, wallTop = opts.wallTop ?? 1.8, seg = opts.segments ?? 260;
    this.radius = radius;
    this.look = makeLook();
    this.look.radius.value = radius; this.look.waterY.value = waterY;

    const seabed = makeSeabed(opts.rippleDir ?? Math.PI), underwater = makeUnderwater(sea, this.look);

    const surfGeo = new THREE.PlaneGeometry(radius * 2 + 1.8, radius * 2 + 1.8, seg, seg);
    surfGeo.rotateX(-Math.PI / 2);
    this.surface = new THREE.Mesh(surfGeo, makeSurfaceMaterial(sea, this.look));
    this.surface.frustumCulled = false;
    this.add(this.surface);

    const wallGeo = new THREE.CylinderGeometry(radius, radius, waterY + wallTop, 192, 1, true);
    wallGeo.translate(0, (waterY + wallTop) / 2 + 0.004, 0);
    this.wall = new THREE.Mesh(wallGeo, makeWallMaterial(sea, this.look, seabed));
    this.add(this.wall);

    const floorGeo = new THREE.PlaneGeometry(radius * 2, radius * 2, 180, 180);
    floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(floorGeo, makeSeabedMaterial(this.look, seabed, underwater));
    this.floor.frustumCulled = false;
    this.add(this.floor);

    const rockGeo = new THREE.IcosahedronGeometry(1, 3), rockMat = makeRockMaterial(underwater);
    for (const [x, z, r, ry] of opts.rocks ?? DEFAULT_ROCKS) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.position.set(x, 0.22, z); m.scale.set(r, r * 0.72, r * 0.9); m.rotation.set(0.3, ry, 0.15);
      this.rocks.push(m); this.add(m);
    }

    const groundGeo = new THREE.PlaneGeometry(600, 600);
    groundGeo.rotateX(-Math.PI / 2); groundGeo.translate(0, -0.01, 0);
    this.ground = new THREE.Mesh(groundGeo, makeGroundMaterial(this.look));
    this.add(this.ground);
  }
}

export const DEFAULT_ROCKS: [number, number, number, number][] = [
  [-4.6, -3.2, 0.62, 0.4], [3.8, 4.4, 0.78, 1.9], [-2.1, 5.1, 0.46, 3.1], [5.5, -1.2, 0.52, 0.9], [0.9, -5.3, 0.68, 2.4], [-5.7, 2.5, 0.40, 4.2],
];
