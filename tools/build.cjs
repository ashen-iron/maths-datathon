#!/usr/bin/env node
/**
 * Build pipeline for the presentation layer.
 *
 *   python analysis.py        → figures/, results/results.json   (all statistics)
 *   node tools/build.cjs      → report/MFAD_Datathon_Report.pdf  (premium PDF)
 *                               report/report.html               (the PDF's HTML source)
 *                               docs/assets/js/data.js           (website data)
 *                               docs/downloads/*                 (files offered on the website)
 *                               docs/assets/img/*.png            (README banner + figures)
 *
 * This script does no statistics. It only places numbers produced by analysis.py
 * into the report template, so the PDF can never disagree with the code.
 *
 * Requires Node 18+ and Playwright with Chromium:
 *   npm install && npx playwright install chromium
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const P = (...p) => path.join(ROOT, ...p);
const results = JSON.parse(fs.readFileSync(P('results', 'results.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(P('report', 'meta.json'), 'utf8'));
const D = results.display;

const ROLE_DARK = { Batter: '#D3A54C', 'All-rounder': '#6D9BE0', Bowler: '#DD7894' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Matplotlib SVG → inline SVG with unique ids (several figures share one HTML document) ── */
function inlineSvg(name) {
  let svg = fs.readFileSync(P('figures', `${name}.svg`), 'utf8');
  svg = svg.replace(/<\?xml[^>]*>\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/g, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  const pre = name.replace(/[^a-z0-9]/gi, '').slice(0, 6) + '-';
  svg = svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${pre}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${pre}${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_, a, id) => `${a}="#${pre}${id}"`);
  svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
  return svg;
}

/* ── Cover artwork: the fitted normal curve drawn in hairlines, with the 30 players on the baseline ── */
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
  // players: stack dots that would overlap
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

function fill(template) {
  const extra = {
    meta_institution: esc(meta.institution), meta_event: esc(meta.event), meta_problem: esc(meta.problem),
    meta_dataset: esc(meta.dataset), meta_date: esc(meta.date), cover_curve: coverCurve(),
    meta_team_block: (meta.team_name || (meta.members && meta.members.length))
      ? `Submitted by<b>${esc(meta.team_name || '')}</b>${(meta.members || []).map(esc).join(' · ')}`
      : `Statistical report<b>${esc(meta.problem)} · ${esc(meta.dataset)}</b>`,
  };
  const missing = new Set();
  let out = template.replace(/\{\{fig:([\w-]+)\}\}/g, (_, n) => inlineSvg(n));
  out = out.replace(/\{\{([\w]+)\}\}/g, (m, k) => {
    if (k in extra) return extra[k];
    if (k in D) return esc(D[k]).replace(/10\^(-?\d+)/g, (_, e) => `10<sup>${e.replace('-', '−')}</sup>`);
    missing.add(k);
    return m;
  });
  if (missing.size) throw new Error('Template keys missing from results.json: ' + [...missing].join(', '));
  return out;
}

async function main() {
  // 1 · report HTML + PDF
  const html = fill(fs.readFileSync(P('report', 'template.html'), 'utf8'));
  fs.writeFileSync(P('report', 'report.html'), html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + P('report', 'report.html'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const pdfPath = P('report', 'MFAD_Datathon_Report.pdf');
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  console.log('✓ report/MFAD_Datathon_Report.pdf');

  // 2 · website page + data
  fs.writeFileSync(P('docs', 'index.html'), fill(fs.readFileSync(P('tools', 'site.template.html'), 'utf8')));
  fs.writeFileSync(P('docs', '.nojekyll'), '');
  console.log('✓ docs/index.html');
  fs.mkdirSync(P('docs', 'assets', 'js'), { recursive: true });
  const site = { display: D, data: results.data, task2: results.task2, task3: results.task3, task4: results.task4,
                 task5: results.task5, task1: results.task1, meta: results.meta };
  fs.writeFileSync(P('docs', 'assets', 'js', 'data.js'),
    '/* Generated by tools/build.cjs from results/results.json — do not edit by hand. */\nwindow.DATATHON = ' +
    JSON.stringify(site) + ';\n');
  console.log('✓ docs/assets/js/data.js');

  // 3 · downloads + figures for the website
  const dl = P('docs', 'downloads');
  fs.mkdirSync(dl, { recursive: true });
  fs.copyFileSync(pdfPath, path.join(dl, 'MFAD_Datathon_Report.pdf'));
  fs.copyFileSync(P('analysis.py'), path.join(dl, 'analysis.py'));
  fs.copyFileSync(P('data', 'Dataset_13.csv'), path.join(dl, 'Dataset_13.csv'));
  const img = P('docs', 'assets', 'img');
  fs.mkdirSync(img, { recursive: true });
  for (const f of fs.readdirSync(P('figures')).filter((f) => f.endsWith('.png'))) fs.copyFileSync(P('figures', f), path.join(img, f));
  console.log('✓ docs/downloads/*, docs/assets/img/fig*.png');

  // 4 · README banner + social card (rendered from tools/banner.html)
  const banner = P('tools', 'banner.html');
  if (fs.existsSync(banner)) {
    const b = await browser.newPage({ viewport: { width: 1600, height: 640 }, deviceScaleFactor: 2 });
    await b.goto('file://' + banner + '?' + encodeURIComponent(JSON.stringify({ xbar: D.xbar, F: D.F, eta2: D.eta2, p5: D.p5, sw_p: D.sw_p })));
    await b.evaluate(() => document.fonts.ready);
    await b.waitForTimeout(300);
    await b.screenshot({ path: path.join(img, 'banner.png') });
    await b.setViewportSize({ width: 1280, height: 640 });
    await b.goto('file://' + banner + '?' + encodeURIComponent(JSON.stringify({ social: true, xbar: D.xbar, F: D.F, eta2: D.eta2, p5: D.p5, sw_p: D.sw_p })));
    await b.evaluate(() => document.fonts.ready);
    await b.waitForTimeout(300);
    await b.screenshot({ path: path.join(img, 'social-card.png') });
    console.log('✓ docs/assets/img/banner.png, social-card.png');
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
