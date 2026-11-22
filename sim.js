// ============================================================
// 시뮬레이션: 날씨, 수요 곡선, 급전(어느 발전기를 얼마나 돌릴지), 정산, 민심
// ============================================================

const DEMAND_SHAPE = {
  summer: [0.62, 0.58, 0.55, 0.53, 0.52, 0.54, 0.60, 0.68, 0.76, 0.84, 0.90, 0.94,
           0.95, 0.97, 1.00, 0.99, 0.97, 0.93, 0.88, 0.84, 0.80, 0.76, 0.70, 0.65],
  winter: [0.72, 0.68, 0.65, 0.64, 0.64, 0.67, 0.74, 0.82, 0.90, 0.93, 0.92, 0.90,
           0.88, 0.88, 0.90, 0.92, 0.96, 1.00, 0.98, 0.95, 0.90, 0.86, 0.80, 0.75],
  mid:    [0.62, 0.58, 0.55, 0.54, 0.54, 0.57, 0.64, 0.72, 0.80, 0.86, 0.88, 0.88,
           0.87, 0.88, 0.90, 0.91, 0.92, 0.93, 0.90, 0.86, 0.80, 0.75, 0.70, 0.65],
};
const SEASON_PEAK = { summer: 1.10, winter: 1.12, mid: 0.95 };   // 계절별 최대 수요 배율의 봉우리 (8월 · 1월). 달별 값은 아래 MONTH_PEAK
// 달별 최대 수요 배율: 1월과 8월이 봉우리, 4·5·10월이 골. 예전에는 계절 세 단계로만 바뀌어 6월·12월에 갑자기 뛰고 같은 계절의 달은 모두 같았음
//  하루 모양은 계절별 DEMAND_SHAPE를 쓰고, 봄가을 모양은 최댓값이 0.93이라 그달의 실제 봉우리는 이 값 × 0.93
//  실제 봉우리: 1월 1.12 · 2월 1.08 · 3월 0.95 · 4·5월 0.87 · 6월 0.98 · 7월 1.07 · 8월 1.10 · 9월 0.95 · 10월 0.87 · 11월 0.95 · 12월 1.07 (연평균은 예전과 같음)
const MONTH_PEAK = [0, 1.12, 1.08, 1.02, 0.935, 0.935, 0.98, 1.07, 1.10, 1.02, 0.935, 1.02, 1.07];
function monthPeak(month) { return MONTH_PEAK[month] || 1; }
function peakMultOf(month) { return monthPeak(month) * Math.max.apply(null, DEMAND_SHAPE[seasonOf(month)]); }   // 그달의 실제 최대 수요 배율
const WORST_PEAK_MULT = 1.12;   // 한 해 중 가장 큰 달(1월)의 배율
function worstPeakRatio(month) { return WORST_PEAK_MULT / peakMultOf(month); }   // 지금 달의 최대 수요가 가장 큰 달에는 몇 배가 되나
// 태양광: 해가 떠 있는 시간이 계절마다 다름 (여름 14시간 · 봄가을 12시간 · 겨울 10시간). 하루 발전량은 예전과 같도록 한낮 최대치를 맞춤
//  → 겨울 저녁 수요 봉우리(17~18시)에는 해가 이미 져 있고, 여름에는 아침저녁까지 조금씩 나옴
const DAYLIGHT    = { summer: [5, 19], winter: [7, 17], mid: [6, 18] };
const SOLAR_PEAK  = { summer: 0.73, winter: 0.66, mid: 0.75 };
const SEASON_NAME = { summer: '여름', winter: '겨울', mid: '봄·가을' };
const SEASON_TEMP = { summer: 27, winter: 0, mid: 14 };   // 계절 평균 기온 (℃)
const MONTH_TEMP  = [0, -2, 1, 7, 13, 18, 23, 26, 27, 22, 15, 8, 1];   // 달별 평년 기온 (℃). 가스 발전 출력(외기온)과 냉난방 수요에 쓰임
// 기온이 수요에 미치는 영향: 여름은 평년보다 더울수록(냉방), 겨울은 추울수록(난방) 수요가 늘어남. 봄가을은 영향 없음
function tempDemandMult(month, temp) {
  const s = seasonOf(month), d = temp - MONTH_TEMP[month];
  return s === 'summer' ? 1 + ECON.tempDemandSummer * d : s === 'winter' ? 1 - ECON.tempDemandWinter * d : 1;
}
const SEASON_WIND = { summer: 0.6, winter: 1.35, mid: 1.0 }; // 계절별 바람 세기 (겨울에 강하고 여름에 약함 — 태양광과 반대)

// 바람은 밤에 세고 한낮에 약함 (태양광과 반대). 계절도 반대(태양광은 여름, 풍력은 겨울)라 둘을 섞어야 하루와 한 해가 고르게 채워짐
function windDayFactor(h) { return (h >= 20 || h <= 5) ? 1.4 : (h >= 10 && h <= 15) ? 0.5 : 1.0; }

function seasonOf(month) {
  if (month >= 6 && month <= 8) return 'summer';
  if (month === 12 || month <= 2) return 'winter';
  return 'mid';
}

// ------------------------------------------------------------
// 이번 달 날씨: 계절 + 일조 + 바람 + 기온
// ------------------------------------------------------------
function makeWeather(month) {
  const season = seasonOf(month);
  const temp = Math.round(MONTH_TEMP[month] + rand(-4, 4));   // 그달 평년 기온 ± 4℃

  // 일조: 맑음 / 구름 조금 / 흐림 / 비 (여름 장마철은 비가 잦음)
  const rainy = season === 'summer' && (month === 6 || month === 7);
  const skyRoll = Math.random();
  let sky, solarFactor;
  if (skyRoll < (rainy ? 0.2 : 0.35))      { sky = '맑음';      solarFactor = rand(1.0, 1.1); }
  else if (skyRoll < (rainy ? 0.45 : 0.7)) { sky = '구름 조금'; solarFactor = rand(0.8, 0.95); }
  else if (skyRoll < (rainy ? 0.7 : 0.9))  { sky = '흐림';      solarFactor = rand(0.55, 0.7); }
  else                                     { sky = '비';        solarFactor = rand(0.35, 0.5); }

  // 바람: 약함 / 보통 / 강함 / 폭풍 (폭풍이면 강풍 시간대에 풍력을 안전 정지)
  const windRoll = Math.random();
  let wind, windFactor, storm = false;
  if (windRoll < 0.35)      { wind = '바람 약함'; windFactor = rand(0.12, 0.22); }
  else if (windRoll < 0.75) { wind = '바람 보통'; windFactor = rand(0.25, 0.35); }
  else if (windRoll < 0.93) { wind = '바람 강함'; windFactor = rand(0.38, 0.48); }
  else                      { wind = '폭풍';      windFactor = 0.9; storm = true; }
  if (storm) solarFactor *= 0.5;

  const solarHourly = [];
  const windHourly  = [];
  for (let h = 0; h < 24; h++) {
    const up = DAYLIGHT[season][0], down = DAYLIGHT[season][1];
    const sun = (h >= up && h <= down) ? Math.sin(Math.PI * (h - up) / (down - up)) : 0;
    solarHourly.push(clamp(sun * SOLAR_PEAK[season] * solarFactor, 0, 1));
    if (storm) {
      // 강풍이 몰아치는 시간대(약 40%)는 정지, 나머지는 거의 최대 출력
      windHourly.push(Math.random() < 0.4 ? 0 : clamp(windFactor * rand(0.8, 1.1), 0, 1));
    } else {
      windHourly.push(clamp(windFactor * SEASON_WIND[season] * windDayFactor(h) * rand(0.4, 1.6), 0, 1));
    }
  }

  // 이웃 나라의 여유: 여름·겨울에는 이웃도 피크라 수입 가능량이 줄어듦
  const availRange = season === 'mid' ? ECON.linkAvailMid : ECON.linkAvailPeak;
  const linkAvail = rand(availRange[0], availRange[1]);

  return { season, seasonName: SEASON_NAME[season], solarFactor, windFactor, storm, temp, tempNormal: MONTH_TEMP[month], demandMult: tempDemandMult(month, temp), solarHourly, windHourly, sky, wind, linkAvail };
}

// 가스터빈·복합발전의 외기온 출력 배율 (15℃ 기준, 1℃당 0.6%)
function gtTempFactor(temp) {
  return clamp(1 - ECON.tempCoef * (temp - ECON.isoTemp), 0.8, 1.12);
}

function pickEvent(state) {
  if (Math.random() > 0.35) return null;
  const season = seasonOf(state.month);
  const nuclearBuilding = state.buildings.some((b) => (PLANTS[b.type].kind === 'nuclear' || PLANTS[b.type].kind === 'smr') && b.status === 'building');
  const pool = EVENTS.filter((ev) => {
    if (ev.seasons && !ev.seasons.includes(season)) return false;
    if (ev.requires === 'nuclearBuilding' && !nuclearBuilding) return false;
    if (ev.requires === 'nuclearOnline' && !state.buildings.some((b) => (PLANTS[b.type].kind === 'nuclear' || PLANTS[b.type].kind === 'smr') && b.status === 'online')) return false;
    return true;
  });
  if (pool.length === 0) return null;
  // weight가 낮은 이벤트는 드물게
  const total = pool.reduce((s, ev) => s + (ev.weight || 1), 0);
  let pick = Math.random() * total;
  for (const ev of pool) { pick -= (ev.weight || 1); if (pick <= 0) return ev; }
  return pool[pool.length - 1];
}

