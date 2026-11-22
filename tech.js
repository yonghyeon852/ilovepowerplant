// ============================================================
// 테크트리 + 연구소
//  - 테크: 여섯 트리. 노선마다 20·20·15단계가 되도록 나눔
//      화력 노선  = 복합발전 10 + 석탄화력 10
//      재생 노선  = 태양광 10 + 풍력 10
//      원자력 노선 = 원자력 15 (트리 하나에 몰려 있음)
//      계통 · 배터리 10 = 어느 노선이든 함께 씀
//    돈을 내고 연구를 시작하면 3개월 뒤 확률로 성공
//  - 연구소 규모: 숫자 하나. 돈을 들여 키움. 하는 일은 세 가지뿐 — 높은 단계를 열고, 성공 확률을 올리고, 동시에 하는 연구 수를 늘림
//    (유지비·특허 수입·건설비 할인 같은 부수 효과는 없앰)
// ============================================================

// 단계별 공통 값 (10단계 트리): 연구비(억, 트리별 배수를 곱함) · 기본 성공 확률 · 필요한 연구소 규모 (1단계 20, 그 뒤로 단계마다 +40)
const TIER_COST = [200, 350, 600, 1000, 1600, 2500, 3800, 5500, 8000, 11000];
const TIER_BASE = [0.45, 0.42, 0.38, 0.35, 0.32, 0.28, 0.25, 0.22, 0.20, 0.18];
const TECH_TIER_RD = [20, 60, 100, 140, 180, 220, 260, 300, 340, 380];
// 원자력(15단계): 같은 폭을 더 잘게 나눔. 끝까지 가는 총 연구비는 다른 노선의 두 트리를 합친 것과 비슷 (필요한 연구소 규모는 단계마다 +25)
const NUC_TIER = {
  cost: [250, 380, 550, 800, 1100, 1500, 2000, 2600, 3400, 4300, 5400, 6700, 8200, 10000, 12000],
  base: [0.45, 0.43, 0.41, 0.39, 0.37, 0.35, 0.33, 0.31, 0.29, 0.27, 0.25, 0.23, 0.21, 0.20, 0.18],
  rd:   [20, 45, 70, 95, 120, 145, 170, 195, 220, 245, 270, 295, 320, 345, 370],
};
function makeTiers(costMult, list, tbl) {
  tbl = tbl || { cost: TIER_COST, base: TIER_BASE, rd: TECH_TIER_RD };
  return list.map((t, i) => ({ name: t[0], effect: t[1], desc: '', cost: Math.round(tbl.cost[i] * costMult / 10) * 10, base: tbl.base[i], rd: tbl.rd[i] }));
}

