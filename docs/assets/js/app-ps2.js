/* ==========================================================================
   Pace, Par & Power: interactive layer for Volume II (Problem Statement 2)
   Reported numbers come from window.DATATHON2 (results/ps2/results.json, produced by
   analysis_ps2.py). The labs run fresh simulations in the browser and are labelled as live.
   ========================================================================== */
(() => {
  'use strict';
  const DATA = window.DATATHON2;
  const rows = DATA.data;
  const sr = rows.map((r) => r.Strike_Rate);
  const N = sr.length;
  const ROLES = ['Batter', 'All-rounder', 'Bowler'];
  const COL = { Batter: '#B98630', 'All-rounder': '#5486D3', Bowler: '#CF5F80' };
  const GOLD = '#C9A35A', GOLD2 = '#E6CC94', IVORY = '#EFE7D7', MUTED = '#8F8878', ROSE = '#CF5F80', BLUE = '#5486D3';
  const MU0 = DATA.meta.mu0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- maths ---------- */
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = (a, ddof = 0) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - ddof); };
  const fmt = (v, d = 2) => { if (Math.abs(v) < 0.5 * 10 ** -d) v = 0; return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const lgamma = (z) => {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  };
  const erf = (x) => { // Abramowitz & Stegun 7.1.26
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  };
  const ncdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const npdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  function betacf(a, b, x) {
    const FP = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  const tcdf = (t, v) => { const p = 0.5 * ibeta(v / (v + t * t), v / 2, 0.5); return t > 0 ? 1 - p : p; };
  const tpdf = (t, v) => Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2) - 0.5 * Math.log(v * Math.PI) - ((v + 1) / 2) * Math.log(1 + (t * t) / v));
  const tinv = (p, v) => { let lo = -60, hi = 60; for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (tcdf(m, v) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  function ncTsf(c, v, lam) { // P(T > c) for a noncentral t(v, lam): integrate over the chi-square mixing variable
    const K = 600, upper = v + 12 * Math.sqrt(2 * v) + 30, h = upper / K, lg = lgamma(v / 2) + (v / 2) * Math.LN2;
    let s = 0;
    for (let i = 0; i <= K; i++) {
      const x = i * h;
      const f = x === 0 ? (v === 2 ? 0.5 : 0) : Math.exp((v / 2 - 1) * Math.log(x) - x / 2 - lg);
      const w = i === 0 || i === K ? 1 : i % 2 ? 4 : 2;
      s += w * f * (1 - ncdf(c * Math.sqrt(x / v) - lam));
    }
    return (s * h) / 3;
  }
  const tPower = (delta, n, sigma, alpha) => { const v = n - 1, c = tinv(1 - alpha / 2, v), lam = (delta * Math.sqrt(n)) / sigma; return Math.min(1, ncTsf(c, v, lam) + ncTsf(c, v, -lam)); };
  const binomPmf = (k, n, p) => (p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
  const binomRange = (n, p) => { let c = 0, lo = null, hi = null; for (let k = 0; k <= n; k++) { c += binomPmf(k, n, p); if (lo === null && c >= 0.025 - 1e-12) lo = k; if (hi === null && c >= 0.975 - 1e-12) hi = k; } return [lo, hi]; };
  const XBAR = mean(sr), S = Math.sqrt(variance(sr, 1)), S2N = variance(sr, 0), SE = S / Math.sqrt(N), T29 = tinv(0.975, N - 1);
  const loglik = (mu, sd) => -0.5 * N * Math.log(2 * Math.PI * sd * sd) - sr.reduce((a, v) => a + (v - mu) ** 2, 0) / (2 * sd * sd);
  const LLMAX = loglik(XBAR, Math.sqrt(S2N));

  /* ---------- tooltip ---------- */
  const tt = $('.tt');
  function showTip(html, x, y) {
    tt.innerHTML = html; tt.classList.add('on');
    const r = tt.getBoundingClientRect(); let left = x + 18, top = y + 18;
    if (left + r.width > innerWidth - 12) left = x - r.width - 18;
    if (top + r.height > innerHeight - 12) top = y - r.height - 18;
    tt.style.left = Math.max(8, left) + 'px'; tt.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => tt.classList.remove('on');
  const tipRows = (title, pairs) => `<div class="h">${title}</div>` + pairs.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('');
  function bindTip(sel, fn) {
    sel.on('mousemove', (e, d) => showTip(fn(d), e.clientX, e.clientY)).on('mouseleave', hideTip)
      .on('focus', function (e, d) { const r = this.getBoundingClientRect(); showTip(fn(d), r.right, r.top); }).on('blur', hideTip);
  }

  /* ---------- nav, progress, reveal, marquee, count-up ---------- */
  const nav = $('#nav'), prog = $('.progress');
  const onScroll = () => { nav.classList.toggle('solid', scrollY > 40); const h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`; };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('.menu-btn').addEventListener('click', (e) => { const o = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  $$('.links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  $$('[data-reveal]').forEach((el) => io.observe(el));
  const secIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) $$('.links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  $$('section.chapter').forEach((s) => secIO.observe(s));
  const track = $('#marquee'); track.innerHTML += track.innerHTML;
  setTimeout(() => $$('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count.replace(/,/g, '').replace('−', '-')), dec = +el.dataset.dec;
    if (reduce || !isFinite(target)) return;
    const t0 = performance.now(), dur = 1800;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(target * e, dec); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), 900);

  /* ==========================================================================
     HERO: a loom of confidence intervals. Each thread is a 95% t-interval from a fresh
     sample of 30; gold threads capture the true mean, rose threads miss it.
     ========================================================================== */
  (function loom() {
    const cv = $('#loom'); if (!cv) return;
    const ctx = cv.getContext('2d'), rate = $('#loomRate');
    let W, H, dpr, spacing, scroll = 0, items = [], total = 0, hits = 0, raf, last = 0;
    const lo = 104, hi = 141;
    const Y = (v) => H * 0.16 + (1 - (v - lo) / (hi - lo)) * H * 0.8;
    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); spacing = W > 900 ? 9 : 7; }
    function newInterval(bornAt) {
      const s = []; for (let i = 0; i < N; i++) s.push(sr[(Math.random() * N) | 0]);
      const m = mean(s), half = (T29 * Math.sqrt(variance(s, 1))) / Math.sqrt(N), hit = m - half <= XBAR && XBAR <= m + half;
      total++; if (hit) hits++;
      return { m, half, hit, born: bornAt, at: scroll };
    }
    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      const gp = ctx.createLinearGradient(0, 0, W, 0); gp.addColorStop(0, 'rgba(207,95,128,0)'); gp.addColorStop(0.6, 'rgba(207,95,128,.15)'); gp.addColorStop(1, 'rgba(207,95,128,.55)');
      ctx.save(); ctx.setLineDash([2, 6]); ctx.strokeStyle = gp; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Y(MU0)); ctx.lineTo(W, Y(MU0)); ctx.stroke(); ctx.restore();
    }
    function frame(t) {
      const dt = Math.min(50, t - (last || t)); last = t;
      scroll += dt * 0.055;
      while (!items.length || scroll - items[items.length - 1].at >= spacing) items.push(newInterval(t));
      drawStatic();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i], x = W + 6 - (scroll - it.at);
        if (x < -10) { items.splice(i, 1); continue; }
        const grow = Math.min(1, (t - it.born) / 520), e = 1 - Math.pow(1 - grow, 3), h = it.half * e;
        const u = Math.max(0, Math.min(1, (x - W * 0.38) / (W * 0.55))), a = 0.04 + 0.76 * u * u * (3 - 2 * u);
        ctx.globalAlpha = a;
        ctx.strokeStyle = it.hit ? 'rgba(201,163,90,.35)' : 'rgba(207,95,128,.45)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, Y(it.m - h)); ctx.lineTo(x, Y(it.m + h)); ctx.stroke();
        ctx.strokeStyle = it.hit ? '#E6CC94' : '#E68AA5'; ctx.lineWidth = it.hit ? 1.2 : 1.8;
        ctx.beginPath(); ctx.moveTo(x, Y(it.m - h)); ctx.lineTo(x, Y(it.m + h)); ctx.stroke();
        ctx.fillStyle = '#FBF5EA'; ctx.beginPath(); ctx.arc(x, Y(it.m), 1.4, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const gl = ctx.createLinearGradient(0, 0, W, 0); gl.addColorStop(0, 'rgba(239,231,215,0)'); gl.addColorStop(0.55, 'rgba(239,231,215,.12)'); gl.addColorStop(0.8, 'rgba(239,231,215,.6)'); gl.addColorStop(1, 'rgba(239,231,215,.7)');
      ctx.strokeStyle = gl; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Y(XBAR)); ctx.lineTo(W, Y(XBAR)); ctx.stroke();
      ctx.font = '10px Jost, sans-serif'; ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(239,231,215,.6)'; ctx.fillText('TRUE MEAN ' + XBAR.toFixed(2), W - 24, Y(XBAR) - 8);
      ctx.fillStyle = 'rgba(230,138,165,.7)'; ctx.fillText('PAR ' + MU0, W - 24, Y(MU0) + 16);
      if (rate && total) rate.textContent = (100 * hits / total).toFixed(1) + '%';
      raf = requestAnimationFrame(frame);
    }
    size();
    for (let x0 = 0; x0 <= W; x0 += spacing) { const it = newInterval(-1e9); it.at = x0 - W - 6; items.push(it); }
    if (reduce) { last = 0; frame(performance.now()); cancelAnimationFrame(raf); raf = null; return; }
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !raf) { last = 0; raf = requestAnimationFrame(frame); } else if (!e.isIntersecting) { cancelAnimationFrame(raf); raf = null; } }).observe(cv);
    let rw = innerWidth; addEventListener('resize', () => { if (Math.abs(innerWidth - rw) > 40) { rw = innerWidth; size(); } });
  })();

  /* ==========================================================================
     CHART FRAMEWORK
     ========================================================================== */
  const charts = [];
  function chart(id, render, aspect = 0.5, minH = 260) {
    const el = document.getElementById(id); if (!el) return null;
    const c = { el, render, aspect, minH, w: 0, drawn: false };
    charts.push(c);
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { draw(c, true); o.disconnect(); } }, { threshold: 0.15 }).observe(el);
    return c;
  }
  function draw(c, first) {
    const w = c.el.clientWidth; if (!w) return;
    c.w = w; const h = Math.max(c.minH, Math.round(w * c.aspect));
    c.el.innerHTML = '';
    const svg = d3.select(c.el).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    c.render(svg, w, h, first && !reduce, c);
    c.drawn = true;
  }
  const redraw = (c) => c && c.drawn && draw(c, false);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => charts.forEach((c) => c.drawn && Math.abs(c.el.clientWidth - c.w) > 2 && draw(c, false)), 160); });
  const mob = () => innerWidth < 640;
  function xAxis(g, x, h, m, ticks, label, w) {
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(ticks).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    if (label) g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text(label);
  }
  function yAxis(g, y, w, m, ticks, label, h, fmtY) {
    g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(ticks)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticks, fmtY).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    if (label) g.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(label);
  }
  const liveCells = (el, cells) => { el.innerHTML = cells.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join(''); };

  /* ---------- 0 · the thirty against par ---------- */
  chart('srSwarm', (svg, w, h, anim) => {
    const m = { l: 20, r: 24, t: 26, b: 46 };
    const x = d3.scaleLinear().domain([82, 152]).range([m.l, w - m.r]);
    const r = mob() ? 6.5 : 9.5, mid = (m.t + h - m.b) / 2;
    const nodes = rows.map((d) => ({ ...d, x: x(d.Strike_Rate), y: mid }));
    const sim = d3.forceSimulation(nodes).force('x', d3.forceX((d) => x(d.Strike_Rate)).strength(1)).force('y', d3.forceY(mid).strength(0.07)).force('c', d3.forceCollide(r + 1.6)).stop();
    for (let i = 0; i < 320; i++) sim.tick();
    const g = svg.append('g');
    xAxis(g, x, h, m, mob() ? 5 : 8, 'Strike rate (runs per 100 balls) →', w);
    g.append('rect').attr('x', x(MU0)).attr('y', m.t - 10).attr('width', w - m.r - x(MU0)).attr('height', h - m.b - m.t + 10).attr('fill', 'rgba(201,163,90,.05)');
    g.append('line').attr('x1', x(MU0)).attr('x2', x(MU0)).attr('y1', m.t - 10).attr('y2', h - m.b).attr('stroke', ROSE).attr('stroke-dasharray', '3 5');
    g.append('text').attr('x', x(MU0) + 8).attr('y', m.t + 2).attr('fill', ROSE).attr('font-size', 12).text(`Par ${MU0} · ${DATA.display.X} players at or above`);
    g.append('line').attr('x1', x(XBAR)).attr('x2', x(XBAR)).attr('y1', h - m.b - 8).attr('y2', h - m.b).attr('stroke', IVORY);
    const dots = g.append('g').selectAll('circle').data(nodes).join('circle').attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', anim ? 0 : r)
      .attr('fill', (d) => COL[d.Player_Role]).attr('stroke', (d) => (d.Strike_Rate >= MU0 ? GOLD2 : '#0C1017')).attr('stroke-width', (d) => (d.Strike_Rate >= MU0 ? 1.4 : 1.6))
      .attr('opacity', (d) => (d.Strike_Rate >= MU0 ? 1 : 0.62)).attr('tabindex', 0);
    if (anim) dots.transition().delay((d, i) => i * 28).duration(700).ease(d3.easeBackOut).attr('r', r);
    bindTip(dots, (d) => tipRows(`${d.Player_ID} · ${d.Player_Role}`, [['Strike rate', d.Strike_Rate], ['vs par', (d.Strike_Rate - MU0 >= 0 ? '+' : '−') + Math.abs(d.Strike_Rate - MU0).toFixed(1)], ['Runs', d.Runs_Scored], ['Matches', d.Matches_Played]]));
  }, 0.3, 260);

  /* ---------- I · binomial explorer ---------- */
  const bin = { thr: MU0 };
  function binState() {
    const b = sr.map((v) => (v >= bin.thr ? 1 : 0)), X = b.reduce((a, v) => a + v, 0), p = X / N;
    const rx = {}, rp = {}; ROLES.forEach((ro) => { const idx = rows.map((r, i) => (r.Player_Role === ro ? i : -1)).filter((i) => i >= 0); rx[ro] = idx.reduce((a, i) => a + b[i], 0); rp[ro] = rx[ro] / idx.length; });
    const pmf = d3.range(N + 1).map((k) => binomPmf(k, N, p));
    let q = [1]; ROLES.forEach((ro) => { const pr = d3.range(11).map((k) => binomPmf(k, 10, rp[ro])); const out = new Array(q.length + 10).fill(0); q.forEach((a, i) => pr.forEach((c, j) => (out[i + j] += a * c))); q = out; });
    const varQ = ROLES.reduce((a, ro) => a + 10 * rp[ro] * (1 - rp[ro]), 0);
    return { X, p, rx, rp, pmf, quota: q, varB: N * p * (1 - p), varQ, range10: binomRange(10, p) };
  }
  const cPmf = chart('binPmf', (svg, w, h, anim) => {
    const st = binState(), m = { l: 44, r: 10, t: 16, b: 46 };
    const x = d3.scaleBand().domain(d3.range(N + 1)).range([m.l, w - m.r]).padding(0.18);
    const ymax = Math.max(0.05, d3.max(st.pmf), d3.max(st.quota)) * 1.1;
    const y = d3.scaleLinear().domain([0, ymax]).range([h - m.b, m.t]);
    const g = svg.append('g');
    yAxis(g, y, w, m, 4, 'Probability', h, '.2f');
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(d3.range(0, N + 1, 5)).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text(`X = players with S ≥ ${bin.thr}`);
    const bars = g.append('g').selectAll('rect').data(st.pmf).join('rect').attr('x', (d, k) => x(k)).attr('width', x.bandwidth()).attr('rx', 1.5)
      .attr('fill', (d, k) => (k === st.X ? GOLD : 'rgba(201,163,90,.32)')).attr('y', y(0)).attr('height', 0).attr('tabindex', 0);
    bars.transition().duration(anim ? 800 : 350).attr('y', (d) => y(d)).attr('height', (d) => y(0) - y(d));
    bindTip(bars, (d) => { const k = st.pmf.indexOf(d); return tipRows(`X = ${k}`, [['Binomial(30, p)', fmt(d, 4)], ['Quota design', fmt(st.quota[k] || 0, 4)]]); });
    g.append('path').datum(st.quota).attr('d', d3.line().x((d, k) => x(k) + x.bandwidth() / 2).y((d) => y(d)).curve(d3.curveMonotoneX)).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.6);
    g.append('text').attr('x', x(st.X) + x.bandwidth() / 2).attr('y', y(st.pmf[st.X]) - 8).attr('text-anchor', 'middle').attr('fill', GOLD2).attr('font-size', 12).text('X = ' + st.X);
  }, 0.62, 260);
  const cRoles = chart('binRoles', (svg, w, h, anim) => {
    const st = binState(), m = { l: 40, r: 16, t: 16, b: 46 };
    const x = d3.scalePoint().domain(ROLES).range([m.l, w - m.r]).padding(0.5), y = d3.scaleLinear().domain([0, 10.5]).range([h - m.b, m.t]);
    const g = svg.append('g');
    yAxis(g, y, w, m, 5, 'At or above threshold (of 10)', h);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSize(0).tickPadding(12)).call((s) => s.select('.domain').attr('stroke', 'rgba(236,226,207,.22)'));
    const [lo, hi] = st.range10;
    ROLES.forEach((ro) => {
      const cx = x(ro);
      g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(lo)).attr('y2', y(hi)).attr('stroke', 'rgba(236,226,207,.14)').attr('stroke-width', 12).attr('stroke-linecap', 'round');
      g.append('circle').attr('cx', cx).attr('cy', y(10 * st.p)).attr('r', 7).attr('fill', 'none').attr('stroke', MUTED).attr('stroke-width', 1.5);
      const dot = g.append('circle').attr('cx', cx).attr('cy', anim ? y(10 * st.p) : y(st.rx[ro])).attr('r', 9).attr('fill', COL[ro]).attr('stroke', '#0E1219').attr('stroke-width', 2).attr('tabindex', 0).datum(ro);
      dot.transition().duration(anim ? 900 : 400).attr('cy', y(st.rx[ro]));
      bindTip(dot, () => tipRows(ro, [['Observed', st.rx[ro] + ' / 10'], ['Expected if p constant', fmt(10 * st.p, 1)], ['Likely range (95%)', `${lo}–${hi}`]]));
      g.append('text').attr('x', cx + 16).attr('y', y(st.rx[ro]) + 4).attr('fill', IVORY).attr('font-size', 12).text(st.rx[ro] + '/10');
    });
    g.append('text').attr('x', w - m.r).attr('y', m.t + 2).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11).text(`band: 95% range of Bin(10, ${fmt(st.p, 2)}) · ring: expected`);
    liveCells($('#binLive'), [['X', `${st.X} / 30`], ['Estimated <span class="nt">p</span>', fmt(st.p, 2)], ['Var · binomial', fmt(st.varB, 2)], ['Var · quota design', fmt(st.varQ, 2)]]);
  }, 0.62, 260);
  const thr = $('#thr'); let bt;
  thr.addEventListener('input', () => { bin.thr = +thr.value; $('#thrV').textContent = bin.thr; cancelAnimationFrame(bt); bt = requestAnimationFrame(() => { redraw(cPmf); redraw(cRoles); }); });

  /* ---------- II · likelihood explorer ---------- */
  const lik = { mu: 115, sd: 22 };
  const MU_D = [108, 136], SD_D = [8, 28];
  const cFit = chart('likFit', (svg, w, h) => {
    const m = { l: 16, r: 14, t: 16, b: 46 }, x = d3.scaleLinear().domain([70, 175]).range([m.l, w - m.r]);
    const bins = d3.bin().domain([85, 150]).thresholds(d3.range(85, 150, 5))(sr);
    const y = d3.scaleLinear().domain([0, 0.06]).range([h - m.b, m.t]);
    const g = svg.append('g');
    xAxis(g, x, h, m, mob() ? 5 : 7, 'Strike rate', w);
    g.append('g').selectAll('rect').data(bins).join('rect').attr('x', (b) => x(b.x0) + 1).attr('width', (b) => x(b.x1) - x(b.x0) - 2).attr('rx', 1.5)
      .attr('y', (b) => y(b.length / N / 5)).attr('height', (b) => y(0) - y(b.length / N / 5)).attr('fill', 'rgba(201,163,90,.28)');
    g.append('g').selectAll('line').data(sr).join('line').attr('x1', x).attr('x2', x).attr('y1', h - m.b - 7).attr('y2', h - m.b).attr('stroke', IVORY).attr('opacity', 0.6);
    const xs = d3.range(70, 175.1, 0.7), line = (mu, sd) => d3.line().x((v) => x(v)).y((v) => y(Math.min(0.06, npdf(v, mu, sd))))(xs);
    g.append('path').attr('d', line(XBAR, Math.sqrt(S2N))).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1).attr('stroke-dasharray', '3 4').attr('opacity', 0.7);
    g.append('path').attr('d', line(lik.mu, lik.sd)).attr('fill', 'none').attr('stroke', GOLD2).attr('stroke-width', 2.2);
    g.append('text').attr('x', w - m.r).attr('y', m.t + 6).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11).text('gold: your candidate · dashed: MLE');
  }, 0.62, 260);
  const cMap = chart('likMap', (svg, w, h) => {
    const m = { l: 44, r: 12, t: 16, b: 46 }, nx = 90, ny = 70;
    const x = d3.scaleLinear().domain(MU_D).range([m.l, w - m.r]), y = d3.scaleLinear().domain(SD_D).range([h - m.b, m.t]);
    const vals = new Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const mu = MU_D[0] + ((i + 0.5) / nx) * (MU_D[1] - MU_D[0]), sd = SD_D[1] - ((j + 0.5) / ny) * (SD_D[1] - SD_D[0]);
      vals[i + j * nx] = loglik(mu, sd) - LLMAX;
    }
    const th = [-40, -12, -8, -6, -4, -2, -1, -0.5];
    const cont = d3.contours().size([nx, ny]).thresholds(th)(vals);
    const sx = (w - m.l - m.r) / nx, sy = (h - m.t - m.b) / ny;
    const path = d3.geoPath(d3.geoTransform({ point(px, py) { this.stream.point(m.l + px * sx, m.t + py * sy); } }));
    const col = d3.scaleLinear().domain([-40, -8, -2, -0.5]).range(['#0F131B', '#2A2418', '#7A5E2C', '#E6CC94']);
    const g = svg.append('g');
    g.append('g').selectAll('path').data(cont).join('path').attr('d', path).attr('fill', (d) => col(d.value)).attr('stroke', 'rgba(7,9,13,.4)').attr('stroke-width', 0.5);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(10)).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8)).call((s) => s.select('.domain').remove());
    g.append('text').attr('class', 'axis-label').attr('x', w - m.r).attr('y', h - 6).attr('text-anchor', 'end').text('μ (mean)');
    g.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${(m.t + h - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('σ (SD)');
    g.append('circle').attr('cx', x(XBAR)).attr('cy', y(Math.sqrt(S2N))).attr('r', 4.5).attr('fill', '#0B0D12').attr('stroke', IVORY).attr('stroke-width', 1.5);
    g.append('text').attr('x', x(XBAR) + 8).attr('y', y(Math.sqrt(S2N)) - 8).attr('fill', '#0B0D12').attr('font-size', 11).attr('font-weight', 500).text('MLE');
    const cmu = Math.max(MU_D[0], Math.min(MU_D[1], lik.mu)), csd = Math.max(SD_D[0], Math.min(SD_D[1], lik.sd));
    g.append('line').attr('x1', x(cmu)).attr('x2', x(cmu)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', GOLD2).attr('stroke-opacity', 0.35);
    g.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(csd)).attr('y2', y(csd)).attr('stroke', GOLD2).attr('stroke-opacity', 0.35);
    g.append('circle').attr('cx', x(cmu)).attr('cy', y(csd)).attr('r', 7).attr('fill', GOLD2).attr('stroke', '#0B0D12').attr('stroke-width', 2);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).attr('fill', 'transparent').style('cursor', 'crosshair')
      .on('click', (e) => { const [px, py] = d3.pointer(e); setLik(x.invert(px), y.invert(py)); });
    const ll = loglik(lik.mu, lik.sd);
    liveCells($('#likLive'), [['ℓ(<span class="nt">μ, σ</span>)', fmt(ll, 2)], ['ℓ at the MLE', fmt(LLMAX, 2)], ['Gap Δℓ', fmt(ll - LLMAX, 2)], ['L / L(MLE)', ll - LLMAX < -30 ? '< 10⁻¹³' : fmt(Math.exp(ll - LLMAX), 4)]]);
  }, 0.62, 260);
  const muS = $('#muS'), sgS = $('#sgS'); let lr;
  function setLik(mu, sd) {
    lik.mu = Math.round(mu * 10) / 10; lik.sd = Math.round(sd * 10) / 10;
    muS.value = lik.mu; sgS.value = lik.sd; $('#muV').textContent = lik.mu.toFixed(1); $('#sgV').textContent = lik.sd.toFixed(1);
    cancelAnimationFrame(lr); lr = requestAnimationFrame(() => { redraw(cFit); redraw(cMap); });
  }
  muS.addEventListener('input', () => setLik(+muS.value, lik.sd));
  sgS.addEventListener('input', () => setLik(lik.mu, +sgS.value));
  $('#snapMle').addEventListener('click', () => {
    const from = { ...lik }, to = { mu: XBAR, sd: Math.sqrt(S2N) }, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); setLik(from.mu + (to.mu - from.mu) * e, from.sd + (to.sd - from.sd) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  /* ---------- III · interval lab ---------- */
  const ci = { conf: 0.95, n: 30, cum: 0, cumHit: 0 };
  const cCI = chart('ciLab', (svg, w, h, anim, c) => {
    const n = ci.n, tc = tinv(1 - (1 - ci.conf) / 2, n - 1), K = 100;
    const iv = d3.range(K).map(() => { const s = []; for (let i = 0; i < n; i++) s.push(sr[(Math.random() * N) | 0]); const mm = mean(s), half = (tc * Math.sqrt(variance(s, 1))) / Math.sqrt(n); return { m: mm, lo: mm - half, hi: mm + half, hit: mm - half <= XBAR && XBAR <= mm + half }; });
    const hits = iv.filter((d) => d.hit).length; ci.cum += K; ci.cumHit += hits;
    const m = { l: 16, r: 16, t: 14, b: 44 }, dom = n <= 10 ? [92, 152] : [104, 140];
    const x = d3.scaleLinear().domain(dom).range([m.l, w - m.r]), y = d3.scaleBand().domain(d3.range(K)).range([m.t, h - m.b]).padding(0.25);
    const g = svg.append('g');
    xAxis(g, x, h, m, mob() ? 5 : 9, 'Strike rate', w);
    g.append('line').attr('x1', x(MU0)).attr('x2', x(MU0)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', ROSE).attr('stroke-dasharray', '2 5').attr('opacity', 0.6);
    const ln = g.append('g').selectAll('line').data(iv).join('line').attr('y1', (d, i) => y(i) + y.bandwidth() / 2).attr('y2', (d, i) => y(i) + y.bandwidth() / 2)
      .attr('x1', (d) => x(d.m)).attr('x2', (d) => x(d.m)).attr('stroke', (d) => (d.hit ? GOLD : ROSE)).attr('stroke-width', (d) => (d.hit ? Math.max(1.2, y.bandwidth()) : Math.max(1.8, y.bandwidth() + 0.6))).attr('stroke-linecap', 'round').attr('tabindex', 0);
    ln.transition().delay((d, i) => (reduce ? 0 : i * 16)).duration(reduce ? 0 : 420).ease(d3.easeCubicOut).attr('x1', (d) => x(Math.max(dom[0], d.lo))).attr('x2', (d) => x(Math.min(dom[1], d.hi)));
    bindTip(ln, (d) => tipRows(d.hit ? 'Captures μ*' : 'Misses μ*', [['Sample mean', fmt(d.m, 2)], ['Interval', `${fmt(d.lo, 1)} – ${fmt(d.hi, 1)}`]]));
    g.append('line').attr('x1', x(XBAR)).attr('x2', x(XBAR)).attr('y1', m.t - 6).attr('y2', h - m.b).attr('stroke', IVORY).attr('stroke-width', 1.2);
    g.append('text').attr('x', x(XBAR) + 6).attr('y', m.t + 4).attr('fill', IVORY).attr('font-size', 11).text('true mean μ* ' + fmt(XBAR, 2));
    liveCells($('#ciLive'), [['Captured', `${hits} / 100`], ['t* (df ' + (n - 1) + ')', fmt(tc, 3)], ['Average width', fmt(mean(iv.map((d) => d.hi - d.lo)), 2)], ['Running coverage', fmt((100 * ci.cumHit) / ci.cum, 1) + '% of ' + ci.cum.toLocaleString()]]);
  }, 0.42, 340);
  const resetCum = () => { ci.cum = 0; ci.cumHit = 0; };
  $('#ciGo').addEventListener('click', () => redraw(cCI));
  $$('#ciLevel button').forEach((b) => b.addEventListener('click', () => { $$('#ciLevel button').forEach((x) => x.setAttribute('aria-pressed', x === b)); ci.conf = +b.dataset.c; resetCum(); redraw(cCI); }));
  $$('#ciN button').forEach((b) => b.addEventListener('click', () => { $$('#ciN button').forEach((x) => x.setAttribute('aria-pressed', x === b)); ci.n = +b.dataset.n; resetCum(); redraw(cCI); }));

  /* ---------- IV · t distribution with the (illustrative) benchmark slider ---------- */
  const tb = { b0: MU0 };
  const cT = chart('tDist', (svg, w, h, anim) => {
    const v = N - 1, tObs = (XBAR - tb.b0) / SE, p = 2 * (1 - tcdf(Math.abs(tObs), v)), tc = T29;
    const m = { l: 40, r: 16, t: 20, b: 46 }, x = d3.scaleLinear().domain([-6.5, 6.5]).range([m.l, w - m.r]), y = d3.scaleLinear().domain([0, 0.44]).range([h - m.b, m.t]);
    const g = svg.append('g');
    xAxis(g, x, h, m, mob() ? 7 : 13, 't statistic (df = 29)', w);
    const xs = d3.range(-6.5, 6.51, 0.02), area = (f) => d3.area().x((t) => x(t)).y0(y(0)).y1((t) => y(tpdf(t, v)))(xs.filter(f));
    g.append('path').attr('d', area((t) => t <= -tc)).attr('fill', 'rgba(207,95,128,.32)');
    g.append('path').attr('d', area((t) => t >= tc)).attr('fill', 'rgba(207,95,128,.32)');
    const a = Math.abs(tObs);
    g.append('path').attr('d', area((t) => t <= -a)).attr('fill', 'rgba(201,163,90,.42)');
    g.append('path').attr('d', area((t) => t >= a)).attr('fill', 'rgba(201,163,90,.42)');
    const cp = g.append('path').attr('d', d3.line().x((t) => x(t)).y((t) => y(tpdf(t, v)))(xs)).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.8);
    if (anim) { const L = cp.node().getTotalLength(); cp.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1300).attr('stroke-dashoffset', 0); }
    const tx = x(Math.max(-6.4, Math.min(6.4, tObs)));
    g.append('line').attr('x1', tx).attr('x2', tx).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', GOLD2).attr('stroke-width', 2);
    g.append('text').attr('x', tx + (tObs > 3.5 ? -8 : 8)).attr('y', m.t + 10).attr('text-anchor', tObs > 3.5 ? 'end' : 'start').attr('fill', GOLD2).attr('font-size', 13).text(`t = ${fmt(tObs, 3)}${Math.abs(tObs) > 6.4 ? ' →' : ''}`);
    g.append('text').attr('x', x(tc) + 6).attr('y', y(0.06)).attr('fill', ROSE).attr('font-size', 11).text(`±${fmt(tc, 3)}`);
    const real = Math.abs(tb.b0 - MU0) < 1e-9;
    liveCells($('#tLive'), [['Benchmark', fmt(tb.b0, 1) + (real ? ' (pre-specified)' : ' (what-if)')], ['<span class="nt">t</span>', fmt(tObs, 3)], ['<span class="nt">p</span> (two-sided)', p < 0.0001 ? p.toExponential(2) : fmt(p, 4)], ['Decision at 5%', p < 0.05 ? 'Reject H₀' : 'Fail to reject']]);
  }, 0.3, 260);
  const b0 = $('#b0'); let tr;
  b0.addEventListener('input', () => { tb.b0 = +b0.value; $('#b0V').textContent = tb.b0.toFixed(1).replace('.0', ''); cancelAnimationFrame(tr); tr = requestAnimationFrame(() => redraw(cT)); });

  /* ---------- V · power explorer ---------- */
  const pw = { mu: 125, n: 30, sd: +DATA.task3.s.toFixed(2), a: 0.05 };
  function pwState() { const d = pw.mu - MU0, v = pw.n - 1, se = pw.sd / Math.sqrt(pw.n), c = tinv(1 - pw.a / 2, v); return { d, v, se, c, power: tPower(d, pw.n, pw.sd, pw.a), lam: d / se }; }
  const cDist = chart('pwDist', (svg, w, h) => {
    const st = pwState(), m = { l: 14, r: 14, t: 18, b: 46 };
    const lo = Math.min(MU0, pw.mu) - 4.6 * st.se, hi = Math.max(MU0, pw.mu) + 4.6 * st.se;
    const x = d3.scaleLinear().domain([lo, hi]).range([m.l, w - m.r]);
    const f0 = (z) => tpdf((z - MU0) / st.se, st.v) / st.se, f1 = (z) => tpdf((z - pw.mu) / st.se, st.v) / st.se;
    const ymax = Math.max(f0(MU0), f1(pw.mu)) * 1.15, y = d3.scaleLinear().domain([0, ymax]).range([h - m.b, m.t]);
    const g = svg.append('g');
    xAxis(g, x, h, m, mob() ? 4 : 7, 'Sample mean strike rate', w);
    const cl = MU0 - st.c * st.se, ch = MU0 + st.c * st.se, xs = d3.range(lo, hi, (hi - lo) / 400);
    const area = (f, keep) => d3.area().x((z) => x(z)).y0(y(0)).y1((z) => y(f(z)))(xs.filter(keep));
    g.append('path').attr('d', area(f1, (z) => z > cl && z < ch)).attr('fill', 'rgba(84,134,211,.22)');
    g.append('path').attr('d', area(f0, (z) => z <= cl)).attr('fill', 'rgba(207,95,128,.42)');
    g.append('path').attr('d', area(f0, (z) => z >= ch)).attr('fill', 'rgba(207,95,128,.42)');
    g.append('path').attr('d', d3.line().x((z) => x(z)).y((z) => y(f0(z)))(xs)).attr('fill', 'none').attr('stroke', IVORY).attr('stroke-width', 1.6);
    g.append('path').attr('d', d3.line().x((z) => x(z)).y((z) => y(f1(z)))(xs)).attr('fill', 'none').attr('stroke', BLUE).attr('stroke-width', 1.6);
    [cl, ch].forEach((v) => g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', ROSE).attr('stroke-width', 0.9));
    g.append('text').attr('x', x(MU0)).attr('y', y(f0(MU0)) - 8).attr('text-anchor', 'middle').attr('fill', IVORY).attr('font-size', 11).text('H₀: μ = 120');
    const close = Math.abs(x(pw.mu) - x(MU0)) < 130;
    if (Math.abs(st.d) > 0.4) g.append('text').attr('x', x(pw.mu)).attr('y', y(f1(pw.mu)) - (close ? 26 : 8)).attr('text-anchor', 'middle').attr('fill', BLUE).attr('font-size', 11).text('true μ = ' + fmt(pw.mu, 1));
    const out = $('#pwOut'); out.innerHTML = fmt(st.power, 3) + '<small>' + (st.power >= 0.8 ? 'adequate' : 'low') + '</small>';
    $('#pwBar').style.width = (100 * st.power).toFixed(1) + '%';
    liveCells($('#pwLive'), [['<span class="nt">β</span> (Type II)', fmt(1 - st.power, 3)], ['Δ = <span class="nt">μ</span> − 120', fmt(st.d, 1)], ['Noncentrality', fmt(st.lam, 2)], ['Rejection bounds', `${fmt(cl, 1)} / ${fmt(ch, 1)}`]]);
  }, 0.6, 240);
  const cCurve = chart('pwCurve', (svg, w, h, anim) => {
    const m = { l: 44, r: 16, t: 16, b: 46 }, x = d3.scaleLinear().domain([105, 135]).range([m.l, w - m.r]), y = d3.scaleLinear().domain([0, 1]).range([h - m.b, m.t]);
    const g = svg.append('g');
    yAxis(g, y, w, m, 5, 'Power', h, '.1f');
    xAxis(g, x, h, m, mob() ? 6 : 12, 'True mean strike rate μ', w);
    g.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(0.8)).attr('y2', y(0.8)).attr('stroke', MUTED).attr('stroke-dasharray', '3 4');
    g.append('text').attr('x', w - m.r).attr('y', y(0.8) - 6).attr('text-anchor', 'end').attr('fill', MUTED).attr('font-size', 11).text('80%');
    const pts = d3.range(105, 135.01, 0.25).map((mu) => ({ mu, p: tPower(mu - MU0, pw.n, pw.sd, pw.a) }));
    const pth = g.append('path').datum(pts).attr('d', d3.line().x((d) => x(d.mu)).y((d) => y(d.p)).curve(d3.curveMonotoneX)).attr('fill', 'none').attr('stroke', GOLD).attr('stroke-width', 2.2);
    if (anim) { const L = pth.node().getTotalLength(); pth.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1200).attr('stroke-dashoffset', 0); }
    const cur = tPower(pw.mu - MU0, pw.n, pw.sd, pw.a);
    g.append('circle').attr('cx', x(pw.mu)).attr('cy', y(cur)).attr('r', 6).attr('fill', GOLD2).attr('stroke', '#0E1219').attr('stroke-width', 2);
    g.append('line').attr('x1', x(MU0)).attr('x2', x(MU0)).attr('y1', y(0.3)).attr('y2', y(pw.a) - 4).attr('stroke', ROSE).attr('stroke-dasharray', '2 3').attr('opacity', 0.7);
    g.append('text').attr('x', x(MU0)).attr('y', y(0.3) - 6).attr('text-anchor', 'middle').attr('fill', ROSE).attr('font-size', 11).text('power = α at μ = 120');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (e) => { const mu = x.invert(d3.pointer(e)[0]); showTip(tipRows(`True μ = ${fmt(mu, 1)}`, [['Power', fmt(tPower(mu - MU0, pw.n, pw.sd, pw.a), 3)]]), e.clientX, e.clientY); })
      .on('mouseleave', hideTip).on('click', (e) => setPw({ mu: Math.round(x.invert(d3.pointer(e)[0]) * 2) / 2 }));
  }, 0.24, 220);
  let pr;
  function setPw(o) {
    Object.assign(pw, o);
    $('#pwMu').value = pw.mu; $('#pwN').value = pw.n; $('#pwS').value = pw.sd;
    $('#pwMuV').textContent = fmt(pw.mu, 1); $('#pwNV').textContent = pw.n; $('#pwSV').textContent = fmt(pw.sd, 2);
    cancelAnimationFrame(pr); pr = requestAnimationFrame(() => { redraw(cDist); redraw(cCurve); });
  }
  $('#pwMu').addEventListener('input', (e) => setPw({ mu: +e.target.value }));
  $('#pwN').addEventListener('input', (e) => setPw({ n: +e.target.value }));
  $('#pwS').addEventListener('input', (e) => setPw({ sd: +e.target.value }));
  $$('#pwA button').forEach((b) => b.addEventListener('click', () => { $$('#pwA button').forEach((x) => x.setAttribute('aria-pressed', x === b)); setPw({ a: +b.dataset.a }); }));
  const PRESETS = { base: { mu: 125, n: 30, sd: +DATA.task3.s.toFixed(2) }, within: { mu: 125, n: 30, sd: +DATA.task5.sigma_within.toFixed(2) }, n73: { mu: 125, n: DATA.task5.scenarios.find((r) => r.delta === 5).n80_sigma_s, sd: +DATA.task3.s.toFixed(2) } };
  $$('[data-preset]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setPw(PRESETS[a.dataset.preset]); }));
  setPw({});

  window.__ps2 = { tPower, tinv, tcdf }; // exposed for verification against the Python results
})();
