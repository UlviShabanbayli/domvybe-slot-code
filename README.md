# Slot machine code input — UI component

**[Live demo](https://domvybe.com/components/slot-code/)** · [Step-by-step tutorial](https://domvybe.com/library/slot-code/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-slot-code/releases/latest/download/slot-code-source.zip)

A one-time-code input built as a slot machine: six chrome reels mirror one real input, each digit spins its reel onto the number, the lever submits, and the right code hits the jackpot.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the component and its stage
- `style.css` — the look (colours are variables at the top)
- `reel.js` — one reel: a 3D drum of eleven faces and its spin curve (kick back, run, overshoot, settle) as Web Animations
- `cabinet.js` — the cabinet: the bulbs, the six reels and the sign's words
- `lever.js` — the lever: drag it down, or click it, Enter or Space
- `fx.js` — the effects: confetti, the shake, the shoe box opening and the sounds
- `app.js` — the value, the caret, paste, the verifier and its states (error, locked, jackpot), resend and the fit
- `img` — the shoe box, cropped from a concept image generated with Google Gemini (a fictional brand and product)

STRYDE and its sneaker are made up. The shoe box picture in `img/` is cropped from a concept image generated with
Google Gemini. The verifier is a mock: the right code is `481927` (`?code=123456` sets another, `?latency=ms` its
delay); put your own request in place of `verify()` in `app.js`.

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
