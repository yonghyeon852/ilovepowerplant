// ============================================================
// 테크트리 + R&D
//  - 테크: 돈을 내고 연구를 시작. 3개월 뒤 결과가 나옴. 성공 확률 = 기본 확률 + R&D 보너스 + 실패 누적 보너스
//  - R&D: 연구원을 한 달에 한 명씩 영입·강화해 R&D 수준을 올림. 연구원은 매달 조금씩 퇴사함
//  - R&D 수준은 테크 단계의 관문이자 동시 연구 수를 정함
// ============================================================

const TECH = {
  gas: {
    name: '가스터빈 (GT · 복합 공통)', color: '#ff9800',
    tiers: [
      { name: 'TIT 상승 I (1,400℃급)', cost: 200, base: 0.30, effect: '가스 연료비·탄소 −10%',
        desc: '터빈 입구 온도(TIT)를 높여 열효율을 올립니다. 가스터빈과 복합발전 모두 연료를 덜 씁니다.' },
      { name: 'TIT 상승 II (1,500℃급)', cost: 375, base: 0.10, effect: '가스 연료비·탄소 −10% 추가',
        desc: '내열 코팅과 냉각 기술로 온도를 더 올립니다.' },
      { name: 'TIT 상승 III (1,600℃급)', cost: 700, base: 0.05, effect: '가스 연료비·탄소 −10% 추가',
        desc: '단결정 블레이드와 고급 냉각으로 세계 최고 수준의 효율에 도달합니다.' },
      { name: 'TIT 상승 IV (1,700℃급 · 세라믹 복합재)', cost: 2000, base: 0.03, effect: '가스 연료비·탄소 −15% 추가',
        desc: '세라믹 기지 복합재(CMC) 부품으로 냉각 공기를 거의 쓰지 않는 궁극의 가스터빈입니다.' },
    ],
  },
  ccgt: {
    name: '복합발전 구조', color: '#f4511e',
    tiers: [
      { name: '2압 (2P) HRSG', cost: 300, base: 0.30, effect: '복합발전 출력 +8%',
        desc: '배열회수보일러를 2압으로 바꿔 배기열을 더 많이 회수합니다.' },
      { name: '3압 (3P) HRSG', cost: 550, base: 0.10, effect: '복합발전 출력 +8% 추가',
        desc: '3압 구조로 증기터빈 출력을 더 끌어냅니다.' },
      { name: '3P Reheat', cost: 875, base: 0.05, effect: '복합발전 출력 +12% 추가, 연료비 −6%',
        desc: '재열 사이클을 더해 증기터빈 효율을 최대로 높입니다.' },
      { name: '초임계 CO₂ 하부 사이클', cost: 2400, base: 0.03, effect: '복합발전 출력 +20% 추가, 연료비 −12%',
        desc: '증기 대신 초임계 이산화탄소로 하부 사이클을 돌려 효율과 출력을 한 단계 더 올립니다.' },
    ],
  },
  nuclear: {
    name: '원자력', color: '#f06292',
    tiers: [
      { name: '안전성 강화 설계', cost: 625, base: 0.30, effect: '대형 원전 건설 해금 · 주민 반발 범위 5→3칸, 추가 비용 +30%→+15%, 원전 건설비 −10%',
        desc: '피동 안전 계통을 갖춰 안전 규제를 통과합니다. 이 설계가 있어야 대형 원전을 지을 수 있고, 주민 반발도 줄어듭니다.' },
      { name: 'SMR 개발', cost: 1500, base: 0.10, effect: 'SMR(소형모듈원전) 건설 해금',
        desc: '300MW급 소형 모듈 원전. 바다가 없어도 되고 부지가 작으며 12개월이면 지어집니다.' },
      { name: 'SMR 모듈 양산', cost: 1250, base: 0.05, effect: 'SMR 건설비 −35%, 공사 −4개월',
        desc: '공장 양산 체계를 갖춰 SMR을 싸고 빠르게 짓습니다.' },
      { name: '4세대 원자로 (고온가스로)', cost: 4000, base: 0.03, effect: '원전·SMR 건설비 −30% · 원전 공사 −6개월 · 정기검사 정지 없음',
        desc: '고유 안전성을 갖춘 4세대 노형으로 규제 비용이 줄고, 온라인 검사로 정기검사 정지가 사라집니다.' },
    ],
  },
  coal: {
    name: '석탄화력', color: '#546e7a',
    tiers: [
      { name: '초초임계압 (USC)', cost: 375, base: 0.30, effect: '석탄 연료비·탄소 −15%',
        desc: '증기 온도와 압력을 높여 효율을 올립니다.' },
      { name: 'IGCC (석탄가스화 복합)', cost: 1000, base: 0.10, effect: '석탄 탄소 −55%, 새 석탄 건설비 +20%',
        desc: '석탄을 가스로 바꿔 복합발전처럼 태웁니다. 탄소는 크게 줄지만 설비가 비쌉니다.' },
      { name: 'CCS (탄소 포집·저장)', cost: 1500, base: 0.05, effect: '석탄 탄소 −75% 추가, 연료비 +12%',
        desc: '배출되는 탄소를 잡아 땅속에 저장합니다. 포집 설비를 돌리는 만큼 연료가 더 듭니다.' },
      { name: '유연 운전 개조', cost: 2500, base: 0.03, effect: '석탄 최소 출력 40% → 20%, 출력 변화 속도 2배, 수명 25 → 35년, 연료비 −5%',
        desc: '보일러·터빈을 개조해 밤에는 깊이 줄이고 낮에는 빠르게 올립니다. 재생에너지가 많아도 석탄이 야간 과잉 발전 없이 버티는 기저 전원이 되고, 오래 씁니다. 탄소는 계속 나옵니다.' },
    ],
  },
  solar: {
    name: '태양광', color: '#ffb300',
    tiers: [
      { name: 'TOPCon 고효율 셀', cost: 175, base: 0.30, effect: '태양광 출력 +15%',
        desc: '셀 효율을 높여 같은 면적에서 더 많은 전기를 냅니다.' },
      { name: '양면 모듈 + 트래커', cost: 350, base: 0.10, effect: '태양광 출력 +25% 추가',
        desc: '뒷면 발전과 태양 추적으로 하루 발전량을 늘립니다.' },
      { name: '페로브스카이트 탠덤', cost: 750, base: 0.05, effect: '태양광 출력 +35% 추가, 건설비 −25%',
        desc: '차세대 탠덤 셀로 효율 30%대에 도달합니다.' },
      { name: '3중 접합 페로브스카이트', cost: 2000, base: 0.03, effect: '태양광 출력 +40% 추가, 건설비 −25% 추가',
        desc: '세 겹 접합 셀로 효율 40%에 다가섭니다.' },
    ],
  },
  wind: {
    name: '풍력', color: '#81d4fa',
    tiers: [
      { name: '대형 터빈 (15MW급)', cost: 250, base: 0.30, effect: '풍력 출력 +25%',
        desc: '블레이드를 키워 약한 바람에서도 더 많이 발전합니다.' },
      { name: '해상풍력 기초 기술', cost: 500, base: 0.10, effect: '해안 보너스 +40% → +100%',
        desc: '해안 지반 공사 기술로 바닷바람을 더 잘 활용합니다.' },
      { name: '부유식 해상풍력', cost: 1125, base: 0.05, effect: '바다 위에 풍력 건설 가능, 출력 +20% 추가',
        desc: '떠 있는 구조물 위에 터빈을 세워 깊은 바다에도 진출합니다.' },
      { name: '초대형 25MW 터빈', cost: 2500, base: 0.03, effect: '풍력 출력 +40% 추가',
        desc: '날개 길이 150m급 초대형 터빈으로 같은 자리에서 훨씬 많은 전기를 냅니다.' },
    ],
  },
  ess: {
    name: '에너지 저장 (ESS)', color: '#26c6da',
    tiers: [
      { name: '대용량 리튬 셀', cost: 300, base: 0.30, effect: 'ESS 저장 시간 4h → 6h',
        desc: '같은 출력에 더 오래 방전할 수 있는 대용량 배터리 셀입니다.' },
      { name: '고효율 PCS', cost: 600, base: 0.10, effect: 'ESS 왕복 효율 85% → 92%, 출력 +25%',
        desc: '전력변환장치(PCS)를 개선해 손실을 줄이고 더 큰 출력을 냅니다.' },
      { name: '전고체 배터리', cost: 1200, base: 0.05, effect: 'ESS 건설비 −30%, 수명 15년 → 20년',
        desc: '차세대 전고체 배터리로 값은 싸지고 수명은 길어집니다.' },
      { name: '장주기 저장 (흐름전지)', cost: 2500, base: 0.03, effect: 'ESS 저장 시간 2배, 출력 +25% 추가, 건설비 −20% 추가',
        desc: '전해액 탱크를 키우는 흐름전지로 하루 종일 방전할 수 있는 장주기 저장이 됩니다.' },
    ],
  },
  grid: {
    name: '계통 · 송전', color: '#ab47bc',
    tiers: [
      { name: '동기조상기', cost: 375, base: 0.30, effect: '비관성 허용 비중 70% → 85%',
        desc: '회전 관성을 보태 재생에너지 비중이 높아도 주파수를 버팁니다.' },
      { name: '그리드포밍 인버터', cost: 750, base: 0.10, effect: '비관성 허용 비중 85% → 95% · 주파수 사고 없음',
        desc: '인버터가 스스로 주파수를 만들어 관성 없는 전원도 계통을 지탱합니다.' },
      { name: 'HVDC 송전', cost: 1000, base: 0.05, effect: '송전 손실 칸당 1% → 0.3%',
        desc: '고압 직류 송전으로 먼 거리 손실을 크게 줄입니다.' },
      { name: 'AI 계통 운영', cost: 2500, base: 0.03, effect: '비관성 허용 비중 95% → 100% · 송전 손실 0',
        desc: '실시간 예측·제어로 재생에너지만으로도 계통을 안정적으로 운영합니다.' },
    ],
  },
  // ---------- 수소 (별도 트리 3개, 각 2단계. 관문은 R&D 60 / 150) ----------
  h2crack: {
    name: '암모니아 크래킹', color: '#7e57c2', gates: [80, 200],
    tiers: [
      { name: '크래킹 플랜트', cost: 800, base: 0.25, effect: '암모니아 크래킹 설비 건설 해금 (수입 암모니아 → 수소, 터빈 200MW분/기)',
        desc: '수입한 암모니아를 분해해 수소를 뽑는 플랜트를 지을 수 있게 됩니다. 만든 수소는 수소 터빈 테크가 있으면 가스 발전이 바로 태우고, 남으면 수출합니다.' },
      { name: '고효율 촉매 크래킹', cost: 1500, base: 0.10, effect: '암모니아 소비 −20% (수소 연료비 −20%) · 크래킹 전력 소비 −30%',
        desc: '저온 촉매로 같은 암모니아에서 더 많은 수소를 얻고, 플랜트가 쓰는 전력도 줄입니다.' },
    ],
  },
  h2turbine: {
    name: '수소 터빈', color: '#b39ddb', gates: [80, 200],
    tiers: [
      { name: '수소 혼소 (30%)', cost: 900, base: 0.20, effect: '가스터빈·복합발전이 크래킹 수소를 자동으로 연료의 30%까지 사용 (그만큼 탄소 0)',
        desc: '기존 가스터빈 연소기를 개조해 천연가스에 수소를 섞어 태웁니다. 크래킹 설비가 만든 수소를 알아서 먼저 씁니다.' },
      { name: '수소 전소 (100%)', cost: 1600, base: 0.08, effect: '가스터빈·복합발전이 수소만으로도 운전 · 같은 전기를 내는 데 수소 20% 덜 씀',
        desc: '전소 연소기로 수소만 태울 수 있습니다. 수소만 충분하면 가스 발전의 탄소가 0이 됩니다(연료는 암모니아 값).' },
    ],
  },
};
const TECH_ORDER = ['gas', 'ccgt', 'nuclear', 'coal', 'solar', 'wind', 'ess', 'grid', 'h2crack', 'h2turbine'];

