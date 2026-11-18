#!/usr/bin/env python3
"""
================================================================================
 MFAD DATATHON  ·  PROBLEM STATEMENT 2  ·  DATASET 13
 "Pace, Par & Power"
--------------------------------------------------------------------------------
 Research question
     How fast do the players in this sample score? Can their strike rate be
     modelled as a random variable (binomially, through a "par-or-better" event,
     and normally, through maximum likelihood)? How precisely can the mean
     strike rate be estimated, does it differ from a par of 120 runs per 100
     balls, and how much power would such a test have to detect real departures?

 What this script does (top to bottom, no manual steps)
     0. Setup: imports, paths, the pre-specified benchmark, fixed random seed, styling
     1. Load and inspect the dataset
     2. Task 1: random variables and binomial modelling
     3. Task 2: maximum likelihood estimation for a normal model
     4. Task 3: 95% confidence interval for the population mean
     5. Task 4: one-sample t test against the pre-specified benchmark
     6. Task 5: Type I / Type II errors and power (no second inferential test)
     7. Export every number to results/ps2/results.json and every table to CSV

 Every number, table and figure in the Problem Statement 2 PDF report is produced here.
     Figures -> figures/ps2/*.png and *.svg
     Tables  -> results/ps2/tables/*.csv
     Numbers -> results/ps2/results.json

 Requirements: Python 3.9+, numpy, pandas, scipy, matplotlib
 Run:          python analysis_ps2.py
================================================================================
"""

# ==============================================================================
# 0. SETUP
# ==============================================================================
import json
import logging
import math
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from scipy import optimize, stats  # noqa: E402

warnings.filterwarnings("ignore", category=UserWarning)
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)

# ---- The benchmark is fixed HERE, before the data are loaded or examined ------
# ASSUMED TARGET (clearly labelled): a "par" strike rate of 120 runs per 100 balls,
# i.e. 1.2 runs per ball = 7.2 runs per over, a conventional par scoring rate for
# limited-overs (T20) batting. It is a stated assumption, not a documented
# league figure, because the dataset does not identify its competition.
MU0 = 120.0
PAR_THRESHOLD = 120.0  # Task 1 binary event: "strikes at par or better"
ALPHA = 0.05

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "Dataset_13.csv"
FIG_DIR = ROOT / "figures" / "ps2"
RES_DIR = ROOT / "results" / "ps2"
TAB_DIR = RES_DIR / "tables"
FONT_DIR = ROOT / "assets" / "fonts"
for d in (FIG_DIR, RES_DIR, TAB_DIR):
    d.mkdir(parents=True, exist_ok=True)

SEED = 20261118
B = 20_000
rng = np.random.default_rng(SEED)

# ---- Visual identity (shared with Problem Statement 1) ------------------------
PAPER = "#FBF8F2"
INK = "#141A26"
INK_SOFT = "#3B3F47"
MUTED = "#7A756B"
HAIR = "#E6DECD"
AXIS = "#CDBFA5"
NAVY = "#22304A"
GOLD = "#B07A1F"
GOLD_SOFT = "#D9C7A0"
ROSE = "#B23A5E"
SAPPHIRE = "#2E5FA8"
ROLE_ORDER = ["Batter", "All-rounder", "Bowler"]
ROLE_COLORS = {"Batter": "#B07A1F", "All-rounder": "#2E5FA8", "Bowler": "#B23A5E"}


def _register_fonts():
    have = set()
    if FONT_DIR.exists():
        for f in sorted(FONT_DIR.glob("*.ttf")):
            try:
                font_manager.fontManager.addfont(str(f))
                have.add(font_manager.FontProperties(fname=str(f)).get_name())
            except Exception:  # pragma: no cover
                pass
    sans = [f for f in ("Jost", "EB Garamond") if f in have] + ["DejaVu Sans"]
    return sans, ("EB Garamond" in have)


SANS, HAVE_GARAMOND = _register_fonts()
plt.rcParams.update({
    "font.family": SANS, "font.size": 9, "font.weight": 400,
    "mathtext.fontset": "custom" if HAVE_GARAMOND else "dejavusans",
    "mathtext.rm": "EB Garamond" if HAVE_GARAMOND else "DejaVu Sans",
    "mathtext.it": "EB Garamond:italic" if HAVE_GARAMOND else "DejaVu Sans:italic",
    "mathtext.bf": "EB Garamond:medium" if HAVE_GARAMOND else "DejaVu Sans:bold",
    "figure.facecolor": PAPER, "axes.facecolor": PAPER, "savefig.facecolor": PAPER,
    "axes.edgecolor": AXIS, "axes.linewidth": 0.7, "axes.labelcolor": INK_SOFT, "axes.labelsize": 8.5,
    "axes.titlesize": 9, "axes.titleweight": 500, "axes.titlecolor": INK, "axes.titlelocation": "left",
    "axes.titlepad": 10, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
    "axes.grid.axis": "y", "axes.axisbelow": True, "grid.color": HAIR, "grid.linewidth": 0.6,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelsize": 7.5, "ytick.labelsize": 7.5,
    "xtick.major.size": 0, "ytick.major.size": 0, "xtick.major.pad": 5, "ytick.major.pad": 5,
    "legend.frameon": False, "legend.fontsize": 7.5, "svg.fonttype": "none",
    "svg.hashsalt": "mfad-datathon-ps2", "savefig.dpi": 220,
})


def save(fig, name):
    fig.savefig(FIG_DIR / f"{name}.png", bbox_inches="tight", pad_inches=0.12)
    fig.savefig(FIG_DIR / f"{name}.svg", bbox_inches="tight", pad_inches=0.12)
    plt.close(fig)
    print(f"   [figure] figures/ps2/{name}.png  (+ .svg)")


def panel_title(ax, letter, text):
    ax.set_title(f"{letter}   {text}" if letter else text, fontsize=7.6, fontweight=500, color=INK, loc="left")


def fmt(x, d=2):
    """Thousands separator, d decimals, typographic minus sign; '-0.00' is shown as '0.00'."""
    out = f"{x:,.{d}f}"
    if out.startswith("-") and float(out[1:].replace(",", "")) == 0:
        out = out[1:]
    return out.replace("-", "−")