const TECH = {
  // 복합발전: 효율(연료비·탄소) → 출력 → 탄소 포집이 번갈아 나옴
  ccgt: {
    name: '복합발전', color: '#f4511e',
    tiers: makeTiers(1.0, [
      ['TIT 1,400℃급 터빈', '복합발전 연료비·탄소 −5%'],
      ['3압 (3P) HRSG', '복합발전 출력 +6%'],
      ['TIT 1,500℃급 터빈', '복합발전 연료비·탄소 −6%'],
      ['3P 재열 (Reheat)', '복합발전 출력 +6%'],
      ['탄소 포집 1세대', '복합발전 탄소 −10%'],
      ['TIT 1,600℃급 터빈', '복합발전 연료비·탄소 −6%'],
      ['탄소 포집 2세대', '복합발전 탄소 −10% 추가'],
      ['초임계 CO₂ 하부 사이클', '복합발전 출력 +10%'],
      ['TIT 1,700℃급 (세라믹 복합재)', '복합발전 연료비·탄소 −8%'],
      ['순산소 연소 포집', '복합발전 탄소 −15% 추가'],
    ]),
  },
  // 석탄화력: 석탄의 약점(탄소 · 느린 출력 조절 · 매연)을 하나씩 고쳐 감
  coal: {
    name: '석탄화력', color: '#78909c',
    tiers: makeTiers(0.9, [
      ['초임계 보일러', '석탄 연료비·탄소 −5%'],
      ['유연 운전 개조', '석탄 최소 출력 55% → 40% · 출력 조절 2배 빠름 (한 시간에 10%)'],
      ['초초임계 (USC)', '석탄 연료비·탄소 −6%'],
      ['대용량 터빈', '석탄 출력 +8%'],
      ['바이오매스 혼소', '석탄 탄소 −15%'],
      ['탈황 · 집진 설비', '도시 근처 석탄 매연 불만 없음'],
      ['암모니아 혼소', '석탄 탄소 −15% 추가'],
      ['700℃급 A-USC', '석탄 연료비·탄소 −8%'],
      ['석탄 가스화 복합 (IGCC)', '석탄 출력 +10%'],
      ['탄소 포집 · 저장 (CCS)', '석탄 탄소 −20% 추가'],
    ]),
  },
  nuclear: {
    name: '원자력', color: '#f06292',
    tiers: makeTiers(1.0, [
      ['안전성 강화 설계', '대형 원전 건설 해금'],
      ['SMR 개발', 'SMR 건설 해금'],
      ['표준 설계 인증', '원전 건설비 −10%'],
      ['모듈 시공', '원전 공사 −4개월 · SMR −2개월'],
      ['SMR 양산', 'SMR 건설비 −20%'],
      ['온라인 검사', '원전 정기검사 정지 없음'],
      ['고연소도 연료', '원전·SMR 출력 +8%'],
      ['피동 안전 계통', '원전 밀집 불안 −30%'],
      ['대형 모듈 공장', '원전·SMR 건설비 −12%'],
      ['사고저항성 연료', '도시 근처 원전·SMR 불만 절반'],
      ['출력 증강', '원전·SMR 출력 +6% 추가'],
      ['4세대 원자로', '원전·SMR 건설비 −15% 추가 · 공사 더 단축'],
      ['사용후핵연료 재활용', '원전·SMR 운전비 −40%'],
      ['고온가스로', '원전·SMR 출력 +10% 추가'],
      ['용융염 원자로', '원전·SMR 출력 +12% 추가'],
    ], NUC_TIER),
  },
  solar: {
    name: '태양광', color: '#ffb300',
    tiers: makeTiers(0.8, [
      ['PERC 고효율 셀', '태양광 출력 +12%'],
      ['양면 모듈', '태양광 출력 +12%'],
      ['대량 생산 공정', '태양광 건설비 −15%'],
      ['TOPCon 셀', '태양광 출력 +14%'],
      ['태양 추적 트래커', '태양광 출력 +14%'],
      ['시공 자동화', '태양광 건설비 −18%'],
      ['헤테로접합 (HJT) 셀', '태양광 출력 +14%'],
      ['페로브스카이트 탠덤', '태양광 출력 +16%'],
      ['롤투롤 인쇄 공정', '태양광 건설비 −18%'],
      ['3중 접합 탠덤', '태양광 출력 +20%'],
    ]),
  },
  wind: {
    name: '풍력', color: '#81d4fa',
    tiers: makeTiers(0.9, [
      ['대형 터빈 (8MW급)', '풍력 출력 +12%'],
      ['해안 기초 기술', '해안 보너스 +40% → +70%'],
      ['경량 블레이드', '풍력 출력 +12%'],
      ['해상풍력 단지 기술', '해안 보너스 +70% → +100%'],
      ['부유식 해상풍력', '바다 위에 풍력 건설 가능'],
      ['15MW급 터빈', '풍력 출력 +14%'],
      ['터빈 양산', '풍력 건설비 −15%'],
      ['20MW급 터빈', '풍력 출력 +14%'],
      ['해상 시공 선단', '풍력 건설비 −12% 추가'],
      ['25MW 초대형 터빈', '풍력 출력 +20%'],
    ]),
  },
  // 계통 · 배터리: 관성 없는 전기(태양광·풍력·배터리)를 얼마나 받아낼 수 있는지(주파수 안정도 한도), 송전 손실, 배터리 성능
  grid: {
    name: '계통 · 배터리', color: '#ab47bc',
    tiers: makeTiers(1.0, [
      ['동기조상기', '관성 없는 전기 한도 70% → 80%'],
      ['대용량 배터리 셀', '배터리 저장 4 → 6시간'],
      ['송전 승압', '송전 손실 칸당 1.5% → 1%'],
      ['그리드포밍 인버터', '관성 없는 전기 한도 88% · 주파수 사고 없음'],
      ['고효율 전력 변환', '배터리 출력 +25% · 효율 92%'],
      ['HVDC 송전', '송전 손실 칸당 0.5%'],
      ['광역 계통 제어', '관성 없는 전기 한도 95%'],
      ['전고체 배터리', '배터리 건설비 −30% · 저장 8시간'],
      ['초전도 송전', '송전 손실 없음'],
      ['AI 계통 운영', '관성 없는 전기 한도 100%'],
    ]),
  },
};
// 예전 저장본·실험 도구가 쓰던 이름 (지금은 없는 트리)
const TECH_REMOVED = ['gas', 'thermal', 'ess', 'h2crack', 'h2turbine'];
const TECH_ORDER = ['ccgt', 'coal', 'nuclear', 'solar', 'wind', 'grid'];
const TECH_MAX_TIER = 10;   // 민심의 "연구" 요인이 쓰는 눈금 (15단계인 원자력은 10단계 눈금으로 환산)
function techTiers(tree) { return TECH[tree] ? TECH[tree].tiers.length : TECH_MAX_TIER; }
// 10단계 눈금으로 환산한 단계 (원자력 15단계 = 10)
function techNorm(state, tree) { return (state.tech[tree] || 0) * TECH_MAX_TIER / techTiers(tree); }

