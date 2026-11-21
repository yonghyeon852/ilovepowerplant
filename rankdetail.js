// ============================================================
// 랭킹 상세 보기: 엔딩 때의 전력망 지도와 운영 기록
//  - 랭킹에 등록할 때 지도·설비·주요 수치를 작게 줄여 함께 저장 (makeRankSnapshot)
//  - 랭킹 표의 "상세" 버튼을 누르면 그 기록의 지도와 정보를 보여 줌 (showRankDetail)
//  - 게임에 기본으로 들어 있는 기록(RANK_SEED, rankings_seed.js)은 지울 수 없음
// ============================================================

// 내 기록(브라우저 저장) 앞에 기본 기록을 붙인 전체 목록
function allRankings() {
  const seed = (typeof RANK_SEED !== 'undefined' && Array.isArray(RANK_SEED)) ? RANK_SEED : [];
  return seed.concat(loadRankings());
}

const RANK_TERRAIN = { land: 'l', river: 'r', sea: 's', mountain: 'm', foreign: 'f', offshore: 'o' };
const RANK_TERRAIN_BACK = { l: LAND, r: RIVER, s: SEA, m: MOUNTAIN, f: FOREIGN, o: OFFSHORE };

// 지형을 "글자 + 이어진 칸 수"로 줄여 적음 (예: s8l92…)
function rankEncodeGrid(grid) {
  let out = '', prev = null, n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = RANK_TERRAIN[(grid[r] && grid[r][c]) || LAND] || 'l';
    if (ch === prev) n++;
    else { if (prev) out += prev + n; prev = ch; n = 1; }
  }
  return out + prev + n;
}
function rankDecodeGrid(str, width = 100, height = 72) {
  const flat = [];
  const re = /([lrsmfo])(\d+)/g; let m;
  while ((m = re.exec(str || ''))) { const t = RANK_TERRAIN_BACK[m[1]]; for (let i = 0; i < +m[2]; i++) flat.push(t); }
  const grid = [];
  for (let r = 0; r < height; r++) { const row = []; for (let c = 0; c < width; c++) row.push(flat[r * width + c] || LAND); grid.push(row); }
  return grid;
}

// 엔딩 시점의 전력망을 작게 줄인 기록
function makeRankSnapshot(state) {
  const online = (b) => b.status === 'online';
  const fleet = [];
  for (const type of PALETTE_ORDER) {
    const list = state.buildings.filter((b) => b.type === type && b.status !== 'demolishing');
    if (!list.length) continue;
    const st = plantStats(state, type);
    fleet.push({ t: type, n: list.length, on: list.filter(online).length, mw: Math.round(list.filter(online).length * st.capacity) });
  }
  const h = state.history || [];
  const last12 = h.slice(-12);
  const avg = (a, f) => a.length ? a.reduce((s, x) => s + (f(x) || 0), 0) / a.length : 0;
  const gen = state.lastReport ? state.lastReport.energy.gen : null;
  const pol = {};
  for (const k in (state.policies || {})) {
    const def = (typeof POLICIES !== 'undefined') ? POLICIES[k] : null;
    const opt = def && def.options[state.policies[k]];
    if (def && opt) pol[def.name] = opt.label;
  }
  return {
    v: 2, width: COLS, height: ROWS,
    g: rankEncodeGrid(state.grid),
    co2Tonnes: state.lastReport?.energy?.co2 ?? null,
    c: state.cities.map((ct) => ({ n: ct.name, p: Math.round(ct.pop), t: ct.tiles.map((t) => (t.row * COLS + t.col).toString(36)).join(',') })),
    b: state.buildings.filter((b) => b.status !== 'demolishing').map((b) => [PALETTE_ORDER.indexOf(b.type), b.col, b.row, b.status === 'online' ? 0 : b.status === 'building' ? 1 : b.status === 'retired' ? 2 : 3]),
    fleet,
    pop: Math.round(state.cities.reduce((s, c) => s + c.pop, 0)),
    peak: Math.round(Math.max.apply(null, state.demandCurve || [0])),
    happy: Math.round(state.happiness),
    rd: rdLevel(state),
    tech: TECH_ORDER.map((k) => state.tech[k] || 0), techKeys: TECH_ORDER.slice(),   // 테크트리 구성이 바뀌어도 기록을 읽을 수 있게 이름을 함께 저장
    pol,
    gen: gen ? { nuclear: Math.round(gen.nuclear), coal: Math.round(gen.coal), ccgt: Math.round(gen.ccgt), gt: Math.round(gen.gt), solar: Math.round(gen.solar), wind: Math.round(gen.wind) } : null,
    inten: h.length && h[h.length - 1].inten !== undefined ? +h[h.length - 1].inten.toFixed(3) : null,
    smp: Math.round(avg(last12, (x) => x.smp)),
    profit12: Math.round(last12.reduce((s, x) => s + (x.profit || 0), 0)),
    priceIdx: typeof costIndex === 'function' ? +costIndex(state).toFixed(2) : 1,
    startYear: state.startYear, startMonth: state.startMonth,
  };
}