def sci(p):
    m, e = f"{p:.2e}".split("e")
    return f"{float(m):.2f} × 10^{int(e)}"


def header(title):
    print("\n" + "=" * 78 + f"\n {title}\n" + "=" * 78)


def t_power(delta, n, sigma, alpha=ALPHA):
    """Exact power of the two-sided one-sample t test (noncentral t distribution)."""
    df_ = n - 1
    c = stats.t.ppf(1 - alpha / 2, df_)
    nc = delta * math.sqrt(n) / sigma
    return float(stats.nct.sf(c, df_, nc) + stats.nct.cdf(-c, df_, nc))


def n_for_power(delta, sigma, target=0.80, alpha=ALPHA):
    for m in range(3, 20001):
        if t_power(delta, m, sigma, alpha) >= target:
            return m
    return None


R = {"meta": {"seed": SEED, "B": B, "alpha": ALPHA, "mu0": MU0, "par_threshold": PAR_THRESHOLD}}
D = {"mu0": fmt(MU0, 0), "thr": fmt(PAR_THRESHOLD, 0), "B": f"{B:,}", "seed": str(SEED)}

# ==============================================================================
# 1. LOAD AND INSPECT
# ==============================================================================
header("1. DATA INSPECTION")
df = pd.read_csv(DATA_PATH)
n = len(df)
print(f"Rows (players): {n}   Columns: {df.shape[1]}   Missing: {int(df.isna().sum().sum())}")
sr = df["Strike_Rate"].to_numpy(dtype=float)
roles = df["Player_Role"].to_numpy()
print(f"Strike_Rate: min {sr.min()}, max {sr.max()}, mean {sr.mean():.4f}")
D.update({"n": str(n), "sr_min": fmt(sr.min(), 1), "sr_max": fmt(sr.max(), 1),
          "missing": str(int(df.isna().sum().sum()))})

# ==============================================================================
# 2. TASK 1 · RANDOM VARIABLES AND BINOMIAL MODELLING
# ==============================================================================
header("TASK 1 · RANDOM VARIABLES AND BINOMIAL MODELLING")
# S = strike rate of a randomly selected player (continuous, S > 0).
# B = 1{S >= 120}: the player strikes at par or better (Bernoulli).
# X = number of par-or-better players among n = 30 (fixed number of trials).
bern = (sr >= PAR_THRESHOLD).astype(int)
X_obs = int(bern.sum())
p_hat = X_obs / n
role_n = {r: int((roles == r).sum()) for r in ROLE_ORDER}
role_x = {r: int(bern[roles == r].sum()) for r in ROLE_ORDER}
role_p = {r: role_x[r] / role_n[r] for r in ROLE_ORDER}
print(f"X = {X_obs} of {n} players strike at >= {PAR_THRESHOLD:.0f};  p̂ = {p_hat:.3f}")
print("By role:", role_x)

ks = np.arange(n + 1)
pmf_binom = stats.binom.pmf(ks, n, p_hat)
mean_binom, var_binom = n * p_hat, n * p_hat * (1 - p_hat)
# Distribution of X when role sizes are FIXED at 10/10/10 and p differs by role:
# X = X_Bat + X_AR + X_Bowl with X_r ~ Binomial(10, p_r), independent -> convolution.
pmf_quota = np.array([1.0])
for r in ROLE_ORDER:
    pmf_quota = np.convolve(pmf_quota, stats.binom.pmf(np.arange(role_n[r] + 1), role_n[r], role_p[r]))
var_quota = sum(role_n[r] * role_p[r] * (1 - role_p[r]) for r in ROLE_ORDER)
lo95, hi95 = stats.binom.interval(0.95, n, p_hat)
lo95_q = int(np.searchsorted(np.cumsum(pmf_quota), 0.025))
hi95_q = int(np.searchsorted(np.cumsum(pmf_quota), 0.975))
# Probabilities of the observed role counts under a CONSTANT p = p̂ (Binomial(10, p̂) per role)
p_bat_all = stats.binom.sf(role_x["Batter"] - 1, role_n["Batter"], p_hat)       # P(X_Bat >= 10)
p_bowl_le = stats.binom.cdf(role_x["Bowler"], role_n["Bowler"], p_hat)         # P(X_Bowl <= 1)
r_lo, r_hi = stats.binom.interval(0.95, role_n["Batter"], p_hat)
print(f"Binomial({n}, {p_hat:.2f}): mean {mean_binom:.1f}, var {var_binom:.2f}, 95% range {lo95:.0f}–{hi95:.0f}")
print(f"Quota design (p by role): var {var_quota:.2f}, 95% range {lo95_q}–{hi95_q}")
print(f"Under constant p: P(X_Bat >= 10) = {p_bat_all:.4f}; P(X_Bowl <= 1) = {p_bowl_le:.4f}; "
      f"central 95% range for a role of 10: {r_lo:.0f}–{r_hi:.0f}")

thr_rows = []
for t_ in (100, 110, 120, 130):
    b_ = sr >= t_
    thr_rows.append({"threshold": t_, "X": int(b_.sum()), "p_hat": b_.mean(),
                     **{f"X_{r}": int(b_[roles == r].sum()) for r in ROLE_ORDER}})
thr_tab = pd.DataFrame(thr_rows)
thr_tab.round(4).to_csv(TAB_DIR / "t1_threshold_sensitivity.csv", index=False)
pd.DataFrame({"k": ks, "binomial_pmf": pmf_binom, "quota_design_pmf": pmf_quota}).round(6).to_csv(
    TAB_DIR / "t1_binomial_pmf.csv", index=False)
print(thr_tab.to_string(index=False))

# Figure 1 · binomial model of the par-or-better count
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 3.3), gridspec_kw={"wspace": 0.26, "width_ratios": [1.45, 1]})
a1.bar(ks, pmf_binom, width=0.72, color=GOLD_SOFT, lw=0, label=f"Binomial(30, $\\hat{{p}}$ = {p_hat:.1f})")
a1.bar([X_obs], [pmf_binom[X_obs]], width=0.72, color=GOLD, lw=0, label=f"Observed X = {X_obs}")
a1.plot(ks, pmf_quota, color=NAVY, lw=1.4, marker="o", ms=3.6, mec=PAPER, mew=0.8,
        label="Quota design (10 per role, p by role)")