const TECH_PITY = 0.10;          // 실패할 때마다 그 트리의 다음 시도 확률에 더해지는 값
const TECH_RESEARCH_MONTHS = 3;  // 연구 하나에 걸리는 기간
const RD_PER_SLOT = 100;         // 연구소 규모 이만큼마다 동시 연구 1개 추가

// ---------- 연구소 ----------
const RD_COST_PER = 50;          // 확장 비용: 규모 1당 50억 (국가 주도 R&D 정책이면 −30%)
const RD_STEPS = [10, 25, 50];   // 한 달에 한 번, 이 중 한 가지 크기로 확장
const RD_LEGACY_ABILITY = { ug: 1, ms: 3, phd: 10, jr: 25, sr: 60, master: 150 };   // 예전 저장본의 연구원을 규모로 환산할 때만 씀
function emptyRd() { return {}; }   // (예전 저장 형식과의 호환용)
function legacyRdLevel(rd) { let v = 0; for (const k in (rd || {})) v += (rd[k] || 0) * (RD_LEGACY_ABILITY[k] || 0); return v; }

function emptyTech() {
  const t = {};
  for (const k of TECH_ORDER) t[k] = 0;
  return t;
}

function rdLevel(state) {
  if (state.rdLab === undefined) state.rdLab = legacyRdLevel(state.rd);   // 예전 저장본: 연구원 → 규모
  return Math.round(state.rdLab || 0);
}
function rdSalary() { return 0; }   // 연구소 유지비는 없앰 (부르는 곳이 남아 있어 0을 돌려줌)

// 연구소 확장 (한 달에 한 번)
function labExpandCost(state, step) { return Math.round(step * RD_COST_PER * policyMods(state).researcherCost / 10) * 10; }
function expandLab(state, step) {
  if (!RD_STEPS.includes(step)) return { ok: false, msg: '확장 크기가 올바르지 않습니다' };
  if (state.labExpandedThisMonth) return { ok: false, msg: '연구소 확장은 한 달에 한 번입니다' };
  const cost = labExpandCost(state, step);
  if (state.money < cost) return { ok: false, msg: '자금이 부족합니다 (' + fmt(cost) + '억 필요)' };
  state.money -= cost;
  state.rdLab = rdLevel(state) + step;
  state.labExpandedThisMonth = true;
  rdLogAdd(state, '연구소 확장 +' + step + ' → 규모 ' + rdLevel(state) + ' (' + fmt(cost) + '억)', 'hire');
  return { ok: true, msg: '🔬 연구소 확장: 규모 ' + rdLevel(state) + ' (+' + step + ' · ' + fmt(cost) + '억)' };
}