function buildDemandCurve(state) {
  const season = seasonOf(state.month);
  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  // 수요 = 인구 × 1인당 수요 × 그달의 배율 × 기온(냉난방) × 사건·효과
  const mult = ((state.event && state.event.demandMult) || 1) * effectsNow(state).demandMult * ((state.weather && state.weather.demandMult) || 1);
  const peak = pop * perCapitaNow(state) * monthPeak(state.month) * mult;
  return DEMAND_SHAPE[season].map((v) => Math.round(v * peak));
}

// ------------------------------------------------------------
// 이웃 나라 수요: 우리와 같은 하루 모양, 최대 수요는 게임 시작 때 우리와 같은 크기에서 출발해 해마다 4%씩 늘어남
// ------------------------------------------------------------
function neighborBasePeak(state) {
  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  return Math.round(pop * ECON.econScaleBase * ECON.perCapitaMW * ECON.neighborDemandRatio);   // 이웃 나라는 우리 시작 규모의 econScaleBase배에서 출발 (예전과 같은 크기)
}
function neighborDemandCurve(state) {
  const season = seasonOf(state.month);
  const peak = (state.neighborPeak || neighborBasePeak(state)) * monthPeak(state.month);
  return DEMAND_SHAPE[season].map((v) => Math.round(v * peak));
}
// 그 시간 이웃 나라가 사 줄 수 있는 양(MW) = 그 시간 이웃 수요 × 수입 비율
function neighborAppetite(state, h) {
  return neighborDemandCurve(state)[h] * ECON.neighborImportShare;
}
// 수출 단가 계절 프리미엄: 이웃이 빠듯한 계절(여유 낮음)일수록 비싸게 사 줌 (여유 60%면 +20%)
function neighborPricePremium(state) {
  return 1 + (1 - (state.weather ? state.weather.linkAvail : 0.9)) * 0.5;
}

// ------------------------------------------------------------
// 설비 여유율과 유도 수요
//  - 여유율 = 실질 공급 능력(조절 가능 설비 + 재생 설비의 평균 출력분) ÷ 이번 달 최대 수요
//  - 여유가 크면(전기가 남아돌면) 산업·인구가 몰려와 수요가 더 빨리 늘고, 모자라면(정전 위험) 유입이 줄어듦
// ------------------------------------------------------------
function supplyDemandRatio(state) {
  const c = fleetCapacities(state);
  // 크래킹 설비는 전기를 쓰는 쪽이므로 공급 능력에 넣지 않음
  // 산업·인구를 끌어오는 것은 "언제든 낼 수 있는" 조절 전원(가스·석탄·원전·SMR)뿐. 태양광·풍력은 수요를 부르지 않음 → 재생을 늘리면 잉여가 생겨 ESS·수출이 쓸모 있음
  const supply = c.gt + c.ccgt + c.coal + c.nuclear + c.smr;
  const peak = Math.max(...state.demandCurve);
  return peak > 0 ? supply / peak : 1;
}
// 이번 달 인구 증가율에 더해지는 유도 증가율 (양수: 유입, 음수: 유출)
function inducedGrowth(state) {
  const r = supplyDemandRatio(state);
  // 경제가 커질수록 유입 상한이 완만해짐 (시작 대비 수요 10배면 상한 1/4): 후반에는 재생을 수요보다 크게 키워 남는 전기를 수출할 수 있게
  // 시간이 갈수록 유입 상한이 내려감(12년 뒤 15%): 후반에는 과잉 건설이 수요를 크게 끌어오지 않음 → 성숙기
  const late = clamp(1 - yearsElapsed(state) / ECON.inducedYears, ECON.inducedLateMin, 1);
  if (r > ECON.inducedReserve) return Math.min(ECON.inducedMax * late / Math.pow(econScale(state), 0.35), (r - ECON.inducedReserve) * ECON.inducedRate);
  if (r < ECON.shortageBelow) return -ECON.popGrowth * ECON.shortageDamp;
  return 0;
}

// ------------------------------------------------------------
// 설비 하나의 손실·유효 용량·수명 상태
// ------------------------------------------------------------
function plantLoss(state, b) {
  const p = PLANTS[b.type];
  if (p.isLink) return 0;
  const d = distToNearestCity(state.cities, b.type, b.col, b.row);
  return Math.min(ECON.lossMax, d * techMods(state).lossPerTile);
}

function plantLifeMonths(type) {
  if (type === 'ess' && typeof state !== 'undefined' && state && state.tech) return techMods(state).essLife * 12;   // ESS 수명은 테크로 늘어남
  if (type === 'coal' && typeof state !== 'undefined' && state && state.tech) return techMods(state).coalLife * 12;   // 석탄 수명은 4단계 개조로 늘어남
  return PLANTS[type].lifeYears * 12;
}

// 노후가 시작되는 시점 (수명 대비 비율). R&D가 높으면 늦춰짐
function agingStartRatio() {
  return (typeof state !== 'undefined' && state && state.rd) ? rdPerks(state).agingStart : ECON.agingStart;
}

// 수명 상태: 'new' | 'aging'(노후) | 'expired'(수명 종료)
function plantAgeStatus(b) {
  const life = plantLifeMonths(b.type);
  if (b.age >= life) return 'expired';
  if (b.age >= life * agingStartRatio()) return 'aging';
  return 'new';
}

// 이번 달 기준 유효 용량 (손실, 해안 보너스, 테크, 외기온, 노후 반영)
function plantEffectiveCapacity(state, b) {
  const p = PLANTS[b.type];
  const st = plantStats(state, b.type);
  const m = techMods(state);
  let cap = st.capacity * (1 - plantLoss(state, b));
  if (p.renewable === 'wind' && b.coastal) cap *= 1 + m.coastalBonus;
  if (p.renewable === 'wind') { if (b.mountain) cap *= 1 + ECON.windMountainBonus; else if (!b.coastal) cap *= 1 - ECON.windPlainPenalty; }   // 산 +30%, 평지(해안·산 아님) −20%
  if (p.kind === 'gt' || p.kind === 'ccgt') cap *= gtTempFactor(state.weather.temp + ((state.event && state.event.tempDelta) || 0));
  if (plantAgeStatus(b) === 'aging') cap *= ECON.agingFactor;
  // 사건 효과: 가뭄(원전 출력 감소), 결함 리콜(기종 출력 감소)
  const fx = effectsNow(state);
  if (p.kind === 'nuclear' && fx.nuclearDerate) cap *= 1 - fx.nuclearDerate;
  if (fx.kindDerate[p.kind]) cap *= 1 - fx.kindDerate[p.kind];
  return cap;
}

// 종류별 가동 중 용량 합계
function fleetCapacities(state) {
  const caps = { solar: 0, wind: 0, nuclear: 0, smr: 0, coal: 0, ccgt: 0, gt: 0, link: 0, ess: 0, essEnergy: 0 };
  const m = techMods(state);
  const stopped = effectsNow(state).outageIds;             // 화재·점검·파업 등으로 멈춘 설비
  for (const b of state.buildings) {
    if (b.status !== 'online') continue;
    if (state.outageId === b.id) continue;                 // 정기검사로 이번 달 정지
    if (stopped.has(b.id)) continue;
    const p = PLANTS[b.type];
    if (p.isStorage) {
      const power = plantStats(state, b.type).capacity;    // ESS는 송전 손실 없이 출력 기준
      caps.ess += power;
      caps.essEnergy += power * m.essHours;
      continue;
    }
    caps[p.kind] += plantEffectiveCapacity(state, b);
  }
  return caps;
}

// 종류별 연료비·탄소 (테크 반영) — 실제 비용 계산용
function kindStats(state) {
  const gt = plantStats(state, 'gasTurbine'), cc = plantStats(state, 'ccgt');
  const coal = plantStats(state, 'coal'), nuc = plantStats(state, 'nuclear'), smr = plantStats(state, 'smr');
  const nukeOp = techMods(state).nukeOpMult;   // 원자력 테크 "사용후핵연료 재활용": 연료비와 변동 운영비가 함께 줆
  return {
    gt:      { fuel: gt.fuelCost,   co2: gt.co2,   varOm: PLANTS.gasTurbine.varOm },
    ccgt:    { fuel: cc.fuelCost,   co2: cc.co2,   varOm: PLANTS.ccgt.varOm },
    coal:    { fuel: coal.fuelCost, co2: coal.co2, varOm: PLANTS.coal.varOm },
    nuclear: { fuel: nuc.fuelCost,  co2: 0,        varOm: PLANTS.nuclear.varOm * nukeOp },
    smr:     { fuel: smr.fuelCost,  co2: 0,        varOm: PLANTS.smr.varOm * nukeOp },
    solar:   { fuel: 0, co2: 0, varOm: PLANTS.solar.varOm },
    wind:    { fuel: 0, co2: 0, varOm: PLANTS.wind.varOm },
  };
}

