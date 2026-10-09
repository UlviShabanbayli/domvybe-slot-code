// One reel: a real 3D cylinder of eleven faces (a blank, then 0–9) that turns about its horizontal axis.
// Every spin is a Web Animation on the drum's transform (plus two opacities for the motion blur), so it runs on the
// compositor: typing, pasting or pulling the lever never needs the main thread while the reels turn.
//
// How a spin moves (spinCurve): a small kick backwards, a hard pull up to speed, a long coast that slows down,
// a stop just past the digit, and a damped spring back onto it — a slot reel hitting its detent.
// The curve is sampled into a CSS linear() easing; the same function tells where an interrupted reel is right now.
(() => {
  const SYMBOLS = ['–', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const N = SYMBOLS.length, STEP = 360 / N;
  const FACE = 9;                                        // em: one face's height
  const R = FACE / 2 / Math.tan(Math.PI / N);            // em: the drum's radius, so eleven faces close the circle
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const mod = (a, n) => ((a % n) + n) % n;
  const tf = (deg) => `translateZ(${-R}em) rotateX(${deg}deg)`;
  const symOf = (ch) => (ch === '' || ch == null ? 0 : SYMBOLS.indexOf(ch));

  // the shape of a spin, in degrees travelled (0 → delta) for u in 0…1. The speed profile of the main run is the same
  // for every spin, so it is integrated once.
  const M = 64, P = [0];
  {
    const speed = (s) => (s < 0.16 ? Math.sin((s / 0.16) * Math.PI / 2) : s < 0.38 ? 1 : Math.pow((1 - s) / 0.62, 1.6));
    let acc = 0;
    for (let i = 1; i <= M; i++) { acc += speed((i - 0.5) / M) / M; P.push(acc); }
    for (let i = 0; i <= M; i++) P[i] /= acc;
  }
  const main = (s) => { const x = s * M, i = Math.min(M - 1, Math.floor(x)); return P[i] + (P[i + 1] - P[i]) * (x - i); };
  function spinCurve(delta, kick, over) {
    const uk = kick ? 0.1 : 0, us = 0.8, zeta = 4.4, w = 2 * Math.PI * 1.1;
    return (u) => {
      if (u <= 0) return 0;
      if (u >= 1) return delta;
      if (u < uk) return -kick * Math.sin((u / uk) * Math.PI / 2);
      if (u < us) return -kick + (delta + over + kick) * main((u - uk) / (us - uk));
      const t = (u - us) / (1 - us);                     // released from rest, past the digit: a damped spring back
      return delta + over * Math.exp(-zeta * t) * (Math.cos(w * t) + (zeta / w) * Math.sin(w * t)) * (1 - t ** 4);
    };
  }

  const SAMPLES = 36, BLUR = 14;
  const easingOf = (f, delta) => `linear(${Array.from({ length: SAMPLES + 1 }, (_, i) => +(f(i / SAMPLES) / delta).toFixed(4)).join(', ')})`;

  class Reel {
    constructor(index) {
      this.index = index;
      this.angle = 0;            // degrees, the drum's rest angle (a symbol s rests at s × STEP)
      this.sym = 0;
      this.run = null;           // the spin in flight: { anims, from, to, f, delay, dur, done }
      this.el = document.createElement('div');
      this.el.className = 'reel';
      this.el.dataset.i = index;
      const faces = SYMBOLS.map((s, i) =>
        `<div class="face${i ? '' : ' blank'}" style="transform:rotateX(${-i * STEP}deg) translateZ(${R}em)"><b>${s}</b><i>●</i></div>`).join('');
      const strip = SYMBOLS.concat(SYMBOLS).map((s) => `<b>${s}</b>`).join('');
      this.el.innerHTML = `<div class="win"><div class="persp"><div class="drum">${faces}</div></div>` +
        `<div class="smear"><div class="strip">${strip}</div></div><i class="shade"></i></div>`;
      this.persp = this.el.querySelector('.persp');
      this.drum = this.el.querySelector('.drum');
      this.smear = this.el.querySelector('.smear');
      this.strip = this.el.querySelector('.strip');
      this.drum.style.transform = tf(0);
    }

    // where the drum is right now, even in the middle of a spin
    now() {
      const r = this.run;
      if (!r) return this.angle;
      const t = (r.anims[0].currentTime ?? 0) - r.delay;
      const u = Math.min(1, Math.max(0, t / r.dur));
      return r.from + r.dir * r.f(u);
    }

    busy() { return !!this.run; }

    stop() {
      const r = this.run; if (!r) return;
      const a = this.now();
      this.drum.style.transform = tf(a);
      this.angle = a;
      r.anims.forEach((x) => x.cancel());
      r.resolve(false);
      this.run = null;
    }

    // land on a symbol at once (reduced motion, reset)
    set(ch) {
      this.stop();
      this.sym = symOf(ch);
      this.angle = this.sym * STEP;
      this.drum.style.transform = tf(this.angle);
      return Promise.resolve(true);
    }

    // spin onto a symbol. dir −1 rolls the faces downwards (a normal spin), +1 rolls them back up (Backspace).
    // min: the least it may travel (degrees), so a reel one face away still visibly rolls
    spin(ch, { turns = 1, dir = -1, dur = 650, delay = 0, kick = 8, over = 9, min = 0 } = {}) {
      const sym = symOf(ch);
      if (calm.matches) { this.set(ch); return Promise.resolve(true); }
      const from = this.now();
      this.stop();
      const base = sym * STEP;
      let to;
      if (dir < 0) { const lim = from - turns * 360; to = lim - mod(lim - base, 360); }
      else { const lim = from + turns * 360; to = lim + mod(base - lim, 360); }
      if (Math.abs(to - from) < min) to += dir * 360;
      const delta = Math.abs(to - from);
      if (delta < 0.5) { this.sym = sym; return Promise.resolve(true); }
      const f = spinCurve(delta, kick, over);
      const opts = { duration: dur, delay, fill: 'both', easing: easingOf(f, delta) };
      const anims = [this.drum.animate([{ transform: tf(from) }, { transform: tf(to) }], opts)];

      // motion blur: how fast the drum turns (degrees per ms) at a few samples → the smear's strength
      const peak = { v: 0 }, blur = [];
      for (let i = 0; i <= BLUR; i++) {
        const u0 = Math.max(0, (i - 0.5) / BLUR), u1 = Math.min(1, (i + 0.5) / BLUR);
        const v = Math.abs(f(u1) - f(u0)) / ((u1 - u0) * dur);
        peak.v = Math.max(peak.v, v);
        blur.push(Math.min(1, Math.max(0, (v - 0.35) / 0.9)));
      }
      if (peak.v > 0.45) {
        const lin = { duration: dur, delay, fill: 'both', easing: 'linear' };
        anims.push(this.smear.animate(blur.map((b) => ({ opacity: +(b * 0.92).toFixed(3) })), lin));
        anims.push(this.persp.animate(blur.map((b) => ({ opacity: +(1 - b * 0.55).toFixed(3) })), lin));
        // the smear column slides at the drum's top speed, the way the faces move (downwards when dir is −1)
        const cycle = N * FACE, period = Math.max(120, 360 / peak.v);
        const a = dir < 0 ? -cycle : 0, b = dir < 0 ? 0 : -cycle;
        anims.push(this.strip.animate([{ transform: `translateY(${a}em)` }, { transform: `translateY(${b}em)` }],
          { duration: period, iterations: Math.ceil((dur + delay) / period) + 1, easing: 'linear' }));
      }

      let resolve;
      const done = new Promise((r) => (resolve = r));
      const run = (this.run = { anims, from, to, f, dir, delay, dur, resolve, done });
      this.sym = sym;
      anims[0].onfinish = () => {
        if (this.run !== run) return;
        this.angle = mod(to, 360);
        this.drum.style.transform = tf(this.angle);
        anims.forEach((x) => x.cancel());
        this.run = null;
        resolve(true);
        this.onland?.(this);
      };
      return done;
    }
  }

  Reel.SYMBOLS = SYMBOLS;
  window.Reel = Reel;
})();