// 연구소가 클수록 연구 성공 확률이 오름 (규모 20에서 +6%, 100에서 +20%, 260에서 +32%, 380에서 +36%)
function rdBonus(state) {
  const lv = rdLevel(state);
  return 0.5 * lv / (lv + 150);
}
// (예전에는 연구소가 건설비·공사 기간·유지비·특허 수입에도 작용했음. 지금은 아무 효과 없음 — 부르는 곳을 위해 중립값을 돌려줌)
function rdPerks(state) {
  return { f: 0, capexMult: 1, buildMult: 1, omMult: 1, agingStart: ECON.agingStart, patent: 0 };
}
function techPityStep() { return TECH_PITY; }

// 이 단계를 연구하려면 필요한 연구소 규모. 부족하면 필요한 값을, 충분하면 0을 돌려줌
function tierGate(tree, lvl) { const t = TECH[tree] && TECH[tree].tiers[lvl]; return t ? t.rd : 0; }
function techGate(state, tree) {
  const need = tierGate(tree, state.tech[tree] || 0);
  return rdLevel(state) < need ? need : 0;
}
// 다음 단계 연구비 (민간 주도 R&D 정책이면 −25%)
function techCost(state, tree) {
  const tier = TECH[tree].tiers[state.tech[tree] || 0];
  if (!tier) return 0;
  return Math.round(tier.cost * policyMods(state).techCost / 10) * 10;
}

function techSuccessProb(state, tree) {
  const tier = TECH[tree].tiers[state.tech[tree] || 0];
  if (!tier) return 0;
  const pity = (state.techPity && state.techPity[tree]) || 0;
  const evBonus = (state.event && state.event.techBonus) || 0;
  const fxBonus = (typeof effectsNow === 'function') ? (effectsNow(state).techBonus || 0) : 0;   // 지속 효과 (사건)
  return clamp(tier.base + rdBonus(state) + pity + evBonus + fxBonus + (state.techBoost || 0), 0.03, 0.95);
}

// 동시에 진행할 수 있는 연구 수: 연구소 규모 100마다 1개씩 늘어남 (기본 1개)
function researchSlots(state) { return 1 + Math.floor(rdLevel(state) / RD_PER_SLOT); }
function researchActive(state) { return Object.values(state.techBusy || {}).filter(Boolean).length; }

// 연구 시작. 결과는 TECH_RESEARCH_MONTHS 뒤에 나옴 (성공 여부는 시작 시점 확률로 결정)
function attemptTech(state, tree) {
  const lvl = state.tech[tree] || 0;
  const tier = TECH[tree].tiers[lvl];
  if (!tier) return { ok: false, msg: '이미 모든 단계를 개발했습니다' };
  if (!state.techBusy) state.techBusy = {};
  if (state.techBusy[tree]) return { ok: false, msg: '이 테크는 이미 연구 중입니다 (' + state.techBusy[tree].months + '개월 남음)' };
  if (researchActive(state) >= researchSlots(state)) return { ok: false, msg: '동시 연구 한도(' + researchSlots(state) + '개)입니다. 연구소 규모 ' + RD_PER_SLOT + '마다 1개씩 늘어납니다' };
  const need = techGate(state, tree);
  if (need) return { ok: false, msg: (lvl + 1) + '단계 연구는 연구소 규모 ' + need + ' 이상이어야 합니다' };
  const cost = techCost(state, tree);
  if (state.money < cost) return { ok: false, msg: '자금이 부족합니다 (' + fmt(cost) + '억 필요)' };

  const p = techSuccessProb(state, tree);
  state.techBoost = 0;
  state.money -= cost;
  state.techBusy[tree] = { months: TECH_RESEARCH_MONTHS, success: Math.random() < p, prob: p, cost, name: tier.name, lvl };
  return { ok: true, msg: '🔬 연구 시작: ' + tier.name + ' (' + TECH_RESEARCH_MONTHS + '개월 · 성공 확률 ' + fmt(p * 100) + '%)' };
}