a1.set_xlim(5.5, 28.5)
a1.set_xlabel("X = number of players striking at ≥ 120 (out of 30)")
a1.set_ylabel("Probability")
a1.legend(loc="upper left")
panel_title(a1, "A", "TWO MODELS FOR THE COUNT X")
xr = np.arange(3)
for i, r in enumerate(ROLE_ORDER):
    a2.plot([i, i], [r_lo, r_hi], color=MUTED, lw=6, alpha=0.25, solid_capstyle="round")
    a2.scatter([i], [role_n[r] * p_hat], s=46, facecolor=PAPER, edgecolor=MUTED, lw=1.3, zorder=3)
    a2.scatter([i], [role_x[r]], s=70, color=ROLE_COLORS[r], edgecolor=PAPER, lw=1.2, zorder=4)
    a2.text(i + 0.14, role_x[r], f"{role_x[r]}/10", va="center", fontsize=7.4, color=INK)
a2.set_xticks(xr, ROLE_ORDER)
a2.set_xlim(-0.5, 2.6)
a2.set_ylim(-0.6, 10.8)
a2.set_ylabel("Par-or-better players (of 10)")
a2.legend(handles=[Line2D([], [], marker="o", ls="", markerfacecolor=PAPER, markeredgecolor=MUTED, label="Expected if p constant (6)"),
                   Line2D([], [], color=MUTED, lw=6, alpha=0.25, label="Central 95% range, Bin(10, 0.6)"),
                   Line2D([], [], marker="o", ls="", color=GOLD, label="Observed")], loc="upper center",
           bbox_to_anchor=(0.5, -0.13), ncol=3, fontsize=6.6, handletextpad=0.4, columnspacing=1.0)
panel_title(a2, "B", "IS p CONSTANT ACROSS PLAYERS?")
save(fig, "ps2_fig01_binomial")

R["task1"] = {"X": X_obs, "p_hat": p_hat, "role_n": role_n, "role_x": role_x, "role_p": role_p,
              "binom_mean": mean_binom, "binom_var": var_binom, "binom_95": [lo95, hi95],
              "quota_var": var_quota, "quota_95": [lo95_q, hi95_q], "p_bat_all": p_bat_all,
              "p_bowl_le": p_bowl_le, "role_range95": [r_lo, r_hi],
              "pmf_binom": pmf_binom.tolist(), "pmf_quota": pmf_quota.tolist(),
              "thresholds": json.loads(thr_tab.to_json(orient="records"))}
D.update({"X": str(X_obs), "p_hat": fmt(p_hat, 2), "p_hat3": fmt(p_hat, 3), "binom_mean": fmt(mean_binom, 1),
          "binom_var": fmt(var_binom, 2), "binom_sd": fmt(math.sqrt(var_binom), 2), "binom_lo": f"{lo95:.0f}",
          "binom_hi": f"{hi95:.0f}", "quota_var": fmt(var_quota, 2), "quota_sd": fmt(math.sqrt(var_quota), 2),
          "quota_lo": str(lo95_q), "quota_hi": str(hi95_q), "var_ratio": fmt(var_binom / var_quota, 1),
          "x_bat": str(role_x["Batter"]), "x_ar": str(role_x["All-rounder"]), "x_bowl": str(role_x["Bowler"]),
          "p_bat_all": fmt(p_bat_all, 4), "p_bowl_le": fmt(p_bowl_le, 4), "r_lo": f"{r_lo:.0f}",
          "r_hi": f"{r_hi:.0f}", "role_exp": fmt(10 * p_hat, 0), "pmf_obs": fmt(pmf_binom[X_obs], 3)})
for row in thr_rows:
    D[f"thr{row['threshold']}_X"] = str(row["X"])
    D[f"thr{row['threshold']}_p"] = fmt(row["p_hat"], 2)
    for r, k in zip(ROLE_ORDER, ("bat", "ar", "bowl")):
        D[f"thr{row['threshold']}_{k}"] = str(row[f"X_{r}"])

# ==============================================================================
# 3. TASK 2 · MAXIMUM LIKELIHOOD FOR A NORMAL MODEL
# ==============================================================================
header("TASK 2 · NORMAL MODEL — MAXIMUM LIKELIHOOD  (variable: Strike_Rate)")


def loglik(mu, sigma2, x=sr):
    return -0.5 * len(x) * math.log(2 * math.pi * sigma2) - ((x - mu) ** 2).sum() / (2 * sigma2)


mu_mle = sr.mean()
s2_mle = sr.var(ddof=0)
sd_mle = math.sqrt(s2_mle)
s2_unb = sr.var(ddof=1)
sd_unb = math.sqrt(s2_unb)
ll_max = loglik(mu_mle, s2_mle)
ll_closed = -0.5 * n * (math.log(2 * math.pi * s2_mle) + 1)
assert abs(ll_max - ll_closed) < 1e-9
# numerical confirmation: minimise the negative log-likelihood over (mu, log sigma)
opt = optimize.minimize(lambda th: -loglik(th[0], math.exp(2 * th[1])), x0=[100.0, math.log(10.0)],
                        method="Nelder-Mead", options={"xatol": 1e-10, "fatol": 1e-12, "maxiter": 20000})
