# Noise Generator

A single-page pink and brown noise generator. The noise is synthesized live in the browser, so it never loops, and nothing is downloaded or sent anywhere.

## Use it

Open `index.html` in a browser, or enable GitHub Pages (Settings > Pages > Deploy from branch > `main` / root) and open the published URL on your phone.

## Controls

| Control | What it does |
|---|---|
| Color | Brown (deeper) to pink (airier), with blends in between |
| Body | Adds low-end weight, like a distant engine |
| Hiss | Rounds off the top end. Far right sounds like it is behind a wall |
| Ear pressure | Trims the deepest rumble, which can feel like pressure with noise cancelling on |
| Movement / Wave speed | Slow rise and fall so the sound feels less static |
| Space | Centered (same in both ears) to wide (different noise per ear) |
| Stop after | Sleep timer, fades out over the last minute |

For textbook-pure noise, set Body, Hiss, and Ear pressure all the way left.

## How it works

- White noise from `Math.random()`, one independent stream per ear plus a shared center stream (mixed by Space).
- **Pink:** Paul Kellet's refined filter.
- **Brown:** leaky integrator, `br = 0.998 * br + 0.022 * w`. Stays at -6 dB/octave down to about 40 Hz and rolls off near 20 Hz to avoid DC drift.
- Body, Hiss, and Ear pressure are Web Audio biquad filters (low shelf, low pass, high pass). Movement is two slow oscillators at an irrational ratio so the waves never line up the same way twice.

## Accuracy

`tools/verify_spectrum.py` runs the same generator math and measures the drop per octave.

```
pip install numpy scipy
python tools/verify_spectrum.py
```

Measured results:

| Range | Pink | Brown |
|---|---|---|
| 40 to 80 Hz | -3.4 | -6.0 |
| 80 to 160 Hz | -3.0 | -5.9 |
| 160 to 320 Hz | -3.1 | -6.0 |
| 320 Hz and up | -2.9 to -3.1 | -5.5 to -6.1 |
| Target | -3 | -6 |

## Limits

- Browsers may pause web audio when the screen locks. Audio is routed through a media stream to reduce this, but test it before relying on it for sleep.
- Headphones have their own tuning curve, so what reaches your ears is not perfectly flat. The overall shape is preserved.
