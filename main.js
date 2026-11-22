// ============================================================
// 게임 진행: 상태, 탭, 지도 조작(드래그/클릭/이동), 도시 조성, 턴 진행, 저장
// ============================================================

const SAVE_KEY = 'ilpp-save-v2';
const NAME_KEY = 'ilpp-player-name';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
// 지도 캔버스는 가운데 칸(#map-wrap)을 꽉 채움. 칸의 크기·비율은 창 크기와 화면 확대에 따라 자유롭게 변하고,
// 가장 축소하면 지도 전체가 그 안에 다 들어가도록 그림 (비율이 안 맞아 남는 가장자리는 바다색 여백)
function fitMapCanvas() {
  const wrap = document.getElementById('map-wrap') || canvas.parentElement;
  const w = Math.round(wrap.clientWidth), h = Math.round(wrap.clientHeight);
  if (w < 160 || h < 120) return false;   // 다른 탭을 보는 중이면 크기가 0 → 그대로 둠
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w; canvas.height = h;
  return true;
}fitMapCanvas();

const minimapEl = document.getElementById('minimap');
const boardEl   = document.getElementById('board');
const tooltipEl = document.getElementById('tooltip');

let state = null;
const gridControl = document.getElementById('map-grid-mode');
const gridPreferenceKey = 'ilpp-map-grid-mode';
try {
  const saved = localStorage.getItem(gridPreferenceKey);
  if (saved === 'on' || saved === 'off') gridControl.value = saved;
} catch { /* Use automatic mode when browser storage is unavailable. */ }
gridControl.addEventListener('change', () => {
  try { localStorage.setItem(gridPreferenceKey, gridControl.value); } catch { /* Still applies this session. */ }
  if (state) render();
});
let drag = null;            // 카드 끌기 { type, col, row }
let pressPos = null;        // 지도에서 누른 위치 (클릭 판정)
let panStart = null;        // 오른쪽 버튼 드래그로 지도 이동
let miniDragging = false;
let draftPaint = null;      // 도시 칠하기 중 'paint' | 'erase'
let currentTab = 'map';

// ------------------------------------------------------------
// 새 게임
// ------------------------------------------------------------
function readPlayerName() {
  const raw = (document.getElementById('player-name').value || '').trim();
  const name = raw.slice(0, 12) || '홍길동';
  try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* 무시 */ }
  return name;
}

function newGame(mode) {
  const tutorial = mode === 'tutorial';   // 튜토리얼 = 일반 모드 + 비서 안내 (안내가 끝나면 그대로 20년 임기)
  if (tutorial) mode = 'normal';
  // 시작 도시는 ECON.startCities곳(2곳). 예전의 3곳과 넓이 합이 같도록 한 곳을 그만큼 넓게 잡음 → 처음 인구·밀도·수요는 그대로
  let grid = generateMap();
  let cities = generateCities(grid, ECON.startCities, Math.round(ECON.cityTiles * 3 / ECON.startCities));
  for (let t = 0; t < 20 && cities.length < ECON.startCities; t++) { grid = generateMap(); cities = generateCities(grid, ECON.startCities, Math.round(ECON.cityTiles * 3 / ECON.startCities)); }   // 자리가 안 나오면 지도를 다시 만듦

  state = {
    mode, playerName: readPlayerName(),
    year: ECON.startYear, month: ECON.startMonth,
    startYear: ECON.startYear, startMonth: ECON.startMonth,
    money: ECON.startMoney,
    grid, cities, startCities: cities.length, buildings: [], nextId: 1,
    gasPrice: 1.0, carbonTax: ECON.carbonTaxStart,
    weather: null, event: null, demandCurve: null,
    lastReport: null, history: [],
    selectedId: null, cleanStreak: 0,
    happiness: ECON.happinessStart,
    mood: { outage: 0, buzz: 0 }, // 민심 계산용 기억 (최근 정전 · 사건과 목표가 남긴 여론)
    scoreAcc: 0,                  // 지금까지 쌓은 점수
    tariff: 0, tariffSetAt: -999, // 전기요금 조정 단계(−2~+2)와 마지막으로 바꾼 달
    tech: emptyTech(), techPity: {}, techLog: [],
    rd: emptyRd(),
    view: { col: 0, row: 0 }, zoom: 1,
    cityDraft: null,
    finished: false,
    tutorial: tutorial ? { step: 0, done: false, guard: true } : null,
  };
  if (tutorial) state.money = ECON.startMoney + 3000;   // 배우는 동안 여유 자금

  // 시작 설비: 복합발전 1기(가장 큰 도시 바로 바깥) + 태양광 1개 + 풍력 1개
  const main = cities.slice().sort((a, b) => b.pop - a.pop)[0];
  const starters = ['ccgt'];
  outer:
  for (let d = 1; d <= 12 && starters.length; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        const col = main.center.col + dc, row = main.center.row + dr;
        if (!overlapsCity(starters[0], col, row) && canBuild(starters[0], col, row).ok) {
          addBuilding(starters.shift(), col, row, true);
          if (!starters.length) break outer;
        }
      }
    }
  }
  // 태양광: 도시 밖 평지 가운데 가장 큰 도시에서 가까운 곳. 풍력: 소음 불만이 없는 곳 가운데 해안·산 보너스와 송전 손실을 따져 가장 잘 나오는 곳
  {
    const startSite = (type, score) => {
      let best = null;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const info = canBuild(type, c, r);
        if (!info.ok || info.opposed || overlapsCity(type, c, r)) continue;
        if (nuisanceOf(state, { type, col: c, row: r }) > 0) continue;
        const s = score(info, c, r);
        if (s !== null && (!best || s > best.s)) best = { s, c, r };
      }
      if (best) addBuilding(type, best.c, best.r, true);
    };
    const dMain = (c, r) => chebyshev(c, r, main.center.col, main.center.row);
    startSite('solar', (info, c, r) => (info.mountain ? null : -dMain(c, r)));
    startSite('wind', (info, c, r) => (info.coastal ? 1 + PLANTS.wind.coastalBonus : info.mountain ? 1 + ECON.windMountainBonus : 1 - ECON.windPlainPenalty) * (1 - plantLoss(state, { type: 'wind', col: c, row: r })) - dMain(c, r) * 0.002);
  }
  fullMapView();   // 시작하면 지도 전체가 한눈에 보이게

  startMonth(false);
  // 시작 유예: 초기 인구를 시작 설비에 맞춰, 가장 수요가 큰 계절에도 조절 설비(복합발전 1기)만으로 6%쯤 여유가 있게 (설비 짓는 데 걸리는 시간을 감안)
  //  태양광·풍력은 저녁 피크에 기댈 수 없으므로 여기에 세지 않음 (그만큼 연료를 아껴 주는 덤)
  {
    const caps0 = fleetCapacities(state);
    const firm0 = caps0.nuclear + caps0.smr + caps0.coal + caps0.ccgt + caps0.gt;
    const worstSeason = WORST_PEAK_MULT;
    // 가스 발전은 기온에 따라 출력이 달라지므로, 시작하는 달의 기온과 상관없이 같은 인구로 시작하도록 봄가을 기준 기온(14℃)의 출력으로 맞춤
    const tfNow = gtTempFactor(state.weather.temp + ((state.event && state.event.tempDelta) || 0));
    const targetPop = (firm0 / tfNow * gtTempFactor(SEASON_TEMP.mid)) / (ECON.perCapitaMW * worstSeason * ECON.startReserve);
    const nowPop = state.cities.reduce((s, c) => s + c.pop, 0);
    if (nowPop > 0) for (const c of state.cities) c.pop = c.pop * targetPop / nowPop;
    state.demandCurve = buildDemandCurve(state);
  }
  // 첫 목표: 예비력 확보 (없으면 아무거나)
  state.quests = [];
  const first = QUESTS.find((q) => q.id === 'reserve');
  if (first && first.cond(state)) state.quests.push({ id: first.id, start: state.year * 12 + state.month, deadline: state.year * 12 + state.month + first.months - 1, status: 'active', base: {} });
  else maybeAssignQuest(state, true);
  // 위기 일정표: 임기 동안 겪을 위기의 종류 구성은 같고 시점·순서만 무작위
  state.crisisPlan = makeCrisisPlan(state, mode === 'normal' ? ECON.normalYears : 20);
  state.neighborPeak = neighborBasePeak(state);   // 이웃 나라 최대 수요
  saveGame();
  renderAll();
}

// ------------------------------------------------------------
// 달 시작: 날씨·이벤트·수요 곡선
// ------------------------------------------------------------
function startMonth(withEvent) {
  state.weather = makeWeather(state.month);
  state.event = withEvent ? pickEvent(state) : null;

  if (state.event) {
    const ev = state.event;
    if (ev.effect === 'popBoost') for (const c of state.cities) c.pop *= 1.02;
    else if (ev.effect === 'delayNuclear') {
      for (const b of state.buildings) if ((PLANTS[b.type].kind === 'nuclear' || PLANTS[b.type].kind === 'smr') && b.status === 'building') b.monthsLeft += 2;
    } else if (ev.effect === 'carbonUp') state.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(state.carbonTax * 1.1));
  }

  // 원전 정기검사: 이벤트가 뜨면 6개월 뒤로 예고, 예정된 달에 그 원전을 한 달 정지
  const nowIdx = state.year * 12 + state.month;
  state.outageId = null;
  if (state.event && state.event.effect === 'nuclearOutage' && techMods(state).noOutage) state.event = null;   // 원자력 테크 "온라인 검사": 정기검사 정지 없음
  if (state.event && state.event.effect === 'nuclearOutage') {
    const nukes = state.buildings.filter((b) => (PLANTS[b.type].kind === 'nuclear' || PLANTS[b.type].kind === 'smr') && b.status === 'online');
    if (nukes.length && !state.scheduledOutage) {
      const target = nukes[randInt(nukes.length)];
      state.scheduledOutage = { id: target.id, due: nowIdx + ECON.outageNoticeMonths, name: PLANTS[target.type].name };
    } else state.event = null;
  }
  if (state.scheduledOutage) {
    const so = state.scheduledOutage;
    const stillThere = state.buildings.some((b) => b.id === so.id && b.status === 'online');
    if (!stillThere) state.scheduledOutage = null;
    else if (nowIdx >= so.due) { state.outageId = so.id; state.scheduledOutage = null; }
  }
  state.demandCurve = buildDemandCurve(state);

  // 사건(선택지) 발생과 새 목표 부여
  // 튜토리얼 안내 중(guard)에는 사건을 미룸
  if (withEvent && !state.pendingDecision && !(state.tutorial && state.tutorial.guard && !state.tutorial.done)) {
    const d = pickDecision(state);
    if (d) state.pendingDecision = { id: d.id, at: state.year * 12 + state.month };
  }
  if (withEvent && state.mode === 'normal' && (state.history || []).length === ECON.electionMonth - ECON.electionNotice && !(state.quests || []).some((q) => q.id === 'reelection')) {
    const now = monthIdxOf(state);
    (state.quests = state.quests || []).push({ id: 'reelection', start: now, deadline: now + ECON.electionNotice - 1, status: 'active', base: {} });
    state.newQuest = '재선 (10년 차 선거)';
    milestone('🗳 재선 선거 예고: 2년 뒤 선거하는 달의 민심이 ' + ECON.electionBar + ' 이상이어야 합니다');
  }
  if (withEvent) {
    const q = maybeAssignQuest(state, false);
    if (q) { const def = questById(q.id); state.newQuest = def.title; milestone('🎯 새 목표: ' + def.title); }
  }
}

// 사건 선택 처리 (사건 창의 버튼에서 호출)
function chooseDecision(idx) {
  const pd = state.pendingDecision;
  if (!pd) return;
  const def = decisionById(pd.id);
  const choice = def.choices[idx];
  if (!choice) return;
  if (choice.cost && state.money < choice.cost(state)) { showMessage('✕ 자금이 부족해 고를 수 없는 선택입니다'); return; }
  const result = choice.apply(state);
  if (!state.decisionLog) state.decisionLog = [];
  state.decisionLog.push({ id: def.id, at: pd.at, choice: choice.label, result });
  milestone(def.icon + ' ' + def.name + (def.choices.length > 1 ? ' → ' + choice.label : ''), def.cat === 'buzz');   // 화제는 '주요' 기록에서 빠짐
  state.pendingDecision = null;
  renderDecisionResult(def, choice, result);
  saveGame();
  renderAll();
}