mu_num, sd_num = opt.x[0], math.exp(opt.x[1])
fit_loc, fit_scale = stats.norm.fit(sr)
se_mu = sd_mle / math.sqrt(n)                      # from the Fisher information
se_s2 = s2_mle * math.sqrt(2 / n)
bias_s2_mle = -s2_mle / (n - 1)                    # estimated bias of σ̂² = −σ²/n, with σ² estimated by s²
print(f"μ̂ = {mu_mle:.4f}   σ̂² = {s2_mle:.4f} (σ̂ = {sd_mle:.4f})   s² = {s2_unb:.4f}")
print(f"Numerical optimum: μ = {mu_num:.6f}, σ = {sd_num:.6f};  scipy norm.fit: {fit_loc:.6f}, {fit_scale:.6f}")
print(f"max log-likelihood = {ll_max:.4f};  SE(μ̂) = {se_mu:.4f};  SE(σ̂²) = {se_s2:.4f}")
sw = stats.shapiro(sr)
skew, kurt = stats.skew(sr, bias=False), stats.kurtosis(sr, bias=False)
print(f"Shapiro–Wilk W = {sw.statistic:.4f}, p = {sw.pvalue:.4f};  skew {skew:.3f}, kurt {kurt:.3f}")

med = float(np.median(sr))
trim = float(stats.trim_mean(sr, 0.10))
mad_sd = float(stats.median_abs_deviation(sr, scale="normal"))
iqr_sd = float((np.percentile(sr, 75) - np.percentile(sr, 25)) / 1.349)
est_tab = pd.DataFrame([
    ["Mean μ", "Maximum likelihood (= sample mean x̄)", mu_mle, "Unbiased; efficient under normality"],
    ["Mean μ", "Method of moments", mu_mle, "Identical to the MLE for the normal model"],
    ["Mean μ", "Sample median", med, "Robust to outliers; less efficient under normality"],
    ["Mean μ", "10% trimmed mean", trim, "Compromise between mean and median"],
    ["Variance σ²", "Maximum likelihood σ̂² (divisor n)", s2_mle, "Biased by −σ²/n; consistent"],
    ["Variance σ²", "Unbiased s² (divisor n − 1)", s2_unb, "Unbiased; slightly larger"],
    ["Variance σ²", "(1.4826 × MAD)²", mad_sd ** 2, "Robust scale estimate"],
    ["Variance σ²", "(IQR / 1.349)²", iqr_sd ** 2, "Robust scale estimate"],
], columns=["Parameter", "Estimator", "Estimate", "Property"])
est_tab.round(4).to_csv(TAB_DIR / "t2_estimator_comparison.csv", index=False)
role_mle = pd.DataFrame({"Role": ROLE_ORDER,
                         "n": [role_n[r] for r in ROLE_ORDER],
                         "mu_hat": [sr[roles == r].mean() for r in ROLE_ORDER],
                         "sigma_hat": [sr[roles == r].std(ddof=0) for r in ROLE_ORDER]})
role_mle.round(4).to_csv(TAB_DIR / "t2_mle_by_role.csv", index=False)
print(est_tab.round(3).to_string(index=False))
print(role_mle.round(3).to_string(index=False))

# Figure 2 · likelihood geometry
fig, axs = plt.subplots(1, 3, figsize=(10.2, 3.25), gridspec_kw={"wspace": 0.34})
a1, a2, a3 = axs
a1.hist(sr, bins=np.arange(85, 155, 5), density=True, color=GOLD, alpha=0.85, edgecolor=PAPER, lw=1.6)
xx = np.linspace(75, 170, 400)
a1.plot(xx, stats.norm.pdf(xx, mu_mle, sd_mle), color=INK, lw=1.5)
a1.plot(sr, np.full(n, -0.0012), "|", color=INK_SOFT, ms=7, mew=0.8, clip_on=False)
a1.set_ylim(-0.002, None)
a1.set_yticks([])
a1.set_xlabel("Strike rate (runs per 100 balls)")
panel_title(a1, "A", r"FITTED N($\hat{\mu}$, $\hat{\sigma}^2$)")
mus = np.linspace(110, 134, 220)
sds = np.linspace(9, 26, 220)
MM, SS = np.meshgrid(mus, sds)
LL = -0.5 * n * np.log(2 * np.pi * SS ** 2) - (((sr[None, None, :] - MM[..., None]) ** 2).sum(-1)) / (2 * SS ** 2)
rel = LL - ll_max
cs = a2.contourf(MM, SS, rel, levels=[-12, -8, -6, -4, -2, -1, -0.5, 0], cmap=matplotlib.colors.LinearSegmentedColormap.from_list(
    "g", ["#F4EEE2", "#E9DCC0", "#D9C7A0", "#C9A35A", "#B07A1F"]), extend="min")
a2.contour(MM, SS, rel, levels=[-1.92], colors=[INK], linewidths=0.9)
a2.scatter([mu_mle], [sd_mle], s=36, color=INK, zorder=3)
a2.annotate("MLE", (mu_mle, sd_mle), xytext=(6, 6), textcoords="offset points", fontsize=7.2, color=INK)
a2.grid(False)
a2.set_xlabel("μ")
a2.set_ylabel("σ")
panel_title(a2, "B", "LOG-LIKELIHOOD SURFACE")
s2_grid = np.linspace(110, 420, 400)
prof = np.array([loglik(mu_mle, v) for v in s2_grid])
a3.plot(s2_grid, prof, color=INK, lw=1.5)
a3.axvline(s2_mle, color=GOLD, lw=1.4)
a3.axvline(s2_unb, color=SAPPHIRE, lw=1.0, ls=(0, (2, 2)))
yl = a3.get_ylim()
a3.text(s2_mle - 6, yl[0] + 0.12 * (yl[1] - yl[0]), f"$\\hat{{\\sigma}}^2$ = {s2_mle:.1f}\n(MLE, divisor n)", ha="right", fontsize=6.8, color=GOLD)
a3.text(s2_unb + 6, yl[0] + 0.12 * (yl[1] - yl[0]), f"s² = {s2_unb:.1f}\n(divisor n − 1)", ha="left", fontsize=6.8, color=SAPPHIRE)
a3.set_xlabel(r"$\sigma^2$   ($\mu$ fixed at $\hat{\mu}$)")
a3.set_ylabel("log-likelihood")
panel_title(a3, "C", "PROFILE OVER σ²")
fig.text(0.53, -0.09, "Panel B: shaded bands show where the log-likelihood is within 0.5, 1, 2, 4, 6, 8 and 12 units of its maximum; the dashed curve is 1.92 units below it.",
         ha="center", fontsize=6.8, color=MUTED)
