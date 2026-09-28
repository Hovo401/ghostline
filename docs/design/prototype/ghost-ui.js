(function () {
  const G = "ABCDEF0123456789#%&*+=<>/{}[]$@ЖЩЮЯБДФЛΣΩΔλ§±≈";
  const rnd = () => G[(Math.random() * G.length) | 0];
  function adopt(el, keys) {
    keys.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(el, k)) {
        const v = el[k];
        delete el[k];
        el[k] = v;
      }
    });
  }
  class Scramble extends HTMLElement {
    static get observedAttributes() {
      return ["text"];
    }
    get text() {
      return this.getAttribute("text") || "";
    }
    set text(v) {
      this.setAttribute("text", v == null ? "" : String(v));
    }
    get instant() {
      return this.getAttribute("instant");
    }
    set instant(v) {
      this.setAttribute("instant", String(v));
    }
    get delay() {
      return this.getAttribute("delay");
    }
    set delay(v) {
      this.setAttribute("delay", String(v));
    }
    connectedCallback() {
      adopt(this, ["text", "instant", "delay"]);
      this.style.whiteSpace = "pre-wrap";
      this.run();
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._fb);
    }
    attributeChangedCallback(n, o, v) {
      if (o !== v && this.isConnected) this.run();
    }
    run() {
      cancelAnimationFrame(this._raf);
      const t = this.text;
      const off =
        this.getAttribute("instant") === "true" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      clearTimeout(this._fb);
      if (off || !t) {
        this.textContent = t;
        return;
      }
      const dur = Math.min(1300, 380 + t.length * 16),
        dl = +this.getAttribute("delay") || 0;
      const start = performance.now() + dl;
      this.textContent = t.replace(/[^\s]/g, rnd);
      this._fb = setTimeout(
        () => {
          cancelAnimationFrame(this._raf);
          this.textContent = t;
        },
        dur + dl + 150,
      );
      let last = 0;
      const tick = (now) => {
        const p = (now - start) / dur;
        if (p >= 1) {
          this.textContent = t;
          return;
        }
        if (now - last > 45) {
          last = now;
          let out = "";
          for (let i = 0; i < t.length; i++) {
            const c = t[i];
            out += c === " " || c === "\n" || p * 1.25 > i / t.length + 0.2 ? c : rnd();
          }
          this.textContent = out;
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
  }
  class Dots extends HTMLElement {
    connectedCallback() {
      if (this._on) return;
      this._on = true;
      this.style.display = "inline-flex";
      this.style.gap = "4px";
      this.style.alignItems = "center";
      for (let i = 0; i < 3; i++) {
        const s = document.createElement("span");
        Object.assign(s.style, {
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "currentColor",
          display: "block",
        });
        this.appendChild(s);
        s.animate(
          [
            { opacity: 0.25, transform: "translateY(0)" },
            { opacity: 1, transform: "translateY(-3px)" },
            { opacity: 0.25, transform: "translateY(0)" },
          ],
          { duration: 900, delay: i * 150, iterations: Infinity },
        );
      }
    }
  }
  if (!customElements.get("ghost-scramble")) customElements.define("ghost-scramble", Scramble);
  if (!customElements.get("ghost-dots")) customElements.define("ghost-dots", Dots);
})();