// ------------------------------------------------------------
// 이번 달 진행 → 결산
// ------------------------------------------------------------
function runMonth() {
  if (state.finished) return;
  if (state.cityDraft) { showMessage('도시 조성을 확정하거나 취소한 뒤 진행하세요'); return; }
  if (state.pendingDecision) { renderDecision(state); showMessage('사건에 먼저 답해야 달을 진행할 수 있습니다'); return; }
  if (state.reportPending && state.lastReport) { renderReport(state.lastReport); document.getElementById('report').classList.remove('hidden'); return; }   // 이미 정산한 달: 결산 창을 다시 보여 줌
  const report = simulateMonth(state);
  state.exportTotal = (state.exportTotal || 0) + (report.energy.exp || 0);
  state.money += report.money.profit;
  // 임기 누계: 교역(전력 수출 수입, 전력 수입 비용)과 발전 수입 — 점수의 경제·교역 항목
  if (!state.trade) state.trade = { exportRev: 0, importCost: 0, energyRev: 0, expMWh: 0, demandMWh: 0 };
  state.trade.exportRev += report.money.exportRev || 0;
  state.trade.expMWh = (state.trade.expMWh || 0) + (report.energy.exp || 0);
  state.trade.demandMWh = (state.trade.demandMWh || 0) + (report.energy.demand || 0);
  state.trade.importCost += report.money.importCost || 0;
  state.trade.energyRev += report.money.energyRev || 0;

  const hc = happinessChange(state, report);
  report.happiness = { before: state.happiness, items: hc.items, factors: hc.factors, pillars: hc.pillars, extras: hc.extras, target: hc.target, pull: hc.pull, total: hc.total };
  state.happiness = clamp(Math.round((state.happiness + hc.total) * 10) / 10, 0, 100);
  report.happiness.after = state.happiness;
  state.mood.target = hc.target; state.mood.factors = hc.factors; state.mood.pillars = hc.pillars; state.mood.extras = hc.extras;   // 화면 표시용 (지금 민심이 어디를 향하는지)

  state.lastReport = report;
  // 진행 기록 (엔딩 통계 그래프용)
  const g = report.energy.gen;
  const genTotal = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind;
  const smpAvg = report.hours.reduce((s, h) => s + h.smp, 0) / report.hours.length;
  // 분야별로 만점에서 잃은 점수 (엔딩 원인 분석용) · 분야 안에서 깎인 낱낱(주민 불만 · 공약 불이행 등)
  const hneg = {};
  for (const p of hc.pillars) { const lost = Math.round((p.score - p.max) * 10) / 10; if (lost < 0) hneg[p.key] = lost; for (const x of p.parts) if (x.value < 0) hneg[x.key] = (hneg[x.key] || 0) + x.value; }
  for (const x of hc.extras) if (x.value < 0) hneg[x.key] = (hneg[x.key] || 0) + x.value;
  // 분야별 점수 기록 (엔딩의 "분야별 임기 평균")
  const moodRec = {};
  for (const p of hc.pillars) moodRec[p.key] = p.score;
  for (const x of hc.extras) moodRec[x.key] = x.value;
  const m = report.money;
  const tgtNow = intensityTarget(state);
  state.history.push({
    year: report.year, month: report.month, profit: m.profit, co2: report.energy.co2, blackoutHours: report.blackoutHours,
    money: state.money, happy: state.happiness, smp: smpAvg, rd: rdLevel(state),
    ren: genTotal > 0 ? (g.solar + g.wind) / genTotal : 0, nuc: genTotal > 0 ? g.nuclear / genTotal : 0,
    hneg, mood: moodRec, moodT: hc.target, inten: reportIntensity(report), tgt: tgtNow,
    felt: hc.price ? hc.price.felt : smpAvg, pref: hc.price ? hc.price.ref : moodPriceRef(state),   // 체감 요금과 기대 요금 (요금 공약 판정용)
    fuel: m.fuel, carbon: m.carbon, salary: m.salary, blk: m.blackoutCost, over: m.overCost, imp: m.importCost,
    pop: state.cities.reduce((s, c) => s + c.pop, 0), ratio: supplyDemandRatio(state), tax: m.tax || 0,
    gas: g.ccgt + g.gt, gasS: genTotal > 0 ? (g.ccgt + g.gt) / genTotal : 0,   // 가스 발전량과 비중 (재선 공약 판정용)
    exp: report.energy.demand > 0 ? (report.energy.exp || 0) / report.energy.demand : 0,   // 수출 비중 (그달 수요 대비) — 재선 공약 판정용
  });

  // 주요 이벤트 기록 (처음 겪는 일들)
  const flags = state.msFlags || (state.msFlags = {});
  const once = (k, text) => { if (!flags[k]) { flags[k] = true; milestone(text); } };
  if (report.blackoutHours > 0) once('blackout', '⚡ 첫 정전 발생 (' + report.blackoutHours + '시간대)');
  const lv = rdLevel(state);
  for (const th of [20, 100, 200]) if (lv >= th) once('rd' + th, '🔬 연구소 규모 ' + th + ' 달성');
  if (tgtNow !== null && reportIntensity(report) > tgtNow && yearsElapsed(state) >= 1) once('intensityOver', '📏 탄소 기준 첫 초과 (환경 점수 0)');
  if (state.happiness < 40) once('happy40', '😟 민심 40 아래로 하락');
  if (state.money < 0) once('debt', '💸 자금이 바닥나 부채 발생');
  if (report.money.exportRev > 0) once('export', '🔌 첫 전력 수출');
  if (state.event && ['typhoon', 'gasSpike', 'outage', 'protest'].includes(state.event.id)) milestone('📰 ' + state.event.name);

  // 사건 효과 진행(위기 중 정전 기록, 매달 이자 등)과 목표 판정. 보상·실패는 여기서 바로 적용되고 결산에 표시됨
  tickEffects(state, report);
  report.questNotices = updateQuests(state, report);
  for (const n of report.questNotices) milestone(n);
  report.happiness.end = state.happiness;   // 목표·공약의 보상과 벌칙까지 반영한 값 (결산 창에 이 값을 보여 줌)
  if (state.newQuest) { report.questNotices.unshift('🎯 새 목표가 주어졌습니다: ' + state.newQuest + ' (오른쪽 "정책" 탭)'); state.newQuest = null; }


  // 재선에 실패했으면 결산을 닫을 때 임기가 끝남
  if ((state.quests || []).some((q) => q.id === 'reelection' && q.status === 'failed')) state.electionLost = true;
  // 점수: 그달의 (목표 보상·벌칙까지 반영한) 민심만큼 쌓임
  {
    const monthNo = state.history.length - 1;
    const gain = scoreGain(state.happiness, monthNo);
    state.scoreAcc = (state.scoreAcc !== undefined ? state.scoreAcc : scoreFromHistory(state.history.slice(0, -1))) + gain;
    state.history[monthNo].happyEnd = state.happiness;
    report.score = { gain, total: state.scoreAcc, weight: scoreWeight(monthNo) };
  }

  renderReport(report);
  document.getElementById('report').classList.remove('hidden');
  state.reportPending = true;   // 결산은 끝났고 창을 아직 닫지 않음 (이 상태로 저장되면 이어하기 때 결산 창부터 다시 보여 줌)
  saveGame();
}

function advanceMonth() {
  document.getElementById('report').classList.add('hidden');
  state.reportPending = false;
  const notices = [];

  // 건설·업그레이드·철거 진행, 수명
  for (let i = state.buildings.length - 1; i >= 0; i--) {
    const b = state.buildings[i];
    const p = PLANTS[b.type];
    if (b.status === 'building') {
      b.monthsLeft--;
      if (b.monthsLeft <= 0) {
        b.status = 'online'; b.monthsLeft = 0; notices.push(p.name + ' 완공');
        if (state.buildings.filter((x) => x.type === b.type && x.status === 'online').length === 1) milestone('🏗 첫 ' + p.name + ' 완공');
      }
    } else if (b.status === 'upgrading') {
      b.monthsLeft--;
      if (b.monthsLeft <= 0) {
        b.type = PLANTS[b.upgradeFrom].upgradeTo; b.status = 'online'; b.monthsLeft = 0; delete b.upgradeFrom;
        notices.push(PLANTS[b.type].name + ' 업그레이드 완료');
      }
    } else if (b.status === 'demolishing') {
      b.monthsLeft--;
      if (b.monthsLeft <= 0) {
        state.money += paidCost(state, b) * ECON.demolishRefund;
        state.buildings.splice(i, 1);
        if (state.selectedId === b.id) state.selectedId = null;
        continue;
      }
    } else if (b.status === 'online') {
      b.age++;
      if (b.age >= plantLifeMonths(b.type)) { b.status = 'retired'; notices.push(p.name + ' 수명 종료 · 가동 정지 (철거 필요)'); }
      else if (b.age === Math.ceil(plantLifeMonths(b.type) * agingStartRatio())) notices.push(p.name + ' 노후 진입 · 출력 −10%');
    }
  }

  // 연구 진행(3개월 뒤 결과), 이번 달 연구소 확장 제한 초기화
  for (const n of progressResearch(state)) notices.push(n);
  for (const n of attrition(state)) notices.push(n);
  state.hiredThisMonth = false; state.labExpandedThisMonth = false;
  for (const n of expireEffects(state)) { notices.push(n); milestone(n); }
  state.upgradedThisMonth = false;

  // 인구 증가와 과밀 도시에서의 이주
  // 인구 증가 = 기본 증가(정책 반영) + 유도 수요(설비가 남아돌면 유입, 모자라면 유출)
  const induced = inducedGrowth(state);
  // 기본(연차 곡선 × 정책 × 민심) + 유도, 상한(연차에 따라 내려감)과 국토 포화 반영 — sim.js monthlyGrowth
  const growth = monthlyGrowth(state);
  for (const c of state.cities) c.pop *= 1 + growth;
  if (induced >= 0.004) notices.push('전력이 넉넉해 산업·인구 유입 (수요 +' + fmt(induced * 100, 1) + '%)');
  else if (induced < 0) notices.push('전력 부족 우려로 인구 유입 둔화');
  migratePopulation();

  // 가스 가격: 무작위로 흔들리되 1.0으로 되돌아오는 힘이 있음 (되돌아오는 힘이 없으면 20년 동안 2배·절반으로 흘러가 운에 좌우됨). 큰 충격은 사건(LNG 위기 등)이 맡음
  state.gasPrice = clamp(1 + (state.gasPrice * rand(0.92, 1.08) - 1) * 0.94, 0.6, 2.0);

  state.month++;
  if (state.month > 12) {
    state.month = 1; state.year++;
    state.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(state.carbonTax * (1 + ECON.carbonTaxGrowth)));
    // 이웃 나라 수요도 해마다 늘어남. 우리가 훨씬 커지면 이웃도 따라 커져(우리 최대수요의 neighborMinRatio 이상) 수출 시장이 사라지지 않게 함
    state.neighborPeak = Math.round(Math.max((state.neighborPeak || neighborBasePeak(state)) * (1 + ECON.neighborGrowth), ECON.neighborMinRatio * Math.max(...state.demandCurve)));
  }

  { const acc = rollNuclearAccident(); if (acc) notices.push('☢ ' + acc.name + ' 중대 사고'); }
  // 선거 1년 전에 재선 공약을 발표하게 함 (공약은 선거 전에 하는 약속: 과감한 약속의 기대감이 선거에도 영향을 줌)
  if (!state.term2Asked && !state.pendingDecision && !state.finished && state.mode === 'normal' && (state.history || []).length >= ECON.electionMonth - TERM2_LEAD_MONTHS) {
    state.term2Asked = true;
    state.pendingDecision = { id: 'term2_pledge', at: monthIdxOf(state) };
  }
  startMonth(true);
  state.notices = notices;
  if (notices.length) showMessage(notices.join(' · '), 3500);
  checkEnd();
  saveGame();
  renderAll();
}

// ------------------------------------------------------------
// 원전 중대 사고: 극히 드묾 (원전·SMR 1기당 연 ECON.nukeAccidentPerYear). 게임 안에서는 미리 설명하지 않고, 일어나면 사건으로 알림
//  결과: 그달 민심 급락 · 임기 끝까지 민심 하락 · 사고 원전과 둘레 설비 소실 · 둘레가 접근 금지 구역(설비·도시 건설 불가)이 되고 그 안의 주민은 떠남
// ------------------------------------------------------------
function inExclusion(col, row) {
  for (const z of (state.exclusion || [])) if (col >= z.c0 && col <= z.c1 && row >= z.r0 && row <= z.r1) return true;
  return false;
}
function nuclearAccident(b) {
  const p = PLANTS[b.type], R = ECON.nukeAccidentRadius;
  (state.exclusion = state.exclusion || []).push({ c0: b.col - R, r0: b.row - R, c1: b.col + p.width - 1 + R, r1: b.row + p.height - 1 + R, year: state.year, month: state.month });
  // 구역 안의 설비는 모두 잃음 (사고 원전 포함)
  const inZone = (x) => footprintCells(x.type, x.col, x.row).some((c) => inExclusion(c.col, c.row));
  const gone = state.buildings.filter(inZone);
  state.buildings = state.buildings.filter((x) => !inZone(x));
  if (gone.some((x) => x.id === state.selectedId)) state.selectedId = null;
  if (state.scheduledOutage && gone.some((x) => x.id === state.scheduledOutage.id)) state.scheduledOutage = null;
  // 구역 안의 도시 칸은 비워짐: 그 칸에 살던 만큼의 주민이 떠남. 칸이 모두 없어진 도시는 사라짐
  let evac = 0;
  for (const c of state.cities) {
    const keep = c.tiles.filter((t) => !inExclusion(t.col, t.row));
    if (keep.length === c.tiles.length) continue;
    const lostPop = c.pop * (1 - keep.length / c.tiles.length);
    evac += lostPop; c.pop -= lostPop; c.tiles = keep;
    if (keep.length) finalizeCity(c);
  }
  if (state.cities.some((c) => c.tiles.length > 0)) state.cities = state.cities.filter((c) => c.tiles.length > 0);
  // 민심: 그달 급락 + 임기 끝까지 남는 상처 (친원전 노선이면 급락이 1.5배)
  const hit = Math.round(ECON.nukeAccidentHit * policyMods(state).accidentMult);
  moodBump(state, -(hit));
  state.accidentMood = Math.max(state.accidentMood || 0, ECON.nukeAccidentMood);
  const accName = b.type === 'nuclear' ? '원자력 발전소' : p.short;
  state.accident = { name: accName, hit, mood: ECON.nukeAccidentMood, lost: gone.length - 1, evac: Math.round(evac), year: state.year, month: state.month };
  milestone('☢ ' + accName + ' 중대 사고: 주변 접근 금지 · 민심 −' + hit);
  state.pendingDecision = { id: 'nuke_accident', at: monthIdxOf(state) };
  return state.accident;
}
// 달이 바뀔 때 한 번: 가동 중인 원전·SMR마다 사고 여부를 굴림
function rollNuclearAccident() {
  const pMonth = ECON.nukeAccidentPerYear / 12;
  for (const b of state.buildings) if (b.status === 'online' && PLANTS[b.type].kind === 'nuclear' && Math.random() < pMonth) return nuclearAccident(b);
  return null;
}
// 접근 금지 구역: GPT가 그린 지면 그림을 구역 크기에 맞춰 깔고, 설비·도시를 놓는 중에만 경계를 점선으로 보여 줌
const accidentArt = new Image();
accidentArt.src = 'assets/world/nuclear-accident-ground.png';
function drawExclusion(ctx, placing) {
  for (const z of (state.exclusion || [])) {
    const x = z.c0 * TILE, y = z.r0 * TILE, w = (z.c1 - z.c0 + 1) * TILE, h = (z.r1 - z.r0 + 1) * TILE;
    if (accidentArt.complete && accidentArt.naturalWidth) ctx.drawImage(accidentArt, x, y, w, h);
    else { ctx.fillStyle = 'rgba(40,32,36,0.55)'; ctx.fillRect(x, y, w, h); }
    if (placing) { ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,214,0,0.8)'; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.restore(); }
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText('☢ 접근 금지', x + w / 2 + 1, y + h / 2 + 1);
    ctx.fillStyle = '#ffd600'; ctx.fillText('☢ 접근 금지', x + w / 2, y + h / 2);
  }
}