// 실패할 때마다 그 트리의 다음 시도 확률에 더해지는 값
const TECH_PITY = 0.08;
// 단계별로 필요한 R&D 수준 (1단계 20, 2단계 150, 3단계 300, 4단계 400)
const TECH_TIER_RD = [20, 150, 300, 400];
const TECH_TIER3_RD = TECH_TIER_RD[2];

// R&D 상시 이점의 최대치 (수준이 오를수록 서서히 포화: f = lv / (lv + 67), 수준 100에서 약 60%)
const RD_PERKS = {
  capex: 0.10,     // 신규 건설비 최대 −10%
  build: 0.25,     // 공사 기간 최대 −25%
  om: 0.20,        // 고정 유지비 최대 −20%
  aging: 0.10,     // 노후 시작 시점 85% → 최대 95%
  patent: 0.25,    // 특허·기술 수출 수입: 수준 × 0.25억/월
};
const TECH_PITY_SENIOR = 0.12;   // 중견 이상이 있으면 실패 누적 보너스 증가
const MASTER_BONUS = 0.10;       // 대가가 있으면 모든 연구 확률 +10%
const TECH_RESEARCH_MONTHS = 3;  // 연구 하나에 걸리는 기간
const RD_PER_SLOT = 100;         // R&D 수준 이만큼마다 동시 연구 1개 추가