save(fig, "ps2_fig02_likelihood")

R["task2"] = {"mu_mle": mu_mle, "s2_mle": s2_mle, "sd_mle": sd_mle, "s2_unb": s2_unb, "sd_unb": sd_unb,
              "loglik_max": ll_max, "numerical": {"mu": mu_num, "sd": sd_num}, "scipy_fit": [fit_loc, fit_scale],
              "se_mu": se_mu, "se_s2": se_s2, "shapiro": {"W": sw.statistic, "p": sw.pvalue}, "skew": skew,
              "kurt": kurt, "estimators": json.loads(est_tab.to_json(orient="records")),
              "by_role": json.loads(role_mle.to_json(orient="records"))}
D.update({"mu_mle": fmt(mu_mle, 2), "mu_mle4": fmt(mu_mle, 4), "s2_mle": fmt(s2_mle, 2), "sd_mle": fmt(sd_mle, 2),
          "s2_unb": fmt(s2_unb, 2), "sd_unb": fmt(sd_unb, 2), "ll_max": fmt(ll_max, 2), "mu_num": fmt(mu_num, 4),
          "sd_num": fmt(sd_num, 4), "se_mu": fmt(se_mu, 2), "se_s2": fmt(se_s2, 1), "sw_W": fmt(sw.statistic, 4),
          "sw_p": fmt(sw.pvalue, 3), "skew": fmt(skew, 3), "kurt": fmt(kurt, 3), "med": fmt(med, 2),
          "trim": fmt(trim, 2), "mad_s2": fmt(mad_sd ** 2, 1), "iqr_s2": fmt(iqr_sd ** 2, 1),
          "bias_s2": fmt(bias_s2_mle, 2), "s2_ratio": fmt((n - 1) / n, 4)})
for r, k in zip(ROLE_ORDER, ("bat", "ar", "bowl")):
    row = role_mle.set_index("Role").loc[r]
    D[f"{k}_mu"] = fmt(row["mu_hat"], 1)
    D[f"{k}_sd"] = fmt(row["sigma_hat"], 1)

# ==============================================================================
# 4. TASK 3 · 95% CONFIDENCE INTERVAL FOR THE POPULATION MEAN
# ==============================================================================
header("TASK 3 · 95% CONFIDENCE INTERVAL FOR μ  (Student's t, σ unknown)")
xbar, s = sr.mean(), sr.std(ddof=1)
se = s / math.sqrt(n)
t_crit = stats.t.ppf(1 - ALPHA / 2, n - 1)
me = t_crit * se
ci = (xbar - me, xbar + me)
z_crit = stats.norm.ppf(1 - ALPHA / 2)
ci_z = (xbar - z_crit * se, xbar + z_crit * se)
print(f"x̄ = {xbar:.4f}, s = {s:.4f}, SE = {se:.4f}, t* = {t_crit:.4f}, ME = {me:.4f}")
print(f"95% t-interval: ({ci[0]:.2f}, {ci[1]:.2f});  large-sample z-interval: ({ci_z[0]:.2f}, {ci_z[1]:.2f})")

# Margin of error: confidence level x sample size (σ fixed at s)
me_rows = []
for cl in (0.90, 0.95, 0.99):
    for m in (10, 30, 60, 120):
        me_rows.append({"confidence": cl, "n": m, "t_star": stats.t.ppf(1 - (1 - cl) / 2, m - 1),
                        "ME": stats.t.ppf(1 - (1 - cl) / 2, m - 1) * s / math.sqrt(m)})
me_tab = pd.DataFrame(me_rows)
me_tab.round(4).to_csv(TAB_DIR / "t3_margin_of_error.csv", index=False)

# Repeated-sampling illustration
# (i) 100 intervals from samples of 30 drawn (with replacement) from the empirical distribution
draws = rng.choice(sr, size=(100, n), replace=True)
dm, ds = draws.mean(1), draws.std(1, ddof=1)
lo100, hi100 = dm - t_crit * ds / math.sqrt(n), dm + t_crit * ds / math.sqrt(n)
cover100 = (lo100 <= xbar) & (xbar <= hi100)
# (ii) long-run coverage, B replicates: normal parent N(x̄, s²) and the empirical parent
Zn = rng.normal(xbar, s, size=(B, n))
cov_norm = np.mean(np.abs(Zn.mean(1) - xbar) <= t_crit * Zn.std(1, ddof=1) / math.sqrt(n))
Ze = rng.choice(sr, size=(B, n), replace=True)
cov_emp = np.mean(np.abs(Ze.mean(1) - xbar) <= t_crit * Ze.std(1, ddof=1) / math.sqrt(n))
cov_z_norm = np.mean(np.abs(Zn.mean(1) - xbar) <= z_crit * Zn.std(1, ddof=1) / math.sqrt(n))
print(f"100 intervals: {int(cover100.sum())} cover x̄.  Long-run coverage (B = {B:,}): normal {cov_norm:.4f}, "
      f"empirical {cov_emp:.4f};  z-interval under normal {cov_z_norm:.4f}")
print(me_tab.round(3).to_string(index=False))

# Figure 3 · repeated sampling and margin of error
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 3.9), gridspec_kw={"wspace": 0.24, "width_ratios": [1.35, 1]})
for i in range(100):
    c = GOLD if cover100[i] else ROSE
    a1.plot([lo100[i], hi100[i]], [i, i], color=c, lw=1.1 if cover100[i] else 1.6, solid_capstyle="round")
    a1.plot([dm[i]], [i], "o", ms=1.8, color=INK if cover100[i] else ROSE)
a1.axvline(xbar, color=INK, lw=1.0)
a1.set_ylim(-2, 101)
a1.set_yticks([])
a1.grid(True, axis="x")
a1.grid(False, axis="y")
a1.set_xlabel("Strike rate")
a1.text(1.0, 1.02, f"{int(cover100.sum())} of 100 intervals capture the true mean", transform=a1.transAxes, ha="right",
        va="bottom", fontsize=7.2, color=INK_SOFT)