// 달이 지날 때 연구 진행. 끝난 연구의 결과를 적용하고 알림 문구 목록을 돌려줌
//  results(배열)를 넘기면 끝난 연구마다 { ok, tree, name, lvl }을 담아 줌 (지도 아래 알림과 효과음용)
function progressResearch(state, results) {
  const notices = [];
  if (!state.techBusy) return notices;
  if (!state.techPity) state.techPity = {};
  for (const tree of Object.keys(state.techBusy)) {
    const job = state.techBusy[tree];
    if (!job) continue;
    if (!TECH[tree]) { delete state.techBusy[tree]; continue; }   // 없어진 트리의 연구는 버림
    job.months -= 1;
    if (job.months > 0) continue;
    if (job.success) {
      state.tech[tree] = job.lvl + 1;
      state.techPity[tree] = 0;
      notices.push('✓ 연구 성공: ' + job.name);
      if (results) results.push({ ok: true, tree, name: job.name, lvl: job.lvl + 1 });
      if (typeof milestone === 'function') milestone('🧪 연구 성공: ' + job.name);
    } else {
      state.techPity[tree] = (state.techPity[tree] || 0) + TECH_PITY;
      notices.push('✕ 연구 실패: ' + job.name + ' (다음 시도 +' + fmt(TECH_PITY * 100) + '%)');
      if (results) results.push({ ok: false, tree, name: job.name, lvl: job.lvl + 1 });
    }
    state.techLog = [{ year: state.year, month: state.month, tree, name: job.name, cost: job.cost, prob: job.prob, success: job.success }]
      .concat(state.techLog || []).slice(0, 12);
    delete state.techBusy[tree];
  }
  return notices;
}

function monthIndex(state) { return state.year * 12 + state.month; }
function attrition(state) { return []; }   // (연구원 퇴사는 없어짐. 달이 바뀔 때 부르는 곳이 있어 빈 함수로 둠)

