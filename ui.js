// ============================================================
// 화면 표시: 설비 그림, 카드, 패널, 그래프, 결산, 테크트리, R&D, 미니맵
// ============================================================

const fmt = (n, d) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d === undefined ? 0 : d });
const fmtMWh = (mwh) => mwh >= 1000 ? fmt(mwh / 1000, 1) + ' GWh' : fmt(mwh) + ' MWh';
const pct = (p) => fmt(p * 100) + '%';

// ------------------------------------------------------------
// 설비 그림 (지도 좌표 기준)
// ------------------------------------------------------------
function drawBuilding(ctx, b, opts) {
  opts = opts || {};
  const p = PLANTS[b.type];
  const x = b.col * TILE, y = b.row * TILE;
  const w = p.width * TILE, h = p.height * TILE;
  const cx = x + w / 2, cy = y + h / 2;
  const inactive = b.status !== 'online';

  ctx.save();
  ctx.globalAlpha = opts.alpha !== undefined ? opts.alpha : (inactive ? 0.55 : 1);

  drawFacility(ctx, b.type, x, y, w, h);

  // 건설 / 업그레이드 / 철거 중: 빗금 + 진행 막대
  if (b.status === 'building' || b.status === 'upgrading' || b.status === 'demolishing') {
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1.5, y + 1.5, w - 3, h - 3); ctx.clip();
    ctx.strokeStyle = b.status === 'demolishing' ? 'rgba(255,80,80,0.6)' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke(); }
    ctx.restore();

    const total = b.status === 'upgrading' ? PLANTS[b.upgradeFrom].upgradeMonths
                : b.status === 'demolishing' ? ECON.demolishMonths : b.totalMonths;
    const done = 1 - b.monthsLeft / total;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 2, y + h - 7, w - 4, 5);
    ctx.fillStyle = b.status === 'demolishing' ? '#ef5350' : '#ffd600';
    ctx.fillRect(x + 2, y + h - 7, (w - 4) * done, 5);

    const label = b.status === 'upgrading' ? '↑' + b.monthsLeft : b.status === 'demolishing' ? '철거 ' + b.monthsLeft : b.monthsLeft + '개월';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(label, cx + 1, cy - 2);
    ctx.fillStyle = '#fff'; ctx.fillText(label, cx, cy - 3);
  }

  // 수명 종료: 회색 처리 + 표시
  if (b.status === 'retired') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff8a80';
    ctx.fillText('수명 종료', cx, cy);
  } else if (b.status === 'online' && plantAgeStatus(b) === 'aging') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffb300';
    ctx.beginPath(); ctx.arc(x + w - 6, y + 6, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  if (opts.selected) {
    ctx.globalAlpha = 1;
    for (const [dx,dy,sx,sy] of [[1,1,1,1],[w-1,1,-1,1],[1,h-1,1,-1],[w-1,h-1,-1,-1]]) {
      const corner=[[x+dx+sx*7,y+dy],[x+dx,y+dy],[x+dx,y+dy+sy*7]];
      strokeLine(ctx,'#233a3d',4,corner);strokeLine(ctx,'#fff1b6',2,corner);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------
// 미니맵
// ------------------------------------------------------------
function drawMinimap(canvas, state) {
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * MINI;
  canvas.height = ROWS * MINI;
  ctx.save(); ctx.scale(MINI/TILE, MINI/TILE);
  drawTerrain(ctx, state.grid, carbonTint(state.lastReport?.energy?.co2)); ctx.restore();
  ctx.fillStyle = '#bdbdbd';
  for (const city of state.cities) for (const t of city.tiles) ctx.fillRect(t.col * MINI, t.row * MINI, MINI, MINI);
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    ctx.fillStyle = b.status === 'retired' ? '#ff5252' : p.color;
    ctx.fillRect(b.col * MINI, b.row * MINI, p.width * MINI, p.height * MINI);
  }
  for (const z of (state.exclusion || [])) { ctx.fillStyle = 'rgba(52,40,44,0.92)'; ctx.fillRect(z.c0 * MINI, z.r0 * MINI, (z.c1 - z.c0 + 1) * MINI, (z.r1 - z.r0 + 1) * MINI); }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  const z = state.zoom || 1;
  ctx.strokeRect(state.view.col * MINI + 0.75, state.view.row * MINI + 0.75, visCols() * MINI - 1.5, visRows() * MINI - 1.5);
}

// ------------------------------------------------------------
// 왼쪽 설비 카드 (paletteCat: 'gen' 발전 설비 / 'infra' 저장·연계)
let paletteCat = 'gen';
// ------------------------------------------------------------
// 카드 묶음(카테고리): 접었다 펼 수 있고, 접힘 상태는 브라우저에 기억
const PALETTE_GROUPS = [
  { key: 'thermal', name: '화력발전', cat: 'gen', types: ['ccgt', 'coal'] },
  { key: 'renew', name: '재생에너지', cat: 'gen', types: ['solar', 'wind'] },
  { key: 'nuclear', name: '원자력', cat: 'gen', types: ['nuclear', 'smr'] },
  { key: 'grid', name: '계통 · 배터리', cat: 'gen', types: ['ess', 'interconnect'] },   // 어느 노선이든 함께 쓰는 설비
];
let paletteClosed = {};
try { paletteClosed = JSON.parse(localStorage.getItem('ilpp-palette-closed') || '{}') || {}; } catch (e) { paletteClosed = {}; }

function renderPalette(state) {
  const rfPal = renewAvgFactors(state);   // 재생 설비 카드에 "실제 평균 출력"을 같이 표시 (설비 용량과 구분)
  const root = document.getElementById('palette-cards');
  root.innerHTML = '';
  const makeCard = (type) => {
    const p = PLANTS[type];
    const st = plantStats(state, type);
    const unlocked = plantUnlocked(state, type);
    const card = document.createElement('div');
    card.className = 'plant-card' + (state.money < st.capex ? ' unaffordable' : '') + (unlocked ? '' : ' locked');
    card.dataset.plant = type;
    const req = p.requiresTech ? TECH[p.requiresTech.tree].tiers[p.requiresTech.level - 1].name : '';
    const avg = p.renewable ? st.capacity * (p.renewable === 'solar' ? rfPal.solar : rfPal.wind) : null;
    const sub = unlocked
      ? fmt(st.capacity) + ' MW' + (avg !== null ? ' (평균 약 ' + fmt(avg) + ')' : '') + ' · 공사 ' + st.buildMonths + '개월'
      : '🔒 테크 "' + req + '" 필요';
    card.innerHTML =
      '<canvas class="plant-icon" width="80" height="80" aria-hidden="true"></canvas>' +
      '<div class="pc-main"><strong>' + p.name + '</strong><small' + (unlocked ? '' : ' class="pc-lock"') + '>' + sub + '</small></div>' +
      (unlocked ? '<div class="pc-cost"><b class="cost">' + fmt(st.capex) + '</b><small>억</small></div>' : '<div class="pc-cost"></div>') +
      '<button class="pc-info" data-info="' + type + '" title="상세 설명 고정">i</button>';
    const icon = card.querySelector('canvas').getContext('2d');
    const scale = 76 / (Math.max(p.width,p.height)*TILE);
    icon.translate((80-p.width*TILE*scale)/2,(80-p.height*TILE*scale)/2);
    icon.scale(scale,scale); drawFacility(icon,type,0,0,p.width*TILE,p.height*TILE);
    return card;
  };
  for (const g of PALETTE_GROUPS) {
    if (g.cat !== (paletteCat === 'infra' ? 'infra' : 'gen')) continue;
    const closed = !!paletteClosed[g.key];
    const online = state.buildings.filter((b) => g.types.includes(b.type) && b.status === 'online').length;
    const wrap = document.createElement('div');
    wrap.className = 'pc-group' + (closed ? ' closed' : '');
    wrap.dataset.group = g.key;
    wrap.innerHTML = '<div class="pc-group-head"><span class="arrow">' + (closed ? '▸' : '▾') + '</span><b>' + g.name + '</b><small class="muted">' + (online ? '가동 ' + online + '기' : '') + '</small></div>';
    const body = document.createElement('div');
    body.className = 'pc-group-body';
    for (const type of g.types) body.appendChild(makeCard(type));
    wrap.appendChild(body);
    root.appendChild(wrap);
  }
}
// 묶음 머리를 누르면 접기/펼치기
document.addEventListener('click', (e) => {
  const head = e.target.closest('.pc-group-head');
  if (!head) return;
  const wrap = head.closest('.pc-group');
  const key = wrap.dataset.group;
  paletteClosed[key] = !paletteClosed[key];
  try { localStorage.setItem('ilpp-palette-closed', JSON.stringify(paletteClosed)); } catch (err) {}
  wrap.classList.toggle('closed', !!paletteClosed[key]);
  head.querySelector('.arrow').textContent = paletteClosed[key] ? '▸' : '▾';
});

// ---------- 설비 상세 팝오버: 카드에 마우스를 올리면 바로, ⓘ를 누르면 고정 ----------
let plantDetailPinned = null;
function plantDetailEl() {
  let el = document.getElementById('plant-detail');
  if (!el) { el = document.createElement('div'); el.id = 'plant-detail'; el.className = 'hidden'; document.body.appendChild(el); }
  return el;
}
function plantSpecRows(state, type) {
  const p = PLANTS[type], st = plantStats(state, type), m = techMods(state), rf = renewAvgFactors(state);
  const rows = [];
  let capText = fmt(st.capacity) + ' MW';
  if (p.renewable) capText += ' · 이번 달 실제 평균 ~' + fmt(st.capacity * (p.renewable === 'solar' ? rf.solar : rf.wind)) + ' MW';
  if (p.isStorage) capText = fmt(st.capacity) + ' MW 출력 · 저장 ' + fmt(st.capacity * m.essHours) + ' MWh (' + m.essHours + '시간)';
  if (p.isLink) capText = '송전 ' + fmt(st.capacity) + ' MW';
  rows.push(['설비 용량 (명목)', capText]);
  if (p.isStorage) { rows.push(['지을 곳', '발전 설비 바로 옆 칸 (건설 중인 설비 옆도 가능)']); rows.push(['관성', '없음 · 태양광·풍력과 합쳐 주파수 안정도 한도 안에서만 내보냄']); }
  rows.push(['건설비', fmt(st.capex) + '억 (' + 'MW당 ' + fmt(st.capex / st.capacity, 1) + '억)']);
  rows.push(['공사 기간', st.buildMonths + '개월']);
  rows.push(['수명', (type === 'ess' ? m.essLife : p.lifeYears) + '년']);
  if (!p.isLink) rows.push(['연료비 / 변동비', fmt(st.fuelCost) + ' / ' + fmt(p.varOm * (p.kind === 'nuclear' ? m.nukeOpMult : 1)) + ' 원/kWh']);
  if (!p.isLink) rows.push(['탄소 배출', fmt(st.co2, 2) + ' t/MWh' + (st.co2 > 0 ? ' (탄소세 대상)' : ' (무탄소)')]);
  rows.push(['월 고정 유지비', fmt(st.capex * p.omRate / 12, 1) + '억']);
  if (p.dispatchable && !p.isStorage) rows.push(['월 용량 요금', '+' + fmt(st.capacity * ECON.capacityPayment, 1) + '억 (예비력 한도 안에서)']);
  if (p.dispatchable && !p.isStorage) rows.push(['출력 조절', p.mustRun ? (m.nukeMinLoad < 1 ? '전기가 남으면 ' + fmt(m.nukeMinLoad * 100) + '%까지 줄임 (부하추종 운전)' : '불가 · 항상 최대 출력 (밤에 남으면 과잉 발전)') : '최소 ' + fmt((type === 'coal' ? m.coalMinLoad : p.minLoad) * 100) + '% · 시간당 ±' + fmt((type === 'coal' ? m.coalRamp : p.ramp) * 100) + '%']);
  if (p.renewable === 'solar') { rows.push(['발전 시간', '낮에만 · 여름에 강하고 겨울에 약함 · 날씨에 따라 변동']); rows.push(['짝', '풍력 (밤·겨울에 강함) — 섞어 지어야 고르게 채워짐']); rows.push(['부지 영향', '산에 지으면 벌목 반발로 지을 때 민심 −' + ECON.solarMountainBuildHit + ', 이후 기당 민심 −' + fmt(ECON.solarMountainNuisance * ECON.moodNuisanceMult, 1) + ' (합계 최대 −3)']); }
  if (p.renewable === 'wind') { rows.push(['발전 시간', '24시간 · 밤과 겨울에 강하고 한낮과 여름에 약함']); rows.push(['짝', '태양광 (낮·여름에 강함) — 섞어 지어야 고르게 채워짐']); rows.push(['부지 영향', '해안 +' + fmt(m.coastalBonus * 100) + '% · 산 +' + fmt(ECON.windMountainBonus * 100) + '% · 평지 −' + fmt(ECON.windPlainPenalty * 100) + '%']); }
  if (p.isStorage) rows.push(['왕복 효율', fmt(m.essEff * 100) + '%']);
  if (p.kind === 'gt' || p.kind === 'ccgt') rows.push(['외기온', '더우면 출력 감소, 추우면 증가']);
  const site = [];
  if (p.needsSea) site.push('바다 옆 필수');
  if (p.edgeOnly) site.push('국경에 접한 칸');
  if (!p.needsSea && !p.edgeOnly) site.push('땅 ' + p.width + '×' + p.height + '칸');
  if (type === 'wind' && m.windOnSea) site.push('바다 위 가능');
  rows.push(['부지', site.join(' · ')]);
  if (p.oppositionRange) rows.push(['주민 반발', '도시 ' + m.nuclearOppRange + '칸 이내면 건설비 +' + fmt((m.nuclearOppMult - 1) * 100) + '% · 가까우면 민심 감소']);
  else if (p.nuisance || type === 'wind' || type === 'coal') rows.push(['주민 반발', '도시 가까이 두면 민심 감소']);
  if (p.requiresTech) rows.push(['필요 테크', TECH[p.requiresTech.tree].tiers[p.requiresTech.level - 1].name + (plantUnlocked(state, type) ? ' ✓' : ' (미개발)')]);
  if (p.upgradeTo) rows.push(['개조', PLANTS[p.upgradeTo].name + '으로 ' + fmt(upgradeCostOf(state, type)) + '억 · ' + p.upgradeMonths + '개월']);
  if (costIndex(state) > 1.005) rows.push(['건설 물가', '×' + fmt(costIndex(state), 2) + ' (경제가 커져 건설비·유지비가 오른 상태 · 위 금액에 이미 반영)']);
  return rows;
}
function showPlantDetail(type, anchorEl) {
  const p = PLANTS[type];
  const el = plantDetailEl();
  el.innerHTML = '<div class="pd-head"><i style="background:' + p.color + '"></i><b>' + p.name + '</b><small class="muted">' + p.width + '×' + p.height + '</small><button class="pd-close" title="닫기">✕</button></div>' +
    '<p class="pd-desc">' + p.desc + '</p>' +
    '<table class="pd-table">' + plantSpecRows(state, type).map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' +
    '<div class="pc-tags pd-tags">' + (p.traits || '').split(' · ').map((t) => '<span>' + t + '</span>').join('') + '</div>' +
    '<div class="pd-tech">' + plantTechSummary(state, type, false) + '</div>';
  el.classList.remove('hidden');
  el.classList.toggle('pinned', plantDetailPinned === type);
  const pal = document.getElementById('palette').getBoundingClientRect();
  const a = anchorEl.getBoundingClientRect();
  el.style.left = (pal.right + 8) + 'px';
  el.style.top = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, a.top)) + 'px';
  el.querySelector('.pd-close').onclick = () => { plantDetailPinned = null; hidePlantDetail(true); };
}
function hidePlantDetail(force) {
  if (plantDetailPinned && !force) return;
  const el = document.getElementById('plant-detail');
  if (el) el.classList.add('hidden');
}
(function wirePlantDetail() {
  const root = document.getElementById('palette-cards');
  if (!root) return;
  root.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.plant-card');
    if (!card || plantDetailPinned) return;
    showPlantDetail(card.dataset.plant, card);
  });
  root.addEventListener('mouseleave', () => hidePlantDetail(false));
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.pc-info');
    if (!btn) return;
    e.stopPropagation();
    const type = btn.dataset.info;
    if (plantDetailPinned === type) { plantDetailPinned = null; hidePlantDetail(true); return; }
    plantDetailPinned = type;
    showPlantDetail(type, btn.closest('.plant-card'));
  });
  document.addEventListener('click', (e) => {
    if (!plantDetailPinned) return;
    if (e.target.closest('#plant-detail') || e.target.closest('.pc-info')) return;
    plantDetailPinned = null; hidePlantDetail(true);
  });
})();

// ------------------------------------------------------------
// 상단/지도 주변 숫자
// ------------------------------------------------------------
function renderTopbar(state) {
  document.getElementById('player-label').innerHTML = '<b>' + escapeHtml(state.playerName) + '</b> <small>대통령</small>';
  const moneyEl = document.getElementById('money-value');
  moneyEl.textContent = fmt(Math.round(state.money));
  moneyEl.closest('.money').classList.toggle('negative', state.money < 0);
  // 지난달 손익: 돈이 매달 얼마나 늘고 주는지 한눈에
  const deltaEl = document.getElementById('money-delta');
  if (deltaEl) {
    const lastH = state.history && state.history.length ? state.history[state.history.length - 1] : null;
    if (lastH && isFinite(lastH.profit)) {
      const p = Math.round(lastH.profit);
      deltaEl.textContent = (p >= 0 ? '+' : '−') + fmt(Math.abs(p)) + '/월';
      deltaEl.className = 'money-delta ' + (p >= 0 ? 'up' : 'down');
    } else { deltaEl.textContent = ''; deltaEl.className = 'money-delta'; }
  }
  const yearNo = Math.floor(yearsElapsed(state)) + 1;
  const term = state.mode === 'normal' ? yearNo + '년 차 / ' + ECON.normalYears + '년' : yearNo + '년 차';
  document.getElementById('date-value').innerHTML = '<b>' + state.year + '년 ' + state.month + '월</b><small>' + term + '</small>';
  document.getElementById('rd-value').textContent = fmt(rdLevel(state));
  document.getElementById('pop-value').textContent = fmt(state.cities.reduce((s, c) => s + c.pop, 0));
  // 점수: 지금까지 쌓은 점수 (매달 그달의 민심만큼 쌓임)
  if (typeof computeScore === 'function') {
    const sc = computeScore(state, 'complete');
    const monthNo = (state.history || []).length;
    document.getElementById('score-value').textContent = fmt(sc.total);
    document.getElementById('score-stat').title = '국정운영 점수 ' + fmt(sc.total) + ' / 1,000 (지금까지 쌓은 점수)\n매달 그달의 민심만큼 쌓입니다. 지금 민심이면 이번 달 +' + fmt(scoreGain(state.happiness, monthNo), 1) + '점' +
      (monthNo >= ECON.scoreLateFrom ? ' (11년 차부터 ' + ECON.scoreLateWeight + '배로 쌓이는 중)' : ' (11년 차부터는 ' + ECON.scoreLateWeight + '배로 쌓임)') + '\n20년 내내 민심 100이면 1,000점';
  }


  const hp = state.happiness;
  document.getElementById('happy-value').textContent = fmt(hp);
  document.getElementById('happy-face').textContent = hp >= 65 ? '😊' : hp >= 42 ? '🙂' : hp >= ECON.happinessGameOver + 10 ? '😟' : '😡';
  document.querySelector('.happy').classList.toggle('low', hp < 40);
  // 예상 민심: 민심이 지금 어디를 향해 움직이는지
  const tgEl = document.getElementById('happy-target');
  if (tgEl) {
    const tg = state.mood && state.mood.target !== undefined ? state.mood.target : null;
    if (tg === null) { tgEl.textContent = ''; tgEl.className = 'happy-target'; }
    else { const dd = tg - hp; tgEl.textContent = (Math.abs(dd) < 1 ? '→ ' : dd > 0 ? '▲ ' : '▼ ') + fmt(tg); tgEl.className = 'happy-target ' + (Math.abs(dd) < 1 ? '' : dd > 0 ? 'up' : 'down'); }
    document.querySelector('.happy').title = '민심 (' + ECON.happinessGameOver + ' 이하가 되면 탄핵). 옆의 작은 숫자는 예상 민심입니다. 다섯 분야(각 ' + ECON.moodPillarMax + '점)의 합이고, 민심은 매달 그 값 쪽으로 차이의 ' + Math.round(ECON.moodPull * 100) + '%만큼 움직입니다.' +
      (state.mood && state.mood.pillars ? state.mood.pillars.map((p) => '\n' + p.name + '  ' + p.score + ' / ' + p.max).join('') + (state.mood.extras || []).map((x) => '\n' + x.label + '  ' + (x.value > 0 ? '+' : '') + x.value).join('') : '');
  }

  const peak = Math.max.apply(null, state.demandCurve);
  document.getElementById('demand-value').textContent = fmt(peak);

  // 지도 위 공급 칩: 조절 가능 설비(명목 용량)와 재생 설비(명목 → 이번 달 날씨 기준 하루 평균 출력)를 따로 보여 용량이 부풀려 보이지 않게
  const rf = renewAvgFactors(state);
  let online = 0, building = 0, retired = 0, renCap = 0, renAvg = 0, renPeak = 0;
  const solarPeakF = state.weather ? Math.max.apply(null, state.weather.solarHourly) * ((state.event && state.event.solarMult) || 1) : 0.7;
  const windPeakF = state.weather ? Math.min(1, Math.max.apply(null, state.weather.windHourly)) : 0.5;
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    if (p.isLink || p.isStorage) continue;
    if (b.status === 'online' && p.renewable) { const cap = plantStats(state, b.type).capacity; renCap += cap; renAvg += cap * (p.renewable === 'solar' ? rf.solar : rf.wind); renPeak += cap * (p.renewable === 'solar' ? solarPeakF : windPeakF); continue; }
    if (b.status === 'online') online += p.capacity;
    else if (b.status === 'building' || b.status === 'upgrading') building += p.capacity;
    else if (b.status === 'retired') retired += p.capacity;
  }
  const renChip = document.getElementById('renew-chip');
  renChip.classList.toggle('hidden', !renCap);   // 태양광·풍력이 없으면 칩을 숨김
  renChip.title = '가동 중인 태양광·풍력: 설비 용량 ' + fmt(renCap) + ' MW · 이번 달 날씨 기준 하루 평균 약 ' + fmt(renAvg) + ' MW · 최대 약 ' + fmt(renPeak) + ' MW';
  renChip.querySelector('.stat-lines').innerHTML = '<small>재생 예상 출력</small><span id="renew-value">평균 약 ' + fmt(renAvg) + ' MW</span>';
  document.getElementById('supply-value').innerHTML =
    fmt(online) + ' MW' + (building ? ' <small>+' + fmt(building) + ' 건설 중</small>' : '') + (retired ? ' <small class="bad">' + fmt(retired) + ' 수명 종료</small>' : '');

  const w = state.weather;
  const temp = w.temp + ((state.event && state.event.tempDelta) || 0);
  let chip = w.seasonName + ' · ' + w.sky + ' · ' + w.wind + ' · ' + temp + '℃';
  if (state.event) chip += ' · <span class="warn">⚠ ' + state.event.name + '</span>';
  document.getElementById('weather-chip').innerHTML = chip;

  const last = state.lastReport;
  let co2 = '<small>탄소세</small> ' + fmt(state.carbonTax) + '원/t';
  const priceIdx = costIndex(state);
  if (priceIdx > 1.005) co2 += ' · <small>건설 물가</small> ×' + fmt(priceIdx, 2);
  const co2El = document.getElementById('co2-chip');
  if (last) {
    co2 = (last.blackoutHours > 0 ? '<span class="bad">지난달 ' + (last.freqOnlyHours >= last.blackoutHours ? '주파수 사고 ' : '정전 ') + last.blackoutHours + '시간</span>' : '<span class="good">지난달 정전 없음</span>') + ' · ' + co2;
    co2El.title = '지난달 탄소 배출 ' + fmt(last.energy.co2) + ' t · 국내 지도는 월 ' + fmt(MAP_NEUTRAL_CO2) + ' t을 기준으로 배출량이 많으면 누렇게, 적으면 맑게 보입니다.';
  }
  co2El.innerHTML = '<span>' + co2 + '</span>';

  { const tb = document.getElementById('tech-bonus'); if (tb) tb.textContent = pct(rdBonus(state)); }
}