a1.legend(handles=[Line2D([], [], color=GOLD, lw=1.4, label="captures μ*"), Line2D([], [], color=ROSE, lw=1.6, label="misses μ*"),
                   Line2D([], [], color=INK, lw=1, label=f"true mean μ* = {xbar:.2f}")], loc="upper left", fontsize=7)
panel_title(a1, "A", "100 REPEATED SAMPLES · 95% t-INTERVALS")
nn = np.arange(5, 201)
for cl, col, lab in ((0.90, GOLD_SOFT, "90%"), (0.95, GOLD, "95%"), (0.99, NAVY, "99%")):
    a2.plot(nn, stats.t.ppf(1 - (1 - cl) / 2, nn - 1) * s / np.sqrt(nn), color=col, lw=1.8, label=lab)
a2.scatter([n], [me], s=34, color=INK, zorder=4)
a2.annotate(f"this study: n = {n}, ME = {me:.2f}", (n, me), xytext=(14, 10), textcoords="offset points", fontsize=7, color=INK)
a2.set_xlabel("Sample size n")
a2.set_ylabel("Margin of error (strike-rate points)")
a2.set_ylim(0, 22)
a2.legend(title="Confidence level", title_fontsize=7, loc="upper right")
panel_title(a2, "B", "MARGIN OF ERROR · LEVEL AND SAMPLE SIZE")
save(fig, "ps2_fig03_confidence_interval")

R["task3"] = {"xbar": xbar, "s": s, "se": se, "t_crit": t_crit, "me": me, "ci": ci, "z_crit": z_crit, "ci_z": ci_z,
              "cover100": int(cover100.sum()), "cov_norm": cov_norm, "cov_emp": cov_emp, "cov_z_norm": cov_z_norm,
              "intervals100": {"lo": lo100.tolist(), "hi": hi100.tolist(), "mean": dm.tolist()},
              "me_table": json.loads(me_tab.to_json(orient="records"))}
D.update({"xbar": fmt(xbar, 2), "s": fmt(s, 2), "se": fmt(se, 3), "se2": fmt(se, 2), "tcrit": fmt(t_crit, 3),
          "me": fmt(me, 2), "ci_lo": fmt(ci[0], 2), "ci_hi": fmt(ci[1], 2), "zcrit": fmt(z_crit, 3),
          "ciz_lo": fmt(ci_z[0], 2), "ciz_hi": fmt(ci_z[1], 2), "mez": fmt(z_crit * se, 2),
          "cover100": str(int(cover100.sum())), "cov_norm": fmt(100 * cov_norm, 1), "cov_emp": fmt(100 * cov_emp, 1),
          "cov_z_norm": fmt(100 * cov_z_norm, 1), "ci_width": fmt(2 * me, 2)})
for row in me_rows:
    D[f"me_{int(round(row['confidence'] * 100))}_{row['n']}"] = fmt(row["ME"], 2)

# ==============================================================================
# 5. TASK 4 · ONE-SAMPLE t TEST AGAINST THE PRE-SPECIFIED BENCHMARK
# ==============================================================================
header(f"TASK 4 · ONE-SAMPLE t TEST   H0: μ = {MU0:.0f}   vs   H1: μ ≠ {MU0:.0f}")
t_stat = (xbar - MU0) / se
df_t = n - 1
p_val = 2 * stats.t.sf(abs(t_stat), df_t)
chk = stats.ttest_1samp(sr, MU0)
assert np.isclose(t_stat, chk.statistic) and np.isclose(p_val, chk.pvalue)
d_eff = (xbar - MU0) / s
reject = p_val < ALPHA
print(f"t = {t_stat:.4f}, df = {df_t}, p = {p_val:.4f}, critical ±{t_crit:.4f};  "
      f"decision: {'reject' if reject else 'fail to reject'} H0;  Cohen's d = {d_eff:.3f}")
print(f"Observed difference x̄ − μ0 = {xbar - MU0:.3f} strike-rate points = {(xbar - MU0) / 100:.4f} runs per ball")

# Figure 4 · the t statistic on its reference distribution, and the CI duality
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 2.9), gridspec_kw={"wspace": 0.22, "width_ratios": [1.5, 1]})
tt = np.linspace(-4.2, 4.2, 800)
a1.plot(tt, stats.t.pdf(tt, df_t), color=INK, lw=1.5)
for sgn in (-1, 1):
    m_ = sgn * tt >= t_crit
    a1.fill_between(tt[m_], stats.t.pdf(tt[m_], df_t), color=ROSE, alpha=0.25, lw=0)
    m2 = sgn * tt >= abs(t_stat)
    a1.fill_between(tt[m2], stats.t.pdf(tt[m2], df_t), color=GOLD, alpha=0.35, lw=0)
a1.axvline(t_stat, color=GOLD, lw=2)
a1.text(t_stat + 0.12, 0.36, f"observed t = {t_stat:.3f}\ntwo-sided p = {p_val:.3f}", fontsize=7.2, color=INK)
a1.text(t_crit + 0.1, 0.07, f"reject if |t| > {t_crit:.3f}", fontsize=6.8, color=ROSE)
a1.set_ylim(0, 0.43)
a1.set_xlabel(f"t statistic  (df = {df_t})")
a1.set_ylabel("Density")
panel_title(a1, "A", f"t({df_t}) UNDER H₀ · GOLD AREA = p-VALUE, ROSE = REJECTION REGION")
a2.plot([ci[0], ci[1]], [0, 0], color=GOLD, lw=5, solid_capstyle="round")
a2.plot([xbar], [0], "o", color=INK, ms=6)
a2.axvline(MU0, color=ROSE, lw=1.2)
a2.text(MU0 - 0.3, 0.55, f"benchmark μ₀ = {MU0:.0f}", ha="right", fontsize=7.2, color=ROSE)
a2.text(xbar, -0.5, f"95% CI {ci[0]:.2f} – {ci[1]:.2f}", ha="center", fontsize=7.2, color=INK)
a2.set_xlim(110, 132)
a2.set_ylim(-1, 1)
a2.set_yticks([])
a2.grid(True, axis="x")
a2.set_xlabel("Strike rate")
panel_title(a2, "B", "DUALITY · μ₀ LIES INSIDE THE 95% CI")
save(fig, "ps2_fig04_t_test")

