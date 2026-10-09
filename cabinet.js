// The cabinet's parts that are many of the same thing: the marquee bulbs and the six reels; and the sign's words.
// Bulbs are placed once, in em, so they scale with the cabinet and never need placing again.
// Each bulb is three elements: its dim glass (always), its glow in one of three groups (the states chase the groups
// by fading whole groups, three compositor layers instead of fifty), and a red glow for a wrong code.
(() => {
  const SIDE = { left: 5.8, right: 73.7, top: 9.6, bottom: 45.4, count: 13 };      // the cabinet's two bulb columns
  const SIGN = { x: 1.95, y: 1.95, w: 53.1, h: 13.9, r: 1.9, count: 26 };           // a rounded track round the sign plate

  // points spaced evenly along a rounded rectangle, clockwise from the top-left straight
  function aroundRoundRect({ x, y, w, h, r, count }) {
    const straightW = w - 2 * r, straightH = h - 2 * r, arc = (Math.PI / 2) * r;
    const segs = [
      { len: straightW, at: (t) => [x + r + t, y] },
      { len: arc, at: (t) => { const a = -Math.PI / 2 + t / r; return [x + w - r + r * Math.cos(a), y + r + r * Math.sin(a)]; } },
      { len: straightH, at: (t) => [x + w, y + r + t] },
      { len: arc, at: (t) => { const a = t / r; return [x + w - r + r * Math.cos(a), y + h - r + r * Math.sin(a)]; } },
      { len: straightW, at: (t) => [x + w - r - t, y + h] },
      { len: arc, at: (t) => { const a = Math.PI / 2 + t / r; return [x + r + r * Math.cos(a), y + h - r + r * Math.sin(a)]; } },
      { len: straightH, at: (t) => [x, y + h - r - t] },
      { len: arc, at: (t) => { const a = Math.PI + t / r; return [x + r + r * Math.cos(a), y + r + r * Math.sin(a)]; } },
    ];
    const total = segs.reduce((s, g) => s + g.len, 0), pts = [];
    for (let i = 0; i < count; i++) {
      let d = ((i + 0.5) / count) * total;
      for (const g of segs) { if (d <= g.len) { pts.push(g.at(d)); break; } d -= g.len; }
    }
    return pts;
  }

  function sidePoints() {
    const pts = [], { count, top, bottom } = SIDE;
    for (let i = 0; i < count; i++) {
      const y = top + ((bottom - top) * i) / (count - 1);
      pts.push([SIDE.left, y], [SIDE.right, y]);
    }
    pts.push([9.6, SIDE.top], [69.9, SIDE.top]);         // the two corner bulbs where the rail turns under the sign
    return pts;
  }

  function lightUp(host, pts) {
    const groups = { base: [], g0: [], g1: [], g2: [], red: [] };
    pts.forEach(([x, y], i) => {
      const b = `<i class="bulb" style="left:${x.toFixed(2)}em;top:${y.toFixed(2)}em"></i>`;
      groups.base.push(b); groups['g' + (i % 3)].push(b); groups.red.push(b);
    });
    host.innerHTML = `<div class="base">${groups.base.join('')}</div>` +
      ['g0', 'g1', 'g2'].map((g) => `<div class="lit ${g}">${groups[g].join('')}</div>`).join('') +
      `<div class="red">${groups.red.join('')}</div>`;
  }

  function build(root) {
    lightUp(root.querySelector('.lights.top'), aroundRoundRect(SIGN));
    // the side columns: chase order runs down the left and up the right, so the groups travel round the cabinet
    const side = sidePoints();
    lightUp(root.querySelector('.lights.side'), side);

    const host = root.querySelector('.reels');
    const input = host.querySelector('.code');
    const reels = Array.from({ length: 6 }, (_, i) => new Reel(i));
    reels.forEach((r) => host.insertBefore(r.el, input));

    const word = root.querySelector('.word');
    const badge = root.querySelector('.badge');
    const setWord = (text) => {
      if (word.dataset.text === text && word.firstElementChild.textContent) return;
      word.dataset.text = text;
      word.querySelectorAll('span').forEach((s) => (s.textContent = text));
      word.classList.toggle('long', text.length > 6);
    };
    const setBadge = (text) => {
      if (text) { badge.textContent = text; root.dataset.badge = ''; }
      else delete root.dataset.badge;
    };
    setWord('STRYDE');
    return { reels, setWord, setBadge };
  }

  window.Cabinet = { build };
})();