// ---------- R&D 연구원 단계 ----------
//  attrition: 매달 자연 퇴사 확률 (학부생·석사만). 박사 이상은 자연 퇴사가 없고,
//  upgradeCost/upgradeProb: 강화 기대 비용(영입 + 강화비 ÷ 확률)이 다음 단계 직접 영입비보다 5~15% 싸게 맞춰 둠 (직접 영입은 시간을 아끼는 대가)
//  연구 실패 시 30% 확률로 박사·초임·중견 중 한 명이 책임지고 퇴사하며(대가 제외), 영입 후 30년이 지나면 은퇴함
//  blame: 연구 실패 시 책임 퇴사 대상인지
const RD_STAGES = [
  { id: 'ug',     name: '학부생',     ability: 1,   cost: 60,    salary: 0.5,  unlock: 0,   upgradeCost: 110,  upgradeProb: 0.70, attrition: 0.03, blame: false },
  { id: 'ms',     name: '석사',       ability: 3,   cost: 250,   salary: 1.2,  unlock: 3,   upgradeCost: 150,  upgradeProb: 0.50, attrition: 0.02, blame: false },
  { id: 'phd',    name: '박사',       ability: 10,  cost: 600,   salary: 3,    unlock: 15,  upgradeCost: 200,  upgradeProb: 0.35, attrition: 0,    blame: true },
  { id: 'jr',     name: '초임 연구원', ability: 25,  cost: 1200,  salary: 7,    unlock: 40,  upgradeCost: 650,  upgradeProb: 0.25, attrition: 0,    blame: true },
  { id: 'sr',     name: '중견 연구원', ability: 60,  cost: 4000,  salary: 18,   unlock: 100, upgradeCost: 550,  upgradeProb: 0.10, attrition: 0,    blame: true },
  { id: 'master', name: '대가',       ability: 150, cost: 10000, salary: 45,   unlock: 250, upgradeCost: null, upgradeProb: 0,    attrition: 0,    blame: false },
];
const RD_BLAME_PROB = 0.30;         // 연구 실패 시 박사·초임·중견 중 한 명이 책임지고 퇴사할 확률
const RD_RETIRE_MONTHS = 30 * 12;   // 박사 이상은 영입(또는 박사 승격) 후 30년이 지나면 은퇴

