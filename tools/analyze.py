"""Analyse the audio captured by tools/measure.mjs.

Prints the measured dB-per-octave slope of each noise color against its textbook
target and draws docs/spectrum.png. Needs numpy, scipy, matplotlib.
"""
import json, os, sys
import numpy as np
from scipy.signal import welch

TARGET = {"brown": -6, "pink": -3, "white": 0, "blue": 3, "violet": 6}
COLOR = {"brown": "#8A5A3B", "pink": "#C9798C", "white": "#8E8B86", "blue": "#4F7BA8", "violet": "#7D63A8"}
OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000]
TOL = 0.75  # dB per octave

d = sys.argv[1]
caps = json.load(open(os.path.join(d, "index.json")))
spectra, fail = {}, False
print(f"{'color':<7}{'target':>8}{'measured':>10}{'worst':>8}  result")
for c in caps:
    x = np.concatenate([np.fromfile(os.path.join(d, f"{c['name']}.{ch}.f32"), dtype=np.float32) for ch in "LR"])
    f, p = welch(x, c["sr"], nperseg=2**15)
    spectra[c["name"]] = (f, p)
    # Mean power per Hz in each octave band; neighbouring bands differ by the slope.
    lv = [10 * np.log10(p[(f >= b / 2**.5) & (f < b * 2**.5)].mean()) for b in OCTAVES]
    steps = np.diff(lv)[:-1]  # 63 Hz to 4 kHz; the top octave meets the app's 18 kHz low-pass
    t = TARGET[c["name"]]
    worst = np.abs(steps - t).max()
    ok = worst <= TOL
    fail |= not ok
    print(f"{c['name']:<7}{t:>+8.1f}{steps.mean():>+10.2f}{worst:>8.2f}  {'PASS' if ok else 'FAIL'}")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    sys.exit(1 if fail else 0)

plt.rcParams.update({"font.size": 10, "axes.edgecolor": "#C9C6C0", "axes.labelcolor": "#6B6863",
                     "xtick.color": "#6B6863", "ytick.color": "#6B6863"})
fig, axes = plt.subplots(1, 5, figsize=(13, 3.2), sharey=True)
edges = 1000 * 2 ** (np.arange(-40, 25) / 6)  # 1/6-octave bins, 20 Hz to 16 kHz
for ax, name in zip(axes, TARGET):
    f, p = spectra[name]
    mid = np.sqrt(edges[:-1] * edges[1:])
    db = np.array([10 * np.log10(p[(f >= a) & (f < b)].mean()) for a, b in zip(edges[:-1], edges[1:])])
    db -= np.interp(np.log2(1000), np.log2(mid), db)  # 0 dB at 1 kHz
    ax.semilogx(mid, TARGET[name] * np.log2(mid / 1000), color="#9A978F", lw=1, ls="--", label="target")
    ax.semilogx(mid, db, color=COLOR[name], lw=2, label="measured")
    ax.set_title(f"{name.capitalize()}  {TARGET[name]:+d} dB/oct", fontsize=11, color="#22211F", loc="left")
    ax.set_xlim(20, 16000); ax.set_ylim(-45, 45)
    ax.set_xticks([100, 1000, 10000], ["100", "1k", "10k"])
    ax.grid(True, which="major", color="#ECEAE6", lw=.8)
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    ax.set_xlabel("Hz")
axes[0].set_ylabel("dB (0 at 1 kHz)")
axes[0].legend(frameon=False, fontsize=9, loc="lower left")
fig.tight_layout()
out = os.path.join(os.path.dirname(__file__), "..", "docs", "spectrum.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
fig.savefig(out, dpi=110, facecolor="white")
print("wrote docs/spectrum.png")
sys.exit(1 if fail else 0)