// 종류별 "표준" 연료비·탄소 (테크 미반영) — 전기값(SMP) 산정용
//  규제기관이 표준 열량단가로 가격을 정하므로, 내 설비의 효율 개선은 가격을 낮추지 않고 순이익이 됨
//  업계 표준은 매년 refCostDecline만큼 좋아짐 → 연구하지 않은 설비는 해마다 상대적으로 뒤처짐
function yearsElapsed(state) {
  return (state.year - (state.startYear || ECON.startYear)) + (state.month - (state.startMonth || ECON.startMonth)) / 12;
}
// 지금의 1인당 최대 수요 (MW/만 명): 전력화로 해마다 perCapitaGrowth만큼 늘어남
function perCapitaNow(state) {
  return ECON.perCapitaMW * Math.pow(1 + ECON.perCapitaGrowth, yearsElapsed(state));
}
// 경제 규모 배율: 시작 대비 최대 수요가 몇 배가 됐나 (인구 × 1인당 수요)
function econScale(state) {
  const h = state.history || [];
  const pop0 = h.length && h[0].pop ? h[0].pop : state.cities.reduce((s, c) => s + c.pop, 0);
  const popNow = state.cities.reduce((s, c) => s + c.pop, 0);
  return Math.max(1, (popNow / Math.max(1, pop0 * ECON.econScaleBase)) * Math.pow(1 + ECON.perCapitaGrowth, yearsElapsed(state)));   // 기준 = 시작 인구의 econScaleBase배
}
// 건설 물가 지수: 경제 규모가 커질수록 땅값·인건비·자재비가 올라 새 설비 건설비와 고정 유지비가 함께 오름 (시작은 1.0)
function costIndex(state) {
  return Math.pow(Math.max(1, econScale(state) / ECON.costIndexFrom), ECON.costIndexPower);
}
// 이 설비에 실제로 든 돈 (지을 때 낸 건설비 + 개조비). 기록이 없는 예전 저장본은 지금 건설비로 대신함
function paidCost(state, b) {
  return b.cost !== undefined ? b.cost : plantStats(state, b.type).capex;
}
// 개조 비용 (건설 물가 반영)
function upgradeCostOf(state, type) {
  return Math.round((PLANTS[type].upgradeCost || 0) * costIndex(state));
}
// 기본 증가율 배수: 연간 곡선 floor + boost·e^(−연차/tau)를 월 증가율로 바꿔 ECON.popGrowth 대비 배수로 돌려줌
//  시작 ×1.7(연 13%) → 8년차 ×0.75(연 5.5%) → 20년차 ×0.36(연 2.6%)
function earlyGrowthMult(state) {
  const y = yearsElapsed(state);
  // 개발 초기 고성장: 나라가 복합발전 1기짜리 작은 규모에서 출발하므로 처음 몇 해는 훨씬 빨리 큼 (startGrowthBoost·e^(−연차/startGrowthTau)를 더함 → 누적 약 2배)
  const annual = ECON.baseGrowthFloor + ECON.baseGrowthBoost * Math.exp(-y / ECON.baseGrowthTau) + ECON.startGrowthBoost * Math.exp(-y / ECON.startGrowthTau);
  return (Math.pow(1 + annual, 1 / 12) - 1) / ECON.popGrowth;
}
// 이번 달 인구 증가율 상한: 초반 4.5%/월에서 growthCapYears에 걸쳐 growthCapLate까지 내려감
function growthCapNow(state) {
  return Math.max(ECON.growthCapLate, ECON.growthCap * (1 - yearsElapsed(state) / ECON.growthCapYears));
}
// 기본 증가율(정책·민심 반영)과, 실제로 적용되는 이번 달 인구 증가율 (기본 + 유도, 상한·국토 포화 반영)
function baseGrowthNow(state) {
  const happyMult = clamp(1 + (state.happiness - ECON.happyGrowthPivot) * ECON.happyGrowthSlope, 0.5, 1.3);
  return ECON.popGrowth * earlyGrowthMult(state) * policyMods(state).popGrowth * happyMult;
}
// 도시가 빽빽해질수록 새로 들어오는 사람이 줄어듦: 전국 평균 밀도가 housingComfort 이하면 그대로, 과밀 기준(densityLimit)이면 housingGrowthMin배
//  → 새 도시를 세워야 인구(전력 수요)가 계속 늘어남. 반대로 수요가 너무 빨리 늘면 도시를 늦게 세워 속도를 늦출 수 있음
function housingGrowthMult(state) {
  const d = housingDensity(state);
  return clamp(1 - (d - ECON.housingComfort) / (ECON.densityLimit - ECON.housingComfort) * (1 - ECON.housingGrowthMin), ECON.housingGrowthMin, 1);
}
function monthlyGrowth(state) {
  return Math.min(growthCapNow(state), baseGrowthNow(state) + inducedGrowth(state)) * housingGrowthMult(state);
}
function refCostFactor(state) {
  return Math.pow(1 - ECON.refCostDecline, yearsElapsed(state));
}
function kindStatsBase(state) {
  const f = state ? refCostFactor(state) : 1;
  return {
    gt:      { fuel: PLANTS.gasTurbine.fuelCost * f, co2: PLANTS.gasTurbine.co2 * f, varOm: PLANTS.gasTurbine.varOm },
    ccgt:    { fuel: PLANTS.ccgt.fuelCost * f,       co2: PLANTS.ccgt.co2 * f,       varOm: PLANTS.ccgt.varOm },
    coal:    { fuel: PLANTS.coal.fuelCost * f,       co2: PLANTS.coal.co2 * f,       varOm: PLANTS.coal.varOm },
  };
}

// 탄소 기준 (t/MWh): 발전량당 탄소가 이 값 이상이면 민심의 "환경" 분야가 0점, 0이면 만점. 처음 carbonRefStart에서 intensityEndYear년 차 carbonRefEnd까지 해마다 내려감
//  (예전에는 "국민의 기대"와 6년 차부터 생기는 "법정 배출 기준"이 따로 있었음 → 하나로 합침)
function carbonRef(state) {
  const t = clamp(yearsElapsed(state) / ECON.intensityEndYear, 0, 1);
  return ECON.carbonRefStart + (ECON.carbonRefEnd - ECON.carbonRefStart) * t;
}
function cleanExpect(state) { return carbonRef(state); }       // (예전 이름: 부르는 곳이 남아 있어 둠)
function intensityTarget(state) { return carbonRef(state); }   // (예전 이름)

// 지난달 실제 배출 원단위 (t/MWh)
function reportIntensity(report) {
  const g = report.energy.gen;
  const gen = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind;
  return gen > 0 ? report.energy.co2 / gen : 0;
}

// 재생에너지 보조금(REC): 시작 후 recYears 동안 서서히 줄어 0이 됨
function recNow(state) {
  const years = yearsElapsed(state);
  return Math.max(0, ECON.rec * (1 - years / ECON.recYears));
}

// ------------------------------------------------------------
// 주민 민심
// ------------------------------------------------------------
function nuisanceOf(state, b) {
  const p = PLANTS[b.type];
  if (p.kind === 'solar') return b.mountain ? ECON.solarMountainNuisance : 0;   // 산지 태양광: 산림 훼손
  const rule = p.nuisance || ECON.nuisance[p.kind];
  if (!rule) return 0;
  const d = distToNearestCity(state.cities, b.type, b.col, b.row);
  const tm = techMods(state);
  const k = p.kind === 'coal' ? tm.coalNuisance : p.kind === 'nuclear' ? tm.nukeNuisance : 1;   // 석탄 테크 "탈황 · 집진 설비": 매연 불만 없음 · 원자력 테크 "사고저항성 연료": 절반
  if (d === 0) return rule.inside * k;
  return d <= rule.range ? rule.per * k : 0;
}