function emptyRd() {
  const counts = {};
  for (const s of RD_STAGES) counts[s.id] = 0;
  return counts;
}

function emptyTech() {
  const t = {};
  for (const k of TECH_ORDER) t[k] = 0;
  return t;
}

// ---------- R&D 계산 ----------
function rdLevel(state) {
  return RD_STAGES.reduce((s, st) => s + (state.rd[st.id] || 0) * st.ability, 0);
}

function rdSalary(state) {
  return RD_STAGES.reduce((s, st) => s + (state.rd[st.id] || 0) * st.salary, 0);
}

// R&D 수준이 높을수록 테크 성공 확률 보너스 (수준 20에서 +6%, 100에서 +18%, 200에서 +25%, 최대 +40%)
function rdBonus(state) {
  const lv = rdLevel(state);
  return 0.4 * lv / (lv + 120);
}

// R&D 상시 이점 (수준에 따라 포화). 각 값은 0~1 사이의 "최대치 대비 비율"
function rdPerks(state) {
  const lv = rdLevel(state);
  const f = lv / (lv + 67);
  return {
    f,
    capexMult: 1 - RD_PERKS.capex * f,
    buildMult: 1 - RD_PERKS.build * f,
    omMult: 1 - RD_PERKS.om * f,
    agingStart: ECON.agingStart + RD_PERKS.aging * f,
    patent: lv * RD_PERKS.patent * policyMods(state).patent,
  };
}
function hasSenior(state) { return (state.rd.sr || 0) + (state.rd.master || 0) > 0; }
function hasMaster(state) { return (state.rd.master || 0) > 0; }
function techPityStep(state) { return hasSenior(state) ? TECH_PITY_SENIOR : TECH_PITY; }

// 이 단계를 시도하려면 필요한 R&D 수준. 부족하면 필요한 값을 돌려주고, 충분하면 0
// 단계별 R&D 관문. 트리에 gates가 있으면(수소 트리) 그것을, 없으면 공통 관문(20/100/200)을 씀
function tierGate(tree, lvl) {
  const g = TECH[tree].gates;
  return (g ? g[lvl] : TECH_TIER_RD[lvl]) || 0;
}
function techGate(state, tree) {
  const lvl = state.tech[tree] || 0;
  const need = tierGate(tree, lvl);
  return rdLevel(state) < need ? need : 0;
}

// ---------- 테크 계산 ----------
function techSuccessProb(state, tree) {
  const lvl = state.tech[tree] || 0;
  const tier = TECH[tree].tiers[lvl];
  if (!tier) return 0;
  const pity = (state.techPity && state.techPity[tree]) || 0;
  const evBonus = (state.event && state.event.techBonus) || 0;
  const master = hasMaster(state) ? MASTER_BONUS : 0;
  const fxBonus = (typeof effectsNow === 'function') ? (effectsNow(state).techBonus || 0) : 0;   // 지속 효과(연구원 처우 개선 등)
  const boost = fxBonus + (state.techBoost || 0) + (tree.startsWith('h2') && typeof policyMods === 'function' ? policyMods(state).h2TechBonus : 0);   // 사건 보너스 + 수소 경제 정책
  return clamp(tier.base + rdBonus(state) + pity + evBonus + master + boost, 0.03, 0.95);
}