// 도시 후보 자리가 기피 시설(원전·석탄·풍력)의 영향권에 걸리는지
function siteNearNuisance(tiles) {
  for (const b of state.buildings) {
    if (b.status === 'demolishing') continue;
    const p = PLANTS[b.type];
    const rule = p.nuisance || ECON.nuisance[p.kind];
    if (!rule) continue;
    for (const t of tiles) {
      const dc = Math.max(b.col - t.col, t.col - (b.col + p.width - 1), 0);
      const dr = Math.max(b.row - t.row, t.row - (b.row + p.height - 1), 0);
      if (Math.max(dc, dr) <= rule.range) return true;
    }
  }
  return false;
}

// 새 도시 자리를 자동으로 잡아 칠해 둠 (확정은 유저가). 기피 시설 근처는 피함
function autoCitySite() {
  if (state.finished) return;
  // 설비가 선 칸과 접근 금지 구역은 비켜서 자리를 잡음 (예전에는 무작위로 번진 자리에 설비가 하나라도 끼면 버려서, 설비가 많은 후반에는 거의 못 찾았음)
  const blocked = (c, r) => !!buildingAt(c, r) || inExclusion(c, r);
  for (let t = 0; t < 150; t++) {
    const tiles = growCity(state.grid, state.cities, ECON.cityTiles, 3, blocked);
    if (tiles && tiles.length === ECON.cityTiles && !tiles.some((x) => buildingAt(x.col, x.row) || inExclusion(x.col, x.row)) && (t >= 120 || !siteNearNuisance(tiles))) {
      state.cityDraft = { tiles };
      drag = null;
      const c = Math.round(tiles.reduce((s, x) => s + x.col, 0) / tiles.length), r = Math.round(tiles.reduce((s, x) => s + x.row, 0) / tiles.length);
      centerView(c, r);
      showMessage('새 도시 자리를 잡았습니다. 마음에 들면 "조성 확정", 아니면 칸을 고쳐 칠하거나 취소하세요', 4000);
      renderAll();
      return;
    }
  }
  showMessage('✕ ' + ECON.cityTiles + '칸짜리 빈 땅을 찾지 못했습니다. 직접 칠해 보세요');
}

// 과밀 도시 → 여유 있는 도시로 매달 조금씩 이주
function migratePopulation() {
  const limit = ECON.densityLimit;
  for (const from of state.cities) {
    const density = cityDensity(from);
    if (density <= limit) continue;
    const targets = state.cities.filter((c) => c !== from && cityDensity(c) < limit * 0.9);
    if (!targets.length) continue;
    targets.sort((a, b) => cityDensity(a) - cityDensity(b));
    const moving = from.pop * ECON.migrationRate;
    from.pop -= moving;
    targets[0].pop += moving;
  }
}

// ------------------------------------------------------------
// 게임 종료
// ------------------------------------------------------------
function checkEnd() {
  if (state.happiness <= ECON.happinessGameOver) {
    const byAccident = state.accident && state.accident.year === state.year && state.accident.month === state.month;
    if (byAccident) { state.pendingDecision = null; const dEl = document.getElementById('decision'); if (dEl) dEl.classList.add('hidden'); }
    finish('탄핵', (byAccident ? '☢ ' + state.accident.name + ' 중대 사고로 ' : '') + '민심이 바닥까지 떨어져 국회에서 탄핵안이 가결되었습니다.<br>' +
      state.year + '년 ' + state.month + '월까지 집권했습니다.', 'impeached');
    return;
  }
  if (state.electionLost) {
    finish('재선 실패', '10년을 넘기는 선거 달의 민심이 ' + ECON.electionBar + '에 못 미쳐 정권이 바뀌었습니다.<br>' +
      state.year + '년 ' + state.month + '월까지 집권했습니다.', 'election');
    return;
  }
  // 부도 한도: 기본 3,000억, 경제가 커지면 최근 1년 수입의 절반까지 (규모에 맞게 빚을 질 수 있음)
  const debtLimit = bankruptLimit(state);
  if (state.money <= -debtLimit) {
    finish('국가 부도', '전력 부문 부채가 ' + fmt(debtLimit) + '억 원을 넘어 국가 부도가 선언되었습니다.<br>' + state.year + '년 ' + state.month + '월까지 집권했습니다.', 'bankrupt');
    return;
  }
  if (state.mode === 'normal' && yearsElapsed(state) >= ECON.normalYears) {
    finish(ECON.normalYears + '년 임기 완주! 🎉', ECON.normalYears + '년 동안 나라의 전력망을 지켜냈습니다.<br>보유 자금 ' + fmt(Math.round(state.money)) + '억 원.', 'complete');
  }
}

// 주요 이벤트 기록 (엔딩 화면에 표시)
function milestone(text, minor) {
  if (!state.milestones) state.milestones = [];
  state.milestones.push(minor ? { year: state.year, month: state.month, text, minor: 1 } : { year: state.year, month: state.month, text });
}

// ------------------------------------------------------------
// 점수 (1,000점 만점) = 20년 동안의 민심을 쌓은 값
//  매달 그달의 민심만큼 점수가 쌓이고, 11년 차부터는 한 달이 2배로 쳐진다 (후반 운영이 더 중요).
//  20년 내내 민심 100이면 1,000점. 탄핵·재선 실패·부도로 일찍 끝나면 그때까지 쌓은 점수가 최종 점수.
//  전력 안정·요금·탄소·경제·기술·정책은 따로 점수를 매기지 않고, 전부 민심을 통해 반영된다.
// ------------------------------------------------------------
const SCORE_TERM_MONTHS = 240;
function scoreWeight(monthNo) { return monthNo >= ECON.scoreLateFrom ? ECON.scoreLateWeight : 1; }   // monthNo: 0부터 센 달 번호
function scoreWeightTotal() { let w = 0; for (let i = 0; i < SCORE_TERM_MONTHS; i++) w += scoreWeight(i); return w; }
// 그달의 민심이 주는 점수
function scoreGain(happy, monthNo) { return monthNo >= SCORE_TERM_MONTHS ? 0 : 1000 * (happy / 100) * scoreWeight(monthNo) / scoreWeightTotal(); }
function historyHappy(x) { return x.happyEnd !== undefined ? x.happyEnd : (x.happy !== undefined ? x.happy : 0); }
// 기록으로 점수를 다시 계산 (예전 저장본·검산용)
function scoreFromHistory(h) { return (h || []).reduce((s, x, i) => s + scoreGain(historyHappy(x), i), 0); }
function computeScore(state, reason) {
  const h = state.history || [];
  const n = Math.max(1, h.length);
  const acc = state.scoreAcc !== undefined ? state.scoreAcc : scoreFromHistory(h);
  const early = h.slice(0, ECON.scoreLateFrom), late = h.slice(ECON.scoreLateFrom, SCORE_TERM_MONTHS);
  const avgOf = (a) => (a.length ? a.reduce((s, x) => s + historyHappy(x), 0) / a.length : null);
  const earlyMax = 1000 * ECON.scoreLateFrom / scoreWeightTotal();   // 1~10년 차에 쌓을 수 있는 최대 점수
  const earlyPts = early.reduce((s, x, i) => s + scoreGain(historyHappy(x), i), 0);
  const latePts = late.reduce((s, x, i) => s + scoreGain(historyHappy(x), ECON.scoreLateFrom + i), 0);
  // 민심 요인별 임기 평균 (무엇이 민심을 올리고 깎았나)
  const fsum = {};
  for (const x of h) for (const k in (x.mood || {})) fsum[k] = (fsum[k] || 0) + x.mood[k];
  const factors = {};
  for (const k in fsum) factors[k] = Math.round(fsum[k] / n * 10) / 10;
  const tiers = TECH_ORDER.reduce((s, k) => s + (state.tech[k] || 0), 0);
  const tiersMax = TECH_ORDER.reduce((s, k) => s + TECH[k].tiers.length, 0);
  const last36 = h.slice(-36);
  const intenLast = last36.length ? last36.reduce((s, x) => s + (x.inten || 0), 0) / last36.length : 0.4;
  const intenAvg = h.reduce((s, x) => s + (x.inten !== undefined ? x.inten : 0.4), 0) / n;
  const pop0 = h.length && h[0].pop ? h[0].pop : state.cities.reduce((s, c) => s + c.pop, 0);
  const popRatio = state.cities.reduce((s, c) => s + c.pop, 0) / Math.max(1, pop0);
  const total = Math.round(acc);
  return {
    total, raw: total, termFactor: 1,
    parts: { early: Math.round(earlyPts), late: Math.round(latePts), earlyMax: Math.round(earlyMax), lateMax: Math.round(1000 - earlyMax) },
    detail: { avgEarly: avgOf(early), avgLate: avgOf(late), avgAll: avgOf(h), months: h.length, factors,
      blackoutMonths: h.filter((x) => x.blackoutHours > 0).length, blackoutHoursTotal: h.reduce((s, x) => s + (x.blackoutHours || 0), 0),
      tiers, tiersMax, intenLast, intenAvg, popRatio },
  };
}

// 전기요금 조정 (정책 칸의 버튼에서 호출). 한 번 바꾸면 tariffLockMonths개월 동안 다시 못 바꿈
function tariffLockLeft(state) { return Math.max(0, ECON.tariffLockMonths - ((state.history || []).length - (state.tariffSetAt !== undefined ? state.tariffSetAt : -999))); }
// 요금 조정이 열릴 때까지 남은 달 (3년 차부터 사용 가능)
function tariffUnlockLeft(state) { return Math.max(0, ECON.tariffFromMonth - (state.history || []).length); }
function setTariff(level) {
  if (!state || state.finished) return;
  level = clamp(Math.round(level), -2, 2);
  if (level === (state.tariff || 0)) return;
  const unlock = tariffUnlockLeft(state);
  if (unlock > 0) { showMessage('✕ 전기요금 조정은 3년 차부터 쓸 수 있습니다 (' + unlock + '개월 남음)'); return; }
  const left = tariffLockLeft(state);
  if (left > 0) { showMessage('✕ 요금은 한 번 바꾸면 ' + ECON.tariffLockMonths + '개월 동안 다시 못 바꿉니다 (' + left + '개월 남음)'); return; }
  state.tariff = level; state.tariffSetAt = (state.history || []).length;
  const tf = tariffNow(state);
  milestone('🧾 전기요금 조정: ' + tf.name);
  showMessage('전기요금 조정: ' + tf.name + (tf.rate ? ' · 국민이 내는 요금 ' + (tf.rate < 0 ? '−' : '+') + Math.round(Math.abs(tf.rate) * 100) + '% · 전력 판매 수입의 ' + Math.round(Math.abs(tf.rate) * 100) + '%를 ' + (tf.rate < 0 ? '지원금으로 지출' : '더 걷음') : ''), 3500);
  saveGame(); renderAll();
}

// 오늘 날짜 (이 컴퓨터의 시간대 기준, YYYY-MM-DD). toISOString은 세계 표준시라 한국에서는 오전에 하루 전 날짜가 찍힘
function localDateString() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 게임 결과 요약
function gameSummary(reason) {
  const h = state.history;
  const avgHappy = h.length ? h.reduce((s, x) => s + (x.happy !== undefined ? x.happy : state.happiness), 0) / h.length : state.happiness;
  const money = Math.round(state.money);
  const completed = reason === 'complete' || reason === 'netzero';
  const sc = computeScore(state, reason);
  return {
    name: state.playerName, mode: state.mode, reason, completed,
    months: h.length, years: yearsElapsed(state),
    avgHappy, money, score: sc.total, scoreParts: sc.parts, scoreDetail: sc.detail, termFactor: sc.termFactor,
    co2Total: h.reduce((s, x) => s + x.co2, 0), blackoutTotal: h.reduce((s, x) => s + x.blackoutHours, 0),
    endYear: state.year, endMonth: state.month, date: localDateString(),
  };
}

function finish(title, text, reason) {
  state.finished = true;
  const summary = gameSummary(reason || 'impeached');
  summary.title = title;
  state.summary = summary;
  document.getElementById('gameover-title').textContent = title;
  document.getElementById('gameover-text').innerHTML = '<b>' + state.playerName + '</b> 대통령님, ' + text;
  renderEnding(state, summary);
  document.getElementById('gameover').classList.remove('hidden');
  localStorage.removeItem(SAVE_KEY);
}