// 민심 요인 보조값
function moodPriceRef(state) { return ECON.moodPriceRef0 - ECON.moodPriceRefDrop * yearsElapsed(state); }   // 국민이 기대하는 전기값
function moodTechExpected(state) { return Math.min(TECH_MAX_TIER, ECON.moodTechPerYear * yearsElapsed(state)); }   // 국민이 기대하는 테크 평균 단계 (10단계 눈금)
// 테크트리별 반영 비율(0~1): 그 테크가 쓰이는 설비의 용량(건설 중 포함)이 최대 수요의 moodTechFullShare 이상이면 1(주력), 전혀 없으면 0. 계통 테크는 항상 1
function techWeights(state) {
  const peak = Math.max(1, Math.max.apply(null, state.demandCurve || [1]));
  const cap = { ccgt: 0, coal: 0, nuclear: 0, solar: 0, wind: 0 };
  const treeOf = { gt: 'ccgt', ccgt: 'ccgt', coal: 'coal', nuclear: 'nuclear', solar: 'solar', wind: 'wind' };
  for (const b of state.buildings || []) {
    if (b.status === 'retired' || b.status === 'demolishing') continue;
    const k = treeOf[PLANTS[b.type].kind];
    if (k) cap[k] += plantStats(state, b.type).capacity || 0;
  }
  const w = { grid: 1 };
  for (const k in cap) w[k] = clamp(cap[k] / peak / ECON.moodTechFullShare, 0, 1);
  return w;
}
// 노선별 테크트리 (에너지 정책 → 트리). 노선마다 총 20 · 20 · 15단계
const TECH_LINE = { thermal: ['ccgt', 'coal'], renew: ['solar', 'wind'], nuclear: ['nuclear'] };
function techLineOf(state) { const e = state.policies && state.policies.energy; return TECH_LINE[e] ? e : null; }
// 내 노선의 테크 진행도 (10단계 눈금): 노선 트리들의 평균. 그 설비를 실제로 쓰는 만큼만 셈
//  → 트리가 둘인 노선(화력 · 재생에너지)은 두 설비를 모두 지어야 끝까지 참 (한쪽만 쓰면 절반). 15단계인 원자력은 10단계 눈금으로 환산
function techLineProgress(state, line) {
  const w = techWeights(state), keys = TECH_LINE[line];
  return keys.reduce((a, k) => a + techNorm(state, k) * (w[k] || 0), 0) / keys.length;
}
// 연구 수준 (10단계 눈금): 민심의 "연구" 요인이 보는 값
//  - 에너지 정책으로 노선을 골랐으면: 내 노선 테크 2 : 계통 테크 1
//  - 중립이거나 아직 정하지 않았으면: 지금 쓰는 설비들의 테크 평균 (설비 비중으로 가중)
function techWeightedTiers(state) {
  const line = techLineOf(state);
  if (line) return (2 * techLineProgress(state, line) + techNorm(state, 'grid')) / 3;
  const w = techWeights(state); let num = 0, den = 0;
  for (const k of TECH_ORDER) { num += techNorm(state, k) * (w[k] || 0); den += (w[k] || 0); }
  return den > 0 ? num / den : 0;
}
function tariffNow(state) { return ECON.tariff[String(state.tariff || 0)] || ECON.tariff['0']; }
function recentHappyAvg(state, months) {
  const h = (state.history || []).slice(-months);
  return h.length ? h.reduce((s, x) => s + (x.happyEnd !== undefined ? x.happyEnd : x.happy), 0) / h.length : state.happiness;
}

// 사건·목표가 민심을 한 번에 올리거나 내릴 때 쓰는 함수: 지금 민심을 바로 움직이고, 같은 크기의 "여론"으로 남아 매달 조금씩 옅어짐
//  (민심은 매달 예상 민심 쪽으로 빠르게 끌려가므로, 여론으로 남기지 않으면 한두 달 만에 효과가 사라짐)
function moodBump(state, v) {
  if (!v) return;
  if (!state.mood) state.mood = { powerLoss: 0 };
  state.happiness = clamp(state.happiness + v, 0, 100);
  state.mood.buzz = clamp((state.mood.buzz || 0) + v, -ECON.moodBuzzCap, ECON.moodBuzzCap);
}
// 설비 여유: 언제든 낼 수 있는 조절 설비(복합발전·석탄·원전)가 "한 해 중 수요가 가장 큰 달"의 최대 수요의 몇 배인가
//  (그달의 수요로 재면 봄가을마다 남아도는 것처럼 보이므로, 설비를 맞춰 지어야 하는 1월 기준으로 잼. 날씨·사건·정지는 빼고 평소 용량으로)
function reserveYear(state) {
  let firm = 0;
  for (const b of state.buildings) {
    if (b.status !== 'online') continue;
    const p = PLANTS[b.type];
    if (!p.dispatchable || p.isStorage || p.isLink) continue;
    firm += plantStats(state, b.type).capacity * (1 - plantLoss(state, b)) * (plantAgeStatus(b) === 'aging' ? ECON.agingFactor : 1);
  }
  const peak = state.cities.reduce((a, c) => a + c.pop, 0) * perCapitaNow(state) * WORST_PEAK_MULT;
  return peak > 0 ? firm / peak : 1;
}
// 설비 과잉 부담 (원/kWh): 설비 여유가 reserveFree배를 넘으면, 남아도는 설비의 유지비가 요금에 얹힘
function reserveSurcharge(state) { return Math.max(0, reserveYear(state) - ECON.reserveFree) * ECON.reserveWonPer; }
// 전국 평균 인구 밀도 (만 명/칸). 산 칸은 반 칸으로 침
function housingDensity(state, extraTiles, extraPop) {
  const tiles = state.cities.reduce((a, c) => a + cityEffTiles(c), 0) + (extraTiles || 0);
  return tiles > 0 ? (state.cities.reduce((a, c) => a + c.pop, 0) + (extraPop || 0)) / tiles : 0;
}
// 주거 여유 점수 (0~moodHousingMax): 평균 밀도가 housingComfort 이하면 만점, 과밀 기준(densityLimit)이면 0점
function housingScore(density) {
  return ECON.moodHousingMax * clamp((ECON.densityLimit - density) / (ECON.densityLimit - ECON.housingComfort), 0, 1);
}

