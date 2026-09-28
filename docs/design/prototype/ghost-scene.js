import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
THREE.ColorManagement.enabled = false;

const CH = "0123456789ABCDEF#%&*+=<>/?{}[]$@!ЖЩЮЯБДФЛЦШЭЁЙΣΩΔλπ§±÷≈≠∞◊░▒▓■□ghostlin"
  .split("")
  .slice(0, 64);
while (CH.length < 64) CH.push("#");

function atlas() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = "#fff";
  x.font = '500 44px "JetBrains Mono", ui-monospace, monospace';
  x.textAlign = "center";
  x.textBaseline = "middle";
  CH.forEach((ch, i) => x.fillText(ch, (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34));
  return c;
}
const R = Math.random;
function cloud(n) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = (R() - 0.5) * 11;
    a[i * 3 + 1] = (R() - 0.5) * 6;
    a[i * 3 + 2] = (R() - 0.5) * 4;
  }
  return a;
}
function wall(n) {
  const a = new Float32Array(n * 3),
    cols = Math.round(Math.sqrt(n * 1.8)),
    rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const c = i % cols,
      r = Math.floor(i / cols);
    a[i * 3] = (c / (cols - 1) - 0.5) * 11;
    a[i * 3 + 1] = (r / (rows - 1) - 0.5) * 6.2;
    a[i * 3 + 2] = (R() - 0.5) * 0.2;
  }
  return a;
}
function fib(a, off, n, r, cx) {
  for (let j = 0; j < n; j++) {
    const y = 1 - (2 * (j + 0.5)) / n,
      rr = Math.sqrt(1 - y * y),
      ph = j * 2.39996,
      k = (off + j) * 3,
      rj = r * (1 + (R() - 0.5) * 0.04);
    a[k] = Math.cos(ph) * rr * rj + cx;
    a[k + 1] = y * rj;
    a[k + 2] = Math.sin(ph) * rr * rj;
  }
}
function sphere(n) {
  const a = new Float32Array(n * 3);
  fib(a, 0, n, 1.9, 0);
  return a;
}
function handshake(n) {
  const a = new Float32Array(n * 3),
    s = Math.floor(n * 0.4);
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
function word(n) {
  const w = 1200,
    h = 300,
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.font = "700 228px Geologica, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("ghostline", w / 2, h / 2 + 8);
  const d = x.getImageData(0, 0, w, h).data,
    pts = [];
  for (let y = 0; y < h; y += 3)
    for (let X = 0; X < w; X += 3) if (d[(y * w + X) * 4] > 128) pts.push(X, y);
  const a = new Float32Array(n * 3),
    m = pts.length / 2 || 1;
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
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

class GhostField extends HTMLElement {
  static get observedAttributes() {
    return ["layout", "count"];
  }
  get layout() {
    return this.getAttribute("layout") || "center";
  }
  set layout(v) {
    this.setAttribute("layout", v);
  }
  get count() {
    return this.getAttribute("count");
  }
  set count(v) {
    this.setAttribute("count", String(v));
  }
  get morph() {
    return this.getAttribute("morph");
  }
  set morph(v) {
    this.setAttribute("morph", String(v));
  }
  connectedCallback() {
    ["layout", "count", "morph"].forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        delete this[k];
        this[k] = v;
      }
    });
    Object.assign(this.style, {
      display: "block",
      position: "absolute",
      inset: "0",
      overflow: "hidden",
    });
    clearTimeout(this._kill);
    this._sp = null;
    if (!this._init) {
      this._init = true;
      this.setup();
    } else this.start();
  }
  disconnectedCallback() {
    this.stop();
    this._kill = setTimeout(() => {
      if (!this.isConnected) this.dispose();
    }, 100);
  }
  attributeChangedCallback(n, o, v) {
    if (o !== v && this._ready) this.build();
  }
  async setup() {
    try {
      await this._setup();
    } catch (e) {
      console.warn("ghost-field: WebGL unavailable", e && e.message);
    }
  }
  async _setup() {
    const r = (this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    this.ndc = new THREE.Vector2();
    this.ptr = new THREE.Vector2();
    this._frame = 0;
    this._onMove = (e) => {
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
      const v = new THREE.Vector3(this.ndc.x, this.ndc.y, 0.5)
        .unproject(this.cam)
        .sub(this.cam.position)
        .normalize();
      this.u.uMouse.value.copy(this.cam.position).add(v.multiplyScalar(-this.cam.position.z / v.z));
    };
    this._onLeave = () => this.u.uMouse.value.set(99, 99, 0);
    window.addEventListener("pointermove", this._onMove, { passive: true });
    window.addEventListener("pointerdown", this._onMove, { passive: true });
    document.addEventListener("pointerleave", this._onLeave);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this);
    this._io = new IntersectionObserver((es) => {
      this._vis = es[0].isIntersecting;
    });
    this._io.observe(this);
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('500 44px "JetBrains Mono"'),
          document.fonts.load("700 100px Geologica"),
        ]),
        new Promise((res) => setTimeout(res, 1500)),
      ]);
    } catch (e) {}
    if (!this._init) return;
    this.tex.image = atlas();
    this.tex.needsUpdate = true;
    this.build();
    this.resize();
    this.readColors();
    this._ready = true;
    this.cur = this.targetMorph();
    this.start();
  }
  build() {
    const n = Math.max(300, +this.getAttribute("count") || 2400),
      lay = this.layout;
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
    }
    const g = new THREE.BufferGeometry(),
      rand = new Float32Array(n * 4),
      gl = new Float32Array(n);
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
    this.group.add(this.points);
  }
  resize() {
    if (!this.renderer) return;
    const w = this.clientWidth || 1,
      h = this.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.vw = 2 * 7 * Math.tan(Math.PI / 8) * this.cam.aspect;
  }
  readColors() {
    const cs = getComputedStyle(this);
    const fg = cs.getPropertyValue("--fg").trim(),
      ac = cs.getPropertyValue("--accent-t").trim(),
      al = parseFloat(cs.getPropertyValue("--glyph-a"));
    if (fg) this.u.uColor.value.set(fg);
    if (ac) this.u.uAccent.value.set(ac);
    if (!isNaN(al)) this.u.uAlpha.value = al;
  }
  targetMorph() {
    const track = this.closest("[data-morph-track]");
    if (!track) return +this.getAttribute("morph") || 0;
    if (!this._sp) {
      let p = track.parentElement;
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowY;
        if (o === "auto" || o === "scroll") break;
        p = p.parentElement;
      }
      this._sp = p && p !== document.body ? p : document.scrollingElement;
    }
    const sp = this._sp,
      top = sp === document.scrollingElement ? 0 : sp.getBoundingClientRect().top;
    const span = track.offsetHeight - sp.clientHeight;
    return span > 0
      ? Math.min(1, Math.max(0, (top - track.getBoundingClientRect().top) / span)) * 3
      : 0;
  }
  start() {
    if (this._raf || !this._ready) return;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      this.tick(t);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }
  tick(t) {
    if (this._vis === false) return;
    const cv = this.renderer.domElement,
      pr = this.renderer.getPixelRatio();
    if (
      cv.width !== Math.round((this.clientWidth || 1) * pr) ||
      cv.height !== Math.round((this.clientHeight || 1) * pr)
    )
      this.resize();
    const time = t / 1000,
      u = this.u;
    this.cur += (this.targetMorph() - this.cur) * 0.07;
    const m = this.cur,
      fit = Math.min(1, this.vw / 9.2);
    u.uMorph.value = m;
    u.uTime.value = time;
    u.uFreeze.value = sm(2.4, 2.9, m);
    u.uSize.value = 17 * (0.6 + 0.4 * fit);
    u.uRad.value = 1.1 * Math.max(fit, 0.5);
    let ox = 0,
      sc = fit;
    if (this.layout === "right" && this.vw > 7) {
      const k = 1 - Math.min(1, Math.max(0, m));
      ox = this.vw * 0.2 * k;
      sc = fit * (1 - 0.1 * k);
    }
    this.group.position.x += (ox - this.group.position.x) * 0.08;
    this.group.scale.setScalar(sc);
    this.ptr.lerp(this.ndc, 0.05);
    const rot = this.layout === "wall" && m < 1 ? 0.25 : 1 - sm(1.9, 2.8, m) * 0.92;
    this.group.rotation.y = (Math.sin(time * 0.12) * 0.4 + this.ptr.x * 0.35) * rot;
    this.group.rotation.x = -this.ptr.y * 0.2 * rot;
    if (this._frame++ % 30 === 0) this.readColors();
    this.renderer.render(this.scene, this.cam);
  }
  dispose() {
    this.stop();
    this._init = false;
    this._ready = false;
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerdown", this._onMove);
    document.removeEventListener("pointerleave", this._onLeave);
    this._ro?.disconnect();
    this._io?.disconnect();
    if (this.points) this.points.geometry.dispose();
    this.mat?.dispose();
    this.tex?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.points = this.renderer = null;
  }
}
if (!customElements.get("ghost-field")) customElements.define("ghost-field", GhostField);
