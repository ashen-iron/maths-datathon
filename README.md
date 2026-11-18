<div align="center">

<img src="docs/assets/img/banner.png" alt="Runs, Roles &amp; Randomness: MFAD Datathon, Problem Statement 1, Dataset 13" width="100%">

<br>

<a href="https://ashen-iron.github.io/maths-datathon/"><img src="https://img.shields.io/badge/Website-Live-C9A35A?style=for-the-badge&labelColor=0C1019" alt="Website"></a>
<a href="report/MFAD_Datathon_Report.pdf"><img src="https://img.shields.io/badge/Report-PDF-C9A35A?style=for-the-badge&labelColor=0C1019" alt="Report PDF"></a>
<a href="analysis.py"><img src="https://img.shields.io/badge/Code-analysis.py-C9A35A?style=for-the-badge&labelColor=0C1019&logo=python&logoColor=E6CC94" alt="analysis.py"></a>
<a href="report/MFAD_Datathon_Report_PS2.pdf"><img src="https://img.shields.io/badge/Report%20PS2-PDF-C9A35A?style=for-the-badge&labelColor=0C1019" alt="Report PS2 PDF"></a>
<a href="analysis_ps2.py"><img src="https://img.shields.io/badge/Code-analysis__ps2.py-C9A35A?style=for-the-badge&labelColor=0C1019&logo=python&logoColor=E6CC94" alt="analysis_ps2.py"></a>
<img src="https://img.shields.io/badge/Reproducible-seed%2020261118-C9A35A?style=for-the-badge&labelColor=0C1019" alt="Reproducible">

<br><br>

<em>A statistical inquiry into thirty cricketers: how runs are sampled, estimated and distributed,<br>and whether a player’s role changes what we should expect.</em>

<br><br>