// 동시에 진행할 수 있는 연구 수: R&D 수준 100마다 1개씩 늘어남 (기본 1개)
function researchSlots(state) {
  return 1 + Math.floor(rdLevel(state) / RD_PER_SLOT);
}
function researchActive(state) {
  return Object.values(state.techBusy || {}).filter(Boolean).length;
}

// 연구 시작. 결과는 TECH_RESEARCH_MONTHS 뒤에 나옴 (성공 여부는 시작 시점 확률로 결정)
function attemptTech(state, tree) {
  const lvl = state.tech[tree] || 0;
  const tier = TECH[tree].tiers[lvl];
  if (!tier) return { ok: false, msg: '이미 모든 단계를 개발했습니다' };
  if (!state.techBusy) state.techBusy = {};
  if (state.techBusy[tree]) return { ok: false, msg: '이 계열은 이미 연구 중입니다 (' + state.techBusy[tree].months + '개월 남음)' };
  if (researchActive(state) >= researchSlots(state)) return { ok: false, msg: '동시 연구 한도(' + researchSlots(state) + '개)에 도달했습니다. R&D 수준 ' + RD_PER_SLOT + '마다 1개씩 늘어납니다' };
  const need = techGate(state, tree);
  if (need) return { ok: false, msg: (lvl + 1) + '단계 연구는 R&D 수준 ' + need + ' 이상이어야 합니다' };
  if (state.money < tier.cost) return { ok: false, msg: '자금이 부족합니다 (' + fmt(tier.cost) + '억 필요)' };

  const p = techSuccessProb(state, tree);
  state.techBoost = 0;
  state.money -= tier.cost;
  state.techBusy[tree] = { months: TECH_RESEARCH_MONTHS, success: Math.random() < p, prob: p, cost: tier.cost, name: tier.name, lvl };
  return { ok: true, msg: '🔬 연구 시작: ' + tier.name + ' (' + TECH_RESEARCH_MONTHS + '개월 · 성공 확률 ' + fmt(p * 100) + '%)' };
}

// 달이 지날 때 연구 진행. 끝난 연구의 결과를 적용하고 알림 문구 목록을 돌려줌
function progressResearch(state) {
  const notices = [];
  if (!state.techBusy) return notices;
  if (!state.techPity) state.techPity = {};
  for (const tree of Object.keys(state.techBusy)) {
    const job = state.techBusy[tree];
    if (!job) continue;
    job.months -= 1;
    if (job.months > 0) continue;
    if (job.success) {
      state.tech[tree] = job.lvl + 1;
      state.techPity[tree] = 0;
      notices.push('✓ 연구 성공: ' + job.name);
      if (typeof milestone === 'function') milestone('🧪 연구 성공: ' + job.name);
    } else {
      state.techPity[tree] = (state.techPity[tree] || 0) + techPityStep(state);
      // 실패 책임: 박사·초임·중견 중 한 명이 사직
      const who = Math.random() < policyMods(state).blameProb ? resignOnFailure(state) : null;
      notices.push('✕ 연구 실패: ' + job.name + ' (다음 시도 +' + fmt(techPityStep(state) * 100) + '%)' + (who ? ' · ' + who + ' 1명 책임지고 퇴사' : ''));
      job.resigned = who;
    }
    state.techLog = [{ year: state.year, month: state.month, tree, name: job.name, cost: job.cost, prob: job.prob, success: job.success, resigned: job.resigned || null }]
      .concat(state.techLog || []).slice(0, 12);
    delete state.techBusy[tree];
  }
  return notices;
}

