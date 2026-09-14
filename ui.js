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

  ctx.fillStyle = p.color;
  ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  switch (p.kind) {
    case 'gt':
    case 'ccgt': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 6, y + 8, w - 20, h - 14);
      ctx.fillRect(x + w - 11, y + 4, 5, h - 8);
      if (p.kind === 'ccgt') { ctx.fillStyle = '#4fc3f7'; ctx.fillRect(x + 6, y + 4, 10, 4); }
      break;
    }
    case 'coal': {
      ctx.fillStyle = '#263238';
      ctx.fillRect(x + 6, y + 14, w - 12, h - 20);
      ctx.fillRect(x + 12, y + 4, 7, h - 10);
      ctx.fillRect(x + w - 19, y + 4, 7, h - 10);
      ctx.fillStyle = '#ef5350';
      ctx.fillRect(x + 12, y + 4, 7, 3);
      ctx.fillRect(x + w - 19, y + 4, 7, 3);
      break;
    }
    case 'smr':
    case 'nuclear': {
      if (b.type === 'smr') {
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(cx - 12, cy - 4, 24, 16);
        ctx.beginPath(); ctx.arc(cx, cy - 4, 12, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fdd835';
        ctx.beginPath(); ctx.arc(cx, cy + 3, 3.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#eceff1';
        ctx.beginPath(); ctx.arc(cx - 12, cy + 6, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(cx + 4, cy - 10, 22, 26);
        ctx.beginPath(); ctx.arc(cx + 15, cy - 10, 11, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fdd835';
        ctx.beginPath(); ctx.arc(cx + 15, cy + 2, 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'solar': {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 6, y + 4); ctx.lineTo(x + i * w / 6, y + h - 4); ctx.stroke(); }
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 4, y + i * h / 4); ctx.lineTo(x + w - 4, y + i * h / 4); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 4, y + 4, w / 2 - 4, h / 4 - 2);
      break;
    }
    case 'wind': {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, y + h - 5); ctx.stroke();
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); ctx.stroke();
      }
      ctx.fillStyle = '#37474f';
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'h2': {
      // 수소: 탱크 두 개 + H₂ 글자
      ctx.fillStyle = '#4527a0';
      ctx.fillRect(cx - 16, cy - 2, 12, 14); ctx.fillRect(cx + 4, cy - 2, 12, 14);
      ctx.beginPath(); ctx.arc(cx - 10, cy - 2, 6, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10, cy - 2, 6, Math.PI, 0); ctx.fill();
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText('H₂', cx, cy - 12);
      break;
    }
    case 'link': {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 4, cy - 4); ctx.lineTo(x + w - 4, cy - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 4, cy + 4); ctx.lineTo(x + w - 4, cy + 4); ctx.stroke();
      break;
    }
    case 'ess': {
      // 배터리 모양
      ctx.fillStyle = '#004d5a';
      ctx.fillRect(cx - 14, cy - 8, 26, 16);
      ctx.fillRect(cx + 12, cy - 4, 4, 8);
      ctx.fillStyle = '#b2ebf2';
      ctx.fillRect(cx - 12, cy - 6, 7, 12);
      ctx.fillRect(cx - 3, cy - 6, 7, 12);
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath(); ctx.moveTo(cx + 8, cy - 7); ctx.lineTo(cx + 3, cy + 1); ctx.lineTo(cx + 7, cy + 1); ctx.lineTo(cx + 4, cy + 8); ctx.lineTo(cx + 10, cy - 1); ctx.lineTo(cx + 6, cy - 1); ctx.closePath(); ctx.fill();
      break;
    }
  }

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
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
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
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = TERRAIN_COLORS[state.grid[r][c]];
      ctx.fillRect(c * MINI, r * MINI, MINI, MINI);
    }
  }
  ctx.fillStyle = '#bdbdbd';
  for (const city of state.cities) for (const t of city.tiles) ctx.fillRect(t.col * MINI, t.row * MINI, MINI, MINI);
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    ctx.fillStyle = b.status === 'retired' ? '#ff5252' : p.color;
    ctx.fillRect(b.col * MINI, b.row * MINI, p.width * MINI, p.height * MINI);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  const z = state.zoom || 1;
  ctx.strokeRect(state.view.col * MINI + 0.75, state.view.row * MINI + 0.75, visCols() * MINI - 1.5, visRows() * MINI - 1.5);
}