// ------------------------------------------------------------
// 랭킹 (브라우저에 저장)
// ------------------------------------------------------------
const RANK_KEY = 'ilpp-rankings-v4';   // v4: 민심이 "다섯 분야 × 20점" 성적표로 바뀌어 점수 눈금이 달라짐 (예전 기록과 섞이지 않게 새 저장 칸). v3: 점수가 "20년 민심 누적"으로 바뀌어 예전 기록(v2 이하)과 섞이지 않게 새 저장 칸을 씀
function loadRankings() {
  try { return JSON.parse(localStorage.getItem(RANK_KEY) || '[]'); } catch (e) { return []; }
}
function saveRankings(list) {
  try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); }
  catch (err) {
    // 저장 공간이 모자라면 오래된 기록의 지도 정보부터 덜어 내고 다시 저장 (점수·숫자는 남김)
    const slim = list.map((r, i) => (i < list.length - 10 && r.snap ? Object.assign({}, r, { snap: undefined }) : r));
    try { localStorage.setItem(RANK_KEY, JSON.stringify(slim)); } catch (err2) { /* 그래도 안 되면 포기 */ }
  }
}
// 랭킹 종류: 지금은 종합 점수 하나 (나중에 다른 기준을 추가할 수 있게 배열로 둠)
const RANK_TABS = [
  { key: 'score', label: '🏆 종합 점수', desc: '국정운영 점수(20년 동안의 민심을 쌓은 값, 1,000점 만점)가 높은 순' },
];
function rankSorted(list, key) {
  let l = list.slice();
  if (key === 'years') l = l.filter((r) => r.mode === 'free');
  l.sort((a, b) => {
    if (key === 'score') return (b.score || 0) - (a.score || 0) || b.avgHappy - a.avgHappy;
    if (key === 'money') return b.money - a.money || b.avgHappy - a.avgHappy;
    if (key === 'happy') return b.avgHappy - a.avgHappy || b.money - a.money;
    return b.years - a.years || b.money - a.money;
  });
  return l;
}
function addRanking(summary, name) {
  const list = loadRankings();
  const entry = Object.assign({}, summary, { id: Date.now() + '-' + Math.floor(Math.random() * 1e6), name: (name || summary.name || '무명').slice(0, 12) });
  // 엔딩 때의 지도와 설비를 함께 저장해 랭킹 상세 보기에서 볼 수 있게 함
  try { if (state && state.grid && typeof makeRankSnapshot === 'function') entry.snap = makeRankSnapshot(state); } catch (err) { /* 지도 없이 숫자만 저장 */ }
  list.push(entry);
  saveRankings(list.slice(-100));
  return entry.id;
}
function deleteRanking(id) { saveRankings(loadRankings().filter((r) => r.id !== id)); }
function clearRankings() { saveRankings([]); }

// ------------------------------------------------------------
// 건설 규칙
// ------------------------------------------------------------
function buildingAt(col, row) {
  return state.buildings.find((b) => footprintCells(b.type, b.col, b.row).some((c) => c.col === col && c.row === row)) || null;
}
function cityAt(col, row) { return cityContaining(state.cities, col, row); }
function overlapsCity(type, col, row) { return footprintCells(type, col, row).some((c) => cityAt(c.col, c.row)); }

// 칸 묶음이 발전 설비(건설 중 포함)와 맞닿아 있는가 (8방향). 배터리 · 연계선 · 철거 중인 설비는 세지 않음
function touchesGenerator(cells) {
  for (const b of state.buildings) {
    const p = PLANTS[b.type];
    if (p.isStorage || p.isLink || b.status === 'retired' || b.status === 'demolishing') continue;
    for (const f of footprintCells(b.type, b.col, b.row)) for (const c of cells) if (Math.abs(f.col - c.col) <= 1 && Math.abs(f.row - c.row) <= 1) return true;
  }
  return false;
}

function canBuild(type, col, row) {
  const p = PLANTS[type];
  const m = techMods(state);
  const cells = footprintCells(type, col, row);
  if (!plantUnlocked(state, type)) return { ok: false, reason: '테크트리에서 먼저 개발해야 합니다' };

  if (p.kind === 'solar' && overlapsCity(type, col, row)) return { ok: false, reason: '태양광은 도시 안에 지을 수 없습니다 (도시 밖 땅에 지으세요)' };
  const terrain = p.terrain.slice();
  if (p.kind === 'wind' && m.windOnSea) terrain.push(SEA);

  for (const c of cells) {
    if (!isInside(c.col, c.row)) return { ok: false, reason: '지도 밖입니다' };
    if (outsideCountry(state.grid[c.row][c.col])) return { ok: false, reason: '국경 밖에는 건설할 수 없습니다' };
    if (!terrain.includes(state.grid[c.row][c.col])) return { ok: false, reason: state.grid[c.row][c.col] === MOUNTAIN ? '산에는 태양광·풍력만 지을 수 있습니다' : terrain.includes(SEA) ? '땅이나 바다 위에만 지을 수 있습니다' : '땅 위에만 지을 수 있습니다' };
    if (buildingAt(c.col, c.row)) return { ok: false, reason: '이미 다른 설비가 있습니다' };
    if (inExclusion(c.col, c.row)) return { ok: false, reason: '원전 사고로 출입이 금지된 땅입니다' };
  }
  if (p.needsSea && !footprintAdjacentTo(state.grid, cells, SEA)) return { ok: false, reason: '원전은 냉각수가 필요해 바다와 맞닿아야 합니다' };
  if (p.isStorage && !touchesGenerator(cells)) return { ok: false, reason: '배터리는 발전 설비 바로 옆에 붙여 지어야 합니다' };
  if (p.edgeOnly && !footprintOnEdge(cells, state.grid)) return { ok: false, reason: '연계선은 국경에 접한 칸에만 지을 수 있습니다' };

  const st = plantStats(state, type);
  let cost = st.capex, months = st.buildMonths, opposed = false;
  if (p.oppositionRange) {
    const range = type === 'nuclear' ? m.nuclearOppRange : p.oppositionRange;
    const mult  = type === 'nuclear' ? m.nuclearOppMult  : p.oppositionMult;
    if (distToNearestCity(state.cities, type, col, row) <= range) { opposed = true; cost = Math.round(cost * mult); months += 6; }
  }
  const coastal = !!(p.coastalBonus && footprintAdjacentTo(state.grid, cells, SEA));
  // 산지 판정: 설비 칸의 절반 이상이 산이면 산지 설비 (풍력 보너스 · 태양광 산림 훼손)
  const mountain = !!(p.renewable && cells.filter((c) => state.grid[c.row][c.col] === MOUNTAIN).length * 2 >= cells.length);
  return { ok: true, cost, months, coastal, mountain, opposed };
}

function addBuilding(type, col, row, instant) {
  const info = canBuild(type, col, row);
  const b = {
    id: state.nextId++, type, col, row,
    status: instant ? 'online' : 'building',
    monthsLeft: instant ? 0 : info.months,
    totalMonths: info.months,
    coastal: info.coastal,
    mountain: !!info.mountain,
    age: instant ? randInt(96) : 0,          // 시작 설비는 0~8년 된 상태
    cost: info.ok ? info.cost : plantStats(state, type).capex,   // 실제로 낸 건설비 (환수 기준인 투자 자본과 자본 점수에 씀)
  };
  state.buildings.push(b);
  return b;
}

// 놓을 자리에 대한 한 줄 안내 (비용 · 공사 기간 · 반발 · 보너스 · 송전 손실 · 민심). d = { type, col, row }
function placeLabel(d, info) {
  const p = PLANTS[d.type];
  let label, color = '#fff';
  if (info.ok) {
    label = fmt(info.cost) + '억 · ' + info.months + '개월';
    if (info.opposed) { label += ' · 주민 반발'; color = '#ffb300'; }
    if (info.coastal) label += ' · 해안 보너스';
    if (info.mountain) label += d.type === 'wind' ? ' · 산지 보너스' : ' · 산지(민심 −)';
    else if (d.type === 'wind' && !info.coastal) label += ' · 평지 −' + Math.round(ECON.windPlainPenalty * 100) + '%';
    if (!p.isStorage && !p.isLink) label += ' · 송전 손실 ' + fmt(100 * plantLoss(state, d), 1) + '%';
    const n = nuisanceOf(state, { type: d.type, col: d.col, row: d.row });
    if (n > 0) { label += ' · 민심 −' + fmt(n * ECON.moodNuisanceMult, 1); color = '#ffb300'; }
    if (state.money < info.cost) { label += ' · 자금 부족'; color = '#f44336'; }
  } else { label = info.reason; color = '#f44336'; }
  return { label, color };
}

function tryBuild(type, col, row) {
  const info = canBuild(type, col, row);
  const p = PLANTS[type];
  if (!info.ok) { showMessage('✕ ' + info.reason); render(); return; }
  if (state.money < info.cost) { showMessage('✕ 자금이 부족합니다 (' + fmt(info.cost) + '억 필요)'); render(); return; }

  state.money -= info.cost;
  const b = addBuilding(type, col, row, false);
  state.selectedId = b.id;
  if (typeof showSidePane === 'function') showSidePane('fleet');

  let msg = p.name + ' 건설 시작 · ' + info.months + '개월 · ' + fmt(info.cost) + '억';
  if (info.opposed) msg += ' (주민 반발: 비용·기간 증가)';
  if (info.coastal) msg += ' (해안 보너스)';
  if (info.mountain && type === 'solar') { moodBump(state, -(ECON.solarMountainBuildHit)); }   // 벌목 반발: 지을 때 한 번
  if (info.mountain) msg += type === 'wind' ? ' (산지 보너스)' : ' (산지 · 벌목으로 탄소 배출이 생기고 민심 −' + ECON.solarMountainBuildHit + ', 이후 민심 −' + fmt(ECON.solarMountainNuisance * ECON.moodNuisanceMult, 1) + ')';
  else if (type === 'wind' && !info.coastal) msg += ' (평지 · 출력 −' + Math.round(ECON.windPlainPenalty * 100) + '%)';
  const n = nuisanceOf(state, b);
  if (n > 0) msg += ' ⚠ ' + (overlapsCity(type, col, row) ? '도시 안이라' : '도시 근처라') + ' 민심 −' + fmt(n * ECON.moodNuisanceMult, 1) + ' (철거할 때까지)';
  showMessage(msg, 3000);
  saveGame();
  renderAll();
}

function upgradeSelected() {
  const b = state.buildings.find((x) => x.id === state.selectedId);
  if (!b || b.status !== 'online') return;
  const p = PLANTS[b.type];
  if (!p.upgradeTo) return;
  const upCost = upgradeCostOf(state, b.type);
  if (state.money < upCost) { showMessage('✕ 자금이 부족합니다'); return; }
  state.money -= upCost;
  b.cost = paidCost(state, b) + upCost;
  b.status = 'upgrading'; b.upgradeFrom = b.type; b.monthsLeft = p.upgradeMonths;
  showMessage(PLANTS[p.upgradeTo].name + ' 업그레이드 시작 · ' + p.upgradeMonths + '개월 동안 가동 중단', 3000);
  saveGame(); renderAll();
}

function demolishSelected() {
  const b = state.buildings.find((x) => x.id === state.selectedId);
  if (!b || b.status === 'demolishing') return;
  b.status = 'demolishing';
  b.monthsLeft = ECON.demolishMonths;
  delete b.upgradeFrom;
  showMessage(PLANTS[b.type].name + ' 철거 시작 · ' + ECON.demolishMonths + '개월 뒤 자리가 비고 ' + fmt(paidCost(state, b) * ECON.demolishRefund) + '억 환급');
  saveGame(); renderAll();
}

// ------------------------------------------------------------
// 도시 조성 (칠하기)
// ------------------------------------------------------------
// 새 도시 조성비: 정책 배수 × (새 도시를 하나 세울 때마다 +cityCostStep). 땅이 귀해질수록 비싸짐
function cityFoundCost(state) {
  return Math.round(ECON.foundCityCost * policyMods(state).cityCost * (1 + ECON.cityCostStep * Math.max(0, state.cities.length - startCityCount(state))) * costIndex(state));   // 건설 물가 반영
}
function startCityDraft() {
  if (state.finished) return;
  state.cityDraft = { tiles: [] };
  drag = null;
  showMessage('지도의 땅 칸을 클릭·드래그해서 ' + ECON.cityTiles + '칸을 칠하세요', 3000);
  renderAll();
}

function cancelCityDraft() {
  state.cityDraft = null;
  renderAll();
}

function draftTileOk(col, row) {
  if (!isInside(col, row)) return false;
  if (state.grid[row][col] !== LAND && state.grid[row][col] !== MOUNTAIN) return false;   // 산에도 도시를 세울 수 있음 (수용력은 반)
  if (buildingAt(col, row)) return false;
  if (inExclusion(col, row)) return false;   // 원전 사고 접근 금지 구역
  if (state.cities.some((c) => distCellToCity(col, row, c) < ECON.cityGap)) return false;
  return true;
}

function paintDraft(col, row, mode) {
  const d = state.cityDraft;
  if (!d) return;
  const k = tileKey(col, row);
  const idx = d.tiles.findIndex((t) => tileKey(t.col, t.row) === k);
  if (mode === 'erase') { if (idx >= 0) d.tiles.splice(idx, 1); }
  else {
    if (idx >= 0) return;
    if (!draftTileOk(col, row)) { showMessage('✕ 땅이고, 설비·다른 도시와 겹치지 않는 칸이어야 합니다'); return; }
    if (d.tiles.length >= ECON.cityTiles) { showMessage('✕ ' + ECON.cityTiles + '칸을 모두 칠했습니다. 지우려면 칠한 칸을 다시 클릭하세요'); return; }
    d.tiles.push({ col, row });
  }
  document.getElementById('city-count').textContent = d.tiles.length;
  render();
}

