// Effects that are not the input: confetti, the cabinet's shake, the box opening, and a tiny optional sound.
// Confetti pieces are plain elements, each flying one Web Animation sampled from a ballistic path (gravity, drag,
// flutter), so a burst of ninety costs the main thread nothing once it has started.
(() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const COLORS = ['#F2721F', '#FF9A4A', '#1A2238', '#2F6BFF', '#FFC531', '#FBF6EC', '#E0241B', '#2BB673'];

  // the pieces and their flights are made once, in small batches while the page is idle; a burst only moves the
  // launcher to the sign and plays them (no keyframes are built at the moment of the jackpot)
  const pool = { host: null, launcher: null, anims: [], ready: false };
  function prepare(host, count = 72) {
    if (pool.host || calm.matches) return;
    pool.host = host;
    const launcher = (pool.launcher = document.createElement('div'));
    launcher.className = 'launcher';
    host.append(launcher);
    let seed = 7, i = 0;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const g = 2400, dur = 2200, K = 12;
    const batch = (deadline) => {
      for (let n = 0; n < 12 && i < count; n++, i++) {
        const el = document.createElement('i');
        el.style.background = COLORS[i % COLORS.length];
        if (i % 5 === 0) { el.style.width = '7px'; el.style.height = '7px'; el.style.borderRadius = '50%'; }
        launcher.append(el);
        const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.3, sp = 620 + rnd() * 900;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
        const spin = (rnd() - 0.5) * 1440, flip = 360 + rnd() * 900, sway = 20 + rnd() * 40, ph = rnd() * 6.28;
        const sx = (rnd() - 0.5) * 120, sy = (rnd() - 0.5) * 30, d = dur * (0.75 + rnd() * 0.35);
        const frames = [];
        for (let k = 0; k <= K; k++) {
          const t = (k / K) * (d / 1000), drag = 2.2, e = Math.exp(-drag * t);
          // air drag slows the burst, gravity takes over, the piece sways as it flutters down
          const x = (vx / drag) * (1 - e) + Math.sin(ph + t * 7) * sway * Math.min(1, t * 2);
          const y = (vy / drag) * (1 - e) + (g / drag) * (t - (1 - e) / drag) * 0.55;
          frames.push({ transform: `translate(${(sx + x).toFixed(1)}px, ${(sy + y).toFixed(1)}px) rotate(${(spin * t).toFixed(1)}deg) rotateX(${(flip * t).toFixed(1)}deg)`,
            opacity: k > K * 0.8 ? 1 - (k - K * 0.8) / (K * 0.2) : 1 });
        }
        const an = el.animate(frames, { duration: d, delay: (i % 6) * 18, easing: 'linear', fill: 'both' });
        an.cancel();
        an.onfinish = () => an.cancel();
        pool.anims.push(an);
      }
      if (i < count) schedule(batch); else pool.ready = true;
    };
    const schedule = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
    schedule(batch);
  }
  function confetti(x0, y0) {
    if (calm.matches || !pool.ready) return;
    pool.launcher.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    // started a quarter at a time over four frames: eighty pieces appearing in one frame cost that frame its deadline
    const all = pool.anims.slice(), go = () => { all.splice(0, 21).forEach((a) => { a.cancel(); a.play(); }); if (all.length) requestAnimationFrame(go); };
    go();
  }

  function shake(el) {
    if (calm.matches) return;
    el.animate([{ transform: 'none' }, { transform: 'translateX(-1.4em) rotate(-.6deg)' }, { transform: 'translateX(1.2em) rotate(.5deg)' },
      { transform: 'translateX(-.9em)' }, { transform: 'translateX(.6em)' }, { transform: 'translateX(-.3em)' }, { transform: 'none' }],
    { duration: 480, easing: 'cubic-bezier(.36,.07,.19,.97)' });
  }

  // the box: the tape splits, the lid swings up and away, the shoe settles
  function openBox(box) {
    if (box.dataset.open === 'true') return Promise.resolve();
    const lid = box.querySelector('.lid'), img = box.querySelector('img');
    const tl = box.querySelector('.tape.l'), tr = box.querySelector('.tape.r');
    if (calm.matches) {
      return lid.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).finished.then(() => (box.dataset.open = 'true'));
    }
    const ease = 'cubic-bezier(.3,.7,.2,1)';
    tl.animate([{ transform: 'none' }, { transform: 'translateX(-40%) rotate(-8deg)', opacity: 0 }], { duration: 520, easing: ease, fill: 'forwards' });
    tr.animate([{ transform: 'none' }, { transform: 'translateX(40%) rotate(7deg)', opacity: 0 }], { duration: 520, easing: ease, fill: 'forwards' });
    img.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 1400, delay: 260, easing: ease, fill: 'both' });
    const a = lid.animate([
      { transform: 'rotateX(0deg)', opacity: 1 },
      { transform: 'rotateX(-58deg)', opacity: 1, offset: 0.55 },
      { transform: 'rotateX(-96deg)', opacity: 0 },
    ], { duration: 900, delay: 240, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' });
    return a.finished.then(() => { box.dataset.open = 'true'; [tl, tr, img, lid].forEach((el) => el.getAnimations().forEach((x) => x.cancel())); });
  }

  function closeBox(box) {
    box.dataset.open = 'false';
    box.querySelectorAll('.lid, .tape, img').forEach((el) => el.getAnimations().forEach((x) => x.cancel()));
  }

  // sound: off by default; a click when a reel lands, a three-note chime for the jackpot, a low buzz for a wrong code
  const sound = {
    on: false, ctx: null,
    enable(v) { this.on = v; if (v && !this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.on = false; } } if (v) this.ctx?.resume?.(); },
    tone(freq, t0, len, type = 'sine', gain = 0.12) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + len + 0.02);
    },
    tick(i = 0) { if (!this.on || !this.ctx) return; const t = this.ctx.currentTime; this.tone(1800 + i * 90, t, 0.035, 'square', 0.035); this.tone(240, t, 0.05, 'triangle', 0.08); },
    win() { if (!this.on || !this.ctx) return; const t = this.ctx.currentTime; [659, 784, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.32, 'triangle', 0.09)); },
    buzz() { if (!this.on || !this.ctx) return; const t = this.ctx.currentTime; this.tone(110, t, 0.28, 'sawtooth', 0.06); this.tone(104, t + 0.02, 0.28, 'square', 0.03); },
  };

  window.FX = { prepare, confetti, shake, openBox, closeBox, sound };
})();
