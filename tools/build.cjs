#!/usr/bin/env node
/**
 * Build pipeline for the presentation layer (both volumes).
 *
 *   python analysis.py        → figures/,      results/results.json      (Problem Statement 1)
 *   python analysis_ps2.py    → figures/ps2/,  results/ps2/results.json  (Problem Statement 2)
 *   node tools/build.cjs      → report/MFAD_Datathon_Report.pdf          (PS1 PDF)
 *                               report/MFAD_Datathon_Report_PS2.pdf      (PS2 PDF)
 *                               report/report.html, report/report_ps2.html (the PDFs' HTML sources)
 *                               docs/index.html, docs/ps2.html           (website, Volumes I and II)
 *                               docs/assets/js/data.js, data-ps2.js      (website data)
 *                               docs/downloads/*                         (files offered on the website)
 *                               docs/assets/img/*.png                    (README banners + figures)
 *
 * This script does no statistics. It only places numbers produced by the analysis
 * scripts into the templates, so the PDFs and the website can never disagree with the code.
 *
 * Requires Node 18+ and Playwright with Chromium:
 *   npm install && npx playwright install chromium
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const P = (...p) => path.join(ROOT, ...p);
const readJSON = (...p) => JSON.parse(fs.readFileSync(P(...p), 'utf8'));
const results = readJSON('results', 'results.json');
const meta = readJSON('report', 'meta.json');
const D = results.display;
const HAS_PS2 = fs.existsSync(P('results', 'ps2', 'results.json'));
const results2 = HAS_PS2 ? readJSON('results', 'ps2', 'results.json') : null;
const D2 = HAS_PS2 ? results2.display : {};

const ROLE_DARK = { Batter: '#D3A54C', 'All-rounder': '#6D9BE0', Bowler: '#DD7894' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Matplotlib SVG → inline SVG with unique ids (several figures share one HTML document) ── */
function inlineSvg(name) {
  let svg = fs.readFileSync(P('figures', `${name}.svg`), 'utf8');
  svg = svg.replace(/<\?xml[^>]*>\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/g, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  const pre = 'f' + name.replace(/[^a-z0-9]/gi, '') + '-';
  svg = svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${pre}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${pre}${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_, a, id) => `${a}="#${pre}${id}"`);
  svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
  return svg;
}

/* ── Typographic accents: x̄ and θ̂ as CSS-drawn marks (combining characters render badly in many fonts) ── */
const accents = (html) => html
  .replace(/([A-Za-z])̄/g, '<span class="bar">$1</span>')
  .replace(/(\S)̂/g, '<span class="hat">$1</span>');