R["task4"] = {"mu0": MU0, "t": t_stat, "df": df_t, "p": p_val, "t_crit": t_crit, "reject": bool(reject),
              "cohen_d": d_eff, "diff": xbar - MU0}
D.update({"t": fmt(t_stat, 3), "t4": fmt(t_stat, 4), "df": str(df_t), "p": fmt(p_val, 3), "p4": fmt(p_val, 4),
          "d": fmt(d_eff, 3), "diff": fmt(xbar - MU0, 2), "diff_rpb": fmt((xbar - MU0) / 100, 4),
          "diff_rpo": fmt(6 * (xbar - MU0) / 100, 2), "decision": "Reject H₀" if reject else "Fail to reject H₀"})

# ==============================================================================
# 6. TASK 5 · TYPE I / TYPE II ERRORS AND POWER   (no second inferential test)
# ==============================================================================
header("TASK 5 · ERRORS AND POWER OF THE ONE-SAMPLE t TEST")
grp = [sr[roles == r] for r in ROLE_ORDER]
sigma_within = math.sqrt(sum(((g - g.mean()) ** 2).sum() for g in grp) / (n - len(grp)))
deltas = (2.5, 5.0, 7.5, 10.0)
pow_rows = []
for dl in deltas:
    pow_rows.append({"delta": dl, "power_sigma_s": t_power(dl, n, s), "power_sigma_within": t_power(dl, n, sigma_within),
                     "n80_sigma_s": n_for_power(dl, s), "n80_sigma_within": n_for_power(dl, sigma_within)})
pow_tab = pd.DataFrame(pow_rows)
pow_tab.round(4).to_csv(TAB_DIR / "t5_power_scenarios.csv", index=False)
alpha_rows = [{"alpha": a, "power_delta5": t_power(5, n, s, a)} for a in (0.01, 0.05, 0.10)]
n_rows = [{"n": m, "power_delta5": t_power(5, m, s)} for m in (10, 30, 60, 120)]
pd.DataFrame(alpha_rows).round(4).to_csv(TAB_DIR / "t5_power_by_alpha.csv", index=False)
pd.DataFrame(n_rows).round(4).to_csv(TAB_DIR / "t5_power_by_n.csv", index=False)
n80_obs = n_for_power(abs(xbar - MU0), s)
print(pow_tab.round(4).to_string(index=False))
print("By α (Δ = 5):", {r["alpha"]: round(r["power_delta5"], 4) for r in alpha_rows})
print("By n (Δ = 5):", {r["n"]: round(r["power_delta5"], 4) for r in n_rows})
print(f"Pooled within-role SD = {sigma_within:.3f}; n for 80% power at Δ = |x̄ − μ0| = {abs(xbar - MU0):.2f}: {n80_obs}")

# Monte Carlo checks of the error rates (no new test of the data)
crit = t_crit


def reject_rate(samples, mu0=MU0):
    m_, s_ = samples.mean(1), samples.std(1, ddof=1)
    return float(np.mean(np.abs((m_ - mu0) / (s_ / math.sqrt(samples.shape[1]))) > crit))


typeI_norm = reject_rate(rng.normal(MU0, s, size=(B, n)))
power5_norm = reject_rate(rng.normal(MU0 + 5, s, size=(B, n)))
shifted = sr - xbar + MU0                                # empirical shape, mean moved to μ0
typeI_emp = reject_rate(rng.choice(shifted, size=(B, n), replace=True))
power5_emp = reject_rate(rng.choice(shifted + 5, size=(B, n), replace=True))
print(f"Simulated Type I rate: normal {typeI_norm:.4f}, empirical shape {typeI_emp:.4f}")
print(f"Simulated power at Δ = 5: normal {power5_norm:.4f} (exact {t_power(5, n, s):.4f}), empirical {power5_emp:.4f}")

# Figure 5 · Type I and Type II error regions for Δ = 5 (sampling distribution of x̄)
DELTA = 5.0
fig, ax = plt.subplots(figsize=(10.2, 3.0))
xs = np.linspace(106, 136, 900)
f0 = stats.t.pdf((xs - MU0) / se, df_t) / se
nc = DELTA / se
f1 = stats.nct.pdf((xs - MU0) / se, df_t, nc) / se
lo_c, hi_c = MU0 - t_crit * se, MU0 + t_crit * se
ax.plot(xs, f0, color=INK, lw=1.5, label=f"H₀ true: μ = {MU0:.0f}")
ax.plot(xs, f1, color=SAPPHIRE, lw=1.5, label=f"H₁ true: μ = {MU0 + DELTA:.0f}  (Δ = {DELTA:.0f})")
ax.fill_between(xs, f0, where=(xs <= lo_c) | (xs >= hi_c), color=ROSE, alpha=0.35, lw=0, label=f"Type I error α = {ALPHA}")
ax.fill_between(xs, f1, where=(xs > lo_c) & (xs < hi_c), color=SAPPHIRE, alpha=0.16, lw=0,
                label=f"Type II error β = {1 - t_power(DELTA, n, s):.3f}")
ax.axvline(lo_c, color=ROSE, lw=0.8)
ax.axvline(hi_c, color=ROSE, lw=0.8)
ax.text(hi_c + 0.25, ax.get_ylim()[1] * 0.92, f"reject H₀ if $\\bar{{x}}$ > {hi_c:.2f}", fontsize=7, color=ROSE)
ax.text(lo_c - 0.25, ax.get_ylim()[1] * 0.92, f"or $\\bar{{x}}$ < {lo_c:.2f}", fontsize=7, color=ROSE, ha="right")
ax.set_yticks([])
ax.set_xlabel(f"Sample mean strike rate $\\bar{{x}}$   (n = {n}, σ ≈ s = {s:.2f})")
ax.legend(loc="upper left", fontsize=7)
panel_title(ax, "", f"DECISION ERRORS · POWER = 1 − β = {t_power(DELTA, n, s):.3f} WHEN THE TRUE MEAN IS {MU0 + DELTA:.0f}")
save(fig, "ps2_fig05_error_regions")