**[Explore the website](https://ashen-iron.github.io/maths-datathon/)** &nbsp;·&nbsp; **[Read the report](report/MFAD_Datathon_Report.pdf)** &nbsp;·&nbsp; **[Run the code](#-reproduce-in-two-commands)** &nbsp;·&nbsp; **[Volume II ↓](#-volume-ii--pace-par--power)**

<sub>Two volumes, one dataset: <b>Volume I</b> answers Problem Statement 1 (<code>Runs_Scored</code>) and <b>Volume II</b> answers Problem Statement 2 (<code>Strike_Rate</code>).</sub>

<br>

<img src="docs/assets/img/divider.svg" width="70%" alt="">

</div>

## ✦ The question

> **How many runs does a typical player in this sample score, how precisely can that be estimated, is a normal model reasonable for run output, and does mean run output differ between batters, all-rounders and bowlers?**

One outcome (**`Runs_Scored`**) and one factor (**`Player_Role`**) carry a single question through all five tasks of Units 3 and 4. `Player_ID` is an identifier and is excluded from every calculation.

## ✦ Headline findings

<table>
<tr>
<td width="20%" align="center"><sub>TASK 1 · SAMPLING</sub><br><h3>0.027</h3><sub>P(exact 10/10/10 split)<br>under random sampling</sub></td>
<td width="20%" align="center"><sub>TASK 2 · ESTIMATION</sub><br><h3>213.60</h3><sub>mean runs<br>95% CI 183.0 – 244.2</sub></td>
<td width="20%" align="center"><sub>TASK 3 · NORMALITY</sub><br><h3>p = 0.857</h3><sub>Shapiro–Wilk<br>W = 0.9812</sub></td>
<td width="20%" align="center"><sub>TASK 4 · ANOVA</sub><br><h3>F = 32.92</h3><sub>df (2, 27), p = 5.75×10⁻⁸<br>η² = 0.709</sub></td>
<td width="20%" align="center"><sub>TASK 5 · χ² FIT</sub><br><h3>χ² = 1.000</h3><sub>df = 2, p = 0.607<br>normal model fits</sub></td>
</tr>
</table>

| | Task | Method | Result | Meaning in context |
|:-:|:--|:--|:--|:--|
| **I** | Sampling design | Design review, multinomial check | Undocumented; exact 10/10/10 role split | Quota-like, non-probability sample. Generalise with caution. |
| **II** | Point estimation & MSE | x̄, s², resampling (B = 20,000) | x̄ = 213.60, s² = 6,716.39, SE = 14.96 | MSE = variance + bias². Unbiased does not mean minimum MSE. |
| **III** | Normal model & CLT | Shape, Q–Q, Shapiro–Wilk, resampling | W = 0.9812, p = 0.857 | Normal model plausible. Means become normal even from a skewed parent. |
| **IV** | One-way ANOVA | F test, Levene, η², ω² | F(2, 27) = 32.92, p = 5.75×10⁻⁸ | Mean runs differ by role (very large effect). Observational, so not causal. |
| **V** | χ² goodness-of-fit | Pearson χ², 5 equal-probability classes | χ² = 1.000, df = 2, p = 0.607 | Counts are consistent with the normal model. |

> [!NOTE]
> Every number above is produced by `analysis.py` and stored in `results/results.json`. The PDF report and the website read those numbers at build time, so neither can disagree with the code.

<div align="center"><img src="docs/assets/img/divider.svg" width="70%" alt=""></div>

## ✦ Gallery

<table>
<tr>
<td width="50%"><img src="figures/fig06_anova_groups.png" alt="Runs by role"><br><sub><b>FIG 6</b> · Runs by role, with a residual Q–Q check</sub></td>
<td width="50%"><img src="figures/fig05_clt_resampling.png" alt="CLT"><br><sub><b>FIG 5</b> · The Central Limit Theorem with a symmetric and a skewed parent</sub></td>
</tr>
<tr>
<td width="50%"><img src="figures/fig02_sampling_distribution_mse.png" alt="MSE"><br><sub><b>FIG 2</b> · The sampling distribution narrows and MSE falls like 1/n</sub></td>
<td width="50%"><img src="figures/fig04_runs_normality.png" alt="Normality"><br><sub><b>FIG 4</b> · Histogram with normal fit, and Q–Q plot with 95% envelope</sub></td>
</tr>
<tr>
<td width="50%"><img src="figures/fig03_variance_estimator_mse.png" alt="Variance estimators"><br><sub><b>FIG 3</b> · MSE decomposition: the biased σ̂² beats the unbiased s²</sub></td>
<td width="50%"><img src="figures/fig08_chisq_gof.png" alt="Chi-square"><br><sub><b>FIG 8</b> · Observed against expected counts in five normal classes</sub></td>
</tr>
</table>

<div align="center"><img src="docs/assets/img/divider.svg" width="70%" alt=""></div>

## ✦ Submission files

| File | What it is |
|:--|:--|
| 📄 **[`report/MFAD_Datathon_Report.pdf`](report/MFAD_Datathon_Report.pdf)** | The report: answers, results, test cards, figures, observations, conclusions and all ten reflection answers |
| 🐍 **[`analysis.py`](analysis.py)** | One Python file that runs top to bottom and reproduces every number, table and plot in the report |
| 📄 **[`report/MFAD_Datathon_Report_PS2.pdf`](report/MFAD_Datathon_Report_PS2.pdf)** | **Problem Statement 2** report (Volume II): every task, test cards, figures and all ten reflection answers |
| 🐍 **[`analysis_ps2.py`](analysis_ps2.py)** | **Problem Statement 2** code: runs top to bottom and reproduces every number, table and plot in the PS2 report |

## ✦ Reproduce in two commands

```bash
pip install -r requirements.txt
```

```bash
python analysis.py
```

For Problem Statement 2:

```bash
python analysis_ps2.py
```

These write `figures/` and `figures/ps2/` (PNG + SVG), `results/tables/` and `results/ps2/tables/` (CSV), and `results/results.json` and `results/ps2/results.json`, and print a full console report. All resampling uses a fixed seed (`20261118`, B = 20,000), so every run gives identical numbers.

<details>
<summary><b>Optional: rebuild the PDF report and the website</b></summary>
<br>

The presentation layer is built with Node.js and Playwright (headless Chromium). It does no statistics; it only places the numbers from `results/results.json` into the templates.

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
node tools/build.cjs
```

This rebuilds both PDFs and both website pages. To put your team name and members on the PDF covers, fill in `report/meta.json` and rebuild.
</details>

## ✦ Repository structure

```text
maths-datathon/
├── analysis.py                  ← PS1 submission code: all statistics, tables and figures
├── analysis_ps2.py              ← PS2 submission code (Volume II)
├── data/Dataset_13.csv          ← the assigned dataset, unmodified
├── report/
│   ├── MFAD_Datathon_Report.pdf ← PS1 submission report
│   ├── MFAD_Datathon_Report_PS2.pdf ← PS2 submission report
│   ├── report.css               ← shared report styling
│   ├── template.html            ← PS1 report layout (placeholders filled from results.json)
│   ├── template_ps2.html        ← PS2 report layout
│   ├── report.html, report_ps2.html ← generated HTML sources of the PDFs
│   └── meta.json                ← team name / members for the cover
├── figures/                     ← PS1 fig01–fig08, PNG + SVG (generated)
│   └── ps2/                     ← PS2 figures (generated)
├── results/
│   ├── results.json             ← every PS1 number (generated)
│   ├── tables/*.csv             ← every PS1 table (generated)
│   └── ps2/                     ← PS2 results.json and tables (generated)
├── docs/                        ← the website (GitHub Pages)
│   ├── index.html               ← Volume I
│   ├── ps2.html                 ← Volume II
│   ├── assets/{css,js,fonts,img,vendor}
│   └── downloads/               ← both PDFs, both .py files and the CSV
├── tools/
│   ├── build.cjs                ← builds the PDF, the website and the README banner
│   ├── site.template.html       ← Volume I website template
│   ├── site_ps2.template.html   ← Volume II website template
│   └── banner.html              ← README banners and social card
├── assets/fonts/                ← bundled typefaces (SIL Open Font License)
├── requirements.txt · package.json · .gitignore
└── README.md
```

## ✦ Method notes

- **Population and sample.** The unit is one player and n = 30. The sampling process is undocumented, so the sample is treated as non-probability (quota-like) and is not assumed random or representative.
- **Estimation.** The 30 values serve as a known pseudo-population. Bias, variance and MSE of the mean, median, s² and σ̂² are measured by resampling and checked against exact theory.
- **CLT.** Runs_Scored and a deliberately skewed indicator, I(Runs ≥ 300), are resampled at n = 1 to 50. Skewness decays like γ/√n.
- **ANOVA.** Assumptions are checked with per-group Shapiro–Wilk tests, a residual Q–Q plot, a Brown–Forsythe Levene test and the SD ratio. Effect sizes η², ω² and Cohen’s f are reported. No post-hoc tests were run, as the task requires.
- **χ².** The expected distribution was fixed *before* counting: five classes equally probable under the fitted normal model, 6 expected per class, df = K − 1 − 2. A Chernoff–Lehmann bound is reported.
- **Throughout.** Every test reports H₀/H₁, α, the statistic, df, the p-value and a conclusion in context. Statistical significance is kept separate from practical importance, and no result is read causally.

## ✦ Volume II · Pace, Par & Power

<div align="center">
<img src="docs/assets/img/banner-ps2.png" alt="Pace, Par &amp; Power: MFAD Datathon, Problem Statement 2, Dataset 13" width="100%">
</div>

> **Problem Statement 2.** How fast do these players score? Can strike rate be modelled as a random variable, both binomially through a par-or-better event and normally by maximum likelihood? How precisely can its mean be estimated, does that mean differ from a **pre-specified par of 120 runs per 100 balls**, and how much power does that test have?

<table>
<tr>
<td width="20%" align="center"><sub>TASK 1 · BINOMIAL</sub><br><h3>18 / 30</h3><sub>at par or better<br>by role 10 · 7 · 1 (p not constant)</sub></td>
<td width="20%" align="center"><sub>TASK 2 · NORMAL MLE</sub><br><h3>121.93</h3><sub>μ̂ · σ̂² = 216.80<br>(s² = 224.27)</sub></td>
<td width="20%" align="center"><sub>TASK 3 · 95% CI (t)</sub><br><h3>116.34–127.53</h3><sub>SE 2.734 · ME 5.59</sub></td>
<td width="20%" align="center"><sub>TASK 4 · t TEST</sub><br><h3>t = 0.707</h3><sub>df 29 · p = 0.485<br>fail to reject H₀: μ = 120</sub></td>
<td width="20%" align="center"><sub>TASK 5 · POWER</sub><br><h3>0.424</h3><sub>at Δ = 5 points<br>80% needs n = 73</sub></td>
</tr>
</table>

| | Task | Method | Result | Meaning in context |
|:-:|:--|:--|:--|:--|
| **I** | Random variables & binomial | Bernoulli event S ≥ 120; X ~ Bin(30, p)? | X = 18; roles 10/7/1 of 10 | Constant p fails. The 10/10/10 quota shrinks Var(X) from 7.20 to 3.00. |
| **II** | Normal MLE | Likelihood, score equations, numerical check | μ̂ = 121.93, σ̂² = 216.80 | The closed form is confirmed by an optimiser. Normality is plausible (Shapiro–Wilk p = 0.339). |
| **III** | 95% CI for μ | Student’s t (σ unknown, n = 30) | 116.34 – 127.53 | 97 of 100 repeated intervals captured the mean. A z-interval would under-cover. |
| **IV** | One-sample test | t test against assumed par 120 (fixed in code before loading the data) | t(29) = 0.707, p = 0.485 | No evidence the mean differs from par, and the gap of 1.93 is practically negligible (d = 0.13). |
| **V** | Type I / II & power | Exact noncentral-t power + simulation | Power 0.424 at Δ = 5 | Type II risk is real at n = 30. Within-role σ would lift power to 0.846. |

<table>
<tr>
<td width="50%"><img src="figures/ps2/ps2_fig03_confidence_interval.png" alt="Repeated sampling"><br><sub><b>PS2 · FIG 3</b> · 100 repeated-sample t-intervals, and the margin of error by n and level</sub></td>
<td width="50%"><img src="figures/ps2/ps2_fig05_error_regions.png" alt="Error regions"><br><sub><b>PS2 · FIG 5</b> · Type I and Type II error regions when the true mean is 125</sub></td>
</tr>
<tr>
<td width="50%"><img src="figures/ps2/ps2_fig02_likelihood.png" alt="Likelihood"><br><sub><b>PS2 · FIG 2</b> · Fitted normal, log-likelihood surface and profile over σ²</sub></td>
<td width="50%"><img src="figures/ps2/ps2_fig06_power.png" alt="Power"><br><sub><b>PS2 · FIG 6</b> · How n, α, σ and the true departure drive power</sub></td>
</tr>
</table>

**Volume II submission files:** 📄 [`report/MFAD_Datathon_Report_PS2.pdf`](report/MFAD_Datathon_Report_PS2.pdf) · 🐍 [`analysis_ps2.py`](analysis_ps2.py) &nbsp;·&nbsp; **Website:** [`docs/ps2.html`](https://ashen-iron.github.io/maths-datathon/ps2.html)

<div align="center"><img src="docs/assets/img/divider.svg" width="70%" alt=""></div>

## ✦ The website

The [`docs/`](docs) folder holds a self-contained, two-volume website. **Volume I** (`index.html`) has an animated Central Limit Theorem hero, interactive D3 charts, an estimator lab and a CLT lab. **Volume II** (`ps2.html`) has a live "loom" of confidence intervals as its hero, plus a binomial explorer, likelihood explorer, interval lab, t-test explorer and power explorer. Switch between volumes with the **I · II** control in the navigation bar. The site runs offline and needs no build step to view.

**Publish it:** go to repository **Settings → Pages → Build and deployment**, set **Source** to *Deploy from a branch*, choose the branch, select the **`/docs`** folder and save. It will appear at `https://ashen-iron.github.io/maths-datathon/`.

## ✦ Credits

Typefaces: [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond), [EB Garamond](https://fonts.google.com/specimen/EB+Garamond), [Jost](https://fonts.google.com/specimen/Jost) and [DM Mono](https://fonts.google.com/specimen/DM+Mono), all under the SIL Open Font License. Charts on the website use [D3.js](https://d3js.org) v7.9.0 (ISC License). Analysis uses NumPy, pandas, SciPy and Matplotlib.

<div align="center">
<br>
<img src="docs/assets/img/divider.svg" width="50%" alt="">
<br>
<sub>PES UNIVERSITY &nbsp;·&nbsp; MFAD DATATHON 2026 &nbsp;·&nbsp; PROBLEM STATEMENTS 1 &amp; 2 &nbsp;·&nbsp; DATASET 13</sub>
</div>