/* ── Volume I cover artwork: the fitted normal curve in hairlines, with the 30 players on the baseline ── */
function coverCurve() {
  const W = 1000, H = 280, base = 214;
  const mu = results.task2.mean, sd = results.task2.sd;
  const x = (r) => (r / 420) * W;
  const pdf = (r) => Math.exp(-0.5 * ((r - mu) / sd) ** 2);
  let lines = '';
  for (let r = 2; r <= 418; r += 2.6) {
    const h = pdf(r) * 165;
    const op = (0.18 + 0.62 * pdf(r)).toFixed(3);
    lines += `<line x1="${x(r).toFixed(1)}" x2="${x(r).toFixed(1)}" y1="${base}" y2="${(base - h).toFixed(1)}" stroke="url(#cg)" stroke-width="1.1" opacity="${op}"/>`;
  }
  let d = '';
  for (let r = 0; r <= 420; r += 2) d += `${r === 0 ? 'M' : 'L'}${x(r).toFixed(1)},${(base - pdf(r) * 165 - 0.5).toFixed(1)}`;
  const players = [...results.data].sort((a, b) => a.Runs_Scored - b.Runs_Scored);
  const placed = [];
  let dots = '';
  for (const p of players) {
    const cx = x(p.Runs_Scored);
    let level = 0;
    while (placed.some((q) => Math.abs(q.cx - cx) < 10.5 && q.level === level)) level++;
    placed.push({ cx, level });
    dots += `<circle cx="${cx.toFixed(1)}" cy="${base + 15 + level * 10.5}" r="4.2" fill="${ROLE_DARK[p.Player_Role]}" stroke="#0C1019" stroke-width="1.4"/>`;
  }
  let ticks = '';
  for (const t of [0, 100, 200, 300, 400]) {
    ticks += `<line x1="${x(t)}" x2="${x(t)}" y1="${base}" y2="${base + 4}" stroke="#C9A35A" stroke-opacity=".5" stroke-width=".6"/>`;
    ticks += `<text x="${x(t)}" y="${base + 58}" fill="#F3EBDD" fill-opacity=".45" font-family="Jost" font-size="11" letter-spacing="1.5" text-anchor="middle">${t}</text>`;
  }
  const mx = x(mu);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs><linearGradient id="cg" gradientUnits="userSpaceOnUse" x1="0" y1="${base}" x2="0" y2="${base - 170}"><stop offset="0" stop-color="#C9A35A" stop-opacity=".9"/><stop offset="1" stop-color="#F3E3BF" stop-opacity=".25"/></linearGradient></defs>
  ${lines}<path d="${d}" fill="none" stroke="#E7CF9A" stroke-width="1.1" stroke-opacity=".9"/>
  <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#C9A35A" stroke-opacity=".55" stroke-width=".7"/>
  <line x1="${mx}" x2="${mx}" y1="${base - 176}" y2="${base}" stroke="#F3EBDD" stroke-opacity=".35" stroke-width=".6"/>
  <text x="${mx + 8}" y="${base - 168}" fill="#F3EBDD" fill-opacity=".6" font-family="Jost" font-size="11" letter-spacing="2">MEAN ${D.xbar}</text>
  ${ticks}${dots}
  <text x="${W}" y="${base - 168}" fill="#F3EBDD" fill-opacity=".45" font-family="Jost" font-size="10" letter-spacing="2.4" text-anchor="end">EACH DOT IS ONE PLAYER · RUNS SCORED</text>
</svg>`;
}

/* ── Volume II cover artwork: 100 repeated-sample 95% intervals as vertical hairlines ── */
function coverCI() {
  const W = 1000, H = 280, top = 22, bot = 222;
  const iv = results2.task3.intervals100, mu = results2.task3.xbar, mu0 = results2.meta.mu0;
  const y = (v) => bot - ((v - 109) / (135 - 109)) * (bot - top);
  let s = '';
  iv.lo.forEach((lo, i) => {
    const hi = iv.hi[i], m = iv.mean[i], hit = lo <= mu && mu <= hi, x = 12 + i * ((W - 24) / 99);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(lo).toFixed(1)}" y2="${y(hi).toFixed(1)}" stroke="${hit ? 'url(#cig)' : '#DD7894'}" stroke-width="${hit ? 1.6 : 2.2}" stroke-linecap="round" opacity="${hit ? 0.9 : 1}"/>`;
    s += `<circle cx="${x.toFixed(1)}" cy="${y(m).toFixed(1)}" r="1.7" fill="${hit ? '#F3EBDD' : '#DD7894'}" opacity=".85"/>`;
  });
  const covered = iv.lo.filter((lo, i) => lo <= mu && mu <= iv.hi[i]).length;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs><linearGradient id="cig" gradientUnits="userSpaceOnUse" x1="0" y1="${bot}" x2="0" y2="${top}"><stop offset="0" stop-color="#C9A35A" stop-opacity=".95"/><stop offset=".5" stop-color="#E7CF9A"/><stop offset="1" stop-color="#C9A35A" stop-opacity=".95"/></linearGradient></defs>
  <line x1="0" x2="${W}" y1="${y(mu0)}" y2="${y(mu0)}" stroke="#DD7894" stroke-opacity=".45" stroke-width=".7" stroke-dasharray="2 5"/>
  ${s}
  <line x1="0" x2="${W}" y1="${y(mu)}" y2="${y(mu)}" stroke="#F3EBDD" stroke-opacity=".75" stroke-width=".9"/>
  <text x="0" y="${H - 10}" fill="#F3EBDD" fill-opacity=".5" font-family="Jost" font-size="12" letter-spacing="2.4">100 REPEATED SAMPLES · 95% t-INTERVALS · ${covered} CAPTURE THE MEAN</text>
  <text x="${W}" y="${H - 10}" fill="#F3EBDD" fill-opacity=".5" font-family="Jost" font-size="12" letter-spacing="2.4" text-anchor="end">IVORY · TRUE MEAN ${D2.xbar}   ROSE DASH · PAR ${D2.mu0}</text>