// 새 도시를 세우면 밖에서 들어오는 인구 (만 명): 도시 수용량의 cityNewcomers(80칸이면 30만) 또는 전국 인구의 cityNewcomerShare 가운데 큰 쪽.
//  도시가 많아질수록 줄어듦 (cityNewcomerFadeFrom곳을 넘으면 하나당 −15%)
function cityNewcomersNow(state, effTiles) {
  const fade = Math.max(ECON.cityNewcomerMin, 1 - ECON.cityNewcomerFade * Math.max(0, state.cities.length - ECON.cityNewcomerFadeFrom));
  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  return { n: Math.max(ECON.cityNewcomers * ECON.densityLimit * effTiles, ECON.cityNewcomerShare * pop) * fade, fade };
}
function confirmCityDraft() {
  const d = state.cityDraft;
  if (!d) return;
  const keys = new Set(d.tiles.map((t) => tileKey(t.col, t.row)));
  if (d.tiles.length !== ECON.cityTiles) { showMessage('✕ 정확히 ' + ECON.cityTiles + '칸이어야 합니다 (지금 ' + d.tiles.length + '칸)'); return; }
  if (!tilesConnected(keys)) { showMessage('✕ 모든 칸이 상하좌우로 이어져 있어야 합니다'); return; }
  const cityCost = cityFoundCost(state);
  if (state.money < cityCost) { showMessage('✕ 자금이 부족합니다 (' + fmt(cityCost) + '억 필요)'); return; }

  const nameInput = (document.getElementById('city-name').value || '').trim().slice(0, 10);
  const name = nameInput || nextCityName(state.cities);

  // 인구 분산: 과밀 도시의 초과 인구를 새 도시로
  const limit = ECON.densityLimit;
  const donors = state.cities.map((c) => ({ c, excess: Math.max(0, c.pop - 0.8 * limit * cityEffTiles(c)) }));
  let totalExcess = donors.reduce((s, x) => s + x.excess, 0);
  const effNew = cityEffTiles({ tiles: d.tiles });   // 산 칸은 반 칸: 산지 도시는 받는 인구도 신규 유입도 적음
  const nc = cityNewcomersNow(state, effNew);
  let newPop = Math.min(totalExcess, Math.max(0, 0.8 * limit * effNew - nc.n));   // 밖에서 들어올 사람 몫을 남기고 받음
  if (newPop < 5) {
    newPop = 0;
    for (const c of state.cities) { const mv = c.pop * 0.1; c.pop -= mv; newPop += mv; }
  } else {
    for (const x of donors) { const mv = x.excess / totalExcess * newPop; x.c.pop -= mv; }
  }

  state.money -= cityCost;
  state.cityInvestTotal = (state.cityInvestTotal || 0) + cityCost;   // 점수의 자본 항목에 절반이 자산으로 반영
  // 새 도시는 과밀 도시의 인구를 나눠 받는 데 더해, 새 터전을 보고 밖에서 들어오는 신규 인구도 생김 (총인구 증가)
  // 도시가 많아질수록 새 도시가 밖에서 끌어오는 신규 인구는 줄어듦 → 도시를 끝없이 세워 인구(성장 점수)를 사는 것을 막음
  const newcomerFade = nc.fade;
  const newcomers = nc.n;
  newPop += newcomers;
  state.cities.push(makeCity(d.tiles.slice(), newPop, name));
  milestone('🏙 새 도시 ' + name + ' 조성');
  state.cityDraft = null;
  document.getElementById('city-name').value = '';
  showMessage('🏙 ' + name + ' 조성 완료 · 이주 ' + fmt(newPop - newcomers) + '만 명 + 신규 유입 ' + fmt(newcomers) + '만 명' + (newcomerFade < 1 ? ' (도시가 많아 신규 유입이 평소의 ' + Math.round(newcomerFade * 100) + '%)' : ''), 3500);
  saveGame();
  renderAll();
}

// ------------------------------------------------------------
// 화면 이동 (view)
// ------------------------------------------------------------
// 확대 배율(zoom): 1이면 32×24칸, 0.5면 지도 전체(64×48), 2면 16×12칸이 보임
const ZOOM_MAX = 2.5;
// 최소 축소 배율: 지도 전체가 캔버스 안에 다 들어가는 배율 (지도 칸의 비율이 지도와 달라도 전체가 보임)
function zoomMin() { return Math.min(ZOOM_MAX, Math.min(canvas.width / (COLS * TILE), canvas.height / (ROWS * TILE))); }
function zoomOf() { return (state && state.zoom) || 1; }
function visCols() { return canvas.width / TILE / zoomOf(); }
function visRows() { return canvas.height / TILE / zoomOf(); }

// 보이는 범위가 지도보다 넓은 방향은 지도를 가운데에 둠 (view가 음수 = 왼쪽·위에 여백)
function setView(col, row) {
  const vc = visCols(), vr = visRows();
  state.view.col = vc >= COLS ? (COLS - vc) / 2 : clamp(col, 0, COLS - vc);
  state.view.row = vr >= ROWS ? (ROWS - vr) / 2 : clamp(row, 0, ROWS - vr);
}
function centerView(col, row) { setView(col - visCols() / 2, row - visRows() / 2); }
// 지도 전체가 화면에 딱 맞는 보기 (가장 많이 축소 + 왼쪽 위 끝)
function fullMapView() { state.zoom = zoomMin(); setView(0, 0); }
function isFullMapView() { return zoomOf() <= zoomMin() + 1e-6; }
// 캔버스 크기가 바뀌면 다시 맞춤. 지도 전체를 보고 있었다면 새 크기에서도 지도 전체가 보이게 유지
function refitMapCanvas() {
  const wasFull = !!(state && state.view) && isFullMapView();
  const changed = fitMapCanvas();
  if (changed && state && state.view) {
    if (wasFull) fullMapView();
    else { state.zoom = clamp(zoomOf(), zoomMin(), ZOOM_MAX); setView(state.view.col, state.view.row); }
  }
  return changed;
}

// 마우스가 가리키는 칸이 제자리에 있도록 확대·축소
function zoomAt(newZoom, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const fx = (clientX - rect.left) / rect.width;      // 화면에서의 상대 위치 0~1
  const fy = (clientY - rect.top) / rect.height;
  const worldCol = state.view.col + fx * visCols();    // 그 자리의 지도 칸
  const worldRow = state.view.row + fy * visRows();
  state.zoom = clamp(newZoom, zoomMin(), ZOOM_MAX);
  setView(worldCol - fx * visCols(), worldRow - fy * visRows());
  render();
}

// ------------------------------------------------------------
// 그리기
// ------------------------------------------------------------
function render() {
  refitMapCanvas();   // 지도 칸 크기가 바뀌었으면 캔버스부터 맞추고, 최소 배율도 다시 적용
  if (state.zoom && state.zoom < zoomMin()) { state.zoom = zoomMin(); setView(state.view.col, state.view.row); }
  const view = state.view;
  const z = zoomOf();
  const zoomHint = document.getElementById('zoom-hint');   // 지도 전체를 보는 동안만 확대 안내 표시
  if (zoomHint) zoomHint.classList.toggle('hidden', !isFullMapView());
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d2238';   // 지도 밖 여백 (먼바다)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (minimapEl) minimapEl.classList.toggle('hidden', isFullMapView());   // 미니맵은 확대해서 일부만 보일 때만
  ctx.scale(z, z);
  ctx.translate(-view.col * TILE, -view.row * TILE);

  const tint = carbonTint(state.lastReport?.energy?.co2);
  const placing = !!(drag || state.cityDraft);
  drawTerrain(ctx, state.grid, tint, true, placing);
  if (gridControl.value === 'on' || (gridControl.value === 'auto' && placing)) {
    drawPlacementGrid(ctx, state.grid, view);
  }
  drawCities(ctx, state.cities, placing, tint);
  drawExclusion(ctx, placing);
  const focus = drag && drag.col !== null ? drag : state.buildings.find(b => b.id === state.selectedId);
  if (focus && isInside(focus.col,focus.row) && !outsideCountry(state.grid[focus.row][focus.col])) drawCityReach(ctx,state.cities,focus);
  for (const b of state.buildings) drawBuilding(ctx, b, { selected: b.id === state.selectedId });
  drawCityLabels(ctx, state.cities);

  // 도시 조성 중: 칠한 칸 표시
  if (state.cityDraft) {
    for (const t of state.cityDraft.tiles) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(t.col * TILE + 1, t.row * TILE + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(t.col * TILE + 2, t.row * TILE + 2, TILE - 4, TILE - 4);
    }
  }

  // 카드 끌기: 놓일 자리와 안내 라벨
  if (drag && drag.col !== null) {
    const info = canBuild(drag.type, drag.col, drag.row);
    drawBuilding(ctx, { type: drag.type, col: drag.col, row: drag.row, status: 'online', age: 0 }, { alpha: 0.55 });
    const p = PLANTS[drag.type];
    const affordable = info.ok && state.money >= info.cost;
    ctx.fillStyle = affordable ? 'rgba(102,255,192,.18)' : 'rgba(255,105,94,.24)';
    ctx.fillRect(drag.col*TILE,drag.row*TILE,p.width*TILE,p.height*TILE);
    ctx.strokeStyle = affordable ? '#adffce' : '#ff847a';
    ctx.lineWidth = 3;
    ctx.strokeRect(drag.col * TILE + 1, drag.row * TILE + 1, p.width * TILE - 2, p.height * TILE - 2);
    if (drag.tap) {   // 모바일: 작은 화면에서도 놓을 자리가 눈에 띄게 바깥에 흰 점선 테두리를 한 겹 더 (굵기는 화면 기준)
      const u = 1 / z;
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2 * u; ctx.setLineDash([5 * u, 4 * u]);
      ctx.strokeRect(drag.col * TILE - 5 * u, drag.row * TILE - 5 * u, p.width * TILE + 10 * u, p.height * TILE + 10 * u);
      ctx.setLineDash([]);
    }

    const { label, color } = placeLabel(drag, info);
    if (!drag.tap) {   // 모바일(눌러서 자리 잡기)에서는 같은 글이 아래 확정 줄에 나오므로 지도 위에는 그리지 않음
    // Screen-space label stays readable at the full-country zoom.
    const px=((drag.col+p.width/2)-view.col)*TILE*z, py=(drag.row-view.row)*TILE*z;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    ctx.font='bold 12px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=label.split(' · '), rows=[''];
    const maxWidth=Math.max(120,Math.min(350,canvas.width-24));
    for(const part of lines) {
      const last=rows.length-1, joined=rows[last] ? rows[last]+' · '+part : part;
      if(rows[last] && ctx.measureText(joined).width>maxWidth) rows.push(part);
      else rows[last]=joined;
    }
    const width=Math.max(...rows.map(text=>ctx.measureText(text).width))+16, height=rows.length*16+6;
    const left=clamp(px-width/2,3,canvas.width-width-3);
    const top=clamp(py>=height+6?py-height-5:py+p.height*TILE*z+5,3,canvas.height-height-3);
    ctx.fillStyle='#162626';ctx.fillRect(left,top,width,height);
    ctx.fillStyle=color;rows.forEach((line,i)=>ctx.fillText(line,left+width/2,top+11+i*16));ctx.restore();
    }
  }
  ctx.restore();

  if (!isFullMapView()) drawMinimap(minimapEl, state);
}

function renderAll() {
  renderQuests(state);
  if (state && state.pendingDecision && document.getElementById('report').classList.contains('hidden')) renderDecision(state);
  render();
  renderTopbar(state);
  renderPalette(state);
  renderForecast(state);
  renderSelected(state);
  renderFleet(state);
  renderCityTab(state);
  renderTech(state);
  renderRD(state);
  if (typeof renderPolicyPanel === 'function') { renderPolicyPanel(state); renderTechRdPanel(state); renderNewsPanel(state); renderRdLog(state); renderCityStats(state); }
  document.getElementById('next-month').disabled = state.finished;
  if (typeof tutorialTick === 'function') tutorialTick();
}

// ------------------------------------------------------------
// 좌표 변환 (화면 → 지도 칸)
// ------------------------------------------------------------
function pointToCell(clientX, clientY, type) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return { col: null, row: null };
  const ts = TILE * zoomOf();
  let col = Math.floor(x / ts + state.view.col), row = Math.floor(y / ts + state.view.row);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return { col: null, row: null };   // 지도 밖 여백
  if (type) { const p = PLANTS[type]; col -= Math.floor((p.width - 1) / 2); row -= Math.floor((p.height - 1) / 2); }
  return { col, row };
}

function minimapToCell(clientX, clientY) {
  const rect = minimapEl.getBoundingClientRect();
  const x = (clientX - rect.left) * (minimapEl.width / rect.width);
  const y = (clientY - rect.top) * (minimapEl.height / rect.height);
  return { col: Math.floor(x / MINI), row: Math.floor(y / MINI) };
}

// ------------------------------------------------------------
// 탭
// ------------------------------------------------------------
function showTab(name) {
  // 화면은 지도 하나뿐. 예전의 테크트리·R&D 탭은 오른쪽 "연구" 칸으로 옮겼으므로, 그 이름으로 부르면 연구 칸을 엶
  if ((name === 'tech' || name === 'rd') && typeof showSidePane === 'function') showSidePane('research');   // 연구 칸은 이제 항상 보임 → 펴고 잠깐 강조
  currentTab = 'map';
  tooltipEl.style.display = 'none';
  if (typeof tutorialTick === 'function') tutorialTick();
}
document.querySelectorAll('#tabs .tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// 오른쪽 정보 칸의 탭 (전망 · 정책 · 설비 · 소식). 마지막으로 본 탭을 기억. 목표는 정책 탭 안에 있음
// 연구 칸 접기·펴기 (접어도 머리줄에 규모 · 동시 연구 · 민심 영향은 보임). 접은 상태를 기억
function setRdDock(closed) {
  const dock = document.getElementById('techrd-panel'), btn = document.getElementById('rd-dock-toggle');
  if (!dock) return;
  dock.classList.toggle('closed', !!closed);
  if (btn) btn.textContent = closed ? '펴기' : '접기';
  try { localStorage.setItem('ilpp-rd-dock', closed ? '1' : '0'); } catch (e) { /* 저장 못 해도 무방 */ }
}
function showSidePane(name) {
  if (name === 'goals') name = 'policy';
  // 연구는 탭이 아니라 왼쪽 아래(설비 목록 아래)에 항상 보이는 칸: 접혀 있으면 펴고 잠깐 강조
  if (name === 'research') {
    const dock = document.getElementById('techrd-panel');
    if (dock) { setRdDock(false); dock.classList.remove('flash'); void dock.offsetWidth; dock.classList.add('flash'); }
    if (typeof tutorialSpot === 'function') tutorialSpot();
    return;
  }
  const panes = document.querySelectorAll('#side-panes .side-pane');
  if (![...panes].some((p) => p.dataset.pane === name)) return;
  panes.forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
  document.querySelectorAll('#side-tabs .side-tab').forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
  try { localStorage.setItem('ilpp-side-pane', name); } catch (e) { /* 저장 못 해도 무방 */ }
  // 숨겨져 있던 그래프는 크기가 0이었으므로, 보이게 된 뒤 다시 그림
  if (state && (name === 'chart' || name === 'fleet')) { try { if (name === 'chart') renderForecast(state); else renderFleet(state); } catch (e) { /* 다음 갱신 때 그려짐 */ } }
  if (typeof tutorialSpot === 'function') tutorialSpot();
}
document.querySelectorAll('#side-tabs .side-tab').forEach((b) => b.addEventListener('click', () => showSidePane(b.dataset.pane)));
try { const sp = localStorage.getItem('ilpp-side-pane'); if (sp && sp !== 'research') showSidePane(sp); } catch (e) { /* 기본 탭 유지 */ }
(function () {
  const btn = document.getElementById('rd-dock-toggle');
  if (btn) btn.addEventListener('click', () => setRdDock(!document.getElementById('techrd-panel').classList.contains('closed')));
  try { if (localStorage.getItem('ilpp-rd-dock') === '1') setRdDock(true); } catch (e) { /* 기본은 펴 둠 */ }
})();
// 상단 메뉴: 항목을 누르거나 밖을 누르면 닫힘
(function () {
  const menu = document.getElementById('menu'); if (!menu) return;
  menu.querySelector('.menu-list').addEventListener('click', () => { menu.open = false; });
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.open = false; });
})();

