"""Verify the generator's spectral slopes match the textbook targets.

Pink noise should drop ~3 dB per octave, brown ~6 dB per octave.
Mirrors the generator math in index.html. Run: python tools/verify_spectrum.py
Requires: numpy, scipy
"""
import numpy as np
from scipy.signal import welch, lfilter

FS = 48000
rng = np.random.default_rng(1)
w = rng.uniform(-1, 1, FS * 30)

def pink(x):
    # Paul Kellet's refined filter, same coefficients as index.html
    b = np.zeros(7); out = np.empty_like(x)
    for i, v in enumerate(x):
        b[0] = .99886*b[0] + v*.0555179; b[1] = .99332*b[1] + v*.0750759
        b[2] = .969*b[2] + v*.153852;    b[3] = .8665*b[3] + v*.3104856
        b[4] = .55*b[4] + v*.5329522;    b[5] = -.7616*b[5] - v*.016898
        out[i] = (b.sum() + v*.5362) * .11; b[6] = v*.115926
    return out

def brown(x):
    # Leaky integrator: br = 0.998*br + 0.022*w
    return lfilter([0.022], [1, -0.998], x)

def report(x, name, target):
    f, p = welch(x, FS, nperseg=2**16)
    bands = [40, 80, 160, 320, 640, 1280, 2560, 5120, 10240]
    db = [10*np.log10(p[(f >= b/1.06) & (f <= b*1.06)].mean()) for b in bands]
    steps = [db[i+1] - db[i] for i in range(len(db) - 1)]
    print(f"{name} (target {target:+.1f} dB/octave)")
    for i, s in enumerate(steps):
        ok = "ok" if abs(s - target) <= 0.6 else "OFF"
        print(f"  {bands[i]:>5}-{bands[i+1]:<5} Hz  {s:+.1f}  {ok}")

report(pink(w), "Pink", -3.0)
report(brown(w), "Brown", -6.0)