// ------------------------------------------------------------
// 왼쪽 설비 카드 (paletteCat: 'gen' 발전 설비 / 'infra' 저장·수소·연계)
let paletteCat = 'gen';
// ------------------------------------------------------------
// 카드 묶음(카테고리): 접었다 펼 수 있고, 접힘 상태는 브라우저에 기억
const PALETTE_GROUPS = [
  { key: 'gas', name: '가스 발전', cat: 'gen', types: ['gasTurbine', 'ccgt'] },
  { key: 'renew', name: '재생에너지', cat: 'gen', types: ['solar', 'wind'] },
  { key: 'coal', name: '석탄', cat: 'gen', types: ['coal'] },
  { key: 'nuclear', name: '원자력', cat: 'gen', types: ['nuclear', 'smr'] },
  { key: 'storage', name: '에너지 저장', cat: 'infra', types: ['ess'] },
  { key: 'h2', name: '수소', cat: 'infra', types: ['cracker'] },
  { key: 'link', name: '국제 연계', cat: 'infra', types: ['interconnect'] },
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
    const tags = (p.traits || '').split(' · ').slice(0, 3);
    card.innerHTML =
      '<div class="pc-head"><i class="plant-icon" style="background:' + p.color + '"></i><strong>' + p.name + '</strong><small class="muted">' + p.width + '×' + p.height + '</small>' +
        '<button class="pc-info" data-info="' + type + '" title="상세 설명">ⓘ</button></div>' +
      (unlocked
        ? '<div class="pc-stats">' +
            '<div><b>' + fmt(st.capacity) + '</b><small>' + (p.isH2 ? 'MW분 수소' : p.isStorage ? 'MW 출력' : 'MW 용량') + '</small>' + (avg !== null ? '<em>평균 ~' + fmt(avg) + '</em>' : '') + '</div>' +
            '<div><b class="cost">' + fmt(st.capex) + '</b><small>억 건설비</small></div>' +
            '<div><b>' + st.buildMonths + '</b><small>개월 공사</small></div>' +
            '<div><b>' + (type === 'ess' ? techMods(state).essLife : p.lifeYears) + '</b><small>년 수명</small></div>' +
          '</div>' +
          '<div class="pc-tags">' + tags.map((t) => '<span>' + t + '</span>').join('') + '</div>'
        : '<div class="pc-lock">🔒 테크 "' + req + '" 필요</div>');
    return card;
  };
  for (const g of PALETTE_GROUPS) {
    if (g.cat !== (paletteCat === 'infra' ? 'infra' : 'gen')) continue;
    const closed = !!paletteClosed[g.key];
    const online = state.buildings.filter((b) => g.types.includes(b.type) && b.status === 'online').length;
    const wrap = document.createElement('div');
    wrap.className = 'pc-group' + (closed ? ' closed' : '');
    wrap.dataset.group = g.key;
    wrap.innerHTML = '<div class="pc-group-head"><span class="arrow">' + (closed ? '▸' : '▾') + '</span><b>' + g.name + '</b><small class="muted">' + g.types.map((t) => PLANTS[t].short).join(' · ') + (online ? ' · 가동 ' + online + '기' : '') + '</small></div>';
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
  if (p.isH2) capText = '가스터빈·복합 ' + fmt(st.capacity) + ' MW분 수소 연료 · 전력 ' + fmt(p.elecLoad * m.crackerLoadMult) + ' MW 소비';
  if (p.isLink) capText = '송전 ' + fmt(st.capacity) + ' MW';
  rows.push(['설비 용량 (명목)', capText]);
  rows.push(['건설비', fmt(st.capex) + '억 (' + (p.isH2 ? 'MW분당 ' : 'MW당 ') + fmt(st.capex / st.capacity, 1) + '억)']);
  rows.push(['공사 기간', st.buildMonths + '개월']);
  rows.push(['수명', (type === 'ess' ? m.essLife : p.lifeYears) + '년']);
  if (!p.isLink && !p.isH2) rows.push(['연료비 / 변동비', fmt(st.fuelCost) + ' / ' + p.varOm + ' 원/kWh']);
  if (p.isH2) rows.push(['암모니아 연료비', fmt(m.h2KgPerMWh * ECON.nh3CostPerKgH2 * m.h2FuelMult / 1000) + '원/kWh (수소로 낸 전기 기준) · 남는 수소 수출 마진 ' + fmt(ECON.nh3CostPerKgH2 * m.h2FuelMult * ECON.h2ExportMargin) + '원/kg']);
  if (!p.isLink && !p.isH2) rows.push(['탄소 배출', fmt(st.co2, 2) + ' t/MWh' + (st.co2 > 0 ? ' (탄소세 대상)' : ' (무탄소)')]);
  rows.push(['월 고정 유지비', fmt(st.capex * p.omRate / 12, 1) + '억']);
  if (p.dispatchable && !p.isStorage) rows.push(['월 용량 요금', '+' + fmt(st.capacity * ECON.capacityPayment, 1) + '억 (예비력 한도 안에서)']);
  if (p.dispatchable && !p.isStorage) rows.push(['출력 조절', p.mustRun ? '불가 · 항상 최대 출력 (밤에 남으면 과잉 발전)' : '최소 ' + fmt((type === 'coal' ? m.coalMinLoad : p.minLoad) * 100) + '% · 시간당 ±' + fmt((type === 'coal' ? m.coalRamp : p.ramp) * 100) + '%']);
  if (p.renewable === 'solar') { rows.push(['발전 시간', '낮에만 · 날씨(맑음/흐림/비)에 따라 변동']); rows.push(['부지 영향', '산에 지으면 벌목 반발로 지을 때 행복도 −' + ECON.solarMountainBuildHit + ', 이후 매달 −' + ECON.solarMountainNuisance + ' (합계 최대 −' + ECON.solarMountainCap + ')']); }
  if (p.renewable === 'wind') { rows.push(['발전 시간', '24시간 · 바람 세기에 따라 변동']); rows.push(['부지 영향', '해안 +' + fmt(m.coastalBonus * 100) + '% · 산 +' + fmt(ECON.windMountainBonus * 100) + '% · 평지 −' + fmt(ECON.windPlainPenalty * 100) + '%']); }
  if (p.isStorage) rows.push(['왕복 효율', fmt(m.essEff * 100) + '%']);
  if (p.kind === 'gt' || p.kind === 'ccgt') rows.push(['외기온', '더우면 출력 감소, 추우면 증가']);
  const site = [];
  if (p.needsSea) site.push('바다 옆 필수');
  if (p.edgeOnly) site.push('지도 가장자리');
  if (!p.needsSea && !p.edgeOnly) site.push('땅 ' + p.width + '×' + p.height + '칸');
  if (type === 'wind' && m.windOnSea) site.push('바다 위 가능');
  rows.push(['부지', site.join(' · ')]);
  if (p.oppositionRange) rows.push(['주민 반발', '도시 ' + m.nuclearOppRange + '칸 이내면 건설비 +' + fmt((m.nuclearOppMult - 1) * 100) + '% · 가까우면 행복도 감소']);
  else if (p.nuisance || type === 'wind' || type === 'coal') rows.push(['주민 반발', '도시 가까이 두면 행복도 감소']);
  if (p.requiresTech) rows.push(['필요 테크', TECH[p.requiresTech.tree].tiers[p.requiresTech.level - 1].name + (plantUnlocked(state, type) ? ' ✓' : ' (미개발)')]);
  if (p.upgradeTo) rows.push(['개조', PLANTS[p.upgradeTo].name + '으로 ' + fmt(p.upgradeCost) + '억 · ' + p.upgradeMonths + '개월']);
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
  document.getElementById('player-label').innerHTML = '🏛 <b>' + state.playerName + '</b> 대통령';
  const moneyEl = document.getElementById('money-value');
  moneyEl.textContent = fmt(Math.round(state.money));
  moneyEl.closest('.money').classList.toggle('negative', state.money < 0);
  const yearNo = Math.floor(yearsElapsed(state)) + 1;
  const term = state.mode === 'normal' ? ' · ' + yearNo + '년 차 / ' + ECON.normalYears + '년'
             : state.mode === 'netzero' ? ' · ' + yearNo + '년 차 / ' + ECON.netZeroYears + '년' : ' · ' + yearNo + '년 차';
  document.getElementById('date-value').textContent = state.year + '년 ' + state.month + '월' + term;
  document.getElementById('rd-value').textContent = fmt(rdLevel(state));
  document.getElementById('pop-value').textContent = fmt(state.cities.reduce((s, c) => s + c.pop, 0));
  // 국정 운영 점수(지금까지 기준, 완주 가정). 마우스를 올리면 다섯 축이 보임
  if (typeof computeScore === 'function') {
    const sc = computeScore(state, 'complete');
    document.getElementById('score-value').textContent = fmt(sc.raw);
    document.getElementById('score-stat').title = '국정 운영 점수 ' + fmt(sc.raw) + ' / 1,000 (지금까지 기준, 완주 가정)\n국민 행복 ' + sc.parts.happy + ' · 전력 시스템 ' + sc.parts.system + ' · 탄소 ' + sc.parts.carbon + ' · 경제 규모 ' + sc.parts.economy + ' · 자본 ' + sc.parts.capital + ' (각 100점 만점 × 2)';
  }

  const hp = state.happiness;
  document.getElementById('happy-value').textContent = fmt(hp);
  document.getElementById('happy-face').textContent = hp >= 70 ? '😊' : hp >= 45 ? '🙂' : hp >= ECON.happinessGameOver + 10 ? '😟' : '😡';
  document.querySelector('.happy').classList.toggle('low', hp < 45);

  const peak = Math.max.apply(null, state.demandCurve);
  document.getElementById('demand-value').textContent = fmt(peak);

  // 지도 위 공급 칩: 조절 가능 설비(명목 용량)와 재생 설비(명목 → 이번 달 날씨 기준 하루 평균 출력)를 따로 보여 용량이 부풀려 보이지 않게
  const rf = renewAvgFactors(state);
  let online = 0, building = 0, retired = 0, renCap = 0, renAvg = 0, renPeak = 0;
  const solarPeakF = state.weather ? Math.max.apply(null, state.weather.solarHourly) * ((state.event && state.event.solarMult) || 1) : 0.7;
  const windPeakF = state.weather ? Math.min(1, Math.max.apply(null, state.weather.windHourly)) : 0.5;
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    if (p.isLink || p.isStorage || p.isH2) continue;
    if (b.status === 'online' && p.renewable) { const cap = plantStats(state, b.type).capacity; renCap += cap; renAvg += cap * (p.renewable === 'solar' ? rf.solar : rf.wind); renPeak += cap * (p.renewable === 'solar' ? solarPeakF : windPeakF); continue; }
    if (b.status === 'online') online += p.capacity;
    else if (b.status === 'building' || b.status === 'upgrading') building += p.capacity;
    else if (b.status === 'retired') retired += p.capacity;
  }
  document.getElementById('renew-chip').querySelector('.stat-lines').innerHTML = renCap
    ? '<small>재생 예상 출력 (명목 ' + fmt(renCap) + ' MW)</small><span id="renew-value">평균 ~' + fmt(renAvg) + ' · 최대 ~' + fmt(renPeak) + ' MW</span>'
    : '<small>재생 예상 출력</small><span id="renew-value"><small>태양광·풍력 없음</small></span>';
  document.getElementById('supply-value').innerHTML =
    fmt(online) + ' MW' + (building ? ' <small>(+' + fmt(building) + ' 건설 중)</small>' : '') + (retired ? ' <small class="bad">(' + fmt(retired) + ' 수명 종료)</small>' : '');

  const w = state.weather;
  const temp = w.temp + ((state.event && state.event.tempDelta) || 0);
  let chip = w.seasonName + ' · ' + w.sky + ' · ' + w.wind + ' · ' + temp + '℃';
  if (state.event) chip += ' · <span class="warn">⚠ ' + state.event.name + '</span>';
  document.getElementById('weather-chip').innerHTML = chip;

  const last = state.lastReport;
  let co2 = '탄소세 ' + fmt(state.carbonTax) + '원/t';
  if (last) {
    co2 = '지난달 CO₂ ' + fmt(last.energy.co2) + 't · ' +
      (last.blackoutHours > 0 ? '<span class="bad">정전 ' + last.blackoutHours + '시간</span>' : '<span class="good">정전 없음</span>') + ' · ' + co2;
  }
  document.getElementById('co2-chip').innerHTML = co2;

  document.getElementById('tech-bonus').textContent = pct(rdBonus(state));
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
  const mustRun = caps.nuclear + caps.smr * PLANTS.smr.minLoad + caps.coal * techMods(state).coalMinLoad;
  const minDemand = Math.min.apply(null, state.demandCurve);

  const hasGas = state.buildings.some((b) => b.status === 'online' && (PLANTS[b.type].kind === 'gt' || PLANTS[b.type].kind === 'ccgt'));
  const soon = state.buildings.filter((b) => b.status === 'online' && plantLifeMonths(b.type) - b.age <= 12).length;
  const retired = state.buildings.filter((b) => b.status === 'retired').length;

  // ---------- 계산 ----------
  const ratio = supplyDemandRatio(state), ind = inducedGrowth(state);
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
  // 수소: 크래킹 설비 수 → 월 수소 생산량, 가스 발전이 최대로 돌 때 수소가 대신할 수 있는 비율
  const crackers = state.buildings.filter((b) => b.status === 'online' && PLANTS[b.type].isH2).length;
  const h2Month = crackers * PLANTS.cracker.capacity * ECON.h2KgPerMWh * 24 * ECON.daysPerMonth;
  const gasCap = caps.ccgt + caps.gt;
  const h2Cover = gasCap > 0 ? Math.min(m2.h2Blend, crackers * PLANTS.cracker.capacity * ECON.h2KgPerMWh / (gasCap * m2.h2KgPerMWh)) : 0;

  // ---------- 시간대별 공급 여유 · 부족 시간대 ----------
  const firm = dispatch + caps.link * w.linkAvail;                     // 언제든 낼 수 있는 공급 (조절 발전 + 수입)
  const supplyCurve = state.demandCurve.map((_, h) => firm + solarCurve[h] + windCurve[h]);
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

  // ---------- 계통 안정도 (0~100) ----------
  let gs = 100; const gsReasons = [];
  if (minMargin < 0) { gs -= 50 + Math.min(30, -minMargin * 100); gsReasons.push('공급 부족 ' + fmt(worst) + ' MW'); }
  else if (minMargin < 0.05) { gs -= 30; gsReasons.push('예비력 ' + fmt(minMargin * 100) + '% (5% 미만)'); }
  else if (minMargin < 0.10) { gs -= 15; gsReasons.push('예비력 ' + fmt(minMargin * 100) + '%'); }
  else if (minMargin < 0.15) gs -= 5;
  if (atLimitHours > 0) { gs -= m2.gridForming ? 5 : Math.min(35, 10 + curtailPct * 100); gsReasons.push('재생 비중이 관성 한도 초과 ' + atLimitHours + '시간'); }
  if (mustRun > minDemand) { gs -= 10; gsReasons.push('야간 과잉 발전'); }
  if (state.outageId) { gs -= 10; gsReasons.push('원전 정기검사 정지'); }
  if (stoppedCount) { gs -= 10; gsReasons.push('사고로 정지된 설비 ' + stoppedCount + '기'); }
  gs = clamp(Math.round(gs), 0, 100);
  const gsLevel = gs >= 80 ? '안정' : gs >= 60 ? '주의' : gs >= 40 ? '불안정' : '위험';
  const gridCls = gs >= 80 ? 'good' : gs >= 60 ? 'warn' : 'bad';

  // ---------- 핵심 3칸: 공급 · 탄소 · 계통 ----------
  const supplyCls = worst > 0 ? 'bad' : minMargin < 0.05 ? 'warn' : ratio > ECON.inducedReserve ? 'warn' : 'good';
  const supplyBadge = worst > 0 ? '부족 ' + fmt(worst) + ' MW (' + tightHour + '시)' : minMargin < 0.05 ? '빠듯 · 예비력 +' + fmt(minMargin * 100) + '%' : ratio > ECON.inducedReserve ? '남음 +' + fmt(minMargin * 100) + '% · 수요 유입 ↑' : '적정 · 예비력 +' + fmt(minMargin * 100) + '%';
  const carbonCls = tgt === null ? 'muted' : overInten ? 'bad' : (lastInten !== null && lastInten > tgt * 0.9) ? 'warn' : 'good';
  const carbonBadge = tgt === null ? '기준 ' + fmt(ECON.intensityStartYear - yearsElapsed(state), 1) + '년 뒤' : overInten ? '초과' : '양호';
  let html = '<div class="kpi-row">' +
    '<div class="kpi ' + supplyCls + '"><div class="k">공급 / 수요 (MW)</div><div class="v">' + fmt(Math.round(firm)) + '<small> / ' + fmt(peak) + '</small></div><div class="b">' + supplyBadge + '</div></div>' +
    '<div class="kpi ' + carbonCls + '"><div class="k">탄소 (t/MWh)</div><div class="v">' + (lastInten !== null ? lastInten.toFixed(2) : '-') + '<small>' + (tgt !== null ? ' / 기준 ' + tgt.toFixed(2) : '') + '</small></div><div class="b">' + carbonBadge + '</div></div>' +
    '<div class="kpi ' + gridCls + '"><div class="k">계통 안정도</div><div class="v">' + gs + '<small> / 100 · ' + gsLevel + '</small></div><div class="bar"><i style="width:' + gs + '%"></i></div><div class="b">' + (gsReasons.length ? gsReasons[0] : '문제 없음') + '</div></div>' +
    '</div>';
  html += '<div class="wx"><span class="wx-main">' + w.seasonName + ' · ' + w.sky + ' · ' + w.wind + ' · ' + temp + '℃</span>' + weatherEffectChips(w, ev).map((c) => '<span class="chip">' + c + '</span>').join('') + '<span class="chip">👥 인구 +' + fmt(Math.min(ECON.growthCap * Math.max(0.4, 1 - ECON.landSaturationPerCity * Math.max(0, state.cities.length - ECON.landSaturationFrom)), baseG + Math.max(0, ind)) * 100, 1) + '%/월</span></div>';
  if (state.event) html += '<div class="alert warn">⚠ <b>' + state.event.name + '</b> ' + state.event.desc + '</div>';

  // ---------- 경고 (해당될 때만) ----------
  const alerts = [];
  if (mustRun > minDemand) alerts.push(['warn', '야간 과잉 발전 예상 ' + fmt(mustRun - minDemand) + ' MW (원전·석탄이 최소 수요보다 큼)']);
  if (retired) alerts.push(['bad', '수명 종료로 정지된 설비 ' + retired + '기 · 철거 필요']);
  if (soon) alerts.push(['warn', '12개월 안에 수명이 끝나는 설비 ' + soon + '기']);
  if (state.outageId) alerts.push(['bad', '원전 정기검사로 이번 달 정지']);
  else if (state.scheduledOutage) { const left = state.scheduledOutage.due - (state.year * 12 + state.month); alerts.push(['warn', state.scheduledOutage.name + ' 정기검사 ' + (left <= 0 ? '이번 달' : left + '개월 뒤') + ' · 한 달 정지']); }
  if (ind < 0) alerts.push(['warn', '전력 부족 우려로 인구 유입 둔화']);
  if (crackers > 0 && m2.h2Blend === 0) alerts.push(['warn', '크래킹 수소를 태울 수소 터빈 테크가 없어 수소를 전부 수출합니다']);
  if (atLimitHours > 0 && curtailPct >= 0.1) alerts.push([m2.gridForming ? 'warn' : 'bad', '재생 출력 제한 ' + fmt(curtailPct * 100) + '%' + (m2.gridForming ? ' · 남는 전기는 ESS·크래킹·수출로' : ' · 주파수 사고 위험 월 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '회 · ESS·계통 테크 필요')]);
  if (alerts.length) html += alerts.map((a) => '<div class="alert ' + a[0] + '">' + (a[0] === 'bad' ? '⚠ ' : '· ') + a[1] + '</div>').join('');

  // ---------- 자세히 (펼치기) ----------
  let d = '';
  d += '<div class="row"><span>조절 가능 설비 (손실·기온 반영)</span><b>' + fmt(dispatch) + ' MW</b></div>';
  d += '<div class="row"><span>재생에너지 설비 · 관성 허용 비중</span><b>' + fmt(caps.solar + caps.wind) + ' MW · ' + fmt(limit * 100) + '%</b></div>';
  if (caps.ess > 0) d += '<div class="row"><span>ESS (출력 / 저장량)</span><b>' + fmt(caps.ess) + ' MW / ' + fmt(caps.essEnergy) + ' MWh</b></div>';
  d += '<div class="row"><span>인구 증가: 행복도 ' + fmt(state.happiness) + ' → 기본 ' + fmt(baseG * 100, 2) + '%/월' + (ind > 0 ? ' + 남는 전기 유입 ' + fmt(ind * 100, 1) + '%' : '') + '</span><span class="muted">여유율 적정 100~120% (넘는 만큼 수요가 따라붙음)</span></div>';
  d += '<div class="row"><span>가스 연료비 지수 · 업계 표준 원가 지수</span><b>' + fmt(state.gasPrice * (ev.gasMult || 1) * 100) + ' · ' + fmt(refCostFactor(state) * 100) + '</b></div>';
  if (tgt === null) d += '<div class="row muted"><span>탄소 배출 기준 도입</span><b>' + fmt(ECON.intensityStartYear - yearsElapsed(state), 1) + '년 뒤 (시작 ' + ECON.intensityStart + ' t/MWh)</b></div>';
  if (crackers > 0) {
    const last = state.lastReport && state.lastReport.energy.h2;
    const h2Cost = m2.h2KgPerMWh * ECON.nh3CostPerKgH2 * m2.h2FuelMult / 1000;
    d += '<div class="row"><span>크래킹 ' + crackers + '기 · 수소 ' + fmt(h2Month / 1000, 0) + ' t/월 · 전력 ' + fmt(crackers * PLANTS.cracker.elecLoad * m2.crackerLoadMult) + ' MW 소비</span><b>' + (m2.h2Blend > 0 ? '가스 발전 최대 ' + fmt(h2Cover * 100) + '%를 수소로' : '터빈 테크 없음 → 전부 수출') + '</b></div>';
    d += '<div class="row muted"><span>수소 연료비 ' + fmt(h2Cost) + '원/kWh (가스 복합 ' + fmt(plantStats(state, 'ccgt').fuelCost * state.gasPrice) + '원 + 탄소세) · 남는 수소 수출 마진 ' + fmt(ECON.nh3CostPerKgH2 * m2.h2FuelMult * ((1 + ECON.h2ExportMargin) * policyMods(state).h2Price - 1)) + '원/kg (수출로는 큰돈이 안 됨)</span></div>';
    if (last) d += '<div class="row muted"><span>지난달 생산 ' + fmt(last.prod / 1000, 1) + ' t · 터빈 ' + fmt(last.burn / 1000, 1) + ' t (' + fmtMWh(last.gen) + ' 대체) · 수출 ' + fmt(last.export / 1000, 1) + ' t</span><span>수출 순이익 ' + fmt(state.lastReport.money.h2Rev || 0) + '억 · 터빈 연료(암모니아) ' + fmt(state.lastReport.money.h2Fuel || 0) + '억</span></div>';
  }
  if (caps.link > 0) {
    const nd = neighborDemandCurve(state);
    const appPeak = Math.max(...nd.map((v, h) => neighborAppetite(state, h)));
    d += '<div class="row"><span>수출 가능 (이웃 수요 ' + fmt(Math.max(...nd)) + ' MW 상한) · 프리미엄</span><b>' + fmt(Math.min(caps.link, appPeak)) + ' MW · +' + fmt((neighborPricePremium(state) - 1) * 100) + '%</b></div>';
    d += '<div class="row"><span>수입 가능 (이웃 여유 ' + fmt(w.linkAvail * 100) + '%)</span><b>' + fmt(caps.link * w.linkAvail) + ' MW · 수요의 ' + fmt(ECON.importShareLimit * 100) + '%까지</b></div>';
  }
  if (atLimitHours > 0) d += '<div class="row"><span>예상 출력 제한 · 주파수 사고 위험</span><b>' + fmtMWh(curtailMWh) + ' · ' + (m2.gridForming ? '없음 (그리드포밍)' : '월 ' + fmt(atLimitHours * ECON.freqRiskAtLimit, 1) + '회') + '</b></div>';
  html += '<details class="more"><summary>자세히</summary>' + d + '</details>';
  document.getElementById('forecast-info').innerHTML = html;

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
  if (deficitHours.length) {
    const day = deficitHours.filter((h) => h >= 9 && h <= 16).length, night = deficitHours.length - day;
    diagCls = 'bad';
    diag = '<b>부족 ' + fmt(worst) + ' MW · ' + hourRange(deficitHours) + '</b> → ';
    if (deficitHours.length >= 18) diag += '종일 모자랍니다. 당장은 가스터빈(' + bm('gasTurbine') + '개월), 길게는 복합(' + bm('ccgt') + ')·석탄(' + bm('coal') + ')·원전(' + bm('nuclear') + '개월) 같은 기저 설비가 필요합니다.';
    else if (night > 0 && day === 0) diag += '해 진 뒤·새벽이 모자랍니다. 태양광은 도움이 안 됩니다. 가스터빈(' + bm('gasTurbine') + '개월)·ESS(낮 충전 → 저녁 방전)·연계선 수입이 답입니다.';
    else if (day > 0 && night === 0) diag += '낮에만 모자랍니다. 태양광(' + bm('solar') + '개월)이 가장 싸고 빠릅니다.';
    else diag += '낮과 저녁 모두 모자랍니다. 가스터빈(' + bm('gasTurbine') + '개월)이 가장 빠르고, 태양광 + ESS 조합도 됩니다.';
  } else {
    // 가장 빠듯한 시각의 여유와, 지금 증가율로 언제 부족해질지 (가장 수요가 큰 계절 기준)
    const g = Math.max(0, monthlyGrowth(state));
    const worstSeason = Math.max(SEASON_PEAK.summer, SEASON_PEAK.winter) / SEASON_PEAK[seasonOf(state.month)];
    const room = (1 + minMargin) / worstSeason;      // 가장 더운·추운 달 기준 남은 여유 배율
    const months = room <= 1 ? 0 : g > 0 ? Math.log(room) / Math.log(1 + g) : 999;
    const spare = fmt(Math.round(supplyCurve[tightHour] - state.demandCurve[tightHour]));
    if (months <= 0) { diagCls = 'warn'; diag = '<b>지금은 여유 ' + spare + ' MW (' + tightHour + '시)</b> → 하지만 가장 ' + (SEASON_PEAK.winter >= SEASON_PEAK.summer ? '추운' : '더운') + ' 달에는 모자랍니다. 지금 착공해야 합니다 (가스터빈 ' + bm('gasTurbine') + '개월).'; }
    else if (months < 12) { diagCls = 'warn'; diag = '<b>여유 ' + spare + ' MW (' + tightHour + '시)</b> → 수요가 월 ' + fmt(g * 100, 1) + '%씩 늘어 약 <b>' + Math.round(months) + '개월 뒤</b> 부족해집니다. 공사 기간(가스터빈 ' + bm('gasTurbine') + ' · 복합 ' + bm('ccgt') + ' · 원전 ' + bm('nuclear') + '개월)을 생각하면 지금 지어야 합니다.'; }
    else diag = '<b>여유 ' + spare + ' MW (' + tightHour + '시)</b> → 약 ' + (months > 60 ? '5년 이상' : Math.round(months) + '개월') + ' 버팁니다. 다음 설비를 계획할 때입니다.';
    if (atLimitHours > 0) diag += ' 낮에는 재생에너지가 남아 출력 제한이 걸립니다. ESS나 계통 테크로 흡수하세요.';
  }
  document.getElementById('forecast-diag').innerHTML = '<div class="alert ' + diagCls + '">' + diag + '</div>';
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

  const status = b.status === 'online' ? (state.outageId === b.id ? '<span class="bad">정기검사 중 (이번 달 정지)</span>' : ageSt === 'aging' ? '<span class="warn">가동 중 (노후, 출력 −10%)</span>' : '<span class="good">가동 중</span>')
               : b.status === 'upgrading' ? '<span class="warn">업그레이드 중 (' + b.monthsLeft + '개월)</span>'
               : b.status === 'demolishing' ? '<span class="bad">철거 중 (' + b.monthsLeft + '개월)</span>'
               : b.status === 'retired' ? '<span class="bad">수명 종료 · 정지</span>'
               : '<span class="warn">건설 중 (' + b.monthsLeft + '개월)</span>';

  let html = '<div class="row"><b>' + p.name + '</b>' + status + '</div>';
  if (state.scheduledOutage && state.scheduledOutage.id === b.id) {
    const left = state.scheduledOutage.due - (state.year * 12 + state.month);
    html += '<div class="row warn"><span>⚠ 정기검사 예정</span><b>' + (left <= 0 ? '이번 달' : left + '개월 뒤') + ' 한 달 정지</b></div>';
  }
  // 이 설비의 현재 상태 위주 (일반 설명과 테크 효과는 왼쪽 카드의 ⓘ에서)
  const techLine = plantTechSummary(state, b.type, true);
  if (techLine) html += '<div class="row muted"><span>적용 테크</span><b>' + techLine + '</b></div>';
  const nui = typeof nuisanceOf === 'function' ? nuisanceOf(state, b) : 0;
  if (nui > 0) html += '<div class="row bad"><span>주민 반발 (도시 가까움)</span><b>행복도 −' + fmt(nui, 1) + '/월</b></div>';
  if (p.isH2) {
    // 크래킹 설비: 발전이 아니라 수소를 만드는 쪽이므로 출력 대신 수소·전력·연료비를 보여줌
    const m = techMods(state), rh = state.lastReport && state.lastReport.energy.h2;
    html += '<div class="row"><span>수소 생산 능력</span><b>가스터빈·복합 ' + fmt(st.capacity) + ' MW분 <small class="muted">(' + fmt(st.capacity * ECON.h2KgPerMWh / 1000 * 24, 1) + ' t/일)</small></b></div>';
    html += '<div class="row"><span>크래킹 전력 소비 (전력망에서)</span><b>' + fmt(p.elecLoad * m.crackerLoadMult) + ' MW</b></div>';
    html += '<div class="row"><span>암모니아 연료비 (수소로 낸 전기)</span><b>' + fmt(m.h2KgPerMWh * ECON.nh3CostPerKgH2 * m.h2FuelMult / 1000) + ' 원/kWh</b></div>';
    if (m.h2Blend === 0) html += '<div class="row warn"><span>수소 터빈 테크 없음</span><b>수소 전량 수출</b></div>';
    else html += '<div class="row"><span>가스 발전 연료 대체 한도</span><b>' + fmt(m.h2Blend * 100) + '%</b></div>';
    if (rh && rh.crackers > 0 && b.status === 'online') html += '<div class="row"><span>지난달 수소 (1기당)</span><b>터빈 ' + fmt(rh.burn / rh.crackers / 1000, 1) + ' t · 수출 ' + fmt(rh.export / rh.crackers / 1000, 1) + ' t</b></div>';
  } else html += '<div class="row"><span>설비 용량 (명목)</span><b>' + fmt(st.capacity) + ' MW</b></div>';
  if (!p.isLink && !p.isH2) {
    html += '<div class="row"><span>송전 손실 (도시까지 ' + distToNearestCity(state.cities, b.type, b.col, b.row) + '칸)</span><b>' + fmt(loss * 100) + '%</b></div>';
    if (b.coastal) html += '<div class="row good"><span>해안 보너스</span><b>+' + fmt(techMods(state).coastalBonus * 100) + '%</b></div>';
    if (p.renewable === 'wind') { if (b.mountain) html += '<div class="row good"><span>산지 보너스 (바람 셈)</span><b>+' + fmt(ECON.windMountainBonus * 100) + '%</b></div>'; else if (!b.coastal) html += '<div class="row warn"><span>평지 페널티 (바람 약함)</span><b>−' + fmt(ECON.windPlainPenalty * 100) + '%</b></div>'; }
    if (p.renewable === 'solar' && b.mountain) html += '<div class="row bad"><span>산림 훼손 (산지 태양광)</span><b>행복도 −' + ECON.solarMountainNuisance + '/월</b></div>';
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
    (b.status === 'building' ? p.lifeYears + '년' : fmt(left / 12, 1) + '년 남음 / ' + p.lifeYears + '년') + '</b></div>';

  html += '<div class="actions">';
  if (p.upgradeTo && b.status === 'online') {
    const up = PLANTS[p.upgradeTo];
    html += '<button class="small primary" data-action="upgrade" ' + (state.money < p.upgradeCost ? 'disabled' : '') + '>' +
      up.name + '으로 업그레이드 (' + fmt(p.upgradeCost) + '억 · ' + p.upgradeMonths + '개월)</button>';
  }
  if (b.status !== 'demolishing') {
    html += '<button class="small danger" data-action="demolish">철거 (' + ECON.demolishMonths + '개월 · 환급 ' + fmt(st.capex * ECON.demolishRefund) + '억)</button>';
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
    if (r && r.cap > 0 && !PLANTS[type].isLink && !PLANTS[type].isStorage && !PLANTS[type].isH2) slices.push({ label: PLANTS[type].name, value: r.cap, color: PLANTS[type].color });
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
  if (state.mode === 'netzero') {
    const left = ECON.netZeroYears - (state.year - (state.startYear || ECON.startYear));
    const target = state.co2Baseline !== undefined ? (state.co2Baseline * (1 - ECON.netZeroCut)).toFixed(2) + ' t/MWh 이하' : '첫해 기준 측정 중';
    html += '<div class="row"><span>탄소중립 목표 (배출 ' + target + ')</span><b>' + state.cleanStreak + ' / ' + ECON.netZeroStreak + '개월</b></div>';
    html += '<div class="row"><span>남은 기간</span><b>' + left + '년</b></div>';
  }
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
  document.getElementById('city-cost').innerHTML = fmt(cityFoundCost(state)) + '억' + (state.cities.length >= 3 ? ' <small class="muted">(도시가 늘수록 비싸짐)</small>' : '');
  const draft = state.cityDraft;
  document.getElementById('city-count').textContent = draft ? draft.tiles.length : 0;
  document.getElementById('city-start').classList.toggle('hidden', !!draft);
  document.getElementById('city-confirm').classList.toggle('hidden', !draft);
  document.getElementById('city-cancel').classList.toggle('hidden', !draft);
}

// ------------------------------------------------------------
// 테크트리 탭
// ------------------------------------------------------------
function renderTech(state) {
  const grid = document.getElementById('tech-grid');
  let html = '';
  for (const key of TECH_ORDER) {
    const tree = TECH[key];
    const lvl = state.tech[key] || 0;
    html += '<div class="tech-tree" style="border-top-color:' + tree.color + '"><h3>' + tree.name + ' <small class="muted">' + lvl + '/' + tree.tiers.length + '</small></h3>';
    tree.tiers.forEach((tier, i) => {
      const cls = i < lvl ? 'done' : i === lvl ? 'next' : 'locked';
      html += '<div class="tier ' + cls + '">' +
        '<div class="t-name">' + (i < lvl ? '✓ ' : (i + 1) + '단계 · ') + tier.name + '</div>' +
        '<div class="t-effect">' + tier.effect + '</div>' +
        '<div class="t-desc">' + tier.desc + '</div>';
      if (i === lvl) {
        const busy = state.techBusy && state.techBusy[key];
        if (busy) {
          html += '<div class="t-foot"><span class="warn">🔬 연구 진행 중 · ' + busy.months + '개월 남음 (시작 시 확률 ' + pct(busy.prob) + ')</span></div>';
        } else {
          const p = techSuccessProb(state, key);
          const need = techGate(state, key);
          const gated = need > 0;
          const full = researchActive(state) >= researchSlots(state);
          html += '<div class="t-foot"><span>' + fmt(tier.cost) + '억 · ' + TECH_RESEARCH_MONTHS + '개월 · 성공 <span class="t-prob">' + pct(p) + '</span>' +
            ((state.techPity && state.techPity[key]) ? ' <small class="muted">(실패 누적 +' + pct(state.techPity[key]) + ')</small>' : '') +
            (gated ? ' <small class="warn">🔒 R&D ' + need + ' 필요</small>' : '') +
            (!gated && full ? ' <small class="warn">동시 연구 한도</small>' : '') + '</span>' +
            '<button class="small primary" data-tech="' + key + '" ' + (gated || full || state.money < tier.cost || state.finished ? 'disabled' : '') + '>연구 시작</button></div>';
        }
      } else if (i > lvl) {
        html += '<div class="t-foot"><span class="muted">' + fmt(tier.cost) + '억 · 기본 ' + pct(tier.base) + (tierGate(key, i) ? ' · R&D ' + tierGate(key, i) + ' 필요' : '') + '</span></div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }
  grid.innerHTML = html;

  const log = (state.techLog || []).filter((e) => !e.rd);   // 예전 저장에 섞인 강화 기록은 제외
  document.getElementById('tech-log').innerHTML = log.length
    ? log.map((e) => '<div class="' + (e.success ? 'log-ok' : 'log-fail') + '">' + e.year + '년 ' + e.month + '월 · ' +
        (e.rd ? '강화 ' : '연구 ') + e.name + ' · ' + fmt(e.cost) + '억 · ' + pct(e.prob) + ' → ' + (e.success ? '성공' : '실패') + (e.resigned ? ' · ' + e.resigned + ' 1명 책임 퇴사' : '') + '</div>').join('')
    : '<p class="muted">아직 연구 기록이 없습니다.</p>';
}

// ------------------------------------------------------------
// R&D 탭
// ------------------------------------------------------------
function renderRD(state) {
  const lv = rdLevel(state);
  const total = RD_STAGES.reduce((s, st) => s + (state.rd[st.id] || 0), 0);
  document.getElementById('rd-summary').innerHTML =
    '<div class="summary-card"><div class="label">R&D 수준</div><div class="value">' + fmt(lv) + '</div></div>' +
    '<div class="summary-card"><div class="label">연구원</div><div class="value">' + total + '명</div></div>' +
    '<div class="summary-card"><div class="label">월 인건비</div><div class="value">' + fmt(rdSalary(state), 1) + '억</div></div>' +
    '<div class="summary-card"><div class="label">동시 연구 가능</div><div class="value">' + researchActive(state) + ' / ' + researchSlots(state) + '개</div><div class="sub muted">R&D ' + RD_PER_SLOT + '마다 +1</div></div>' +
    '<div class="summary-card"><div class="label">테크 성공 확률 보너스</div><div class="value">+' + pct(rdBonus(state)) +
      (hasMaster(state) ? ' <small class="good">+대가 10%</small>' : '') + '</div></div>';

  const pk = rdPerks(state);
  document.getElementById('rd-perks').innerHTML =
    '<div class="summary-card"><div class="label">신규 건설비</div><div class="value">−' + pct(1 - pk.capexMult) + '</div><div class="sub muted">최대 −' + pct(RD_PERKS.capex) + '</div></div>' +
    '<div class="summary-card"><div class="label">공사 기간</div><div class="value">−' + pct(1 - pk.buildMult) + '</div><div class="sub muted">최대 −' + pct(RD_PERKS.build) + '</div></div>' +
    '<div class="summary-card"><div class="label">설비 유지비</div><div class="value">−' + pct(1 - pk.omMult) + '</div><div class="sub muted">최대 −' + pct(RD_PERKS.om) + '</div></div>' +
    '<div class="summary-card"><div class="label">노후 시작 시점</div><div class="value">수명의 ' + pct(pk.agingStart) + '</div><div class="sub muted">기본 ' + pct(ECON.agingStart) + ', 최대 ' + pct(ECON.agingStart + RD_PERKS.aging) + '</div></div>' +
    '<div class="summary-card"><div class="label">특허·기술 수출 수입</div><div class="value">' + fmt(pk.patent, 1) + '억/월</div><div class="sub muted">수준 × ' + RD_PERKS.patent + '억</div></div>' +
    '<div class="summary-card"><div class="label">연구원 단계 효과</div><div class="value" style="font-size:0.9rem">' +
      (hasMaster(state) ? '<span class="good">대가: 모든 연구 +10%</span>' : '대가 영입 시 모든 연구 +10%') + '<br>' +
      (hasSenior(state) ? '<span class="good">중견 이상: 실패 누적 +12%</span>' : '중견 이상 영입 시 실패 누적 +8% → +12%') + '</div></div>';

  let html = '<div class="rd-row head"><span>단계</span><span>능력</span><span>인원</span><span>월급</span><span>영입</span><span>강화 (다음 단계로)</span></div>';
  RD_STAGES.forEach((st, i) => {
    const locked = lv < st.unlock;
    const count = state.rd[st.id] || 0;
    const next = RD_STAGES[i + 1];
    html += '<div class="rd-row' + (locked ? ' locked' : '') + '">' +
      '<div><div class="name">' + st.name + '</div><div class="sub">' + (locked ? '🔒 R&D 수준 ' + st.unlock + ' 필요' : '해금됨') + '</div>' +
        '<div class="sub">' + (st.attrition > 0 ? '자연 퇴사 ' + fmt(st.attrition * 100) + '%/월' : st.blame ? '연구 실패 시 30% 확률로 책임 퇴사 · 30년 뒤 은퇴' : '퇴사 없음 · 30년 뒤 은퇴') + '</div></div>' +
      '<div>' + st.ability + '<div class="sub">/명</div></div>' +
      '<div class="count">' + count + '</div>' +
      '<div>' + fmt(st.salary, 1) + '억<div class="sub">/명</div></div>' +
      '<div><button class="small primary" data-rd-buy="' + i + '" ' + (locked || state.hiredThisMonth || state.money < researcherCost(state, st) || state.finished ? 'disabled' : '') + '>' + fmt(researcherCost(state, st)) + '억</button>' + (state.hiredThisMonth ? '<div class="sub">이번 달 영입 완료</div>' : '') + '</div>' +
      '<div>' + (next
        ? '<button class="small" data-rd-up="' + i + '" ' + (count <= 0 || state.upgradedThisMonth || state.money < st.upgradeCost || state.finished ? 'disabled' : '') + '>' +
          st.name + ' → ' + next.name + ' · ' + fmt(st.upgradeCost) + '억 · ' + pct(st.upgradeProb) + '</button>' +
          '<div class="sub">강화 성공까지 기대 ' + fmt(st.upgradeCost / st.upgradeProb) + '억 → ' + st.name + ' 영입비 포함 ' + fmt(researcherCost(state, st) + st.upgradeCost / st.upgradeProb) + '억 (직접 영입 ' + fmt(researcherCost(state, next)) + '억)</div>'
        : '<span class="muted">최고 단계</span>') + '</div>' +
      '</div>';
  });
  document.getElementById('rd-table').innerHTML = html;
}

// ------------------------------------------------------------
// 결산 창
// ------------------------------------------------------------
function renderReport(report) {
  document.getElementById('report-title').textContent = state.playerName + ' 대통령의 ' + report.year + '년 ' + report.month + '월 결산';

  const evRoot = document.getElementById('report-events');
  let ev = '<span class="ev">' + report.weather.seasonName + ' · ' + report.weather.sky + ' · ' + report.weather.wind + ' · ' + (report.weather.temp + ((report.event && report.event.tempDelta) || 0)) + '℃</span><span class="ev">' + weatherEffectsText(report.weather, report.event) + '</span>';
  if (report.event) ev += '<span class="ev warn">⚠ ' + report.event.name + ': ' + report.event.desc + '</span>';
  if (report.blackoutHours > 0) ev += '<span class="ev bad">정전 ' + report.blackoutHours + '시간대 · 미공급 ' + fmtMWh(report.energy.unmet) + '</span>';
  if (report.freqHours > 0) ev += '<span class="ev bad">주파수 사고 ' + report.freqHours + '시간대 (재생e 비중 ' + fmt(report.maxRenShare * 100) + '%)</span>';
  if (report.energy.curtail > 0) ev += '<span class="ev warn">재생e 출력 제한 ' + fmtMWh(report.energy.curtail) + '</span>';
  if (report.energy.rampShort > 0) ev += '<span class="ev bad">램프 부족 (출력을 제때 못 올림) ' + fmtMWh(report.energy.rampShort) + '</span>';
  if (report.energy.over > 0) ev += '<span class="ev warn">과잉 발전 ' + fmtMWh(report.energy.over) + '</span>';
  if (report.energy.h2 && report.energy.h2.prod > 0) ev += '<span class="ev good">💧 수소 생산 ' + fmt(report.energy.h2.prod / 1000, 1) + ' t · 터빈 연료 ' + fmt(report.energy.h2.burn / 1000, 1) + ' t (' + fmtMWh(report.energy.h2.gen) + ' 대체) · 수출 ' + fmt(report.energy.h2.export / 1000, 1) + ' t</span>';
  for (const n of report.notices || []) ev += '<span class="ev warn">' + n + '</span>';
  for (const n of report.questNotices || []) ev += '<span class="ev ' + (n.startsWith('✕') ? 'bad' : 'good') + '">' + n + '</span>';
  evRoot.innerHTML = ev;

  const H = report.hours;
  drawChart(document.getElementById('report-chart'), {
    stacks: [
      { color: '#f06292', values: H.map((h) => h.nuclear) },
      { color: '#546e7a', values: H.map((h) => h.coal) },
      { color: '#e53935', values: H.map((h) => h.ccgt) },
      { color: '#ff9100', values: H.map((h) => h.gt) },
      { color: '#ffee58', values: H.map((h) => h.solar) },
      { color: '#81d4fa', values: H.map((h) => h.wind) },
      { color: '#26c6da', values: H.map((h) => h.essOut || 0) },
      { color: '#ab47bc', values: H.map((h) => h.imp) },
    ],
    lines: [{ color: '#ffffff', values: H.map((h) => h.demand), width: 2.5 }],
    right: { color: '#b39ddb', values: H.map((h) => h.smp), label: '원/kWh', dash: [5, 4] },
    yLabel: 'MW',
  });

  const m = report.money, e = report.energy;
  const row = (label, v, cls) => '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + v + '</b></div>';
  const eok = (v) => fmt(v, 1) + ' 억';

  let left = '<h3>수입</h3>';
  left += row('전력 판매 (평균 SMP ' + fmt(report.avgSmp) + '원/kWh)', eok(m.energyRev));
  left += row('용량 요금', eok(m.capPay));
  left += row('세수 (전력산업기반기금)', eok(m.tax || 0));
  if (m.h2Rev) left += row('수소 수출 순이익 (마진)', eok(m.h2Rev), m.h2Rev < 0 ? 'warn' : '');
  if (m.h2Fuel) left += row('암모니아 연료비 (수소 터빈)', eok(m.h2Fuel), 'warn');
  if (m.patent) left += row('특허·기술 수출 (R&D)', eok(m.patent), 'good');
  if (m.rec) left += row('재생에너지 보조금 (REC)', eok(m.rec));
  if (m.exportRev) left += row('전력 수출 (' + fmtMWh(e.exp) + ' · 평균 ' + fmt(m.exportRev * 1e8 / (e.exp * 1000)) + '원/kWh)', eok(m.exportRev));
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
  left += row('지출 합계', eok(m.expense), 'total');
  left += row('이번 달 손익', (m.profit >= 0 ? '+' : '') + eok(m.profit), 'total ' + (m.profit >= 0 ? 'good' : 'bad'));

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
  if (e.essOut) right += row('· ESS 방전 / 충전', fmtMWh(e.essOut) + ' / ' + fmtMWh(e.essIn));
  right += '<h3 style="margin-top:12px">계통</h3>';
  right += row('탄소 배출', fmt(e.co2) + ' t', e.co2 === 0 ? 'good' : '');
  right += row('정전 시간대', report.blackoutHours + ' / 24', report.blackoutHours ? 'bad' : 'good');
  right += row('최대 비관성 비중', fmt(report.maxRenShare * 100) + '%', report.maxRenShare > techMods(state).inertiaLimit ? 'bad' : '');
  if (report.tempFactor !== 1) right += row('외기온에 따른 가스터빈 출력', (report.tempFactor >= 1 ? '+' : '') + fmt((report.tempFactor - 1) * 100, 1) + '%');

  if (report.happiness) {
    const hp = report.happiness;
    right += '<h3 style="margin-top:12px">국민 행복도</h3>';
    for (const it of hp.items) right += row(it.label, (it.delta > 0 ? '+' : '') + fmt(it.delta, 1), it.delta > 0 ? 'good' : 'bad');
    right += row('행복도', fmt(hp.before) + ' → ' + fmt(hp.after), 'total ' + (hp.after < 45 ? 'bad' : hp.after >= 70 ? 'good' : ''));
    if (hp.after < ECON.happinessGameOver + 15) right += '<div class="row bad"><span>⚠ ' + ECON.happinessGameOver + ' 아래로 떨어지면 사업 허가가 취소됩니다</span></div>';
  }

  document.getElementById('report-body').innerHTML = '<div>' + left + '</div><div>' + right + '</div>';
}

// ------------------------------------------------------------
// 24시간 그래프
// ------------------------------------------------------------
// ------------------------------------------------------------
// 사건 창과 목표 패널
// ------------------------------------------------------------
function renderDecision(state) {
  const pd = state.pendingDecision;
  if (!pd) return;
  const def = decisionById(pd.id);
  document.getElementById('decision-icon').textContent = def.icon;
  document.getElementById('decision-name').textContent = def.name;
  document.getElementById('decision-desc').textContent = def.desc;
  document.getElementById('decision-choices').innerHTML = def.choices.map((c, i) =>
    '<button class="choice" data-choice="' + i + '"' + (c.cost && state.money < c.cost(state) ? ' disabled title="자금이 부족합니다"' : '') + '><strong>' + c.label + (c.cost && state.money < c.cost(state) ? ' <small>(자금 부족)</small>' : '') + '</strong><span>' + (typeof c.desc === 'function' ? c.desc(state) : c.desc) + '</span></button>').join('');
  document.getElementById('decision-choices').classList.remove('hidden');
  document.getElementById('decision-result').classList.add('hidden');
  document.getElementById('decision-close').classList.add('hidden');
  document.getElementById('decision').classList.remove('hidden');
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
  // 현재 정책 노선
  const pol = state.policies || {};
  const polKeys = Object.keys(POLICIES);
  const set = polKeys.filter((k) => pol[k]);
  let html = '';   // 정책 노선·효과·일지는 지도 아래 정책 패널로 옮김
  for (const q of active) {
    const def = questById(q.id);
    if (!def) continue;
    const left = q.deadline - now + 1;
    // 한 줄 요약: 제목 · 진행 · 남은 기간. 설명·보상·벌칙은 마우스를 올리면(툴팁)
    const tip = (def.desc + '\n보상 ' + rewardText(def) + ' · 실패 시 ' + penaltyText(def)).replace(/"/g, '&quot;');
    html += '<div class="quest" title="' + tip + '"><div class="t"><span>' + def.icon + ' ' + def.title + '</span><span class="due' + (left <= 3 ? ' bad' : '') + '">' + left + '개월</span></div>' +
      '<div class="p">진행 <b>' + def.progress(state, q) + '</b></div></div>';
  }
  if (!html) html = '<p class="muted" style="font-size:0.8rem">지금은 목표가 없습니다. 새 목표는 몇 달 안에 주어집니다.</p>';
  el.innerHTML = html;
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
    '자금 ' + fmt(Math.round(state.money)) + '억 · 행복도 ' + fmt(state.happiness) + ' · 인구 ' + fmt(state.cities.reduce((s, x) => s + x.pop, 0)) + '만 (도시 ' + state.cities.length + ') · R&D ' + rdLevel(state) + (sc ? ' · 점수 ' + sc.raw + ' (행복 ' + sc.parts.happy + '/시스템 ' + sc.parts.system + '/탄소 ' + sc.parts.carbon + '/경제 ' + sc.parts.economy + '/자본 ' + sc.parts.capital + ')' : ''),
    '최대 수요 ' + fmt(peak) + ' MW · 조절 가능 ' + fmt(c.gt + c.ccgt + c.coal + c.nuclear + c.smr) + ' MW · 재생 ' + fmt(c.solar + c.wind) + ' MW · ESS ' + fmt(c.ess) + ' MW · 크래킹 ' + fmt(c.h2) + ' MW분 · 연계선 ' + fmt(c.link) + ' MW · 여유율 ' + fmt(supplyDemandRatio(state) * 100) + '%',
    '설비: ' + (fleet || '없음'),
    '테크: ' + TECH_ORDER.map((k) => k + (state.tech[k] || 0)).join(' ') + ' · 정책: ' + pol,
    r ? '지난달: 순이익 ' + fmt(Math.round(r.money.profit)) + '억 (발전 ' + fmt(Math.round(r.money.energyRev)) + ' 연료 ' + fmt(Math.round(r.money.fuel)) + ' 탄소세 ' + fmt(Math.round(r.money.carbon)) + ' 수출 ' + fmt(Math.round(r.money.exportRev)) + ' 수소 ' + fmt(Math.round(r.money.h2Rev || 0)) + ') · 정전 ' + r.blackoutHours + 'h · 배출 ' + fmt(Math.round(r.energy.co2)) + ' t (원단위 ' + reportIntensity(r).toFixed(2) + ', 기준 ' + (intensityTarget(state) === null ? '없음' : intensityTarget(state).toFixed(2)) + ') · SMP ' + fmt(r.hours.reduce((s, h) => s + h.smp, 0) / 24) + '원 · 출력제한 ' + fmtMWh(r.energy.curtail) + ' · 행복도 항목 ' + r.happiness.items.map((i) => i.label + (i.delta > 0 ? '+' : '') + i.delta).join(', ') : '지난달 결산 없음',
        r && r.energy.h2 && r.energy.h2.prod > 0 ? '수소: 크래킹 생산 ' + fmt(r.energy.h2.prod / 1000, 1) + 't 터빈 ' + fmt(r.energy.h2.burn / 1000, 1) + 't (' + fmtMWh(r.energy.h2.gen) + ' 대체) 수출 ' + fmt(r.energy.h2.export / 1000, 1) + 't · 암모니아 연료비 ' + fmt(Math.round(r.money.h2Fuel || 0)) + '억' : '수소: 없음',
    '목표: ' + ((state.quests || []).filter((q) => q.status === 'active').map((q) => questById(q.id).title).join(', ') || '없음') + ' · 진행 중 효과: ' + (effectsNow(state).list.map((e) => e.name + '(' + e.left + '개월)').join(', ') || '없음'),
  ];
  return lines.filter(Boolean).join('\n');
}

// ------------------------------------------------------------
// 엔딩 화면: 요약 카드 + 진행 흐름 그래프 + 랭킹
// ------------------------------------------------------------
const MODE_LABEL = { normal: '일반 20년', free: '무한(구)', netzero: '탄소중립' };
const REASON_LABEL = { complete: '완주 🎉', netzero: '달성 🎉', impeached: '탄핵', bankrupt: '국가 부도', timeout: '기한 만료', resigned: '자진 사퇴' };

function renderEnding(state, s) {
  const yrs = Math.floor(s.years), mos = Math.round((s.years - yrs) * 12);
  const cards = [
    ['재임 기간', yrs + '년 ' + mos + '개월', (state.startYear || ECON.startYear) + '년 ' + (state.startMonth || ECON.startMonth) + '월 ~ ' + s.endYear + '년 ' + s.endMonth + '월'],
    ['평균 국민 행복도', fmt(s.avgHappy, 1), '집권 기간 전체 평균'],
    ['최종 자금', fmt(s.money) + '억', s.money < 0 ? '부채' : ''],
    ['누적 탄소 배출', fmt(Math.round(s.co2Total / 1000)) + '천 t', ''],
    ['누적 정전', s.blackoutTotal + '시간대', ''],
  ];
  const p = s.scoreParts || {}, d = s.scoreDetail || {};
  const bar = (label, val, sub, hint) => '<div class="sb"><div class="l"><span>' + label + '</span><b>' + fmt(val) + ' / 100</b></div><div class="bar"><i style="width:' + clamp(val, 0, 100) + '%"></i></div><div class="s">' + sub + '</div>' + (hint ? '<div class="c">' + hint + '</div>' : '') + '</div>';
  const hint = scoreHints(state, s);
  const scoreCard = '<div class="card score-card"><div class="k">🏆 국정 운영 점수 (1,000점 만점)' + (s.termFactor < 1 ? ' · 임기 미완주 감점 ×' + fmt(s.termFactor, 2) : '') + '</div><div class="v">' + fmt(s.score) + '점</div>' +
    '<div class="score-bars">' +
    bar('국민 행복', p.happy || 0, '집권 기간 평균 행복도', hint.happy) +
    bar('전력 시스템', p.system || 0, '무정전 ' + fmt(d.reliability || 0) + '% · 기술 ' + (d.tiers || 0) + '/' + (d.tiersMax || 30), hint.system) +
    bar('탄소', p.carbon || 0, '최근 3년 ' + (d.intenLast !== undefined ? d.intenLast.toFixed(2) : '-') + ' · 기간 평균 ' + (d.intenAvg !== undefined ? d.intenAvg.toFixed(2) : '-') + ' t/MWh (0.10 이하면 100 · 최근 3년 70%)', hint.carbon) +
    bar('경제', p.economy || 0, '성장 ' + (d.growth || 0) + '/50 (인구 ' + fmt(d.popRatio || 1, 1) + '배 · 10배면 50) · 교역 ' + (d.trade || 0) + '/50 (수출 전력이 국내 소비의 ' + fmt((d.tradeShare || 0) * 100, 1) + '% · ' + fmt(ECON.tradeShareFull * 100) + '%면 50)', hint.economy) +
    bar('자본', p.capital || 0, '자금 + 설비 가치 절반 = ' + fmt(d.worth || 0) + '억 (20만억이면 100)', hint.capital) +
    '</div></div>';
  document.getElementById('ending-stats').innerHTML = scoreCard + cards.map((c) =>
    '<div class="card"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div><div class="s">' + c[2] + '</div></div>').join('');

  const h = state.history;
  const years = h.map((x) => x.year + (x.month - 1) / 12);
  drawSeries(document.getElementById('traj-1'), {
    x: years,
    left: [{ values: h.map((x) => x.money !== undefined ? x.money : 0), color: '#ffd600', width: 2 }],
    right: [{ values: h.map((x) => x.happy !== undefined ? x.happy : 0), color: '#66bb6a', width: 2 }],
    rightMax: 100, leftLabel: '억', rightLabel: '행복도',
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
  // 전기값과 탄소 원단위·기준선: 행복도가 왜 흔들렸는지(요금), 기준을 언제부터 넘겼는지(탄소)
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

// 이벤트 기록: '주요만'은 정책 결정·첫 설비·새 도시·연구 성공·사건 선택만, '전체'는 목표·R&D 수준까지 전부
const EV_MAJOR = /정책|첫 |새 도시|연구 성공|→|완공|탄핵|부도|위기/;
const EV_MINOR = /새 목표|목표 달성|R&D 수준/;
function renderEndingEvents(state, mode) {
  const all = state.milestones || [];
  const evs = mode === 'all' ? all : all.filter((e) => EV_MAJOR.test(e.text) && !EV_MINOR.test(e.text));
  document.getElementById('ending-events').innerHTML = evs.length
    ? evs.map((e) => '<div class="ev"><span class="d">' + e.year + '년 ' + e.month + '월</span><span>' + e.text + '</span></div>').join('')
    : '<p class="muted" style="margin:4px 0">기록된 이벤트가 없습니다.</p>';
  for (const b of document.querySelectorAll('.ev-filter button')) b.classList.toggle('on', b.dataset.evf === mode);
}
document.addEventListener('click', (e) => { const b = e.target.closest('.ev-filter button'); if (b && typeof state === 'object' && state) renderEndingEvents(state, b.dataset.evf); });

// 항목별 한 줄 코칭: 이번 판에서 점수를 깎은 이유와 다음 판을 위한 힌트
function scoreHints(state, s) {
  const h = state.history || []; const p = s.scoreParts || {}, d = s.scoreDetail || {};
  const out = {};
  const neg = {}; for (const x of h) for (const k in (x.hneg || {})) neg[k] = (neg[k] || 0) + x.hneg[k];
  const top = Object.entries(neg).sort((a, b) => a[1] - b[1]).filter(([k]) => HAPPY_CAUSE[k])[0];
  out.happy = (p.happy || 0) >= 90 ? '국민이 내내 만족했습니다.' : top ? '가장 많이 깎은 요인은 ' + HAPPY_CAUSE[top[0]][0] + '(누적 ' + fmt(top[1]) + ')입니다. ' + HAPPY_CAUSE[top[0]][1] : '';
  const boM = d.blackoutMonths !== undefined ? d.blackoutMonths : h.filter((x) => x.blackoutHours > 0).length;
  out.system = (boM > 12 ? '정전이 있었던 달이 ' + boM + '개월입니다. 예비력 10~20%를 미리 확보하세요. ' : '') + ((d.tiers || 0) < (d.tiersMax || 36) * 0.6 ? '기술 단계가 ' + (d.tiers || 0) + '/' + (d.tiersMax || 36) + '입니다. R&D를 꾸준히 올리면 계통 점수가 오릅니다.' : '');
  out.carbon = d.cleanYear ? ((p.carbon || 0) < 80 ? '무탄소 전환(원단위 0.20 아래)이 ' + d.cleanYear + '년차에 시작됐습니다. 10년차 안에 시작하면 기간 평균이 크게 내려갑니다.' : d.cleanYear + '년차에 전환을 시작해 평균도 낮게 유지했습니다.') : '임기 중 원단위가 0.20 아래로 내려간 적이 없습니다. 원전·재생·수소 어느 쪽이든 전환을 시작해야 합니다.';
  out.economy = ((d.growth || 0) < 25 ? '조절 전원을 수요보다 앞서 깔면 산업·인구가 더 들어와 성장 점수가 오릅니다. ' : '') + ((d.trade || 0) < 10 ? '연계선을 깔아 남는 전기(낮의 재생·밤의 원전)를 이웃 나라에 팔면 교역 점수가 생깁니다.' : '');
  out.capital = (p.capital || 0) < 70 ? '마지막 자산이 ' + fmt(d.worth || 0) + '억입니다. 설비 투자는 절반이 자산으로 남으니, 남는 돈은 수익 설비에 쓰는 편이 낫습니다.' : '';
  return out;
}

// 엔딩 원인 분석: 한두 줄로 "왜 이렇게 끝났는지"
const HAPPY_CAUSE = {
  'nuisance:nuclear': ['도시 근처 원전에 대한 반발', '원전은 도시에서 멀리(안전성 설계 후 4칸 이상) 떨어뜨려 지으세요.'],
  'nuisance:wind':    ['도시 근처 풍력 소음', '풍력은 도시에서 4칸 이상 떨어진 해안이나 바다에 지으세요.'],
  'nuisance:coal':    ['석탄 매연', '석탄은 도시에서 5칸 이상 떨어뜨리거나 IGCC·CCS로 넘어가세요.'],
  crowd:     ['도시 과밀', '도시 탭에서 새 도시를 세워 인구를 나누면 바로 풀립니다.'],
  intensity: ['탄소 배출 기준 초과', '가스·석탄만으로는 기준을 못 맞춥니다. R&D → 원자력·SMR·재생에너지로 전환해야 합니다.'],
  co2:       ['과다한 탄소 배출', '석탄 비중을 줄이거나 무탄소 전원을 늘리세요.'],
  smp:       ['비싼 전기 요금', '연료비가 싼 기저 전원(원전·석탄)이나 재생에너지를 늘리면 SMP가 내려갑니다.'],
  blackout:  ['정전', '최대 수요보다 10~20% 넉넉한 원전·화력 같은 조절 발전 설비를 미리 지어 두세요. 설비 수명도 확인하세요.'],
  freq:      ['주파수 사고', '재생에너지 비중이 관성 한도를 넘었습니다. 계통 테크나 관성 전원이 필요합니다.'],
};
function analyzeEnding(state, s) {
  const h = state.history;
  if (!h.length) return [];
  const lines = [];
  const recent = h.slice(-36);
  const first = h.slice(0, 12), last = h.slice(-12);
  const avg = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0) / Math.max(1, arr.length);

  if (s.reason === 'impeached') {
    const neg = {};
    for (const x of recent) for (const k in (x.hneg || {})) neg[k] = (neg[k] || 0) + x.hneg[k];
    const ranked = Object.entries(neg).sort((a, b) => a[1] - b[1]).filter(([k]) => HAPPY_CAUSE[k]);
    if (ranked.length) {
      const total = ranked.reduce((a, [, v]) => a + v, 0);
      const top = ranked.slice(0, 2).map(([k, v]) => HAPPY_CAUSE[k][0] + ' (' + Math.round(v / total * 100) + '%)');
      lines.push('<span class="k">주요 원인</span>최근 3년 동안 행복도를 깎은 것은 ' + top.join(', ') + '이었습니다.');
      lines.push('<span class="k">조언</span>' + HAPPY_CAUSE[ranked[0][0]][1]);
    } else lines.push('<span class="k">주요 원인</span>행복도가 회복될 틈 없이 떨어졌습니다.');
  } else if (s.reason === 'resigned') {
    lines.push('<span class="k">주요 원인</span>임기 도중 스스로 물러났습니다. 국정 운영 점수는 채운 임기 비율만큼만 반영됩니다.');
  } else if (s.reason === 'bankrupt') {
    const r24 = h.slice(-24);
    const profit = avg(r24, 'profit');
    if (profit < 0) {
      const exp = { 연료비: avg(r24, 'fuel'), 탄소세: avg(r24, 'carbon'), '연구원 인건비': avg(r24, 'salary'), '정전 비용': avg(r24, 'blk'), '과잉 발전 비용': avg(r24, 'over'), '수입 전력 비용': avg(r24, 'imp') };
      const big = Object.entries(exp).sort((a, b) => b[1] - a[1])[0];
      lines.push('<span class="k">주요 원인</span>최근 2년 동안 매달 평균 ' + fmt(-profit) + '억 원 적자였습니다. 가장 큰 지출은 ' + big[0] + '(월 ' + fmt(big[1]) + '억)입니다.');
      lines.push('<span class="k">조언</span>' + (big[0] === '정전 비용' ? '설비가 부족합니다. 수요보다 넉넉히 지으세요.' : big[0] === '과잉 발전 비용' ? '출력을 못 줄이는 원전·석탄이 야간 수요보다 큽니다. 기저 전원은 최소 수요만큼만 지으세요.' : '수입보다 지출이 큽니다. 연료비가 싼 전원으로 바꾸거나 연구소 규모를 줄이세요.'));
    } else {
      lines.push('<span class="k">주요 원인</span>운영 자체는 흑자(월 평균 ' + fmt(profit) + '억)였지만, 건설·연구 투자에 수입보다 많은 돈을 써서 부채가 쌓였습니다.');
      lines.push('<span class="k">조언</span>큰 설비는 자금을 모아 한 번에, 연구원 영입은 흑자 범위 안에서 하세요.');
    }
  } else if (s.reason === 'timeout') {
    const cut = state.co2Baseline ? 1 - avg(last, 'inten') / state.co2Baseline : 0;
    lines.push('<span class="k">주요 원인</span>마지막 해 배출량이 첫해보다 ' + fmt(cut * 100) + '% 줄어드는 데 그쳤습니다. 목표는 80% 감축을 12개월 연속 유지하는 것이었습니다.');
    lines.push('<span class="k">조언</span>가스 발전이 남아 있는 한 달성이 어렵습니다. 원전·SMR로 기저를, ESS로 저녁 피크를 채우세요.');
  } else {
    // 완주 · 탄소중립 달성
    const co2Cut = avg(first, 'co2') > 0 ? 1 - avg(last, 'co2') / avg(first, 'co2') : 0;
    const mix = [];
    if (avg(last, 'nuc') > 0.3) mix.push('원자력 ' + fmt(avg(last, 'nuc') * 100) + '%');
    if (avg(last, 'ren') > 0.2) mix.push('재생에너지 ' + fmt(avg(last, 'ren') * 100) + '%');
    const inten0 = avg(first, 'inten'), inten1 = avg(last, 'inten');
    const intenCut = inten0 > 0 ? 1 - inten1 / inten0 : 0;
    lines.push('<span class="k">총평</span>평균 행복도 ' + fmt(s.avgHappy, 1) + ', 발전량당 탄소(원단위)는 첫해 ' + inten0.toFixed(2) + ' → 마지막 해 ' + inten1.toFixed(2) + ' t/MWh (' + (intenCut >= 0 ? '−' + fmt(intenCut * 100) + '%' : '+' + fmt(-intenCut * 100) + '%') + ')' +
      (co2Cut >= 0 ? ', 총배출량은 ' + fmt(co2Cut * 100) + '% 줄었습니다' : ', 총배출량은 나라가 커져 ' + fmt(-co2Cut * 100) + '% 늘었습니다') +
      (mix.length ? '. 마지막 해 발전 비중은 ' + mix.join(' · ') + '입니다.' : '.'));
    const minH = h.reduce((a, x) => x.happy < a.happy ? x : a, h[0]);
    const worst = {};
    for (const x of h) for (const k in (x.hneg || {})) worst[k] = (worst[k] || 0) + x.hneg[k];
    const w = Object.entries(worst).sort((a, b) => a[1] - b[1]).filter(([k]) => HAPPY_CAUSE[k])[0];
    lines.push('<span class="k">고비</span>행복도가 가장 낮았던 때는 ' + minH.year + '년 ' + minH.month + '월(' + fmt(minH.happy) + ')이었고' + (w ? ', 가장 자주 발목을 잡은 것은 ' + HAPPY_CAUSE[w[0]][0] + '이었습니다.' : '.'));
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
  const tabKey = box.dataset.tab || 'money';
  box.dataset.highlight = opts.highlight || '';
  box.dataset.limit = opts.limit || '';
  const all = loadRankings();
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
  const mainCol = { score: '종합 점수', money: '최종 자금', happy: '평균 행복도', years: '재임 기간' }[tabKey];
  html += '<table class="rank-table"><tr><th>#</th><th>이름</th><th>모드</th><th>결과</th><th class="main">' + mainCol + '</th>' +
    (tabKey !== 'years' ? '<th>재임</th>' : '') + (tabKey !== 'happy' ? '<th>평균 행복도</th>' : '') + (tabKey !== 'money' ? '<th>최종 자금</th>' : '') +
    '<th>날짜</th>' + (opts.deletable ? '<th></th>' : '') + '</tr>';
  list.forEach((r, i) => {
    const main = tabKey === 'score' ? fmt(r.score || 0) + '점' : tabKey === 'money' ? fmt(r.money) + '억' : tabKey === 'happy' ? fmt(r.avgHappy, 1) : fmt(r.years, 1) + '년';
    html += '<tr' + (opts.highlight && r.id === opts.highlight ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + escapeHtml(r.name) + '</td><td>' + (MODE_LABEL[r.mode] || r.mode) + '</td><td>' + (REASON_LABEL[r.reason] || r.reason) + '</td>' +
      '<td class="main"><b>' + main + '</b></td>' +
      (tabKey !== 'years' ? '<td>' + fmt(r.years, 1) + '년</td>' : '') + (tabKey !== 'happy' ? '<td>' + fmt(r.avgHappy, 1) + '</td>' : '') + (tabKey !== 'money' ? '<td>' + fmt(r.money) + '억</td>' : '') +
      '<td>' + (r.date || '') + '</td>' +
      (opts.deletable ? '<td><button class="small del" data-rank-del="' + r.id + '">삭제</button></td>' : '') + '</tr>';
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
    const aspect = opts.aspect || (parseInt(canvas.getAttribute('height'), 10) / parseInt(canvas.getAttribute('width'), 10)) || 0.4;
    const dpr = window.devicePixelRatio || 1;
    const cssH = Math.round(cssW * aspect);
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
    ctx.fillStyle = s.color; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    // 띠 이름을 가장 두꺼운 시각에 적음 (띠가 충분히 두꺼울 때만)
    if (s.label) {
      let bh = 0, best = 0;
      for (let h = 0; h < 24; h++) { const th = yOf(base[h]) - yOf(base[h] + s.values[h]); if (th > best) { best = th; bh = h; } }
      if (best >= 18) {
        ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = s.labelColor || 'rgba(0,0,0,0.75)';
        ctx.fillText(s.label, xOf(bh), yOf(base[bh] + s.values[bh] / 2));
      }
    }
    for (let h = 0; h < 24; h++) base[h] += s.values[h];
  }
  // 부족 구간: 수요선이 공급(쌓인 면적) 위로 올라가는 시간대를 빨갛게 칠함
  if (opts.deficit) {
    const top = new Array(24).fill(0);
    for (const s of opts.stacks || []) for (let h = 0; h < 24; h++) top[h] += s.values[h];
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
    ctx.fillStyle = opts.peakLabel.color || '#ffd600'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = hi > 18 ? 'right' : 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('최대 ' + fmt(vals[hi]) + ' MW · ' + hi + '시', xOf(hi) + (hi > 18 ? -6 : 6), yOf(vals[hi]) - 4);
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
    ctx.fillText(r.label, W - padR + 6, padT - 12);
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

// 날씨가 발전원에 미치는 영향 한 줄: 태양광·풍력 이용률(이번 달 시간 평균), 가스 발전(터빈·복합) 외기온 출력 배율
function weatherEffectsText(w, ev) {
  ev = ev || {};
  const solarAvg = w.solarHourly.reduce((s, v) => s + v, 0) / 24 * (ev.solarMult || 1);
  const windAvg = w.windHourly.reduce((s, v) => s + Math.min(1, v * (ev.windMult !== undefined ? ev.windMult : 1)), 0) / 24;
  const tf = gtTempFactor(w.temp + (ev.tempDelta || 0));
  return '☀ 태양광 하루 평균 ' + fmt(solarAvg * 100) + '% (낮 최대 ' + fmt(Math.max.apply(null, w.solarHourly) * (ev.solarMult || 1) * 100) + '%) · 🌬 풍력 하루 평균 ' + fmt(windAvg * 100) + '% · 🔥 가스 발전(터빈·복합) 출력 ' + (tf >= 1 ? '+' : '') + fmt((tf - 1) * 100, 1) + '%';
}
// 날씨 영향을 칩 3개로 (전망 패널용)
function weatherEffectChips(w, ev) {
  ev = ev || {};
  const solarAvg = w.solarHourly.reduce((s, v) => s + v, 0) / 24 * (ev.solarMult || 1);
  const windAvg = w.windHourly.reduce((s, v) => s + Math.min(1, v * (ev.windMult !== undefined ? ev.windMult : 1)), 0) / 24;
  const tf = gtTempFactor(w.temp + (ev.tempDelta || 0));
  const solarPeak = Math.max.apply(null, w.solarHourly) * (ev.solarMult || 1);
  return ['☀ 태양광 하루 평균 ' + fmt(solarAvg * 100) + '% (낮 최대 ' + fmt(solarPeak * 100) + '%)', '🌬 풍력 하루 평균 ' + fmt(windAvg * 100) + '%', '🔥 가스 발전 ' + (tf >= 1 ? '+' : '') + fmt((tf - 1) * 100, 1) + '%'];
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
const PLANT_TREES = { gasTurbine: ['gas'], ccgt: ['gas', 'ccgt'], coal: ['coal'], nuclear: ['nuclear'], smr: ['nuclear'], solar: ['solar'], wind: ['wind'], ess: ['ess'], cracker: ['h2crack', 'h2turbine'], interconnect: ['grid'] };
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
      if (rep && !rep.classList.contains('hidden') && state.lastReport) { try { renderReport(state.lastReport); } catch (e) {} }
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
const POLICY_SHORT = { nuclear: '원자력', market: '전력시장', industry: '산업', rd: 'R&D', hydrogen: '수소' };
function renderPolicyPanel(state) {
  const el = document.getElementById('policy-info');
  if (!el || !state) return;
  const pol = state.policies || {};
  const now = state.year * 12 + state.month;
  const start = (state.startYear || ECON.startYear) * 12 + (state.startMonth || ECON.startMonth);
  let html = '';
  for (const k of Object.keys(POLICIES).sort((a, b) => (POLICIES[a].at || 0) - (POLICIES[b].at || 0))) {   // 결정 시점 순
    const P = POLICIES[k];
    const chosen = pol[k];
    const due = P.at !== undefined ? Math.max(0, P.at - (now - start)) : null;
    html += '<div class="pol-row"><span class="n">' + P.icon + ' ' + (POLICY_SHORT[k] || P.name) + '</span>' +
      (chosen ? '<span class="v" title="' + (P.options[chosen] ? P.options[chosen].desc.replace(/"/g, '&quot;') : '') + '">' + policyLabel(k, chosen) + '</span>'
              : '<span class="v muted">미정' + (due !== null ? ' · ' + (due <= 0 ? '곧 결정' : due + '개월 뒤 결정') : '') + '</span>') + '</div>';
  }
  const fx = effectsNow(state);
  if (fx.list.length) html += '<div class="pol-fx">⏳ ' + fx.list.map((f) => f.name + ' (' + f.left + '개월)').join(' · ') + '</div>';
  const log = [];
  for (const d of state.decisionLog || []) { const def = decisionById(d.id); log.push({ at: d.at, text: (def ? def.icon + ' ' + def.name : d.id) + ' → <b>' + d.choice + '</b>' }); }
  for (const q of (state.quests || [])) if (q.status !== 'active') { const def = questById(q.id); log.push({ at: q.endAt || q.deadline, text: (q.status === 'done' ? '🎉 달성: ' : '✕ 실패: ') + (def ? def.title : q.id) }); }
  log.sort((a, b) => b.at - a.at);
  const when = (at) => Math.floor(at / 12) + '년 ' + (at % 12 === 0 ? 12 : at % 12) + '월';
  if (log.length) {
    html += '<div class="pol-log">📜 최근 결정 · 결과' + log.slice(0, 2).map((l) => '<div class="pl"><span class="d">' + when(l.at) + '</span><span>' + l.text + '</span></div>').join('') +
      (log.length > 2 ? '<details class="policy-log"><summary>전체 ' + log.length + '건</summary>' + log.slice(2).map((l) => '<div class="pl"><span class="d">' + when(l.at) + '</span>' + l.text + '</div>').join('') + '</details>' : '') + '</div>';
  } else html += '<div class="pol-log muted">아직 내린 결정이 없습니다. 사건과 정책 결정이 여기에 쌓입니다.</div>';
  el.innerHTML = html;
}

const TECH_SHORT = { gas: '가스', ccgt: '복합', nuclear: '원자력', coal: '석탄', solar: '태양광', wind: '풍력', ess: 'ESS', grid: '계통', h2crack: '크래킹', h2turbine: '수소터빈' };
function renderTechRdPanel(state) {
  const el = document.getElementById('techrd-info');
  if (!el || !state) return;
  const lv = rdLevel(state);
  const staff = RD_STAGES.map((st) => ({ n: st.name, c: (state.rd || {})[st.id] || 0 })).filter((x) => x.c > 0);
  const total = staff.reduce((s, x) => s + x.c, 0);
  const gates = (typeof TECH_TIER_RD !== 'undefined') ? TECH_TIER_RD : [20, 150, 300, 400];
  const nextGate = gates.find((g) => lv < g);
  let html = '<div class="trd-head"><span>R&amp;D 수준 <b>' + fmt(lv) + '</b></span><span>연구원 <b>' + total + '명</b></span><span>동시 연구 <b>' + researchActive(state) + '/' + researchSlots(state) + '</b></span></div>';
  // 등급별 인원: 여섯 칸 (없는 등급은 흐리게)
  html += '<div class="trd-staff">' + RD_STAGES.map((st) => { const c = (state.rd || {})[st.id] || 0; return '<div class="' + (c ? 'on' : '') + '" title="' + st.name + ' · 능력 ' + st.ability + ' · 월급 ' + st.salary + '억"><b>' + c + '</b><small>' + st.name.replace(' 연구원', '') + '</small></div>'; }).join('') + '</div>';
  // R&D의 돈 흐름: 매달 나가는 인건비 vs 들어오는 특허 수입·절감 효과
  const perks = rdPerks(state), salary = rdSalary(state);
  const omSave = state.buildings.filter((b) => b.status !== 'building' && b.status !== 'demolishing').reduce((s, b) => s + plantStats(state, b.type).capex * PLANTS[b.type].omRate / 12, 0) * (1 - perks.omMult);
  html += '<div class="trd-money"><span class="bad">인건비 −' + fmt(salary, 1) + '억/월</span><span class="good">특허 +' + fmt(perks.patent, 1) + '억/월</span><span class="good">유지비 절감 +' + fmt(omSave, 1) + '억/월</span><span class="muted">건설비 −' + fmt((1 - perks.capexMult) * 100) + '% · 공사 −' + fmt((1 - perks.buildMult) * 100) + '%</span></div>';
  html += '<div class="trd-grid">';
  for (const t of TECH_ORDER) {
    const tiers = TECH[t].tiers.length, l = state.tech[t] || 0;
    const busy = state.techBusy && state.techBusy[t];
    let dots = '';
    for (let i = 0; i < tiers; i++) dots += i < l ? '<b>●</b>' : '○';
    html += '<div class="trd-row" data-tree="' + t + '" title="' + TECH[t].name + ' ' + l + '/' + tiers + '단계 · 클릭하면 테크트리 탭"><span class="n">' + (TECH_SHORT[t] || t) + '</span><span class="dots">' + dots + '</span>' + (busy ? '<span class="busy" title="연구 중 · ' + busy.months + '개월 남음">⏳' + busy.months + '</span>' : '') + '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.trd-row') || e.target.closest('#techrd-panel h2')) { if (typeof showTab === 'function') showTab('tech'); }
});

// 지도 아래 최근 소식: 주요 사건 기록(milestones) 최신순
function renderNewsPanel(state) {
  const el = document.getElementById('news-info');
  if (!el || !state) return;
  const ms = (state.milestones || []).slice(-8).reverse();
  if (!ms.length) { el.innerHTML = '<div class="muted">아직 소식이 없습니다. 사건, 목표 달성·실패, 첫 정전·첫 원전 가동 같은 일이 여기에 쌓입니다.</div>'; return; }
  el.innerHTML = ms.map((m) => '<div class="news-item' + (m.year === state.year && m.month === state.month ? ' now' : '') + '"><span class="d">' + m.year + '년 ' + m.month + '월</span><span>' + m.text + '</span></div>').join('');
}

// R&D 탭: 연구원 강화 기록 (연구 기록과 분리)
function renderRdLog(state) {
  const el = document.getElementById('rd-log');
  if (!el || !state) return;
  const log = (state.rdLog || []).filter((e) => e.text);
  el.innerHTML = log.length
    ? log.map((e) => '<div class="' + (e.kind === 'fail' ? 'log-fail' : e.kind === 'ok' ? 'log-ok' : '') + '">' + e.year + '년 ' + e.month + '월 · ' + e.text + '</div>').join('')
    : '<p class="muted">아직 변동이 없습니다. 영입·강화·퇴사·은퇴가 여기에 쌓입니다.</p>';
}

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
    '<div class="cs-row"><span>과밀</span><b class="' + (crowded ? 'bad' : near ? 'warn' : 'good') + '">' + (crowded ? crowded + '곳 (행복도 −)' : near ? '임박' : '없음') + '</b></div>' +
    (worst ? '<div class="cs-row muted"><span>최고 밀도</span><span>' + worst.d.toFixed(1) + ' / ' + ECON.densityLimit + ' (' + worst.name + ')</span></div>' : '');
}