// 저장된 기록을 캔버스에 지도로 그림
function drawRankMap(canvas, snap) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const width = snap.width || 100, height = snap.height || 72;
  const grid = rankDecodeGrid(snap.g, width, height);
  const cities = (snap.c || []).map((ct) => finalizeCity({
    name: ct.n, pop: ct.p,
    tiles: String(ct.t || '').split(',').filter(Boolean).map((k) => { const i = parseInt(k, 36); return { col: i % width, row: Math.floor(i / width) }; }),
  }));
  const s = Math.min(W / (width*TILE), H / (height*TILE));
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const tint = carbonTint(snap.co2Tonnes);
  drawTerrain(ctx, grid, tint);
  drawCities(ctx, cities, false, tint);
  // 설비: 종류별 색 사각형. 공사 중은 반투명, 수명이 끝난 설비는 붉은 테두리
  for (const b of (snap.b || [])) {
    const type = PALETTE_ORDER[b[0]]; const p = PLANTS[type]; if (!p) continue;
    const x = b[1] * TILE, y = b[2] * TILE, w = p.width * TILE, hgt = p.height * TILE;
    ctx.globalAlpha = b[3] === 1 ? 0.55 : 1;
    drawFacility(ctx, type, x, y, w, hgt);
    ctx.globalAlpha = 1;
    if (b[3] === 2) { ctx.strokeStyle = '#ff847a'; ctx.strokeRect(x+1,y+1,w-2,hgt-2); }
  }
  ctx.restore();
  // 도시 이름표는 화면 크기에 맞춰 따로 그림 (지도를 줄여 그리면 글씨가 너무 작아지므로)
  ctx.font = 'bold ' + Math.max(11, Math.round(W / 72)) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const ct of cities) {
    if (!ct.tiles.length) continue;
    const label = ct.name + ' ' + fmt(ct.pop) + '만';
    const cx = (ct.bounds.minC + ct.bounds.maxC + 1) / 2 * TILE * s;
    const y = Math.max(18, ct.bounds.minR * TILE * s - 2);
    const tw = ctx.measureText(label).width + 10;
    const x0 = clamp(cx - tw / 2, 2, W - tw - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(x0, y - 17, tw, 18);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x0 + tw / 2, y);
  }
}

const RANK_GEN_LABEL = { nuclear: ['원자력', '#f06292'], coal: ['석탄', '#546e7a'], ccgt: ['복합발전', '#f4511e'], gt: ['가스터빈', '#ff9800'], solar: ['태양광', '#ffb300'], wind: ['풍력', '#81d4fa'] };

