// ============================================================
// 게임 진행: 상태, 탭, 지도 조작(드래그/클릭/이동), 도시 조성, 턴 진행, 저장
// ============================================================

const SAVE_KEY = 'ilpp-save-v2';
const NAME_KEY = 'ilpp-player-name';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
// 지도 캔버스는 지도 칸(#map-wrap) 폭을 꽉 채우고, 높이는 아래 요약 줄이 들어갈 만큼 남기고 정함 (보이는 칸 수가 화면 크기에 따라 달라짐)
function fitMapCanvas() {
  // 캔버스 비율은 지도 전체 비율(가로 COLS : 세로 ROWS)과 같게 → 끝까지 축소하면 지도 전체가 빈 공간 없이 딱 들어감
  const wrap = document.getElementById('map-wrap') || canvas.parentElement;
  const board = document.getElementById('board') || wrap.parentElement;
  const availW = Math.round(board.clientWidth);
  if (availW < 200) return false;
  const ratio = ROWS / COLS;
  const availH = Math.max(360, window.innerHeight - 650);
  const w = Math.min(availW, Math.floor(availH / ratio));
  const h = Math.round(w * ratio);
  wrap.style.width = w + 'px';
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w; canvas.height = h;
  return true;
}
fitMapCanvas();

const minimapEl = document.getElementById('minimap');
const boardEl   = document.getElementById('board');
const tooltipEl = document.getElementById('tooltip');

let state = null;
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
  const name = raw.slice(0, 12) || '대통령';
  try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* 무시 */ }
  return name;
}

