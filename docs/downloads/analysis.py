#!/usr/bin/env python3
"""
================================================================================
 MFAD DATATHON  ·  PROBLEM STATEMENT 1  ·  DATASET 13
 "Runs, Roles & Randomness"
--------------------------------------------------------------------------------
 Research question
     How many runs does a typical player in this sample score, how precisely
     can that be estimated, is a normal model reasonable for run output, and
     does mean run output differ between playing roles (Batter, All-rounder,
     Bowler)?

 What this script does (top to bottom, no manual steps)
     0. Setup: imports, paths, fixed random seed, chart styling
     1. Load and inspect the dataset (types, missing values, identifiers)
     2. Task 1: sampling design and population definition
     3. Task 2: point estimation, bias, variance and MSE (theory + resampling)
     4. Task 3: normal model and the Central Limit Theorem (theory + resampling)
     5. Task 4: one-way ANOVA of Runs_Scored across Player_Role
     6. Task 5: chi-square goodness-of-fit tests
     7. Export every number to results/results.json and every table to CSV

 Every number, table and figure in the PDF report is produced here.
     Figures -> figures/*.png and figures/*.svg
     Tables  -> results/tables/*.csv
     Numbers -> results/results.json

 Requirements: Python 3.9+, numpy, pandas, scipy, matplotlib
 Run:          python analysis.py
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

matplotlib.use("Agg")  # file output only; no display needed
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from scipy import stats  # noqa: E402

warnings.filterwarnings("ignore", category=UserWarning)
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "Dataset_13.csv"
FIG_DIR = ROOT / "figures"
RES_DIR = ROOT / "results"
TAB_DIR = RES_DIR / "tables"
FONT_DIR = ROOT / "assets" / "fonts"
for d in (FIG_DIR, RES_DIR, TAB_DIR):
    d.mkdir(parents=True, exist_ok=True)

SEED = 20261118          # one fixed seed -> every resampling result is reproducible
B = 20_000               # resamples per Monte-Carlo experiment
ALPHA = 0.05             # significance level for every test
rng = np.random.default_rng(SEED)

# ---- Visual identity (shared with the report and website) -------------------
PAPER = "#FBF8F2"        # ivory page
INK = "#141A26"          # primary ink (theory curves, text)
INK_SOFT = "#3B3F47"
MUTED = "#7A756B"
HAIR = "#E6DECD"         # gridlines
AXIS = "#CDBFA5"         # axis rules
NAVY = "#22304A"         # estimator series 1
GOLD = "#B07A1F"         # single-series data / estimator series 2
ROLE_ORDER = ["Batter", "All-rounder", "Bowler"]
ROLE_COLORS = {"Batter": "#B07A1F", "All-rounder": "#2E5FA8", "Bowler": "#B23A5E"}
# The three role colours were checked for colour-vision-deficiency separation
# (all pairs) and 3:1 contrast against the ivory page.


def _register_fonts():
    """Use the bundled premium fonts when present; fall back silently otherwise."""
    have = set()
    if FONT_DIR.exists():
        for f in sorted(FONT_DIR.glob("*.ttf")):
            try:
                font_manager.fontManager.addfont(str(f))
                have.add(font_manager.FontProperties(fname=str(f)).get_name())
            except Exception:  # pragma: no cover - font problems must never stop the analysis
                pass
    sans = [f for f in ("Jost", "EB Garamond") if f in have] + ["DejaVu Sans"]
    return sans, ("EB Garamond" in have)


SANS, HAVE_GARAMOND = _register_fonts()
plt.rcParams.update({
    "font.family": SANS,
    "font.size": 9,
    "font.weight": 400,
    "mathtext.fontset": "custom" if HAVE_GARAMOND else "dejavusans",
    "mathtext.rm": "EB Garamond" if HAVE_GARAMOND else "DejaVu Sans",
    "mathtext.it": "EB Garamond:italic" if HAVE_GARAMOND else "DejaVu Sans:italic",
    "mathtext.bf": "EB Garamond:medium" if HAVE_GARAMOND else "DejaVu Sans:bold",
    "figure.facecolor": PAPER,
    "axes.facecolor": PAPER,
    "savefig.facecolor": PAPER,
    "axes.edgecolor": AXIS,
    "axes.linewidth": 0.7,
    "axes.labelcolor": INK_SOFT,
    "axes.labelsize": 8.5,
    "axes.titlesize": 9,
    "axes.titleweight": 500,
    "axes.titlecolor": INK,
    "axes.titlelocation": "left",
    "axes.titlepad": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "axes.grid.axis": "y",
    "axes.axisbelow": True,
    "grid.color": HAIR,
    "grid.linewidth": 0.6,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "xtick.labelsize": 7.5,
    "ytick.labelsize": 7.5,
    "xtick.major.size": 0,
    "ytick.major.size": 0,
    "xtick.major.pad": 5,
    "ytick.major.pad": 5,
    "legend.frameon": False,
    "legend.fontsize": 7.5,
    "svg.fonttype": "none",
    "svg.hashsalt": "mfad-datathon",
    "savefig.dpi": 220,
})


def save(fig, name):
    """Save a figure as PNG (README/website) and SVG (crisp vector for the PDF report)."""
    fig.savefig(FIG_DIR / f"{name}.png", bbox_inches="tight", pad_inches=0.12)
    fig.savefig(FIG_DIR / f"{name}.svg", bbox_inches="tight", pad_inches=0.12)
    plt.close(fig)
    print(f"   [figure] figures/{name}.png  (+ .svg)")


def panel_title(ax, letter, text):
    ax.set_title(f"{letter}   {text.upper()}", fontsize=7.6, fontweight=500, color=INK, loc="left")


def fmt(x, d=2):
    """Thousands separator, d decimals, typographic minus sign; '-0.00' is shown as '0.00'."""
    out = f"{x:,.{d}f}"
    if out.startswith("-") and float(out[1:].replace(",", "")) == 0:
        out = out[1:]
    return out.replace("-", "−")


def fmt_p(p):
    """Readable p-value: 3 decimals, or '< 0.001' plus scientific notation."""
    if p < 0.001:
        mant, exp = f"{p:.2e}".split("e")
        return f"< 0.001", f"{float(mant):.2f} × 10^{int(exp)}"
    return f"{p:.3f}", f"{p:.3f}"


def header(title):
    print("\n" + "=" * 78 + f"\n {title}\n" + "=" * 78)


R = {"meta": {"seed": SEED, "B": B, "alpha": ALPHA}}   # every reported number goes here
D = {}                                               # pre-formatted strings for the report

# ==============================================================================
# 1. LOAD AND INSPECT THE DATA
# ==============================================================================
header("1. DATA INSPECTION")
df = pd.read_csv(DATA_PATH)
n, p_cols = df.shape
print(f"Rows (players): {n}   Columns: {p_cols}")
print(df.head().to_string(index=False))

NUMERIC = ["Practice_Hours", "Runs_Scored", "Strike_Rate", "Matches_Played", "Fitness_Score"]
missing = int(df.isna().sum().sum())
dup_rows = int(df.duplicated().sum())
ids_unique = bool(df["Player_ID"].is_unique)
print(f"Missing values: {missing}  |  Duplicate rows: {dup_rows}  |  Player_ID unique: {ids_unique}")

dictionary = pd.DataFrame([
    ["Player_ID", "Identifier", "Label PL01–PL30", "Excluded from all calculations"],
    ["Practice_Hours", "Numerical (continuous)", "Hours of practice (reference period undocumented)", "Context"],
    ["Runs_Scored", "Numerical (discrete count)", "Runs scored (reference period undocumented)", "Primary outcome (Tasks 1–5)"],
    ["Strike_Rate", "Numerical (continuous)", "Runs per 100 balls faced", "Context"],
    ["Matches_Played", "Numerical (discrete count)", "Number of matches played", "Context"],
    ["Fitness_Score", "Numerical (score)", "Fitness rating (scale undocumented)", "Context"],
    ["Player_Role", "Categorical (nominal, 3 levels)", "Batter / All-rounder / Bowler", "Grouping factor (Tasks 4–5)"],
], columns=["Variable", "Type", "Meaning", "Use in this study"])
dictionary.to_csv(TAB_DIR / "t0_variable_dictionary.csv", index=False)

desc = df[NUMERIC].agg(["count", "mean", "std", "min", "median", "max"]).T
desc["skewness"] = [stats.skew(df[c], bias=False) for c in NUMERIC]
desc["excess_kurtosis"] = [stats.kurtosis(df[c], bias=False) for c in NUMERIC]
desc = desc.round(3)
desc.to_csv(TAB_DIR / "t0_descriptives_all_numeric.csv")
print("\nDescriptive statistics (identifier excluded):\n" + desc.to_string())

corr_runs = {c: float(df["Runs_Scored"].corr(df[c])) for c in NUMERIC if c != "Runs_Scored"}
R["inspection"] = {
    "n": n, "columns": p_cols, "missing": missing, "duplicate_rows": dup_rows,
    "ids_unique": ids_unique, "corr_with_runs": corr_runs,
    "descriptives": json.loads(desc.to_json(orient="index")),
}
D.update({
    "n": str(n), "missing": str(missing), "dups": str(dup_rows),
    "r_runs_matches": fmt(corr_runs["Matches_Played"], 2),
    "r_runs_practice": fmt(corr_runs["Practice_Hours"], 2),
    "r_runs_sr": fmt(corr_runs["Strike_Rate"], 2),
})

for c in NUMERIC:
    D[f"min_{c}"] = fmt(df[c].min(), 1 if df[c].dtype.kind == "f" else 0)
    D[f"max_{c}"] = fmt(df[c].max(), 1 if df[c].dtype.kind == "f" else 0)
    D[f"mean_{c}"] = fmt(df[c].mean(), 1)
    D[f"sd_{c}"] = fmt(df[c].std(ddof=1), 1)
runs = df["Runs_Scored"].to_numpy(dtype=float)
groups = {r: df.loc[df["Player_Role"] == r, "Runs_Scored"].to_numpy(dtype=float) for r in ROLE_ORDER}

# ==============================================================================
# 2. TASK 1 · SAMPLING DESIGN AND POPULATION DEFINITION
# ==============================================================================
header("TASK 1 · SAMPLING DESIGN AND POPULATION DEFINITION")
role_counts = df["Player_Role"].value_counts().reindex(ROLE_ORDER)
role_props = role_counts / n
print("Observational unit : one cricket player (one row)")
print(f"Available sample   : n = {n} players (PL01–PL30)")
print("Sampling process   : NOT documented -> cannot be assumed random or representative")
print("Role composition   :", dict(role_counts))

# How surprising is a perfect 10/10/10 split if roles were drawn at random?
# Under simple random sampling from a population with equal role shares the
# counts follow Multinomial(30; 1/3, 1/3, 1/3).
log_p_exact = (math.lgamma(n + 1) - 3 * math.lgamma(n // 3 + 1)) - n * math.log(3)
p_exact_balance = math.exp(log_p_exact)
print(f"P(exactly 10/10/10 | multinomial, equal shares) = {p_exact_balance:.4f}")

mu_hat = runs.mean()
R["task1"] = {
    "role_counts": {k: int(v) for k, v in role_counts.items()},
    "role_props": {k: float(v) for k, v in role_props.items()},
    "p_exact_balance": p_exact_balance,
    "quantity_of_interest": "population mean of Runs_Scored (mu)",
}
D.update({"p_balance": fmt(p_exact_balance, 4), "p_balance_pct": fmt(100 * p_exact_balance, 1),
          "task1_bat": str(role_counts["Batter"]), "task1_ar": str(role_counts["All-rounder"]),
          "task1_bowl": str(role_counts["Bowler"])})
pd.DataFrame({"Role": ROLE_ORDER, "Count": role_counts.values,
              "Proportion": role_props.values.round(4)}).to_csv(TAB_DIR / "t1_role_composition.csv", index=False)

# Figure 1 · the sample at a glance: every player on every numerical variable
fig, axes = plt.subplots(1, 5, figsize=(10.2, 2.3), gridspec_kw={"wspace": 0.42})
labels = {"Practice_Hours": "Practice hours", "Runs_Scored": "Runs scored", "Strike_Rate": "Strike rate",
          "Matches_Played": "Matches played", "Fitness_Score": "Fitness score"}
jitter = np.random.default_rng(SEED + 1).uniform(-0.17, 0.17, size=n)
for ax, col in zip(axes, NUMERIC):
    for i, role in enumerate(ROLE_ORDER):
        m = (df["Player_Role"] == role).to_numpy()
        ax.scatter(i + jitter[m], df.loc[m, col], s=22, color=ROLE_COLORS[role], alpha=0.92,
                   edgecolor=PAPER, linewidth=0.9, zorder=3)
        ax.plot([i - 0.28, i + 0.28], [df.loc[m, col].mean()] * 2, color=INK, lw=1.4, zorder=4,
                solid_capstyle="round")
    ax.set_xticks(range(3), ["Bat", "AR", "Bowl"])
    ax.set_xlim(-0.6, 2.6)
    ax.set_title(labels[col].upper(), fontsize=7.4, fontweight=500, color=INK)
fig.legend(handles=[Line2D([], [], marker="o", ls="", color=ROLE_COLORS[r], label=r, markersize=5.5)
                    for r in ROLE_ORDER] + [Line2D([], [], color=INK, lw=1.4, label="Group mean")],
           loc="lower center", ncol=4, bbox_to_anchor=(0.5, -0.08))
save(fig, "fig01_sample_overview")

# ==============================================================================
# 3. TASK 2 · POINT ESTIMATION AND MEAN SQUARED ERROR
# ==============================================================================
header("TASK 2 · POINT ESTIMATION AND MSE  (variable: Runs_Scored)")
xbar = runs.mean()
s2 = runs.var(ddof=1)
s = math.sqrt(s2)
s2_n = runs.var(ddof=0)
se = s / math.sqrt(n)
t_crit = stats.t.ppf(1 - ALPHA / 2, df=n - 1)
ci = (xbar - t_crit * se, xbar + t_crit * se)
print(f"Sample mean x̄          = {xbar:.4f} runs")
print(f"Sample variance s²     = {s2:.4f} runs²   (divisor n−1)")
print(f"Sample SD s            = {s:.4f} runs")
print(f"Plug-in variance σ̂²    = {s2_n:.4f} runs²   (divisor n)")
print(f"Estimated SE(x̄)        = {se:.4f} runs ; estimated MSE(x̄) = s²/n = {s2 / n:.4f}")
print(f"95% t-interval for μ   = ({ci[0]:.2f}, {ci[1]:.2f})   [t*(29) = {t_crit:.4f}]")

# ---- Resampling illustration -------------------------------------------------
# Treat the 30 observed values as a pseudo-population (the empirical distribution).
# Its parameters are KNOWN, so bias, variance and MSE of any estimator can be
# measured exactly by drawing many samples of size m with replacement.
mu_star = runs.mean()
sig2_star = runs.var(ddof=0)
mu4_star = np.mean((runs - mu_star) ** 4)
kurt_star = mu4_star / sig2_star ** 2 - 3
med_star = float(np.median(runs))
sizes = [3, 5, 10, 15, 20, 30, 50, 100]
rows = []
keep_means = {}
for m in sizes:
    S = rng.choice(runs, size=(B, m), replace=True)
    est = {
        "Sample mean": (S.mean(axis=1), mu_star),
        "Sample median": (np.median(S, axis=1), mu_star),
        "S² (divisor n−1)": (S.var(axis=1, ddof=1), sig2_star),
        "σ̂² (divisor n)": (S.var(axis=1, ddof=0), sig2_star),
    }
    if m in (5, 10, 30):
        keep_means[m] = est["Sample mean"][0]
    # exact theory for the pseudo-population
    var_S2 = (mu4_star - (m - 3) / (m - 1) * sig2_star ** 2) / m
    theory = {
        "Sample mean": (0.0, sig2_star / m),
        "S² (divisor n−1)": (0.0, var_S2),
        "σ̂² (divisor n)": (-sig2_star / m, ((m - 1) / m) ** 2 * var_S2),
    }
    for name, (vals, target) in est.items():
        bias = vals.mean() - target
        var = vals.var(ddof=0)
        mse = np.mean((vals - target) ** 2)
        tb, tv = theory.get(name, (np.nan, np.nan))
        rows.append({"n": m, "estimator": name, "target": target, "bias": bias, "variance": var,
                     "bias_sq": bias ** 2, "mse": mse, "theory_bias": tb, "theory_var": tv,
                     "theory_mse": tv + tb ** 2 if not np.isnan(tv) else np.nan})
mse_tab = pd.DataFrame(rows)
mse_tab.round(4).to_csv(TAB_DIR / "t2_resampling_bias_variance_mse.csv", index=False)
show = mse_tab[mse_tab["n"].isin([5, 10, 30])][["n", "estimator", "bias", "variance", "mse", "theory_mse"]]
print("\nResampling (B = {:,}) – bias, variance, MSE:\n".format(B) + show.round(2).to_string(index=False))


def mse_of(name, m):
    return mse_tab[(mse_tab.estimator == name) & (mse_tab.n == m)].iloc[0]


eff_median = mse_of("Sample median", 30)["mse"] / mse_of("Sample mean", 30)["mse"]
cross = [m for m in sizes if mse_of("σ̂² (divisor n)", m)["mse"] < mse_of("S² (divisor n−1)", m)["mse"]]
print(f"MSE(median)/MSE(mean) at n=30: {eff_median:.3f}")
print(f"σ̂² (divisor n) has LOWER MSE than S² at n = {cross}")

R["task2"] = {
    "mean": xbar, "var": s2, "sd": s, "var_plugin": s2_n, "se": se, "mse_hat": s2 / n,
    "t_crit": t_crit, "ci95": ci, "pseudo_pop": {"mu": mu_star, "sigma2": sig2_star, "median": med_star,
                                                 "excess_kurtosis": kurt_star},
    "resampling": json.loads(mse_tab.to_json(orient="records")), "mse_ratio_median_mean_n30": eff_median,
    "plugin_lower_mse_at": cross,
}
r5, r30 = mse_of("Sample mean", 5), mse_of("Sample mean", 30)
S2_5, S2n_5 = mse_of("S² (divisor n−1)", 5), mse_of("σ̂² (divisor n)", 5)
S2_30, S2n_30 = mse_of("S² (divisor n−1)", 30), mse_of("σ̂² (divisor n)", 30)
D.update({
    "xbar": fmt(xbar, 2), "s2": fmt(s2, 2), "s": fmt(s, 2), "s2n": fmt(s2_n, 2), "se": fmt(se, 2),
    "mse_hat": fmt(s2 / n, 2), "tcrit": fmt(t_crit, 3), "ci_lo": fmt(ci[0], 1), "ci_hi": fmt(ci[1], 1),
    "sig2_star": fmt(sig2_star, 2), "kurt_star": fmt(kurt_star, 3), "med_star": fmt(med_star, 0),
    "mean_mse5": fmt(r5["mse"], 1), "mean_mse5_th": fmt(r5["theory_mse"], 1),
    "mean_mse30": fmt(r30["mse"], 1), "mean_mse30_th": fmt(r30["theory_mse"], 1),
    "mean_bias30": fmt(r30["bias"], 2),
    "med_mse30": fmt(mse_of("Sample median", 30)["mse"], 1), "med_bias30": fmt(mse_of("Sample median", 30)["bias"], 2),
    "eff_median": fmt(eff_median, 2),
    "S2_5_bias": fmt(S2_5["bias"], 1), "S2_5_var": fmt(S2_5["variance"], 0), "S2_5_mse": fmt(S2_5["mse"], 0),
    "S2n_5_bias": fmt(S2n_5["bias"], 1), "S2n_5_var": fmt(S2n_5["variance"], 0), "S2n_5_mse": fmt(S2n_5["mse"], 0),
    "S2_30_mse": fmt(S2_30["mse"], 0), "S2n_30_mse": fmt(S2n_30["mse"], 0),
    "S2n_5_bias_th": fmt(-sig2_star / 5, 1), "S2n_30_bias_th": fmt(-sig2_star / 30, 1),
    "S2_30_bias": fmt(S2_30["bias"], 1), "S2n_30_bias": fmt(S2n_30["bias"], 1),
})
EST_KEYS = {"Sample mean": "mean", "Sample median": "median", "S² (divisor n−1)": "S2", "σ̂² (divisor n)": "S2n"}
for _, r in mse_tab.iterrows():
    key = f"t2_{EST_KEYS[r['estimator']]}_{int(r['n'])}"
    scale, dd = (1e6, 2) if EST_KEYS[r["estimator"]] in ("S2", "S2n") else (1.0, 1)
    D[key + "_bias"] = fmt(r["bias"], 1 if scale == 1e6 else 2)          # bias always in original units
    D[key + "_var"] = fmt(r["variance"] / scale, dd)
    D[key + "_mse"] = fmt(r["mse"] / scale, dd)
    D[key + "_th"] = "—" if np.isnan(r["theory_mse"]) else fmt(r["theory_mse"] / scale, dd)
for m in (5, 10, 30):
    sd_m = keep_means[m].std(ddof=0)
    D[f"sdmean_{m}"] = fmt(sd_m, 1)
    D[f"sdmean_{m}_th"] = fmt(math.sqrt(sig2_star / m), 1)

# Figure 2 · sampling distribution of the mean narrows; MSE falls like 1/n
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 3.05), gridspec_kw={"wspace": 0.28, "width_ratios": [1.15, 1]})
bins = np.linspace(80, 350, 70)
shade = {5: "#D9C7A0", 10: "#B9975A", 30: GOLD}
for m in (5, 10, 30):
    h, e = np.histogram(keep_means[m], bins=bins, density=True)
    c = 0.5 * (e[1:] + e[:-1])
    a1.fill_between(c, h, color=shade[m], alpha=0.25 if m != 30 else 0.35, lw=0, step="mid")
    a1.step(c, h, where="mid", color=shade[m], lw=1.4 if m == 30 else 1.1, label=f"n = {m}")
a1.axvline(mu_star, color=INK, lw=1.0)
a1.annotate("pseudo-population mean\n$\\mu^*$ = " + fmt(mu_star, 1) + " runs", xy=(mu_star, a1.get_ylim()[1] * 0.82),
            xytext=(268, a1.get_ylim()[1] * 0.82), fontsize=7, color=INK_SOFT, va="center",
            arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.6))
a1.set_xlabel("Sample mean of Runs_Scored (runs)")
a1.set_ylabel("Density")
a1.set_yticks([])
a1.legend(loc="upper left", handlelength=1.4)
panel_title(a1, "A", f"Sampling distribution of the mean · B = {B:,}")
th = mse_tab[mse_tab.estimator == "Sample mean"]
a2.plot(th["n"], th["theory_mse"], color="#D9C7A0", lw=7, alpha=0.75, solid_capstyle="round",
        label="Theory for the mean:  $\\sigma^2/n$")
for name, col, mk in [("Sample mean", NAVY, "o"), ("Sample median", GOLD, "D")]:
    sub = mse_tab[mse_tab.estimator == name]
    a2.plot(sub["n"], sub["mse"], color=col, lw=2, marker=mk, ms=5.2, mec=PAPER, mew=1.2, label=f"{name} (simulated)")
a2.set_xscale("log")
a2.set_yscale("log")
a2.set_xticks(sizes, [str(v) for v in sizes])
a2.minorticks_off()
a2.set_yticks([50, 100, 200, 500, 1000, 2000, 4000], ["50", "100", "200", "500", "1,000", "2,000", "4,000"])
a2.grid(True, axis="both")
a2.set_xlabel("Sample size n (log scale)")
a2.set_ylabel("MSE (runs², log scale)")
a2.legend(loc="lower left")
panel_title(a2, "B", "Mean squared error versus sample size")
save(fig, "fig02_sampling_distribution_mse")

# Figure 3 · MSE = Variance + Bias² for the two variance estimators
fig, ax = plt.subplots(figsize=(10.2, 2.6))
pos, labels_x = [], []
k = 0
for m in (5, 10, 30):
    for j, (name, col) in enumerate([("S² (divisor n−1)", NAVY), ("σ̂² (divisor n)", GOLD)]):
        r = mse_of(name, m)
        x = k + j * 0.86
        ax.bar(x, r["variance"] / 1e6, width=0.8, color=col, alpha=0.88, lw=0)
        ax.bar(x, r["bias_sq"] / 1e6, bottom=r["variance"] / 1e6, width=0.8, color="#C9B48A", lw=0,
               hatch="////", edgecolor=PAPER)
        ax.text(x, r["mse"] / 1e6 + 0.12, fmt(r["mse"] / 1e6, 2), ha="center", fontsize=7, color=INK_SOFT)
    pos.append(k + 0.43)
    labels_x.append(f"n = {m}")
    k += 2.6
ax.set_xticks(pos, labels_x)
ax.set_ylabel("Millions of runs⁴")
ax.legend(handles=[Patch(color=NAVY, label="Variance · S² (divisor n−1, unbiased)"),
                   Patch(color=GOLD, label="Variance · σ̂² (divisor n, biased)"),
                   Patch(facecolor="#C9B48A", hatch="////", edgecolor=PAPER, label="Bias²")],
          loc="upper right", ncol=1)
panel_title(ax, "", "MSE decomposition of two variance estimators (bar height = MSE)")
save(fig, "fig03_variance_estimator_mse")

# ==============================================================================
# 4. TASK 3 · NORMAL MODEL AND THE CENTRAL LIMIT THEOREM
# ==============================================================================
header("TASK 3 · NORMAL MODEL AND CLT  (variable: Runs_Scored)")
q1, med, q3 = np.percentile(runs, [25, 50, 75])
iqr = q3 - q1
skew = stats.skew(runs, bias=False)
kurt = stats.kurtosis(runs, bias=False)
lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
outliers = runs[(runs < lo_f) | (runs > hi_f)]
within = {k_: float(np.mean(np.abs(runs - xbar) <= k_ * s)) for k_ in (1, 2, 3)}
sw = stats.shapiro(runs)
summary3 = {"n": n, "mean": xbar, "median": med, "sd": s, "min": runs.min(), "q1": q1, "q3": q3,
            "iqr": iqr, "max": runs.max(), "range": runs.max() - runs.min(), "skewness": skew,
            "excess_kurtosis": kurt, "cv_pct": 100 * s / xbar}
pd.Series(summary3).round(3).to_csv(TAB_DIR / "t3_runs_summary.csv", header=["value"])
print(pd.Series(summary3).round(3).to_string())
print(f"Tukey fences: [{lo_f:.1f}, {hi_f:.1f}] -> outliers: {list(outliers)}")
print("Share within ±1, ±2, ±3 SD:", {k_: round(v, 3) for k_, v in within.items()}, " (normal: 0.683, 0.954, 0.997)")
print(f"Shapiro–Wilk: W = {sw.statistic:.4f}, p = {sw.pvalue:.4f}")

# Q–Q envelope: 95% pointwise band from 10,000 simulated normal samples of size 30
pp = (np.arange(1, n + 1) - 0.375) / (n + 0.25)            # Blom plotting positions
theo_q = stats.norm.ppf(pp)
z_sorted = np.sort((runs - xbar) / s)
sims = np.sort(rng.standard_normal((10_000, n)), axis=1)
sims = (sims - sims.mean(axis=1, keepdims=True)) / sims.std(axis=1, ddof=1, keepdims=True)
env_lo, env_hi = np.percentile(sims, [2.5, 97.5], axis=0)
outside_env = int(np.sum((z_sorted < env_lo) | (z_sorted > env_hi)))
qq_r = float(np.corrcoef(theo_q, z_sorted)[0, 1])
print(f"Q–Q correlation = {qq_r:.4f}; points outside 95% envelope = {outside_env}")

# Figure 4 · distribution of observations and normal Q–Q plot
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 3.5), gridspec_kw={"wspace": 0.26})
edges = np.arange(50, 425, 25)
a1.hist(runs, bins=edges, color=GOLD, alpha=0.88, edgecolor=PAPER, linewidth=2)
xx = np.linspace(20, 420, 400)
a1.plot(xx, stats.norm.pdf(xx, xbar, s) * n * 25, color=INK, lw=1.6, label=f"Normal curve with $\\bar{{x}}$ = {xbar:.1f}, $s$ = {s:.1f}")
a1.axvline(xbar, color=INK, lw=0.8, ls=(0, (1, 2)))
a1.axvline(med, color=GOLD, lw=0.8)
a1.text(xbar - 4, 7.25, "mean", ha="right", fontsize=6.8, color=INK_SOFT)
a1.text(med + 4, 7.25, "median", ha="left", fontsize=6.8, color=GOLD)
a1.set_ylim(0, 7.8)
a1.set_xlabel("Runs scored")
a1.set_ylabel("Number of players")
a1.legend(loc="upper right", bbox_to_anchor=(1.0, 0.88))
panel_title(a1, "A", "Distribution of the 30 observations")
a2.fill_between(theo_q, env_lo, env_hi, color="#E9DEC6", lw=0, label="95% simulation envelope")
a2.plot([-2.6, 2.6], [-2.6, 2.6], color=INK, lw=1.0)
a2.scatter(theo_q, z_sorted, s=24, color=GOLD, edgecolor=PAPER, lw=1.0, zorder=3, label="Standardised runs")
a2.set_xlabel("Theoretical N(0, 1) quantile")
a2.set_ylabel("Standardised sample quantile")
a2.grid(True, axis="both")
a2.text(0.98, 0.04, f"Shapiro–Wilk  W = {sw.statistic:.3f},  p = {sw.pvalue:.3f}", transform=a2.transAxes,
        ha="right", fontsize=7.2, color=INK_SOFT)
a2.legend(loc="upper left")
panel_title(a2, "B", "Normal Q–Q plot")
save(fig, "fig04_runs_normality")

# ---- CLT resampling ---------------------------------------------------------
# Parent 1: Runs_Scored (roughly symmetric, light-tailed).
# Parent 2: indicator of a high-output player, I(Runs_Scored >= 300) -> strongly skewed
#           Bernoulli(p = 5/30). Its sample mean is the sample proportion.
high = (runs >= 300).astype(float)
parents = {"Runs_Scored": runs, "High-output indicator (Runs ≥ 300)": high}
clt_sizes = [1, 2, 5, 10, 30, 50]
clt_rows, clt_keep = [], {}
for pname, pop in parents.items():
    mu_p, sd_p = pop.mean(), pop.std(ddof=0)
    for m in clt_sizes:
        means = rng.choice(pop, size=(B, m), replace=True).mean(axis=1)
        if m in (1, 5, 30):
            clt_keep[(pname, m)] = means
        clt_rows.append({"parent": pname, "n": m, "mean_of_means": means.mean(), "sd_of_means": means.std(ddof=0),
                         "theory_sd": sd_p / math.sqrt(m), "skewness": stats.skew(means),
                         "excess_kurtosis": stats.kurtosis(means)})
clt_tab = pd.DataFrame(clt_rows)
clt_tab.round(4).to_csv(TAB_DIR / "t3_clt_resampling.csv", index=False)
print("\nCLT resampling (B = {:,}):\n".format(B) + clt_tab.round(3).to_string(index=False))


def clt(pname, m, col):
    return clt_tab[(clt_tab.parent == pname) & (clt_tab.n == m)].iloc[0][col]


# Figure 5 · CLT small multiples
fig, axes = plt.subplots(2, 3, figsize=(10.2, 5.0), gridspec_kw={"wspace": 0.18, "hspace": 0.62})
for i, (pname, pop) in enumerate(parents.items()):
    mu_p, sd_p = pop.mean(), pop.std(ddof=0)
    for j, m in enumerate((1, 5, 30)):
        ax = axes[i, j]
        v = clt_keep[(pname, m)]
        if i == 1:  # the sample proportion lives on the lattice 0, 1/m, ..., 1
            lattice = np.arange(m + 1) / m
            freq = np.array([(np.isclose(v, t)).mean() for t in lattice])
            keep = freq > 0
            width = 0.8 / m if m > 1 else 0.12
            ax.bar(lattice[keep], freq[keep] * m, width=width, color=GOLD, alpha=0.88, lw=0)  # density = prob / spacing
            xx = np.linspace(-0.15, 1.0 if m == 1 else 0.75, 400)
        else:
            lo_, hi_ = (40, 420) if m == 1 else (60, 370)
            ax.hist(v, bins=np.linspace(lo_, hi_, 34 if m > 1 else 16), density=True, color=GOLD,
                    alpha=0.88, edgecolor=PAPER, lw=0.6)
            xx = np.linspace(lo_, hi_, 400)
        ax.plot(xx, stats.norm.pdf(xx, mu_p, sd_p / math.sqrt(m)), color=INK, lw=1.3)
        ax.set_yticks([])
        ttl = "PARENT DISTRIBUTION  (n = 1)" if m == 1 else f"SAMPLE MEANS  (n = {m})"
        ax.set_title(ttl, fontsize=7.2, fontweight=500, color=INK, loc="left")
        ax.text(0.98, 0.95, f"skew {clt(pname, m, 'skewness'):+.2f}", transform=ax.transAxes,
                ha="right", va="top", fontsize=7, color=INK_SOFT)
        if i == 1 and m == 1:
            ax.set_xlim(-0.2, 1.2)
    axes[i, 0].set_ylabel(("Runs_Scored" if i == 0 else "I(Runs ≥ 300)"), fontsize=8, color=INK)
fig.text(0.5, 0.505, "Row 2 · a strongly skewed parent: the share of high-output players (Bernoulli, p = 1/6)",
         ha="center", fontsize=7.4, color=MUTED)
fig.text(0.5, 0.95, "Row 1 · Runs_Scored resampled from the 30 observed values", ha="center", fontsize=7.4, color=MUTED)
fig.legend(handles=[Patch(color=GOLD, label=f"Resampled means (B = {B:,})"),
                    Line2D([], [], color=INK, lw=1.3, label="Normal curve predicted by the CLT:  N(μ, σ²/n)")],
           loc="lower center", ncol=2, bbox_to_anchor=(0.5, -0.03))
save(fig, "fig05_clt_resampling")

p_negative = stats.norm.cdf(0, xbar, s)           # normal model's probability of a negative run total
gamma_high = stats.skew(high)                      # skewness of the Bernoulli parent
P1, P2 = "Runs_Scored", "High-output indicator (Runs ≥ 300)"
for pname, tag in ((P1, "r"), (P2, "h")):
    for m in clt_sizes:
        D[f"clt_{tag}_{m}_sd"] = fmt(clt(pname, m, "sd_of_means"), 2 if tag == "r" else 4)
        D[f"clt_{tag}_{m}_th"] = fmt(clt(pname, m, "theory_sd"), 2 if tag == "r" else 4)
        D[f"clt_{tag}_{m}_sk"] = fmt(clt(pname, m, "skewness"), 3)
        D[f"clt_{tag}_{m}_ku"] = fmt(clt(pname, m, "excess_kurtosis"), 3)
        D[f"clt_{tag}_{m}_skth"] = fmt(stats.skew(parents[pname]) / math.sqrt(m), 3)
print(f"Normal model P(Runs < 0) = {p_negative:.4f};  Bernoulli parent skewness = {gamma_high:.3f}")
D.update({"p_negative": fmt(p_negative, 4), "gamma_high": fmt(gamma_high, 2),
          "skth_h_30": fmt(gamma_high / math.sqrt(30), 2)})
R["task3"] = {"summary": summary3, "p_negative": p_negative, "tukey_fences": [lo_f, hi_f], "outliers": outliers.tolist(),
              "within_k_sd": within, "shapiro": {"W": sw.statistic, "p": sw.pvalue}, "qq_r": qq_r,
              "points_outside_envelope": outside_env, "clt": json.loads(clt_tab.to_json(orient="records")),
              "high_output_p": float(high.mean())}
D.update({
    "median": fmt(med, 1), "q1": fmt(q1, 2), "q3": fmt(q3, 2), "iqr": fmt(iqr, 2), "min": fmt(runs.min(), 0),
    "max": fmt(runs.max(), 0), "range": fmt(runs.max() - runs.min(), 0), "skew": fmt(skew, 3),
    "kurt": fmt(kurt, 3), "cv": fmt(100 * s / xbar, 1), "fence_lo": fmt(lo_f, 1), "fence_hi": fmt(hi_f, 1),
    "n_outliers": str(len(outliers)), "w1": fmt(100 * within[1], 1), "w2": fmt(100 * within[2], 1),
    "w3": fmt(100 * within[3], 1), "sw_W": fmt(sw.statistic, 4), "sw_p": fmt(sw.pvalue, 3), "qq_r": fmt(qq_r, 3),
    "outside_env": str(outside_env), "high_n": str(int(high.sum())), "high_p": fmt(high.mean(), 3),
    "clt_r_sd1": fmt(clt(P1, 1, "sd_of_means"), 1), "clt_r_sd30": fmt(clt(P1, 30, "sd_of_means"), 2),
    "clt_r_sd30_th": fmt(clt(P1, 30, "theory_sd"), 2), "clt_r_sk1": fmt(clt(P1, 1, "skewness"), 2),
    "clt_r_sk30": fmt(clt(P1, 30, "skewness"), 3), "clt_r_ku1": fmt(clt(P1, 1, "excess_kurtosis"), 2),
    "clt_r_ku30": fmt(clt(P1, 30, "excess_kurtosis"), 3),
    "clt_h_sk1": fmt(clt(P2, 1, "skewness"), 2), "clt_h_sk5": fmt(clt(P2, 5, "skewness"), 2),
    "clt_h_sk30": fmt(clt(P2, 30, "skewness"), 2), "clt_h_sk50": fmt(clt(P2, 50, "skewness"), 2),
    "clt_h_sd30": fmt(clt(P2, 30, "sd_of_means"), 4), "clt_h_sd30_th": fmt(clt(P2, 30, "theory_sd"), 4),
    "clt_h_np30": fmt(30 * high.mean(), 1),
})

# ==============================================================================
# 5. TASK 4 · ONE-WAY ANOVA  (Runs_Scored ~ Player_Role)
# ==============================================================================
header("TASK 4 · ONE-WAY ANOVA  (Runs_Scored by Player_Role)")
k = len(ROLE_ORDER)
grand = runs.mean()
gsum = pd.DataFrame({
    "Role": ROLE_ORDER,
    "n": [len(groups[r]) for r in ROLE_ORDER],
    "Mean": [groups[r].mean() for r in ROLE_ORDER],
    "SD": [groups[r].std(ddof=1) for r in ROLE_ORDER],
    "Median": [np.median(groups[r]) for r in ROLE_ORDER],
    "Min": [groups[r].min() for r in ROLE_ORDER],
    "Max": [groups[r].max() for r in ROLE_ORDER],
})
gsum["SE"] = gsum["SD"] / np.sqrt(gsum["n"])
gsum["Shapiro_W"] = [stats.shapiro(groups[r]).statistic for r in ROLE_ORDER]
gsum["Shapiro_p"] = [stats.shapiro(groups[r]).pvalue for r in ROLE_ORDER]
gsum.round(4).to_csv(TAB_DIR / "t4_group_summaries.csv", index=False)
print(gsum.round(3).to_string(index=False))

ss_between = sum(len(g) * (g.mean() - grand) ** 2 for g in groups.values())
ss_within = sum(((g - g.mean()) ** 2).sum() for g in groups.values())
ss_total = ((runs - grand) ** 2).sum()
df_b, df_w = k - 1, n - k
ms_b, ms_w = ss_between / df_b, ss_within / df_w
F = ms_b / ms_w
p_F = stats.f.sf(F, df_b, df_w)
F_crit = stats.f.ppf(1 - ALPHA, df_b, df_w)
F_check = stats.f_oneway(*groups.values())
assert np.isclose(F, F_check.statistic) and np.isclose(p_F, F_check.pvalue)
eta2 = ss_between / ss_total
omega2 = (ss_between - df_b * ms_w) / (ss_total + ms_w)
cohen_f = math.sqrt(eta2 / (1 - eta2))
lev = stats.levene(*groups.values(), center="median")  # Brown–Forsythe version (robust)
sd_ratio = gsum["SD"].max() / gsum["SD"].min()
resid = np.concatenate([groups[r] - groups[r].mean() for r in ROLE_ORDER])
sw_res = stats.shapiro(resid)

anova_tab = pd.DataFrame({
    "Source": ["Between roles", "Within roles (error)", "Total"],
    "SS": [ss_between, ss_within, ss_total], "df": [df_b, df_w, n - 1],
    "MS": [ms_b, ms_w, np.nan], "F": [F, np.nan, np.nan], "p_value": [p_F, np.nan, np.nan],
})
anova_tab.to_csv(TAB_DIR / "t4_anova_table.csv", index=False)
print("\n" + anova_tab.round(4).to_string(index=False))
print(f"F critical (α = {ALPHA}, df = {df_b}, {df_w}) = {F_crit:.4f}")
print(f"η² = {eta2:.4f}   ω² = {omega2:.4f}   Cohen's f = {cohen_f:.3f}")
print(f"Levene/Brown–Forsythe: W = {lev.statistic:.4f}, p = {lev.pvalue:.4f};  SD ratio = {sd_ratio:.3f}")
print(f"Shapiro–Wilk on pooled residuals: W = {sw_res.statistic:.4f}, p = {sw_res.pvalue:.4f}")

# Figure 6 · group distributions and residual Q–Q plot
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.2, 3.6), gridspec_kw={"wspace": 0.26, "width_ratios": [1.35, 1]})
jit = np.random.default_rng(SEED + 2).uniform(-0.13, 0.13, size=10)
for i, r in enumerate(ROLE_ORDER):
    g = groups[r]
    q1g, q3g = np.percentile(g, [25, 75])
    a1.add_patch(plt.Rectangle((i - 0.27, q1g), 0.54, q3g - q1g, facecolor=ROLE_COLORS[r], alpha=0.13, lw=0))
    a1.plot([i, i], [g.min(), q1g], color=ROLE_COLORS[r], lw=0.9, alpha=0.6)
    a1.plot([i, i], [q3g, g.max()], color=ROLE_COLORS[r], lw=0.9, alpha=0.6)
    a1.scatter(i + jit, g, s=30, color=ROLE_COLORS[r], edgecolor=PAPER, lw=1.1, zorder=3)
    a1.plot([i - 0.3, i + 0.3], [g.mean()] * 2, color=INK, lw=1.8, solid_capstyle="round", zorder=4)
    a1.text(i + 0.34, g.mean(), f"$\\bar{{x}}$ = {g.mean():.1f}\n$s$ = {g.std(ddof=1):.1f}", va="center", fontsize=7, color=INK_SOFT)
a1.axhline(grand, color=MUTED, lw=0.8, ls=(0, (1, 2)))
a1.text(2.95, grand + 6, f"grand mean {grand:.1f}", ha="right", fontsize=6.8, color=MUTED)
a1.set_xticks(range(3), [f"{r}\n(n = 10)" for r in ROLE_ORDER])
a1.set_xlim(-0.55, 3.0)
a1.set_ylabel("Runs scored")
panel_title(a1, "A", "Runs scored by player role")
theo_r = stats.norm.ppf((np.arange(1, n + 1) - 0.375) / (n + 0.25))
order = np.argsort(resid)
z_res = resid[order] / math.sqrt(ms_w)
role_of_res = np.concatenate([[r] * 10 for r in ROLE_ORDER])[order]
a2.plot([-2.6, 2.6], [-2.6, 2.6], color=INK, lw=1.0)
a2.scatter(theo_r, z_res, s=24, c=[ROLE_COLORS[r] for r in role_of_res], edgecolor=PAPER, lw=1.0, zorder=3)
a2.grid(True, axis="both")
a2.set_xlabel("Theoretical N(0, 1) quantile")
a2.set_ylabel("Residual / √MSW")
a2.text(0.98, 0.04, f"Shapiro–Wilk on residuals  W = {sw_res.statistic:.3f},  p = {sw_res.pvalue:.3f}",
        transform=a2.transAxes, ha="right", fontsize=7.0, color=INK_SOFT)
a2.legend(handles=[Line2D([], [], marker="o", ls="", color=ROLE_COLORS[r], label=r, markersize=5) for r in ROLE_ORDER],
          loc="upper left")
panel_title(a2, "B", "Assumption check · residual Q–Q plot")
save(fig, "fig06_anova_groups")

# Figure 7 · where the observed F sits on the F(2, 27) reference distribution
fig, ax = plt.subplots(figsize=(10.2, 2.7))
xf = np.linspace(0.001, 36, 1200)
ax.plot(xf, stats.f.pdf(xf, df_b, df_w), color=INK, lw=1.5)
tail = xf >= F_crit
ax.fill_between(xf[tail], stats.f.pdf(xf[tail], df_b, df_w), color="#B23A5E", alpha=0.22, lw=0)
ax.axvline(F_crit, color="#B23A5E", lw=0.9)
ax.text(F_crit + 0.4, 0.82, f"critical value F₀.₀₅ = {F_crit:.2f}\nrejection region (α = 0.05)", fontsize=7,
        color="#B23A5E", va="top")
ax.axvline(F, color=GOLD, lw=2.0)
ax.scatter([F], [0], s=46, color=GOLD, edgecolor=PAPER, lw=1.2, zorder=5, clip_on=False)
_m, _e = f"{p_F:.2e}".split("e")
ax.text(F - 0.5, 0.82, f"observed F = {F:.2f}\np = ${float(_m):.2f} \\times 10^{{{int(_e)}}}$", ha="right", va="top",
        fontsize=7.4, color=INK)
ax.set_xlim(0, 36)
ax.set_ylim(0, 1.0)
ax.set_xlabel(f"F statistic  (df = {df_b}, {df_w})")
ax.set_ylabel("Density")
panel_title(ax, "", f"Reference distribution F({df_b}, {df_w}) under H₀")
save(fig, "fig07_f_distribution")

pooled_sd = math.sqrt(ms_w)
mean_range = gsum["Mean"].max() - gsum["Mean"].min()
fwer3 = 1 - (1 - ALPHA) ** 3                       # chance of >=1 false positive in 3 independent t-tests
print(f"Pooled SD = {pooled_sd:.3f};  spread of group means = {mean_range:.1f};  FWER(3 tests) = {fwer3:.4f}")
D.update({"pooled_sd": fmt(pooled_sd, 1), "mean_range": fmt(mean_range, 1), "fwer3": fmt(fwer3, 3),
          "fwer3_pct": fmt(100 * fwer3, 1), "range_in_sd": fmt(mean_range / pooled_sd, 1)})
R["task4"] = {"pooled_sd": pooled_sd, "mean_range": mean_range, "fwer3": fwer3,
    "groups": json.loads(gsum.to_json(orient="records")), "grand_mean": grand,
    "SSB": ss_between, "SSW": ss_within, "SST": ss_total, "df_between": df_b, "df_within": df_w,
    "MSB": ms_b, "MSW": ms_w, "F": F, "p": p_F, "F_crit": F_crit, "eta2": eta2, "omega2": omega2,
    "cohen_f": cohen_f, "levene": {"W": lev.statistic, "p": lev.pvalue}, "sd_ratio": sd_ratio,
    "shapiro_residuals": {"W": sw_res.statistic, "p": sw_res.pvalue},
}
gs = gsum.set_index("Role")
for r, key in zip(ROLE_ORDER, ("bat", "ar", "bowl")):
    D.update({f"{key}_mean": fmt(gs.loc[r, "Mean"], 1), f"{key}_sd": fmt(gs.loc[r, "SD"], 2),
              f"{key}_med": fmt(gs.loc[r, "Median"], 1), f"{key}_min": fmt(gs.loc[r, "Min"], 0),
              f"{key}_max": fmt(gs.loc[r, "Max"], 0), f"{key}_se": fmt(gs.loc[r, "SE"], 2),
              f"{key}_swW": fmt(gs.loc[r, "Shapiro_W"], 3), f"{key}_swp": fmt(gs.loc[r, "Shapiro_p"], 3)})
D.update({
    "grand": fmt(grand, 1), "SSB": fmt(ss_between, 1), "SSW": fmt(ss_within, 1), "SST": fmt(ss_total, 1),
    "dfb": str(df_b), "dfw": str(df_w), "dft": str(n - 1), "MSB": fmt(ms_b, 1), "MSW": fmt(ms_w, 1),
    "F": fmt(F, 2), "F4": fmt(F, 4), "pF": fmt_p(p_F)[0], "pF_sci": fmt_p(p_F)[1], "Fcrit": fmt(F_crit, 3),
    "eta2": fmt(eta2, 3), "eta2_pct": fmt(100 * eta2, 1), "omega2": fmt(omega2, 3), "cohen_f": fmt(cohen_f, 2),
    "lev_W": fmt(lev.statistic, 3), "lev_p": fmt(lev.pvalue, 3), "sd_ratio": fmt(sd_ratio, 2),
    "swres_W": fmt(sw_res.statistic, 3), "swres_p": fmt(sw_res.pvalue, 3),
})

# ==============================================================================
# 6. TASK 5 · CHI-SQUARE GOODNESS-OF-FIT
# ==============================================================================
header("TASK 5 · CHI-SQUARE GOODNESS-OF-FIT")
# ---- 5A  Primary test: is the normal model of Task 3 adequate for Runs_Scored?
# Expected distribution fixed BEFORE counting: K = 5 classes that are equally
# probable under the fitted normal model N(mu_hat, sigma_hat^2) (maximum-likelihood
# estimates), so each class has expected probability 1/5 and expected count 30/5 = 6.
K = 5
mu_mle, sd_mle = runs.mean(), runs.std(ddof=0)
cuts = stats.norm.ppf(np.arange(1, K) / K, mu_mle, sd_mle)
edges5 = np.concatenate([[-np.inf], cuts, [np.inf]])
obs5 = np.histogram(runs, bins=edges5)[0]
exp5 = np.full(K, n / K)
chi2_5 = float(((obs5 - exp5) ** 2 / exp5).sum())
df5 = K - 1 - 2                       # two parameters estimated from the data
p5 = stats.chi2.sf(chi2_5, df5)
p5_upper = stats.chi2.sf(chi2_5, K - 1)  # Chernoff–Lehmann: true p lies between these
crit5 = stats.chi2.ppf(1 - ALPHA, df5)
w5 = math.sqrt(chi2_5 / n)
labels5 = [f"< {cuts[0]:.1f}"] + [f"{cuts[i]:.1f} – {cuts[i + 1]:.1f}" for i in range(K - 2)] + [f"≥ {cuts[-1]:.1f}"]
gof5 = pd.DataFrame({"Class (runs)": labels5, "Expected_prob": 1 / K, "Observed": obs5, "Expected": exp5,
                     "(O-E)^2/E": (obs5 - exp5) ** 2 / exp5})
gof5.round(4).to_csv(TAB_DIR / "t5a_chisq_normal_fit.csv", index=False)
print(gof5.round(3).to_string(index=False))
print(f"χ² = {chi2_5:.4f}, df = {df5}, p = {p5:.4f}  (upper bound with df = {K - 1}: p = {p5_upper:.4f});"
      f"  critical value = {crit5:.3f};  Cohen's w = {w5:.3f}")

# ---- 5B  Supplementary test: is any role over-represented? (uniform 1/3 each)
obs_r = role_counts.to_numpy()
exp_r = np.full(3, n / 3)
gof_r = stats.chisquare(obs_r, exp_r)
crit_r = stats.chi2.ppf(1 - ALPHA, 2)
gof_role = pd.DataFrame({"Role": ROLE_ORDER, "Expected_prob": 1 / 3, "Observed": obs_r, "Expected": exp_r,
                         "(O-E)^2/E": (obs_r - exp_r) ** 2 / exp_r})
gof_role.round(4).to_csv(TAB_DIR / "t5b_chisq_role_uniform.csv", index=False)
print("\n" + gof_role.round(3).to_string(index=False))
print(f"χ² = {gof_r.statistic:.4f}, df = 2, p = {gof_r.pvalue:.4f};  critical value = {crit_r:.3f}")

# Figure 8 · observed vs expected counts for the normal-model test
fig, ax = plt.subplots(figsize=(10.2, 3.1))
x5 = np.arange(K)
ax.bar(x5 - 0.2, exp5, width=0.38, color="#D8CDB6", lw=0, label="Expected under the normal model (6 per class)")
ax.bar(x5 + 0.2, obs5, width=0.38, color=GOLD, lw=0, label="Observed")
for i in range(K):
    ax.text(x5[i] + 0.2, obs5[i] + 0.15, str(obs5[i]), ha="center", fontsize=7.5, color=INK)
ax.set_xticks(x5, [f"Class {i + 1}\n{lab}" for i, lab in enumerate(labels5)])
ax.set_ylim(0, 9.6)
ax.set_ylabel("Number of players")
ax.legend(loc="upper right", ncol=2)
ax.text(0.02, 0.93, f"χ² = {chi2_5:.2f}   ·   df = {df5}   ·   p = {p5:.3f}", transform=ax.transAxes, fontsize=7.6, color=INK)
panel_title(ax, "", "Chi-square goodness-of-fit · Runs_Scored against five equal-probability normal classes")
save(fig, "fig08_chisq_gof")

R["task5"] = {
    "normal_fit": {"K": K, "mu_mle": mu_mle, "sd_mle": sd_mle, "cuts": cuts.tolist(), "observed": obs5.tolist(),
                   "expected": exp5.tolist(), "chi2": chi2_5, "df": df5, "p": p5, "p_upper_df4": p5_upper,
                   "critical": crit5, "cohen_w": w5},
    "role_uniform": {"observed": obs_r.tolist(), "expected": exp_r.tolist(), "chi2": float(gof_r.statistic),
                     "df": 2, "p": float(gof_r.pvalue), "critical": crit_r},
}
D.update({
    "mu_mle": fmt(mu_mle, 2), "sd_mle": fmt(sd_mle, 2), "chi2": fmt(chi2_5, 3), "df5": str(df5),
    "p5": fmt(p5, 3), "p5_upper": fmt(p5_upper, 3), "crit5": fmt(crit5, 3), "w5": fmt(w5, 3),
    "chi2_role": fmt(gof_r.statistic, 3), "p_role": fmt(gof_r.pvalue, 3), "crit_role": fmt(crit_r, 3),
})
for i in range(K):
    D[f"c{i + 1}_lab"] = labels5[i]
    D[f"c{i + 1}_o"] = str(obs5[i])
    D[f"c{i + 1}_e"] = fmt(exp5[i], 1)
    D[f"c{i + 1}_x"] = fmt((obs5[i] - exp5[i]) ** 2 / exp5[i], 3)
for i, c in enumerate(cuts):
    D[f"cut{i + 1}"] = fmt(c, 1)

# ==============================================================================
# 7. EXPORT
# ==============================================================================
header("EXPORT")


def _clean(o):
    if isinstance(o, dict):
        return {str(k_): _clean(v) for k_, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if (isinstance(o, float) or isinstance(o, np.floating)) and math.isnan(o) else float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


R["meta"]["versions"] = {"python": __import__("platform").python_version(), "numpy": np.__version__,
                         "pandas": pd.__version__, "scipy": __import__("scipy").__version__,
                         "matplotlib": matplotlib.__version__}
D.update({"B": f"{B:,}", "seed": str(SEED)})
D.update({f"v_{k_}": v for k_, v in R["meta"]["versions"].items()})
R["display"] = D
R["data"] = json.loads(df.to_json(orient="records"))
(RES_DIR / "results.json").write_text(json.dumps(_clean(R), indent=2, ensure_ascii=False), encoding="utf-8")
print("   [results] results/results.json")
print("   [tables]  " + ", ".join(sorted(p.name for p in TAB_DIR.glob("*.csv"))))

header("HEADLINE FINDINGS")
print(f"• Mean runs {xbar:.1f} (95% CI {ci[0]:.1f}–{ci[1]:.1f}); SD {s:.1f}.")
print(f"• Normal model plausible: Shapiro–Wilk p = {sw.pvalue:.3f}; χ² GOF p = {p5:.3f}.")
print(f"• Role matters: F({df_b}, {df_w}) = {F:.2f}, p = {fmt_p(p_F)[1].replace('^', '')}, η² = {eta2:.3f}.")
print("Done.")
