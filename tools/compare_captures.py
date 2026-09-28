"""Analyse audio captured by tools/pwa_audio_test.mjs.

Checks, per capture, the dB-per-octave slope against the textbook target, and,
when baseline captures exist, that the new app's spectrum matches the baseline
octave by octave. Octave bands (not narrow bands) keep random-noise variance low.
"""
import json, sys, os
import numpy as np
from scipy.signal import welch

TARGET = {"brown": -6, "pink": -3, "white": 0, "blue": 3, "violet": 6}
CENTERS = [63, 125, 250, 500, 1000, 2000, 4000, 8000]
SLOPE_TOL = 0.75      # dB per octave, vs textbook
MATCH_TOL = 0.5       # dB per octave band, new vs baseline

d = sys.argv[1]
idx = json.load(open(os.path.join(d, "index.json")))
fail = False

def load(tag, name):
    L = np.fromfile(os.path.join(d, f"{tag}-{name}.L.f32"), dtype=np.float32)
    R = np.fromfile(os.path.join(d, f"{tag}-{name}.R.f32"), dtype=np.float32)
    return L, R

def octave_levels(x, sr):
    f, p = welch(x, sr, nperseg=2**15)
    # power per Hz averaged across each octave, in dB. For an x dB/octave spectrum the
    # step between neighbouring octaves is x dB.
    return np.array([10 * np.log10(p[(f >= c / 2**.5) & (f < c * 2**.5)].mean()) for c in CENTERS])

def check(ok, msg):
    global fail
    print(("PASS " if ok else "FAIL ") + msg)
    fail |= not ok

levels = {}
for e in idx:
    L, R = load(e["tag"], e["name"])
    lv = (octave_levels(L, e["sr"]) + octave_levels(R, e["sr"])) / 2
    levels[(e["tag"], e["name"])] = lv
    rms = float(np.sqrt(np.mean(np.concatenate([L, R]) ** 2)))
    if not np.isfinite(lv).all() or rms < 1e-4:
        check(False, f"{e['tag']}/{e['name']}: no audio captured (rms {rms:.2e})")
        continue
    if e["name"] in TARGET:
        steps = np.diff(lv)
        t = TARGET[e["name"]]
        # Top octave is shaped by the app's gentle 18 kHz low-pass (Hiss at 0) and, for
        # blue/violet, the differentiator easing off near Nyquist, so judge 63 Hz to 4 kHz.
        core = steps[:-1]
        print(f"{e['tag']}/{e['name']:<6} rms {rms:.3f}  steps " + " ".join(f"{s:+.1f}" for s in steps) + f"  (target {t:+d})")
        check(np.all(np.abs(core - t) <= SLOPE_TOL), f"{e['tag']}/{e['name']}: every octave 63 Hz-4 kHz within {SLOPE_TOL} dB of {t:+d} dB/oct (mean {core.mean():+.2f})")
    else:
        print(f"{e['tag']}/{e['name']:<6} rms {rms:.3f}  levels " + " ".join(f"{v:.1f}" for v in lv - lv[4]))

for (tag, name), lv in levels.items():
    if tag != "pwa" or ("base", name) not in levels:
        continue
    a, b = lv - lv[4], levels[("base", name)] - levels[("base", name)][4]  # normalise at 1 kHz
    diff = a - b
    print(f"pwa vs base {name:<7} diff per octave " + " ".join(f"{x:+.2f}" for x in diff))
    check(np.all(np.abs(diff) <= MATCH_TOL), f"{name}: new app matches the original within {MATCH_TOL} dB in every octave (worst {np.abs(diff).max():.2f})")
    ra = float(np.sqrt(np.mean(np.concatenate(load("pwa", name)) ** 2)))
    rb = float(np.sqrt(np.mean(np.concatenate(load("base", name)) ** 2)))
    check(abs(20 * np.log10(ra / rb)) <= 0.5, f"{name}: overall level matches the original within 0.5 dB ({20*np.log10(ra/rb):+.2f} dB)")

sys.exit(1 if fail else 0)