</svg>`;
}

function teamBlock(problem) {
  return (meta.team_name || (meta.members && meta.members.length))
    ? `Submitted by<b>${esc(meta.team_name || '')}</b>${(meta.members || []).map(esc).join(' · ')}`
    : `Statistical report<b>${esc(problem)} · ${esc(meta.dataset)}</b>`;
}

function fill(template, display, extraIn = {}) {
  const extra = {
    meta_institution: esc(meta.institution), meta_event: esc(meta.event), meta_dataset: esc(meta.dataset),
    meta_date: esc(meta.date), meta_problem: esc(meta.problem), meta_team_block: teamBlock(meta.problem), ...extraIn,
  };
  const missing = new Set();
  let out = accents(template).replace(/\{\{fig:([\w/-]+)\}\}/g, (_, n) => inlineSvg(n));
  out = out.replace(/\{\{([\w]+)\}\}/g, (m, k) => {
    if (k in extra) return extra[k];
    if (k in display) return esc(display[k]).replace(/10\^(-?\d+)/g, (_, e) => `10<sup>${e.replace('-', '−')}</sup>`);
    missing.add(k);
    return m;
  });
  if (missing.size) throw new Error('Template keys missing from results: ' + [...missing].join(', '));
  return out;
}

async function printPdf(browser, htmlPath, pdfPath) {
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  await page.close();
}

async function shoot(browser, file, query, size, out) {
  const b = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  await b.goto('file://' + file + '?' + encodeURIComponent(JSON.stringify(query)));
  await b.evaluate(() => document.fonts.ready);
  await b.waitForTimeout(300);
  await b.screenshot({ path: out });
  await b.close();
}

async function main() {
  const browser = await chromium.launch();

  // 1 · Volume I report (Problem Statement 1)
  fs.writeFileSync(P('report', 'report.html'), fill(fs.readFileSync(P('report', 'template.html'), 'utf8'), D, { cover_curve: coverCurve() }));
  const pdfPath = P('report', 'MFAD_Datathon_Report.pdf');
  await printPdf(browser, P('report', 'report.html'), pdfPath);
  console.log('✓ report/MFAD_Datathon_Report.pdf');

  // 2 · Volume II report (Problem Statement 2)
  const pdf2 = P('report', 'MFAD_Datathon_Report_PS2.pdf');
  if (HAS_PS2) {
    const prob2 = meta.problem_ps2 || 'Problem Statement 2';
    fs.writeFileSync(P('report', 'report_ps2.html'), fill(fs.readFileSync(P('report', 'template_ps2.html'), 'utf8'), D2,
      { cover_ci: coverCI(), meta_problem: esc(prob2), meta_team_block: teamBlock(prob2) }));
    await printPdf(browser, P('report', 'report_ps2.html'), pdf2);
    console.log('✓ report/MFAD_Datathon_Report_PS2.pdf');
  }

  // 3 · website pages + data
  fs.writeFileSync(P('docs', 'index.html'), fill(fs.readFileSync(P('tools', 'site.template.html'), 'utf8'), D));
  fs.writeFileSync(P('docs', '.nojekyll'), '');
  fs.mkdirSync(P('docs', 'assets', 'js'), { recursive: true });
  const site = { display: D, data: results.data, task2: results.task2, task3: results.task3, task4: results.task4,
                 task5: results.task5, task1: results.task1, meta: results.meta };
  fs.writeFileSync(P('docs', 'assets', 'js', 'data.js'),
    '/* Generated by tools/build.cjs from results/results.json — do not edit by hand. */\nwindow.DATATHON = ' +
    JSON.stringify(site) + ';\n');
  console.log('✓ docs/index.html, docs/assets/js/data.js');
  if (HAS_PS2 && fs.existsSync(P('tools', 'site_ps2.template.html'))) {
    fs.writeFileSync(P('docs', 'ps2.html'), fill(fs.readFileSync(P('tools', 'site_ps2.template.html'), 'utf8'), D2));
    const site2 = { display: D2, data: results2.data, task1: results2.task1, task2: results2.task2, task3: results2.task3,
                    task4: results2.task4, task5: results2.task5, meta: results2.meta };
    fs.writeFileSync(P('docs', 'assets', 'js', 'data-ps2.js'),
      '/* Generated by tools/build.cjs from results/ps2/results.json — do not edit by hand. */\nwindow.DATATHON2 = ' +
      JSON.stringify(site2) + ';\n');
    console.log('✓ docs/ps2.html, docs/assets/js/data-ps2.js');
  }

  // 4 · downloads + figures for the website
  const dl = P('docs', 'downloads');
  fs.mkdirSync(dl, { recursive: true });
  fs.copyFileSync(pdfPath, path.join(dl, 'MFAD_Datathon_Report.pdf'));
  fs.copyFileSync(P('analysis.py'), path.join(dl, 'analysis.py'));
  fs.copyFileSync(P('data', 'Dataset_13.csv'), path.join(dl, 'Dataset_13.csv'));
  if (HAS_PS2) {
    fs.copyFileSync(pdf2, path.join(dl, 'MFAD_Datathon_Report_PS2.pdf'));
    fs.copyFileSync(P('analysis_ps2.py'), path.join(dl, 'analysis_ps2.py'));
  }
  const img = P('docs', 'assets', 'img');
  fs.mkdirSync(path.join(img, 'ps2'), { recursive: true });
  for (const f of fs.readdirSync(P('figures')).filter((f) => f.endsWith('.png'))) fs.copyFileSync(P('figures', f), path.join(img, f));
  if (HAS_PS2) for (const f of fs.readdirSync(P('figures', 'ps2')).filter((f) => f.endsWith('.png'))) fs.copyFileSync(P('figures', 'ps2', f), path.join(img, 'ps2', f));
  console.log('✓ docs/downloads/*, docs/assets/img/**');

  // 5 · README banners + social card (rendered from tools/banner.html)
  const banner = P('tools', 'banner.html');
  if (fs.existsSync(banner)) {
    const q1 = { xbar: D.xbar, F: D.F, eta2: D.eta2, p5: D.p5, sw_p: D.sw_p };
    await shoot(browser, banner, q1, { width: 1600, height: 640 }, path.join(img, 'banner.png'));
    await shoot(browser, banner, { ...q1, social: true }, { width: 1280, height: 640 }, path.join(img, 'social-card.png'));
    if (HAS_PS2) await shoot(browser, banner, { vol: 2, xbar: D2.xbar, X: D2.X, p: D2.p, power: D2.power5 }, { width: 1600, height: 640 }, path.join(img, 'banner-ps2.png'));
    console.log('✓ docs/assets/img/banner.png, social-card.png' + (HAS_PS2 ? ', banner-ps2.png' : ''));
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