// ---------- 테크가 게임 수치에 미치는 영향 ----------
function techMods(state) {
  const t = state.tech || emptyTech();
  const cc = t.ccgt || 0, co = t.coal || 0, nu = t.nuclear || 0, so = t.solar || 0, wi = t.wind || 0, gr = t.grid || 0;
  const m = {
    gtFuel: 1, gtCo2: 1, ccgtCap: 1, ccgtFuel: 1,     // 가스(복합발전) 연료비·탄소·출력 배율
    coalFuel: 1, coalCo2: 1, coalCapex: 1, coalCap: 1, coalMinLoad: PLANTS.coal.minLoad, coalRamp: PLANTS.coal.ramp, coalLife: PLANTS.coal.lifeYears, coalNuisance: 1,
    nuclearOppRange: PLANTS.nuclear.oppositionRange, nuclearOppMult: PLANTS.nuclear.oppositionMult, nuclearCapex: 1,
    smrUnlocked: nu >= 2, smrCapex: 1, smrBuildDelta: 0, nuclearBuildDelta: 0, nukeCap: 1, noOutage: nu >= 6,
    nukeAnxMult: nu >= 8 ? 0.7 : 1, nukeNuisance: nu >= 10 ? 0.5 : 1, nukeOpMult: nu >= 13 ? 0.6 : 1,   // 밀집 불안 · 도시 근처 불만 · 운전비(연료비+변동 운영비)
    nukeMinLoad: 1,   // 원전은 출력을 조절(부하추종)할 수 없음: 항상 100%. 남는 전기는 배터리·수출·다른 발전기 조절로 받아내야 함
    solarCap: 1, solarCapex: 1,
    windCap: 1, windCapex: 1, coastalBonus: PLANTS.wind.coastalBonus, windOnSea: wi >= 5,
    gridForming: gr >= 4,
    inertiaLimit: ECON.inertiaLimit, lossPerTile: ECON.lossPerTile,
    essHours: PLANTS.ess.energyHours, essEff: ECON.essEff, essPower: 1, essCapex: 1, essLife: PLANTS.ess.lifeYears,
  };
  // 복합발전 (가스터빈이 남아 있으면 함께 적용)
  const ccEff = (k) => { m.gtFuel *= k; m.gtCo2 *= k; };   // 효율: 연료비와 탄소가 함께 줆
  if (cc >= 1) ccEff(0.95);
  if (cc >= 2) m.ccgtCap *= 1.06;
  if (cc >= 3) ccEff(0.94);
  if (cc >= 4) m.ccgtCap *= 1.06;
  if (cc >= 5) m.gtCo2 *= 0.90;   // 포집은 화력의 탄소를 줄여 줄 뿐 없애지는 못함 (끝까지 올려도 0.37 → 약 0.20 t/MWh: 20년 차 탄소 기준 0.22를 겨우 맞춤)
  if (cc >= 6) ccEff(0.94);
  if (cc >= 7) m.gtCo2 *= 0.90;
  if (cc >= 8) m.ccgtCap *= 1.10;
  if (cc >= 9) ccEff(0.92);
  if (cc >= 10) m.gtCo2 *= 0.85;
  // 석탄화력
  const coEff = (k) => { m.coalFuel *= k; m.coalCo2 *= k; };
  if (co >= 1) coEff(0.95);
  if (co >= 2) { m.coalMinLoad = 0.40; m.coalRamp = PLANTS.coal.ramp * 2; }
  if (co >= 3) coEff(0.94);
  if (co >= 4) m.coalCap *= 1.08;
  if (co >= 5) m.coalCo2 *= 0.85;
  if (co >= 6) m.coalNuisance = 0;
  if (co >= 7) m.coalCo2 *= 0.85;
  if (co >= 8) coEff(0.92);
  if (co >= 9) m.coalCap *= 1.10;
  if (co >= 10) m.coalCo2 *= 0.80;   // 끝까지 올려도 0.85 → 약 0.38 t/MWh (테크 없는 복합발전 수준)

  if (nu >= 1) { m.nuclearOppRange = 3; m.nuclearOppMult = 1.15; }
  if (typeof policyMods === 'function') m.nuclearOppRange = Math.max(1, m.nuclearOppRange + policyMods(state).nuclearOppDelta);   // 친원전: 반발 범위 −1칸
  if (nu >= 3) m.nuclearCapex *= 0.90;
  if (nu >= 4) { m.nuclearBuildDelta -= 4; m.smrBuildDelta -= 2; }
  if (nu >= 5) m.smrCapex *= 0.80;
  if (nu >= 7) m.nukeCap *= 1.08;
  if (nu >= 9) { m.nuclearCapex *= 0.88; m.smrCapex *= 0.88; }
  if (nu >= 11) m.nukeCap *= 1.06;
  if (nu >= 12) { m.nuclearCapex *= 0.85; m.smrCapex *= 0.85; m.nuclearBuildDelta -= 3; m.smrBuildDelta -= 2; }
  if (nu >= 14) m.nukeCap *= 1.10;
  if (nu >= 15) m.nukeCap *= 1.12;

  if (so >= 1) m.solarCap *= 1.12;
  if (so >= 2) m.solarCap *= 1.12;
  if (so >= 3) m.solarCapex *= 0.85;
  if (so >= 4) m.solarCap *= 1.14;
  if (so >= 5) m.solarCap *= 1.14;
  if (so >= 6) m.solarCapex *= 0.82;
  if (so >= 7) m.solarCap *= 1.14;
  if (so >= 8) m.solarCap *= 1.16;
  if (so >= 9) m.solarCapex *= 0.82;
  if (so >= 10) m.solarCap *= 1.20;

  if (wi >= 1) m.windCap *= 1.12;
  if (wi >= 2) m.coastalBonus = 0.7;
  if (wi >= 3) m.windCap *= 1.12;
  if (wi >= 4) m.coastalBonus = 1.0;
  if (wi >= 6) m.windCap *= 1.14;
  if (wi >= 7) m.windCapex *= 0.85;
  if (wi >= 8) m.windCap *= 1.14;
  if (wi >= 9) m.windCapex *= 0.88;
  if (wi >= 10) m.windCap *= 1.20;

  if (gr >= 1) m.inertiaLimit = 0.80;
  if (gr >= 2) m.essHours = 6;
  if (gr >= 3) m.lossPerTile = 0.010;
  if (gr >= 4) m.inertiaLimit = 0.88;
  if (gr >= 5) { m.essPower = 1.25; m.essEff = 0.92; }
  if (gr >= 6) m.lossPerTile = 0.005;
  if (gr >= 7) m.inertiaLimit = 0.95;
  if (gr >= 8) { m.essCapex = 0.7; m.essHours = 8; }
  if (gr >= 9) m.lossPerTile = 0;
  if (gr >= 10) m.inertiaLimit = 1.0;
  return m;
}