// ------------------------------------------------------------
// 이번 달 민심: 다섯 분야 × 20점 성적표
//  pillars: 분야별 점수(0~20)와 그 내역(parts). 예상 민심 = 다섯 분야의 합 + 여론 (− 원전 사고의 상처)
//  민심은 예상 민심 쪽으로 매달 차이의 moodPull만큼 움직임
//  한 달에 한 번만 호출됨 (정전으로 깎인 점수 state.mood.powerLoss와 여론 state.mood.buzz를 갱신함)
// ------------------------------------------------------------
function startCityCount(state) { return (state && state.startCities) || 3; }   // 시작할 때 있던 도시 수 (예전 저장본은 3곳)
const MOOD_PILLARS = [
  { key: 'power',  name: '전력 공급',   icon: '⚡' },
  { key: 'price',  name: '전기 요금',   icon: '💡' },
  { key: 'env',    name: '환경',        icon: '🌿' },
  { key: 'city',   name: '도시·생활',   icon: '🏙' },
  { key: 'future', name: '미래·신뢰',   icon: '🔬' },
];
function happinessChange(state, report) {
  const P = ECON.moodPillarMax;
  const r1 = (v) => Math.round(v * 10) / 10;
  const pm = policyMods(state);
  if (!state.mood) state.mood = { powerLoss: 0 };
  const pillars = [];
  const part = (key, label, value) => ({ key, label, value: r1(value) });
  const pillar = (key, parts) => {
    const def = MOOD_PILLARS.find((x) => x.key === key);
    const list = parts.filter((p) => p && (Math.abs(p.value) >= 0.05 || p.keep));
    pillars.push({ key, name: def.name, icon: def.icon, max: P, score: r1(clamp(list.reduce((s, p) => s + p.value, 0), 0, P)), parts: list });
  };
  let priceInfo = null;   // 이번 달 체감 요금과 기대 요금 (기록·공약 판정용)

  // ① 전력 공급: 정전이 없으면 만점.
  //    정전이 난 달: 전기가 끊긴 1시간대마다 −moodPowerPerHour (주파수 사고가 낀 시간대는 1.5배). 0점 밑으로는 쌓이지 않음
  //    정전이 없는 달: 깎였던 점수가 moodPowerRecover씩 돌아옴 → 아무리 크게 났어도 넉 달 동안 정전이 없으면 만점
  {
    const perH = ECON.moodPowerPerHour, rec = ECON.moodPowerRecover;
    const prev = clamp(state.mood.powerLoss !== undefined ? state.mood.powerLoss : (state.mood.outage || 0) * perH, 0, P);   // 예전 저장분(정전 기억)은 점수로 바꿔 이어감
    const hitH = report.blackoutHours + 0.5 * report.freqHours;
    const carried = r1(hitH > 0 ? prev : Math.max(0, prev - rec));   // 지난 정전의 여파: 정전이 없는 달에만 회복
    const nowPts = r1(Math.min(P - carried, hitH * perH));           // 이번 달 정전으로 새로 깎인 점수
    state.mood.powerLoss = carried + nowPts;
    if (carried + nowPts < 0.05) { const p = part('reliab', '정전 없는 안정적인 전력 공급', P); p.keep = true; pillar('power', [p]); }
    else {
      const parts = [part('pfull', '정전이 없을 때의 점수', P)];
      if (hitH > 0) {
        const p = part('pnow', '이번 달 정전 ' + report.blackoutHours + '시간대 (1시간대마다 −' + perH + '점' + (report.freqHours ? ' · 주파수 사고 ' + report.freqHours + '시간대는 1.5배' : '') + (nowPts < hitH * perH - 0.05 ? ' · 0점 밑으로는 안 내려감' : '') + ')', -nowPts);
        p.keep = true; parts.push(p);
      }
      if (carried > 0) parts.push(part('pafter', '지난 정전의 여파 (정전이 없는 달마다 ' + rec + '점씩 회복)', -carried));
      pillar('power', parts);
    }
  }

  // ② 전기 요금: 국민이 실제로 내는 요금(체감 요금)을 기대 요금(해마다 내려감)과 비교. 같으면 절반, 1원 쌀 때마다 +moodPriceSlope
  //    체감 요금 = 발전소에 정산해 준 평균 단가 (가스만 쓰면 도매가, 원전·석탄·재생 비중이 클수록 쌈)
  //             + 남는 전기 처리비 (줄일 수 없는 원전·석탄 출력이 배터리·수출로도 못 받아낼 만큼 남은 것: 그달 수요의 10%면 +30원)
  //             + 설비 과잉 부담 (조절 설비가 한 해 최대 수요의 reserveFree배를 넘는 만큼: 넘는 10%p마다 +10원)
  //             ± 전기요금 조정(지원·할증)
  {
    const normal = report.hours.filter((h) => h.unmet <= 0);
    const overShare = report.energy && report.energy.demand > 0 ? (report.energy.over || 0) / report.energy.demand : 0;
    if (normal.length > 0) {
      const avgSmp = normal.reduce((s, h) => s + h.smp, 0) / normal.length;   // 실제 도매가 평균 (표시용)
      const ref = moodPriceRef(state);
      const smpPay = normal.reduce((s, h) => s + (h.over > 0 ? Math.max(h.smp, ref) : h.smp), 0) / normal.length;   // 전기가 남는 시간은 헐값으로 쳐 주지 않음
      const tfp = tariffNow(state);
      const overWon = overShare * ECON.overPriceWon, rsvWon = reserveSurcharge(state);
      const pay = smpPay * ((report.payRatio !== undefined && isFinite(report.payRatio) && report.payRatio > 0) ? report.payRatio : 1) + overWon + rsvWon;
      const felt = pay * (1 + tfp.rate);   // 국민이 실제로 내는 요금
      const v = clamp(P / 2 + (ref - felt) * ECON.moodPriceSlope, 0, P);
      priceInfo = { felt, ref, pay, smp: avgSmp, over: overWon, reserve: rsvWon };
      const p = part('price', (felt <= ref ? '저렴한 전기 요금' : '전기 요금 부담') + ' (소비자 요금 ' + fmt(felt) + '원 · 기대 ' + fmt(ref) + '원' + (tfp.rate ? ' · ' + (tfp.rate < 0 ? '지원' : '할증') + ' 반영' : '') +
        (rsvWon >= 0.5 ? ' · 설비 과잉 부담 +' + fmt(rsvWon) + '원' : '') + (overWon >= 0.5 ? ' · 남는 전기 처리비 +' + fmt(overWon) + '원' : '') + ')', v);
      p.keep = true; pillar('price', [p]);
    } else { const p = part('price', '하루 종일 정전이라 요금을 따질 수 없음', 0); p.keep = true; pillar('price', [p]); }
  }

  // ③ 환경: 발전량당 탄소(원단위)가 0이면 만점, 탄소 기준(해마다 내려감) 이상이면 0점
  {
    const inten = reportIntensity(report), ref = carbonRef(state);
    const v = clamp(P * (1 - inten / ref), 0, P);
    const p = part('clean', (inten < ref ? '탄소 배출 ' : '탄소 기준 초과 ') + inten.toFixed(2) + ' t/MWh (기준 ' + ref.toFixed(2) + ' · 0에 가까울수록 만점)', v);
    p.keep = true; pillar('env', [p]);
  }

  // ④ 도시·생활 = 일자리 + 전력 수출 + 주거 여유 − 주민 불만
  {
    const parts = [];
    // 일자리: 최근 1년 인구 증가율을 그해의 기본 증가율과 비교 (같으면 절반, 2배면 만점, 0이면 0점). 첫 해는 절반
    const hist = state.history || [];
    const mid = ECON.moodJobsMax / 2;
    if (hist.length >= 12 && hist[hist.length - 12].pop) {
      const popNow = state.cities.reduce((s, c) => s + c.pop, 0);
      const g = popNow / hist[hist.length - 12].pop - 1;
      const baseAnnual = ECON.baseGrowthFloor + ECON.baseGrowthBoost * Math.exp(-yearsElapsed(state) / ECON.baseGrowthTau) + ECON.startGrowthBoost * Math.exp(-yearsElapsed(state) / ECON.startGrowthTau);   // 개발 초기 고성장분도 기준에 넣음
      const v = clamp(mid + (g - baseAnnual) / Math.max(0.03, baseAnnual) * mid, 0, ECON.moodJobsMax);
      const p = part('economy', (v >= mid ? '일자리 증가' : '일자리 부족') + ' (인구 연 ' + (g >= 0 ? '+' : '') + fmt(g * 100, 1) + '% · 기준 ' + fmt(baseAnnual * 100, 1) + '%)', v); p.keep = true; parts.push(p);
    } else { const p = part('economy', '일자리 (1년 기록이 쌓이면 인구 증가율로 평가)', mid); p.keep = true; parts.push(p); }
    // 전력 수출: 남는 전기를 이웃 나라에 팔면 외화가 들어옴. 수출량이 그달 수요의 1%일 때마다 +moodExportPer
    const es = report.energy && report.energy.demand > 0 ? (report.energy.exp || 0) / report.energy.demand : 0;
    if (es > 0.001) parts.push(part('export', '전력 수출 (수요의 ' + fmt(es * 100, 1) + '%를 이웃 나라에 판매)', Math.min(ECON.moodExportMax, es * 100 * ECON.moodExportPer)));
    // 주거 여유: 전국 평균 인구 밀도. 인구가 늘수록 빽빽해지므로 새 도시를 세워야 유지됨
    {
      const d = housingDensity(state), v = housingScore(d);
      const extra = Math.max(0, state.cities.length - startCityCount(state));
      const p = part('housing', (v >= ECON.moodHousingMax - 0.05 ? '여유로운 도시' : v > 0 ? '빽빽해지는 도시' : '도시 과밀') + ' (평균 ' + fmt(d, 2) + '만 명/칸 · ' + fmt(ECON.housingComfort, 1) + ' 이하면 만점 · 도시 ' + state.cities.length + '곳' + (extra ? ', 새 도시 ' + extra + '곳' : '') + ')', v);
      p.keep = true; parts.push(p);
    }
    // 주민 불만: 도시 안·근처의 기피 시설
    const byKind = {};
    for (const b of state.buildings) {
      if (b.status === 'demolishing') continue;
      const n = nuisanceOf(state, b);
      if (n > 0) { const kind = PLANTS[b.type].kind; byKind[kind] = (byKind[kind] || 0) + n; }
    }
    const KIND_LABEL = { nuclear: ['도시 근처 원전', 8], wind: ['도시 근처 풍력 소음', 4], coal: ['도시 근처 석탄 매연', 6], solar: ['산지 태양광 (산림 훼손)', 3] };
    for (const kind in byKind) {
      const def = KIND_LABEL[kind]; if (!def) continue;
      parts.push(part('nuisance:' + kind, def[0], -Math.min(def[1], byKind[kind] * ECON.moodNuisanceMult)));
    }
    // 원전 밀집 불안: 원전이 많아질수록 사고 걱정이 커짐 (친원전 노선이면 절반)
    const alive = (b) => b.status !== 'demolishing' && b.status !== 'retired';
    const bigN = state.buildings.filter((b) => b.type === 'nuclear' && alive(b)).length;
    const smrN = state.buildings.filter((b) => b.type === 'smr' && alive(b)).length;
    const anx = (Math.max(0, bigN - ECON.moodNukeFree) * ECON.moodNukePer + Math.max(0, smrN - ECON.moodSmrFree) * ECON.moodSmrPer) * (state.policies && state.policies.energy === 'nuclear' ? 0.5 : 1) * techMods(state).nukeAnxMult;   // 원자력 테크 "피동 안전 계통": 절반
    if (anx > 0) parts.push(part('nukes', '원전 밀집 불안 (원전 ' + bigN + '기' + (smrN ? ' · SMR ' + smrN + '기' : '') + ')', -Math.min(ECON.moodNukeCap, anx)));
    // 국토 잠식: 땅 위의 태양광·풍력이 국토를 많이 차지하면 경관·농지 훼손 불만 (재생에너지 중심 노선이면 절반). 바다 위 풍력은 세지 않음
    {
      let landTiles = 0, used = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const t = state.grid[r][c]; if (t === LAND || t === MOUNTAIN) landTiles++; }
      for (const b of state.buildings) {
        const p = PLANTS[b.type];
        if (!p.renewable || !alive(b)) continue;
        if (state.grid[b.row] && state.grid[b.row][b.col] === SEA) continue;
        used += p.width * p.height;
      }
      const pct = landTiles > 0 ? used / landTiles * 100 : 0;
      const v = Math.min(ECON.moodLandCap, Math.max(0, pct - ECON.moodLandFree) * ECON.moodLandPerPct) * (state.policies && state.policies.energy === 'renew' ? 0.5 : 1);
      if (v > 0) parts.push(part('land', '국토 잠식 (태양광·풍력이 땅의 ' + fmt(pct, 1) + '% 차지)', -v));
    }
    pillar('city', parts);
  }

  // ⑤ 미래·신뢰 = 연구 + 국정 신뢰(기본 + 정책 노선 + 공약)
  {
    const parts = [];
    // 연구: 내 노선 테크 + 계통 테크(중립이면 지금 쓰는 설비들의 테크 평균)를 국민의 기대(해마다 오름)와 비교
    const tiers = techWeightedTiers(state), expTech = moodTechExpected(state);
    const tv = clamp(ECON.moodResearchMid + (tiers - expTech) * ECON.moodTechSlope, 0, ECON.moodResearchMax);
    { const p = part('tech', (tiers >= expTech ? '앞선 연구' : '뒤처진 연구') + ' (' + (techLineOf(state) ? '내 노선 + 계통 테크 ' : '주력 테크 평균 ') + fmt(tiers, 1) + '단계 · 기대 ' + fmt(expTech, 1) + '단계)', tv); p.keep = true; parts.push(p); }
    { const p = part('trust', '국정 신뢰 (기본)', ECON.moodTrustBase); p.keep = true; parts.push(p); }
    // 정책 노선: 노선이 유지되는 동안 계속 작용
    for (const key in (state.policies || {})) {
      const def = (typeof POLICIES !== 'undefined') ? POLICIES[key] : null;
      const opt = def && def.options[state.policies[key]];
      if (opt && opt.happy) parts.push(part('policy:' + key, def.name + ' · ' + opt.label, opt.happy));
    }
    // 정책 공약 · 재선 공약: 점검 · 평가 결과에 따라 +/− (events.js pledgeMoodOf). 노선을 바꾸면 그 공약은 없어짐
    for (const q of state.quests || []) {
      const def = (typeof questById === 'function') ? questById(q.id) : null;
      if (!def || !def.pledge) continue;
      const tname = def.title.replace('재선 공약: ', '').replace('공약: ', '');
      const pv = (typeof pledgeMoodOf === 'function') ? pledgeMoodOf(q, def) : 0;   // 점검형: 마지막 점검 결과 · 달성형: 18년 차 말 평가 등급 · 재선 공약: 지킴/못 지킴
      if (pv) parts.push(part('pledge:' + def.policy, (def.term2 ? '재선 공약 ' : '공약 ') + (pv > 0 ? '이행 · ' : '불이행 · ') + tname, pv));
    }
    // 공약 기대감: 재선 공약을 과감하게 발표하면 한동안 오름 (선거에 도움). 시간이 지나면 사라짐
    for (const q of state.quests || []) {
      const def = (typeof questById === 'function') ? questById(q.id) : null;
      if (!def || !def.term2 || q.status === 'failed') continue;
      const bv = term2BoostNow(state, q, def);
      if (bv > 0) parts.push(part('campaign', '공약 기대감 · ' + def.title.replace('재선 공약: ', '') + ' (' + TERM2_LEVELS[def.lv].name + ')', bv));
    }
    pillar('future', parts);
  }

  // 여론: 사건 선택 · 목표 보상과 벌칙처럼 한 번에 오르내린 민심이 남긴 여운. 매달 moodBuzzDecay배로 옅어짐
  const buzz = r1((state.mood.buzz || 0) * ECON.moodBuzzDecay);
  state.mood.buzz = Math.abs(buzz) < 0.1 ? 0 : (state.mood.buzz || 0) * ECON.moodBuzzDecay;
  const extras = [];
  if (Math.abs(buzz) >= 0.1) extras.push(part('buzz', buzz > 0 ? '좋은 여론 (사건·목표의 여운 · 매달 10%씩 옅어짐)' : '나쁜 여론 (사건·목표의 여운 · 매달 10%씩 옅어짐)', buzz));
  if (state.accidentMood) extras.push(part('accident', '원전 사고의 상처 (임기 끝까지)', -state.accidentMood));

  const sumP = pillars.reduce((s, p) => s + p.score, 0), sumX = extras.reduce((s, p) => s + p.value, 0);
  const target = clamp(sumP + sumX, 0, 100);
  const pull = Math.round((target - state.happiness) * ECON.moodPull * 10) / 10;
  // factors: 예전 화면·도구가 쓰던 낱낱의 목록 (분야 이름을 달아 둠)
  const factors = [];
  for (const pl of pillars) for (const p of pl.parts) factors.push({ key: p.key, label: p.label, value: p.value, pillar: pl.key });
  for (const p of extras) factors.push({ key: p.key, label: p.label, value: p.value, pillar: 'extra' });
  return { pillars, extras, factors, items: [], target: Math.round(target * 10) / 10, pull, total: pull, price: priceInfo };
}
// 지금 상태로 본 분야별 점수 (결산을 기다리지 않고 화면에 보여 줄 때): 마지막 결산의 값
function moodPillarsNow(state) { return (state.mood && state.mood.pillars) || null; }

