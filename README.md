# A's Noise Generator

Brown, pink, white, blue, and violet noise, synthesized live in the browser. It never loops, nothing is sent anywhere, and once opened it works fully offline as an installable app (PWA).

## Use it

Open the GitHub Pages URL on your phone and choose **Add to Home Screen** (iOS Safari: Share > Add to Home Screen; Android Chrome: menu > Install app). After the first visit it runs with no connection.

To publish: Settings > Pages > Deploy from branch > `main` / root.

Opening `index.html` straight from disk also works, but offline install needs it served over `https` (or `localhost`).

## Controls

Always visible:

| Control | What it does |
|---|---|
| Noise color | Brown, pink, white, blue, or violet |
| Volume | Overall level |
| Stop after | Sleep timer, fades out over the last minute |

Under **Advanced** (collapsed by default, remembers if you open it):

| Control | What it does |
|---|---|
| Presets | Deep focus, Steady rain, Ocean, Sleep, Airplane cabin |
| Color blend | Slide between neighbouring colors, e.g. mostly brown with some pink |
| Body | Adds low-end weight, like a distant engine |
| Hiss | Rounds off the top end. Far right sounds like it is behind a wall |
| Ear pressure | Trims the deepest rumble, which can feel like pressure with noise cancelling on |
| Movement / Wave speed | Slow rise and fall so the sound feels less static |
| Space | Centered (same in both ears) to wide (different noise per ear) |

For textbook-pure noise, set Body, Hiss, and Ear pressure all the way left.

The page uses neutral colors tinted by the noise you pick. The play button and graph change right away; the background drifts toward the new color over about 10 seconds.

## The noise colors

| Color | Slope | How it is made |
|---|---|---|
| Brown (red) | -6 dB/octave | Leaky integrator of white noise, `br = 0.998 * br + 0.022 * w`. Rolls off near 20 Hz to avoid DC drift |
| Pink | -3 dB/octave | Paul Kellet's refined filter |
| White | flat | `Math.random()` straight through |
| Blue | +3 dB/octave | Pink, differentiated (`p[n] - p[n-1]`) |
| Violet (purple) | +6 dB/octave | White, differentiated (`w[n] - w[n-1]`) |

Each color is scaled to the same RMS level (about 0.19), so switching does not jump in loudness on a meter. Brighter colors can still *sound* louder, because ears are most sensitive around 2 to 5 kHz.

Grey noise is not included: it is defined against a hearing-loudness curve rather than a fixed slope, so there is no single "correct" version to verify.

## How it works

- One independent noise stream per ear plus a shared center stream, mixed by Space.
- Neighbouring colors are blended with an equal-power crossfade.
- Body, Hiss, and Ear pressure are Web Audio biquad filters (low shelf, low pass, high pass). Movement is two slow oscillators at an irrational ratio so the waves never line up the same way twice.
- `sw.js` precaches the page, self-hosted fonts, and icons, then serves them from cache (refreshing in the background when online).

## Accuracy

Two checks, both in `tools/`:

**Math check.** `verify_spectrum.py` runs the same generator math and measures the change per octave.

```
pip install numpy scipy
python tools/verify_spectrum.py
```

| Range (Hz) | Brown | Pink | White | Blue | Violet |
|---|---|---|---|---|---|
| 40 to 80 | -5.9 | -3.4 | -0.3 | +2.7 | +5.8 |
| 80 to 160 | -5.9 | -3.0 | +0.0 | +3.0 | +6.0 |
| 160 to 5120 | -5.8 to -6.1 | -2.9 to -3.1 | -0.1 to +0.1 | +2.9 to +3.1 | +5.9 to +6.1 |
| 5120 to 10240 | -5.6 | -3.1 | -0.0 | +2.5 | +5.5 |
| Target | -6 | -3 | 0 | +3 | +6 |

Blue and violet ease off slightly in the top octave because a one-sample difference is not a perfect differentiator near the Nyquist frequency.

**Browser check.** `pwa_audio_test.mjs` installs the app in headless Chromium, shuts the server down, reloads offline, and records the real audio output after all filters. Given the original single-file app as a baseline, it compares the two spectra octave by octave.

```
npm i -g playwright   # if not installed
node tools/pwa_audio_test.mjs path/to/original/index.html
```

Result against the original app (offline PWA vs. original online):

| Setting | Worst per-octave difference | Overall level difference |
|---|---|---|
| Pure brown | 0.17 dB | -0.25 dB |
| Pure pink | 0.07 dB | -0.01 dB |
| Default settings | 0.17 dB | +0.04 dB |

Those differences are the normal randomness of a 14-second noise sample, not a change in the sound.

## Limits

- Browsers may pause web audio when the screen locks. Audio is routed through a media stream to reduce this, but test it before relying on it for sleep.
- Headphones have their own tuning curve, so what reaches your ears is not perfectly flat. The overall shape is preserved.

## Credits

Fonts: [Fraunces](https://github.com/undercasetype/Fraunces) and [Figtree](https://github.com/erikdkennedy/figtree), both under the SIL Open Font License (see `fonts/`).
