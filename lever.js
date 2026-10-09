// The lever: pull it down (drag) or just click it, and it submits. It is a <button>, so Enter and Space pull it too.
// A front view of a lever swinging towards you: the rod folds about its pivot (scaleY = cos of the swing angle) and the
// ball rides its tip, growing a little as it comes closer. Dragging sets the pose directly; letting go (and the
// automatic pull) are Web Animations sampled from the same pose function, so the spring back runs on the compositor.
(() => {
  const MAX = 115 * Math.PI / 180;    // the swing at the bottom of a pull
  const L = 26.8;                     // em: pivot → ball centre
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  const pose = (p) => {
    const a = p * MAX, c = Math.cos(a);
    return { rod: `scaleY(${c.toFixed(4)})`, ball: `translateY(${(L * (1 - c)).toFixed(3)}em) scale(${(1 + 0.2 * Math.sin(Math.max(0, a))).toFixed(4)})` };
  };

  class Lever {
    constructor(root, onPull) {
      this.arm = root.querySelector('.arm');
      this.rod = root.querySelector('.rod');
      this.ball = root.querySelector('.ball');
      this.onPull = onPull;
      this.p = 0;
      this.anims = [];
      this.drag = null;
      this.dragged = false;
      this.arm.addEventListener('pointerdown', (e) => this.down(e));
      this.arm.addEventListener('pointermove', (e) => this.move(e));
      this.arm.addEventListener('pointerup', (e) => this.up(e));
      this.arm.addEventListener('pointercancel', (e) => this.up(e, true));
      this.arm.addEventListener('click', (e) => {
        if (this.dragged) { this.dragged = false; return; }
        e.preventDefault();
        this.pull();
      });
    }

    set(p) {
      this.p = p;
      const s = pose(p);
      this.rod.style.transform = s.rod;
      this.ball.style.transform = s.ball;
    }

    stopAnims() { this.anims.forEach((a) => { a.commitStyles?.(); a.cancel(); }); this.anims = []; }

    // play p(t) for t in 0…1 over ms, sampled into keyframes for the rod and the ball
    play(fn, ms) {
      this.stopAnims();
      const K = 28, rod = [], ball = [];
      for (let i = 0; i <= K; i++) { const s = pose(fn(i / K)); rod.push({ transform: s.rod }); ball.push({ transform: s.ball }); }
      const o = { duration: ms, easing: 'linear', fill: 'forwards' };
      const a = this.rod.animate(rod, o), b = this.ball.animate(ball, o);
      this.anims = [a, b];
      const end = fn(1);
      return a.finished.then(() => { if (this.anims[0] === a) { this.set(end); this.stopAnims(); } }).catch(() => {});
    }

    // let go: a damped spring back up, with a small bounce past the top
    release(from) {
      if (calm.matches) { this.set(0); return Promise.resolve(); }
      return this.play((t) => from * Math.exp(-5.2 * t) * Math.cos(2 * Math.PI * 1.25 * t) * (1 - t ** 6), 720);
    }

    async pull() {
      if (this.drag) return;
      if (calm.matches) { this.fire(); return; }
      this.dragged = false;
      const from = this.p;
      await this.play((t) => from + (1 - from) * (t * t * (2.2 - 1.2 * t)), 230);
      this.fire();
      await this.release(1);
    }

    fire() { this.onPull?.(); }

    down(e) {
      if (e.button !== 0) return;
      this.stopAnims();
      this.arm.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, y0: e.clientY, span: Math.max(60, (this.arm.getBoundingClientRect().height) * 1.05), fired: false, moved: false, p0: this.p };
      this.dragged = false;
    }

    move(e) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y0;
      if (Math.abs(dy) > 4) d.moved = true;
      if (!d.moved) return;
      const p = Math.min(1, Math.max(0, d.p0 + dy / d.span));
      this.set(p);
      if (p >= 0.94 && !d.fired) { d.fired = true; this.fire(); }
    }

    up(e, cancelled) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.moved) return;                       // a plain click: the click handler pulls
      this.dragged = true;
      setTimeout(() => (this.dragged = false), 0);
      if (!cancelled && !d.fired && this.p > 0.55) { d.fired = true; this.fire(); }
      this.release(this.p);
    }
  }

  window.Lever = Lever;
})();