// ------------------------------------------------------------
// 이번 달 전망
// ------------------------------------------------------------
function renderForecast(state) {
  const caps = fleetCapacities(state);
  const dispatch = caps.nuclear + caps.smr + caps.coal + caps.ccgt + caps.gt;
  const peak = Math.max.apply(null, state.demandCurve);
  const w = state.weather;
  const ev = state.event || {};
  const temp = w.temp + (ev.tempDelta || 0);
  const tf = gtTempFactor(temp);

  const solarCurve = state.demandCurve.map((_, h) => caps.solar * w.solarHourly[h] * (ev.solarMult || 1));
  const windCurve  = state.demandCurve.map((_, h) => caps.wind * Math.min(1, w.windHourly[h] * (ev.windMult !== undefined ? ev.windMult : 1)));

  let worst = 0;
  for (let h = 0; h < 24; h++) worst = Math.max(worst, state.demandCurve[h] - dispatch - solarCurve[h] - windCurve[h] - caps.link);
  const mustRun = caps.nuclear * techMods(state).nukeMinLoad + caps.smr * PLANTS.smr.minLoad + caps.coal * techMods(state).coalMinLoad;   // 줄일 수 없는 출력 (원전은 항상 100%)
  const minDemand = Math.min.apply(null, state.demandCurve);
  // 밤에 남는 전기 (배터리·연계선이 받아 내고도 남는 양). 정전은 아니지만 처리 비용이 전기요금에 얹힘
  const overEst = Math.max(0, mustRun - minDemand - caps.ess - caps.link);
  const overRisk = overEst > minDemand * 0.03;

  const hasGas = state.buildings.some((b) => b.status === 'online' && (PLANTS[b.type].kind === 'gt' || PLANTS[b.type].kind === 'ccgt'));
  const soon = state.buildings.filter((b) => b.status === 'online' && plantLifeMonths(b.type) - b.age <= 12).length;
  const retired = state.buildings.filter((b) => b.status === 'retired').length;

  // ---------- 계산 ----------
  const ratio = supplyDemandRatio(state), ind = inducedGrowth(state);
  const rsvYear = reserveYear(state), rsvWon = reserveSurcharge(state);   // 설비 여유(한 해 최대 수요 대비)와 그 때문에 요금에 얹히는 부담
  // 미리 돌려 보기: 석탄처럼 출력을 천천히 바꾸는 설비 때문에 "설비는 충분한데 제때 못 올려" 모자라는 시간이 있는지
  let rampShortH = 0, rampShortMW = 0;
  try { const dry = simulateMonth(state); for (const hh of dry.hours) if (hh.rampShort > 0.5) { rampShortH++; rampShortMW = Math.max(rampShortMW, hh.rampShort); } } catch (e) { /* 전망만 못 보여 줌 */ }
  const baseG = baseGrowthNow(state);
  const tgt = intensityTarget(state);
  const lastInten = state.lastReport ? reportIntensity(state.lastReport) : null;
  const overInten = tgt !== null && lastInten !== null && lastInten > tgt;
  const limit = techMods(state).inertiaLimit;
  const limitCurve = state.demandCurve.map((d) => d * limit);
  let atLimitHours = 0, curtailMWh = 0, renAvail = 0;
  for (let h = 0; h < 24; h++) {
    const ren = solarCurve[h] + windCurve[h];
    renAvail += ren;
    if (ren > limitCurve[h]) { atLimitHours++; curtailMWh += (ren - limitCurve[h]) * ECON.daysPerMonth; }
  }
  const curtailPct = renAvail > 0 ? curtailMWh / (renAvail * ECON.daysPerMonth) : 0;
  const m2 = techMods(state);

  // ---------- 시간대별 공급 여유 · 부족 시간대 ----------
  const firm = dispatch + caps.link * w.linkAvail;                     // 언제든 낼 수 있는 공급 (조절 발전 + 수입)
  // 태양광·풍력은 주파수 안정도 한도(그 시간 수요 × 한도)까지만 쓸 수 있음 → 그 위로는 터빈 발전기가 채워야 함
  const supplyCurve = state.demandCurve.map((_, h) => firm + Math.min(solarCurve[h] + windCurve[h], limitCurve[h]));
  let minMargin = Infinity, tightHour = 0;
  const deficitHours = [];
  for (let h = 0; h < 24; h++) {
    const mg = (supplyCurve[h] - state.demandCurve[h]) / state.demandCurve[h];
    if (mg < minMargin) { minMargin = mg; tightHour = h; }
    if (supplyCurve[h] < state.demandCurve[h]) deficitHours.push(h);
  }
  worst = 0;
  for (let h = 0; h < 24; h++) worst = Math.max(worst, state.demandCurve[h] - supplyCurve[h]);
  const stoppedCount = effectsNow(state).outageIds.size;

  // ---------- 주파수 안정도 (0~100) ----------
  let gs = 100; const gsReasons = [];
  if (minMargin < 0) { gs -= 50 + Math.min(30, -minMargin * 100); gsReasons.push('공급 부족 ' + fmt(worst) + ' MW'); }
  else if (minMargin < 0.05) { gs -= 30; gsReasons.push('공급 예비율 ' + fmt(minMargin * 100) + '% (5% 미만)'); }
  else if (minMargin < 0.10) { gs -= 15; gsReasons.push('공급 예비율 ' + fmt(minMargin * 100) + '%'); }
  else if (minMargin < 0.15) gs -= 5;
  if (atLimitHours > 0) { gs -= m2.gridForming ? 5 : Math.min(35, 10 + curtailPct * 100); gsReasons.push('관성 없는 전기가 한도 초과 ' + atLimitHours + '시간'); }
  if (overRisk) { gs -= 10; gsReasons.push('밤에 남는 전기 ' + fmt(overEst) + ' MW'); }
  else if (mustRun > minDemand) { gs -= 5; gsReasons.push('야간 과잉 발전 (배터리·수출이 받아 냄)'); }
  const maintNow = (state.maintIds || []).length + (state.outageId ? 1 : 0);
  if (maintNow) { gs -= 10; gsReasons.push('원전 정기검사 정지 ' + maintNow + '기'); }
  if (stoppedCount) { gs -= 10; gsReasons.push('사고로 정지된 설비 ' + stoppedCount + '기'); }
  gs = clamp(Math.round(gs), 0, 100);
  const gsLevel = gs >= 80 ? '안정' : gs >= 60 ? '주의' : gs >= 40 ? '불안정' : '위험';
  const gridCls = gs >= 80 ? 'good' : gs >= 60 ? 'warn' : 'bad';

  // ---------- 핵심 3칸: 공급 · 탄소 · 계통 ----------
  const supplyCls = worst > 0 || rampShortH > 0 ? 'bad' : minMargin < 0.05 ? 'warn' : rsvWon >= 1 ? 'warn' : 'good';
  // 예비력 = 공급 능력이 최대 수요보다 얼마나 많은가 (위의 큰 숫자 두 개로 계산). 가장 빠듯한 시간의 여유가 5% 아래면 따로 경고
  const rsvPct = peak > 0 ? (firm / peak - 1) * 100 : 0;
  const supplyBadge = worst > 0 ? tightHour + '시에 ' + fmt(worst) + ' MW 부족' : rampShortH > 0 ? '출력을 제때 못 올림 · ' + rampShortH + '시간 부족' : minMargin < 0.05 ? tightHour + '시 공급 예비율 ' + fmt(minMargin * 100) + '% · 빠듯함' : rsvWon >= 1 ? '설비 과잉 · 요금 +' + fmt(rsvWon) + '원' : rsvPct < 0 ? '재생에너지로 수요 보완' : '공급 예비율 ' + fmt(rsvPct) + '%';
  const envNow = lastInten !== null ? clamp(ECON.moodPillarMax * (1 - lastInten / tgt), 0, ECON.moodPillarMax) : null;   // 환경 분야 점수
  const carbonCls = lastInten === null ? 'muted' : overInten ? 'bad' : envNow < ECON.moodPillarMax * 0.45 ? 'warn' : 'good';
  const carbonBadge = lastInten === null ? '0이면 만점 · 기준 이상이면 0점' : overInten ? '기준 초과 · 환경 0점' : '환경 ' + fmt(envNow, 1) + ' / ' + ECON.moodPillarMax + '점';
  let html = '<div class="kpi-row">' +
    '<div class="kpi ' + supplyCls + '"><div class="k">공급 / 수요 (MW)</div><div class="v">' + fmt(Math.round(firm)) + '<small> / ' + fmt(peak) + '</small></div><div class="b">' + supplyBadge + '</div></div>' +
    '<div class="kpi ' + carbonCls + '"><div class="k">탄소 집약도 (t/MWh)</div><div class="v">' + (lastInten !== null ? lastInten.toFixed(2) : '-') + '<small>' + (tgt !== null ? ' / 기준 ' + tgt.toFixed(2) : '') + '</small></div><div class="b">' + carbonBadge + '</div></div>' +
    '<div class="kpi ' + gridCls + '"><div class="k">주파수 안정도</div><div class="v">' + gs + '<small> / 100 · ' + gsLevel + '</small></div><div class="bar"><i style="width:' + gs + '%"></i></div><div class="b">' + (gsReasons.length ? gsReasons[0] : '문제 없음') + '</div></div>' +
    '</div>';
  html += '<div class="wx"><span class="wx-main">' + w.seasonName + ' · ' + w.sky + ' · ' + w.wind + ' · ' + temp + '℃</span>' + weatherEffectChips(w, ev).map((c) => '<span class="chip">' + c + '</span>').join('') + '<span class="chip" title="도시가 빽빽해지면 유입이 줄어듭니다 (지금 평소의 ' + fmt(housingGrowthMult(state) * 100) + '%). 새 도시를 세우면 다시 늘어납니다.">인구 월 +' + fmt(Math.max(0, monthlyGrowth(state)) * 100, 1) + '%</span></div>';
  if (state.event) html += '<div class="alert warn">⚠ <b>' + state.event.name + '</b> ' + state.event.desc + '</div>';

  // ---------- 경고 (해당될 때만) ----------
  const alerts = [];
  if (rampShortH > 0) alerts.push(['bad', '설비는 충분한데 출력을 제때 못 올려 ' + rampShortH + '시간 부족 (최대 ' + fmt(rampShortMW) + ' MW) · 석탄은 한 시간에 용량의 ' + fmt(techMods(state).coalRamp * 100) + '%만 바꿉니다 → 복합발전이나 배터리를 섞으세요']);
  if (rsvWon >= 1) alerts.push(['warn', '설비가 남아돎: 조절 설비가 한 해 최대 수요의 ' + fmt(rsvYear * 100) + '% (알맞은 범위 ' + fmt(ECON.inducedReserve * 100) + '~' + fmt(ECON.reserveFree * 100) + '%) · 남는 설비의 유지비로 전기요금 +' + fmt(rsvWon) + '원 → 새 도시로 수요를 끌어오거나 낡은 설비를 철거']);
  if (overRisk) alerts.push(['warn', '밤에 전기가 ' + fmt(overEst) + ' MW 남음 · 전기요금이 오름 (원전·석탄은 출력을 못 줄임 → 배터리·수출·조절 전원과 섞기)']);
  else if (mustRun > minDemand) alerts.push(['warn', '야간 과잉 발전 ' + fmt(mustRun - minDemand) + ' MW (배터리·수출이 받아 냄)']);
  if (retired) alerts.push(['bad', '수명 종료로 정지된 설비 ' + retired + '기 · 철거 필요']);
  if (soon) alerts.push(['warn', '12개월 안에 수명이 끝나는 설비 ' + soon + '기']);
  {
    // 원전 정기검사: 이번 달 멈춘 것과 다음 달 멈출 것 (가동 18개월마다 한 달)
    const capOf = (b) => plantStats(state, b.type).capacity || 0;
    const nowOut = state.buildings.filter((b) => (state.maintIds || []).indexOf(b.id) >= 0 || state.outageId === b.id);
    if (nowOut.length) alerts.push(['bad', '원전 정기검사로 이번 달 ' + nowOut.length + '기 정지 (−' + fmt(nowOut.reduce((a, b) => a + capOf(b), 0)) + ' MW)']);
    const next = techMods(state).noOutage ? [] : state.buildings.filter((b) => b.status === 'online' && PLANTS[b.type].kind === 'nuclear' && (b.age + 1) % ECON.nukeInspectEvery === 0);
    if (next.length) alerts.push(['warn', '다음 달 원전 정기검사 ' + next.length + '기 (−' + fmt(next.reduce((a, b) => a + capOf(b), 0)) + ' MW) · 대체 설비를 확인하세요']);
  }
  if (state.scheduledOutage) { const left = state.scheduledOutage.due - (state.year * 12 + state.month); alerts.push(['warn', state.scheduledOutage.name + ' 정기검사 ' + (left <= 0 ? '이번 달' : left + '개월 뒤') + ' · 한 달 정지']); }
  if (ind < 0) alerts.push(['warn', '전력 부족 우려로 인구 유입 둔화']);
  if (atLimitHours > 0 && curtailPct >= 0.1) alerts.push([m2.gridForming ? 'warn' : 'bad', '재생 출력 제한 ' + fmt(curtailPct * 100) + '%' + (m2.gridForming ? ' · 남는 전기는 수출로' : ' · 주파수 사고 위험 월 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '회 · 계통 테크 필요 (4단계부터 사고 없음)')]);
  if (alerts.length) html += alerts.map((a) => '<div class="alert ' + a[0] + '">' + (a[0] === 'bad' ? '⚠ ' : '· ') + a[1] + '</div>').join('');

  // ---------- 자세히 (펼치기) ----------
  let d = '';
  d += '<div class="row"><span>조절 가능 설비 (손실·기온 반영)</span><b>' + fmt(dispatch) + ' MW</b></div>';
  d += '<div class="row"><span>재생에너지 설비 · 관성 없는 전기 한도</span><b>' + fmt(caps.solar + caps.wind) + ' MW · ' + fmt(limit * 100) + '%</b></div>';
  if (caps.ess > 0) d += '<div class="row"><span>배터리 (출력 / 저장량)</span><b>' + fmt(caps.ess) + ' MW / ' + fmt(caps.essEnergy) + ' MWh</b></div>';
  d += '<div class="row"><span>설비 여유 (조절 설비 ÷ 한 해 최대 수요)</span><b class="' + (rsvWon >= 1 ? 'warn' : rsvYear < 1.05 ? 'bad' : '') + '">' + fmt(rsvYear * 100) + '%' + (rsvWon >= 1 ? ' · 요금 +' + fmt(rsvWon) + '원' : '') + '</b></div>';
  d += '<div class="row"><span>인구 증가율: 기본 월 ' + fmt(baseG * 100, 2) + '%' + (ind > 0 ? ' + 전기가 넉넉해서 월 ' + fmt(ind * 100, 1) + '% 더 유입' : '') + (housingGrowthMult(state) < 0.99 ? ' · 도시가 빽빽해서 ×' + fmt(housingGrowthMult(state), 2) : '') + '</span><span class="muted">여유가 ' + fmt((ECON.inducedReserve - 1) * 100) + '%를 넘으면 사람이 더 들어오고, ' + fmt((ECON.reserveFree - 1) * 100) + '%를 넘으면 남는 설비 유지비가 요금에 얹힙니다</span></div>';
  d += '<div class="row"><span>가스 연료비 지수 · 업계 표준 원가 지수</span><b>' + fmt(state.gasPrice * (ev.gasMult || 1) * 100) + ' · ' + fmt(refCostFactor(state) * 100) + '</b></div>';
  if (caps.link > 0) {
    const nd = neighborDemandCurve(state);
    const appPeak = Math.max(...nd.map((v, h) => neighborAppetite(state, h)));
    d += '<div class="row"><span>수출 가능 (이웃 수요 ' + fmt(Math.max(...nd)) + ' MW 상한) · 프리미엄</span><b>' + fmt(Math.min(caps.link, appPeak)) + ' MW · +' + fmt((neighborPricePremium(state) - 1) * 100) + '%</b></div>';
    d += '<div class="row"><span>수입 가능 (이웃 여유 ' + fmt(w.linkAvail * 100) + '%)</span><b>' + fmt(caps.link * w.linkAvail) + ' MW · 수요의 ' + fmt(ECON.importShareLimit * 100) + '%까지</b></div>';
  }
  if (atLimitHours > 0) d += '<div class="row"><span>예상 출력 제한 · 주파수 사고 위험</span><b>' + fmtMWh(curtailMWh) + ' · ' + (m2.gridForming ? '없음 (그리드포밍)' : '월 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '회') + '</b></div>';
  html += '<details class="more"><summary>자세히</summary>' + d + '</details>';
  setHtmlKeepOpen(document.getElementById('forecast-info'), html);

  // 그래프: 아래부터 조절 발전(원전·화력·수입)·태양광·풍력을 쌓고, 흰 수요선이 그 위로 올라가는 시간대는 빨갛게 (= 부족)
  drawChart(document.getElementById('forecast-chart'), {
    stacks: [
      { color: 'rgba(120,144,156,0.6)', values: state.demandCurve.map(() => firm), label: '조절 전원 + 수입', labelColor: 'rgba(255,255,255,0.85)' },
      { color: '#ffee58', values: solarCurve, label: '태양광' },
      { color: '#4fc3f7', values: windCurve, label: '풍력' },
    ],
    deficit: { values: state.demandCurve },
    lines: [{ color: '#ffffff', values: state.demandCurve, width: 3 }],
    aspect: 0.58,
    peakLabel: { values: state.demandCurve, color: '#ffffff' },
    yLabel: 'MW',
  });

  // 그래프 아래 진단: 무엇이 언제 부족하고, 무엇을 지어야 하는지 한 줄로
  const hourRange = (hs) => {
    if (!hs.length) return '';
    const groups = []; let s = hs[0], p = hs[0];
    for (let i = 1; i < hs.length; i++) { if (hs[i] === p + 1) p = hs[i]; else { groups.push([s, p]); s = p = hs[i]; } }
    groups.push([s, p]);
    return groups.map((g) => g[0] === g[1] ? g[0] + '시' : g[0] + '~' + g[1] + '시').join(', ');
  };
  const bm = (t) => PLANTS[t].buildMonths;
  let diag = '', diagCls = 'good';
  guideSupply = null;
  if (!deficitHours.length && rampShortH > 0) {
    guideSupply = { cls: 'bad', name: '출력을 제때 못 올림 ' + rampShortH + '시간', tip: '복합발전·배터리 섞기' };
    diagCls = 'bad';
    diag = '<b>설비는 충분하지만 ' + rampShortH + '시간 동안 최대 ' + fmt(rampShortMW) + ' MW가 모자랍니다.</b> 수요가 빨리 오르는 시간에 석탄이 출력을 따라 올리지 못합니다(한 시간에 용량의 ' + fmt(techMods(state).coalRamp * 100) + '%). 출력을 자유롭게 바꾸는 <b>복합발전</b>(' + bm('ccgt') + '개월)이나 배터리를 섞으세요.';
  } else if (deficitHours.length) {
    guideSupply = { cls: 'bad', name: '전력 부족 ' + fmt(worst) + ' MW', tip: hourRange(deficitHours) + ' · 지금 착공' };
    const day = deficitHours.filter((h) => h >= 9 && h <= 16).length, night = deficitHours.length - day;
    diagCls = 'bad';
    diag = '<b>부족 ' + fmt(worst) + ' MW · ' + hourRange(deficitHours) + '</b> → ';
    if (deficitHours.length >= 18) diag += '종일 모자랍니다. 당장은 복합발전(' + bm('ccgt') + '개월), 길게는 석탄(' + bm('coal') + ')·원전(' + bm('nuclear') + '개월) 같은 기저 설비가 필요합니다.';
    else if (night > 0 && day === 0) diag += '해 진 뒤·새벽이 모자랍니다. 태양광은 도움이 안 됩니다. 복합발전(' + bm('ccgt') + '개월)이나 연계선 수입이 답입니다.';
    else if (day > 0 && night === 0) diag += '낮에만 모자랍니다. 태양광(' + bm('solar') + '개월)이 가장 싸고 빠릅니다.';
    else diag += '낮과 저녁 모두 모자랍니다. 복합발전(' + bm('ccgt') + '개월)이 가장 빠릅니다.';
  } else {
    // 가장 빠듯한 시각의 여유와, 지금 증가율로 언제 부족해질지 (가장 수요가 큰 계절 기준)
    const g = Math.max(0, monthlyGrowth(state));
    const worstSeason = worstPeakRatio(state.month);   // 가장 수요가 큰 달(1월)에는 지금의 몇 배가 되나
    const room = (1 + minMargin) / worstSeason;      // 가장 더운·추운 달 기준 남은 여유 배율
    const months = room <= 1 ? 0 : g > 0 ? Math.log(room) / Math.log(1 + g) : 999;
    const spare = fmt(Math.round(supplyCurve[tightHour] - state.demandCurve[tightHour]));
    if (months <= 0) { guideSupply = { cls: 'warn', name: '한여름·한겨울에 전력 부족', tip: '지금 착공' }; diagCls = 'warn'; diag = '<b>지금은 여유 ' + spare + ' MW (' + tightHour + '시)</b> → 하지만 가장 추운 달(1월)에는 모자랍니다. 지금 착공해야 합니다 (복합발전 ' + bm('ccgt') + '개월).'; }
    else if (months < 12) { guideSupply = { cls: 'warn', name: '약 ' + Math.round(months) + '개월 뒤 전력 부족', tip: '지금 착공' }; diagCls = 'warn'; diag = '<b>여유 ' + spare + ' MW (' + tightHour + '시)</b> → 수요가 월 ' + fmt(g * 100, 1) + '%씩 늘어 약 <b>' + Math.round(months) + '개월 뒤</b> 부족해집니다. 공사 기간(복합발전 ' + bm('ccgt') + ' · 원전 ' + bm('nuclear') + '개월)을 생각하면 지금 지어야 합니다.'; }
    else diag = '<b>여유 ' + spare + ' MW (' + tightHour + '시)</b> → ' + (months > 60 ? '5년 넘게 넉넉합니다.' : months > 30 ? '약 ' + Math.round(months / 12) + '년은 넉넉합니다.' : '약 ' + Math.round(months) + '개월은 버팁니다. 다음 설비를 계획할 때입니다.');
    if (atLimitHours > 0) {
      if (m2.gridForming) diag += ' 하루 ' + atLimitHours + '시간은 재생에너지가 한도(' + fmt(limit * 100) + '%)를 넘어 남습니다. 배터리에 담거나 수출하세요.';
      else {
        // 발전소가 넉넉해도 나는 사고라서, 초록색 "넉넉합니다"로만 두면 결산의 정전이 뜬금없어 보임 → 주의로 올리고 까닭과 해법을 적음
        diag += ' <b>다만 주파수 사고 위험이 있습니다.</b> 하루 ' + atLimitHours + '시간은 관성 없는 전기(태양광·풍력)가 한도 ' + fmt(limit * 100) + '%에 닿아 남는 만큼 버려지고, 한 달에 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '번꼴로 그 시간 수요의 ' + fmt(ECON.freqLossRatio * 100) + '%가 끊깁니다. <b>계통 테크</b>를 올리면 한도가 넓어지고 4단계부터는 사고가 나지 않습니다.';
        if (diagCls === 'good') diagCls = 'warn';
        if (!guideSupply) guideSupply = { cls: 'warn', name: '주파수 사고 위험 월 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '회', tip: '계통 테크 올리기 (4단계부터 없음)' };
      }
    }
    if (overRisk) { diag += ' 밤에는 원전·석탄 전기가 ' + fmt(overEst) + ' MW 남습니다. 남는 전기의 처리 비용은 전기요금에 얹히니, 배터리나 연계선을 늘리거나 출력을 조절할 수 있는 발전기 비중을 키우세요.'; if (!guideSupply) { guideSupply = { cls: 'warn', name: '밤에 전기가 남음 ' + fmt(overEst) + ' MW', tip: '요금 오름 · 배터리·수출·조절 전원' }; if (diagCls === 'good') diagCls = 'warn'; } }
  }
  document.getElementById('forecast-diag').innerHTML = '<div class="alert ' + diagCls + '">' + diag + '</div>';
  renderGuide(state);
}

// ------------------------------------------------------------
// 길잡이: 내 노선 · 대표 공약 · 지금 신경 쓸 것(최대 3개)만. 자세한 숫자는 전망·정책 탭에
// ------------------------------------------------------------
const GUIDE_TIP = {
  power: '조절 전원을 넉넉히 (정전 없는 달마다 ' + ECON.moodPowerRecover + '점 회복)', price: '싼 전원 늘리기 · 요금 지원 · 남는 설비 줄이기', env: '태양광·풍력·원전 비중 늘리기',
  city: '새 도시 · 수출 · 기피 시설은 도시에서 멀리', future: '내 노선 테크 연구 · 공약 지키기',
  housing: '새 도시 세우기 (사람도 더 들어옴)', nuisance: '기피 시설을 도시에서 멀리', nukes: '안전 테크 · 대형 원전 위주로', land: '테크로 출력 키우기 · 풍력은 바다로', pledge: '늦게라도 지키면 사라짐',
};
let guideSupply = null;   // 전망 계산이 남기는 전력 수급 경고 (문제없으면 null)
function renderGuide(state) {
  const el = document.getElementById('guide-info');
  if (!el) return;
  const now = state.year * 12 + state.month;
  const start = (state.startYear || ECON.startYear) * 12 + (state.startMonth || ECON.startMonth);
  const pol = state.policies || {};
  const dur = (m) => (m > 24 ? Math.floor(m / 12) + '년' : m + '개월');
  const esc = (t) => String(t).replace(/"/g, '&quot;');
  // 1) 내 노선: 에너지 정책이 중심, 나머지 정책은 작게
  const eOpt = pol.energy && POLICIES.energy.options[pol.energy];
  const eDue = Math.max(0, policyAtOf(state, 'energy') - (now - start));
  const others = Object.keys(POLICIES).filter((k) => k !== 'energy' && pol[k]).map((k) => policyLabel(k, pol[k]));
  let html = moodStripHtml(state.mood && state.mood.pillars) + '<div class="g-line"><span class="k">노선</span>' +
    (eOpt ? '<b class="g-main">' + eOpt.label + '</b>' : '<span class="muted">에너지 정책 ' + (eDue <= 0 ? '곧 결정' : eDue + '개월 뒤 결정') + '</span>') +
    (others.length ? '<small>' + others.join(' · ') + '</small>' : '') + '</div>';
  // 2) 대표 공약: 에너지 정책의 공약, 없으면 기한이 가장 가까운 공약
  const pledges = (state.quests || []).map((q) => ({ q, def: questById(q.id) })).filter((x) => x.def && x.def.pledge);
  const main = pledges.find((x) => x.def.term2) || pledges.find((x) => x.def.policy === 'energy') || pledges.filter((x) => x.q.status === 'active').sort((a, b) => a.q.deadline - b.q.deadline)[0] || pledges[0];
  if (main) {
    const stt = main.q.status, st = pledgeStateOf(state, main.q, main.def);
    html += '<div class="g-pledge" title="' + esc(main.def.short + '. ' + pledgeStakesText(main.def) + '.') + '"><div class="t"><span>' + (main.def.term2 ? '🗳 재선 공약 · ' : '📜 ') + main.def.title.replace('재선 공약: ', '').replace('공약: ', '') + '</span><small class="' + st[0] + '">' + st[1] + '</small></div>' +
      (stt === 'active' || stt === 'failed' ? '<div class="p">' + main.def.progress(state, main.q) + '</div>' : '') + '</div>';
  }
  // 3) 신경 쓸 것: 전력 수급 경고 → 임박한 기한 → 민심을 크게 깎는 요인 순으로 최대 3개
  const items = [];
  if (guideSupply) items.push({ cls: guideSupply.cls, mark: '⚡', name: guideSupply.name, tip: guideSupply.tip });
  const urgent = (state.quests || []).filter((q) => q.status === 'active' && (!main || q !== main.q)).map((q) => ({ q, def: questById(q.id), left: q.deadline - now + 1 }))
    .filter((x) => x.def && x.left <= (x.def.pledge || x.q.id === 'reelection' ? 12 : 3)).sort((a, b) => a.left - b.left)[0];
  if (urgent) items.push({ cls: 'warn', mark: '⏳', name: urgent.def.title.replace('공약: ', ''), tip: monthsLeftText(urgent.left), title: urgent.def.desc });
  // 태양광·풍력이 한쪽으로 쏠렸으면 알림 (둘은 시간대와 계절이 반대라 섞어야 고르게 채워짐). 평균 출력으로 견줌
  {
    const alive = (b) => b.status !== 'retired' && b.status !== 'demolishing';
    let so = 0, wi = 0;
    for (const b of state.buildings) { if (!alive(b)) continue; if (b.type === 'solar') so += plantStats(state, 'solar').capacity * 0.18; else if (b.type === 'wind') wi += plantStats(state, 'wind').capacity * 0.30; }
    const avgD = state.demandCurve.reduce((a, v) => a + v, 0) / state.demandCurve.length;
    if (so + wi >= avgD * 0.12 && Math.min(so, wi) < (so + wi) * 0.2)
      items.push(so > wi ? { cls: 'warn', mark: '☀', name: '태양광에 쏠림', tip: '풍력을 섞으면 밤·겨울이 채워짐', title: '태양광은 낮과 여름에, 풍력은 밤과 겨울에 많이 나옵니다. 한쪽만 지으면 남는 시간에는 버려지고 모자라는 시간에는 다른 발전기가 메워야 합니다.' }
                         : { cls: 'warn', mark: '🌬', name: '풍력에 쏠림', tip: '태양광을 섞으면 낮·여름이 채워짐', title: '태양광은 낮과 여름에, 풍력은 밤과 겨울에 많이 나옵니다. 한쪽만 지으면 남는 시간에는 버려지고 모자라는 시간에는 다른 발전기가 메워야 합니다.' });
  }
  {
    const line = techLineOf(state);
    if (line && TECH_LINE[line].length > 1 && yearsElapsed(state) >= 2 && !items.some((it) => it.mark === '☀' || it.mark === '🌬')) {
      const tw = techWeights(state);
      const lack = TECH_LINE[line].filter((k) => (tw[k] || 0) < 0.5).sort((a, b) => (tw[a] || 0) - (tw[b] || 0))[0];
      if (lack && TECH_LINE[line].some((k) => (tw[k] || 0) >= 0.5)) items.push({ cls: 'warn', mark: '🔬', name: TECH[lack].name + ' 설비 부족', tip: '지어야 노선 테크가 다 반영됨', title: '트리가 둘인 노선은 두 설비를 모두 지어야 연구 점수가 끝까지 찹니다. 한쪽만 쓰면 절반까지만 반영됩니다.' });
    }
  }
  // 설비 과잉: 남는 설비의 유지비가 요금에 얹히는 중
  { const rw = reserveSurcharge(state); if (rw >= 2) items.push({ cls: 'warn', mark: '🏭', name: '설비 과잉 · 요금 +' + fmt(rw) + '원', tip: '새 도시로 수요 늘리기 · 낡은 설비 철거', title: '조절 설비(복합발전·석탄·원전)가 한 해 최대 수요의 ' + fmt(reserveYear(state) * 100) + '%입니다. ' + fmt(ECON.reserveFree * 100) + '%를 넘는 만큼 남는 설비의 유지비가 전기요금에 얹힙니다.' }); }
  // 점수가 낮은 분야(절반 아래)와, 분야 안에서 크게 깎이는 것
  const pillarsNow = (state.mood && state.mood.pillars) || [];
  for (const p of pillarsNow.filter((p) => p.score < p.max * 0.4).sort((a, b) => a.score - b.score)) items.push({ cls: p.score < p.max * 0.2 ? 'bad' : 'warn', mark: fmt(p.score, 1) + '/' + p.max, name: p.name, tip: GUIDE_TIP[p.key] || '', title: p.parts.map((x) => x.label).join('\n') });
  for (const p of pillarsNow) for (const x of p.parts) {
    const k = x.key.split(':')[0];
    if (k === 'housing' && x.value < ECON.moodHousingMax * 0.7) items.push({ cls: 'warn', mark: '🏙', name: '도시가 빽빽함 (주거 ' + fmt(x.value, 1) + '/' + ECON.moodHousingMax + ')', tip: GUIDE_TIP.housing, title: x.label });
    else if (x.value <= -2 && GUIDE_TIP[k]) items.push({ cls: 'bad', mark: '−' + fmt(Math.abs(x.value), 1), name: x.label.replace(/ \(.*$/, ''), tip: GUIDE_TIP[k], title: x.label });
  }
  html += '<div class="g-watch"><div class="k">신경 쓸 것</div>' +
    (items.length ? items.slice(0, 3).map((it) => '<div class="g-row ' + it.cls + '"' + (it.title ? ' title="' + esc(it.title) + '"' : '') + '><b>' + it.mark + '</b><span class="n">' + it.name + '</span><span class="tip">' + it.tip + '</span></div>').join('')
                  : '<div class="g-ok">✓ 지금은 순조롭습니다</div>') + '</div>';
  setHtmlKeepOpen(el, html);
}

// ------------------------------------------------------------
// 선택한 설비
// ------------------------------------------------------------
function renderSelected(state) {
  const root = document.getElementById('selected-info');
  const b = state.buildings.find((x) => x.id === state.selectedId);
  if (!b) { root.innerHTML = '<p class="muted">지도에서 설비를 클릭하세요.</p>'; return; }
  const p = PLANTS[b.type];
  const st = plantStats(state, b.type);
  const loss = plantLoss(state, b);
  const life = plantLifeMonths(b.type);
  const left = Math.max(0, life - b.age);
  const ageSt = plantAgeStatus(b);

  const status = b.status === 'online' ? (state.outageId === b.id || (state.maintIds || []).indexOf(b.id) >= 0 ? '<span class="bad">정기검사 중 (이번 달 정지)</span>' : ageSt === 'aging' ? '<span class="warn">가동 중 (노후, 출력 −10%)</span>' : '<span class="good">가동 중</span>')
               : b.status === 'upgrading' ? '<span class="warn">업그레이드 중 (' + b.monthsLeft + '개월)</span>'
               : b.status === 'demolishing' ? '<span class="bad">철거 중 (' + b.monthsLeft + '개월)</span>'
               : b.status === 'retired' ? '<span class="bad">수명 종료 · 정지</span>'
               : '<span class="warn">건설 중 (' + b.monthsLeft + '개월)</span>';

  let html = '<div class="row"><b>' + p.name + '</b>' + status + '</div>';
  if (b.status === 'online' && p.kind === 'nuclear') {
    html += techMods(state).noOutage ? '<div class="row"><span>정기검사</span><b class="good">멈추지 않음 (온라인 검사)</b></div>'
      : '<div class="row"><span>다음 정기검사</span><b>' + (ECON.nukeInspectEvery - (b.age % ECON.nukeInspectEvery)) + '개월 뒤 한 달 정지</b></div>';
  }
  if (state.scheduledOutage && state.scheduledOutage.id === b.id) {
    const left = state.scheduledOutage.due - (state.year * 12 + state.month);
    html += '<div class="row warn"><span>⚠ 정기검사 예정</span><b>' + (left <= 0 ? '이번 달' : left + '개월 뒤') + ' 한 달 정지</b></div>';
  }
  // 이 설비의 현재 상태 위주 (일반 설명과 테크 효과는 왼쪽 카드의 ⓘ에서)
  const techLine = plantTechSummary(state, b.type, true);
  if (techLine) html += '<div class="row muted"><span>적용 테크</span><b>' + techLine + '</b></div>';
  const nui = typeof nuisanceOf === 'function' ? nuisanceOf(state, b) : 0;
  if (nui > 0) html += '<div class="row bad"><span>주민 반발 (도시 가까움)</span><b>민심 −' + fmt(nui * ECON.moodNuisanceMult, 1) + '</b></div>';
  html += '<div class="row"><span>설비 용량 (정격)</span><b>' + fmt(st.capacity) + ' MW</b></div>';
  if (!p.isLink) {
    html += '<div class="row"><span>송전 손실 (도시까지 ' + distToNearestCity(state.cities, b.type, b.col, b.row) + '칸)</span><b>' + fmt(loss * 100) + '%</b></div>';
    if (b.coastal) html += '<div class="row good"><span>해안 보너스</span><b>+' + fmt(techMods(state).coastalBonus * 100) + '%</b></div>';
    if (b.type === 'wind' && state.grid[b.row] && state.grid[b.row][b.col] === SEA) html += '<div class="row bad"><span>바다 위 설비 (관리가 어려움)</span><b>고정 유지비 ×' + ECON.offshoreOmMult + '</b></div>';
    if (p.renewable === 'wind') { if (b.mountain) html += '<div class="row good"><span>산지 보너스 (바람 셈)</span><b>+' + fmt(ECON.windMountainBonus * 100) + '%</b></div>'; else if (!b.coastal) html += '<div class="row warn"><span>평지 페널티 (바람 약함)</span><b>−' + fmt(ECON.windPlainPenalty * 100) + '%</b></div>'; }
    if (p.renewable === 'solar' && b.mountain) html += '<div class="row bad"><span>산림 훼손 (산지 태양광)</span><b>민심 −' + fmt(ECON.solarMountainNuisance * ECON.moodNuisanceMult, 1) + '</b></div>';
    if (b.status === 'online' && p.renewable) {
      // 재생 설비: 설비 용량과 실제 출력을 구분해서 보여줌 (이번 달 날씨 기준)
      const rf = renewAvgFactors(state), eff = plantEffectiveCapacity(state, b);
      const f = p.renewable === 'solar' ? rf.solar : rf.wind;
      const peakF = p.renewable === 'solar' ? Math.max.apply(null, state.weather.solarHourly) * ((state.event && state.event.solarMult) || 1) : Math.min(1, Math.max.apply(null, state.weather.windHourly));
      html += '<div class="row"><span>이번 달 실제 출력 (하루 평균)</span><b>' + fmt(eff * f) + ' MW <small class="muted">(' + fmt(f * 100) + '%)</small></b></div>';
      html += '<div class="row"><span>' + (p.renewable === 'solar' ? '낮 최대 출력' : '바람 셀 때 최대 출력') + '</span><b>' + fmt(eff * peakF) + ' MW</b></div>';
    } else if (b.status === 'online') html += '<div class="row"><span>이번 달 출력 <small class="muted">(기온·손실·노후 반영)</small></span><b>' + fmt(plantEffectiveCapacity(state, b)) + ' MW</b></div>';
    html += '<div class="row"><span>연료비 / 변동 운영비</span><b>' + fmt(st.fuelCost) + ' / ' + p.varOm + ' 원/kWh</b></div>';
    html += '<div class="row"><span>탄소 배출</span><b>' + fmt(st.co2, 2) + ' t/MWh</b></div>';
  }
  html += '<div class="row"><span>월 고정 유지비</span><b>' + fmt(st.capex * p.omRate / 12, 1) + ' 억</b></div>';
  if (p.dispatchable) html += '<div class="row"><span>월 용량 요금</span><b class="good">+' + fmt(st.capacity * ECON.capacityPayment, 1) + ' 억</b></div>';
  html += '<div class="row ' + (ageSt === 'expired' ? 'bad' : ageSt === 'aging' ? 'warn' : '') + '"><span>수명</span><b>' +
    (b.status === 'building' ? p.lifeYears + '년' : fmt(left / 12, 1) + '년 남음 (설계 수명 ' + p.lifeYears + '년)') + '</b></div>';

  html += '<div class="actions">';
  if (p.upgradeTo && b.status === 'online') {
    const up = PLANTS[p.upgradeTo];
    html += '<button class="small primary" data-action="upgrade" ' + (state.money < upgradeCostOf(state, b.type) ? 'disabled' : '') + '>' +
      up.name + '으로 업그레이드 (' + fmt(upgradeCostOf(state, b.type)) + '억 · ' + p.upgradeMonths + '개월)</button>';
  }
  if (b.status !== 'demolishing') {
    html += '<button class="small danger" data-action="demolish">철거 (' + ECON.demolishMonths + '개월 · 환급 ' + fmt(paidCost(state, b) * ECON.demolishRefund) + '억)</button>';
  }
  html += '</div>';
  root.innerHTML = html;
}

// ------------------------------------------------------------
// 설비 현황 (원그래프 + 목록)
// ------------------------------------------------------------
function renderFleet(state) {
  const rows = {};
  const rf = renewAvgFactors(state);
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    if (!rows[b.type]) rows[b.type] = { online: 0, building: 0, retired: 0, cap: 0 };
    if (b.status === 'online') { rows[b.type].online++; rows[b.type].cap += plantStats(state, b.type).capacity; }
    else if (b.status === 'retired') rows[b.type].retired++;
    else rows[b.type].building++;
  }

  const slices = [];
  for (const type of PALETTE_ORDER) {
    const r = rows[type];
    if (r && r.cap > 0 && !PLANTS[type].isLink && !PLANTS[type].isStorage) slices.push({ label: PLANTS[type].name, value: r.cap, color: PLANTS[type].color });
  }
  drawPie(document.getElementById('fleet-pie'), slices, 'MW');

  let html = '';
  for (const type of PALETTE_ORDER) {
    const r = rows[type];
    if (!r) continue;
    html += '<div class="fleet-line"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:' + PLANTS[type].color + '"></i>' +
      PLANTS[type].name + '</span><span>' + r.online + '기' +
      (r.building ? ' <span class="muted">(+' + r.building + ')</span>' : '') +
      (r.retired ? ' <span class="bad">(정지 ' + r.retired + ')</span>' : '') +
      '</span><span class="muted">' + fmt(r.cap) + ' MW' + (PLANTS[type].renewable && r.cap > 0 ? ' <small>(하루 평균 ~' + fmt(r.cap * (PLANTS[type].renewable === 'solar' ? rf.solar : rf.wind)) + ')</small>' : '') + '</span></div>';
  }
  if (!html) html = '<p class="muted">아직 설비가 없습니다.</p>';

  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  html += '<div class="row" style="margin-top:8px"><span>도시 ' + state.cities.length + '곳 · 인구</span><b>' + fmt(pop) + '만 명</b></div>';
  document.getElementById('fleet-info').innerHTML = html;
}

// ------------------------------------------------------------
// 도시 탭
// ------------------------------------------------------------
function renderCityTab(state) {
  const root = document.getElementById('city-list');
  let html = '';
  for (const c of state.cities) {
    const density = cityDensity(c);
    const crowded = density > ECON.densityLimit;
    html += '<div class="city-item' + (crowded ? ' crowded' : '') + '">' +
      '<div class="row"><b>' + c.name + '</b><span>' + fmt(c.pop) + '만 명</span></div>' +
      '<div class="row"><span>' + c.tiles.length + '칸 · 칸당 ' + density.toFixed(2) + '만</span>' +
      (crowded ? '<span class="bad">과밀 (기준 ' + ECON.densityLimit + ')</span>' : density >= ECON.densityLimit * 0.8 ? '<span class="warn">곧 과밀 · 여유 ' + fmt((ECON.densityLimit - density) * c.tiles.length) + '만</span>' : '<span class="good">여유 ' + fmt((ECON.densityLimit - density) * c.tiles.length) + '만</span>') + '</div>' +
      '</div>';
  }
  root.innerHTML = html;
  document.getElementById('city-auto').classList.toggle('hidden', !!state.cityDraft);

  document.getElementById('city-need').textContent = ECON.cityTiles;
  document.getElementById('city-need2').textContent = ECON.cityTiles;
  document.getElementById('city-cost').innerHTML = fmt(cityFoundCost(state)) + '억' + ' <small class="muted">(도시가 늘수록 비싸짐)</small>';
  const draft = state.cityDraft;
  // 세우면 무엇이 달라지는지 미리 보여 줌: 들어오는 사람(전력 수요)과 주거 여유 점수
  { const eff = draft && draft.tiles.length ? cityEffTiles({ tiles: draft.tiles }) : ECON.cityTiles;
    const nc = cityNewcomersNow(state, eff).n, h0 = housingScore(housingDensity(state)), h1 = housingScore(housingDensity(state, eff, nc));
    const fx = document.getElementById('city-effect');
    if (fx) fx.innerHTML = '<div class="row"><span>들어오는 사람</span><b>+' + fmt(nc) + '만 명</b></div>' +
      '<div class="row"><span>늘어나는 전력 수요 (한 해 최대)</span><b class="warn">약 +' + fmt(Math.round(nc * perCapitaNow(state) * WORST_PEAK_MULT / 10) * 10) + ' MW</b></div>' +
      '<div class="row"><span>주거 여유 (도시·생활 분야)</span><b class="' + (h1 > h0 + 0.05 ? 'good' : '') + '">' + fmt(h0, 1) + ' → ' + fmt(h1, 1) + ' / ' + ECON.moodHousingMax + '</b></div>'; }

  document.getElementById('city-count').textContent = draft ? draft.tiles.length : 0;
  document.getElementById('city-start').classList.toggle('hidden', !!draft);
  document.getElementById('city-confirm').classList.toggle('hidden', !draft);
  document.getElementById('city-cancel').classList.toggle('hidden', !draft);
}

// (테크트리 탭과 R&D 탭은 없어졌고, 오른쪽 "연구" 칸(renderTechRdPanel)이 그 일을 함. 부르는 곳이 남아 있어 빈 함수로 둠)
function renderTech(state) {}
function renderRD(state) {}

// 다시 그릴 때 펼쳐 둔 <details>가 도로 접히지 않게, 펼친 것들의 제목을 기억했다가 되살림 (제목 속 숫자는 달마다 바뀌므로 지우고 비교)
function setHtmlKeepOpen(el, html) {
  if (!el) return;
  const key = (s) => s.textContent.replace(/[\d,.+−-]+/g, '#');
  const open = new Set(Array.from(el.querySelectorAll('details[open] > summary')).map(key));
  el.innerHTML = html;
  if (open.size) for (const s of el.querySelectorAll('details > summary')) if (open.has(key(s))) s.parentElement.open = true;
}

// ------------------------------------------------------------
// 민심 성적표: 다섯 분야(각 20점)의 점수를 막대로 보여 줌 (결산 창 · 길잡이 공통)
// ------------------------------------------------------------
const moodSign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);
const moodCls = (p) => (p.score >= p.max * 0.75 ? 'good' : p.score >= p.max * 0.45 ? 'mid' : 'bad');
function moodTip(p) { return p.parts.map((x) => x.label + '  ' + (p.parts.length === 1 ? fmt(x.value, 1) + '점' : moodSign(x.value))).join('\n').replace(/"/g, '&quot;'); }
// 지난달의 분야별 점수 (결산에서 오르내림을 보여 줄 때)
function moodPrevOf(state) {
  const h = state.history || [];
  return h.length >= 2 && h[h.length - 2].mood && h[h.length - 2].mood.power !== undefined ? h[h.length - 2].mood : null;
}
// 큰 막대 다섯 줄 (결산 창)
function moodBarsHtml(pillars, extras, prev) {
  let html = '<div class="mood-bars">';
  for (const p of pillars || []) {
    const dv = prev && prev[p.key] !== undefined ? Math.round((p.score - prev[p.key]) * 10) / 10 : 0;
    html += '<div class="mb ' + moodCls(p) + '" title="' + moodTip(p) + '"><span class="n">' + p.icon + ' ' + p.name + '</span><span class="bar"><i style="width:' + clamp(p.score / p.max * 100, 0, 100) + '%"></i></span>' +
      '<b>' + fmt(p.score, 1) + '</b><small>/ ' + p.max + '</small><i class="dv ' + (dv > 0 ? 'up' : dv < 0 ? 'down' : '') + '">' + (Math.abs(dv) >= 0.3 ? (dv > 0 ? '▲' : '▼') + fmt(Math.abs(dv), 1) : '') + '</i></div>';
  }
  for (const x of extras || []) html += '<div class="mb-x ' + (x.value >= 0 ? 'good' : 'bad') + '"><span>' + x.label + '</span><b>' + moodSign(x.value) + '</b></div>';
  return html + '</div>';
}
// 작은 칸 다섯 개 (길잡이): 아이콘 · 이름 · 점수
function moodStripHtml(pillars) {
  if (!pillars || !pillars.length) return '';
  return '<div class="mood-strip">' + pillars.map((p) =>
    '<div class="ms ' + moodCls(p) + '" title="' + p.name + ' ' + fmt(p.score, 1) + ' / ' + p.max + '\n' + moodTip(p) + '"><div class="t">' + p.icon + ' ' + p.name.replace('·생활', '').replace('·신뢰', '').replace(' 공급', '').replace('전기 ', '') + '</div><div class="v">' + fmt(p.score) + '<small>/' + p.max + '</small></div><div class="bar"><i style="width:' + clamp(p.score / p.max * 100, 0, 100) + '%"></i></div></div>').join('') + '</div>';
}

// ------------------------------------------------------------
// 결산 창
// ------------------------------------------------------------
// 결산 그래프: 수요를 무엇으로 채웠는지 아래부터 쌓고, 한도 때문에 버려진 재생에너지는 맨 위에 옅게 얹음
//  주파수 사고가 난 시간은 끊긴 만큼 공급을 줄여 그려서 수요선 아래 빈틈(빨강)으로 보이게 함
const REPORT_SERIES = [
  ['nuclear', '원전', '#f06292'], ['coal', '석탄', '#546e7a'], ['ccgt', '복합발전', '#e53935'], ['gt', '가스터빈', '#ff9100'],
  ['solar', '태양광', '#ffee58'], ['wind', '풍력', '#81d4fa'], ['essOut', '배터리 방전', '#26c6da'], ['imp', '수입', '#ab47bc'],
];
function drawReportChart(report) {
  const canvas = document.getElementById('report-chart');
  if (!canvas || !report || !report.hours) return;
  const H = report.hours;
  const keep = (h) => (h.shed > 0 && h.demand > 0 ? Math.max(0, 1 - h.shed / h.demand) : 1);
  const used = REPORT_SERIES.filter((s) => H.some((h) => (h[s[0]] || 0) > 0.5));
  const wasted = H.some((h) => (h.curtail || 0) > 0.5);
  const short = H.some((h) => h.unmet > 0.5);
  const stacks = used.map((s) => ({ color: s[2], values: H.map((h) => (h[s[0]] || 0) * keep(h)) }));
  if (wasted) stacks.push({ color: 'rgba(176,190,197,0.28)', alpha: 1, values: H.map((h) => h.curtail || 0) });
  const marks = []; let firstFreq = true;
  H.forEach((h, i) => { if (h.freq) { marks.push({ h: i, text: firstFreq ? '⚡ 주파수 사고' : '' }); firstFreq = false; } });
  drawChart(canvas, {
    stacks,
    deficit: { values: H.map((h) => h.demand), count: used.length },
    lines: [{ color: '#ffffff', values: H.map((h) => h.demand), width: 2.5 }],
    right: { color: '#b39ddb', values: H.map((h) => h.smp), label: '원/kWh', dash: [5, 4] },
    marks,
    yLabel: 'MW',
  });
  const lg = document.getElementById('report-legend');
  if (lg) {
    const item = (color, name) => '<span><i style="background:' + color + '"></i>' + name + '</span>';
    lg.innerHTML = used.map((s) => item(s[2], s[1])).join('') +
      (wasted ? item('rgba(176,190,197,0.55)', '버려진 재생에너지 (한도 초과)') : '') +
      (short ? item('rgba(239,83,80,0.75)', '끊긴 전기') : '') +
      item('#ffffff', '수요 (흰 선)') + item('#b39ddb', 'SMP (점선, 오른쪽 축)');
  }
}

function renderReport(report) {
  document.getElementById('report-title').textContent = state.playerName + ' 대통령의 ' + report.year + '년 ' + report.month + '월 결산';
  const m = report.money, e = report.energy;
  // 정전 가운데 공급이 모자라서 난 것과, 공급은 충분했는데 주파수 사고로 난 것을 가름
  const freqOnly = report.freqOnlyHours || 0;
  const shortHours = Math.max(0, report.blackoutHours - freqOnly);
  const shedPct = Math.round(ECON.freqLossRatio * 100);
  const limitPct = fmt(techMods(state).inertiaLimit * 100);
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), 1);

  const evRoot = document.getElementById('report-events');
  let ev = '<span class="ev">' + report.weather.seasonName + ' · ' + report.weather.sky + ' · ' + report.weather.wind + ' · ' + (report.weather.temp + ((report.event && report.event.tempDelta) || 0)) + '℃</span><span class="ev">' + weatherEffectsText(report.weather, report.event) + '</span>';
  if (report.event) ev += '<span class="ev warn">⚠ ' + report.event.name + ': ' + report.event.desc + '</span>';
  if (shortHours > 0) ev += '<span class="ev bad">정전 ' + shortHours + '시간대 · 공급하지 못한 전력 ' + fmtMWh(Math.max(0, e.unmet - (e.unmetFreq || 0))) + '</span>';
  if (report.freqHours > 0) ev += '<span class="ev bad" title="관성 없는 전기(태양광·풍력·배터리·수입)가 한도 ' + limitPct + '%에 닿은 시간에 낮은 확률로 일어납니다. 계통 테크를 올리면 한도가 넓어지고 4단계부터는 일어나지 않습니다.">⚡ 주파수 사고 ' + report.freqHours + '시간대 · 그 시간 수요의 ' + shedPct + '%가 끊김' + (e.unmetFreq ? ' (' + fmtMWh(e.unmetFreq) + ')' : '') + '</span>';
  if (e.curtail > 0) ev += '<span class="ev warn">버려진 재생에너지 ' + fmtMWh(e.curtail) + ' (관성 없는 전기 한도 ' + limitPct + '%)</span>';
  if (e.rampShort > 0) ev += '<span class="ev bad">램프 부족 (출력을 제때 못 올림) ' + fmtMWh(e.rampShort) + '</span>';
  if (e.over > 0) ev += '<span class="ev warn">과잉 발전 ' + fmtMWh(e.over) + '</span>';
  for (const n of report.notices || []) ev += '<span class="ev warn">' + n + '</span>';
  for (const n of report.questNotices || []) ev += '<span class="ev ' + (n.startsWith('✕') || /어김|미흡|불이행/.test(n) ? 'bad' : 'good') + '">' + n + '</span>';
  evRoot.innerHTML = ev;

  drawReportChart(report);

  const row = (label, v, cls) => '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + v + '</b></div>';
  const eok = (v) => fmt(v, 1) + ' 억';

  // ---- 수입 · 지출 ----
  let left = '<h3>수입</h3>';
  left += row('전력 판매 (도매가 ' + fmt(report.avgSmp) + '원 · 소비자 요금 ' + fmt(report.avgPay !== undefined ? report.avgPay : report.avgSmp) + '원/kWh)', eok(m.energyRev));
  left += row('용량 요금', eok(m.capPay));
  left += row('세수 (전력산업기반기금)', eok(m.tax || 0));
  if (m.patent) left += row('특허·기술 수출 (R&D)', eok(m.patent), 'good');
  if (m.rec) left += row('재생에너지 보조금 (REC)', eok(m.rec));
  if (m.exportRev) left += row('전력 수출 (' + fmtMWh(e.exp) + ' · 평균 ' + fmt(m.exportRev * 1e8 / (e.exp * 1000)) + '원/kWh)', eok(m.exportRev));
  if (m.tariff > 0) left += row('요금 할증 수입 (' + tariffNow(state).name + ')', eok(m.tariff), 'good');
  left += row('수입 합계', eok(m.income), 'total');
  left += '<h3 style="margin-top:12px">지출</h3>';
  left += row('연료비' + (report.gasMult !== 1 ? ' (가스 지수 ' + fmt(report.gasMult * 100) + ')' : ''), eok(m.fuel));
  left += row('변동 운영비', eok(m.varOm));
  left += row('탄소세 (' + fmt(e.co2) + ' t)', eok(m.carbon));
  left += row('설비 고정 유지비', eok(m.om));
  left += row('회사 운영비', eok(m.overhead));
  if (m.salary) left += row('연구 인건비', eok(m.salary));
  if (m.importCost) left += row('전력 수입 (' + fmtMWh(e.imp) + ' · 평균 ' + fmt(m.importCost * 1e8 / (e.imp * 1000)) + '원/kWh)', eok(m.importCost), 'warn');
  if (m.blackoutCost) left += row('정전 보상 (' + fmtMWh(e.unmet) + ')', eok(m.blackoutCost), 'bad');
  if (m.overCost) left += row('과잉 발전 안정화', eok(m.overCost), 'warn');
  if (m.clawback) left += row('초과 이윤 환수 (투자 자본 대비 연 ' + fmt(ECON.clawRoi * 100) + '% 넘는 이익의 ' + fmt(policyMods(state).clawMax * 100) + '%)', eok(m.clawback), 'warn');
  if (m.interest) left += row('대출 이자', eok(m.interest), 'bad');
  if (m.tariff < 0) left += row('전기요금 지원금 (' + tariffNow(state).name + ')', eok(-m.tariff), 'warn');
  left += row('지출 합계', eok(m.expense), 'total');
  left += row('이번 달 손익', (m.profit >= 0 ? '+' : '') + eok(m.profit), 'total ' + (m.profit >= 0 ? 'good' : 'bad'));

  // ---- 발전량 · 계통 ----
  const g = e.gen;
  const totalGen = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind;
  let right = '<h3>발전량</h3>';
  right += row('총 수요', fmtMWh(e.demand));
  right += row('총 발전', fmtMWh(totalGen));
  const kinds = [['nuclear', '원전'], ['coal', '석탄'], ['ccgt', '복합발전'], ['gt', '가스터빈'], ['solar', '태양광'], ['wind', '풍력']];
  for (const [k, name] of kinds) {
    if (g[k] > 0) right += row('· ' + name, fmtMWh(g[k]) + ' <span class="muted">(' + fmt(g[k] / totalGen * 100) + '%)</span>');
  }
  if (e.imp) right += row('· 수입', fmtMWh(e.imp));
  if (e.exp) right += row('· 수출', fmtMWh(e.exp));
  if (e.essOut || e.essIn) right += row('· 배터리 방전 / 충전', fmtMWh(e.essOut) + ' / ' + fmtMWh(e.essIn));
  if (e.curtail) right += row('· 버려진 재생에너지 (한도 초과로 출력 제한)', fmtMWh(e.curtail), 'warn');
  right += '<h3 style="margin-top:12px">계통</h3>';
  right += row('탄소 배출', fmt(e.co2) + ' t', e.co2 === 0 ? 'good' : '');
  right += row('전기가 끊긴 시간대' + (report.freqHours ? ' (공급 부족 ' + shortHours + ' · 주파수 사고 ' + report.freqHours + ')' : ''), report.blackoutHours + ' / 24', report.blackoutHours ? 'bad' : 'good');
  right += row('관성 없는 전기 최대 비중 / 한도', fmt(report.maxRenShare * 100) + '% / ' + limitPct + '%', report.maxRenShare >= techMods(state).inertiaLimit - 0.001 && !techMods(state).gridForming ? 'bad' : '');
  if (report.tempFactor !== 1) right += row('외기온에 따른 가스 발전 출력', (report.tempFactor >= 1 ? '+' : '') + fmt((report.tempFactor - 1) * 100, 1) + '%');
  if (report.freqHours > 0) right += '<div class="note">주파수 사고: 태양광·풍력·배터리·수입처럼 관성이 없는 전기가 한도(' + limitPct + '%)에 닿은 시간대에는 발전소가 넉넉해도 낮은 확률(시간대마다 ' + fmt(ECON.freqRiskAtLimit * 100) + '%)로 사고가 나서 그 시간 수요의 ' + shedPct + '%가 끊깁니다. 계통 테크를 올리면 한도가 넓어지고(1단계 80%), 4단계부터는 사고가 나지 않습니다.</div>';

  // ---- 민심: 다섯 분야 성적표 ----
  const hp = report.happiness;
  let moodRows = '';
  const hpEnd = hp ? (hp.end !== undefined ? hp.end : hp.after) : 0;
  const questD = hp ? Math.round((hpEnd - hp.after) * 10) / 10 : 0;   // 결산 뒤 목표·공약의 보상과 벌칙으로 바뀐 몫 (여론으로 남음)
  if (hp && hp.pillars) {
    for (const p of hp.pillars) {
      moodRows += '<div class="row grp"><span>' + p.icon + ' ' + p.name + '</span><b class="' + (moodCls(p) === 'mid' ? 'warn' : moodCls(p)) + '">' + fmt(p.score, 1) + ' / ' + p.max + '</b></div>';
      for (const x of p.parts) moodRows += row(x.label, p.parts.length === 1 ? fmt(x.value, 1) + '점' : moodSign(x.value), 'sub ' + (x.value < 0 ? 'bad' : p.parts.length === 1 ? '' : 'good'));
    }
    for (const x of hp.extras || []) moodRows += row(x.label, moodSign(x.value), x.value > 0 ? 'good' : 'bad');
    moodRows += row('예상 민심 (다섯 분야의 합' + ((hp.extras || []).length ? ' + 여론' : '') + ')', fmt(hp.target, 1), 'total');
    moodRows += '<h3 style="margin-top:12px">이번 달 민심</h3>';
    moodRows += row('지난달', fmt(hp.before, 1));
    moodRows += row('예상 민심 쪽으로 이동 (차이의 ' + fmt(ECON.moodPull * 100) + '%)', moodSign(hp.pull !== undefined ? hp.pull : hp.after - hp.before), (hp.pull || 0) >= 0 ? 'good' : 'bad');
    if (questD) moodRows += row('목표·공약 결과 (여론으로 남아 서서히 옅어짐)', moodSign(questD), questD > 0 ? 'good' : 'bad');
    moodRows += row('이번 달', fmt(hpEnd, 1), 'total ' + (hpEnd < 40 ? 'bad' : hpEnd >= 65 ? 'good' : ''));
    if (report.score) moodRows += row('국정운영 점수: 이번 달 민심만큼 쌓임' + (report.score.weight > 1 ? ' (11년 차부터 ' + report.score.weight + '배)' : ''), '+' + fmt(report.score.gain, 1) + '점 → ' + fmt(report.score.total) + '점');
    if (hpEnd < ECON.happinessGameOver + 15) moodRows += '<div class="row bad"><span>⚠ 민심이 ' + ECON.happinessGameOver + ' 이하가 되면 탄핵됩니다</span></div>';
  }

  // ---- 핵심 요약 (맨 위 네 칸) ----
  const card = (k, v, sub, cls) => '<div class="rh-card ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + sub + '</div></div>';
  let head = card('이번 달 손익', (m.profit >= 0 ? '+' : '−') + fmt(Math.abs(m.profit)) + '억', '수입 ' + fmt(m.income) + ' · 지출 ' + fmt(m.expense), m.profit >= 0 ? 'good' : 'bad');
  if (hp) { const dM = Math.round(hpEnd) - Math.round(hp.before); head += card('민심', fmt(hp.before) + ' → ' + fmt(hpEnd) + (dM ? ' <small class="' + (dM > 0 ? 'good' : 'bad') + '">' + (dM > 0 ? '▲' : '▼') + Math.abs(dM) + '</small>' : ''), '예상 ' + fmt(hp.target) + (questD ? ' · 목표 결과 ' + sign(questD) : ''), hpEnd < 40 ? 'bad' : hpEnd >= hp.before ? 'good' : ''); }
  head += shortHours > 0 ? card('전력 공급', '정전 ' + shortHours + '시간', '공급 부족' + (report.freqHours ? ' · 주파수 사고 ' + report.freqHours + '시간' : ''), 'bad')
    : report.freqHours > 0 ? card('전력 공급', '주파수 사고 ' + report.freqHours + '시간', '발전소는 충분 · 관성 부족 (한도 ' + limitPct + '%)', 'bad')
    : card('전력 공급', '정전 없음', '탄소 ' + fmt(e.co2) + ' t', 'good');
  if (report.score) head += card('국정운영 점수 (민심만큼 쌓임)', '+' + fmt(report.score.gain, 1), '누적 ' + fmt(report.score.total) + '점' + (report.score.weight > 1 ? ' · ' + report.score.weight + '배 구간' : ''), 'gold');
  const hd = document.getElementById('report-head'); if (hd) hd.innerHTML = head;

  // 민심 성적표: 다섯 분야의 점수 막대 (낱낱의 내역은 막대에 마우스를 올리거나 아래 "민심 성적표 자세히"에서)
  const md = document.getElementById('report-mood');
  if (md) md.innerHTML = hp && hp.pillars ? '<div class="mood-eq">예상 민심 <b>' + fmt(hp.target) + '</b> <small>= 다섯 분야의 합' + ((hp.extras || []).length ? ' + 여론' : '') + ' · 민심은 매달 이 값 쪽으로 움직임</small></div>' + moodBarsHtml(hp.pillars, hp.extras, moodPrevOf(state)) : '';

  // 세부 내역은 접어 두고, 필요할 때 펼쳐 봄 (한 번 펼친 칸은 다음 달에도 펼쳐진 채로)
  setHtmlKeepOpen(document.getElementById('report-body'),
    '<details class="rsec"><summary>수입 · 지출 내역 <span>손익 ' + (m.profit >= 0 ? '+' : '−') + fmt(Math.abs(m.profit), 1) + '억</span></summary><div class="rbody one">' + left + '</div></details>' +
    '<details class="rsec"><summary>발전량 · 계통 <span>총 발전 ' + fmtMWh(totalGen) + '</span></summary><div class="rbody one">' + right + '</div></details>' +
    (moodRows ? '<details class="rsec"><summary>민심 성적표 자세히 <span>예상 ' + fmt(hp.target) + '</span></summary><div class="rbody one">' + moodRows + '</div></details>' : ''));
}

// ------------------------------------------------------------
// 24시간 그래프
// ------------------------------------------------------------
// ------------------------------------------------------------
// 사건 창과 목표 패널
// ------------------------------------------------------------
// 선택지의 효과 문구("−400억 · 민심 +3 · …")를 조각조각 칩으로 보여 줌. 돈·민심의 +/−는 색으로 구분
function fxChips(text) {
  text = String(text == null ? '' : text);
  if (/<\w/.test(text)) return '<span>' + text + '</span>';   // 이미 꾸며진 설명 (정책 선택지)
  return '<span class="fx">' + text.split(' · ').map((p) => {
    const t = p.trim();
    const cls = (/^−\s?[\d,.]+억/.test(t) || /(민심|민심) −/.test(t)) ? 'bad' : (/^\+\s?[\d,.]+억/.test(t) || /(민심|민심) \+/.test(t)) ? 'good' : '';
    return '<i' + (cls ? ' class="' + cls + '"' : '') + '>' + t + '</i>';
  }).join('') + '</span>';
}
function renderDecision(state) {
  const pd = state.pendingDecision;
  if (!pd) return;
  const def = decisionById(pd.id);
  document.getElementById('decision-icon').textContent = def.icon;
  document.getElementById('decision-name').textContent = def.name;
  document.getElementById('decision-desc').textContent = (typeof EVENT_BRIEF !== 'undefined' && EVENT_BRIEF[def.id]) || (typeof def.desc === 'function' ? def.desc(state) : def.desc);
  document.querySelector('#decision .modal').classList.toggle('cards', !!def.cards);
  document.getElementById('decision-choices').classList.remove('has-pick');
  document.getElementById('decision-choices').innerHTML = def.cards ? decisionCardsHtml(def) : def.choices.map((c, i) => (c.show && !c.show(state)) ? '' :
    '<button class="choice" data-choice="' + i + '"' + (c.cost && state.money < c.cost(state) ? ' disabled title="자금이 부족합니다"' : '') + '><strong>' + c.label + (c.cost && state.money < c.cost(state) ? ' <small>(자금 부족)</small>' : '') + '</strong>' + fxChips(typeof c.desc === 'function' ? c.desc(state) : c.desc) + '</button>').join('');
  document.getElementById('decision-choices').classList.remove('hidden');
  document.getElementById('decision-result').classList.add('hidden');
  document.getElementById('decision-close').classList.add('hidden');
  document.getElementById('decision').classList.remove('hidden');
}
// 재선 공약처럼 무게 있는 결정: 큰 카드를 나란히 놓고 고르게 함
//  ① 분야 카드 → ② 그 분야의 수위 카드(현실적 · 과감 · 파격) → 아래 버튼으로 확정
let t2Theme = null;   // 고른 분야 (없으면 분야를 고르는 단계)
function decisionCardsHtml(def) {
  const vis = def.choices.map((c, i) => ({ c, i })).filter((x) => !x.c.show || x.c.show(state));
  if (!t2Theme || !vis.some((x) => x.c.theme === t2Theme)) {
    t2Theme = null;
    const themes = []; for (const x of vis) if (!themes.includes(x.c.theme)) themes.push(x.c.theme);
    return '<div class="t2-step">① 어느 분야를 약속할까요?</div>' + themes.map((k, n) => {
      const T = term2Theme(k);
      const now = T.nowText ? T.nowText(state) : T.fmtV(T.value(state, null));
      return '<button class="choice t2card" data-theme="' + k + '" style="--c:' + T.color + ';--i:' + n + '">' +
        '<span class="t2-ico">' + T.ico + '</span><strong>' + T.title + '</strong>' +
        '<span class="t2-desc">' + T.what + '</span>' +
        '<span class="t2-goal sm">' + T.targets.map(T.fmtT).join(' · ') + '</span>' +
        '<span class="t2-now">지금 · ' + now + '</span></button>';
    }).join('');
  }
  const T = term2Theme(t2Theme);
  const now = T.nowText ? T.nowText(state) : T.fmtV(T.value(state, null));
  return '<div class="t2-step"><button class="small ghost" data-back="1">← 분야 다시 고르기</button><span>② ' + T.ico + ' ' + T.title + ' · 얼마나 과감하게 약속할까요? <small class="muted">(지금 ' + now + ')</small></span></div>' +
    vis.filter((x) => x.c.theme === t2Theme).map((x, n) => {
      const d = questById(x.c.t2), L = TERM2_LEVELS[x.c.lv];
      return '<button class="choice t2card lv' + x.c.lv + '" data-choice="' + x.i + '" style="--c:' + T.color + ';--i:' + n + '">' +
        '<span class="t2-tier">' + L.name + '</span>' +
        '<span class="t2-ico">' + T.ico + '</span>' +
        '<strong>' + T.goal(T.targets[x.c.lv]) + '</strong>' +
        '<span class="t2-desc">' + T.brief(T.targets[x.c.lv]) + '</span>' +
        '<span class="t2-boost ' + (L.boost ? 'on' : '') + '">' + (L.boost ? '📣 발표 효과 · 민심 +' + L.boost + ' <small>(1년, 그 뒤 사라짐)</small>' : '발표 효과 없음') + '</span>' +
        '<span class="t2-foot"><i class="good">지키면 민심 +' + d.gain + ' <small>· 남은 임기 +' + d.kept + '</small></i><i class="bad">못 지키면 민심 −' + d.penalty.happy + ' <small>· 남은 임기 −' + d.broken + '</small></i></span>' +
        '</button>';
    }).join('') + '<div class="t2-confirm hidden"><button class="primary" data-confirm=""></button></div>';
}
function renderDecisionResult(def, choice, result) {
  document.getElementById('decision-choices').classList.add('hidden');
  const r = document.getElementById('decision-result');
  r.innerHTML = '<b>' + choice.label + '</b> · ' + result;
  r.classList.remove('hidden');
  document.getElementById('decision-close').classList.remove('hidden');
}

function renderQuests(state) {
  const el = document.getElementById('quest-list');
  if (!el || !state) return;
  const now = state.year * 12 + state.month;
  const active = (state.quests || []).filter((q) => q.status === 'active');
  const dur = (m) => (m > 24 ? Math.floor(m / 12) + '년' + (m % 12 ? ' ' + (m % 12) + '개월' : '') : m + '개월');
  let html = '';
  for (const q of active) {
    const def = questById(q.id);
    if (!def || def.pledge) continue;   // 공약은 위쪽 정책 줄 아래에 나옴
    const left = q.deadline - now + 1;
    // 한 줄 요약: 제목 · 진행 · 남은 기간. 설명·보상·벌칙은 마우스를 올리면(툴팁)
    const tip = (def.desc + '\n보상 ' + rewardText(def) + ' · 실패 시 ' + penaltyText(def)).replace(/"/g, '&quot;');
    html += '<div class="quest" title="' + tip + '"><div class="t"><span>' + def.icon + ' ' + def.title + '</span><span class="due' + (left <= 3 ? ' bad' : '') + '">' + (left <= 0 ? '이번 달 판정' : dur(left)) + '</span></div>' +
      '<div class="p"><b>' + def.progress(state, q) + '</b><span class="rw">' + rewardText(def) + '</span></div></div>';
  }
  if (!html) html = '<p class="muted" style="font-size:0.8rem">지금은 목표가 없습니다. 새 목표는 몇 달 안에 주어집니다.</p>';
  const badge = document.getElementById('goal-badge');
  if (badge) {
    const goals = active.filter((q) => { const d = questById(q.id); return d && !d.pledge; });
    const urgent = active.some((q) => { const d = questById(q.id); if (!d) return false; const left = q.deadline - now + 1; return d.pledge ? left <= 12 : left <= 3; });
    badge.textContent = goals.length; badge.classList.toggle('hidden', !goals.length); badge.classList.toggle('urgent', urgent);
  }
  setHtmlKeepOpen(el, html);
}

// ------------------------------------------------------------
// 진행 요약 (📋 버튼): 지금 상태를 짧은 글로
// ------------------------------------------------------------
function summaryText(state) {
  const c = fleetCapacities(state);
  const peak = Math.max(...state.demandCurve);
  const byType = {};
  for (const b of state.buildings) { const k = PLANTS[b.type].short; byType[k] = byType[k] || { on: 0, bld: 0, ret: 0 }; if (b.status === 'online') byType[k].on++; else if (b.status === 'building' || b.status === 'upgrading') byType[k].bld++; else byType[k].ret++; }
  const fleet = Object.keys(byType).map((k) => k + ' ' + byType[k].on + (byType[k].bld ? '(+' + byType[k].bld + ' 건설)' : '') + (byType[k].ret ? '(' + byType[k].ret + ' 정지)' : '')).join(', ');
  const r = state.lastReport;
  const pol = Object.keys(POLICIES).map((k) => POLICIES[k].icon + policyLabel(k, (state.policies || {})[k])).join(' ');
  const sc = typeof computeScore === 'function' ? computeScore(state, 'complete') : null;
  const lines = [
    '[I love power plant 진행 요약] ' + state.year + '년 ' + state.month + '월 (' + (Math.floor(yearsElapsed(state)) + 1) + '년 차, ' + (MODE_LABEL[state.mode] || state.mode) + ')',
    '자금 ' + fmt(Math.round(state.money)) + '억 · 민심 ' + fmt(state.happiness) + ' · 인구 ' + fmt(state.cities.reduce((s, x) => s + x.pop, 0)) + '만 (도시 ' + state.cities.length + ') · R&D ' + rdLevel(state) + (sc ? ' · 국정운영 점수 ' + sc.total + (state.mood && state.mood.target !== undefined ? ' · 예상 민심 ' + fmt(state.mood.target) : '') + ' · 요금 ' + tariffNow(state).name : ''),
    '최대 수요 ' + fmt(peak) + ' MW · 조절 가능 ' + fmt(c.gt + c.ccgt + c.coal + c.nuclear + c.smr) + ' MW · 재생 ' + fmt(c.solar + c.wind) + ' MW · 배터리 ' + fmt(c.ess) + ' MW · 연계선 ' + fmt(c.link) + ' MW · 공급 예비율 ' + fmt((supplyDemandRatio(state) - 1) * 100) + '%',
    '설비: ' + (fleet || '없음'),
    '테크: ' + TECH_ORDER.map((k) => (TECH_SHORT[k] || k) + ' ' + (state.tech[k] || 0) + '/' + TECH[k].tiers.length).join(' · ') + ' · 정책: ' + pol,
    r ? '지난달: 순이익 ' + fmt(Math.round(r.money.profit)) + '억 (발전 ' + fmt(Math.round(r.money.energyRev)) + ' 연료 ' + fmt(Math.round(r.money.fuel)) + ' 탄소세 ' + fmt(Math.round(r.money.carbon)) + ' 수출 ' + fmt(Math.round(r.money.exportRev)) + ') · 정전 ' + r.blackoutHours + 'h · 배출 ' + fmt(Math.round(r.energy.co2)) + ' t (원단위 ' + reportIntensity(r).toFixed(2) + ', 기준 ' + intensityTarget(state).toFixed(2) + ') · SMP ' + fmt(r.hours.reduce((s, h) => s + h.smp, 0) / 24) + '원 · 출력제한 ' + fmtMWh(r.energy.curtail) + ' · 민심 분야 ' + (r.happiness.pillars || []).map((p) => p.name + ' ' + p.score + '/' + p.max).join(', ') : '지난달 결산 없음',
    '목표: ' + ((state.quests || []).filter((q) => q.status === 'active').map((q) => questById(q.id).title).join(', ') || '없음') + ' · 진행 중 효과: ' + (effectsNow(state).list.map((e) => e.name + '(' + e.left + '개월)').join(', ') || '없음'),
  ];
  return lines.filter(Boolean).join('\n');
}

// ------------------------------------------------------------
// 엔딩 화면: 요약 카드 + 진행 흐름 그래프 + 랭킹
// ------------------------------------------------------------
const MODE_LABEL = { normal: '일반 20년', free: '무한(구)', netzero: '탄소중립' };
const REASON_LABEL = { complete: '완주 🎉', netzero: '달성 🎉', impeached: '탄핵', election: '재선 실패', bankrupt: '국가 부도', timeout: '기한 만료', resigned: '자진 사퇴' };

function renderEnding(state, s) {
  const yrs = Math.floor(s.years), mos = Math.round((s.years - yrs) * 12);
  const cards = [
    ['재임 기간', yrs + '년 ' + mos + '개월', (state.startYear || ECON.startYear) + '년 ' + (state.startMonth || ECON.startMonth) + '월 ~ ' + s.endYear + '년 ' + s.endMonth + '월'],
    ['평균 민심', fmt(s.avgHappy, 1), '집권 기간 전체 평균'],
    ['최종 자금', fmt(s.money) + '억', s.money < 0 ? '부채' : ''],
    ['누적 탄소 배출', fmt(Math.round(s.co2Total / 1000)) + '천 t', ''],
    ['누적 정전', s.blackoutTotal + '시간대', ''],
  ];
  const scoreCard = '<div class="card score-card"><div class="k">🏆 국정운영 점수 (1,000점 만점 · 20년 동안 쌓은 민심)</div><div class="v">' + fmt(s.score) + '점</div>' + scoreBreakdownHtml(s) + '</div>';
  document.getElementById('ending-stats').innerHTML = scoreCard + cards.map((c) =>
    '<div class="card"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div><div class="s">' + c[2] + '</div></div>').join('');

  const h = state.history;
  const years = h.map((x) => x.year + (x.month - 1) / 12);
  drawSeries(document.getElementById('traj-1'), {
    x: years,
    left: [{ values: h.map((x) => x.money !== undefined ? x.money : 0), color: '#ffd600', width: 2 }],
    right: [{ values: h.map((x) => x.happy !== undefined ? x.happy : 0), color: '#66bb6a', width: 2 }],
    rightMax: 100, leftLabel: '억', rightLabel: '민심',
  });
  drawSeries(document.getElementById('traj-2'), {
    x: years,
    left: [{ values: h.map((x) => x.co2 / 1000), color: '#ef5350', width: 2 }],
    right: [
      { values: h.map((x) => (x.ren || 0) * 100), color: '#81d4fa', width: 2 },
      { values: h.map((x) => (x.nuc || 0) * 100), color: '#f06292', width: 2 },
    ],
    rightMax: 100, leftLabel: '천 t', rightLabel: '%',
  });
  // 전기값과 탄소 원단위·기준선: 민심이 왜 흔들렸는지(요금), 기준을 언제부터 넘겼는지(탄소)
  const intenMax = Math.max(0.5, ...h.map((x) => x.inten || 0)) * 1.1;
  drawSeries(document.getElementById('traj-3'), {
    x: years,
    left: [{ values: h.map((x) => x.smp || 0), color: '#ce93d8', width: 2 }],
    right: [
      { values: h.map((x) => x.inten !== undefined ? x.inten : NaN), color: '#ef9a9a', width: 2 },
      { values: h.map((x) => (x.tgt !== null && x.tgt !== undefined) ? x.tgt : NaN), color: 'rgba(255,255,255,0.7)', width: 1.5, dash: [5, 4] },
    ],
    rightMax: intenMax, rightFmt: (v) => v.toFixed(2), leftLabel: '원/kWh', rightLabel: 't/MWh',
  });

  document.getElementById('ending-analysis').innerHTML = analyzeEnding(state, s).map((l) => '<div>' + l + '</div>').join('');
  renderEndingEvents(state, document.querySelector('.ev-filter button.on') ? document.querySelector('.ev-filter button.on').dataset.evf : 'major');

  document.getElementById('rank-name').value = s.name || '';
  renderEndingRank(s);
}

// 이벤트 기록: '주요만'은 정책 결정·첫 설비·새 도시·연구 성공·사건 선택만, '전체'는 목표·연구소 규모까지 전부
const EV_MAJOR = /정책|첫 |새 도시|연구 성공|→|완공|탄핵|부도|위기/;
const EV_MINOR = /새 목표|목표 달성|연구소 규모/;
function renderEndingEvents(state, mode) {
  const all = state.milestones || [];
  const evs = mode === 'all' ? all : all.filter((e) => !e.minor && EV_MAJOR.test(e.text) && !EV_MINOR.test(e.text));   // 화제 카드(minor)는 '전체'에서만
  document.getElementById('ending-events').innerHTML = evs.length
    ? evs.map((e) => '<div class="ev"><span class="d">' + e.year + '년 ' + e.month + '월</span><span>' + e.text + '</span></div>').join('')
    : '<p class="muted" style="margin:4px 0">기록된 이벤트가 없습니다.</p>';
  for (const b of document.querySelectorAll('.ev-filter button')) b.classList.toggle('on', b.dataset.evf === mode);
}
document.addEventListener('click', (e) => { const b = e.target.closest('.ev-filter button'); if (b && typeof state === 'object' && state) renderEndingEvents(state, b.dataset.evf); });

// 민심 요인 이름 (기록에는 짧은 키로 저장됨)
const MOOD_LABEL = { reliab: '전력 안정', price: '전기 요금', clean: '공기·탄소', economy: '경제·일자리', crowd: '도시 과밀', nuisance: '기피 시설', nukes: '원전 밀집', land: '국토 사용', tech: '연구', gas: '가스 의존', export: '전력 수출', soft: '높아진 눈높이', campaign: '공약 기대감', accident: '원전 사고', rd: '연구소', policy: '정책 노선', pledge: '정책 공약', cities: '새 도시', tariff: '요금 조정' };
// 점수 내역: 1~10년 차와 11~20년 차에 쌓은 점수, 그리고 임기 동안 민심을 올리고 깎은 요인의 평균
function scoreBreakdownHtml(s) {
  const p = s.scoreParts || {}, d = s.scoreDetail || {};
  const bar = (label, val, max, sub) => '<div class="sb"><div class="l"><span>' + label + '</span><b>' + fmt(val) + ' / ' + fmt(max) + '</b></div><div class="bar"><i style="width:' + clamp(100 * val / Math.max(1, max), 0, 100) + '%"></i></div><div class="s">' + sub + '</div></div>';
  const avg = (v) => (v === null || v === undefined ? null : fmt(v, 1));
  let html = '<div class="score-bars">' +
    bar('1~10년 차', p.early || 0, p.earlyMax || 333, avg(d.avgEarly) !== null ? '평균 민심 ' + avg(d.avgEarly) : '-') +
    bar('11~20년 차 <small>한 달이 ' + ECON.scoreLateWeight + '배</small>', p.late || 0, p.lateMax || 667, avg(d.avgLate) !== null ? '평균 민심 ' + avg(d.avgLate) : '여기까지 가지 못했습니다') + '</div>';
  const f = d.factors || {};
  // 분야별 임기 평균 (각 20점 만점)
  const pl = (typeof MOOD_PILLARS !== 'undefined' ? MOOD_PILLARS : []).filter((p) => f[p.key] !== undefined && f.power !== undefined);
  if (pl.length) html += '<div class="mood-avg"><span class="k">분야별 임기 평균 (각 ' + ECON.moodPillarMax + '점)</span>' + pl.map((p) => '<span class="' + (f[p.key] >= ECON.moodPillarMax * 0.75 ? 'good' : f[p.key] < ECON.moodPillarMax * 0.45 ? 'bad' : '') + '">' + p.icon + ' ' + p.name + ' ' + fmt(f[p.key], 1) + '</span>').join('') + '</div>';
  return html;
}

// 엔딩 원인 분석: 한두 줄로 "왜 이렇게 끝났는지"
const HAPPY_CAUSE = {
  power:  ['정전 (전력 공급 분야)', '정전이 난 달에는 전력 공급 점수가 크게 깎이고, 정전 없는 달마다 ' + ECON.moodPowerRecover + '점씩 돌아옵니다. 한 해 최대 수요보다 10~20% 넉넉한 조절 전원을 미리 지어 두고, 석탄·원자력만으로 채우지 말고 복합발전이나 배터리를 섞으세요.'],
  env:    ['탄소 배출 (환경 분야)', '환경 점수는 전기를 만들 때 나오는 탄소가 0에 가까울수록 높습니다. 화력은 테크를 올려도 탄소 기준을 넘기 쉽습니다. 태양광·풍력·원자력 같은 무탄소 전원을 섞으세요.'],
  city:   ['도시·생활 분야', '인구가 늘면 도시가 빽빽해집니다. 새 도시를 세워 주거 여유를 지키고, 기피 시설(석탄·풍력·원전)은 도시에서 멀리 두세요. 남는 전기를 수출하면 점수가 더 오릅니다.'],
  future: ['연구와 공약 (미래·신뢰 분야)', '국민의 기대는 해마다 올라갑니다. 내 노선의 테크와 계통 테크를 꾸준히 올리고, 정책을 고를 때 한 약속을 기한 안에 지키세요.'],
  'nuisance:nuclear': ['도시 근처 원전에 대한 반발', '원전은 도시에서 멀리(안전성 설계 후 4칸 이상) 떨어뜨려 지으세요.'],
  'nuisance:wind':    ['도시 근처 풍력 소음', '풍력은 도시에서 4칸 이상 떨어진 해안이나 바다에 지으세요.'],
  'nuisance:coal':    ['석탄 매연', '석탄은 도시에서 5칸 이상 떨어뜨려 지으세요.'],
  crowd:     ['도시 과밀', '도시 탭에서 새 도시를 세워 인구를 나누면 바로 풀립니다.'],
  price:     ['비싼 전기 요금 (전기 요금 분야)', '국민이 기대하는 전기값은 해마다 내려갑니다. 가스만 쓰면 도매가를 그대로 내지만, 원전·석탄·재생 비중이 클수록 소비자 요금이 도매가보다 싸집니다. 설비를 너무 많이 지어도 남는 설비의 유지비가 요금에 얹힙니다. 연료비를 줄이는 테크와 요금 지원도 도움이 됩니다.'],
  clean:     ['탄소 배출', '화력은 테크를 올려도 탄소가 국민의 기대 수준을 넘기 쉽습니다. 탄소 감축 테크를 연구하면서 태양광·풍력·원자력 같은 무탄소 전원을 섞으세요.'],
  reliab:    ['정전', '정전이 난 달에는 전력 공급 점수가 크게 깎이고, 정전 없는 달마다 ' + ECON.moodPowerRecover + '점씩 돌아옵니다. 최대 수요보다 10~20% 넉넉한 조절 전원을 미리 지어 두세요.'],
  economy:   ['경기 침체', '전기가 넉넉해야 사람과 공장이 들어옵니다. 조절 전원 여유를 20% 넘게 두면 인구가 더 빨리 늡니다.'],
  accident:  ['원전 중대 사고', '사고의 상처는 임기 끝까지 남습니다.'],
  gas:       ['가스 의존', '가스 발전에 너무 기대면 겨울에는 난방용 가스가 모자라고, 가스값이 뛸 때는 부담이 그대로 돌아옵니다. 석탄·원자력·태양광·풍력을 섞어 가스 발전 비중을 절반 가까이로 낮추세요.'],
  tech:      ['뒤처진 연구', '국민의 기대는 해마다 올라갑니다. 내 노선의 테크(화력은 복합발전·석탄, 재생에너지는 태양광·풍력, 원자력은 원자력)와 계통 테크를 꾸준히 올리세요. 트리가 둘인 노선은 두 설비를 모두 지어야 온전히 반영됩니다.'],
  'pledge:term2':    ['재선 공약 불이행', '선거 전에 약속한 국정 과제를 18년 차 말까지 지키지 못했습니다. 재선 공약은 1년 평균으로 판정하니, 발표한 때부터 그 방향으로 설비와 테크를 몰아야 합니다. 과감한 약속일수록 못 지켰을 때 타격이 큽니다.'],
  'pledge:energy':   ['에너지 정책 공약 불이행', '정책을 고를 때 한 약속을 점검·평가 때 지키지 못했습니다. 점검형은 4년마다, 달성형은 18년 차 말에 보니 정책 탭의 막대를 임기 후반까지 챙기세요.'],
  'pledge:market':   ['전력시장 정책 공약 불이행', '정책을 고를 때 한 약속을 점검·평가 때 지키지 못했습니다. 점검형은 4년마다, 달성형은 18년 차 말에 보니 정책 탭의 막대를 임기 후반까지 챙기세요.'],
  'pledge:industry': ['산업 정책 공약 불이행', '정책을 고를 때 한 약속을 점검·평가 때 지키지 못했습니다. 점검형은 4년마다, 달성형은 18년 차 말에 보니 정책 탭의 막대를 임기 후반까지 챙기세요.'],
  'pledge:rd':       ['R&D 정책 공약 불이행', '정책을 고를 때 한 약속을 점검·평가 때 지키지 못했습니다. 점검형은 4년마다, 달성형은 18년 차 말에 보니 정책 탭의 막대를 임기 후반까지 챙기세요.'],
  nukes:     ['원전 밀집 불안', '대형 원전은 ' + (ECON.moodNukeFree + 1) + '기째부터, SMR은 ' + (ECON.moodSmrFree + 1) + '기째부터 불안이 커집니다. 친원전 노선이면 30% 줄어듭니다.'],
  land:      ['태양광·풍력의 국토 잠식', '땅을 너무 많이 차지하면 불만이 생깁니다. 테크로 한 기당 출력을 키우거나, 풍력을 바다 위로 보내거나, 재생에너지 중심 노선으로 절반을 줄이세요.'],
  tariff:    ['요금 할증', '요금 할증은 돈이 급할 때만 쓰고, 여유가 생기면 표준이나 지원으로 돌리세요.'],
  'policy:market':   ['시장 자유화 노선', '돈은 더 벌지만 민심이 깎입니다. 번 돈을 요금 지원이나 설비에 돌려 메워야 합니다.'],
  'policy:energy':   ['에너지 정책 노선', '고른 노선의 설비를 싸게 짓는 대신 민심이 조금 깎입니다.'],
  'policy:industry': ['제조업 육성 노선', '수요가 빨리 느는 대신 민심이 조금 깎입니다.'],
  intensity: ['탄소 배출 기준 초과', '가스·석탄만으로는 기준을 못 맞춥니다. R&D → 원자력·SMR·재생에너지로 전환해야 합니다.'],
  co2:       ['과다한 탄소 배출', '석탄 비중을 줄이거나 무탄소 전원을 늘리세요.'],
  smp:       ['비싼 전기 요금', '연료비가 싼 기저 전원(원전·석탄)이나 재생에너지를 늘리면 SMP가 내려갑니다.'],
  blackout:  ['정전', '최대 수요보다 10~20% 넉넉한 원전·화력 같은 조절 발전 설비를 미리 지어 두세요. 설비 수명도 확인하세요.'],
  freq:      ['주파수 사고', '관성 없는 전기(태양광·풍력·배터리)가 주파수 안정도 한도를 넘었습니다. 계통 테크를 올리거나 복합발전·석탄·원자력처럼 터빈이 도는 발전기를 함께 돌리세요.'],
};
function analyzeEnding(state, s) {
  const h = state.history;
  if (!h.length) return [];
  const lines = [];
  const recent = h.slice(-36);
  const first = h.slice(0, 12), last = h.slice(-12);
  const avg = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0) / Math.max(1, arr.length);

  if (s.reason === 'impeached' || s.reason === 'election') {
    const neg = {};
    for (const x of recent) for (const k in (x.hneg || {})) neg[k] = (neg[k] || 0) + x.hneg[k];
    const pkeys = ['power', 'price', 'env', 'city', 'future'];   // 분야별로 만점에서 잃은 점수
    const ranked = Object.entries(neg).filter(([k]) => pkeys.includes(k)).sort((a, b) => a[1] - b[1]).filter(([k]) => HAPPY_CAUSE[k]);
    if (ranked.length) {
      const total = ranked.reduce((a, [, v]) => a + v, 0);
      const top = ranked.slice(0, 2).map(([k, v]) => HAPPY_CAUSE[k][0] + ' (' + Math.round(v / total * 100) + '%)');
      lines.push('<span class="k">주요 원인</span>최근 3년 동안 점수를 가장 많이 잃은 분야는 ' + top.join(', ') + '이었습니다.');
      lines.push('<span class="k">조언</span>' + HAPPY_CAUSE[ranked[0][0]][1]);
    } else lines.push('<span class="k">주요 원인</span>민심이 회복될 틈 없이 떨어졌습니다.');
  } else if (s.reason === 'resigned') {
    lines.push('<span class="k">주요 원인</span>임기 도중 스스로 물러났습니다. 점수는 물러날 때까지 쌓은 만큼입니다.');
  } else if (s.reason === 'bankrupt') {
    const r24 = h.slice(-24);
    const profit = avg(r24, 'profit');
    if (profit < 0) {
      const exp = { 연료비: avg(r24, 'fuel'), 탄소세: avg(r24, 'carbon'), '정전 비용': avg(r24, 'blk'), '과잉 발전 비용': avg(r24, 'over'), '수입 전력 비용': avg(r24, 'imp') };
      const big = Object.entries(exp).sort((a, b) => b[1] - a[1])[0];
      lines.push('<span class="k">주요 원인</span>최근 2년 동안 매달 평균 ' + fmt(-profit) + '억 원 적자였습니다. 가장 큰 지출은 ' + big[0] + '(월 ' + fmt(big[1]) + '억)입니다.');
      lines.push('<span class="k">조언</span>' + (big[0] === '정전 비용' ? '설비가 부족합니다. 수요보다 넉넉히 지으세요.' : big[0] === '과잉 발전 비용' ? '출력을 못 줄이는 원전·석탄이 야간 수요보다 큽니다. 기저 전원은 최소 수요만큼만 지으세요.' : '수입보다 지출이 큽니다. 연료비가 싼 전원으로 바꾸거나 연구 지출을 줄이세요.'));
    } else {
      lines.push('<span class="k">주요 원인</span>운영 자체는 흑자(월 평균 ' + fmt(profit) + '억)였지만, 건설·연구 투자에 수입보다 많은 돈을 써서 부채가 쌓였습니다.');
      lines.push('<span class="k">조언</span>큰 설비는 자금을 모아 한 번에 짓고, 연구는 흑자 범위 안에서 하세요.');
    }
  } else {
    // 완주
    const co2Cut = avg(first, 'co2') > 0 ? 1 - avg(last, 'co2') / avg(first, 'co2') : 0;
    const mix = [];
    if (avg(last, 'nuc') > 0.3) mix.push('원자력 ' + fmt(avg(last, 'nuc') * 100) + '%');
    if (avg(last, 'ren') > 0.2) mix.push('재생에너지 ' + fmt(avg(last, 'ren') * 100) + '%');
    const inten0 = avg(first, 'inten'), inten1 = avg(last, 'inten');
    const intenCut = inten0 > 0 ? 1 - inten1 / inten0 : 0;
    lines.push('<span class="k">총평</span>평균 민심 ' + fmt(s.avgHappy, 1) + ', 발전량당 탄소(원단위)는 첫해 ' + inten0.toFixed(2) + ' → 마지막 해 ' + inten1.toFixed(2) + ' t/MWh (' + (intenCut >= 0 ? '−' + fmt(intenCut * 100) + '%' : '+' + fmt(-intenCut * 100) + '%') + ')' +
      (co2Cut >= 0 ? ', 총배출량은 ' + fmt(co2Cut * 100) + '% 줄었습니다' : ', 총배출량은 나라가 커져 ' + fmt(-co2Cut * 100) + '% 늘었습니다') +
      (mix.length ? '. 마지막 해 발전 비중은 ' + mix.join(' · ') + '입니다.' : '.'));
    const minH = h.reduce((a, x) => x.happy < a.happy ? x : a, h[0]);
    const worst = {};
    for (const x of h) for (const k in (x.hneg || {})) worst[k] = (worst[k] || 0) + x.hneg[k];
    const w = Object.entries(worst).filter(([k]) => ['power', 'price', 'env', 'city', 'future'].includes(k)).sort((a, b) => a[1] - b[1]).filter(([k]) => HAPPY_CAUSE[k])[0];
    lines.push('<span class="k">고비</span>민심이 가장 낮았던 때는 ' + minH.year + '년 ' + minH.month + '월(' + fmt(minH.happy) + ')이었고' + (w ? ', 가장 자주 발목을 잡은 것은 ' + HAPPY_CAUSE[w[0]][0] + '이었습니다.' : '.'));
  }
  return lines;
}

function renderEndingRank(s) {
  const btn = document.getElementById('rank-register');
  const status = document.getElementById('rank-status');
  const done = !!s.registeredId;
  btn.disabled = done;
  status.textContent = done ? '등록되었습니다' : '등록하지 않아도 됩니다';
  const box = document.getElementById('ending-rank-list');
  // 무한 모드로 끝났으면 재임 기간 탭을 기본으로
  if (!box.dataset.tab) box.dataset.tab = 'score';
  renderRankView(box, { deletable: true, highlight: s.registeredId || null, limit: 10 });
}

// 랭킹 화면: 종류 탭 + 표. box.dataset.tab 에 현재 탭을 기억
function renderRankView(box, opts) {
  opts = opts || {};
  box.classList.add('rank-view');
  const tabKey = box.dataset.tab || RANK_TABS[0].key;
  box.dataset.highlight = opts.highlight || '';
  box.dataset.limit = opts.limit || '';
  const all = typeof allRankings === 'function' ? allRankings() : loadRankings();   // 게임에 들어 있는 기본 기록 + 내 기록
  let list = rankSorted(all, tabKey);
  if (opts.limit) list = list.slice(0, opts.limit);
  const tab = RANK_TABS.find((t) => t.key === tabKey) || RANK_TABS[0];

  let html = '<div class="rank-tabs">' + (RANK_TABS.length > 1 ? RANK_TABS.map((t) =>
    '<button class="small' + (t.key === tabKey ? ' active' : '') + '" data-rank-tab="' + t.key + '">' + t.label + '</button>').join('') : '<b>' + RANK_TABS[0].label + '</b>') +
    '<span class="muted">' + tab.desc + '</span></div>';
  if (!list.length) {
    html += '<p class="muted" style="font-size:0.8rem">' + (tabKey === 'years' ? '무한 모드 기록이 아직 없습니다.' : '아직 등록된 기록이 없습니다.') + '</p>';
    box.innerHTML = html; return;
  }
  const mainCol = { score: '종합 점수', money: '최종 자금', happy: '평균 민심', years: '재임 기간' }[tabKey];
  html += '<table class="rank-table"><tr><th>#</th><th>이름</th><th>모드</th><th>결과</th><th class="main">' + mainCol + '</th>' +
    (tabKey !== 'years' ? '<th>재임</th>' : '') + (tabKey !== 'happy' ? '<th>평균 민심</th>' : '') + (tabKey !== 'money' ? '<th>최종 자금</th>' : '') +
    '<th>날짜</th><th>지도·기록</th>' + (opts.deletable ? '<th></th>' : '') + '</tr>';
  list.forEach((r, i) => {
    const main = tabKey === 'score' ? fmt(r.score || 0) + '점' : tabKey === 'money' ? fmt(r.money) + '억' : tabKey === 'happy' ? fmt(r.avgHappy, 1) : fmt(r.years, 1) + '년';
    html += '<tr' + (opts.highlight && r.id === opts.highlight ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + escapeHtml(r.name) + '</td><td>' + (MODE_LABEL[r.mode] || r.mode) + '</td><td>' + (REASON_LABEL[r.reason] || r.reason) + '</td>' +
      '<td class="main"><b>' + main + '</b></td>' +
      (tabKey !== 'years' ? '<td>' + fmt(r.years, 1) + '년</td>' : '') + (tabKey !== 'happy' ? '<td>' + fmt(r.avgHappy, 1) + '</td>' : '') + (tabKey !== 'money' ? '<td>' + fmt(r.money) + '억</td>' : '') +
      '<td>' + (r.date || '') + '</td>' +
      '<td><button class="small" data-rank-detail="' + r.id + '">상세</button></td>' +
      (opts.deletable ? (r.seed ? '<td class="muted">기본 기록</td>' : '<td><button class="small del" data-rank-del="' + r.id + '">삭제</button></td>') : '') + '</tr>';
  });
  box.innerHTML = html + '</table>';
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 시간 흐름 선 그래프 (왼쪽·오른쪽 축)
function drawSeries(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padL = 60, padR = 48, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);
  const n = opts.x.length;
  if (n < 2) { ctx.fillStyle = '#8a8c99'; ctx.font = '12px system-ui'; ctx.fillText('기록이 부족합니다', padL, H / 2); return; }
  const x0 = opts.x[0], x1 = opts.x[n - 1];
  const xOf = (v) => padL + (v - x0) / (x1 - x0) * plotW;
  let lMin = 0, lMax = 1;
  for (const s of opts.left || []) for (const v of s.values) { if (!isFinite(v)) continue; lMax = Math.max(lMax, v); lMin = Math.min(lMin, v); }
  // 왼쪽 축 눈금: 1·2·5 단위로 딱 떨어지게 (0선 위로 4칸), 음수 구간은 0선 아래로만 늘림
  const niceStep = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, v)))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const lStep = niceStep(lMax * 1.05 / 4); lMax = lStep * 4; lMin = lMin < 0 ? lMin * 1.08 : 0;
  const rMax = opts.rightMax || 100;
  const rFmt = opts.rightFmt || ((v) => fmt(Math.round(v)));
  const yL = (v) => padT + plotH - (v - lMin) / (lMax - lMin) * plotH;
  const yR = (v) => padT + plotH - Math.min(v, rMax) / rMax * plotH;

  ctx.font = '11px system-ui, sans-serif';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#8a8c99';
  for (let i = 0; i <= 4; i++) {
    const v = lStep * i, y = yL(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(Math.round(v)), padL - 6, y);
    ctx.textAlign = 'left'; ctx.fillText(rFmt(rMax / 4 * i), W - padR + 6, yR(rMax / 4 * i));
  }
  if (lMin < 0) { const y = yL(0); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const span = x1 - x0, step = span > 30 ? 10 : span > 12 ? 5 : span > 4 ? 2 : 1;
  for (let y = Math.ceil(x0); y <= x1; y++) if (y % step === 0) ctx.fillText(y + '년', xOf(y), padT + plotH + 6);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(opts.leftLabel || '', padL + 4, padT + 2);
  ctx.textAlign = 'right'; ctx.fillText(opts.rightLabel || '', W - padR - 4, padT + 2);

  const draw = (s, yOf) => {
    ctx.beginPath();
    let pen = false;
    s.values.forEach((v, i) => { if (!isFinite(v)) { pen = false; return; } const px = xOf(opts.x[i]), py = yOf(v); pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; });
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  for (const s of opts.left || []) draw(s, yL);
  for (const s of opts.right || []) draw(s, yR);
}

function drawChart(canvas, opts) {
  const ctx = canvas.getContext('2d');
  // 화면에 보이는 크기(CSS px) 기준으로 그려서 글씨가 작아지지 않게 하고, 고해상도 화면에서도 선명하게
  const cssW = canvas.clientWidth;
  if (cssW > 0) {
    // 가로세로 비율: 지정이 없으면 HTML에 적힌 처음 크기에서 한 번만 구해 기억해 둠.
    //  (아래에서 canvas.width/height를 바꾸면 그 속성도 같이 바뀜. 매번 속성에서 다시 구하면, 스크롤 막대 자리만큼 높이를 더하는 보정이
    //   그릴 때마다 비율에 쌓여서 결산 그래프가 끝없이 길어졌음)
    if (!opts.aspect && !canvas.dataset.aspect) canvas.dataset.aspect = (parseInt(canvas.getAttribute('height'), 10) / parseInt(canvas.getAttribute('width'), 10)) || 0.4;
    const aspect = opts.aspect || parseFloat(canvas.dataset.aspect) || 0.4;
    const dpr = window.devicePixelRatio || 1;
    // 높이는 "스크롤 막대가 없을 때의 폭"으로 정함. 막대가 생겨 폭이 줄 때 높이까지 따라 줄면
    //  내용이 다시 다 들어가 막대가 사라지고 → 폭이 늘어 그래프가 커지고 → 다시 넘쳐 막대가 생기는 되풀이로 칸이 들썩임
    let gutter = 0;
    for (let el = canvas.parentElement; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') { gutter = Math.max(0, el.offsetWidth - el.clientWidth - el.clientLeft * 2); break; }
    }
    const cssH = Math.round((cssW + gutter) * aspect);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) { canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
    canvas.style.height = cssH + 'px';
    canvas.dataset.drawnW = cssW;   // 폭이 바뀌었는지 주기 확인용
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dprNow = cssW > 0 ? (window.devicePixelRatio || 1) : 1;
  const W = canvas.width / dprNow, H = canvas.height / dprNow;
  const padL = 54, padR = opts.right ? 58 : 14, padT = 22, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  let maxY = 1;
  const stackTop = new Array(24).fill(0);
  for (const s of opts.stacks || []) for (let h = 0; h < 24; h++) stackTop[h] += s.values[h];
  for (let h = 0; h < 24; h++) maxY = Math.max(maxY, stackTop[h]);
  for (const l of opts.lines || []) for (const v of l.values) maxY = Math.max(maxY, v);
  maxY *= 1.1;

  const xOf = (h) => padL + (h / 23) * plotW;
  const yOf = (v) => padT + plotH - (v / maxY) * plotH;

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#aeb0bd';
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = maxY / 4 * i, y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(fmt(Math.round(v)), padL - 8, y);
  }
  // 시간 눈금: 3시간마다 세로선, 6시간마다 글씨
  for (let h = 0; h <= 24; h += 3) {
    const x = xOf(Math.min(h, 23));
    ctx.strokeStyle = h % 6 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let h = 0; h <= 24; h += 6) ctx.fillText(h + '시', xOf(Math.min(h, 23)), padT + plotH + 8);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(opts.yLabel || '', padL + 4, padT - 6);

  const base = new Array(24).fill(0);
  for (const s of opts.stacks || []) {
    ctx.beginPath();
    for (let h = 0; h < 24; h++) ctx.lineTo(xOf(h), yOf(base[h] + s.values[h]));
    for (let h = 23; h >= 0; h--) ctx.lineTo(xOf(h), yOf(base[h]));
    ctx.closePath();
    ctx.fillStyle = s.color; ctx.globalAlpha = s.alpha !== undefined ? s.alpha : 0.9; ctx.fill(); ctx.globalAlpha = 1;
    // 띠 이름을 가장 두꺼운 시각에 적음 (띠가 충분히 두꺼울 때만)
    if (s.label) {
      // 가장 두꺼운 시각. 두께가 같으면(평평한 띠) 가운데에 가까운 쪽 → 글자가 세로축 숫자와 겹치지 않음
      let bh = 12, best = 0;
      for (let h = 0; h < 24; h++) { const th = yOf(base[h]) - yOf(base[h] + s.values[h]); if (th > best + 0.5 || (Math.abs(th - best) <= 0.5 && Math.abs(h - 11.5) < Math.abs(bh - 11.5))) { best = Math.max(best, th); bh = h; } }
      if (best >= 18) {
        ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = s.labelColor || 'rgba(0,0,0,0.75)';
        const half = ctx.measureText(s.label).width / 2 + 6;
        ctx.fillText(s.label, clamp(xOf(bh), padL + half, W - padR - half), yOf(base[bh] + s.values[bh] / 2));
      }
    }
    for (let h = 0; h < 24; h++) base[h] += s.values[h];
  }
  // 부족 구간: 수요선이 공급(쌓인 면적) 위로 올라가는 시간대를 빨갛게 칠함
  if (opts.deficit) {
    const top = new Array(24).fill(0);
    // count가 있으면 앞의 count개 띠만 공급으로 침 (그 위에 얹은 "버려진 전기" 같은 띠는 공급이 아님)
    for (const s of (opts.stacks || []).slice(0, opts.deficit.count || undefined)) for (let h = 0; h < 24; h++) top[h] += s.values[h];
    ctx.beginPath();
    let any = false;
    for (let h = 0; h < 24; h++) { const v = Math.max(opts.deficit.values[h], top[h]); if (opts.deficit.values[h] > top[h]) any = true; ctx.lineTo(xOf(h), yOf(v)); }
    for (let h = 23; h >= 0; h--) ctx.lineTo(xOf(h), yOf(top[h]));
    ctx.closePath();
    if (any) { ctx.fillStyle = opts.deficit.color || 'rgba(239,83,80,0.55)'; ctx.fill(); }
  }
  for (const l of opts.lines || []) {
    ctx.beginPath();
    for (let h = 0; h < 24; h++) ctx.lineTo(xOf(h), yOf(l.values[h]));
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width || 2.5;
    ctx.setLineDash(l.dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  // 최대 수요 시각과 값 표시
  if (opts.peakLabel) {
    const vals = opts.peakLabel.values; let hi = 0;
    for (let h = 1; h < 24; h++) if (vals[h] > vals[hi]) hi = h;
    ctx.fillStyle = opts.peakLabel.color || '#ffd600'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textBaseline = 'bottom';
    const ptxt = '최대 ' + fmt(vals[hi]) + ' MW · ' + hi + '시';
    const toLeft = xOf(hi) + 6 + ctx.measureText(ptxt).width > W - padR;   // 오른쪽에 자리가 모자라면 왼쪽에 적음 (잘리지 않게)
    ctx.textAlign = toLeft ? 'right' : 'left';
    ctx.fillText(ptxt, xOf(hi) + (toLeft ? -6 : 6), yOf(vals[hi]) - 4);
  }
  // 표시선: 특정 시각에 세로 점선과 짧은 글 (예: 주파수 사고가 난 시각)
  for (const mk of opts.marks || []) {
    const x = xOf(mk.h);
    ctx.strokeStyle = mk.color || '#ef5350'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke(); ctx.setLineDash([]);
    if (mk.text) {
      ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = mk.color || '#ef5350'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const tw = ctx.measureText(mk.text).width;
      ctx.fillText(mk.text, clamp(x + 5, padL + 2, W - padR - tw - 2), padT + 3);
    }
  }
  if (opts.right) {
    const r = opts.right;
    const maxR = Math.max.apply(null, r.values) * 1.1 || 1;
    const yR = (v) => padT + plotH - (v / maxR) * plotH;
    ctx.beginPath();
    for (let h = 0; h < 24; h++) ctx.lineTo(xOf(h), yR(r.values[h]));
    ctx.strokeStyle = r.color; ctx.lineWidth = 1.5;
    ctx.setLineDash(r.dash || []); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8a8c99'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const v = maxR / 4 * i; ctx.fillText(fmt(Math.round(v)), W - padR + 6, yR(v)); }
    ctx.textBaseline = 'top';
    ctx.fillText(r.label, W - padR + 6, 3);   // 맨 위 눈금 숫자와 겹치지 않게 그래프 위쪽 여백에
  }
}

// ------------------------------------------------------------
// 원그래프
// ------------------------------------------------------------
function drawPie(canvas, slices, unit) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = 110, cy = H / 2, R = 80, r = 48;

  if (total <= 0) {
    ctx.fillStyle = '#3a3b45';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.arc(cx, cy, r, 0, Math.PI * 2, true); ctx.fill();
    ctx.fillStyle = '#8a8c99'; ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('설비 없음', cx, cy);
    return;
  }
  let a = -Math.PI / 2;
  for (const s of slices) {
    const ang = (s.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, a, a + ang); ctx.arc(cx, cy, r, a + ang, a, true); ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = '#2a2b33'; ctx.lineWidth = 2; ctx.stroke();
    a += ang;
  }
  ctx.fillStyle = '#ececf1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText(fmt(total), cx, cy - 7);
  ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9a9cab'; ctx.fillText(unit + ' 합계', cx, cy + 14);

  const lx = 225;
  let ly = cy - (slices.length - 1) * 13;
  ctx.textAlign = 'left'; ctx.font = '14px system-ui, sans-serif';
  for (const s of slices) {
    ctx.fillStyle = s.color; ctx.fillRect(lx, ly - 6, 12, 12);
    ctx.fillStyle = '#ececf1'; ctx.fillText(s.label, lx + 20, ly);
    ctx.fillStyle = '#9a9cab'; ctx.textAlign = 'right';
    ctx.fillText(fmt(s.value) + ' ' + unit + ' (' + fmt(s.value / total * 100) + '%)', W - 16, ly);
    ctx.textAlign = 'left';
    ly += 26;
  }
}

// ------------------------------------------------------------
// 안내 메시지
// ------------------------------------------------------------
let messageTimer = null;
function showMessage(text, ms) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => el.classList.remove('show'), ms || 1800);
}

// 연구 결과 알림: 달이 넘어갈 때 지도 아래 가운데에 잠깐 뜸. 성공은 초록, 실패는 빨강. results = [{ ok, tree, name, lvl }]
function placeResearchToast() {
  const box = document.getElementById('rd-toast'), map = document.getElementById('map-wrap');
  if (!box || !map) return;
  const r = map.getBoundingClientRect();
  const mobile = document.body.classList.contains('mobile');
  const modalOpen = [...document.querySelectorAll('.overlay')].some((o) => !o.classList.contains('hidden'));
  if (r.width < 40 || r.height < 40 || (mobile && modalOpen)) {
    // 지도가 안 보이거나, 휴대폰에서 사건 창이 화면을 덮었을 때: 창의 글을 가리지 않게 화면 맨 아래 가운데
    box.style.left = '8px'; box.style.width = 'calc(100vw - 16px)'; box.style.bottom = '14px';
  } else {
    const pad = mobile ? 6 : 12;
    box.style.left = Math.round(r.left + pad) + 'px';
    box.style.width = Math.round(r.width - pad * 2) + 'px';   // 지도 폭 그대로 깔고, 알림은 그 안에서 가운데 정렬
    box.style.bottom = Math.round(window.innerHeight - r.bottom + (mobile ? 54 : 50)) + 'px';   // 지도 아래쪽 칩들 바로 위
  }
}
window.addEventListener('resize', () => { const box = document.getElementById('rd-toast'); if (box && box.children.length) placeResearchToast(); });
function showResearchToast(results) {
  const box = document.getElementById('rd-toast');
  if (!box) return;
  placeResearchToast();
  for (const r of results) {
    const el = document.createElement('div');
    el.className = 'rd-toast-item ' + (r.ok ? 'ok' : 'fail');
    const tree = TECH[r.tree] ? TECH[r.tree].name + ' ' + r.lvl + '단계 · ' : '';
    el.innerHTML = '<b>' + (r.ok ? '🔬 연구 성공' : '✕ 연구 실패') + '</b><span>' + escapeHtml(tree + r.name) + '</span>' +
      (r.ok ? '' : '<small>다음 시도 +' + fmt(TECH_PITY * 100) + '%</small>');
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300); }, 4500);
  }
}

// 기온이 수요에 주는 영향 (여름 더위 · 겨울 추위). 평년과 같거나 봄가을이면 빈 글
function tempDemandText(w, lead) {
  const dm = (w && w.demandMult) || 1;
  if (Math.abs(dm - 1) < 0.005) return '';
  const d = w.temp - w.tempNormal;
  return lead + '🌡 평년보다 ' + (d > 0 ? '+' : '−') + Math.abs(d) + '℃ → 수요 ' + (dm > 1 ? '+' : '−') + fmt(Math.abs(dm - 1) * 100, 1) + '%';
}
// 날씨가 발전원에 미치는 영향 한 줄: 태양광·풍력 이용률(이번 달 시간 평균), 가스 발전(터빈·복합) 외기온 출력 배율
function weatherEffectsText(w, ev) {
  ev = ev || {};
  const solarAvg = w.solarHourly.reduce((s, v) => s + v, 0) / 24 * (ev.solarMult || 1);
  const windAvg = w.windHourly.reduce((s, v) => s + Math.min(1, v * (ev.windMult !== undefined ? ev.windMult : 1)), 0) / 24;
  const tf = gtTempFactor(w.temp + (ev.tempDelta || 0));
  return '☀ 태양광 하루 평균 ' + fmt(solarAvg * 100) + '% (낮 최대 ' + fmt(Math.max.apply(null, w.solarHourly) * (ev.solarMult || 1) * 100) + '%) · 🌬 풍력 하루 평균 ' + fmt(windAvg * 100) + '% · 🔥 복합발전 출력 ' + (tf >= 1 ? '+' : '') + fmt((tf - 1) * 100, 1) + '%' + tempDemandText(w, ' · ');
}
// 날씨 영향을 칩 3개로 (전망 패널용)
function weatherEffectChips(w, ev) {
  ev = ev || {};
  const solarAvg = w.solarHourly.reduce((s, v) => s + v, 0) / 24 * (ev.solarMult || 1);
  const windAvg = w.windHourly.reduce((s, v) => s + Math.min(1, v * (ev.windMult !== undefined ? ev.windMult : 1)), 0) / 24;
  const tf = gtTempFactor(w.temp + (ev.tempDelta || 0));
  const solarPeak = Math.max.apply(null, w.solarHourly) * (ev.solarMult || 1);
  const chips = ['☀ 태양광 하루 평균 ' + fmt(solarAvg * 100) + '% (낮 최대 ' + fmt(solarPeak * 100) + '%)', '🌬 풍력 하루 평균 ' + fmt(windAvg * 100) + '%', '🔥 가스 발전 ' + (tf >= 1 ? '+' : '') + fmt((tf - 1) * 100, 1) + '%'];
  const td = tempDemandText(w, ''); if (td) chips.push(td);
  return chips;
}
// 이번 달 날씨 기준 태양광·풍력의 하루 평균 출력 비율 (용량 대비)
function renewAvgFactors(state) {
  const w = state.weather, ev = state.event || {};
  if (!w) return { solar: 0.18, wind: 0.3 };
  return {
    solar: w.solarHourly.reduce((s, v) => s + v, 0) / 24 * (ev.solarMult || 1),
    wind: w.windHourly.reduce((s, v) => s + Math.min(1, v * (ev.windMult !== undefined ? ev.windMult : 1)), 0) / 24,
  };
}

// 설비 종류별로 관련 테크트리와 적용 단계 요약
//  short=true: "가스 2단계 · 복합 1단계" 한 줄 (선택 설비 창용)
//  short=false: 트리별로 적용된 단계 이름과 다음 단계 효과 (설비 카드 상세용)
const PLANT_TREES = { gasTurbine: ['ccgt'], ccgt: ['ccgt'], coal: ['coal'], nuclear: ['nuclear'], smr: ['nuclear'], solar: ['solar'], wind: ['wind'], ess: ['grid'], interconnect: ['grid'] };
function plantTechSummary(state, type, short) {
  const trees = PLANT_TREES[type] || [];
  if (!trees.length) return '';
  if (short) {
    const parts = trees.map((t) => TECH[t].name.replace(/ \(.*\)$/, '') + ' ' + (state.tech[t] || 0) + '/' + TECH[t].tiers.length + '단계');
    return parts.join(' · ');
  }
  let html = '<div class="pd-tech-title">🧪 테크트리 효과</div>';
  for (const t of trees) {
    const lvl = state.tech[t] || 0, tiers = TECH[t].tiers;
    const applied = tiers.slice(0, lvl).map((x) => x.effect).join(' / ');
    const next = tiers[lvl];
    html += '<div class="pd-tech-row"><b>' + TECH[t].name + '</b> <span class="muted">' + lvl + '/' + tiers.length + '단계</span>' +
      (lvl > 0 ? '<div class="pd-tech-applied">적용 중: ' + applied + '</div>' : '') +
      (next ? '<div class="pd-tech-next">다음 ' + (lvl + 1) + '단계 "' + next.name + '": ' + next.effect + '</div>' : '<div class="pd-tech-next">모든 단계 개발 완료</div>') + '</div>';
  }
  return html;
}

// 창 크기가 바뀌면 그래프를 다시 그림 (안 그리면 브라우저가 기존 그림을 늘려 글씨·선이 깨져 보임)
(function () {
  let timer = null;
  const redraw = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (typeof state === 'undefined' || !state || !state.demandCurve) return;
      try { renderForecast(state); } catch (e) {}
      const rep = document.getElementById('report');
      if (rep && !rep.classList.contains('hidden') && state.lastReport) { try { drawReportChart(state.lastReport); } catch (e) {} }   // 그래프만 다시 그림 (창 전체를 다시 만들면 펼쳐 둔 내역이 도로 접힘)
    }, 120);
  };
  window.addEventListener('resize', redraw);
  // 창 크기 이벤트가 안 와도 그래프 칸의 실제 폭이 바뀌면 다시 그림
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => redraw());
    const fc = document.getElementById('forecast-chart'); if (fc) ro.observe(fc);
    const rc = document.getElementById('report-chart'); if (rc) ro.observe(rc);
  }
})();
// 안전망: 1초마다 전망 그래프의 실제 폭이 그린 폭과 다르면 다시 그림 (창 최대화 등 이벤트를 놓쳐도 깨진 채로 남지 않게)
setInterval(() => {
  if (typeof state === 'undefined' || !state || !state.demandCurve) return;
  const cv = document.getElementById('forecast-chart');
  if (cv && cv.clientWidth > 0 && String(cv.clientWidth) !== cv.dataset.drawnW) { try { renderForecast(state); } catch (e) {} }
}, 1000);