# Figure 6 · what drives power
fig, axs = plt.subplots(1, 3, figsize=(10.2, 3.1), gridspec_kw={"wspace": 0.3})
dgrid = np.linspace(-15, 15, 241)
for m, col in ((10, GOLD_SOFT), (30, GOLD), (60, SAPPHIRE), (120, NAVY)):
    axs[0].plot(MU0 + dgrid, [t_power(v, m, s) for v in dgrid], color=col, lw=1.6, label=f"n = {m}")
axs[0].axvline(MU0, color=MUTED, lw=0.7)
axs[0].axhline(ALPHA, color=ROSE, lw=0.7, ls=(0, (2, 2)))
axs[0].set_xlabel("True mean strike rate μ")
axs[0].set_ylabel("Power")
axs[0].legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), fontsize=6.6, ncol=4, columnspacing=0.9, handlelength=1.3)
panel_title(axs[0], "A", "SAMPLE SIZE  (α = 0.05, σ = s)")
ngrid = np.arange(5, 201)
for a, col in ((0.01, NAVY), (0.05, GOLD), (0.10, GOLD_SOFT)):
    axs[1].plot(ngrid, [t_power(DELTA, m, s, a) for m in ngrid], color=col, lw=1.6, label=f"α = {a}")
axs[1].axhline(0.8, color=MUTED, lw=0.7, ls=(0, (2, 2)))
axs[1].scatter([n], [t_power(DELTA, n, s)], s=26, color=INK, zorder=4)
axs[1].set_xlabel("Sample size n")
axs[1].legend(loc="lower right", fontsize=6.8)
panel_title(axs[1], "B", f"SIGNIFICANCE LEVEL  (Δ = {DELTA:.0f})")
for sg, col, lab in ((sigma_within, SAPPHIRE, f"σ = {sigma_within:.1f} (within role)"), (s, GOLD, f"σ = {s:.1f} (all players)"),
                     (2 * s, GOLD_SOFT, f"σ = {2 * s:.1f} (doubled)")):
    axs[2].plot(dgrid[dgrid >= 0], [t_power(v, n, sg) for v in dgrid[dgrid >= 0]], color=col, lw=1.6, label=lab)
axs[2].axhline(0.8, color=MUTED, lw=0.7, ls=(0, (2, 2)))
axs[2].set_xlabel("True departure Δ = |μ − 120|")
axs[2].legend(loc="lower right", fontsize=6.6)
panel_title(axs[2], "C", "VARIABILITY AND EFFECT SIZE  (n = 30)")
for a in axs:
    a.set_ylim(0, 1.02)
    a.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    a.grid(True, axis="both")
save(fig, "ps2_fig06_power")

R["task5"] = {"sigma_within": sigma_within, "scenarios": json.loads(pow_tab.to_json(orient="records")),
              "by_alpha": alpha_rows, "by_n": n_rows, "n80_observed_diff": n80_obs,
              "sim": {"typeI_norm": typeI_norm, "typeI_emp": typeI_emp, "power5_norm": power5_norm, "power5_emp": power5_emp},
              "crit_lo": lo_c, "crit_hi": hi_c, "delta_fig": DELTA}
D.update({"sigma_w": fmt(sigma_within, 2), "n80_obs": f"{n80_obs:,}", "crit_lo": fmt(lo_c, 2), "crit_hi": fmt(hi_c, 2),
          "typeI_norm": fmt(typeI_norm, 4), "typeI_emp": fmt(typeI_emp, 4), "power5_norm": fmt(power5_norm, 4),
          "power5_emp": fmt(power5_emp, 4), "beta5": fmt(1 - t_power(5, n, s), 3), "power5": fmt(t_power(5, n, s), 3)})
for row in pow_rows:
    k = str(row["delta"]).replace(".0", "").replace(".", "_")
    D[f"pw_{k}_s"] = fmt(row["power_sigma_s"], 3)
    D[f"pw_{k}_w"] = fmt(row["power_sigma_within"], 3)
    D[f"n80_{k}_s"] = str(row["n80_sigma_s"])
    D[f"n80_{k}_w"] = str(row["n80_sigma_within"])
for row in alpha_rows:
    D[f"pa_{int(round(row['alpha'] * 100))}"] = fmt(row["power_delta5"], 3)
for row in n_rows:
    D[f"pn_{row['n']}"] = fmt(row["power_delta5"], 3)

# ==============================================================================
# 7. EXPORT
# ==============================================================================
header("EXPORT")


def _clean(o):
    if isinstance(o, dict):
        return {str(k_): _clean(v) for k_, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if math.isnan(float(o)) else float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


R["meta"]["versions"] = {"python": __import__("platform").python_version(), "numpy": np.__version__,
                         "pandas": pd.__version__, "scipy": __import__("scipy").__version__,
                         "matplotlib": matplotlib.__version__}
D.update({f"v_{k_}": v for k_, v in R["meta"]["versions"].items()})
R["display"] = D
R["data"] = json.loads(df.to_json(orient="records"))
(RES_DIR / "results.json").write_text(json.dumps(_clean(R), indent=2, ensure_ascii=False), encoding="utf-8")
print("   [results] results/ps2/results.json")
print("   [tables]  " + ", ".join(sorted(p.name for p in TAB_DIR.glob("*.csv"))))

header("HEADLINE FINDINGS")
print(f"• {X_obs} of {n} players strike at par or better (p̂ = {p_hat:.2f}); p is far from constant across roles.")
print(f"• Normal MLE: μ̂ = {mu_mle:.2f}, σ̂² = {s2_mle:.2f} (s² = {s2_unb:.2f}).")
print(f"• 95% t-interval for mean strike rate: {ci[0]:.2f} to {ci[1]:.2f} (ME {me:.2f}).")
print(f"• t({df_t}) = {t_stat:.3f}, p = {p_val:.3f}: no evidence the mean differs from par {MU0:.0f}.")
print(f"• Power to detect a 5-point departure at n = {n}: {t_power(5, n, s):.3f}; 80% needs n = {n_for_power(5, s)}.")
print("Done.")