// 설비 종류별 실제 수치 (테크·정책 반영). 건설비/용량/연료비/탄소/공사기간
function plantStats(state, type) {
  const p = PLANTS[type];
  const m = techMods(state);
  const s = { capex: p.capex, capacity: p.capacity, fuelCost: p.fuelCost, co2: p.co2, buildMonths: p.buildMonths };
  switch (type) {
    case 'gasTurbine': s.fuelCost *= m.gtFuel; s.co2 *= m.gtCo2; break;
    case 'ccgt': s.fuelCost *= m.gtFuel * m.ccgtFuel; s.co2 *= m.gtCo2; s.capacity *= m.ccgtCap; break;
    case 'coal': s.fuelCost *= m.coalFuel; s.co2 *= m.coalCo2; s.capex *= m.coalCapex; s.capacity *= m.coalCap; break;
    case 'nuclear': s.capex *= m.nuclearCapex; s.buildMonths += m.nuclearBuildDelta; s.capacity *= m.nukeCap; s.fuelCost *= m.nukeOpMult; break;
    case 'smr': s.capex *= m.smrCapex; s.buildMonths += m.smrBuildDelta; s.capacity *= m.nukeCap; s.fuelCost *= m.nukeOpMult; break;
    case 'solar': s.capacity *= m.solarCap; s.capex *= m.solarCapex; break;
    case 'wind': s.capacity *= m.windCap; s.capex *= m.windCapex; break;
    case 'ess': s.capacity *= m.essPower; s.capex *= m.essCapex; break;
  }
  s.capex = Math.round(s.capex);
  // 탄소 협약 효과: 무탄소 설비 건설비 할인
  if (['nuclear', 'solar', 'wind', 'ess'].includes(p.kind) && typeof effectsNow === 'function') s.capex = Math.round(s.capex * effectsNow(state).capexMult);
  // 에너지 정책: 고른 노선의 설비가 싸짐 (친원전 = 원전·SMR, 화력 중심 = 복합발전·석탄 + 연료비, 재생에너지 중심 = 태양광·풍력·배터리)
  if (typeof policyMods === 'function') {
    const pm = policyMods(state);
    if (p.kind === 'nuclear') s.capex = Math.round(s.capex * pm.nuclearCapex);
    if (['solar', 'wind', 'ess'].includes(p.kind)) s.capex = Math.round(s.capex * pm.cleanCapex);
    if (['gt', 'ccgt', 'coal'].includes(p.kind)) { s.capex = Math.round(s.capex * pm.thermalCapex); s.fuelCost *= pm.thermalFuel; }
    s.capex = Math.round(s.capex * pm.capexAll);
  }
  // 건설 물가: 경제가 커질수록 건설비가 오름 (이 값에 비례하는 고정 유지비도 함께 오름)
  if (typeof costIndex === 'function') s.capex = Math.round(s.capex * costIndex(state));
  s.buildMonths = Math.max(1, Math.round(s.buildMonths));
  return s;
}

// 이 설비를 지을 수 있는 테크가 있는가
function plantUnlocked(state, type) {
  if (PLANTS[type].removed) return false;   // 게임에서 뺀 설비 (가스터빈)
  const req = PLANTS[type].requiresTech;
  if (!req) return true;
  return (state.tech[req.tree] || 0) >= req.level;
}

// 연구소 확장 기록: 연구 칸 맨 아래에 표시. 최근 14건
function rdLogAdd(state, text, kind) {
  if (!state) return;
  state.rdLog = [{ year: state.year, month: state.month, text, kind }].concat(state.rdLog || []).slice(0, 14);
}
