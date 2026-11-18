/* ==========================================================================
   Runs, Roles & Randomness: interactive layer
   Reported numbers come from window.DATATHON (results/results.json, produced by analysis.py).
   The labs run fresh simulations in the browser and are labelled as live.
   ========================================================================== */
(() => {
  'use strict';
  const DATA = window.DATATHON;
  const rows = DATA.data;
  const runs = rows.map((r) => r.Runs_Scored);
  const ROLES = ['Batter', 'All-rounder', 'Bowler'];
  const COL = { Batter: '#B98630', 'All-rounder': '#5486D3', Bowler: '#CF5F80' };
  const GOLD = '#C9A35A', GOLD2 = '#E6CC94', IVORY = '#EFE7D7', MUTED = '#8F8878';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- maths helpers ---------- */
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = (a, ddof = 0) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - ddof); };
  const skewness = (a) => { const m = mean(a), s = Math.sqrt(variance(a)); return s === 0 ? 0 : mean(a.map((v) => ((v - m) / s) ** 3)); };
  const median = (a) => { const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const npdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const lgamma = (z) => { // Lanczos approximation
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  };
  const fpdf = (x, d1, d2) => x <= 0 ? (d1 === 2 ? 1 : 0) : Math.exp(lgamma((d1 + d2) / 2) - lgamma(d1 / 2) - lgamma(d2 / 2) + (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x) - ((d1 + d2) / 2) * Math.log(1 + (d1 * x) / d2));
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const fmt = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const MU = mean(runs), SIG2 = variance(runs), SIG = Math.sqrt(SIG2);

  /* ---------- tooltip ---------- */
  const tt = $('.tt');
  function showTip(html, x, y) {
    tt.innerHTML = html; tt.classList.add('on');
    const r = tt.getBoundingClientRect();
    let left = x + 18, top = y + 18;
    if (left + r.width > innerWidth - 12) left = x - r.width - 18;
    if (top + r.height > innerHeight - 12) top = y - r.height - 18;
    tt.style.left = Math.max(8, left) + 'px'; tt.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => tt.classList.remove('on');
  const tipRows = (title, pairs) => `<div class="h">${title}</div>` + pairs.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('');
  function bindTip(sel, fn) {
    sel.on('mousemove', (e, d) => showTip(fn(d), e.clientX, e.clientY))
      .on('mouseleave', hideTip)
      .on('focus', function (e, d) { const r = this.getBoundingClientRect(); showTip(fn(d), r.right, r.top); })
      .on('blur', hideTip);
  }

  /* ---------- nav, progress, reveal ---------- */
  const nav = $('#nav'), prog = $('.progress');
  const onScroll = () => {
    nav.classList.toggle('solid', scrollY > 40);
    const h = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('.menu-btn').addEventListener('click', (e) => { const o = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  $$('.links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$('[data-reveal]').forEach((el) => io.observe(el));

  /* ---------- marquee: duplicate for a seamless loop ---------- */
  const track = $('#marquee'); track.innerHTML += track.innerHTML;

  /* ---------- count-up ---------- */
  setTimeout(() => $$('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count.replace(/,/g, '')), dec = +el.dataset.dec;
    if (reduce || !isFinite(target)) return;
    const t0 = performance.now(), dur = 1800;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(target * e, dec); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), 900);

  /* ==========================================================================
     HERO: sample means of five players rain down into the sampling distribution
     ========================================================================== */
  (function hero() {
    const cv = $('#rain'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
    let W, H, dpr, bins, binW, x0, x1, base, dotR, gap, cap, falling = [], settled = 0, raf, phase = 'rain', fade = 1;
    const NB = 64, rnd = mulberry32(7);
    const sprite = document.createElement('canvas');
    function makeSprite() {
      const s = 24; sprite.width = sprite.height = s * dpr; const c = sprite.getContext('2d');
      const g = c.createRadialGradient(s * dpr / 2, s * dpr / 2, 0, s * dpr / 2, s * dpr / 2, s * dpr / 2);
      g.addColorStop(0, 'rgba(255,236,196,1)'); g.addColorStop(.18, 'rgba(230,204,148,.9)'); g.addColorStop(.45, 'rgba(201,163,90,.25)'); g.addColorStop(1, 'rgba(201,163,90,0)');
      c.fillStyle = g; c.fillRect(0, 0, s * dpr, s * dpr);
    }
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = layer.width = W * dpr; cv.height = layer.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      x0 = 90; x1 = 340; base = H * 0.97; binW = W / NB; dotR = Math.max(1.1, Math.min(2, binW / 7)); gap = dotR * 2.35;
      cap = Math.floor((H * 0.4) / gap);
      bins = new Array(NB).fill(0); falling = []; settled = 0; phase = 'rain'; fade = 1;
      lctx.clearRect(0, 0, W, H); makeSprite();
    }
    const sampleMean = () => { let s = 0; for (let i = 0; i < 5; i++) s += runs[(rnd() * runs.length) | 0]; return s / 5; };
    function spawn(k) {
      for (let i = 0; i < k; i++) {
        const m = sampleMean(); const b = Math.max(0, Math.min(NB - 1, Math.floor(((m - x0) / (x1 - x0)) * NB)));
        const cx = (b + 0.5) * binW + (rnd() - 0.5) * binW * 0.5;
        falling.push({ b, x: cx, y: -10 - rnd() * H * 0.3, v: 2 + rnd() * 3 });
      }
    }
    function drawCurve(alpha) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = 'rgba(239,231,215,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      // N(μ, σ²/5) scaled so the peak meets the expected tallest column at the current sample count
      const sd = SIG / Math.sqrt(5), peak = (settled * ((x1 - x0) / NB)) * npdf(MU, MU, sd) * gap;
      for (let px = 0; px <= W; px += 3) {
        const v = x0 + (px / W) * (x1 - x0); const y = base - npdf(v, MU, sd) / npdf(MU, MU, sd) * peak;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke(); ctx.restore();
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      if (phase === 'rain') {
        if (Math.max(...bins) < cap) spawn(W > 700 ? 3 : 2); else phase = 'hold';
      }
      ctx.globalAlpha = fade; ctx.drawImage(layer, 0, 0, W, H); ctx.globalAlpha = 1;
      for (let i = falling.length - 1; i >= 0; i--) {
        const p = falling[i]; p.v += 0.22; p.y += p.v;
        const top = base - bins[p.b] * gap - dotR;
        if (p.y >= top) {
          const bx = (p.b + 0.5) * binW + (((bins[p.b] * 7) % 5) - 2) * dotR * 0.9;
          lctx.globalAlpha = 0.35 + 0.4 * (1 - bins[p.b] / cap);
          lctx.drawImage(sprite, bx - 6, top - 6, 12, 12);
          bins[p.b]++; settled++; falling.splice(i, 1);
        } else {
          ctx.globalAlpha = 0.55; ctx.strokeStyle = 'rgba(230,204,148,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y - p.v * 3); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.drawImage(sprite, p.x - 4, p.y - 4, 8, 8); ctx.globalAlpha = 1;
        }
      }
      if (settled > 400) drawCurve(Math.min(1, (settled - 400) / 800) * fade);
      if (phase === 'hold' && !falling.length) { phase = 'wait'; setTimeout(() => { phase = 'fade'; }, 3800); }
      if (phase === 'fade') { fade -= 0.012; if (fade <= 0) { lctx.clearRect(0, 0, W, H); bins.fill(0); settled = 0; fade = 1; phase = 'rain'; } }
      raf = requestAnimationFrame(frame);
    }
    size();
    if (reduce) { // static final state
      while (Math.max(...bins) < cap) { spawn(1); const p = falling.pop(); const top = base - bins[p.b] * gap - dotR; lctx.drawImage(sprite, (p.b + 0.5) * binW - 6, top - 6, 12, 12); bins[p.b]++; settled++; }
      ctx.drawImage(layer, 0, 0, W, H); drawCurve(1); return;
    }
    let vis = true;
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !raf) raf = requestAnimationFrame(frame); else if (!vis) { cancelAnimationFrame(raf); raf = null; } }).observe(cv);
    let rw = innerWidth; addEventListener('resize', () => { if (Math.abs(innerWidth - rw) > 40) { rw = innerWidth; size(); } });
  })();

  /* ---------- section active state (nav) ---------- */
  const secIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    $$('.links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('section.chapter').forEach((s) => secIO.observe(s));

  /* ==========================================================================
     CHART FRAMEWORK: render when first visible, re-render on width change
     ========================================================================== */
  const charts = [];
  function chart(id, render, aspect = 0.5, minH = 260) {
    const el = document.getElementById(id); if (!el) return;
    const c = { el, render, aspect, minH, w: 0, drawn: false };
    charts.push(c);
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { draw(c, true); o.disconnect(); } }, { threshold: 0.15 }).observe(el);
  }
  function draw(c, first) {
    const w = c.el.clientWidth; if (!w) return;
    c.w = w; const h = Math.max(c.minH, Math.round(w * c.aspect));
    c.el.innerHTML = '';
    const svg = d3.select(c.el).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    c.render(svg, w, h, first && !reduce, c);
    c.drawn = true;
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => charts.forEach((c) => c.drawn && Math.abs(c.el.clientWidth - c.w) > 2 && draw(c, false)), 160); });
  const mob = () => innerWidth < 640;
  function axes(g, x, y, w, h, m, { xt, yt, xFmt, yFmt, xTicks = 6, yTicks = 5, grid = true } = {}) {
    if (grid) g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(yTicks)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(xTicks, xFmt).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(yTicks, yFmt).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    if (xt) g.append('text').attr('class', 'axis-label').attr('x', (m.l + w - m.r) / 2).attr('y', h - 6).attr('text-anchor', 'middle').text(xt);
    if (yt) g.append('text').attr('class', 'axis-label').attr('transform', `translate(14,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yt);
  }

  /* ---------- 0 · beeswarm of the thirty ---------- */
  let swarmMode = 'all';
  chart('swarm', (svg, w, h, anim, c) => {
    const m = { l: mob() ? 70 : 110, r: 24, t: 16, b: 46 };
    const x = d3.scaleLinear().domain([50, 410]).range([m.l, w - m.r]);
    const r = mob() ? 6.5 : 9.5;
    const rowY = { Batter: m.t + (h - m.t - m.b) * 0.18, 'All-rounder': m.t + (h - m.t - m.b) * 0.5, Bowler: m.t + (h - m.t - m.b) * 0.82 };
    const mid = m.t + (h - m.t - m.b) / 2;
    const layout = (mode) => {
      const nodes = rows.map((d) => ({ ...d, x: x(d.Runs_Scored), y: mode === 'role' ? rowY[d.Player_Role] : mid }));
      const sim = d3.forceSimulation(nodes).force('x', d3.forceX((d) => x(d.Runs_Scored)).strength(1)).force('y', d3.forceY((d) => (mode === 'role' ? rowY[d.Player_Role] : mid)).strength(0.08)).force('c', d3.forceCollide(r + 1.6)).stop();
      for (let i = 0; i < 320; i++) sim.tick();
      return Object.fromEntries(nodes.map((n) => [n.Player_ID, n]));
    };
    const pos = { all: layout('all'), role: layout('role') };
    const g = svg.append('g');
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(mob() ? 4 : 8).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text('Runs scored →');
    const guides = g.append('g');
    function drawGuides(mode) {
      guides.selectAll('*').remove();
      if (mode === 'role') {
        ROLES.forEach((ro) => {
          const mu = mean(rows.filter((d) => d.Player_Role === ro).map((d) => d.Runs_Scored));
          guides.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', rowY[ro]).attr('y2', rowY[ro]).attr('stroke', 'rgba(236,226,207,.06)');
          guides.append('text').attr('x', 0).attr('y', rowY[ro] + 4).attr('fill', COL[ro]).attr('font-size', mob() ? 10 : 11).attr('letter-spacing', '.14em').text(ro.toUpperCase());
          guides.append('line').attr('x1', x(mu)).attr('x2', x(mu)).attr('y1', rowY[ro] - r * 3.2).attr('y2', rowY[ro] + r * 3.2).attr('stroke', IVORY).attr('stroke-width', 1.4).attr('opacity', 0).transition().delay(500).duration(600).attr('opacity', 0.9);
          guides.append('text').attr('x', x(mu)).attr('y', rowY[ro] - r * 3.2 - 6).attr('text-anchor', 'middle').attr('fill', IVORY).attr('font-size', 11).attr('opacity', 0).text('mean ' + fmt(mu, 1)).transition().delay(600).duration(600).attr('opacity', 1);
        });
      } else {
        guides.append('line').attr('x1', x(MU)).attr('x2', x(MU)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', 'rgba(239,231,215,.35)').attr('stroke-dasharray', '2 4');
        guides.append('text').attr('x', x(MU) + 8).attr('y', m.t + 10).attr('fill', IVORY).attr('font-size', 11).text('Pooled mean ' + fmt(MU, 1));
      }
    }
    drawGuides(swarmMode === 'table' ? 'all' : swarmMode);
    const dots = g.append('g').selectAll('circle').data(rows).join('circle')
      .attr('r', anim ? 0 : r).attr('fill', (d) => COL[d.Player_Role]).attr('stroke', '#0C1017').attr('stroke-width', 1.5).attr('tabindex', 0)
      .attr('cx', (d) => pos[swarmMode === 'role' ? 'role' : 'all'][d.Player_ID].x).attr('cy', (d) => pos[swarmMode === 'role' ? 'role' : 'all'][d.Player_ID].y)
      .attr('aria-label', (d) => `${d.Player_ID}, ${d.Player_Role}, ${d.Runs_Scored} runs`).style('cursor', 'pointer');
    if (anim) dots.transition().delay((d, i) => i * 28).duration(700).ease(d3.easeBackOut).attr('r', r);
    dots.on('mouseenter', function () { d3.select(this).transition().duration(200).attr('r', r * 1.35); }).on('mouseleave.s', function () { d3.select(this).transition().duration(300).attr('r', r); });
    bindTip(dots, (d) => tipRows(`${d.Player_ID} · ${d.Player_Role}`, [['Runs scored', d.Runs_Scored], ['Strike rate', d.Strike_Rate], ['Matches', d.Matches_Played], ['Practice hours', d.Practice_Hours], ['Fitness', d.Fitness_Score]]));
    c.move = (mode) => { drawGuides(mode); dots.transition().duration(1100).ease(d3.easeCubicInOut).delay((d, i) => i * 12).attr('cx', (d) => pos[mode][d.Player_ID].x).attr('cy', (d) => pos[mode][d.Player_ID].y); };
  }, 0.36, 300);

  // roster table
  (function roster() {
    const el = $('#roster'); const cols = [['Player_ID', 'ID'], ['Player_Role', 'Role'], ['Runs_Scored', 'Runs'], ['Strike_Rate', 'Strike rate'], ['Matches_Played', 'Matches'], ['Practice_Hours', 'Practice h'], ['Fitness_Score', 'Fitness']];
    let key = 'Player_ID', dir = 1;
    const render = () => {
      const s = [...rows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
      el.innerHTML = `<table class="lux"><thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}" ${k === key ? `aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${k === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead><tbody>${s.map((r) => `<tr>${cols.map(([k]) => `<td>${k === 'Player_Role' ? `<span class="sw" style="background:${COL[r[k]]}"></span>${r[k]}` : r[k]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      $$('th', el).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; dir = k === key ? -dir : 1; key = k; render(); }));
    };
    render();
  })();
  $$('[data-swarm]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-swarm]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    const mode = b.dataset.swarm; const sw = $('#swarm'), ro = $('#roster');
    if (mode === 'table') { sw.hidden = true; ro.hidden = false; swarmMode = 'table'; return; }
    sw.hidden = false; ro.hidden = true; swarmMode = mode;
    const c = charts.find((k) => k.el === sw); if (!c.drawn || !c.move) draw(c, false); c.move(mode);
  }));

  /* ---------- I · waffle ---------- */
  (function waffle() {
    const el = $('#waffle'); if (!el) return;
    const order = [...rows].sort((a, b) => ROLES.indexOf(a.Player_Role) - ROLES.indexOf(b.Player_Role));
    el.innerHTML = order.map((r, i) => `<i style="background:${COL[r.Player_Role]};transition-delay:${i * 35}ms" title="${r.Player_ID} · ${r.Player_Role}"></i>`).join('');
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { el.classList.add('in'); o.disconnect(); } }, { threshold: 0.4 }).observe(el);
  })();

  /* ---------- II · estimator lab ---------- */
  const lab = { est: 'mean', n: 10 };
  const EST = {
    mean: { f: mean, target: MU, dom: [40, 390], label: 'Sample mean (runs)', unit: 'runs²', sc: 1 },
    median: { f: median, target: MU, dom: [40, 390], label: 'Sample median (runs)', unit: 'runs²', sc: 1 },
    s2: { f: (a) => variance(a, 1), target: SIG2, dom: [0, 22000], label: 's² with divisor n − 1 (runs²)', unit: 'M runs⁴', sc: 1e6 },
    s2n: { f: (a) => variance(a, 0), target: SIG2, dom: [0, 22000], label: 'σ̂² with divisor n (runs²)', unit: 'M runs⁴', sc: 1e6 },
  };
  chart('lab', (svg, w, h, anim) => {
    const E = EST[lab.est], n = lab.n, B = 4000, rnd = Math.random;
    const est = new Float64Array(B), buf = new Array(n);
    for (let b = 0; b < B; b++) { for (let i = 0; i < n; i++) buf[i] = runs[(rnd() * runs.length) | 0]; est[b] = E.f(buf); }
    const arr = Array.from(est), avg = mean(arr), vr = variance(arr), bias = avg - E.target, mse = vr + bias * bias;
    const m = { l: 18, r: 18, t: 30, b: 48 };
    const x = d3.scaleLinear().domain(E.dom).range([m.l, w - m.r]);
    const bins = d3.bin().domain(E.dom).thresholds(d3.range(E.dom[0], E.dom[1], (E.dom[1] - E.dom[0]) / 70))(arr.filter((v) => v >= E.dom[0] && v <= E.dom[1]));
    const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length) * 1.12]).range([h - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(mob() ? 4 : 8).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text(E.label);
    const grad = svg.append('defs').append('linearGradient').attr('id', 'labg').attr('x1', 0).attr('y1', 1).attr('x2', 0).attr('y2', 0);
    grad.append('stop').attr('offset', 0).attr('stop-color', '#8C6A2E'); grad.append('stop').attr('offset', 1).attr('stop-color', GOLD2);
    g.append('g').selectAll('rect').data(bins).join('rect').attr('x', (b) => x(b.x0) + 1).attr('width', (b) => Math.max(0, x(b.x1) - x(b.x0) - 2)).attr('rx', 1.5)
      .attr('y', h - m.b).attr('height', 0).attr('fill', 'url(#labg)').attr('opacity', 0.9)
      .transition().duration(anim ? 900 : 500).delay((b, i) => i * 6).attr('y', (b) => y(b.length)).attr('height', (b) => h - m.b - y(b.length));
    const vline = (v, col, label, dy, anchor) => {
      g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 8).attr('y2', h - m.b).attr('stroke', col).attr('stroke-width', 1.2);
      g.append('text').attr('x', x(v) + (anchor === 'end' ? -8 : 8)).attr('y', m.t + dy).attr('fill', col).attr('font-size', 11).attr('text-anchor', anchor).text(label);
    };
    const leftSide = avg < E.target;
    vline(E.target, IVORY, 'Truth ' + fmt(E.target, E.sc > 1 ? 0 : 1), 0, leftSide ? 'start' : 'end');
    vline(avg, GOLD2, 'Average estimate ' + fmt(avg, E.sc > 1 ? 0 : 1), 18, leftSide ? 'end' : 'start');
    const sc = E.sc, d = sc > 1 ? 3 : 1;
    $('#labLive').innerHTML = [['Bias', fmt(bias, sc > 1 ? 0 : 2) + (sc > 1 ? ' runs²' : ' runs')], ['Variance', fmt(vr / sc, d) + ' ' + E.unit], ['Bias²', fmt((bias * bias) / sc, d) + ' ' + E.unit], ['MSE', fmt(mse / sc, d) + ' ' + E.unit]]
      .map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  }, 0.34, 280);
  const redrawLab = () => { const c = charts.find((k) => k.el.id === 'lab'); if (c) draw(c, false); };
  $$('#labEst button').forEach((b) => b.addEventListener('click', () => { $$('#labEst button').forEach((x) => x.setAttribute('aria-pressed', x === b)); lab.est = b.dataset.est; redrawLab(); }));
  const labN = $('#labN'); let lt;
  labN.addEventListener('input', () => { lab.n = +labN.value; $('#labNv').textContent = lab.n; clearTimeout(lt); lt = setTimeout(redrawLab, 90); });
  $('#labGo').addEventListener('click', redrawLab);

  /* ---------- II · MSE vs n (from analysis.py) ---------- */
  chart('mse', (svg, w, h, anim) => {
    const R = DATA.task2.resampling;
    const byE = (e) => R.filter((d) => d.estimator === e).sort((a, b) => a.n - b.n);
    const meanR = byE('Sample mean'), medR = byE('Sample median');
    const m = { l: 58, r: 18, t: 16, b: 50 };
    const x = d3.scaleLog().domain([3, 100]).range([m.l, w - m.r]);
    const y = d3.scaleLog().domain([50, 4500]).range([h - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').attr('class', 'grid').selectAll('line').data([50, 100, 200, 500, 1000, 2000, 4000]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues([3, 5, 10, 20, 30, 50, 100]).tickFormat(d3.format('d')).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([50, 100, 200, 500, 1000, 2000, 4000]).tickFormat(d3.format(',')).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    g.append('text').attr('class', 'axis-label').attr('x', (m.l + w - m.r) / 2).attr('y', h - 6).attr('text-anchor', 'middle').text('Sample size n');
    g.append('text').attr('class', 'axis-label').attr('transform', `translate(13,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('MSE (runs²)');
    const line = (acc) => d3.line().x((d) => x(d.n)).y((d) => y(acc(d))).curve(d3.curveMonotoneX);
    g.append('path').datum(meanR).attr('d', line((d) => d.theory_mse)).attr('fill', 'none').attr('stroke', 'rgba(201,163,90,.28)').attr('stroke-width', 9).attr('stroke-linecap', 'round');
    [[meanR, IVORY], [medR, GOLD]].forEach(([d, col]) => {
      const p = g.append('path').datum(d).attr('d', line((v) => v.mse)).attr('fill', 'none').attr('stroke', col).attr('stroke-width', 2);
      if (anim) { const L = p.node().getTotalLength(); p.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1600).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0); }
      g.append('g').selectAll('circle').data(d).join('circle').attr('cx', (v) => x(v.n)).attr('cy', (v) => y(v.mse)).attr('r', 4).attr('fill', col).attr('stroke', '#0E1219').attr('stroke-width', 2);
    });
    const cross = g.append('line').attr('y1', m.t).attr('y2', h - m.b).attr('stroke', 'rgba(239,231,215,.3)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (e) => {
        const [px] = d3.pointer(e); const nv = x.invert(px); const i = d3.minIndex(meanR, (d) => Math.abs(Math.log(d.n) - Math.log(nv)));
        const a = meanR[i], b = medR[i]; cross.attr('x1', x(a.n)).attr('x2', x(a.n)).attr('opacity', 1);
        showTip(tipRows(`n = ${a.n}`, [['Mean · MSE', fmt(a.mse, 1)], ['Theory σ²/n', fmt(a.theory_mse, 1)], ['Median · MSE', fmt(b.mse, 1)], ['Ratio', fmt(b.mse / a.mse, 2) + '×']]), e.clientX, e.clientY);
      }).on('mouseleave', () => { cross.attr('opacity', 0); hideTip(); });
  }, 0.68, 300);

  /* ---------- II · variance estimator decomposition ---------- */
  chart('decomp', (svg, w, h, anim) => {
    const R = DATA.task2.resampling, ns = [5, 10, 30];
    const get = (e, n) => R.find((d) => d.estimator === e && d.n === n);
    const items = ns.flatMap((n) => [['S² (divisor n−1)', 's²', '#6B7690'], ['σ̂² (divisor n)', 'σ̂²', GOLD]].map(([e, lab, col]) => ({ n, e, lab, col, ...get(e, n) })));
    const m = { l: 46, r: 12, t: 22, b: 50 };
    const x0 = d3.scaleBand().domain(ns).range([m.l, w - m.r]).paddingInner(0.3).paddingOuter(0.1);
    const x1 = d3.scaleBand().domain(['s²', 'σ̂²']).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0, 18]).range([h - m.b, m.t]);
    const g = svg.append('g');
    const defs = svg.append('defs'); const pat = defs.append('pattern').attr('id', 'hatch').attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('width', 5).attr('height', 5).attr('fill', 'rgba(230,204,148,.18)'); pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', GOLD2).attr('stroke-width', 2);
    g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x0).tickFormat((d) => 'n = ' + d).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    g.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Millions of runs⁴');
    const grp = g.selectAll('g.b').data(items).join('g').attr('class', 'b').attr('transform', (d) => `translate(${x0(d.n) + x1(d.lab)},0)`);
    const bw = x1.bandwidth();
    grp.append('rect').attr('width', bw).attr('rx', 2).attr('fill', (d) => d.col).attr('y', h - m.b).attr('height', 0)
      .transition().duration(anim ? 1000 : 0).delay((d, i) => i * 80).attr('y', (d) => y(d.variance / 1e6)).attr('height', (d) => h - m.b - y(d.variance / 1e6));
    grp.append('rect').attr('width', bw).attr('fill', 'url(#hatch)').attr('y', (d) => y(d.variance / 1e6)).attr('height', 0)
      .transition().duration(anim ? 700 : 0).delay((d, i) => (anim ? 900 : 0) + i * 80).attr('y', (d) => y(d.mse / 1e6)).attr('height', (d) => Math.max(0, y(d.variance / 1e6) - y(d.mse / 1e6)));
    grp.append('text').attr('x', bw / 2).attr('y', (d) => y(d.mse / 1e6) - 8).attr('text-anchor', 'middle').attr('fill', IVORY).attr('font-size', 11).text((d) => fmt(d.mse / 1e6, 2));
    grp.append('text').attr('x', bw / 2).attr('y', h - m.b - 8).attr('text-anchor', 'middle').attr('fill', '#0B0D12').attr('font-size', 10).attr('font-weight', 500).text((d) => (bw > 26 ? d.lab : ''));
    grp.append('rect').attr('width', bw).attr('y', m.t).attr('height', h - m.t - m.b).attr('fill', 'transparent').attr('tabindex', 0);
    bindTip(grp.select('rect:last-of-type'), (d) => tipRows(`${d.lab} · n = ${d.n}`, [['Bias', fmt(d.bias, 1) + ' runs²'], ['Variance', fmt(d.variance / 1e6, 2) + 'M'], ['Bias²', fmt(d.bias_sq / 1e6, 3) + 'M'], ['MSE', fmt(d.mse / 1e6, 2) + 'M']]));
  }, 0.68, 300);

  /* ---------- III · histogram + normal ---------- */
  const SD1 = Math.sqrt(variance(runs, 1));
  chart('hist', (svg, w, h, anim) => {
    const m = { l: 40, r: 14, t: 18, b: 50 };
    const x = d3.scaleLinear().domain([25, 425]).range([m.l, w - m.r]);
    const bins = d3.bin().domain([50, 425]).thresholds(d3.range(50, 425, 25))(runs);
    const y = d3.scaleLinear().domain([0, 6]).range([h - m.b, m.t]);
    const g = svg.append('g');
    axes(g, x, y, w, h, m, { xt: 'Runs scored', yt: 'Players', yTicks: 6, xTicks: mob() ? 4 : 8 });
    const bars = g.append('g').selectAll('rect').data(bins).join('rect').attr('x', (b) => x(b.x0) + 1.5).attr('width', (b) => x(b.x1) - x(b.x0) - 3).attr('rx', 2)
      .attr('y', h - m.b).attr('height', 0).attr('fill', GOLD).attr('opacity', 0.9).attr('tabindex', 0);
    bars.transition().duration(anim ? 900 : 0).delay((b, i) => i * 50).attr('y', (b) => y(b.length)).attr('height', (b) => h - m.b - y(b.length));
    bindTip(bars, (b) => tipRows(`${b.x0}–${b.x1} runs`, [['Players', b.length], ['IDs', b.length ? rows.filter((r) => r.Runs_Scored >= b.x0 && r.Runs_Scored < b.x1).map((r) => r.Player_ID).join(' ') : '—']]));
    const curve = d3.line().x((v) => x(v)).y((v) => y(npdf(v, MU, SD1) * 30 * 25)).curve(d3.curveBasis);
    const p = g.append('path').datum(d3.range(25, 426, 4)).attr('d', curve).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.6);
    if (anim) { const L = p.node().getTotalLength(); p.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().delay(600).duration(1400).attr('stroke-dashoffset', 0); }
    g.append('text').attr('x', x(MU + 2.2 * SD1)).attr('y', y(npdf(MU + 1.2 * SD1, MU, SD1) * 750) - 6).attr('fill', IVORY).attr('font-size', 11).text('Normal fit');
  }, 0.66, 280);

  /* ---------- III · Q–Q plot ---------- */
  chart('qq', (svg, w, h, anim) => {
    const n = runs.length, m = { l: 44, r: 14, t: 18, b: 50 };
    const sorted = rows.map((r) => ({ ...r, z: (r.Runs_Scored - MU) / SD1 })).sort((a, b) => a.z - b.z);
    const q = d3.range(n).map((i) => { const p = (i + 1 - 0.375) / (n + 0.25); return invNorm(p); });
    sorted.forEach((d, i) => (d.q = q[i]));
    // 95% pointwise envelope from 3,000 seeded simulated normal samples
    const rnd = mulberry32(2026), sims = Array.from({ length: n }, () => []);
    for (let s = 0; s < 3000; s++) { const a = Array.from({ length: n }, () => gauss(rnd)); const mm = mean(a), sd = Math.sqrt(variance(a, 1)); a.map((v) => (v - mm) / sd).sort((u, v) => u - v).forEach((v, i) => sims[i].push(v)); }
    const lo = sims.map((s) => d3.quantile(s.sort(d3.ascending), 0.025)), hi = sims.map((s) => d3.quantile(s, 0.975));
    const x = d3.scaleLinear().domain([-2.6, 2.6]).range([m.l, w - m.r]), y = d3.scaleLinear().domain([-3, 3]).range([h - m.b, m.t]);
    const g = svg.append('g');
    axes(g, x, y, w, h, m, { xt: 'Theoretical N(0,1) quantile', yt: 'Standardised runs', yTicks: 6 });
    g.append('path').datum(d3.range(n)).attr('d', d3.area().x((i) => x(q[i])).y0((i) => y(lo[i])).y1((i) => y(hi[i])).curve(d3.curveMonotoneX)).attr('fill', 'rgba(201,163,90,.12)');
    g.append('line').attr('x1', x(-2.6)).attr('x2', x(2.6)).attr('y1', y(-2.6)).attr('y2', y(2.6)).attr('stroke', IVORY).attr('stroke-width', 1.1).attr('opacity', 0.8);
    const dots = g.append('g').selectAll('circle').data(sorted).join('circle').attr('cx', (d) => x(d.q)).attr('cy', (d) => y(d.z)).attr('r', anim ? 0 : 5).attr('fill', (d) => COL[d.Player_Role]).attr('stroke', '#0E1219').attr('stroke-width', 1.5).attr('tabindex', 0);
    if (anim) dots.transition().delay((d, i) => 300 + i * 30).duration(500).attr('r', 5);
    bindTip(dots, (d) => tipRows(`${d.Player_ID} · ${d.Player_Role}`, [['Runs', d.Runs_Scored], ['z-score', fmt(d.z, 2)], ['Normal quantile', fmt(d.q, 2)]]));
    g.append('text').attr('x', w - m.r).attr('y', h - m.b - 12).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11).text(`Shapiro–Wilk W = ${fmt(DATA.task3.shapiro.W, 3)}, p = ${fmt(DATA.task3.shapiro.p, 3)}`);
  }, 0.66, 280);
  function invNorm(p) { // Acklam's rational approximation
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* ---------- III · CLT lab ---------- */
  const clt = { p: 'runs', n: 5 };
  const high = runs.map((v) => (v >= 300 ? 1 : 0));
  chart('clt', (svg, w, h, anim) => {
    const pop = clt.p === 'runs' ? runs : high, n = clt.n, B = 10000, mu = mean(pop), sd = Math.sqrt(variance(pop));
    const means = new Float64Array(B);
    for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += pop[(Math.random() * pop.length) | 0]; means[b] = s / n; }
    const arr = Array.from(means), m = { l: 18, r: 18, t: 20, b: 48 }, g = svg.append('g');
    let x, bars, dens;
    if (clt.p === 'runs') {
      x = d3.scaleLinear().domain([40, 400]).range([m.l, w - m.r]);
      const bw = n === 1 ? 20 : 6; const th = d3.range(40, 400, bw);
      bars = d3.bin().domain([40, 400]).thresholds(th)(arr).map((b) => ({ x0: b.x0, x1: b.x1, d: b.length / B / (b.x1 - b.x0) }));
      dens = (v) => npdf(v, mu, sd / Math.sqrt(n));
    } else {
      x = d3.scaleLinear().domain([-0.15, 1.15]).range([m.l, w - m.r]);
      const cnt = new Map(); arr.forEach((v) => { const k = Math.round(v * n); cnt.set(k, (cnt.get(k) || 0) + 1); });
      const sp = 1 / n, wd = Math.min(0.08, sp * 0.8);
      bars = [...cnt.entries()].map(([k, c]) => ({ x0: k / n - wd / 2, x1: k / n + wd / 2, d: c / B / sp }));
      dens = (v) => npdf(v, mu, sd / Math.sqrt(n));
    }
    const ymax = Math.max(d3.max(bars, (b) => b.d), dens(mu)) * 1.12;
    const y = d3.scaleLinear().domain([0, ymax]).range([h - m.b, m.t]);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(mob() ? 4 : 8).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text(clt.p === 'runs' ? 'Mean of n players’ runs' : 'Share of high-output players in a sample of n');
    g.append('g').selectAll('rect').data(bars).join('rect').attr('x', (b) => x(b.x0) + 0.5).attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 1)).attr('rx', 1.5).attr('fill', GOLD).attr('opacity', 0.88)
      .attr('y', h - m.b).attr('height', 0).transition().duration(anim ? 900 : 600).ease(d3.easeCubicOut).attr('y', (b) => y(b.d)).attr('height', (b) => h - m.b - y(b.d));
    const xs = d3.range(x.domain()[0], x.domain()[1], (x.domain()[1] - x.domain()[0]) / 300);
    const p = g.append('path').datum(xs).attr('d', d3.line().x((v) => x(v)).y((v) => y(dens(v))).curve(d3.curveBasis)).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.8);
    const L = p.node().getTotalLength(); p.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().delay(300).duration(1000).attr('stroke-dashoffset', 0);
    const sk = skewness(arr), d = clt.p === 'runs' ? 2 : 4;
    $('#cltLive').innerHTML = [['Mean of means', fmt(mean(arr), d)], ['SD of means', fmt(Math.sqrt(variance(arr)), d)], ['Theory <span class="nt">σ/√n</span>', fmt(sd / Math.sqrt(n), d)], ['Skewness', fmt(sk, 3)]]
      .map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  }, 0.34, 280);
  const redrawClt = () => { const c = charts.find((k) => k.el.id === 'clt'); if (c) draw(c, false); };
  $$('#cltParent button').forEach((b) => b.addEventListener('click', () => { $$('#cltParent button').forEach((x) => x.setAttribute('aria-pressed', x === b)); clt.p = b.dataset.p; redrawClt(); }));
  $$('#cltN button').forEach((b) => b.addEventListener('click', () => { $$('#cltN button').forEach((x) => x.setAttribute('aria-pressed', x === b)); clt.n = +b.dataset.n; redrawClt(); }));

  /* ---------- IV · gauge ---------- */
  (function gauge() {
    const arc = $('#gaugeArc'); if (!arc) return; const L = 2 * Math.PI * 86, eta = DATA.task4.eta2;
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { arc.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(.2,.7,.1,1)'; arc.style.strokeDashoffset = L * (1 - eta); o.disconnect(); } }, { threshold: 0.5 }).observe(arc);
  })();

  /* ---------- IV · runs by role ---------- */
  chart('roles', (svg, w, h, anim) => {
    const m = { l: 52, r: 24, t: 24, b: 44 };
    const x = d3.scaleBand().domain(ROLES).range([m.l, w - m.r]).padding(0.3);
    const y = d3.scaleLinear().domain([40, 420]).range([h - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(6)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSize(0).tickPadding(14)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    g.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Runs scored');
    g.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(MU)).attr('y2', y(MU)).attr('stroke', 'rgba(239,231,215,.35)').attr('stroke-dasharray', '2 5');
    g.append('text').attr('x', w - m.r).attr('y', y(MU) - 8).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11).text('Grand mean ' + fmt(MU, 1));
    const jit = mulberry32(11);
    ROLES.forEach((ro, k) => {
      const v = rows.filter((d) => d.Player_Role === ro), vals = v.map((d) => d.Runs_Scored).sort(d3.ascending);
      const q1 = d3.quantile(vals, 0.25), q3 = d3.quantile(vals, 0.75), mu = mean(vals), cx = x(ro) + x.bandwidth() / 2, bw = Math.min(x.bandwidth(), 180);
      g.append('rect').attr('x', cx - bw / 2).attr('width', bw).attr('y', y(q3)).attr('height', y(q1) - y(q3)).attr('fill', COL[ro]).attr('opacity', 0).attr('rx', 3).transition().delay(anim ? 200 + k * 150 : 0).duration(800).attr('opacity', 0.12);
      g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(vals[0])).attr('y2', y(vals[vals.length - 1])).attr('stroke', COL[ro]).attr('opacity', 0.4);
      const dots = g.append('g').selectAll('circle').data(v).join('circle').attr('cx', () => cx + (jit() - 0.5) * bw * 0.55).attr('cy', anim ? y(mu) : (d) => y(d.Runs_Scored)).attr('r', mob() ? 5 : 7)
        .attr('fill', COL[ro]).attr('stroke', '#0E1219').attr('stroke-width', 1.6).attr('tabindex', 0).attr('opacity', anim ? 0 : 1);
      if (anim) dots.transition().delay((d, i) => 300 + k * 200 + i * 40).duration(900).ease(d3.easeCubicOut).attr('cy', (d) => y(d.Runs_Scored)).attr('opacity', 1);
      bindTip(dots, (d) => tipRows(`${d.Player_ID} · ${ro}`, [['Runs', d.Runs_Scored], ['Residual', fmt(d.Runs_Scored - mu, 1)], ['Strike rate', d.Strike_Rate]]));
      g.append('line').attr('x1', cx - bw / 2 - 8).attr('x2', cx + bw / 2 + 8).attr('y1', y(mu)).attr('y2', y(mu)).attr('stroke', IVORY).attr('stroke-width', 2.2).attr('stroke-linecap', 'round');
      g.append('text').attr('x', cx + bw / 2 + 14).attr('y', y(mu) + 4).attr('fill', IVORY).attr('font-size', 12).text(mob() ? fmt(mu, 0) : 'mean ' + fmt(mu, 1));
    });
  }, 0.42, 320);

  /* ---------- IV · F distribution ---------- */
  chart('fdist', (svg, w, h, anim) => {
    const T = DATA.task4, d1 = T.df_between, d2 = T.df_within, F = T.F, Fc = T.F_crit;
    const m = { l: 44, r: 20, t: 26, b: 48 };
    const x = d3.scaleLinear().domain([0, 36]).range([m.l, w - m.r]), y = d3.scaleLinear().domain([0, 1.02]).range([h - m.b, m.t]);
    const g = svg.append('g');
    axes(g, x, y, w, h, m, { xt: `F statistic (df = ${d1}, ${d2})`, yTicks: 4, xTicks: mob() ? 6 : 12 });
    const xs = d3.range(0, 36.01, 0.05);
    g.append('path').datum(xs.filter((v) => v >= Fc)).attr('d', d3.area().x((v) => x(v)).y0(h - m.b).y1((v) => y(fpdf(v, d1, d2)))).attr('fill', 'rgba(207,95,128,.3)');
    const p = g.append('path').datum(xs).attr('d', d3.line().x((v) => x(v)).y((v) => y(fpdf(v, d1, d2)))).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.8);
    if (anim) { const L = p.node().getTotalLength(); p.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1400).attr('stroke-dashoffset', 0); }
    g.append('line').attr('x1', x(Fc)).attr('x2', x(Fc)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', COL.Bowler).attr('stroke-width', 1.2);
    g.append('text').attr('x', x(Fc) + 8).attr('y', m.t + 8).attr('fill', COL.Bowler).attr('font-size', 11.5).text(`Critical F = ${fmt(Fc, 2)} (α = 0.05)`);
    const fx = x(F);
    const mk = g.append('g').attr('transform', `translate(${anim ? x(Fc) : fx},0)`);
    mk.append('line').attr('y1', m.t).attr('y2', h - m.b).attr('stroke', GOLD2).attr('stroke-width', 2);
    mk.append('circle').attr('cy', h - m.b).attr('r', 6).attr('fill', GOLD2).attr('stroke', '#0E1219').attr('stroke-width', 2);
    mk.append('circle').attr('cy', h - m.b).attr('r', 6).attr('fill', 'none').attr('stroke', GOLD2).attr('class', 'pulse');
    mk.append('text').attr('x', -10).attr('y', m.t + 8).attr('text-anchor', 'end').attr('fill', GOLD2).attr('font-size', 13).text(`Observed F = ${fmt(F, 2)}`);
    const [mant, ex] = T.p.toExponential(2).split('e');
    mk.append('text').attr('x', -10).attr('y', m.t + 28).attr('text-anchor', 'end').attr('fill', IVORY).attr('font-size', 12).text(`p = ${mant} × 10`).append('tspan').attr('dy', -6).attr('font-size', 9).text(ex.replace('-', '−'));
    if (anim) mk.transition().delay(900).duration(1800).ease(d3.easeCubicInOut).attr('transform', `translate(${fx},0)`);
    (function pulse() { mk.select('.pulse').attr('r', 6).attr('opacity', 0.9).transition().duration(1800).ease(d3.easeCubicOut).attr('r', 22).attr('opacity', 0).on('end', pulse); })();
    const cross = g.append('line').attr('y1', m.t).attr('y2', h - m.b).attr('stroke', 'rgba(239,231,215,.3)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (e) => { const v = Math.max(0, x.invert(d3.pointer(e)[0])); cross.attr('x1', x(v)).attr('x2', x(v)).attr('opacity', 1);
        const tail = Math.pow(1 + (d1 * v) / d2, -d2 / 2); // closed form for d1 = 2
        showTip(tipRows(`F = ${fmt(v, 2)}`, [['Density', fmt(fpdf(v, d1, d2), 4)], ['P(F ≥ this) under H₀', tail < 1e-4 ? tail.toExponential(2) : fmt(tail, 4)]]), e.clientX, e.clientY); })
      .on('mouseleave', () => { cross.attr('opacity', 0); hideTip(); });
  }, 0.3, 260);

  /* ---------- V · chi-square ---------- */
  chart('chi', (svg, w, h, anim) => {
    const T = DATA.task5.normal_fit, D = DATA.display, K = T.observed.length;
    const items = d3.range(K).map((i) => ({ i, o: T.observed[i], e: T.expected[i], lab: D[`c${i + 1}_lab`], x2: (T.observed[i] - T.expected[i]) ** 2 / T.expected[i] }));
    const m = { l: 34, r: 10, t: 22, b: 58 };
    const x0 = d3.scaleBand().domain(d3.range(K)).range([m.l, w - m.r]).paddingInner(0.28);
    const x1 = d3.scaleBand().domain(['e', 'o']).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0, 9]).range([h - m.b, m.t]);
    const g = svg.append('g');
    g.append('g').attr('class', 'grid').selectAll('line').data([2, 4, 6, 8]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([0, 2, 4, 6, 8]).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    const grp = g.selectAll('g.c').data(items).join('g').attr('class', 'c').attr('transform', (d) => `translate(${x0(d.i)},0)`);
    grp.append('rect').attr('x', x1('e')).attr('width', x1.bandwidth()).attr('rx', 2).attr('fill', 'rgba(236,226,207,.2)').attr('y', y(0)).attr('height', 0).transition().duration(anim ? 800 : 0).delay((d) => d.i * 90).attr('y', (d) => y(d.e)).attr('height', (d) => y(0) - y(d.e));
    grp.append('rect').attr('x', x1('o')).attr('width', x1.bandwidth()).attr('rx', 2).attr('fill', GOLD).attr('y', y(0)).attr('height', 0).transition().duration(anim ? 900 : 0).delay((d) => 200 + d.i * 90).attr('y', (d) => y(d.o)).attr('height', (d) => y(0) - y(d.o));
    grp.append('text').attr('x', x1('o') + x1.bandwidth() / 2).attr('y', (d) => y(d.o) - 7).attr('text-anchor', 'middle').attr('fill', IVORY).attr('font-size', 12).text((d) => d.o);
    grp.append('text').attr('x', x0.bandwidth() / 2).attr('y', h - m.b + 20).attr('text-anchor', 'middle').attr('fill', IVORY).attr('font-size', 11).text((d) => 'Class ' + (d.i + 1));
    grp.append('text').attr('x', x0.bandwidth() / 2).attr('y', h - m.b + 38).attr('text-anchor', 'middle').attr('fill', MUTED).attr('font-size', mob() ? 8.5 : 10).text((d) => d.lab.replace(' – ', '–'));
    grp.append('rect').attr('width', x0.bandwidth()).attr('y', m.t).attr('height', h - m.t - m.b).attr('fill', 'transparent').attr('tabindex', 0);
    bindTip(grp.select('rect:last-of-type'), (d) => tipRows(`Class ${d.i + 1} · ${d.lab}`, [['Observed', d.o], ['Expected', fmt(d.e, 1)], ['(O − E)² / E', fmt(d.x2, 3)]]));
  }, 0.62, 300);
})();