// ------------------------------------------------------------
// 한 달 시뮬레이션
//  - 시간마다 수요를 채우도록 값싼 순서로 발전기를 돌림 (급전 순위)
//  - 재생e·원전·석탄 최소출력은 "무조건 발전"
//  - 석탄·복합은 한 시간에 올리거나 내릴 수 있는 출력에 한계(램프)가 있음
//  - 하루를 두 번 돌려 첫 번째는 전날 밤 상태를 만드는 데만 쓰고, 두 번째 하루를 기록
// ------------------------------------------------------------
function simulateMonth(state) {
  const D = state.demandCurve;
  const w = state.weather;
  const ev = state.event || {};
  const fx = effectsNow(state);
  const gasMult = state.gasPrice * (ev.gasMult || 1) * fx.gasMult;
  const coalMult = (ev.coalMult || 1) * fx.coalMult;   // 석탄 연료비 배율 (사건·효과)
  const caps = fleetCapacities(state);
  // 가동 중인 태양광 가운데 산에 지은 몫 (그만큼의 발전량에 벌목 탄소가 붙음)
  let solarAll = 0, solarMtn = 0;
  for (const b of state.buildings) if (b.status === 'online' && b.type === 'solar') { solarAll++; if (b.mountain) solarMtn++; }
  const solarMtnShare = solarAll > 0 ? solarMtn / solarAll : 0;
  const ks = kindStats(state);
  const m = techMods(state);

  // 가격 상한: 탄소세가 오르면 함께 올라 발전기가 원가 이하로 팔지 않게 함
  const pm = policyMods(state);
  // 연료비가 오르면 상한도 같이 올라 발전기가 원가 이하로 팔지 않게 함 (대신 전기 요금 부담 → 민심 하락)
  const smpCap = (ECON.smpCap + ECON.smpCapCarbon * Math.max(0, state.carbonTax - ECON.carbonTaxStart) / 1000) * Math.sqrt(Math.max(1, gasMult)) * fx.smpCapMult * pm.smpCap;
  const settle = ECON.baseloadSettle * pm.settle;

  const coalMin = caps.coal * m.coalMinLoad;
  const rampCoal = caps.coal * m.coalRamp;     // 석탄이 한 시간에 바꿀 수 있는 출력
  const rampCC   = caps.ccgt * PLANTS.ccgt.ramp;     // 복합발전
  const hours = [];

  // 한계 발전기의 "표준 원가" = 표준 연료비 + 변동 운영비 + 탄소세 (원/kWh). SMP는 이 값으로 정해짐
  //  표준 원가와 실제 원가를 smpRefWeight 비율로 섞음 (1이면 완전 표준, 0이면 내 원가 그대로)
  const kb = kindStatsBase(state);
  const wRef = ECON.smpRefWeight;
  const blendCost = (kind, fuelMult) => {
    const ref = kb[kind].fuel * fuelMult + kb[kind].varOm + kb[kind].co2 * state.carbonTax / 1000;
    const act = ks[kind].fuel * fuelMult + ks[kind].varOm + ks[kind].co2 * state.carbonTax / 1000;
    return wRef * ref + (1 - wRef) * act;
  };
  const margCost = {
    smr:  PLANTS.smr.fuelCost + PLANTS.smr.varOm,     // SMR은 출력 조절이 되므로 한계 발전기가 될 수 있음
    coal: blendCost('coal', coalMult),
    ccgt: blendCost('ccgt', gasMult),
    gt:   blendCost('gt', gasMult),
  };
  const smrMin = caps.smr * (PLANTS.smr.minLoad || 1);
  const rampSmr = caps.smr * (PLANTS.smr.ramp || 0);   // SMR이 출력 조절이 안 되면 0 (지금은 kind가 nuclear라 caps.smr = 0)
  const recPrice = recNow(state);

  const sum = {
    demand: 0, unmet: 0, rampShort: 0, curtail: 0, over: 0, exp: 0, imp: 0,
    gen: { nuclear: 0, coal: 0, ccgt: 0, gt: 0, solar: 0, wind: 0 },
    energyRev: 0, rec: 0, exportRev: 0, importCost: 0, blackoutCost: 0, tax: 0,
    fuel: 0, carbon: 0, overCost: 0, varOm: 0, co2: 0,
    blackoutHours: 0, freqHours: 0, freqOnlyHours: 0, unmetFreq: 0, smpSum: 0, payNum: 0, payDen: 0, maxRenShare: 0, maxRamp: 0,
  };


  // 전 시간 출력 (램프 계산용). 첫 하루는 준비 운전
  let prevCoal = coalMin, prevCC = 0, prevGas = 0, prevSmr = smrMin;

  // ESS: 저장량(soc)을 시간마다 이어감. 남는 전기를 충전(효율 반영)하고 부족할 때 방전
  const essPower = caps.ess, essCap = caps.essEnergy, essEff = m.essEff;
  let soc = essCap * 0.5;
  sum.essIn = 0; sum.essOut = 0;

  for (let step = 0; step < 48; step++) {
    const h = step % 24;
    const record = step >= 24;
    const demand = D[h];
    let solar = caps.solar * w.solarHourly[h] * (ev.solarMult || 1);
    let wind  = caps.wind * Math.min(1, w.windHourly[h] * (ev.windMult !== undefined ? ev.windMult : 1));
    let nuclear = caps.nuclear;
    let coal = 0, ccgt = 0, gt = 0, smr = 0, exp = 0, imp = 0, curtail = 0, over = 0, unmet = 0, essIn = 0, essOut = 0;
    let marginal = null;
    const load = demand;

    // 계통운영자의 관성 제약: 비관성(태양광+풍력) 비중이 한도를 넘는 만큼은 출력 제한
    const renAllowed = load * m.inertiaLimit;
    let atLimit = false;
    let impPrice = 0, expPrice = 0;
    const appetite = neighborAppetite(state, h) * fx.exportMult;   // 이 시간 이웃 나라가 사 줄 수 있는 양 (MW)
    const expPriceOf = (e) => appetite > 0 ? (ECON.exportPriceMax - (ECON.exportPriceMax - ECON.exportPriceMin) * (e / appetite)) * fx.exportMult * neighborPricePremium(state) : 0;
    if (solar + wind > renAllowed) {
      let cut = solar + wind - renAllowed;
      // 잘릴 재생e를 먼저 ESS에 충전 (계통에 넣지 않으므로 한도에 걸리지 않음)
      const take = Math.min(cut, essPower, Math.max(0, (essCap - soc) / essEff));
      soc += take * essEff; essIn += take; cut -= take;
      // 그다음은 연계선으로 수출: 수출 전력은 국내 계통에 들어가지 않아 관성 한도에 안 걸림 (재생 잉여의 출구)
      if (cut > 0 && caps.link > 0 && !fx.exportBan) {
        const e0 = Math.min(cut, caps.link, appetite);
        if (e0 > 0) { exp += e0; cut -= e0; expPrice = expPriceOf(exp); }
      }
      const scale = renAllowed / (solar + wind);
      solar *= scale; wind *= scale;
      curtail += cut;
      atLimit = true;
    }

    // 램프 한계 안에서 이번 시간에 낼 수 있는 출력 범위
    const coalLo = clamp(prevCoal - rampCoal, coalMin, caps.coal);
    const coalHi = clamp(prevCoal + rampCoal, coalMin, caps.coal);
    const ccLo   = clamp(prevCC - rampCC, 0, caps.ccgt);
    const ccHi   = clamp(prevCC + rampCC, 0, caps.ccgt);
    const smrLo  = clamp(prevSmr - rampSmr, smrMin, caps.smr);
    const smrHi  = clamp(prevSmr + rampSmr, smrMin, caps.smr);

    // 줄일 수 없는 발전 = 재생e + 원전 + 석탄·복합의 램프 하한
    coal = coalLo; ccgt = ccLo; smr = smrLo;
    const fixed = solar + wind + nuclear + smr + coal + ccgt;

    if (fixed >= load) {
      // 전기가 남는 시간: ESS 충전 → 수출 → 재생e 출력 제한 → 그래도 남으면 과잉
      let surplus = fixed - load;
      const take2 = Math.min(surplus, Math.max(0, essPower - essIn), Math.max(0, (essCap - soc) / essEff));
      soc += take2 * essEff; essIn += take2;
      surplus -= take2;
      // 수출은 연계선 용량과 이웃 나라 수요(그 시간) 중 작은 쪽까지 (관성 한도에서 이미 내보낸 양은 뺌). 이웃 수요를 채워 갈수록 단가가 110 → 50원으로 떨어짐
      const e1 = fx.exportBan ? 0 : Math.min(surplus, Math.max(0, caps.link - exp), Math.max(0, appetite - exp));
      exp += e1;
      if (exp > 0) expPrice = expPriceOf(exp);
      surplus -= e1;
      const cut2 = Math.min(surplus, solar + wind);
      if (cut2 > 0) {
        const scale = 1 - cut2 / (solar + wind);
        solar *= scale; wind *= scale;
        curtail += cut2;
      }
      surplus -= cut2;
      over = surplus;
      if (coal > 0 && exp === 0 && cut2 === 0) marginal = margCost.coal;
      else if (smr > 0 && exp === 0 && cut2 === 0) marginal = margCost.smr;
    } else {
      // 전기가 모자란 시간: 싼 순서로, 램프 한계 안에서 투입
      let need = load - fixed;
      // SMR 추가 출력: 원가가 가장 싸므로 석탄보다 먼저
      const smrExtra = Math.min(need, smrHi - smr);
      smr += smrExtra; need -= smrExtra;
      if (smrExtra > 0) marginal = margCost.smr;
      const coalExtra = Math.min(need, coalHi - coal);
      coal += coalExtra; need -= coalExtra;
      if (coal > 0) marginal = margCost.coal;

      // ESS 방전: 저장해 둔 전기로 가스보다 먼저 메움 (가격은 정하지 않는 가격 수용자)
      // 배터리는 관성이 없어, 태양광·풍력과 합쳐 주파수 안정도 한도(그 시간 수요 × 한도)까지만 내보낼 수 있음 → 나머지는 터빈이 도는 발전기(복합발전·석탄·원자력)가 채워야 함
      essOut = essIn > 0 ? 0 : Math.min(need, essPower, soc, Math.max(0, renAllowed - (solar + wind)));   // 같은 시간에 충전과 방전을 동시에 하지 않음
      soc -= essOut; need -= essOut;

      const ccExtra = Math.min(need, ccHi - ccgt);
      ccgt += ccExtra; need -= ccExtra;
      if (ccgt > 0) marginal = margCost.ccgt;

      gt = Math.min(need, caps.gt); need -= gt;
      if (gt > 0) marginal = margCost.gt;


      const linkAvailMW = caps.link * w.linkAvail;
      const impMax = Math.min(linkAvailMW, demand * ECON.importShareLimit);
      imp = Math.min(need, impMax); need -= imp;
      if (imp > 0) impPrice = ECON.importPriceMin + (ECON.importPriceMax - ECON.importPriceMin) * (imp / linkAvailMW);
      unmet = need;
    }


    // 램프 부족: 설비는 충분한데 출력을 제때 못 올려 생긴 미공급
    const fullCap = caps.smr + caps.coal + caps.ccgt + caps.gt;
    const rampShort = (unmet > 0 && (smr + coal + ccgt + gt) < fullCap) ? Math.min(unmet, fullCap - (smr + coal + ccgt + gt)) : 0;

    // 관성 한도에서 낮은 확률로 주파수 사고
    const totalGen = solar + wind + nuclear + smr + coal + ccgt + gt + imp + essOut;
    const renShare = totalGen > 0 ? (solar + wind + essOut + imp) / totalGen : 0;   // 관성 없는 전원: 재생e, ESS 방전, 수입
    let freq = false, shed = 0;
    const shortBefore = unmet > 0;   // 주파수 사고 전에 이미 공급이 모자랐는가
    // 그리드포밍 인버터(계통 테크 4단계)가 있으면 인버터가 관성을 대신하므로 주파수 사고가 나지 않음
    if (record && !m.gridForming && (atLimit || renShare > m.inertiaLimit) && solar + wind > 0 && Math.random() < ECON.freqRiskAtLimit) {
      freq = true;
      shed = demand * ECON.freqLossRatio;
      unmet += shed;
    }

    // 그 시간의 전기값: 출력 제한 중이면 바닥값, 수입이 있으면 수입 단가 이상
    let smp;
    if (curtail > 0) smp = ECON.smpFloor;
    else if (marginal !== null) smp = clamp(marginal * ECON.smpMarkup * pm.smpMarkup, ECON.smpFloor, smpCap);
    else smp = ECON.smpFloor;
    if (imp > 0) smp = Math.max(smp, impPrice);

    const gasNow = ccgt + gt;
    if (record) sum.maxRamp = Math.max(sum.maxRamp, (coal + gasNow) - (prevCoal + prevGas));
    prevCoal = coal; prevCC = ccgt; prevGas = gasNow; prevSmr = smr;
    if (!record) continue;

    const sold = solar + wind + nuclear + smr + coal + ccgt + gt + essOut;
    // 정산조정계수: 기저 전원(원전·SMR·석탄)은 SMP보다 싸게 정산됨 (초과 이윤 환수). 정책에 따라 0.7~0.9
    const baseSold = nuclear + smr + coal;
    // 재생에너지 계통 통합 비용 공제: 그 시간 재생 비중이 높을수록 정산에서 더 빠짐 (비중 50%면 −20%, 100%면 −40%)
    const renSold = solar + wind;
    const renSettle = 1 - ECON.renewIntegration * Math.min(1, demand > 0 ? renSold / demand : 0);
    const energyRev = ((sold - baseSold - renSold) + baseSold * settle + renSold * renSettle) * smp * 1000;
    const rec = (solar + wind) * recPrice * 1000;
    const exportRev = exp * expPrice * 1000;
    const importCost = imp * impPrice * 1000;
    const blackoutCost = unmet * ECON.voll * 1000;
    const fuel = (nuclear * ks.nuclear.fuel + smr * ks.smr.fuel + coal * ks.coal.fuel * coalMult + (ccgt * ks.ccgt.fuel + gt * ks.gt.fuel) * gasMult) * 1000;
    const varOm = (nuclear * ks.nuclear.varOm + smr * ks.smr.varOm + coal * ks.coal.varOm + ccgt * ks.ccgt.varOm + gt * ks.gt.varOm + solar * ks.solar.varOm + wind * ks.wind.varOm + essOut * PLANTS.ess.varOm) * 1000;
    const co2 = coal * ks.coal.co2 + (ccgt * ks.ccgt.co2 + gt * ks.gt.co2) + solar * solarMtnShare * ECON.solarMountainCo2;   // 산지 태양광: 벌목으로 줄어든 탄소 흡수
    const carbon = co2 * state.carbonTax;
    const overCost = over * ECON.overGenCost * 1000;

    hours.push({ demand, solar, wind, nuclear: nuclear + smr, smr, coal, ccgt, gt, imp, exp, curtail, over, unmet, rampShort, smp, freq, shed, renShare, essIn, essOut, soc });

    sum.demand += demand; sum.unmet += unmet; sum.rampShort += rampShort; sum.curtail += curtail; sum.over += over;
    sum.exp += exp; sum.imp += imp; sum.essIn += essIn; sum.essOut += essOut;
    sum.gen.nuclear += nuclear + smr; sum.gen.coal += coal; sum.gen.ccgt += ccgt; sum.gen.gt += gt;
    sum.gen.solar += solar; sum.gen.wind += wind;
    sum.energyRev += energyRev; sum.rec += rec; sum.exportRev += exportRev; sum.importCost += importCost;
    sum.tax += sold * ECON.powerTax * 1000;   // 세수: 국내에 공급한 전기 1kWh당 전력산업기반기금
    sum.blackoutCost += blackoutCost; sum.fuel += fuel; sum.carbon += carbon; sum.overCost += overCost;
    sum.varOm += varOm; sum.co2 += co2;
    if (unmet > 0) sum.blackoutHours++;
    if (freq) { sum.freqHours++; sum.unmetFreq += shed; if (!shortBefore) sum.freqOnlyHours++; }
    sum.smpSum += smp;
    // 소비자 요금 계산용: 그 시간 국내에 공급한 전기에 정산해 준 돈 (기저는 정산조정계수, 재생은 통합 비용 공제로 SMP보다 싸게 정산됨) + 수입 전기값
    //  payDen은 같은 전기를 전부 도매가로 샀을 때의 값 → payNum / payDen = 도매가 대비 소비자 요금 비율 (가스만 쓰면 1)
    if (unmet <= 0) { sum.payNum += energyRev + importCost; sum.payDen += (sold + imp) * smp * 1000; }
    sum.maxRenShare = Math.max(sum.maxRenShare, renShare);
  }

  const days = ECON.daysPerMonth;
  const toEok = (won) => won * days / 1e8;
  const scaleMWh = (v) => v * days;

  const energy = {
    demand: scaleMWh(sum.demand), unmet: scaleMWh(sum.unmet), rampShort: scaleMWh(sum.rampShort), curtail: scaleMWh(sum.curtail),
    over: scaleMWh(sum.over), exp: scaleMWh(sum.exp), imp: scaleMWh(sum.imp), essIn: scaleMWh(sum.essIn), essOut: scaleMWh(sum.essOut),
    unmetFreq: scaleMWh(sum.unmetFreq),   // 미공급 가운데 주파수 사고로 끊긴 몫
    gen: {}, co2: sum.co2 * days,
  };
  for (const k in sum.gen) energy.gen[k] = scaleMWh(sum.gen[k]);

  const perks = rdPerks(state);
  let om = 0, capPay = 0, dispCapForPay = 0;
  for (const b of state.buildings) {
    if (b.status === 'building' || b.status === 'demolishing') continue;
    const p = PLANTS[b.type];
    // 바다 위 풍력은 관리가 어려워 고정 유지비가 offshoreOmMult배
    const offshore = b.type === 'wind' && state.grid[b.row] && state.grid[b.row][b.col] === SEA;
    om += plantStats(state, b.type).capex * p.omRate / 12 * perks.omMult * (offshore ? ECON.offshoreOmMult : 1);
    if (p.dispatchable && b.status === 'online') dispCapForPay += plantStats(state, b.type).capacity;
  }

  // 용량 요금은 필요한 예비력(최대 수요 × capacityReserveCap)까지만 지급. 그 이상 지은 설비는 유지비만 나가는 손해
  capPay = Math.min(dispCapForPay, Math.max(...state.demandCurve) * ECON.capacityReserveCap) * ECON.capacityPayment * pm.capPay;
  const interest = state.money < 0 ? -state.money * ECON.loanRate : 0;
  const salary = rdSalary(state);
  const patent = perks.patent;

  const money = {
    energyRev: toEok(sum.energyRev), rec: toEok(sum.rec), exportRev: toEok(sum.exportRev), capPay, patent, tax: toEok(sum.tax),
    fuel: toEok(sum.fuel), carbon: toEok(sum.carbon), om, varOm: toEok(sum.varOm), importCost: toEok(sum.importCost),
    blackoutCost: toEok(sum.blackoutCost), overCost: toEok(sum.overCost), interest,
    overhead: ECON.overhead, salary,
  };
  // 초과 이윤 환수(요금 규제): 최근 1년 이익이 투자 자본의 clawRoi(연 15%)를 넘으면 넘는 비율만큼 국내 정산 수입을 깎음 (정책별 환수 비율: 자유화 50% · 기본 60% · 규제 70%)
  {
    const invested = state.buildings.filter((b) => b.status !== 'demolishing').reduce((s, b) => s + paidCost(state, b), 0);   // 투자 자본 = 실제로 낸 건설비
    const hist12 = (state.history || []).slice(-12);
    const prof12 = hist12.length ? hist12.reduce((s, x) => s + (x.profit || 0), 0) * (12 / hist12.length) : 0;
    // 이번 달 이익(환수 전)이 허용 이익(투자 자본 × clawRoi ÷ 12)을 넘으면 초과분의 pm.clawMax만큼 환수
    const grossIncome = money.energyRev + money.rec + money.exportRev + money.capPay + money.patent + money.tax;
    const grossExpense = money.fuel + money.varOm + money.carbon + money.om + money.overhead + money.salary + money.importCost + money.blackoutCost + money.overCost + money.interest;
    const allowed = invested * ECON.clawRoi / 12;
    money.roi12 = invested > 0 ? prof12 / invested : 0;
    money.clawback = Math.max(0, grossIncome - grossExpense - allowed) * pm.clawMax;
  }
  // 전기요금 조정: 지원이면 정부 재정에서 나가고(−), 할증이면 더 걷힘(+). 환수 계산과 따로 침
  money.tariff = money.energyRev * tariffNow(state).rate;
  money.income = money.energyRev + money.rec + money.exportRev + money.capPay + money.patent + money.tax + Math.max(0, money.tariff);
  money.expense = money.fuel + money.varOm + money.carbon + money.om + money.overhead + money.salary
                + money.importCost + money.blackoutCost + money.overCost + money.interest + money.clawback + Math.max(0, -money.tariff);
  money.profit = money.income - money.expense;

  return {
    year: state.year, month: state.month,
    hours, energy, money,
    blackoutHours: sum.blackoutHours, freqHours: sum.freqHours,
    freqOnlyHours: sum.freqOnlyHours,   // 공급은 충분했는데 주파수 사고만으로 끊긴 시간대 (blackoutHours에 들어 있음)
    gasMult,   // 이번 달 가스 연료비 배율 (가스값 × 사건 효과) — 민심의 "가스 의존" 요인이 봄
    avgSmp: sum.smpSum / 24, payRatio: sum.payDen > 0 ? sum.payNum / sum.payDen : 1, avgPay: (sum.smpSum / 24) * (sum.payDen > 0 ? sum.payNum / sum.payDen : 1), maxRenShare: sum.maxRenShare, maxRamp: sum.maxRamp,
    gasMult, event: state.event, weather: w,
    tempFactor: gtTempFactor(w.temp + (ev.tempDelta || 0)),
  };
}
