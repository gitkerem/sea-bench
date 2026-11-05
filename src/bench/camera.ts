import * as THREE from 'three/webgpu';

/** One fixed isometric angle. Drag to peek, scroll/pinch/keys to zoom, double-click to reset. The column is centred in the part of the page the panel leaves free. */
export class BenchCamera {
  readonly camera = new THREE.PerspectiveCamera(24, 1, 0.5, 400);
  readonly view = { yaw: THREE.MathUtils.degToRad(-40), el: THREE.MathUtils.degToRad(30), zoom: 1 };
  private readonly yaw0 = this.view.yaw;
  private readonly el0 = this.view.el;
  private drag: { x: number; y: number; yaw: number; el: number } | null = null;
  private pinch: { d0: number; z0: number } | null = null;
  private readonly pts = new Map<number, { x: number; y: number }>();
  /** where the frame is easing to: the point it centres on and the radius it fits (see frameTo) */
  private readonly goal: { y: number; r: number };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly target: THREE.Vector3, private fitRadius: number, private readonly panelWidth: () => number) {
    this.goal = { y: target.y, r: fitRadius };
    canvas.addEventListener('pointerdown', (e) => {
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
      if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: this.view.zoom }; this.drag = null; }
      else this.drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, el: this.view.el };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.pts.has(e.pointerId)) return;
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.setZoom(this.pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d0); return; }
      if (!this.drag) return;
      this.view.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.004;
      this.view.el = THREE.MathUtils.clamp(this.drag.el + (e.clientY - this.drag.y) * 0.003, THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(70));
      this.place();
    });
    const lift = (e: PointerEvent) => { this.pts.delete(e.pointerId); if (this.pts.size < 2) this.pinch = null; if (this.pts.size === 0) this.drag = null; };
    canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.view.zoom * Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
    canvas.addEventListener('dblclick', () => this.reset());
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === '=' || e.key === '+') this.setZoom(this.view.zoom * 1.15);
      if (e.key === '-' || e.key === '_') this.setZoom(this.view.zoom / 1.15);
    });
    this.resize();
  }

  /** Ease the frame to centre on height `y` and fit radius `r`: the weather's cloud stands above the column, so the
   *  view backs off to take it in, and comes back when the sky clears. Call step() every frame. */
  frameTo(y: number, r: number): void { this.goal.y = y; this.goal.r = r; }
  step(dt: number): void {
    const k = 1 - Math.exp(-dt * 2.2), dy = this.goal.y - this.target.y, dr = this.goal.r - this.fitRadius;
    if (Math.abs(dy) < 1e-3 && Math.abs(dr) < 1e-3) return;
    this.target.y += dy * k; this.fitRadius += dr * k; this.place();
  }

  setZoom(z: number): void { this.view.zoom = THREE.MathUtils.clamp(z, 0.5, 3); this.place(); }
  reset(): void { this.view.yaw = this.yaw0; this.view.el = this.el0; this.view.zoom = 1; this.place(); }
  resize(): void { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.place(); }

  place(): void {
    const W = window.innerWidth, H = window.innerHeight, panelW = this.panelWidth(), aspect = (W - panelW) / H, v = this.view, cam = this.camera;
    const fovV = THREE.MathUtils.degToRad(cam.fov), fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect), R = this.fitRadius;
    const dist = Math.max(R / Math.sin(fovV / 2), R / Math.sin(fovH / 2)) * 1.02 / v.zoom;
    const worldPerPx = 2 * dist * Math.tan(fovV / 2) / H, shift = panelW / 2 * worldPerPx;
    const t = new THREE.Vector3(this.target.x + Math.cos(v.yaw) * shift, this.target.y, this.target.z - Math.sin(v.yaw) * shift);
    cam.position.set(t.x + Math.sin(v.yaw) * Math.cos(v.el) * dist, t.y + Math.sin(v.el) * dist, t.z + Math.cos(v.yaw) * Math.cos(v.el) * dist);
    cam.lookAt(t);
  }
}