// ---------- 박사 이상 연구원의 재직 기록 (은퇴 계산용) ----------
//  state.rdJoined[stageId] = 그 단계 연구원 각각의 입사 시점(년×12+월) 목록. 인원 수와 항상 같은 길이로 맞춤
function monthIndex(state) { return state.year * 12 + state.month; }
function tracksTenure(st) { return st.attrition === 0; }
function rdJoined(state) {
  if (!state.rdJoined) state.rdJoined = {};
  const now = monthIndex(state);
  for (const st of RD_STAGES) {
    if (!tracksTenure(st)) continue;
    const list = state.rdJoined[st.id] || (state.rdJoined[st.id] = []);
    const n = state.rd[st.id] || 0;
    while (list.length < n) list.push(now);
    if (list.length > n) list.splice(n);
  }
  return state.rdJoined;
}
// 한 명 제거 (무작위 또는 지정 인덱스)
function removeResearcher(state, st, index) {
  const n = state.rd[st.id] || 0;
  if (n <= 0) return false;
  if (tracksTenure(st)) {
    // 인원 수를 줄이기 전에 기록을 먼저 지움 (rdJoined가 길이를 인원 수에 맞추기 때문)
    const list = rdJoined(state)[st.id];
    list.splice(index === undefined ? Math.floor(Math.random() * list.length) : index, 1);
  }
  state.rd[st.id] = n - 1;
  return true;
}
// 연구 실패 시 책임 퇴사: 박사·초임·중견 중 무작위 한 명 (인원 비례). 퇴사자가 없으면 null
function resignOnFailure(state) {
  const pool = [];
  for (const st of RD_STAGES) if (st.blame) for (let i = 0; i < (state.rd[st.id] || 0); i++) pool.push(st);
  if (!pool.length) return null;
  const st = pool[Math.floor(Math.random() * pool.length)];
  removeResearcher(state, st);
  rdLogAdd(state, '책임 퇴사: ' + st.name + ' 1명 (연구 실패)', 'fail');
  return st.name;
}
// 가장 은퇴가 가까운 연구원까지 남은 개월 수 (없으면 null)
function nextRetirement(state) {
  const joined = rdJoined(state);
  let best = null;
  for (const st of RD_STAGES) {
    if (!tracksTenure(st)) continue;
    for (const j of joined[st.id]) {
      const left = j + RD_RETIRE_MONTHS - monthIndex(state);
      if (best === null || left < best.months) best = { months: left, name: st.name };
    }
  }
  return best;
}

// 연구원 구매 (한 달에 한 명)
function buyResearcher(state, idx) {
  const st = RD_STAGES[idx];
  if (state.hiredThisMonth) return { ok: false, msg: '이번 달에는 이미 영입했습니다. 영입은 한 달에 한 명입니다' };
  if (rdLevel(state) < st.unlock) return { ok: false, msg: 'R&D 수준 ' + st.unlock + ' 이상이어야 합니다' };
  const cost = researcherCost(state, st);
  if (state.money < cost) return { ok: false, msg: '자금이 부족합니다 (' + fmt(cost) + '억 필요)' };
  state.money -= cost;
  rdJoined(state);
  state.rd[st.id] = (state.rd[st.id] || 0) + 1;
  if (tracksTenure(st)) state.rdJoined[st.id].push(monthIndex(state));
  state.hiredThisMonth = true;
  rdLogAdd(state, '영입: ' + st.name + ' (' + fmt(cost) + '억)', 'hire');
  return { ok: true, msg: st.name + ' 영입 (' + fmt(cost) + '억)' };
}

// 연구원 강화: 한 명을 다음 단계로 올리기 시도 (한 달에 한 번)
function upgradeResearcher(state, idx) {
  const st = RD_STAGES[idx];
  const next = RD_STAGES[idx + 1];
  if (!next || st.upgradeCost === null) return { ok: false, msg: '더 올릴 단계가 없습니다' };
  if (state.upgradedThisMonth) return { ok: false, msg: '이번 달에는 이미 강화했습니다. 강화는 한 달에 한 번입니다' };
  if ((state.rd[st.id] || 0) <= 0) return { ok: false, msg: st.name + '이(가) 없습니다' };
  if (state.money < st.upgradeCost) return { ok: false, msg: '자금이 부족합니다 (' + fmt(st.upgradeCost) + '억 필요)' };
  state.money -= st.upgradeCost;
  state.upgradedThisMonth = true;
  const success = Math.random() < st.upgradeProb;
  if (success) {
    // 승격: 재직 기록도 함께 옮김 (석사→박사는 박사 승격 시점부터 30년)
    const joined = rdJoined(state);
    let since = monthIndex(state);
    if (tracksTenure(st)) {
      const i = Math.floor(Math.random() * joined[st.id].length);
      since = joined[st.id].splice(i, 1)[0];
    }
    state.rd[st.id] -= 1;
    state.rd[next.id] = (state.rd[next.id] || 0) + 1;
    if (tracksTenure(next)) joined[next.id].push(since);
  }
  // 강화 기록은 연구 기록과 따로 (R&D 탭에 표시). 연구 기록은 테크 연구만
  rdLogAdd(state, (success ? '강화 성공: ' : '강화 실패: ') + st.name + ' → ' + next.name + ' (' + fmt(st.upgradeCost) + '억 · ' + Math.round(st.upgradeProb * 100) + '%)', success ? 'ok' : 'fail');
  return { ok: true, success, msg: (success ? '✓ 강화 성공: ' : '✕ 강화 실패: ') + st.name + ' → ' + next.name };
}