document.querySelectorAll('.subtab').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach((x) => x.classList.toggle('active', x === b));
    // 발전 설비 / 저장·연계 는 같은 카드 목록을 종류만 바꿔 보여줌
    const isCards = b.dataset.subtab === 'plants' || b.dataset.subtab === 'infra';
    document.getElementById('subtab-plants').classList.toggle('hidden', !isCards);
    document.getElementById('subtab-city').classList.toggle('hidden', b.dataset.subtab !== 'city');
    if (isCards) { paletteCat = b.dataset.subtab === 'infra' ? 'infra' : 'gen'; if (state) renderPalette(state); }
  });
});

// ------------------------------------------------------------
// 입력: 카드 끌기 / 지도 클릭 / 이동 / 도시 칠하기
// ------------------------------------------------------------
document.getElementById('palette-cards').addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.plant-card');
  if (!card || state.finished || state.cityDraft) return;
  if (e.target.closest('.pc-info')) return;   // ⓘ 버튼은 끌기 시작 아님
  if (typeof hidePlantDetail === 'function') { plantDetailPinned = null; hidePlantDetail(true); }
  if (card.classList.contains('locked')) { showMessage('🔒 테크트리에서 먼저 개발해야 합니다'); return; }
  e.preventDefault();
  drag = { type: card.dataset.plant, col: null, row: null };
  card.classList.add('dragging');
  render();
  document.body.style.cursor = 'grabbing';
  tooltipEl.style.display = 'none';
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// 마우스 휠: 가리키는 칸을 중심으로 확대·축소 (한 칸에 1.2배씩)
canvas.addEventListener('wheel', (e) => {
  if (!state) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
  zoomAt(zoomOf() * factor, e.clientX, e.clientY);
  tooltipEl.style.display = 'none';
}, { passive: false });

canvas.addEventListener('pointerdown', (e) => {
  // 모바일 자리 잡기(카드를 눌러 고른 뒤): 짧게 누르면 뗄 때 그 자리로 옮겨 가고, 누른 채 끌면 지도가 움직임 (확정은 아래의 "여기에 짓기" — mobile.js)
  if (drag && drag.tap) {
    pressPos = { x: e.clientX, y: e.clientY, col: state.view.col, row: state.view.row };
    return;
  }
  if (e.button === 2 || e.button === 1) {                     // 오른쪽/가운데 버튼: 지도 이동
    panStart = { x: e.clientX, y: e.clientY, col: state.view.col, row: state.view.row };
    e.preventDefault();
    return;
  }
  if (state.cityDraft) {
    const cell = pointToCell(e.clientX, e.clientY, null);
    if (cell.col === null) return;
    const has = state.cityDraft.tiles.some((t) => t.col === cell.col && t.row === cell.row);
    draftPaint = has ? 'erase' : 'paint';
    paintDraft(cell.col, cell.row, draftPaint);
    return;
  }
  // 왼쪽 버튼: 그대로 놓으면 선택, 끌면 지도 이동
  pressPos = { x: e.clientX, y: e.clientY, col: state.view.col, row: state.view.row };
});

minimapEl.addEventListener('pointerdown', (e) => {
  miniDragging = true;
  const c = minimapToCell(e.clientX, e.clientY);
  centerView(c.col, c.row);
  render();
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (!state) return;

  // 왼쪽 버튼으로 지도를 일정 거리 이상 끌면 화면 이동으로 전환
  if (pressPos && !panStart && (!drag || drag.tap) && !draftPaint) {
    const moved = Math.abs(e.clientX - pressPos.x) + Math.abs(e.clientY - pressPos.y);
    if (moved > (e.pointerType === 'touch' ? 12 : 6)) {   // 손가락은 누르기만 해도 조금 흔들리므로 더 넉넉히
      panStart = { x: pressPos.x, y: pressPos.y, col: pressPos.col, row: pressPos.row };
      document.body.style.cursor = 'grabbing';
    }
  }

  if (panStart) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const ts = TILE * zoomOf();
    const dc = (e.clientX - panStart.x) * scale / ts, dr = (e.clientY - panStart.y) * scale / ts;
    setView(panStart.col - dc, panStart.row - dr);
    render();
    return;
  }
  if (miniDragging) {
    const c = minimapToCell(e.clientX, e.clientY);
    centerView(c.col, c.row);
    render();
    return;
  }
  if (draftPaint) {
    const cell = pointToCell(e.clientX, e.clientY, null);
    if (cell.col !== null) paintDraft(cell.col, cell.row, draftPaint);
    return;
  }
  if (drag) {
    if (drag.tap) return;   // 모바일 자리 잡기: 움직이는 동안에는 자리를 건드리지 않음 (끌면 위에서 지도 이동으로 처리됨)
    const cell = pointToCell(e.clientX, e.clientY, drag.type);
    drag.col = cell.col; drag.row = cell.row;
    render();
    return;
  }

  // 툴팁
  if (e.target === canvas) {
    const cell = pointToCell(e.clientX, e.clientY, null);
    const b = cell.col !== null ? buildingAt(cell.col, cell.row) : null;
    const city = cell.col !== null ? cityAt(cell.col, cell.row) : null;
    if (b) {
      const p = PLANTS[b.type];
      const st = b.status === 'online' ? '가동 중' : b.status === 'upgrading' ? '업그레이드 중 ' + b.monthsLeft + '개월'
               : b.status === 'demolishing' ? '철거 중 ' + b.monthsLeft + '개월' : b.status === 'retired' ? '수명 종료' : '건설 중 ' + b.monthsLeft + '개월';
      tooltipEl.innerHTML = '<b>' + p.name + '</b> · ' + fmt(plantStats(state, b.type).capacity) + 'MW<br>' + st +
        (p.isLink ? '' : ' · 손실 ' + fmt(plantLoss(state, b) * 100) + '% · 수명 ' + fmt(Math.max(0, plantLifeMonths(b.type) - b.age) / 12, 1) + '년');
    } else if (city) {
      const density = cityDensity(city);
      tooltipEl.innerHTML = '<b>' + city.name + '</b> (' + city.tiles.length + '칸)<br>인구 ' + fmt(city.pop) + '만 · 칸당 ' + density.toFixed(2) + '만' +
        (density > ECON.densityLimit ? ' <span class="bad">과밀</span>' : '') + '<br><span class="muted">최대 수요 약 ' +
        fmt(city.pop * perCapitaNow(state) * peakMultOf(state.month)) + 'MW</span>';
    } else { tooltipEl.style.display = 'none'; return; }
    const rect = boardEl.getBoundingClientRect();
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (e.clientX - rect.left + 14) + 'px';
    tooltipEl.style.top  = (e.clientY - rect.top + 14) + 'px';
  } else tooltipEl.style.display = 'none';
});

document.addEventListener('pointerup', (e) => {
  if (!state) return;
  if (panStart) { panStart = null; pressPos = null; document.body.style.cursor = ''; return; }
  if (miniDragging) { miniDragging = false; return; }
  if (draftPaint) { draftPaint = null; return; }

  if (drag) {
    if (drag.tap) {   // 모바일 자리 잡기: 거의 움직이지 않고 뗐으면(= 짧게 누름) 그 자리로 옮김. 짓지는 않음 (확정 버튼으로 지음)
      if (pressPos && e.target === canvas && Math.abs(e.clientX - pressPos.x) + Math.abs(e.clientY - pressPos.y) <= 12) {
        const cellT = pointToCell(e.clientX, e.clientY, drag.type);
        if (cellT.col !== null && (cellT.col !== drag.col || cellT.row !== drag.row)) { drag.col = cellT.col; drag.row = cellT.row; render(); if (typeof mobilePlaceUpdate === 'function') mobilePlaceUpdate(); }
      }
      pressPos = null; return;
    }
    const cell = pointToCell(e.clientX, e.clientY, drag.type);
    const type = drag.type;
    drag = null;
    document.querySelectorAll('.plant-card').forEach((c) => c.classList.remove('dragging'));
    document.body.style.cursor = '';
    if (cell.col !== null) tryBuild(type, cell.col, cell.row); else render();
    return;
  }

  if (pressPos && e.target === canvas) {
    const moved = Math.abs(e.clientX - pressPos.x) + Math.abs(e.clientY - pressPos.y);
    if (moved < 6) {
      const cell = pointToCell(e.clientX, e.clientY, null);
      const b = cell.col !== null ? buildingAt(cell.col, cell.row) : null;
      state.selectedId = b ? b.id : null;
      if (b && typeof showSidePane === 'function') showSidePane('fleet');   // 설비를 누르면 오른쪽 "설비" 탭에 정보가 뜸
      render();
      renderSelected(state);
    }
  }
  pressPos = null;
});

canvas.addEventListener('pointerleave', () => { tooltipEl.style.display = 'none'; });

// 선택 설비 버튼
document.getElementById('selected-info').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'upgrade') upgradeSelected();
  if (btn.dataset.action === 'demolish') {
    if (confirm('정말 철거할까요? ' + ECON.demolishMonths + '개월이 걸리고 건설비의 ' + (ECON.demolishRefund * 100) + '%만 돌려받습니다.')) demolishSelected();
  }
});

// 도시 탭 버튼
document.getElementById('city-start').addEventListener('click', startCityDraft);
document.getElementById('city-auto').addEventListener('click', autoCitySite);
// 진행 요약 복사 (질문할 때 붙여 넣기용)
document.getElementById('copy-summary').addEventListener('click', () => {
  if (!state) return;
  const text = summaryText(state);
  const done = () => showMessage('📋 현재 게임 플레이 상황을 클립보드에 복사했습니다. 원하는 곳에 붙여 넣으세요', 3500);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('아래 내용을 복사하세요', text));
  else prompt('아래 내용을 복사하세요', text);
});
document.getElementById('city-cancel').addEventListener('click', cancelCityDraft);
document.getElementById('city-confirm').addEventListener('click', confirmCityDraft);

// 연구 칸의 버튼: 연구 시작 · 연구소 확장
document.getElementById('techrd-info').addEventListener('click', (e) => {
  if (!state || state.finished) return;
  const tb = e.target.closest('button[data-tech]'), lb = e.target.closest('button[data-lab]');
  let r = null;
  if (tb) r = attemptTech(state, tb.dataset.tech);
  else if (lb) r = expandLab(state, Number(lb.dataset.lab));
  if (!r) return;
  showMessage(r.msg, 3000);
  saveGame(); renderAll();
});