function showRankDetail(id) {
  const r = allRankings().find((x) => x.id === id);
  if (!r) return;
  const box = document.getElementById('rank-detail');
  const body = document.getElementById('rank-detail-body');
  const snap = r.snap || null;
  const p = r.scoreParts || {}, d = r.scoreDetail || {};
  const yrs = Math.floor(r.years || 0), mos = Math.round(((r.years || 0) - yrs) * 12);
  const card = (k, v, s) => '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>';

  let html = '<div class="rd-head"><div><h2>' + escapeHtml(r.name) + ' 대통령</h2>' +
    '<div class="rd-sub">' + (MODE_LABEL[r.mode] || r.mode) + ' · ' + (REASON_LABEL[r.reason] || r.reason) + ' · 재임 ' + yrs + '년 ' + mos + '개월' +
    (snap && snap.startYear ? ' (' + snap.startYear + '년 ' + snap.startMonth + '월 ~ ' + r.endYear + '년 ' + r.endMonth + '월)' : '') + (r.date ? ' · 등록 ' + r.date : '') + '</div>' +
    (r.note ? '<div class="rd-note">' + escapeHtml(r.note) + '</div>' : '') + '</div>' +
    '<div class="rd-score"><b>' + fmt(r.score || 0) + '</b><span>점</span></div></div>';

  html += '<div class="rd-grid"><div class="rd-map">';
  if (snap) {
    const kinds = (snap.fleet || []).map((f) => f.t);
    html += '<canvas id="rank-map" width="1100" height="792"></canvas>' +
      '<div class="rd-legend"><span><img src="assets/world/downtown.png" alt="" width="20" height="20">도시</span>' + kinds.map((t) => '<span><img src="assets/world/' + t + '.png" alt="" width="20" height="20" style="object-fit:contain;vertical-align:middle">' + PLANTS[t].short + '</span>').join('') +
      '<span><i class="ring"></i>붉은 테두리 = 수명 종료</span></div>';
  } else html += '<p class="muted">이 기록은 지도 저장 기능이 생기기 전에 등록되어, 지도 없이 숫자만 볼 수 있습니다.</p>';
  html += '</div><div class="rd-side">' + scoreBreakdownHtml(r) +
    '<div class="rd-facts">' + '정전 ' + fmt(d.blackoutMonths || 0) + '개월 · ' + fmt(r.blackoutTotal || 0) + '시간대<br>탄소 원단위 최근 3년 ' + (d.intenLast !== undefined ? (+d.intenLast).toFixed(2) : '-') + ' t/MWh<br>인구 ' + fmt(d.popRatio || 1, 1) + '배 · 기술 ' + (d.tiers || 0) + '/' + (d.tiersMax || 36) + '단계</div></div></div>';

  html += '<div class="ending-stats rd-cards">' +
    card('최종 자금', fmt(r.money) + '억', snap ? '마지막 1년 이익 ' + fmt(snap.profit12) + '억' : '') +
    card('평균 민심', fmt(r.avgHappy, 1), snap ? '마지막 달 ' + snap.happy : '') +
    (snap ? card('인구 · 도시', fmt(snap.pop) + '만 명', '도시 ' + snap.c.length + '곳') + card('최대 전력 수요', fmt(snap.peak) + ' MW', '전기값 평균 ' + fmt(snap.smp) + '원/kWh') : '') +
    card('누적 탄소 배출', fmt(Math.round((r.co2Total || 0) / 1000)) + '천 t', snap && snap.inten !== null ? '마지막 달 ' + snap.inten.toFixed(2) + ' t/MWh' : '') +
    (snap ? card('연구소 규모', fmt(snap.rd), '건설 물가 ×' + fmt(snap.priceIdx, 2)) : '') + '</div>';

  if (snap) {
    // 설비 구성 표
    snap.fleet = (snap.fleet || []).filter((f) => PLANTS[f.t]);   // 지금은 없는 설비(예전 기록의 크래킹 설비 등)는 건너뜀
    const totalMw = snap.fleet.reduce((s, f) => s + (PLANTS[f.t].isLink ? 0 : f.mw), 0) || 1;
    html += '<h3 class="rd-h">엔딩 때의 전력망 구성</h3><table class="rank-table rd-fleet"><tr><th>설비</th><th>기수</th><th>가동 용량</th><th>비중</th></tr>' +
      snap.fleet.map((f) => { const pl = PLANTS[f.t]; const extra = pl.isLink; return '<tr><td><i class="dot" style="background:' + pl.color + '"></i>' + pl.name + '</td><td>' + f.n + '기' + (f.on < f.n ? ' (가동 ' + f.on + ')' : '') + '</td><td>' + fmt(f.mw) + ' MW' + (pl.isH2 ? '분' : '') + '</td><td>' + (extra ? '-' : fmt(100 * f.mw / totalMw) + '%') + '</td></tr>'; }).join('') + '</table>';
    // 마지막 달 발전 비중 막대
    if (snap.gen) {
      const tot = Object.keys(RANK_GEN_LABEL).reduce((s, k) => s + (snap.gen[k] || 0), 0) || 1;
      const parts = Object.keys(RANK_GEN_LABEL).filter((k) => snap.gen[k] > 0);
      html += '<h3 class="rd-h">마지막 달 발전량 비중</h3><div class="rd-mix">' + parts.map((k) => '<i style="width:' + (100 * snap.gen[k] / tot) + '%;background:' + RANK_GEN_LABEL[k][1] + '" title="' + RANK_GEN_LABEL[k][0] + '"></i>').join('') + '</div>' +
        '<div class="rd-legend">' + parts.map((k) => '<span><i style="background:' + RANK_GEN_LABEL[k][1] + '"></i>' + RANK_GEN_LABEL[k][0] + ' ' + fmt(100 * snap.gen[k] / tot) + '%</span>').join('') + '</div>';
    }
    // 테크와 정책
    // 테크: 트리 이름을 함께 저장한 기록만 표시 (예전 기록은 트리 구성이 달라 건너뜀)
    const tk = (snap.techKeys || []).filter((k) => TECH[k]);
    html += '<h3 class="rd-h">' + (tk.length ? '연구한 테크 · 정책' : '정책') + '</h3>';
    if (tk.length) html += '<div class="rd-tech">' + tk.map((k) => { const lv = (snap.tech || [])[snap.techKeys.indexOf(k)] || 0; return '<span><b>' + TECH[k].name + '</b> ' + lv + ' / ' + TECH[k].tiers.length + '단계</span>'; }).join('') + '</div>';
    const pols = Object.keys(snap.pol || {});
    if (pols.length) html += '<div class="rd-tech rd-pol">' + pols.map((k) => '<span><b>' + escapeHtml(k) + '</b> ' + escapeHtml(snap.pol[k]) + '</span>').join('') + '</div>';
  }
  body.innerHTML = html;
  box.classList.remove('hidden');
  body.parentElement.scrollTop = 0;
  if (snap) { try { drawRankMap(document.getElementById('rank-map'), snap); } catch (err) { /* 지도를 못 그려도 숫자는 보여 줌 */ } }
}

// 표의 "상세" 버튼, 닫기, 바깥 클릭, Esc
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rank-detail]');
  if (btn) { showRankDetail(btn.dataset.rankDetail); return; }
  const box = document.getElementById('rank-detail');
  if (!box) return;
  if (e.target.id === 'rank-detail-close' || e.target === box) box.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  const box = document.getElementById('rank-detail');
  if (box && !box.classList.contains('hidden') && e.key === 'Escape') { box.classList.add('hidden'); e.stopPropagation(); }
}, true);