// 연구원 이탈: 학부생·석사는 매달 확률로 자연 퇴사, 박사 이상은 30년 재직 후 은퇴. 돌아온 값은 알림 문구 목록
function attrition(state) {
  const notices = [];
  const joined = rdJoined(state);
  const now = monthIndex(state);
  for (const st of RD_STAGES) {
    const n = state.rd[st.id] || 0;
    if (!tracksTenure(st)) {
      let left = 0;
      for (let i = 0; i < n; i++) if (Math.random() < st.attrition) left++;
      if (left > 0) { state.rd[st.id] = n - left; notices.push(st.name + ' ' + left + '명 퇴사'); rdLogAdd(state, '퇴사: ' + st.name + ' ' + left + '명 (자연 퇴사)', 'fail'); }
      continue;
    }
    let retired = 0;
    for (let i = joined[st.id].length - 1; i >= 0; i--) {
      if (now - joined[st.id][i] >= RD_RETIRE_MONTHS) { removeResearcher(state, st, i); retired++; }
    }
    if (retired > 0) { notices.push(st.name + ' ' + retired + '명 정년 은퇴'); rdLogAdd(state, '은퇴: ' + st.name + ' ' + retired + '명 (30년 재직)', 'fail'); }
  }
  return notices;
}

// ---------- 테크가 게임 수치에 미치는 영향 ----------
function techMods(state) {
  const t = state.tech || emptyTech();
  const m = {
    gtFuel: Math.pow(0.90, Math.min(3, t.gas)) * (t.gas >= 4 ? 0.85 : 1), gtCo2: Math.pow(0.90, Math.min(3, t.gas)) * (t.gas >= 4 ? 0.85 : 1),
    ccgtCap: 1, ccgtFuel: 1,
    nuclearOppRange: PLANTS.nuclear.oppositionRange, nuclearOppMult: PLANTS.nuclear.oppositionMult, nuclearCapex: 1,
    smrUnlocked: t.nuclear >= 2, smrCapex: 1, smrBuildDelta: 0, nuclearBuildDelta: 0,
    coalFuel: 1, coalCo2: 1, coalCapex: 1, coalMinLoad: PLANTS.coal.minLoad, coalRamp: PLANTS.coal.ramp, coalLife: PLANTS.coal.lifeYears,
    solarCap: 1, solarCapex: 1,
    windCap: 1, coastalBonus: PLANTS.wind.coastalBonus, windOnSea: false,
    gridForming: false,
    h2KgPerMWh: ECON.h2KgPerMWh, h2FuelMult: 1, crackerLoadMult: 1, h2Blend: 0,   // 수소: 터빈 kg/MWh, 암모니아 연료비 배율, 크래킹 전력 배율, 터빈 수소 비율 상한
    inertiaLimit: ECON.inertiaLimit, lossPerTile: ECON.lossPerTile,
    essHours: PLANTS.ess.energyHours, essEff: ECON.essEff, essPower: 1, essCapex: 1, essLife: PLANTS.ess.lifeYears,
  };
  if (t.ccgt >= 1) m.ccgtCap *= 1.08;
  if (t.ccgt >= 2) m.ccgtCap *= 1.08;
  if (t.ccgt >= 3) { m.ccgtCap *= 1.12; m.ccgtFuel *= 0.94; }
  if (t.ccgt >= 4) { m.ccgtCap *= 1.20; m.ccgtFuel *= 0.88; }

  if (t.nuclear >= 1) { m.nuclearOppRange = 3; m.nuclearOppMult = 1.15; m.nuclearCapex = 0.90; }
  if (typeof policyMods === 'function') m.nuclearOppRange = Math.max(1, m.nuclearOppRange + policyMods(state).nuclearOppDelta);   // 친원전: 반발 범위 −1칸
  if (t.nuclear >= 3) { m.smrCapex = 0.65; m.smrBuildDelta = -4; }
  if (t.nuclear >= 4) { m.nuclearCapex *= 0.7; m.smrCapex *= 0.7; m.nuclearBuildDelta = -6; }

  if (t.coal >= 1) { m.coalFuel *= 0.85; m.coalCo2 *= 0.85; }
  if (t.coal >= 2) { m.coalCo2 *= 0.45; m.coalCapex *= 1.20; }   // IGCC: 누적 0.85→0.33 t/MWh (CCS 전까지 배출 기준을 버틸 시간을 줌)
  if (t.coal >= 3) { m.coalCo2 *= 0.25; m.coalFuel *= 1.12; }
  if (t.coal >= 4) { m.coalMinLoad = 0.2; m.coalRamp = PLANTS.coal.ramp * 2; m.coalLife = 35; m.coalFuel *= 0.95; }

  if (t.solar >= 1) m.solarCap *= 1.15;
  if (t.solar >= 2) m.solarCap *= 1.25;
  if (t.solar >= 3) { m.solarCap *= 1.35; m.solarCapex *= 0.75; }
  if (t.solar >= 4) { m.solarCap *= 1.40; m.solarCapex *= 0.75; }

  if (t.wind >= 1) m.windCap *= 1.25;
  if (t.wind >= 2) m.coastalBonus = 1.0;
  if (t.wind >= 3) { m.windOnSea = true; m.windCap *= 1.20; }
  if (t.wind >= 4) m.windCap *= 1.40;

  if (t.ess >= 1) m.essHours = 6;
  if (t.ess >= 2) { m.essEff = 0.92; m.essPower = 1.25; }
  if (t.ess >= 3) { m.essCapex = 0.7; m.essLife = 20; }
  if (t.ess >= 4) { m.essHours *= 2; m.essPower *= 1.25; m.essCapex *= 0.8; }

  if (t.grid >= 1) m.inertiaLimit = 0.85;
  if (t.grid >= 2) { m.inertiaLimit = 0.95; m.gridForming = true; }
  if (t.grid >= 3) m.lossPerTile = 0.003;
  if (t.grid >= 4) { m.inertiaLimit = 1.0; m.lossPerTile = 0; }
  // 수소 트리
  if (t.h2crack >= 2) { m.h2FuelMult = 0.8; m.crackerLoadMult = 0.7; }   // 고효율 촉매: 암모니아 −20%, 전력 −30%
  if (t.h2turbine >= 1) m.h2Blend = 0.3;
  if (t.h2turbine >= 2) { m.h2Blend = 1.0; m.h2KgPerMWh = ECON.h2KgPerMWh * 0.8; }   // 수소 전소 터빈: 같은 전기를 내는 데 수소 20% 덜 씀
  return m;
}