function newGame(mode) {
  const tutorial = mode === 'tutorial';   // 튜토리얼 = 일반 모드 + 비서 안내 (안내가 끝나면 그대로 20년 임기)
  if (tutorial) mode = 'normal';
  const grid = generateMap();
  const cities = generateCities(grid, 3);

  state = {
    mode, playerName: readPlayerName(),
    year: ECON.startYear, month: ECON.startMonth,
    startYear: ECON.startYear, startMonth: ECON.startMonth,
    money: ECON.startMoney,
    grid, cities, buildings: [], nextId: 1,
    gasPrice: 1.0, carbonTax: ECON.carbonTaxStart,
    weather: null, event: null, demandCurve: null,
    lastReport: null, history: [],
    selectedId: null, cleanStreak: 0,
    happiness: ECON.happinessStart,
    tech: emptyTech(), techPity: {}, techLog: [],
    rd: emptyRd(),
    view: { col: 0, row: 0 }, zoom: 1,
    cityDraft: null,
    finished: false,
    tutorial: tutorial ? { step: 0, done: false, guard: true } : null,
  };
  if (tutorial) state.money = ECON.startMoney + 3000;   // 배우는 동안 여유 자금

  // 시작 설비: 가장 큰 도시 바로 바깥에 복합발전 1기 + 가스터빈 1기
  const main = cities.slice().sort((a, b) => b.pop - a.pop)[0];
  const starters = ['ccgt', 'gasTurbine'];
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
  centerView(main.center.col, main.center.row);

  startMonth(false);
  // 시작 유예: 초기 인구를 시작 설비에 맞춰, 가장 수요가 큰 계절에도 8%쯤 여유가 있게 (설비 짓는 데 걸리는 시간을 감안)
  {
    const caps0 = fleetCapacities(state);
    const firm0 = caps0.nuclear + caps0.smr + caps0.coal + caps0.ccgt + caps0.gt;
    const worstSeason = Math.max(SEASON_PEAK.summer, SEASON_PEAK.winter);
    const targetPop = firm0 / (ECON.perCapitaMW * worstSeason * ECON.startReserve);
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
  state.h2Ratio = 0.5;                            // 저장 수소 중 터빈 연료로 쓸 비율
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
  if (state.event && state.event.effect === 'nuclearOutage' && (state.tech.nuclear || 0) >= 4) state.event = null;   // 4세대 원자로: 정기검사 정지 없음
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
  milestone(def.icon + ' ' + def.name + (def.choices.length > 1 ? ' → ' + choice.label : ''));
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
  const report = simulateMonth(state);
  state.exportTotal = (state.exportTotal || 0) + (report.energy.exp || 0);
  state.h2ExportTotal = (state.h2ExportTotal || 0) + (report.energy.h2 ? report.energy.h2.export : 0);
  state.h2ProdTotal = (state.h2ProdTotal || 0) + (report.energy.h2 ? report.energy.h2.prod : 0);   // 누적 생산량 (퀘스트용: 터빈에 태워도 인정)
  if (policyMods(state).h2Subsidy) state.money -= policyMods(state).h2Subsidy;   // 수소 경제 육성 보조금
  state.money += report.money.profit;
  // 임기 누계: 교역(전력·수소 수출 수입, 전력 수입 비용)과 발전 수입 — 점수의 경제·교역 항목
  if (!state.trade) state.trade = { exportRev: 0, h2Rev: 0, importCost: 0, energyRev: 0, expMWh: 0, demandMWh: 0 };
  state.trade.exportRev += report.money.exportRev || 0;
  state.trade.expMWh = (state.trade.expMWh || 0) + (report.energy.exp || 0);
  state.trade.demandMWh = (state.trade.demandMWh || 0) + (report.energy.demand || 0);
  state.trade.h2Rev += Math.max(0, report.money.h2Rev || 0);
  state.trade.importCost += report.money.importCost || 0;
  state.trade.energyRev += report.money.energyRev || 0;

  const hc = happinessChange(state, report);
  report.happiness = { before: state.happiness, items: hc.items, total: hc.total };
  state.happiness = clamp(state.happiness + hc.total, 0, 100);
  report.happiness.after = state.happiness;

  state.lastReport = report;
  // 진행 기록 (엔딩 통계 그래프용)
  const g = report.energy.gen;
  const genTotal = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind;
  const smpAvg = report.hours.reduce((s, h) => s + h.smp, 0) / report.hours.length;
  // 행복도를 깎은 항목별 합계 (엔딩 원인 분석용)
  const hneg = {};
  for (const it of hc.items) if (it.delta < 0 && it.key) hneg[it.key] = (hneg[it.key] || 0) + it.delta;
  const m = report.money;
  const tgtNow = intensityTarget(state);
  state.history.push({
    year: report.year, month: report.month, profit: m.profit, co2: report.energy.co2, blackoutHours: report.blackoutHours,
    money: state.money, happy: state.happiness, smp: smpAvg, rd: rdLevel(state),
    ren: genTotal > 0 ? (g.solar + g.wind) / genTotal : 0, nuc: genTotal > 0 ? g.nuclear / genTotal : 0,
    hneg, inten: reportIntensity(report), tgt: tgtNow,
    fuel: m.fuel, carbon: m.carbon, salary: m.salary, blk: m.blackoutCost, over: m.overCost, imp: m.importCost,
    pop: state.cities.reduce((s, c) => s + c.pop, 0), ratio: supplyDemandRatio(state), tax: m.tax || 0,
    h2: report.energy.h2 ? report.energy.h2.export + report.energy.h2.burn : 0, h2gen: report.energy.h2 ? report.energy.h2.gen : 0, gas: g.ccgt + g.gt,
  });

  // 주요 이벤트 기록 (처음 겪는 일들)
  const flags = state.msFlags || (state.msFlags = {});
  const once = (k, text) => { if (!flags[k]) { flags[k] = true; milestone(text); } };
  if (report.blackoutHours > 0) once('blackout', '⚡ 첫 정전 발생 (' + report.blackoutHours + '시간대)');
  const lv = rdLevel(state);
  for (const th of [20, 100, 200]) if (lv >= th) once('rd' + th, '🔬 R&D 수준 ' + th + ' 달성');
  if (tgtNow !== null) once('intensityStart', '📏 탄소 배출 기준 도입 (' + tgtNow.toFixed(2) + ' t/MWh)');
  if (tgtNow !== null && reportIntensity(report) > tgtNow) once('intensityOver', '📏 배출 기준 첫 초과');
  if (state.happiness < 40) once('happy40', '😟 국민 행복도 40 아래로 하락');
  if (state.money < 0) once('debt', '💸 자금이 바닥나 부채 발생');
  if (report.money.exportRev > 0) once('export', '🔌 첫 전력 수출');
  if (report.energy.h2 && report.energy.h2.prod > 0) once('h2', '💧 첫 수소 생산');
  if (report.energy.h2 && report.energy.h2.burn > 0) once('h2burn', '🔥 수소 터빈 첫 가동');
  if (state.event && ['typhoon', 'gasSpike', 'outage', 'protest'].includes(state.event.id)) milestone('📰 ' + state.event.name);

  // 사건 효과 진행(위기 중 정전 기록, 매달 이자 등)과 목표 판정. 보상·실패는 여기서 바로 적용되고 결산에 표시됨
  tickEffects(state, report);
  report.questNotices = updateQuests(state, report);
  for (const n of report.questNotices) milestone(n);
  if (state.newQuest) { report.questNotices.unshift('🎯 새 목표가 주어졌습니다: ' + state.newQuest + ' (오른쪽 "목표" 패널)'); state.newQuest = null; }

  // 탄소중립 도전: 첫 12개월의 평균 배출 원단위(t/MWh)가 기준. 수요가 커져도 공정하도록 절대량이 아니라 원단위로 판정. 기준보다 netZeroCut만큼 줄이고 정전이 없는 달이 연속으로 쌓여야 함
  if (!state.co2History) state.co2History = [];
  state.co2History.push(reportIntensity(report));
  if (state.co2History.length === 12) state.co2Baseline = state.co2History.reduce((a, b) => a + b, 0) / 12;
  const clean = state.co2Baseline !== undefined && reportIntensity(report) <= state.co2Baseline * (1 - ECON.netZeroCut) && report.blackoutHours === 0;
  state.cleanStreak = clean ? state.cleanStreak + 1 : 0;

  renderReport(report);
  document.getElementById('report').classList.remove('hidden');
  saveGame();
}

function advanceMonth() {
  document.getElementById('report').classList.add('hidden');
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
        state.money += plantStats(state, b.type).capex * ECON.demolishRefund;
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

  // 연구 진행(3개월 뒤 결과), 연구원 이탈, 이번 달 영입·강화 제한 초기화
  for (const n of progressResearch(state)) notices.push(n);
  for (const n of attrition(state)) notices.push(n);
  state.hiredThisMonth = false;
  for (const n of expireEffects(state)) { notices.push(n); milestone(n); }
  state.upgradedThisMonth = false;

  // 인구 증가와 과밀 도시에서의 이주
  // 인구 증가 = 기본 증가(정책 반영) + 유도 수요(설비가 남아돌면 유입, 모자라면 유출)
  const induced = inducedGrowth(state);
  // 기본(연차 곡선 × 정책 × 행복도) + 유도, 상한(연차에 따라 내려감)과 국토 포화 반영 — sim.js monthlyGrowth
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

  startMonth(true);
  state.notices = notices;
  if (notices.length) showMessage(notices.join(' · '), 3500);
  checkEnd();
  saveGame();
  renderAll();
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
  for (let t = 0; t < 150; t++) {
    const tiles = growCity(state.grid, state.cities, ECON.cityTiles, 3);
    if (tiles && tiles.length === ECON.cityTiles && !tiles.some((x) => buildingAt(x.col, x.row)) && (t >= 120 || !siteNearNuisance(tiles))) {
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
  if (state.happiness < ECON.happinessGameOver) {
    finish('탄핵', '국민 행복도가 ' + fmt(state.happiness) + '까지 떨어져 국회에서 탄핵안이 가결되었습니다.<br>' +
      state.year + '년 ' + state.month + '월까지 집권했습니다.', 'impeached');
    return;
  }
  // 부도 한도: 기본 3,000억, 경제가 커지면 최근 1년 수입의 절반까지 (규모에 맞게 빚을 질 수 있음)
  const debtLimit = bankruptLimit(state);
  if (state.money <= -debtLimit) {
    finish('국가 부도', '전력 부문 부채가 ' + fmt(debtLimit) + '억 원을 넘어 국가 부도가 선언되었습니다.<br>' + state.year + '년 ' + state.month + '월까지 집권했습니다.', 'bankrupt');
    return;
  }
  if (state.mode === 'netzero') {
    if (state.cleanStreak >= ECON.netZeroStreak) {
      finish('탄소중립 달성! 🎉', state.year + '년 ' + state.month + '월, 첫해 대비 발전량당 탄소 배출(원단위)을 80% 이상 줄인 상태를 12개월 연속 유지했습니다.<br>보유 자금 ' + fmt(Math.round(state.money)) + '억 원.', 'netzero');
      return;
    }
    if (yearsElapsed(state) >= ECON.netZeroYears) finish('기한 만료', ECON.netZeroYears + '년 안에 탄소중립을 달성하지 못했습니다.', 'timeout');
  }
  if (state.mode === 'normal' && yearsElapsed(state) >= ECON.normalYears) {
    finish(ECON.normalYears + '년 임기 완주! 🎉', ECON.normalYears + '년 동안 나라의 전력망을 지켜냈습니다.<br>보유 자금 ' + fmt(Math.round(state.money)) + '억 원.', 'complete');
  }
}

// 주요 이벤트 기록 (엔딩 화면에 표시)
function milestone(text) {
  if (!state.milestones) state.milestones = [];
  state.milestones.push({ year: state.year, month: state.month, text });
}

// ------------------------------------------------------------
// 종합 점수 (국정 운영 점수, 1,000점 만점)
//  다섯 축을 각각 0~100으로 매겨 합산 × 2. 임기를 못 채우면 채운 비율만큼 깎임
//  - 국민 행복: 집권 기간 평균 행복도
//  - 전력 시스템: 무정전(60%) + 기술(테크 단계 수, 40%)
//  - 탄소: 마지막 해 배출 원단위(50%) + 집권 기간 평균 원단위(50%)
//  - 경제 규모: 인구가 몇 배로 늘었나 (4배면 100)
//  - 자본: 자금 + 설비 가치의 절반 (20만억이면 100, 제곱근 척도)
// ------------------------------------------------------------
function computeScore(state, reason) {
  const h = state.history;
  const n = Math.max(1, h.length);
  const avgHappy = h.reduce((s, x) => s + (x.happy !== undefined ? x.happy : state.happiness), 0) / n;
  const blackoutMonths = h.filter((x) => x.blackoutHours > 0).length;
  const reliability = 100 * (1 - blackoutMonths / n);
  const tiers = TECH_ORDER.reduce((s, k) => s + (state.tech[k] || 0), 0);
  const tiersMax = TECH_ORDER.reduce((s, k) => s + TECH[k].tiers.length, 0);
  const tech = 100 * tiers / tiersMax;
  const system = 0.6 * reliability + 0.4 * tech;
  // 탄소: 마지막 1년 배출 원단위(현재 수준)와 집권 기간 평균 원단위(얼마나 일찍 전환했나)를 반반. 0.40 t/MWh면 0, 0.10 이하면 100
  const intenScore = (v) => clamp(100 * (0.40 - v) / 0.30, 0, 100);
  // 탄소: 최근 3년 원단위(지금 얼마나 깨끗한가) 70% + 기간 평균(얼마나 일찍 전환했나) 30%
  const last36 = h.slice(-36);
  const intenLast = last36.length ? last36.reduce((s, x) => s + (x.inten || 0), 0) / last36.length : 0.4;
  const intenAvg = h.reduce((s, x) => s + (x.inten !== undefined ? x.inten : 0.4), 0) / n;
  const carbon = ECON.carbonRecentWeight * intenScore(intenLast) + (1 - ECON.carbonRecentWeight) * intenScore(intenAvg);
  const cleanIdx = h.findIndex((x) => x.inten !== undefined && x.inten < 0.20);   // 무탄소 전환 시점 (코칭용)
  const pop0 = h.length && h[0].pop ? h[0].pop : state.cities.reduce((s, c) => s + c.pop, 0);
  const popNow = state.cities.reduce((s, c) => s + c.pop, 0);
  // 경제 = 성장(인구 배수, 로그 눈금: 2.5배 0 → 10배 50) + 교역(순수출 수입 ÷ 발전 수입: 8%면 50)
  const popRatio = popNow / Math.max(1, pop0);
  const growth = 50 * clamp(Math.log(Math.max(0.01, popRatio) / ECON.growthScoreMin) / Math.log(ECON.growthScoreMax / ECON.growthScoreMin), 0, 1);
  const tr = state.trade || { exportRev: 0, h2Rev: 0, importCost: 0, energyRev: 0 };
  // 교역 = 임기 동안 수출한 전력량 ÷ 국내 소비 전력량 (돈이 아니라 양으로 셈: 수출 단가는 국내보다 싸서 돈으로는 늘 작게 보임. 수소 수출은 제외)
  const tradeNet = Math.round(tr.exportRev);
  const tradeShare = (tr.demandMWh || 0) > 0 ? (tr.expMWh || 0) / tr.demandMWh : 0;
  const trade = 50 * clamp(tradeShare / ECON.tradeShareFull, 0, 1);
  const economy = growth + trade;
  const invested = state.buildings.filter((b) => b.status !== 'demolishing').reduce((s, b) => s + plantStats(state, b.type).capex, 0);
  // 새 도시 조성비도 나라에 대한 투자로 쳐서 자본 점수가 도시를 세울 때마다 깎이지 않게 함
  const cityInvest = state.cityInvestTotal !== undefined ? state.cityInvestTotal : Math.max(0, state.cities.length - 3) * ECON.foundCityCost;
  const worth = Math.max(0, state.money + invested * 0.5 + cityInvest * 0.5);
  const capital = clamp(100 * Math.sqrt(worth / 200000), 0, 100);
  const termYears = state.mode === 'normal' ? ECON.normalYears : state.mode === 'netzero' ? ECON.netZeroYears : null;
  const completed = reason === 'complete' || reason === 'netzero';
  const termFactor = completed || !termYears ? 1 : clamp(yearsElapsed(state) / termYears, 0, 1);
  const raw = (avgHappy + system + carbon + economy + capital) * 2;
  return {
    total: Math.round(raw * termFactor), raw: Math.round(raw), termFactor,
    parts: { happy: Math.round(avgHappy), system: Math.round(system), carbon: Math.round(carbon), economy: Math.round(economy), capital: Math.round(capital) },
    detail: { reliability: Math.round(reliability), tech: Math.round(tech), tiers, tiersMax, intenLast, intenAvg, popRatio, worth: Math.round(worth),
      growth: Math.round(growth), trade: Math.round(trade), tradeShare, tradeNet: Math.round(tradeNet), cleanYear: cleanIdx >= 0 ? Math.floor(cleanIdx / 12) + 1 : null, blackoutMonths },
  };
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
    endYear: state.year, endMonth: state.month, date: new Date().toISOString().slice(0, 10),
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
const RANK_KEY = 'ilpp-rankings';
function loadRankings() {
  try { return JSON.parse(localStorage.getItem(RANK_KEY) || '[]'); } catch (e) { return []; }
}
function saveRankings(list) { localStorage.setItem(RANK_KEY, JSON.stringify(list)); }
// 랭킹 종류: 지금은 종합 점수 하나 (나중에 다른 기준을 추가할 수 있게 배열로 둠)
const RANK_TABS = [
  { key: 'score', label: '🏆 종합 점수', desc: '국정 운영 점수(행복·전력 시스템·탄소·경제 규모·자본, 1,000점 만점)가 높은 순' },
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

function canBuild(type, col, row) {
  const p = PLANTS[type];
  const m = techMods(state);
  const cells = footprintCells(type, col, row);
  if (!plantUnlocked(state, type)) return { ok: false, reason: '테크트리에서 먼저 개발해야 합니다' };
  if (p.kind === 'nuclear' && policyMods(state).nuclearBan) return { ok: false, reason: '탈원전 정책 중에는 원전을 지을 수 없습니다 (정책 재검토 때 바꿀 수 있음)' };

  const terrain = p.terrain.slice();
  if (p.kind === 'wind' && m.windOnSea) terrain.push(SEA);

  for (const c of cells) {
    if (!isInside(c.col, c.row)) return { ok: false, reason: '지도 밖입니다' };
    if (!terrain.includes(state.grid[c.row][c.col])) return { ok: false, reason: state.grid[c.row][c.col] === MOUNTAIN ? '산에는 태양광·풍력만 지을 수 있습니다' : terrain.includes(SEA) ? '땅이나 바다 위에만 지을 수 있습니다' : '땅 위에만 지을 수 있습니다' };
    if (buildingAt(c.col, c.row)) return { ok: false, reason: '이미 다른 설비가 있습니다' };
  }
  if (p.needsSea && !footprintAdjacentTo(state.grid, cells, SEA)) return { ok: false, reason: '원전은 냉각수가 필요해 바다와 맞닿아야 합니다' };
  if (p.edgeOnly && !footprintOnEdge(cells)) return { ok: false, reason: '연계선은 지도 가장자리에만 지을 수 있습니다' };

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
  };
  state.buildings.push(b);
  return b;
}

function tryBuild(type, col, row) {
  const info = canBuild(type, col, row);
  const p = PLANTS[type];
  if (!info.ok) { showMessage('✕ ' + info.reason); render(); return; }
  if (state.money < info.cost) { showMessage('✕ 자금이 부족합니다 (' + fmt(info.cost) + '억 필요)'); render(); return; }

  state.money -= info.cost;
  const b = addBuilding(type, col, row, false);
  state.selectedId = b.id;

  let msg = p.name + ' 건설 시작 · ' + info.months + '개월 · ' + fmt(info.cost) + '억';
  if (info.opposed) msg += ' (주민 반발: 비용·기간 증가)';
  if (info.coastal) msg += ' (해안 보너스)';
  if (info.mountain && type === 'solar') { state.happiness = clamp(state.happiness - ECON.solarMountainBuildHit, 0, 100); }   // 벌목 반발: 지을 때 한 번
  if (info.mountain) msg += type === 'wind' ? ' (산지 보너스)' : ' (산지 · 벌목 반발로 행복도 −' + ECON.solarMountainBuildHit + ', 이후 매달 −' + ECON.solarMountainNuisance + ')';
  else if (type === 'wind' && !info.coastal) msg += ' (평지 · 출력 −' + Math.round(ECON.windPlainPenalty * 100) + '%)';
  const n = nuisanceOf(state, b);
  if (n > 0) msg += ' ⚠ ' + (overlapsCity(type, col, row) ? '도시 안이라' : '도시 근처라') + ' 매달 행복도 −' + n;
  showMessage(msg, 3000);
  saveGame();
  renderAll();
}

function upgradeSelected() {
  const b = state.buildings.find((x) => x.id === state.selectedId);
  if (!b || b.status !== 'online') return;
  const p = PLANTS[b.type];
  if (!p.upgradeTo) return;
  if (state.money < p.upgradeCost) { showMessage('✕ 자금이 부족합니다'); return; }
  state.money -= p.upgradeCost;
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
  showMessage(PLANTS[b.type].name + ' 철거 시작 · ' + ECON.demolishMonths + '개월 뒤 자리가 비고 ' + fmt(plantStats(state, b.type).capex * ECON.demolishRefund) + '억 환급');
  saveGame(); renderAll();
}

// ------------------------------------------------------------
// 도시 조성 (칠하기)
// ------------------------------------------------------------
// 새 도시 조성비: 정책 배수 × (4번째 도시부터 하나당 +cityCostStep). 땅이 귀해질수록 비싸짐
function cityFoundCost(state) {
  return Math.round(ECON.foundCityCost * policyMods(state).cityCost * (1 + ECON.cityCostStep * Math.max(0, state.cities.length - 3)));
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
  let newPop = Math.min(totalExcess, 0.7 * limit * effNew);
  if (newPop < 5) {
    newPop = 0;
    for (const c of state.cities) { const mv = c.pop * 0.1; c.pop -= mv; newPop += mv; }
  } else {
    for (const x of donors) { const mv = x.excess / totalExcess * newPop; x.c.pop -= mv; }
  }

  state.money -= cityCost;
  state.cityInvestTotal = (state.cityInvestTotal || 0) + cityCost;   // 점수의 자본 항목에 절반이 자산으로 반영
  // 새 도시는 과밀 도시의 인구를 나눠 받는 데 더해, 새 터전을 보고 밖에서 들어오는 신규 인구도 생김 (총인구 증가)
  const newcomers = ECON.cityNewcomers * limit * effNew;
  newPop += newcomers;
  state.cities.push(makeCity(d.tiles.slice(), newPop, name));
  milestone('🏙 새 도시 ' + name + ' 조성');
  state.cityDraft = null;
  document.getElementById('city-name').value = '';
  showMessage('🏙 ' + name + ' 조성 완료 · 이주 ' + fmt(newPop - newcomers) + '만 명 + 신규 유입 ' + fmt(newcomers) + '만 명', 3500);
  saveGame();
  renderAll();
}

// ------------------------------------------------------------
// 화면 이동 (view)
// ------------------------------------------------------------
// 확대 배율(zoom): 1이면 32×24칸, 0.5면 지도 전체(64×48), 2면 16×12칸이 보임
const ZOOM_MAX = 2.5;
// 최소 축소 배율: 지도가 캔버스를 항상 꽉 채우는 배율 (더 줄이면 빈 공간이 보이므로 여기서 멈춤)
function zoomMin() { return Math.min(ZOOM_MAX, Math.max(canvas.width / (COLS * TILE), canvas.height / (ROWS * TILE))); }
function zoomOf() { return (state && state.zoom) || 1; }
function visCols() { return canvas.width / TILE / zoomOf(); }
function visRows() { return canvas.height / TILE / zoomOf(); }

function setView(col, row) {
  state.view.col = clamp(col, 0, Math.max(0, COLS - visCols()));
  state.view.row = clamp(row, 0, Math.max(0, ROWS - visRows()));
}
function centerView(col, row) { setView(col - visCols() / 2, row - visRows() / 2); }

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
  if (fitMapCanvas() && state.view) { state.zoom = clamp(zoomOf(), zoomMin(), ZOOM_MAX); setView(state.view.col, state.view.row); }   // 지도 칸 크기가 바뀌었으면 캔버스부터 맞추고, 최소 배율도 다시 적용
  if (state.zoom && state.zoom < zoomMin()) { state.zoom = zoomMin(); setView(state.view.col, state.view.row); }
  const view = state.view;
  const z = zoomOf();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(z, z);
  ctx.translate(-view.col * TILE, -view.row * TILE);

  drawTerrain(ctx, state.grid, { col: view.col, row: view.row, cols: visCols(), rows: visRows() });
  drawCities(ctx, state.cities);
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
    ctx.strokeStyle = info.ok ? '#fff' : '#f44336';
    ctx.lineWidth = 3;
    ctx.strokeRect(drag.col * TILE + 1, drag.row * TILE + 1, p.width * TILE - 2, p.height * TILE - 2);

    let label, color = '#fff';
    if (info.ok) {
      label = fmt(info.cost) + '억 · ' + info.months + '개월';
      if (info.opposed) { label += ' · 주민 반발'; color = '#ffb300'; }
      if (info.coastal) label += ' · 해안 보너스';
      if (info.mountain) label += type === 'wind' ? ' · 산지 보너스' : ' · 산지(행복도 −)';
      else if (type === 'wind' && !info.coastal) label += ' · 평지 −' + Math.round(ECON.windPlainPenalty * 100) + '%';
      const n = nuisanceOf(state, { type: drag.type, col: drag.col, row: drag.row });
      if (n > 0) { label += ' · 행복도 −' + n + '/월'; color = '#ffb300'; }
      if (state.money < info.cost) { label += ' · 자금 부족'; color = '#f44336'; }
    } else { label = info.reason; color = '#f44336'; }
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(label).width + 12;
    const minX = view.col * TILE + tw / 2 + 2, maxX = (view.col + visCols()) * TILE - tw / 2 - 2;
    const tx = clamp((drag.col + p.width / 2) * TILE, minX, maxX);
    const ty = drag.row * TILE - 4;
    const yy = ty < view.row * TILE + 18 ? (drag.row + p.height) * TILE + 20 : ty;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(tx - tw / 2, yy - 16, tw, 16);
    ctx.fillStyle = color; ctx.fillText(label, tx, yy - 2);
  }
  ctx.restore();

  drawMinimap(minimapEl, state);
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
  currentTab = name;
  document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + name));
  tooltipEl.style.display = 'none';
  if (typeof tutorialTick === 'function') tutorialTick();
}
document.querySelectorAll('#tabs .tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

document.querySelectorAll('.subtab').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach((x) => x.classList.toggle('active', x === b));
    // 발전 설비 / 저장·수소·연계 는 같은 카드 목록을 종류만 바꿔 보여줌
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
  if (pressPos && !panStart && !drag && !draftPaint) {
    const moved = Math.abs(e.clientX - pressPos.x) + Math.abs(e.clientY - pressPos.y);
    if (moved > 6) {
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
        fmt(city.pop * perCapitaNow(state) * SEASON_PEAK[seasonOf(state.month)]) + 'MW</span>';
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
  const done = () => showMessage('진행 요약을 복사했습니다. 붙여 넣어 질문하세요', 3000);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('아래 내용을 복사하세요', text));
  else prompt('아래 내용을 복사하세요', text);
});
document.getElementById('city-cancel').addEventListener('click', cancelCityDraft);
document.getElementById('city-confirm').addEventListener('click', confirmCityDraft);