// 지도 탭이 아닐 때도 결과를 볼 수 있게 페이지 위에 잠깐 표시
function flashTab(msg) {
  let el = document.getElementById('flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    el.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);padding:8px 16px;background:rgba(0,0,0,0.85);border:1px solid #444;border-radius:8px;font-weight:bold;z-index:30;pointer-events:none;transition:opacity .2s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

// ------------------------------------------------------------
// 용어 풀이 (상단 용어 버튼)
// ------------------------------------------------------------
const GLOSSARY = [
  ['국정운영 점수', '20년 동안의 민심을 쌓은 값입니다. 매달 그달의 민심만큼 쌓이고, 11년 차부터는 한 달이 ' + ECON.scoreLateWeight + '배로 쳐집니다. 전력 공급, 요금, 환경, 도시, 연구는 따로 점수가 없고 전부 민심의 다섯 분야를 통해 반영됩니다.'],
  ['민심의 다섯 분야', '민심(0~100)은 다섯 분야의 점수를 더한 값입니다. 분야마다 ' + ECON.moodPillarMax + '점이 만점입니다. ① 전력 공급: 정전이 없으면 만점이고, 정전이 나면 여러 달 깎입니다. ② 전기 요금: 국민이 내는 요금이 기대 요금과 같으면 10점, 쌀수록 오릅니다. ③ 환경: 전기를 만들 때 나오는 탄소가 0이면 만점, 탄소 기준 이상이면 0점입니다. ④ 도시·생활: 일자리(인구 증가) · 전력 수출 · 주거 여유(새 도시)에서 주민 불만(기피 시설 · 원전 불안 · 국토 잠식)을 뺍니다. ⑤ 미래·신뢰: 연구와, 정책 · 공약을 지키는 것입니다. 모든 분야가 만점이어야 100이라서 한두 분야만 잘해서는 높이 올라가지 않습니다.'],
  ['예상 민심', '지금 나라 상태가 그대로 이어지면 민심이 다다르게 될 값입니다. 위쪽 막대의 민심 옆에 작게 적혀 있습니다. 다섯 분야 점수의 합에 "여론"을 더한 값이고, 민심은 매달 이 값 쪽으로 차이의 ' + Math.round(ECON.moodPull * 100) + '%만큼 움직입니다. 설비를 짓거나 요금이 바뀌면 예상 민심이 먼저 바뀌고, 민심이 두세 달에 걸쳐 따라갑니다.'],
  ['여론', '사건 카드의 선택이나 목표의 보상 · 벌칙처럼 민심을 한 번에 올리거나 내린 일이 남긴 여운입니다. 그 자리에서 민심이 바로 움직이고, 같은 크기가 예상 민심에도 얹혔다가 매달 ' + Math.round((1 - ECON.moodBuzzDecay) * 100) + '%씩 옅어집니다.'],
  ['주거 여유 · 새 도시', '도시·생활 분야의 점수 가운데 하나(' + ECON.moodHousingMax + '점)로, 전국 평균 인구 밀도로 매깁니다. 칸당 ' + ECON.housingComfort + '만 명 이하면 만점이고 과밀 기준인 ' + ECON.densityLimit + '만 명이면 0점입니다. 인구는 계속 늘어나므로 새 도시를 세워야 유지됩니다. 새 도시를 세우면 밖에서 사람이 들어와(전국 인구의 ' + Math.round(ECON.cityNewcomerShare * 100) + '% 또는 ' + Math.round(ECON.cityNewcomers * ECON.densityLimit * ECON.cityTiles) + '만 명 가운데 큰 쪽) 전력 수요도 그만큼 늘어납니다. 전기가 남을 때 수요를 끌어오는 방법이기도 합니다.'],
  ['재선', '10년 차가 끝날 때 선거가 있습니다. 10년을 넘기는 그 달의 민심이 ' + ECON.electionBar + ' 이상이어야 임기를 이어 가고, 못 미치면 게임이 끝납니다. 2년 전에 목표로 예고됩니다.'],
  ['전기요금 조정', '정책 칸의 손잡이로, ' + (ECON.tariffFromMonth / 12 + 1) + '년 차부터 쓸 수 있습니다. 지원을 켜면 국민이 실제로 내는 요금이 10%나 20% 내려가 요금 불만이 줄고, 그만큼이 전력 판매 수입에서 나갑니다. 할증은 반대입니다. 고칠 수 있는 것은 요금뿐이라 탄소·정전·기술 문제는 돈으로 덮을 수 없고, 전기값이 이미 싼 나라는 지원해도 얻는 게 거의 없습니다. 한 번 바꾸면 ' + ECON.tariffLockMonths + '개월 동안 못 바꿉니다.'],
  ['SMP (전기 도매가격)', '그 시간에 돌아간 발전기 중 가장 비싼 발전기의 원가에 마진을 붙인 값입니다. 전기는 이 값을 기준으로 팔리므로, 원가가 싼 발전기일수록 많이 남습니다. 국민이 내는 요금은 이 값 그대로가 아니라 아래의 "소비자 요금"입니다.'],
  ['소비자 요금', '국민이 실제로 내는 전기값입니다. 발전소에 정산해 준 돈을 공급한 전기로 나눈 평균 단가라서, 가스만 쓰면 도매가(SMP)와 같고 원자력·석탄(정산조정계수)이나 태양광·풍력(통합 비용 공제) 비중이 클수록 도매가보다 싸집니다. 국민이 기대하는 전기값(처음 ' + ECON.moodPriceRef0 + '원, 해마다 ' + ECON.moodPriceRefDrop + '원씩 내려감)과 같으면 전기 요금 분야가 10점이고, 1원 쌀 때마다 ' + ECON.moodPriceSlope + '점 오릅니다(50원 싸면 만점, 50원 비싸면 0점).'],
  ['정책 공약', '정책을 고르면 약속이 하나 따라옵니다 (예: 친원전이면 원자력 비중과 원자력 테크). 기한 안에 지키면 임기 끝까지 민심 +' + ECON.moodPledgeKept + ', 넘기면 −' + ECON.moodPledgeBroken + '입니다. 늦게라도 지키면 벌점은 사라집니다. 중립처럼 약속이 없는 선택도 있습니다.'],
  ['재선 공약', '선거 1년 전(9년 차 말)에 발표하는 2기 국정 과제입니다. 분야 하나(내 에너지 정책에 맞는 것 하나와 공통 셋 중)와 수위 하나(현실적 · 과감 · 파격)를 고릅니다. 과감할수록 발표 직후 "공약 기대감"으로 민심이 올라 재선에 도움이 되지만(과감 +' + TERM2_LEVELS[1].boost + ', 파격 +' + TERM2_LEVELS[2].boost + ', 1년 뒤부터 사라짐), 목표 숫자가 훨씬 높습니다. 기한은 18년 차 말이고 1년 평균으로 판정합니다. 지키면 임기 끝까지 민심 +' + TERM2_LEVELS.map((l) => l.kept).join(' / +') + ', 못 지키면 그달 민심 −' + TERM2_LEVELS.map((l) => l.hit).join(' / −') + ', 그 뒤로도 −' + TERM2_LEVELS.map((l) => l.broken).join(' / −') + '가 남습니다(수위 순). 모두 미래·신뢰 분야의 점수입니다.'],
  ['연구', '미래·신뢰 분야의 점수(' + ECON.moodResearchMax + '점)입니다. 에너지 정책으로 고른 내 노선의 테크와 계통 테크를 2:1로 본 "연구 수준"을 국민의 기대와 비교합니다. 화력 노선은 복합발전·석탄의 평균, 재생에너지 노선은 태양광·풍력의 평균이라 두 설비를 모두 지어야 온전히 반영되고, 원자력 노선은 15단계를 10단계 눈금으로 바꿔 셉니다(9단계 = 6). 중립이면 지금 쓰는 설비들의 테크 평균입니다. 기대는 해마다 ' + ECON.moodTechPerYear + '단계씩 올라가고, 기대와 같으면 ' + ECON.moodResearchMid + '점, 1단계 앞설 때마다 +' + ECON.moodTechSlope + ', 뒤처질 때마다 −' + ECON.moodTechSlope + '입니다.'],
  ['테크트리', '여섯 가지입니다. 화력 노선은 복합발전과 석탄화력(각 10단계), 재생에너지 노선은 태양광과 풍력(각 10단계), 원자력 노선은 원자력 하나(15단계)를 올립니다. 계통 · 배터리(10단계)는 어느 노선이든 함께 씁니다.'],
  ['계절과 날씨', '전력 수요는 1월과 8월이 가장 크고 4·5·10월이 가장 작습니다(가장 큰 달이 가장 작은 달의 약 1.3배). 하루 중에는 여름은 낮 2시쯤, 그 밖의 계절은 저녁 5시쯤이 가장 큽니다. 여름은 평년보다 더울수록, 겨울은 추울수록 수요가 늘어납니다(1℃에 약 1%). 해가 떠 있는 시간은 여름 14시간, 겨울 10시간이라 겨울 저녁에는 태양광이 나오지 않습니다. 풍력은 겨울과 밤에 셉니다. 가스 발전은 추울수록 출력이 오르고 더울수록 줄어듭니다(15℃ 기준 1℃에 0.6%).'],
  ['태양광과 풍력의 조화', '태양광은 낮과 여름에, 풍력은 밤과 겨울에 많이 나옵니다. 한쪽만 지으면 남는 시간에는 버려지고 모자라는 시간에는 다른 발전기가 메워야 합니다. 둘을 섞어야 하루와 한 해가 고르게 채워집니다.'],
  ['용량 요금', '발전량을 조절할 수 있는 설비(가스·석탄·원자력)가 대기해 주는 대가로 매달 받는 돈입니다. 전기를 안 팔아도 나오지만, 최대 수요의 ' + ECON.capacityReserveCap + '배까지만 줍니다.'],
  ['공급 예비율', '공급 능력이 최대 수요보다 얼마나 많은지입니다. 모자라면 정전이 나고, ' + Math.round((ECON.inducedReserve - 1) * 100) + '%를 넘으면 사람이 몰려와 수요가 더 빨리 늘어납니다. 다만 조절 설비(복합발전·석탄·원전)를 한 해 최대 수요의 ' + Math.round(ECON.reserveFree * 100) + '% 넘게 지으면, 남아도는 설비의 유지비가 전기요금에 얹힙니다(넘는 10%p마다 +' + Math.round(ECON.reserveWonPer / 10) + '원 → 전기 요금 점수 −' + (ECON.reserveWonPer / 10 * ECON.moodPriceSlope) + '). 전기가 남으면 새 도시를 세워 수요를 끌어오거나 낡은 설비를 철거하세요.'],
  ['기저 전원 · 정산조정계수', '원자력·SMR·석탄처럼 싸게 꾸준히 도는 발전기입니다. 너무 많이 남지 않도록 SMP의 ' + Math.round(ECON.baseloadSettle * 100) + '%만 받습니다 (전력시장 정책에 따라 달라짐). 그만큼 소비자 요금이 싸집니다.'],
  ['램프 (출력 조절 속도)', '한 시간에 출력을 바꿀 수 있는 폭입니다. 복합발전은 용량의 ' + Math.round(PLANTS.ccgt.ramp * 100) + '%라 수요를 자유롭게 따라가고, 석탄은 ' + Math.round(PLANTS.coal.ramp * 100) + '%(석탄 테크 2단계부터 ' + Math.round(PLANTS.coal.ramp * 200) + '%)에 최소 출력 ' + Math.round(PLANTS.coal.minLoad * 100) + '%라 느립니다. 원자력은 출력을 조절할 수 없어 항상 100%로 돌고, 태양광·풍력은 날씨대로 나옵니다. 그래서 석탄·원자력은 바닥 수요를 맡기고, 오르내리는 몫은 복합발전과 배터리가 맡아야 합니다. 밤에 남는 전기는 배터리에 담거나 수출해야 합니다.'],
  ['출력 제한 · 과잉 발전', '전기가 수요보다 많이 남아 버리는 상황입니다. 그 시간의 SMP가 바닥값(' + ECON.smpFloor + '원)으로 떨어집니다. 연계선으로 수출하면 줄일 수 있습니다. 원전·석탄처럼 줄일 수 없는 전기가 배터리와 수출로도 못 받아낼 만큼 남으면(과잉 발전) 정전은 아니지만 처리 비용이 전기요금에 얹힙니다. 남은 양이 그달 수요의 10%면 요금이 kWh당 ' + Math.round(ECON.overPriceWon * 0.1) + '원 오릅니다.'],
  ['초과 이윤 환수', '한 달 이익이 투자 자본(지은 설비 값)의 연 ' + Math.round(ECON.clawRoi * 100) + '% 수준을 넘으면, 넘는 부분의 절반 이상을 정부가 가져갑니다. 비율은 전력시장 정책에 따라 달라집니다.'],
  ['탄소세', '탄소 1톤을 배출할 때마다 내는 돈입니다. ' + fmt(ECON.carbonTaxStart) + '원에서 시작해 매년 ' + Math.round(ECON.carbonTaxGrowth * 100) + '%씩 오릅니다 (최대 ' + fmt(ECON.carbonTaxMax) + '원).'],
  ['탄소 원단위 (t/MWh)', '전기 1MWh를 만들 때 나온 탄소량입니다. 환경 분야의 점수는 이 값이 0이면 만점(' + ECON.moodPillarMax + '점), "탄소 기준" 이상이면 0점입니다. 기준은 처음 ' + ECON.carbonRefStart.toFixed(2) + '에서 해마다 내려가 ' + ECON.intensityEndYear + '년 차에 ' + ECON.carbonRefEnd.toFixed(2) + '이 됩니다. 복합발전(' + PLANTS.ccgt.co2.toFixed(2) + ')은 초반에만 조금 받고, 석탄(' + PLANTS.coal.co2.toFixed(2) + ')은 테크를 끝까지 올려도 받지 못합니다. 태양광·풍력·원자력 같은 무탄소 전원을 섞어야 오릅니다.'],
  ['주파수 안정도', '전력망의 주파수가 흔들리지 않고 버티는 정도입니다. 태양광·풍력·배터리는 돌아가는 터빈이 없어(관성 없음) 주파수를 잡아 주지 못합니다. 그래서 한 시간에 쓰는 전기 중 이런 전기가 차지할 수 있는 비중에 한도(처음 ' + Math.round(ECON.inertiaLimit * 100) + '%)가 있습니다. 넘는 태양광·풍력은 버려지고 배터리는 그만큼 내보내지 못해, 나머지는 복합발전·석탄·원자력처럼 터빈이 도는 발전기가 채워야 합니다. 계통 테크로 한도가 올라갑니다. "전망" 탭의 주파수 안정도 점수는 이 한도와 공급 여유, 밤의 과잉 발전을 함께 본 값입니다.'],
  ['전력 수출', '국제 연계선이 있으면 남는 전기를 이웃 나라에 팝니다. 돈이 들어오고, 수출량이 그달 수요의 1%일 때마다 도시·생활 분야가 +' + ECON.moodExportPer + '점 오릅니다(최대 +' + ECON.moodExportMax + '). 팔 수 있는 것은 남는 전기뿐입니다. 복합발전·석탄은 필요한 만큼만 돌기 때문에 화력만으로는 수출이 생기지 않고, 원전이나 태양광·풍력을 넉넉히 지어야 합니다.'],
  ['배터리', '남는 전기를 담았다가 모자랄 때 내보내는 설비입니다. 낮에 남는 태양광을 저녁에 쓰게 해 주고, 밤에 남는 원전·석탄 전기를 아침에 쓰게 해 줍니다. 발전 설비 바로 옆에 붙여 지어야 합니다. 관성이 없어서 주파수 안정도 한도 안에서만 내보냅니다.'],
  ['REC (재생에너지 보조금)', '태양광·풍력이 만든 전기에 얹어 주는 보조금입니다. kWh당 ' + ECON.rec + '원에서 시작해 ' + ECON.recYears + '년에 걸쳐 0이 됩니다.'],
  ['건설 물가', '경제(전력 수요)가 시작의 ' + ECON.costIndexFrom + '배를 넘어 커질수록 땅값·인건비·자재비가 올라 새 설비 건설비와 고정 유지비가 함께 오릅니다. 지도 아래 칸에 지금 배수가 표시됩니다. 건설비를 깎는 테크는 후반으로 갈수록 값어치가 커집니다.'],
  ['연구소 규모', '오른쪽 "연구" 탭에서 돈을 들여 키우는 숫자입니다. 하는 일은 세 가지입니다. 높은 단계의 연구를 열고(1단계 ' + TECH_TIER_RD[0] + ', 그 뒤로 단계마다 +' + (TECH_TIER_RD[1] - TECH_TIER_RD[0]) + ' · 원자력은 +' + (NUC_TIER.rd[1] - NUC_TIER.rd[0]) + '), 연구 성공 확률을 올리고, ' + RD_PER_SLOT + '마다 동시에 하는 연구를 하나 늘립니다. 유지비는 없습니다.'],
];
(function () {
  const box = document.getElementById('glossary'); const list = document.getElementById('glossary-list'); const open = document.getElementById('glossary-open');
  if (!box || !list || !open) return;
  list.innerHTML = GLOSSARY.map((g) => '<div><dt>' + g[0] + '</dt><dd>' + g[1] + '</dd></div>').join('');
  open.addEventListener('click', () => box.classList.remove('hidden'));
  document.getElementById('glossary-close').addEventListener('click', () => box.classList.add('hidden'));
  box.addEventListener('click', (e) => { if (e.target === box) box.classList.add('hidden'); });
})();

// ------------------------------------------------------------
// 단축키
// ------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (!state) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  const startOpen = !document.getElementById('start').classList.contains('hidden');
  const overOpen  = !document.getElementById('gameover').classList.contains('hidden');
  const decisionOpen = !document.getElementById('decision').classList.contains('hidden');
  const glossaryEl = document.getElementById('glossary');
  if (glossaryEl && !glossaryEl.classList.contains('hidden')) { if (e.key === 'Escape') glossaryEl.classList.add('hidden'); return; }
  if (startOpen || overOpen || decisionOpen) return;

  const key = e.key, code = e.code;
  const isAdvance = code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || key === ' ' || key === 'Enter' || key === 'Spacebar';
  if (isAdvance) {
    e.preventDefault();
    const reportOpen = !document.getElementById('report').classList.contains('hidden');
    if (reportOpen) advanceMonth();
    else if (!drag && !state.finished) runMonth();
    return;
  }
  if (key === '1') showTab('map');
  else if (key === '2' || key === '3') showTab('tech');   // 연구 칸 열기
  else if (key === 'Escape') {
    if (drag) { drag = null; document.body.classList.remove('mplacing'); document.querySelectorAll('.plant-card').forEach((c) => c.classList.remove('dragging')); document.body.style.cursor = ''; }
    state.selectedId = null;
    render(); renderSelected(state);
  } else if (currentTab === 'map') {
    const step = 4;
    let moved = true;
    if (key === 'ArrowLeft'  || key === 'a' || key === 'A') setView(state.view.col - step, state.view.row);
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') setView(state.view.col + step, state.view.row);
    else if (key === 'ArrowUp'    || key === 'w' || key === 'W') setView(state.view.col, state.view.row - step);
    else if (key === 'ArrowDown'  || key === 's' || key === 'S') setView(state.view.col, state.view.row + step);
    else moved = false;
    if (moved) { e.preventDefault(); render(); }
  }
});