// 설비 종류별 실제 수치 (테크·R&D 반영). 건설비/용량/연료비/탄소/공사기간
function plantStats(state, type) {
  const p = PLANTS[type];
  const m = techMods(state);
  const s = { capex: p.capex, capacity: p.capacity, fuelCost: p.fuelCost, co2: p.co2, buildMonths: p.buildMonths };
  switch (type) {
    case 'gasTurbine': s.fuelCost *= m.gtFuel; s.co2 *= m.gtCo2; break;
    case 'ccgt': s.fuelCost *= m.gtFuel * m.ccgtFuel; s.co2 *= m.gtCo2; s.capacity *= m.ccgtCap; break;
    case 'coal': s.fuelCost *= m.coalFuel; s.co2 *= m.coalCo2; s.capex *= m.coalCapex; break;
    case 'nuclear': s.capex *= m.nuclearCapex; s.buildMonths += m.nuclearBuildDelta; break;
    case 'smr': s.capex *= m.smrCapex; s.buildMonths += m.smrBuildDelta; break;
    case 'solar': s.capacity *= m.solarCap; s.capex *= m.solarCapex; break;
    case 'wind': s.capacity *= m.windCap; break;
    case 'ess': s.capacity *= m.essPower; s.capex *= m.essCapex; break;
  }
  // R&D 상시 이점: 건설비·공사 기간 절감
  const perks = rdPerks(state);
  s.capex = Math.round(s.capex * perks.capexMult);
  // 탄소 협약 효과: 무탄소 설비 건설비 할인
  if (['nuclear', 'solar', 'wind', 'ess'].includes(p.kind) && typeof effectsNow === 'function') s.capex = Math.round(s.capex * effectsNow(state).capexMult);
  // 정책 노선: 친원전이면 원전·SMR 건설비 −15%, 탈원전이면 태양광·풍력·ESS 건설비 −20%
  if (typeof policyMods === 'function') { const pm = policyMods(state); if (p.kind === 'nuclear') s.capex = Math.round(s.capex * pm.nuclearCapex); if (['solar', 'wind', 'ess'].includes(p.kind)) s.capex = Math.round(s.capex * pm.cleanCapex); s.capex = Math.round(s.capex * pm.capexAll); if (p.kind === 'h2') s.capex = Math.round(s.capex * pm.h2Capex); }
  s.buildMonths = Math.max(1, Math.round(s.buildMonths * perks.buildMult));
  return s;
}

// 이 설비를 지을 수 있는 테크가 있는가
function plantUnlocked(state, type) {
  const req = PLANTS[type].requiresTech;
  if (!req) return true;
  return (state.tech[req.tree] || 0) >= req.level;
}

// 연구원 변동 기록 (영입·강화·퇴사·은퇴): R&D 탭 아래에 표시. 최근 14건
function rdLogAdd(state, text, kind) {
  if (!state) return;
  state.rdLog = [{ year: state.year, month: state.month, text, kind }].concat(state.rdLog || []).slice(0, 14);
}