// 테크트리 / R&D 버튼
document.getElementById('tech-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tech]');
  if (!btn || state.finished) return;
  const r = attemptTech(state, btn.dataset.tech);
  showMessage(r.msg, 3000);
  flashTab(r.msg);
  saveGame(); renderAll();
});
document.getElementById('rd-table').addEventListener('click', (e) => {
  const buy = e.target.closest('button[data-rd-buy]');
  const up  = e.target.closest('button[data-rd-up]');
  if (state.finished) return;
  let r = null;
  if (buy) r = buyResearcher(state, Number(buy.dataset.rdBuy));
  if (up)  r = upgradeResearcher(state, Number(up.dataset.rdUp));
  if (!r) return;
  showMessage(r.msg, 3000);
  flashTab(r.msg);
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
// 단축키
// ------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (!state) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const startOpen = !document.getElementById('start').classList.contains('hidden');
  const overOpen  = !document.getElementById('gameover').classList.contains('hidden');
  const decisionOpen = !document.getElementById('decision').classList.contains('hidden');
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
  else if (key === '2') showTab('tech');
  else if (key === '3') showTab('rd');
  else if (key === 'Escape') {
    if (drag) { drag = null; document.querySelectorAll('.plant-card').forEach((c) => c.classList.remove('dragging')); document.body.style.cursor = ''; }
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
  if (loadGame()) { document.getElementById('start').classList.add('hidden'); showTab('map'); renderAll(); }
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
// 랭킹 종류 탭 (자본 / 행복도 / 재임 기간)
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
  const btn = e.target.closest('[data-choice]');
  if (btn) chooseDecision(+btn.dataset.choice);
});
document.getElementById('decision-close').addEventListener('click', () => {
  document.getElementById('decision').classList.add('hidden');
  if (state && state.pendingDecision) renderDecision(state);   // 아직 답하지 않았으면 다시 띄움
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
    // 지도 크기가 달라진 예전 저장본은 불러올 수 없음
    if (!state.grid || state.grid.length > ROWS || state.grid[0].length > COLS) { localStorage.removeItem(SAVE_KEY); state = null; return false; }
    // 지도가 커진 뒤의 예전 저장본: 모자란 칸을 땅으로 채워 그대로 이어함
    for (const row of state.grid) while (row.length < COLS) row.push(LAND);
    while (state.grid.length < ROWS) state.grid.push(new Array(COLS).fill(LAND));
    for (const c of state.cities) restoreCity(c);
    if (!state.tech) state.tech = emptyTech();
    if (!state.rd) state.rd = emptyRd();
    if (!state.startYear) { state.startYear = 2030; state.startMonth = 3; }   // 예전 저장본은 2030년 3월 시작이었음
    if (!state.quests) state.quests = [];
    // 수전해·수소 저장 → 암모니아 크래킹으로 바뀐 뒤의 예전 저장본 이관
    for (const b of state.buildings) if (b.type === 'electrolyzer') b.type = 'cracker';
    if (state.tech.h2elec !== undefined) { state.tech.h2crack = Math.max(state.tech.h2crack || 0, Math.min(2, state.tech.h2elec)); delete state.tech.h2elec; }
    delete state.tech.h2store; delete state.h2Stock;
    if (state.techBusy) { delete state.techBusy.h2elec; delete state.techBusy.h2store; }
    if (state.techPity) { delete state.techPity.h2elec; delete state.techPity.h2store; }
    if (!state.effects) state.effects = [];
    if (!state.crisisPlan) state.crisisPlan = makeCrisisPlan(state, state.mode === 'normal' ? ECON.normalYears : 20);
    if (!state.neighborPeak) state.neighborPeak = neighborBasePeak(state);
    if (state.h2Ratio === undefined) state.h2Ratio = 0.5;
    if (!state.view) state.view = { col: 0, row: 0 };
    if (!state.zoom) state.zoom = 1;
    for (const b of state.buildings) if (b.age === undefined) b.age = 0;
    return true;
  } catch (err) { return false; }
}

// ------------------------------------------------------------
// 시작
// ------------------------------------------------------------
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

  // 시작 화면 뒤 배경 지도
  const previewGrid = generateMap();
  ctx.save();
  ctx.translate(-16 * TILE, -12 * TILE);
  drawTerrain(ctx, previewGrid, { col: 16, row: 12 });
  ctx.restore();
})();

// 부도 한도 (억): 기본 ECON.bankruptAt, 최근 12개월 수입 합의 절반이 더 크면 그만큼
function bankruptLimit(state) {
  const h = (state.history || []).slice(-12);
  const income = h.reduce((s, x) => s + Math.max(0, (x.profit || 0) + (x.fuel || 0) + (x.carbon || 0) + (x.salary || 0)), 0);
  return Math.max(-ECON.bankruptAt, Math.round(income * 0.5));
}

// 창 크기가 바뀌면 지도 캔버스도 다시 맞추고 그림
(function () {
  let t = null;
  const refit = () => { clearTimeout(t); t = setTimeout(() => { if (fitMapCanvas() && state) { if (state.view) setView(state.view.col, state.view.row); render(); } }, 100); };
  window.addEventListener('resize', refit);
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(refit); const bd = document.getElementById('board'); if (bd) ro.observe(bd); }
  setInterval(refit, 1000);   // 안전망: 이벤트를 놓쳐도 1초 안에 맞춤
})();