// ------------------------------------------------------------
// 지도 아래 요약: 정책 패널 · 테크/R&D 패널
// ------------------------------------------------------------
const POLICY_SHORT = { energy: '에너지', market: '전력시장', industry: '산업', rd: 'R&D' };
// 공약 진행 막대: 줄마다 "무엇 · 막대 · 지금 / 목표 · ✓". 막대가 찰수록 목표에 가깝고, 채우면 초록으로 바뀜
function pledgeMetersHtml(def, state, q) {
  let list = null;
  try { list = def.meters ? def.meters(state, q) : null; } catch (e) { list = null; }
  if (!list || !list.length) return '<div class="p">' + def.progress(state, q) + '</div>';
  return '<div class="pm-list">' + list.map((m) =>
    '<div class="pm' + (m.ok ? ' ok' : '') + '"><span class="l">' + m.label + '</span><span class="bar"><i style="width:' + Math.round(m.ratio * 100) + '%"></i></span>' +
    '<span class="v"><b>' + m.now + '</b><small> / ' + m.goal + '</small></span><span class="c">' + (m.ok ? '✓' : '') + '</span></div>').join('') + '</div>';
}
// 공약의 상태 한 줄: [색, 글] (정책 칸 · 길잡이 공통)
function pledgeStateOf(state, q, def) {
  const now = state.year * 12 + state.month, left = q.deadline - now + 1;
  const dur = (m) => (m > 24 ? Math.floor(m / 12) + '년' + (m % 12 ? ' ' + (m % 12) + '개월' : '') : m + '개월');
  const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
  if (def.term2) return q.status === 'done' ? ['good', '지킴 · 민심 +' + def.kept] : q.status === 'failed' ? ['bad', '못 지킴 · 민심 −' + def.broken] : q.status === 'late' ? ['muted', '늦게 지킴 · 벌점 없음']
    : [left <= 24 ? 'bad' : 'warn', left <= 0 ? '이번 달 결산에서 평가' : '18년 차 말 평가 · ' + dur(left) + ' 남음'];
  if (!q.v2) return q.status === 'done' ? ['good', '지킴 · 민심 +' + ECON.moodPledgeKept] : q.status === 'failed' ? ['bad', '기한 지남 · 민심 −' + ECON.moodPledgeBroken] : q.status === 'late' ? ['muted', '늦게 지킴 · 벌점 없음'] : ['warn', '진행 중'];
  if (def.kind === 'keep') {
    if (q.next) return [left <= 12 ? 'bad' : 'warn', Math.round(q.next / 12) + '년 차 말 점검 · ' + (left <= 0 ? '이번 달' : dur(left) + ' 남음')];
    return q.last === 'kept' ? ['good', '마지막 점검 지킴 · 민심 ' + sg(PLEDGE_KEEP.hold)] : q.last === 'late' ? ['muted', '뒤늦게 지킴 · 벌점 없음'] : ['bad', '마지막 점검 어김 · 민심 ' + sg(-PLEDGE_KEEP.loss)];
  }
  if (q.grade !== undefined) { const G = PLEDGE_GRADES[q.grade]; return q.late ? ['muted', '평가: ' + G.name + ' → 뒤늦게 이행 · 벌점 없음'] : [G.hold > 0 ? 'good' : 'bad', '평가: ' + G.name + ' · 민심 ' + sg(G.hold)]; }
  return [left <= 24 ? 'bad' : 'warn', left <= 0 ? '이번 달 결산에서 평가' : '18년 차 말 평가 · ' + dur(left) + ' 남음'];
}
// 공약 카드의 둘째 줄: 점검형은 지난 점검 결과와 지금 상태, 달성형은 지금 달성률과 이대로면 받을 등급
function pledgeNowHtml(state, q, def) {
  if (def.term2 || !q.v2 || !def.meters) return '';
  const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
  const ms = def.meters(state, q);
  if (def.kind === 'keep') {
    const past = (q.res || []).map((r) => '<i class="' + (r === 'kept' ? 'good' : 'bad') + '">' + (r === 'kept' ? '✓' : '✕') + '</i>').join('');
    const okNow = ms.every((m) => m.ok);
    return '<div class="pm-now">' + (past ? '<span>지난 점검 ' + past + '</span>' : '<span>4년마다 점검</span>') +
      '<span>' + (q.next ? '지금 점검받으면 ' : '지금 ') + '<b class="' + (okNow ? 'good' : 'bad') + '">' + (okNow ? '지킴 ' + sg(PLEDGE_KEEP.gain) : '어김 ' + sg(-PLEDGE_KEEP.hit)) + '</b></span></div>';
  }
  if (q.grade !== undefined) return '<div class="pm-now"><span>평가 때 달성률 <b>' + q.rate + '%</b></span></div>';
  const G = PLEDGE_GRADES[pledgeGradeOf(ms)], rate = Math.round(pledgeRateOf(ms) * 100);
  return '<div class="pm-now"><span>지금 달성률 <b>' + rate + '%</b></span><span>이대로면 <b class="' + (G.hold > 0 ? 'good' : 'bad') + '">' + G.name + ' ' + sg(G.bump) + '</b></span></div>';
}
function renderPolicyPanel(state) {
  const el = document.getElementById('policy-info');
  if (!el || !state) return;
  const pol = state.policies || {};
  const now = state.year * 12 + state.month;
  const start = (state.startYear || ECON.startYear) * 12 + (state.startMonth || ECON.startMonth);
  let html = '';
  for (const k of Object.keys(POLICIES).sort((a, b) => policyAtOf(state, a) - policyAtOf(state, b))) {   // 결정 시점 순 (판마다 다름)
    const P = POLICIES[k];
    const chosen = pol[k], opt = chosen && P.options[chosen];
    const due = Math.max(0, policyAtOf(state, k) - (now - start));
    const fxText = opt ? (opt.good || []).concat(opt.bad || []).map((t) => t.replace(/\s*<small>.*?<\/small>/g, '')).join(' · ') : (opt && opt.plain ? opt.plain.replace(/\s*<small>.*?<\/small>/g, '') : '');
    html += '<div class="pol-row"><span class="n">' + P.icon + ' ' + (POLICY_SHORT[k] || P.name) + '</span>' +
      (opt ? '<span class="v" title="' + (opt.desc || '').replace(/"/g, '&quot;') + '">' + opt.label + (opt.happy ? ' <small class="' + (opt.happy > 0 ? 'good' : 'bad') + '">민심 ' + (opt.happy > 0 ? '+' : '−') + Math.abs(opt.happy) + '</small>' : '') + '</span>'
           : '<span class="v muted">미정' + (due !== null ? ' · ' + (due <= 0 ? '곧 결정' : due + '개월 뒤 결정') : '') + '</span>') + '</div>';
    if (fxText) html += '<div class="pol-fxline">' + fxText + '</div>';
    // 이 정책의 공약: 제목 · 상태 · 진행
    const pq = (state.quests || []).find((q) => { const d = questById(q.id); return d && d.pledge && d.policy === k; });
    if (pq) {
      const d = questById(pq.id), st = pledgeStateOf(state, pq, d);
      const bad = pq.v2 ? pledgeMoodOf(pq, d) < 0 : pq.status === 'failed';
      const bars = pq.v2 || pq.status === 'active' || pq.status === 'failed';   // 평가가 끝난 뒤에도 막대는 보임 (뒤늦게 채울 수 있음)
      html += '<div class="pol-pledge' + (bad ? ' broken' : '') + '" title="' + (d.short + '. ' + pledgeStakesText(d) + '.').replace(/"/g, '&quot;') + '"><div class="t"><span>📜 ' + d.title.replace('공약: ', '') +
        (d.kind ? ' <em class="pk">' + (d.kind === 'keep' ? '점검형' : '달성형') + '</em>' : '') + '</span><small class="' + st[0] + '">' + st[1] + '</small></div>' +
        (bars ? pledgeNowHtml(state, pq, d) + pledgeMetersHtml(d, state, pq) : '') + '</div>';
    }
  }
  {
    const tq = (state.quests || []).find((q) => { const d = questById(q.id); return d && d.term2; });
    if (tq) {
      const d = questById(tq.id), st = pledgeStateOf(state, tq, d);
      html = '<div class="pol-row"><span class="n">🗳 재선 공약</span><span class="v">' + d.title.replace('재선 공약: ', '') + '</span></div>' +
        '<div class="pol-pledge' + (tq.status === 'failed' ? ' broken' : '') + '" title="' + (d.short + '. ' + pledgeStakesText(d) + '.').replace(/"/g, '&quot;') + '"><div class="t"><span>' + d.brief + '</span><small class="' + st[0] + '">' + st[1] + '</small></div>' +
        (tq.status === 'active' || tq.status === 'failed' ? pledgeMetersHtml(d, state, tq) : '') + '</div>' + html;
    }
  }
  const fx = effectsNow(state);
  if (fx.list.length) html += '<div class="pol-fx">⏳ ' + fx.list.map((f) => f.name + ' (' + f.left + '개월)').join(' · ') + '</div>';
  setHtmlKeepOpen(el, html);

  // 전기요금 조정: 돈과 민심을 맞바꾸는 손잡이 (지원 = 돈을 써서 요금 불만을 줄임 / 할증 = 요금 불만을 감수하고 돈을 얻음)
  const tEl = document.getElementById('tariff-info');
  if (tEl) {
    const lv = state.tariff || 0, tf = tariffNow(state), unlockLeft = tariffUnlockLeft(state), lockLeft = Math.max(tariffLockLeft(state), unlockLeft);
    const pctOf = (t) => Math.round(Math.abs(t.rate) * 100);
    const desc = (t) => (t.rate < 0 ? '국민 요금 −' + pctOf(t) + '% · 판매 수입의 ' + pctOf(t) + '% 지출' : t.rate > 0 ? '국민 요금 +' + pctOf(t) + '% · 수입 +' + pctOf(t) + '%' : '조정 없음');
    const short = { '-2': '▼▼', '-1': '▼', '0': '표준', '1': '▲', '2': '▲▲' };
    tEl.innerHTML = '<div class="tariff-box" title="국민이 내는 요금을 내려 주면 그만큼 돈이 나가고 요금 불만이 줄고, 올려 받으면 돈이 들어오고 요금 불만이 커집니다. ' + (ECON.tariffFromMonth / 12 + 1) + '년 차부터 쓸 수 있고, 한 번 바꾸면 ' + ECON.tariffLockMonths + '개월 동안 다시 못 바꿉니다.">' +
      '<div class="tb-head"><span class="n">지금</span><b>' + tf.name + '</b></div>' +
      '<div class="tb-btns">' + [-2, -1, 0, 1, 2].map((v) => { const t = ECON.tariff[String(v)]; return '<button class="small' + (v === lv ? ' on' : '') + '" data-tariff="' + v + '"' + (lockLeft > 0 && v !== lv ? ' disabled' : '') + ' title="' + t.name + ': ' + desc(t) + '">' + short[String(v)] + '</button>'; }).join('') + '</div>' +
      '<div class="tb-desc muted">' + (unlockLeft > 0 ? (ECON.tariffFromMonth / 12 + 1) + '년 차부터 사용 가능 (' + unlockLeft + '개월 뒤)' : desc(tf) + (lockLeft > 0 ? ' · ' + lockLeft + '개월 뒤 변경 가능' : '')) + '</div></div>';
  }

  // 최근 결정 · 결과 기록
  const lEl = document.getElementById('policy-log');
  if (lEl) {
    const log = [];
    for (const d of state.decisionLog || []) { const def = decisionById(d.id); log.push({ at: d.at, text: (def ? def.icon + ' ' + def.name : d.id) + ' → <b>' + d.choice + '</b>' }); }
    for (const q of (state.quests || [])) if (q.status !== 'active') {
      const def = questById(q.id); const pl = !!(def && def.pledge);
      let head = q.status === 'done' ? (pl ? '📜 공약 지킴: ' : '🎉 달성: ') : q.status === 'late' ? '📜 늦게 지킨 공약: ' : (pl ? '✕ 공약 못 지킴: ' : '✕ 실패: ');
      if (pl && q.v2 && !def.term2) head = def.kind === 'keep' ? '📜 공약 마지막 점검 (' + (q.last === 'kept' ? '지킴' : q.last === 'late' ? '뒤늦게 지킴' : '어김') + '): ' : '📜 공약 평가 (' + (q.grade !== undefined ? PLEDGE_GRADES[q.grade].name : '-') + '): ';
      log.push({ at: (q.status === 'late' ? q.lateAt : q.endAt) || q.deadline, text: head + (def ? def.title.replace('공약: ', '') : q.id) });
    }
    log.sort((a, b) => b.at - a.at);
    const when = (at) => Math.floor(at / 12) + '년 ' + (at % 12 === 0 ? 12 : at % 12) + '월';
    setHtmlKeepOpen(lEl, log.length
      ? '<details class="more"><summary>지난 결정 · 결과 ' + log.length + '건</summary>' + log.map((l) => '<div class="pl"><span class="d">' + when(l.at) + '</span><span>' + l.text + '</span></div>').join('') + '</details>'
      : '');
  }
}

const TECH_SHORT = { ccgt: '복합발전', coal: '석탄화력', nuclear: '원자력', solar: '태양광', wind: '풍력', grid: '계통·배터리' };
// 연구 탭에서 트리를 노선별로 묶어 보여 줌 (화력 20 · 원자력 15 · 재생에너지 20 · 공통 10). policy = 그 노선을 고르는 에너지 정책
const TECH_LINES = [
  { name: '화력', policy: 'thermal', keys: ['ccgt', 'coal'] },
  { name: '원자력', policy: 'nuclear', keys: ['nuclear'] },
  { name: '재생에너지', policy: 'renew', keys: ['solar', 'wind'] },
  { name: '공통', policy: null, keys: ['grid'] },
];
function renderTechRdPanel(state) {
  const el = document.getElementById('techrd-info');
  if (!el || !state) return;
  const lv = rdLevel(state);
  // 다음에 열리는 연구: 트리마다 다음 단계에 필요한 규모 가운데, 지금 규모보다 큰 가장 작은 값
  const blocked = TECH_ORDER.map((k) => ({ k, lvl: state.tech[k] || 0, need: tierGate(k, state.tech[k] || 0) })).filter((x) => x.need > lv).sort((a, b) => a.need - b.need);
  const nextGate = blocked.length ? blocked[0].need : 0;
  const nextNames = blocked.filter((x) => x.need === nextGate);
  const tw = techWeights(state), wT = techWeightedTiers(state), expT = moodTechExpected(state);
  const tv = clamp(ECON.moodResearchMid + (wT - expT) * ECON.moodTechSlope, 0, ECON.moodResearchMax);   // 연구 점수 (미래·신뢰 분야)
  const myLine = techLineOf(state);
  const active = researchActive(state), slots = researchSlots(state);
  // 머리줄 요약: 접어 두어도 규모 · 동시 연구 · 연구가 민심에 주는 영향은 보임
  const sum = document.getElementById('rd-dock-sum');
  if (sum) sum.innerHTML = '규모 <b>' + fmt(lv) + '</b> · 동시 ' + active + '/' + slots + ' · 연구 점수 <b class="' + (tv >= ECON.moodResearchMid ? 'good' : 'bad') + '">' + fmt(tv, 1) + '</b><small>/' + ECON.moodResearchMax + '</small>';

  // ---- 연구소: 확장 버튼 한 줄 ----
  let html = '<div class="rk-lab" title="연구소가 클수록 높은 단계의 연구가 열리고, 성공 확률이 오르고(지금 +' + pct(rdBonus(state)) + '), ' + RD_PER_SLOT + '마다 동시에 하는 연구가 하나 늘어납니다. 유지비는 없습니다. 확장은 한 달에 한 번입니다.">' +
    '<span class="lab-btns">' + RD_STEPS.map((st) => { const c = labExpandCost(state, st); return '<button class="small" data-lab="' + st + '"' + (state.labExpandedThisMonth || state.money < c || state.finished ? ' disabled' : '') + ' title="연구소 규모 +' + st + ' · ' + fmt(c) + '억 (한 달에 한 번)"><b>+' + st + '</b><small>' + fmt(c) + '억</small></button>'; }).join('') + '</span></div>' +
    '';
  const gateText = nextGate ? '규모 <b>' + nextGate + '</b>에서 ' + (nextNames.length > 2 ? '다음 단계 ' + nextNames.length + '가지가' : nextNames.map((x) => TECH_SHORT[x.k] + ' ' + (x.lvl + 1) + '단계').join(' · ') + '가') + ' 열립니다.' : '지금 연구할 단계는 모두 열려 있습니다.';

  // ---- 테크트리: 트리마다 두 줄 (이름 · 단계 / 다음 단계의 효과 · 비용 · 성공 확률) + 연구 버튼 ----
  const full = active >= slots;
  for (const key of TECH_ORDER) {
    const tree = TECH[key], lvl = state.tech[key] || 0, n = tree.tiers.length;
    const counted = !myLine || key === 'grid' || TECH_LINE[myLine].includes(key);   // 연구 점수에 들어가는 트리인가
    const w = key === 'grid' ? 1 : (tw[key] || 0), fit = !counted ? (w > 0.01 ? 'mid' : 'off') : w >= 0.99 ? 'on' : w <= 0.01 ? 'off' : 'mid';
    const fitName = !counted ? (w > 0.01 ? '보조' : '안 씀') : fit === 'on' ? '주력' : fit === 'off' ? '안 씀' : '일부';
    const fitTip = !counted ? '내 노선 밖의 설비입니다. 연구하면 성능은 좋아지지만 연구 점수에는 들어가지 않습니다' : fit === 'on' ? '연구 점수에 온전히 반영됩니다' : '이 설비를 최대 수요의 ' + Math.round(ECON.moodTechFullShare * 100) + '% 이상 지어야 연구 점수에 온전히 반영됩니다';
    const all = tree.tiers.map((t, i) => (i < lvl ? '✓ ' : (i + 1) + '단계 ') + t.name + ': ' + t.effect).join('\n').replace(/"/g, '&quot;');
    const busy = state.techBusy && state.techBusy[key];
    let eff, cost = '', btn = '', rowTip = '';
    if (busy) { cost = '<span class="c busy">연구 중 · ' + busy.months + '개월</span>'; eff = '<span class="e busy">' + busy.name + '</span>'; }
    else if (lvl >= n) { cost = '<span class="c">완료</span>'; eff = '<span class="e done">모든 단계 개발 완료</span>'; }
    else {
      const tier = tree.tiers[lvl], need = techGate(state, key), p = techSuccessProb(state, key), c = techCost(state, key);
      const dis = need > 0 || full || state.money < c || state.finished;
      const why = need > 0 ? '연구소 규모 ' + need + ' 필요' : full ? '동시 연구 한도' : state.money < c ? '자금 부족' : '';
      eff = '<span class="e" title="' + (lvl + 1) + '단계 · ' + tier.name.replace(/"/g, '&quot;') + ': ' + tier.effect.replace(/"/g, '&quot;') + '"><small>다음 ' + (lvl + 1) + '단계</small> ' + tier.effect + '</span>';
      const tip = ('다음 ' + (lvl + 1) + '단계 · ' + tier.name + ': ' + tier.effect + ' (' + fmt(c) + '억 · 성공 ' + pct(p) + ' · ' + TECH_RESEARCH_MONTHS + '개월 뒤 결과' + (why ? ' · ' + why : '') + ')').replace(/"/g, '&quot;');
      rowTip = tip;
      cost = '<span class="c' + (need > 0 || full ? ' warn' : '') + '">' + (need > 0 ? '규모 ' + need + ' 필요' : fmt(c) + '억 · ' + pct(p)) + '</span>';
      btn = '<button class="small primary" data-tech="' + key + '"' + (dis ? ' disabled' : '') + ' title="' + (lvl + 1) + '단계 · ' + tier.name.replace(/"/g, '&quot;') + ' · ' + fmt(c) + '억 · 성공 ' + pct(p) + ' · ' + TECH_RESEARCH_MONTHS + '개월 뒤 결과' + (why ? ' (' + why + ')' : '') + '">연구</button>';
    }
    html += '<div class="rk fit-' + fit + '" style="border-left-color:' + tree.color + '"' + (rowTip ? ' title="' + rowTip + '"' : '') + '>' +
      '<span class="n" title="' + all + '">' + (TECH_SHORT[key] || tree.name) + ' <small><b>' + lvl + '</b>/' + n + '</small><i class="dot" title="' + fitName + ': ' + fitTip + '"></i></span>' +
      cost + btn + eff + '</div>';
  }

  // ---- 자세히 (접어 둠): 연구가 민심에 반영되는 방식 · 노선별 진행 · 기록 ----
  const moodTip = (myLine
    ? '내 노선(' + TECH_LINES.find((l) => l.policy === myLine).name + ')의 테크와 계통 테크를 2:1로 본 값입니다. 트리가 둘인 노선은 두 테크의 평균이고, 그 설비를 실제로 지어야(최대 수요의 ' + Math.round(ECON.moodTechFullShare * 100) + '% 이상) 온전히 반영됩니다. 15단계인 원자력은 10단계 눈금으로 바꿔서 셉니다.'
    : '지금 쓰는 설비들의 테크 평균 단계입니다. 안 쓰는 설비의 테크는 세지 않습니다. 에너지 정책으로 노선을 고르면 그 노선의 테크와 계통 테크만 봅니다.') +
    ' 국민의 기대는 해마다 ' + ECON.moodTechPerYear + '단계씩 올라갑니다. 기대와 같으면 연구 점수 ' + ECON.moodResearchMid + '점(만점 ' + ECON.moodResearchMax + '), 1단계 앞설 때마다 +' + ECON.moodTechSlope + ', 뒤처질 때마다 −' + ECON.moodTechSlope + '입니다.';
  let more = '<div class="tr-mood">' +
    (myLine ? '내 노선 <b>' + fmt(techLineProgress(state, myLine), 1) + '</b> · 계통 ' + fmt(techNorm(state, 'grid'), 1) + ' → 연구 <b>' + fmt(wT, 1) + '</b>' : '주력 테크 평균 <b>' + fmt(wT, 1) + '</b>단계') +
    ' · 기대 ' + fmt(expT, 1) + ' → 연구 점수 <b class="' + (tv >= ECON.moodResearchMid ? 'good' : 'bad') + '">' + fmt(tv, 1) + '</b> / ' + ECON.moodResearchMax + '</div>' +
    '<div class="lab-line muted">' + moodTip + '</div>' +
    '<div class="lab-line muted">연구소 키우기는 한 달에 한 번입니다. ' + gateText + ' 이름 옆의 점은 그 설비가 연구 점수에 들어가는 정도입니다 (초록 = 주력, 노랑 = 일부·보조, 회색 = 안 씀).</div>';
  more += '<div class="lab-line">' + TECH_LINES.map((ln) => { const got = ln.keys.reduce((a, k) => a + (state.tech[k] || 0), 0), max = ln.keys.reduce((a, k) => a + TECH[k].tiers.length, 0); const mine = ln.policy && state.policies && state.policies.energy === ln.policy; return (mine ? '<b>' : '') + ln.name + ' ' + got + '/' + max + (mine ? ' (내 노선)</b>' : ''); }).join(' · ') + '</div>';
  const tlog = (state.techLog || []).filter((e) => !e.rd);
  if (tlog.length) more += tlog.slice(-12).reverse().map((e) => '<div class="' + (e.success ? 'log-ok' : 'log-fail') + '">' + e.year + '년 ' + e.month + '월 · ' + e.name + ' · ' + pct(e.prob) + ' → ' + (e.success ? '성공' : '실패') + '</div>').join('');
  html += '<details class="more"><summary>자세히 · 연구 기록</summary>' + more + '</details>';
  setHtmlKeepOpen(el, html);
}

// 지도 아래 최근 소식: 주요 사건 기록(milestones) 최신순
function renderNewsPanel(state) {
  const el = document.getElementById('news-info');
  if (!el || !state) return;
  const ms = (state.milestones || []).slice(-8).reverse();
  if (!ms.length) { el.innerHTML = '<div class="muted">아직 소식이 없습니다. 사건, 목표 달성·실패, 첫 정전·첫 원전 가동 같은 일이 여기에 쌓입니다.</div>'; return; }
  el.innerHTML = ms.map((m) => '<div class="news-item' + (m.year === state.year && m.month === state.month ? ' now' : '') + '"><span class="d">' + m.year + '년 ' + m.month + '월</span><span>' + m.text + '</span></div>').join('');
}

function renderRdLog(state) {}   // (연구소 기록은 연구 칸 맨 아래 "연구 기록"에 함께 나옴)

// 미니맵 아래 도시 요약: 인구 · 도시 수 · 과밀
function renderCityStats(state) {
  const el = document.getElementById('city-stats-info');
  if (!el || !state) return;
  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  let worst = null;
  let crowded = 0;
  for (const c of state.cities) {
    const d = cityDensity(c);
    if (d > ECON.densityLimit) crowded++;
    if (!worst || d > worst.d) worst = { d, name: c.name };
  }
  const near = worst && worst.d > ECON.densityLimit * 0.85 && worst.d <= ECON.densityLimit;
  el.innerHTML = '<div class="cs-row"><span>👥 인구</span><b>' + fmt(pop) + '만 명</b></div>' +
    '<div class="cs-row"><span>🏙 도시</span><b>' + state.cities.length + '곳</b></div>' +
    (() => { const dA = housingDensity(state), hs = housingScore(dA); return '<div class="cs-row" title="전국 평균 밀도가 칸당 ' + ECON.housingComfort + '만 명 이하면 만점, ' + ECON.densityLimit + '만 명이면 0점입니다. 빽빽해질수록 새로 들어오는 사람도 줄어듭니다."><span>주거 여유</span><b class="' + (hs >= ECON.moodHousingMax * 0.95 ? 'good' : hs >= ECON.moodHousingMax * 0.6 ? 'warn' : 'bad') + '">' + fmt(hs, 1) + ' / ' + ECON.moodHousingMax + '</b></div>' +
      '<div class="cs-row muted"><span>평균 밀도</span><span>' + dA.toFixed(2) + '만 명/칸 (' + ECON.housingComfort + ' 이하면 만점)' + (housingGrowthMult(state) < 0.99 ? ' · 유입 ×' + fmt(housingGrowthMult(state), 2) : '') + '</span></div>'; })() +
    (crowded ? '<div class="cs-row"><span>과밀 도시</span><b class="bad">' + crowded + '곳</b></div>' : '');
}
