import * as THREE from "three";

/**
 * `<ghost-field>` — the "field of symbols" 3D scene, DESIGN-BRIEF.md §6.2.
 * Ported near-verbatim from docs/design/prototype/ghost-scene.js (a plain
 * custom element, not a React component, on purpose: one WebGL context,
 * imperatively driven, that a thin React wrapper mounts/unmounts — see
 * `GhostField.tsx`). Colors are read live from the CSS custom properties
 * the active theme sets (`--gl-fg`, `--gl-accent-text`, `--gl-glyph-a`) —
 * this is the one place outside shared/theme allowed to read `--gl-*`
 * directly, because a WebGL shader can't consume a Tailwind utility class.
 */

THREE.ColorManagement.enabled = false;

const CH = "0123456789ABCDEF#%&*+=<>/?{}[]$@!ЖЩЮЯБДФЛЦШЭЁЙΣΩΔλπ§±÷≈≠∞◊░▒▓■□ghostlin"
  .split("")
  .slice(0, 64);
while (CH.length < 64) CH.push("#");

function atlas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  if (!x) return c;
  x.fillStyle = "#000";
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = "#fff";
  x.font = '500 44px "JetBrains Mono", ui-monospace, monospace';
  x.textAlign = "center";
  x.textBaseline = "middle";
  CH.forEach((ch, i) => {
    x.fillText(ch, (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  });
  return c;
}

const R = Math.random;

function cloud(n: number): Float32Array {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = (R() - 0.5) * 11;
    a[i * 3 + 1] = (R() - 0.5) * 6;
    a[i * 3 + 2] = (R() - 0.5) * 4;
  }
  return a;
}
function wall(n: number): Float32Array {
  const a = new Float32Array(n * 3);
  const cols = Math.round(Math.sqrt(n * 1.8));
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    a[i * 3] = (c / (cols - 1) - 0.5) * 11;
    a[i * 3 + 1] = (r / (rows - 1) - 0.5) * 6.2;
    a[i * 3 + 2] = (R() - 0.5) * 0.2;
  }
  return a;
}
function fib(a: Float32Array, off: number, n: number, r: number, cx: number): void {
  for (let j = 0; j < n; j++) {
    const y = 1 - (2 * (j + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const ph = j * 2.39996;
    const k = (off + j) * 3;
    const rj = r * (1 + (R() - 0.5) * 0.04);
    a[k] = Math.cos(ph) * rr * rj + cx;
    a[k + 1] = y * rj;
    a[k + 2] = Math.sin(ph) * rr * rj;
  }
}
function sphere(n: number): Float32Array {
  const a = new Float32Array(n * 3);
  fib(a, 0, n, 1.9, 0);
  return a;
}
function handshake(n: number): Float32Array {
  const a = new Float32Array(n * 3);
  const s = Math.floor(n * 0.4);
  fib(a, 0, s, 0.95, -2.5);
  fib(a, s, s, 0.95, 2.5);
  for (let i = s * 2; i < n; i++) {
    const t = R();
    a[i * 3] = -1.55 + 3.1 * t;
    a[i * 3 + 1] = Math.sin(t * Math.PI * 3 + R() * 0.6) * 0.16;
    a[i * 3 + 2] = (R() - 0.5) * 0.2;
  }
  return a;
}
function word(n: number): Float32Array {
  const w = 1200;
  const h = 300;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  const pts: number[] = [];
  if (x) {
    x.fillStyle = "#fff";
    x.font = "700 228px Geologica, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("ghostline", w / 2, h / 2 + 8);
    const d = x.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y += 3)
      for (let X = 0; X < w; X += 3) if ((d[(y * w + X) * 4] ?? 0) > 128) pts.push(X, y);
  }
  const a = new Float32Array(n * 3);
  const m = pts.length / 2 || 1;
  for (let i = 0; i < n; i++) {
    const k = ((R() * m) | 0) * 2;
    a[i * 3] = ((pts[k] ?? w / 2) / w - 0.5) * 8;
    a[i * 3 + 1] = -((pts[k + 1] ?? h / 2) / h - 0.5) * 2;
    a[i * 3 + 2] = (R() - 0.5) * 0.12;
  }
  return a;
}

const VS = `
attribute vec3 aS1; attribute vec3 aS2; attribute vec3 aS3; attribute vec4 aRand; attribute float aGlyph;
uniform float uTime, uMorph, uPR, uSize, uFreeze, uRad; uniform vec3 uMouse;
varying float vG; varying float vF; varying float vA; varying float vAcc;
float st(float m, float i, float r){ return smoothstep(0., 1., clamp((m - i) * 1.7 - r * .7, 0., 1.)); }
void main(){
  float r = aRand.x;
  vec3 p = mix(position, aS1, st(uMorph, 0., r));
  p = mix(p, aS2, st(uMorph, 1., r));
  p = mix(p, aS3, st(uMorph, 2., r));
  float drift = 1. - uFreeze * .85;
  p += drift * .045 * vec3(sin(uTime*(.6+aRand.y) + r*40.), cos(uTime*(.5+aRand.z) + r*30.), sin(uTime*.7 + aRand.w*20.));
  vec4 wp = modelMatrix * vec4(p, 1.);
  vec2 d = wp.xy - uMouse.xy; float dist = length(d);
  float f = 1. - smoothstep(0., uRad, dist);
  if (dist > .0001) wp.xy += d / dist * f * f * .45 * uRad;
  vF = f;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (1. + f * .5) * (7. / -mv.z);
  float lock = max(step(.35, f), step(.5, uFreeze));
  vG = mod(aGlyph + floor(uTime * (1. + aRand.y * 5.) + aRand.z * 17.) * (1. - lock), 64.);
  vA = smoothstep(13., 4., -mv.z);
  vAcc = step(.955, aRand.w);
}`;
const FS = `
uniform sampler2D uTex; uniform vec3 uColor, uAccent; uniform float uAlpha;
varying float vG; varying float vF; varying float vA; varying float vAcc;
void main(){
  vec2 pc = gl_PointCoord; float c = mod(vG, 8.), rr = floor(vG / 8.);
  float a = texture2D(uTex, vec2((c + pc.x) / 8., 1. - (rr + pc.y) / 8.)).r;
  if (a < .08) discard;
  float acc = clamp(max(vAcc, vF * 1.6), 0., 1.);
  gl_FragColor = vec4(mix(uColor, uAccent, acc), a * mix(uAlpha, 1., max(vF, vAcc * .6)) * (.35 + .65 * vA));
}`;
const sm = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Layout = "center" | "right" | "wall";

export class GhostFieldElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["layout", "count"];
  }
  private getLayout(): Layout {
    const v = this.getAttribute("layout");
    return v === "right" || v === "wall" ? v : "center";
  }

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private cam?: THREE.PerspectiveCamera;
  private group?: THREE.Group;
  private tex?: THREE.CanvasTexture;
  private mat?: THREE.ShaderMaterial;
  private points?: THREE.Points;
  private u!: {
    uTex: { value: THREE.CanvasTexture };
    uTime: { value: number };
    uMorph: { value: number };
    uMouse: { value: THREE.Vector3 };
    uPR: { value: number };
    uSize: { value: number };
    uColor: { value: THREE.Color };
    uAccent: { value: THREE.Color };
    uFreeze: { value: number };
    uAlpha: { value: number };
    uRad: { value: number };
  };
  private ndc = new THREE.Vector2();
  private ptr = new THREE.Vector2();
  private frame = 0;
  private raf = 0;
  private ready = false;
  private init = false;
  private visible = true;
  private cur = 0;
  private vw = 9;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private reducedMotion = false;
  private fontTimeout?: ReturnType<typeof setTimeout>;
  private onMove = (e: PointerEvent): void => {
    const b = this.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) {
      this.u.uMouse.value.set(99, 99, 0);
      this.ndc.set(0, 0);
      return;
    }
    this.ndc.set(
      ((e.clientX - b.left) / b.width) * 2 - 1,
      -((e.clientY - b.top) / b.height) * 2 + 1,
    );
    if (!this.cam) return;
    const v = new THREE.Vector3(this.ndc.x, this.ndc.y, 0.5)
      .unproject(this.cam)
      .sub(this.cam.position)
      .normalize();
    this.u.uMouse.value.copy(this.cam.position).add(v.multiplyScalar(-this.cam.position.z / v.z));
  };
  private onLeave = (): void => {
    this.u.uMouse.value.set(99, 99, 0);
  };

  connectedCallback(): void {
    Object.assign(this.style, {
      display: "block",
      position: "absolute",
      inset: "0",
      overflow: "hidden",
    });
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!this.init) {
      this.init = true;
      void this.setup();
    } else {
      this.start();
    }
  }
  disconnectedCallback(): void {
    this.stop();
    this.dispose();
  }
  attributeChangedCallback(_name: string, oldValue: string, newValue: string): void {
    if (oldValue !== newValue && this.ready) this.build();
  }

  private async setup(): Promise<void> {
    try {
      await this._setup();
    } catch (e) {
      console.warn("ghost-field: WebGL unavailable", e instanceof Error ? e.message : e);
    }
  }

  private async _setup(): Promise<void> {
    const r = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0, 0);
    Object.assign(r.domElement.style, { display: "block", width: "100%", height: "100%" });
    this.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.cam.position.z = 7;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.tex = new THREE.CanvasTexture(atlas());
    this.u = {
      uTex: { value: this.tex },
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uMouse: { value: new THREE.Vector3(99, 99, 0) },
      uPR: { value: r.getPixelRatio() },
      uSize: { value: 17 },
      uColor: { value: new THREE.Color("#e9ece8") },
      uAccent: { value: new THREE.Color("#b8f25b") },
      uFreeze: { value: 0 },
      uAlpha: { value: 0.5 },
      uRad: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
    });
    window.addEventListener("pointermove", this.onMove, { passive: true });
    window.addEventListener("pointerdown", this.onMove, { passive: true });
    document.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => {
      this.resize();
    });
    this.ro.observe(this);
    this.io = new IntersectionObserver((es) => {
      this.visible = es[0]?.isIntersecting ?? true;
    });
    this.io.observe(this);
    // A cancelable race, not `Promise.race([..., new Promise(setTimeout)])`
    // — that leaves the timer running (and later touching `window`/`this`)
    // even after disconnectedCallback disposes the element, e.g. when a
    // test unmounts before fonts.load() settles.
    await new Promise<void>((resolve) => {
      this.fontTimeout = setTimeout(resolve, 1500);
      Promise.all([
        document.fonts.load('500 44px "JetBrains Mono"'),
        document.fonts.load("700 100px Geologica"),
      ])
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(this.fontTimeout);
          resolve();
        });
    });
    if (!this.init) return;
    this.tex.image = atlas();
    this.tex.needsUpdate = true;
    this.build();
    this.resize();
    this.readColors();
    this.ready = true;
    this.cur = this.reducedMotion ? 1 : 0;
    if (this.reducedMotion) {
      // "static sphere without flicker" — DESIGN-BRIEF §6.2/§9.
      this.u.uMorph.value = 1;
      this.u.uFreeze.value = 1;
      this.renderer.render(this.scene, this.cam);
      return;
    }
    this.start();
  }

  private build(): void {
    const n = Math.max(300, Number(this.getAttribute("count")) || 2400);
    const lay = this.getLayout();
    if (this.points && this.group) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
    }
    const g = new THREE.BufferGeometry();
    const rand = new Float32Array(n * 4);
    const gl = new Float32Array(n);
    for (let i = 0; i < n * 4; i++) rand[i] = R();
    for (let i = 0; i < n; i++) gl[i] = (R() * 64) | 0;
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        lay === "wall" ? wall(n) : lay === "right" ? sphere(n) : cloud(n),
        3,
      ),
    );
    g.setAttribute("aS1", new THREE.BufferAttribute(sphere(n), 3));
    g.setAttribute("aS2", new THREE.BufferAttribute(handshake(n), 3));
    g.setAttribute("aS3", new THREE.BufferAttribute(word(n), 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
    g.setAttribute("aGlyph", new THREE.BufferAttribute(gl, 1));
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.group?.add(this.points);
  }

  private resize(): void {
    if (!this.renderer || !this.cam) return;
    const w = this.clientWidth || 1;
    const h = this.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.vw = 2 * 7 * Math.tan(Math.PI / 8) * this.cam.aspect;
  }

  private readColors(): void {
    const cs = getComputedStyle(this);
    const fg = cs.getPropertyValue("--gl-fg").trim();
    const ac = cs.getPropertyValue("--gl-accent-text").trim();
    const al = Number.parseFloat(cs.getPropertyValue("--gl-glyph-a"));
    if (fg) this.u.uColor.value.set(fg);
    if (ac) this.u.uAccent.value.set(ac);
    if (!Number.isNaN(al)) this.u.uAlpha.value = al;
  }

  // The nearest scrollable ancestor of the closest `[data-morph-track]`
  // wrapper — resolved once and cached, mirroring ghost-scene.js's
  // `targetMorph`. Landing (F6) sticks the scene under a `data-morph-track`
  // div and scrolls the document itself, so this falls through to
  // `document.scrollingElement`.
  private scrollParent?: Element | null;

  private targetMorph(): number {
    const track = this.closest("[data-morph-track]");
    if (!track) return Number(this.getAttribute("morph")) || 0;
    if (this.scrollParent === undefined) {
      let p: Element | null = track.parentElement;
      while (p && p !== document.body) {
        const overflowY = getComputedStyle(p).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") break;
        p = p.parentElement;
      }
      this.scrollParent = p && p !== document.body ? p : document.scrollingElement;
    }
    const sp = this.scrollParent;
    if (!sp) return 0;
    const top = sp === document.scrollingElement ? 0 : sp.getBoundingClientRect().top;
    const usableSpan = (track as HTMLElement).offsetHeight - sp.clientHeight;
    if (usableSpan <= 0) return 0;
    const progress = Math.min(
      1,
      Math.max(0, (top - track.getBoundingClientRect().top) / usableSpan),
    );
    return progress * 3;
  }

  private start(): void {
    if (this.raf || !this.ready || this.reducedMotion) return;
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop);
      this.tick(t);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(t: number): void {
    if (!this.visible || !this.renderer || !this.cam || !this.scene) return;
    const cv = this.renderer.domElement;
    const pr = this.renderer.getPixelRatio();
    if (
      cv.width !== Math.round((this.clientWidth || 1) * pr) ||
      cv.height !== Math.round((this.clientHeight || 1) * pr)
    )
      this.resize();
    const time = t / 1000;
    const u = this.u;
    this.cur += (this.targetMorph() - this.cur) * 0.07;
    const m = this.cur;
    const fit = Math.min(1, this.vw / 9.2);
    u.uMorph.value = m;
    u.uTime.value = time;
    u.uFreeze.value = sm(2.4, 2.9, m);
    u.uSize.value = 17 * (0.6 + 0.4 * fit);
    u.uRad.value = 1.1 * Math.max(fit, 0.5);
    let ox = 0;
    let sc = fit;
    if (this.getLayout() === "right" && this.vw > 7) {
      const k = 1 - Math.min(1, Math.max(0, m));
      ox = this.vw * 0.2 * k;
      sc = fit * (1 - 0.1 * k);
    }
    if (this.group) {
      this.group.position.x += (ox - this.group.position.x) * 0.08;
      this.group.scale.setScalar(sc);
    }
    this.ptr.lerp(this.ndc, 0.05);
    const rot = this.getLayout() === "wall" && m < 1 ? 0.25 : 1 - sm(1.9, 2.8, m) * 0.92;
    if (this.group) {
      this.group.rotation.y = (Math.sin(time * 0.12) * 0.4 + this.ptr.x * 0.35) * rot;
      this.group.rotation.x = -this.ptr.y * 0.2 * rot;
    }
    if (this.frame++ % 30 === 0) this.readColors();
    this.renderer.render(this.scene, this.cam);
  }

  private dispose(): void {
    this.init = false;
    this.ready = false;
    clearTimeout(this.fontTimeout);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerdown", this.onMove);
    document.removeEventListener("pointerleave", this.onLeave);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.points?.geometry.dispose();
    this.mat?.dispose();
    this.tex?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.points = undefined;
    this.renderer = undefined;
  }
}

export function registerGhostField(): void {
  if (!customElements.get("ghost-field")) customElements.define("ghost-field", GhostFieldElement);
}
