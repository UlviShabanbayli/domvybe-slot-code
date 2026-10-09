// STRYDE slot-machine code input — the input, its states, and the page around it.
// The value lives in ONE real <input> (inputmode numeric, autocomplete one-time-code, maxlength 6): the phone's SMS
// autofill, password managers, paste, undo and screen readers all talk to it as to any text field. The reels mirror
// the value: when a character changes, its reel spins onto the new one. The caret is a selection of one character
// (the reel it covers glows), so typing over a reel replaces that digit.
//
//   1 setup and config            5 checking: the verifier, wrong, locked, the jackpot
//   2 fitting the machine         6 resend ring and the drop's clock
//   3 the value → the reels       7 toggles, the keyboard on a phone, the live words
//   4 typing, caret, paste, lever 8 the test API (window.__slot)

// ================================================================================================================
// 1 · setup and config
// ================================================================================================================
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const q = new URLSearchParams(location.search);
  const CONFIG = {
    code: /^\d{6}$/.test(q.get('code') || '') ? q.get('code') : '481927',   // the code the mock verifier accepts
    latency: Math.max(0, +(q.get('latency') ?? 750)),                       // ms the "server" takes to answer
    attempts: 3, cooldown: 30, resend: 30,                                   // tries, lock-out seconds, resend wait
  };

  const otp = $('.otp'), cab = $('.cab', otp), input = $('#otp-input'), drop = $('.drop'), box = $('.box');
  const live = $('.live', otp), alertEl = $('.alert', otp), hint = $('.hint', otp);
  const resendBtn = $('.resend', otp), rTime = $('.r-time', otp), rArc = $('.r-arc', otp), rDesc = $('#resend-t');
  const aText = $('.a-text', otp), again = $('.again', otp);
  const { reels, setWord, setBadge } = Cabinet.build(otp);
  reels.forEach((r) => (r.onland = (reel) => FX.sound.tick(reel.index)));

  let value = '';                 // what the reels show (always the input's sanitised value)
  let state = 'idle';             // idle · checking · error · success · locked
  let attempts = CONFIG.attempts;
  let rejected = null;            // the last code the verifier turned down
  let token = 0;                  // bumps on every change, so a stale auto-submit or lever spin gives up
  let lockedUntil = 0, resendAt = 0, heldUntil = 0;
  const closesAt = performance.now() + (2 * 60 + 14) * 1000;

  // ================================================================================================================
  // 2 · fitting the machine: one em for the whole cabinet, as large as the column and the first screen allow
  // ================================================================================================================
  const BOARD_W = 85.5, FULL_H = 54.5 + 1.4, COMPACT_H = 48.5;
  let lastW = 0, lastH = 0;
  function fit(force) {
    const vw = innerWidth, vh = innerHeight;
    if (!force && vw === lastW && Math.abs(vh - lastH) < 140) return;   // the phone's URL bar coming and going is not a resize
    if (!force && document.activeElement === input && vw === lastW) return;
    lastW = vw; lastH = vh;
    const cols = getComputedStyle(drop).gridTemplateColumns.split(' ').map(parseFloat).filter((n) => n > 0);
    const W = cols.length > 1 ? cols[1] : cols[0] || otp.parentElement.clientWidth;
    const top = otp.getBoundingClientRect().top + scrollY;
    // twice: the row under the cabinet may wrap once the cabinet is narrower, and then it is taller
    for (let pass = 0; pass < 2; pass++) {
      const under = $('.under', otp).offsetHeight + 14;
      const room = vh - top - under - 10;
      let u = Math.min(W / BOARD_W, room / FULL_H, 10.6);
      // under ~600 px wide the tray's words would be too small inside the cabinet: it moves under it, full size
      const compact = u * BOARD_W < 600;
      if (compact) u = Math.min(W / BOARD_W, (room - 74) / COMPACT_H, 10.6);
      u = Math.max(2.4, u);
      otp.classList.toggle('compact', compact);
      otp.style.setProperty('--u', u.toFixed(3) + 'px');
    }
  }
  fit(true);
  addEventListener('resize', () => fit(false));
  document.fonts?.ready.then(() => fit(true));

  // ================================================================================================================
  // 3 · the value → the reels
  // ================================================================================================================
  function render(next, { cascade = false } = {}) {
    const prev = value;
    value = next;
    token++;
    const changed = [];
    for (let i = 0; i < 6; i++) if ((prev[i] || '') !== (next[i] || '')) changed.push(i);
    const many = cascade || changed.length >= 3;
    changed.forEach((i, k) => {
      const ch = next[i] || '';
      if (many) reels[i].spin(ch, { turns: 2 + k * 0.5, dur: 860 + k * 150, delay: k * 70, kick: 12, over: 11 });   // a cascade, landing left to right
      else if (!ch) reels[i].spin('', { dir: 1, turns: 0, min: 140, dur: 560, kick: 0, over: 8 });                // Backspace rolls it back to blank
      else reels[i].spin(ch, { turns: 1, dur: 560 + ((i * 53) % 110), delay: k * 40, kick: 8, over: 9 });          // each reel its own timing
    });
    if (changed.length && state === 'error') setState('idle');
    paintCaret();
    if (next.length === 6 && changed.length) autoSubmit();
  }

  const landed = () => Promise.all(reels.map((r) => (r.run ? r.run.done : true)));
  async function autoSubmit() {
    const t = token;
    await landed();
    if (t !== token || value.length !== 6 || state !== 'idle') return;
    submit();
  }

  // ================================================================================================================
  // 4 · typing, the caret, paste, the lever
  // ================================================================================================================
  const sel = () => [input.selectionStart ?? value.length, input.selectionEnd ?? value.length];
  // the caret is always one character wide (or the end of the code), so a typed digit replaces the reel it is on
  function normalize() {
    if (document.activeElement !== input) return;
    const len = value.length, [s, e] = sel();
    if (e - s > 1) return paintCaret();
    const a = Math.min(s, len, 5);
    const want = a < len ? [a, a + 1] : [len, len];
    if (s !== want[0] || e !== want[1]) input.setSelectionRange(want[0], want[1]);
    paintCaret();
  }
  function paintCaret() {
    const [s, e] = sel(), all = e - s > 1;
    reels.forEach((r, i) => r.el.classList.toggle('active', all ? i >= s && i < e : i === Math.min(s, 5)));
  }
  const locked = () => state === 'checking' || state === 'success' || state === 'locked';

  input.addEventListener('beforeinput', (e) => {
    if (locked()) { e.preventDefault(); return; }
    if (e.inputType === 'insertText' && e.data && /\D/.test(e.data)) { e.preventDefault(); say('Digits only.', { visible: true }); }
  });
  input.addEventListener('input', (e) => {
    const raw = input.value, clean = raw.replace(/\D/g, '').slice(0, 6);
    if (clean !== raw) { const c = Math.min(sel()[0], clean.length); input.value = clean; input.setSelectionRange(c, c); }
    render(clean, { cascade: e.inputType === 'insertFromPaste' || e.inputType === 'insertReplacementText' || !e.inputType });
    normalize();
  });
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    applyPaste(e.clipboardData?.getData('text') || '');
  });
  function applyPaste(text) {
    if (locked()) return false;
    const d = (text || '').replace(/\D/g, '');
    if (!d) { say('No digits on the clipboard.', { visible: true }); return false; }
    const [s, e] = sel();
    const next = d.length >= 6 ? d.slice(0, 6) : (value.slice(0, s) + d + value.slice(e)).slice(0, 6);
    input.value = next;
    const c = Math.min(next.length, d.length >= 6 ? 6 : s + d.length);
    input.setSelectionRange(c, c);
    render(next, { cascade: true });
    normalize();
    say(d.length >= 6 ? 'Code pasted.' : `${d.length} digit${d.length > 1 ? 's' : ''} pasted.`);
    return true;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    const len = value.length, [s, end] = sel();
    let a = null;
    if (e.key === 'ArrowLeft') a = end - s > 1 ? s : Math.max(0, Math.min(s, len) - 1);
    else if (e.key === 'ArrowRight') a = end - s > 1 ? Math.min(end, len) : Math.min(len, s + 1);
    else if (e.key === 'Home' || e.key === 'ArrowUp') a = 0;
    else if (e.key === 'End' || e.key === 'ArrowDown') a = len;
    if (a === null || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    a = Math.min(a, len);
    input.setSelectionRange(a, a < len ? a + 1 : a);
    normalize();
  });
  // a tap or click on a reel puts the caret on it (the browser places its own caret first, so this runs after)
  input.addEventListener('click', (e) => {
    if (locked()) return;
    const i = reels.findIndex((r) => { const b = r.el.getBoundingClientRect(); return e.clientX < b.right + 6; });
    const a = Math.min(i < 0 ? 5 : i, value.length);
    input.setSelectionRange(a, a < value.length ? a + 1 : a);
    normalize();
  });
  document.addEventListener('selectionchange', () => { if (document.activeElement === input) normalize(); });

  let pointerFocus = false;
  addEventListener('pointerdown', () => (pointerFocus = true), true);
  addEventListener('keydown', () => (pointerFocus = false), true);
  input.addEventListener('focus', () => { otp.classList.add('focused'); otp.classList.toggle('focus-ring', !pointerFocus); requestAnimationFrame(normalize); keepInView(); });
  input.addEventListener('blur', () => otp.classList.remove('focused', 'focus-ring'));

  // the Paste code chip: the Clipboard API, which asks for permission (or shows the browser's own Paste button)
  $('.paste', otp).addEventListener('click', async () => {
    if (locked()) return;
    if (!navigator.clipboard?.readText) { say('Paste is not available here — long-press the reels and choose Paste.', { visible: true }); input.focus(); return; }
    try {
      const perm = await navigator.permissions?.query({ name: 'clipboard-read' }).catch(() => null);
      if (perm?.state === 'denied') throw new DOMException('Clipboard blocked', 'NotAllowedError');
      const text = await navigator.clipboard.readText();
      if (!/\d/.test(text)) { say('No code on your clipboard — copy the 6 digits from the message first.', { visible: true }); input.focus(); return; }
      input.focus({ preventScroll: true });
      applyPaste(text);
    } catch {
      say(`The browser blocked the clipboard. Press ${/Mac|iP/.test(navigator.platform) ? '⌘V' : 'Ctrl+V'} or long-press the reels and choose Paste.`, { visible: true, assertive: true });
      input.focus();
    }
  });

  // the lever: every reel spins at once and lands on the code, left to right, then the code is checked
  const lever = new Lever(otp, () => {
    if (state === 'checking') return;
    if (state === 'locked') { say(`Locked — try again in ${Math.ceil((lockedUntil - performance.now()) / 1000)} s.`, { visible: true }); return; }
    if (state === 'error') setState('idle');
    const t = ++token;
    const spins = reels.map((r, i) => r.spin(value[i] || '', { turns: 2 + i * 0.5, dur: 1050 + i * 170, delay: i * 30, kick: 16, over: 12 }));
    if (state === 'success') { celebrate(); return; }
    Promise.all(spins).then(() => { if (t === token) submit(); });
  });

  // ================================================================================================================
  // 5 · checking: the verifier, a wrong code, the lock-out, the jackpot
  // ================================================================================================================
  const verify = (code) => new Promise((ok) => setTimeout(() => ok(code === CONFIG.code), CONFIG.latency));

  function setState(s, badge = '') {
    state = s;
    otp.dataset.state = s;
    setBadge(badge);
    input.readOnly = locked();
    input.setAttribute('aria-invalid', s === 'error' ? 'true' : 'false');
  }

  async function submit() {
    if (state === 'checking' || state === 'locked') return;
    if (state === 'success') return celebrate();
    if (value.length < 6) {
      const left = 6 - value.length;
      say(`Enter all 6 digits — ${left} to go.`, { visible: true });
      FX.shake(cab);
      input.focus({ preventScroll: true });
      input.setSelectionRange(value.length, value.length);
      return;
    }
    if (value === rejected) { say('That code was already turned down — change a digit or resend.', { visible: true }); FX.shake(cab); return; }
    const code = value, t = token;
    setState('checking', 'Checking');
    say('Checking the code…');
    const ok = await verify(code);
    if (state !== 'checking' || t !== token) return;
    ok ? win() : wrong(code);
  }

  function wrong(code) {
    attempts--;
    rejected = code;
    FX.shake(cab);
    FX.sound.buzz();
    if (attempts <= 0) return lock();
    setState('error', 'Error');
    paintAttempts();
    say(`Wrong code. ${attempts} attempt${attempts > 1 ? 's' : ''} left.`, { visible: true, assertive: true });
    if (document.activeElement === input) input.setSelectionRange(0, value.length);   // the next digit replaces the whole code
    paintCaret();
  }

  function lock() {
    lockedUntil = performance.now() + CONFIG.cooldown * 1000;
    setState('locked', `Locked ${clock(CONFIG.cooldown)}`);
    paintAttempts();
    say(`Too many wrong codes. Try again in ${CONFIG.cooldown} seconds.`, { visible: true, assertive: true });
    input.blur();
  }
  function unlock() {
    lockedUntil = 0;
    attempts = CONFIG.attempts;
    rejected = null;
    setState('idle');
    input.value = '';
    render('', { cascade: true });
    paintAttempts();
    say('You can try again.', { visible: true });
  }

  // the jackpot, spread over three frames so no single frame does all of it: the marquee, then the confetti, then the box
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function win() {
    setState('success', 'Drop unlocked');
    input.blur();
    FX.sound.win();
    await nextFrame();
    setWord('JACKPOT');
    await nextFrame();
    burst();
    await nextFrame(); await nextFrame();
    paintAttempts();
    say('Code accepted. Jackpot — the drop is unlocked.', { visible: true, assertive: true });
    await nextFrame();
    heldUntil = performance.now() + 10 * 60 * 1000;
    again.hidden = false;
    $('.cap-title', box).textContent = 'Unlocked — Runner 01 “Blaze”';
    await nextFrame();
    await FX.openBox(box);
    const r = box.getBoundingClientRect();
    if (r.top < 0 || r.bottom > (visualViewport?.height ?? innerHeight)) box.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'center' });
  }
  function burst() {
    const s = $('.sign', otp).getBoundingClientRect();
    FX.confetti(s.left + s.width / 2, s.top + s.height * 0.6);
  }
  // the lever after the win: the reels spin for fun, the confetti flies again a moment later
  function celebrate() {
    FX.sound.win();
    setTimeout(burst, 90);
  }

  // back to the start (the Reset demo button), spread over three frames like the jackpot
  async function reset() {
    token++;
    reels.forEach((r) => r.stop());
    attempts = CONFIG.attempts; rejected = null; lockedUntil = 0; heldUntil = 0;
    setState('idle');
    await nextFrame();
    setWord('STRYDE');
    await nextFrame();
    FX.closeBox(box);
    await nextFrame();
    input.value = '';
    render('', { cascade: true });
    await nextFrame();
    paintAttempts();
    $('.cap-title', box).textContent = 'Runner 01 “Blaze”';
    $('.cap-text', box).textContent = 'Taped shut until the code is right.';
    again.hidden = true;
    startResend();
  }
  again.addEventListener('click', () => { input.focus({ preventScroll: true }); reset(); });

  function paintAttempts() {
    aText.textContent = state === 'locked' ? `Locked · ${clock((lockedUntil - performance.now()) / 1000)}`
      : state === 'success' ? 'Code accepted'
      : `${attempts} attempt${attempts === 1 ? '' : 's'} left`;
  }

  // ================================================================================================================
  // 6 · the resend ring and the drop's clock (one timer, the DOM touched only when a second changes)
  // ================================================================================================================
  const clock = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  function startResend() { resendAt = performance.now() + CONFIG.resend * 1000; resendBtn.setAttribute('aria-disabled', 'true'); shown.r = null; tick(); }
  resendBtn.addEventListener('click', () => {
    if (resendBtn.getAttribute('aria-disabled') === 'true') { say(`You can ask for a new code in ${clock((resendAt - performance.now()) / 1000)}.`, { visible: true }); return; }
    if (state === 'success') return;
    resendBtn.setAttribute('aria-disabled', 'true');
    say('Sending a new code…', { visible: true });
    setTimeout(() => {
      if (state !== 'locked') { attempts = CONFIG.attempts; rejected = null; if (state === 'error') setState('idle'); paintAttempts(); }
      startResend();
      say('A new code is on its way.', { visible: true });
    }, 600);
  });

  const shown = { r: null, c: null, l: null, h: null };
  const closesEl = $('.closes-t');
  function tick() {
    const now = performance.now();
    const rs = Math.max(0, Math.ceil((resendAt - now) / 1000));
    if (rs !== shown.r) {
      shown.r = rs;
      rTime.textContent = clock(rs);
      rArc.style.strokeDashoffset = (100 * (1 - rs / CONFIG.resend)).toFixed(2);
      rDesc.textContent = rs > 0 ? `available in ${rs} seconds` : '';
      if (rs === 0 && resendBtn.getAttribute('aria-disabled') === 'true') resendBtn.setAttribute('aria-disabled', 'false');
    }
    const cs = Math.max(0, Math.ceil((closesAt - now) / 1000));
    if (cs !== shown.c) { shown.c = cs; closesEl.textContent = `${String(Math.floor(cs / 60)).padStart(2, '0')}:${String(cs % 60).padStart(2, '0')}`; }
    if (state === 'locked') {
      const ls = Math.ceil((lockedUntil - now) / 1000);
      if (ls <= 0) unlock();
      else if (ls !== shown.l) { shown.l = ls; setBadge(`Locked ${clock(ls)}`); paintAttempts(); }
    }
    if (heldUntil) {
      const hs = Math.max(0, Math.ceil((heldUntil - now) / 1000));
      if (hs !== shown.h) { shown.h = hs; $('.cap-text', box).textContent = `Your pair is held for ${clock(hs)}.`; }
    }
  }
  setInterval(tick, 250);
  startResend();
  if (document.readyState === 'complete') FX.prepare($('.confetti')); else addEventListener('load', () => FX.prepare($('.confetti')));

  // ================================================================================================================
  // 7 · toggles, the keyboard on a phone, the live words
  // ================================================================================================================
  const maskBtn = $('.mask', otp), soundBtn = $('.sound', otp);
  maskBtn.addEventListener('click', () => {
    const on = !otp.classList.contains('masked');
    otp.classList.toggle('masked', on);
    maskBtn.setAttribute('aria-pressed', String(on));
    maskBtn.querySelector('span').textContent = on ? 'Show digits' : 'Hide digits';
    input.style.webkitTextSecurity = on ? 'disc' : '';
  });
  soundBtn.addEventListener('click', () => {
    const on = soundBtn.getAttribute('aria-pressed') !== 'true';
    FX.sound.enable(on);
    soundBtn.setAttribute('aria-pressed', String(on && FX.sound.on));
    soundBtn.querySelector('span').textContent = FX.sound.on ? 'Sound on' : 'Sound off';
    if (FX.sound.on) FX.sound.tick(2);
  });
  $('.cta').addEventListener('click', (e) => { e.preventDefault(); otp.scrollIntoView({ block: 'center', behavior: calm.matches ? 'auto' : 'smooth' }); input.focus({ preventScroll: true }); });

  // the phone's keyboard covers the bottom of the screen: keep the whole machine above it
  const vv = window.visualViewport;
  const shownKb = { open: false, kb: 0 };
  function keepInView() {
    if (!vv) return;
    const kb = Math.round(Math.max(0, innerHeight - vv.height)), open = kb > 120;
    // only when it changes: a custom property set on <html> restyles the whole page
    if (open !== shownKb.open || (open && kb !== shownKb.kb)) {
      shownKb.open = open; shownKb.kb = kb;
      document.body.style.paddingBottom = open ? kb + 'px' : '';
    }
    if (kb <= 120 || document.activeElement !== input) return;
    const r = otp.getBoundingClientRect(), top = vv.offsetTop + 8, bottom = vv.offsetTop + vv.height - 8;
    if (r.top < top || r.bottom > bottom) scrollBy({ top: r.top - top, behavior: 'auto' });
  }
  vv?.addEventListener('resize', keepInView);

  const HINT = hint.textContent;
  let hintTimer = 0;
  function say(msg, { visible = false, assertive = false } = {}) {
    const el = assertive ? alertEl : live;
    el.textContent = '';
    setTimeout(() => (el.textContent = msg), 40);   // a fresh text node each time, so the same words are read again
    if (visible) { hint.textContent = msg; clearTimeout(hintTimer); hintTimer = setTimeout(() => (hint.textContent = HINT), 4200); }
  }

  // a value the browser restored (back button, autofill before the script ran)
  if (input.value) { const v = input.value.replace(/\D/g, '').slice(0, 6); input.value = v; render(v, { cascade: true }); }
  paintCaret();

  // ================================================================================================================
  // 8 · the test API: the same paths a person takes (the input's own events, the lever's own pull)
  // ================================================================================================================
  window.__slot = {
    config: CONFIG,
    ready: (document.fonts?.ready || Promise.resolve()).then(() => new Promise((r) => requestAnimationFrame(() => r()))),
    state: () => ({ value, state, attempts, selection: sel(), syms: reels.map((r) => Reel.SYMBOLS[r.sym]), spinning: reels.filter((r) => r.busy()).length,
      compact: otp.classList.contains('compact'), u: parseFloat(otp.style.getPropertyValue('--u')), masked: otp.classList.contains('masked'), boxOpen: box.dataset.open === 'true' }),
    idle: () => landed().then(() => new Promise((r) => { const w = () => (state === 'checking' ? setTimeout(w, 50) : r()); w(); })),
    focus: () => input.focus(),
    type(text) {
      input.focus({ preventScroll: true });
      for (const d of String(text)) {
        normalize();
        const [s, e] = sel();
        if (!input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: d, bubbles: true, cancelable: true }))) continue;
        input.setRangeText(d, s, e, 'end');
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: d, bubbles: true }));
      }
    },
    backspace() {
      input.focus({ preventScroll: true });
      let [s, e] = sel();
      if (s === e) { if (!s) return; s--; }
      if (!input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }))) return;
      input.setRangeText('', s, e, 'end');
      input.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
    },
    paste(text) {
      input.focus({ preventScroll: true });
      const dt = new DataTransfer(); dt.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    pull: () => lever.pull(),
    submit: () => submit(),
    reset,
    setCode(c) { if (/^\d{6}$/.test(c)) CONFIG.code = c; },
  };
})();