// ------------------------------------------------------------
// 버튼들
// ------------------------------------------------------------
document.getElementById('next-month').addEventListener('click', runMonth);
document.getElementById('tutorial-help').addEventListener('click', () => { if (!state || state.finished) return; if (!state.tutorial || state.tutorial.done || confirm('안내를 처음부터 다시 볼까요?')) tutorialRestart(); });
document.getElementById('report-close').addEventListener('click', advanceMonth);

// 자진 사퇴: 게임을 여기서 끝내고 엔딩(점수·기록)을 봄. 점수는 재임 기간 비율만큼만 반영
document.getElementById('resign').addEventListener('click', () => {
  if (!state || state.finished) return;
  if (!confirm('정말 사퇴하시겠습니까? 지금까지의 기록으로 엔딩과 점수가 나오고, 이 게임은 이어할 수 없습니다.')) return;
  finish('자진 사퇴', state.year + '년 ' + state.month + '월, 임기를 ' + fmt(yearsElapsed(state), 1) + '년 채우고 스스로 물러났습니다.', 'resigned');
});
document.getElementById('new-game').addEventListener('click', () => {
  if (confirm('지금 게임을 버리고 새로 시작할까요?')) {
    localStorage.removeItem(SAVE_KEY);
    document.getElementById('start').classList.remove('hidden');
    document.getElementById('continue-game').classList.add('hidden');
  }
});
document.querySelectorAll('#start .mode').forEach((btn) => {
  btn.addEventListener('click', () => { document.getElementById('start').classList.add('hidden'); showTab('map'); newGame(btn.dataset.mode); });
});
document.getElementById('continue-game').addEventListener('click', () => {
  if (loadGame()) {
    document.getElementById('start').classList.add('hidden'); showTab('map'); renderAll();
    // 결산 창을 닫기 전에 나갔던 판: 그 결산을 다시 띄움 (닫아야 다음 달로 넘어감 — 같은 달을 두 번 정산하지 않도록)
    if (state.reportPending && state.lastReport && !state.finished) { try { renderReport(state.lastReport); document.getElementById('report').classList.remove('hidden'); } catch (e) { state.reportPending = false; } }
  }
});
document.getElementById('gameover-restart').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('start').classList.remove('hidden');
  document.getElementById('continue-game').classList.add('hidden');
});
// 엔딩 화면: 랭킹 등록
document.getElementById('rank-register').addEventListener('click', () => {
  if (!state || !state.summary || state.summary.registeredId) return;
  const name = (document.getElementById('rank-name').value || '').trim() || state.playerName;
  state.summary.registeredId = addRanking(state.summary, name);
  renderEndingRank(state.summary);
});
// 정책 칸의 전기요금 조정 버튼
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tariff]');
  if (btn && !btn.disabled) setTariff(+btn.dataset.tariff);
});
// 랭킹 목록의 삭제 버튼 (엔딩 화면·랭킹 창 공통)
document.addEventListener('click', (e) => {
  const del = e.target.closest('[data-rank-del]');
  if (del) {
    if (confirm('이 기록을 지울까요?')) {
      deleteRanking(del.dataset.rankDel);
      if (state && state.summary && state.summary.registeredId === del.dataset.rankDel) delete state.summary.registeredId;
      refreshRankViews();
    }
    return;
  }
  if (e.target.closest('[data-rank-clear]')) {
    if (confirm('랭킹을 모두 지울까요? 되돌릴 수 없습니다.')) { clearRankings(); if (state && state.summary) delete state.summary.registeredId; refreshRankViews(); }
  }
});
function refreshRankViews() {
  if (state && state.summary) renderEndingRank(state.summary);
  renderRankView(document.getElementById('rankings-list'), { deletable: true });
}
// 랭킹 종류 탭 (자본 / 민심 / 재임 기간)
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-rank-tab]');
  if (!tab) return;
  const box = tab.closest('.rank-view');
  box.dataset.tab = tab.dataset.rankTab;
  renderRankView(box, { deletable: true, highlight: box.dataset.highlight || null, limit: box.dataset.limit ? +box.dataset.limit : 0 });
});
document.getElementById('show-rankings').addEventListener('click', () => {
  renderRankView(document.getElementById('rankings-list'), { deletable: true });
  document.getElementById('rankings').classList.remove('hidden');
});
document.getElementById('rankings-close').addEventListener('click', () => document.getElementById('rankings').classList.add('hidden'));
// 사건 창: 선택지 클릭 / 닫기
document.getElementById('decision-choices').addEventListener('click', (e) => {
  const go = e.target.closest('[data-confirm]');
  if (go) { if (go.dataset.confirm !== '') { t2Theme = null; chooseDecision(+go.dataset.confirm); } return; }
  const th = e.target.closest('[data-theme]');
  if (th) { t2Theme = th.dataset.theme; renderDecision(state); return; }   // 분야를 골랐으면 수위 카드로
  if (e.target.closest('[data-back]')) { t2Theme = null; renderDecision(state); return; }
  const btn = e.target.closest('[data-choice]');
  if (!btn) return;
  if (btn.classList.contains('t2card')) {   // 큰 카드: 누르면 고르기만 하고, 아래 버튼으로 확정
    const box = btn.parentElement;
    box.querySelectorAll('.t2card').forEach((c) => c.classList.toggle('picked', c === btn));
    box.classList.add('has-pick');
    const bar = box.querySelector('.t2-confirm'), b = bar.querySelector('button');
    bar.classList.remove('hidden'); b.dataset.confirm = btn.dataset.choice; b.textContent = '"' + btn.querySelector('strong').textContent + '" 을(를) 약속한다';
    return;
  }
  chooseDecision(+btn.dataset.choice);
});
document.getElementById('decision-close').addEventListener('click', () => {
  document.getElementById('decision').classList.add('hidden');
  if (state && state.pendingDecision) { renderDecision(state); return; }   // 아직 답하지 않았으면 다시 띄움
});

// ------------------------------------------------------------
// 저장 / 불러오기
// ------------------------------------------------------------
function saveGame() {
  try {
    if (!state.finished) localStorage.setItem(SAVE_KEY, JSON.stringify(state, (k, v) => (k === 'keys' ? undefined : v)));
  } catch (err) { /* 무시 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    state = JSON.parse(raw);
    // 지도 크기나 규칙이 달라진 예전 저장본은 불러올 수 없음 (지도 2,700칸 · 에너지 정책 · 테크트리 구성: 복합발전·석탄 분리, 원자력 15단계)
    if (!state.grid || state.grid.length !== ROWS || state.grid[0].length !== COLS || !state.tech || state.tech.thermal !== undefined || state.tech.grid === undefined) { localStorage.removeItem(SAVE_KEY); state = null; return false; }
    for (const c of state.cities) restoreCity(c);
    if (!state.tech) state.tech = emptyTech();
    if (!state.rd) state.rd = emptyRd();
    if (!state.startYear) { state.startYear = 2030; state.startMonth = 3; }   // 예전 저장본은 2030년 3월 시작이었음
    if (!state.quests) state.quests = [];
    if (!state.effects) state.effects = [];
    if (!state.crisisPlan) state.crisisPlan = makeCrisisPlan(state, state.mode === 'normal' ? ECON.normalYears : 20);
    if (!state.neighborPeak) state.neighborPeak = neighborBasePeak(state);
    if (!state.view) state.view = { col: 0, row: 0 };
    fullMapView();   // 이어하기도 지도 전체가 보이는 화면에서 시작
    for (const b of state.buildings) if (b.age === undefined) b.age = 0;
    if (!state.mood) state.mood = { outage: 0 };
    if (state.tariff === undefined) { state.tariff = 0; state.tariffSetAt = -999; }
    if (state.scoreAcc === undefined) state.scoreAcc = scoreFromHistory(state.history);
    return true;
  } catch (err) { return false; }
}

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
// 시작 화면 뒤 배경 지도: 지도 전체가 캔버스에 딱 맞게 그림
let startPreviewGrid = null;
function drawStartPreview() {
  if (!startPreviewGrid) return;
  const s = zoomMin();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d2238'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, (canvas.width - COLS * TILE * s) / 2, (canvas.height - ROWS * TILE * s) / 2);
  drawTerrain(ctx, startPreviewGrid, 0, true);
  ctx.restore();
}

(function init() {
  try {
    const rawSave = localStorage.getItem(SAVE_KEY);
    if (rawSave) {
      // 지도 크기가 지금과 다른 예전 저장본은 이어할 수 없으므로 버튼을 숨기고 지움
      const s = JSON.parse(rawSave);
      if (s.grid && s.grid.length <= ROWS && s.grid[0].length <= COLS) document.getElementById('continue-game').classList.remove('hidden');
      else localStorage.removeItem(SAVE_KEY);
    }
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) document.getElementById('player-name').value = saved;
  } catch (err) { /* 무시 */ }

  document.getElementById('player-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); document.querySelector('#start .mode[data-mode="normal"]').click(); }
  });

  // 시작 화면 뒤 배경 지도 (지도 전체)
  startPreviewGrid = generateMap();
  drawStartPreview();
})();

// ------------------------------------------------------------
// 타이틀 화면: 접속하자마자 그림(assets/title-screen)을 먼저 보여 주고, 아무 키나 누르거나 클릭하면 시작 화면으로 넘어감
//  그림을 못 불러오면 타이틀 화면 없이 바로 시작 화면이 나옴
// ------------------------------------------------------------
(function titleScreen() {
  const box = document.getElementById('title-screen');
  const img = document.getElementById('title-img');
  if (!box || !img) return;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    box.classList.add('leaving');
    setTimeout(() => box.classList.add('hidden'), 380);
  };
  // 새로고침(F5)·개발자 도구(F12)·Ctrl 조합 같은 브라우저 조작 키는 그대로 두고, 나머지 키는 "시작"으로 받음
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'F5', 'F11', 'F12'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
  img.addEventListener('load', () => {
    box.style.setProperty('--title-bg', 'url("' + img.src + '")');   // 그림 주변 여백은 같은 그림을 흐리게 깔아 채움
    box.classList.remove('loading');
  });
  img.addEventListener('error', () => { open = false; document.removeEventListener('keydown', onKey, true); box.classList.add('hidden'); });
  img.src = img.dataset.src;
})();

// Refresh once when all miniatures have loaded, including cards created during loading.
worldArtReady.then(() => { if (state) renderAll(); else drawStartPreview(); });

// 부도 한도 (억): 기본 ECON.bankruptAt, 최근 12개월 수입 합의 절반이 더 크면 그만큼
function bankruptLimit(state) {
  const h = (state.history || []).slice(-12);
  const income = h.reduce((s, x) => s + Math.max(0, (x.profit || 0) + (x.fuel || 0) + (x.carbon || 0) + (x.salary || 0)), 0);
  return Math.max(-ECON.bankruptAt, Math.round(income * 0.5));
}

// 창 크기가 바뀌면 지도 캔버스도 다시 맞추고 그림
(function () {
  let t = null;
  const refit = () => { clearTimeout(t); t = setTimeout(() => { if (refitMapCanvas()) { if (state) render(); else drawStartPreview(); } }, 100); };
  window.addEventListener('resize', refit);
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(refit); const bd = document.getElementById('map-wrap'); if (bd) ro.observe(bd); }
  setInterval(refit, 1000);   // 안전망: 이벤트를 놓쳐도 1초 안에 맞춤
})();
