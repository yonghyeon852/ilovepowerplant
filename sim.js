// ============================================================
// 시뮬레이션: 날씨, 수요 곡선, 급전(어느 발전기를 얼마나 돌릴지), 정산, 행복도
// ============================================================

const DEMAND_SHAPE = {
  summer: [0.62, 0.58, 0.55, 0.53, 0.52, 0.54, 0.60, 0.68, 0.76, 0.84, 0.90, 0.94,
           0.95, 0.97, 1.00, 0.99, 0.97, 0.93, 0.88, 0.84, 0.80, 0.76, 0.70, 0.65],
  winter: [0.72, 0.68, 0.65, 0.64, 0.64, 0.67, 0.74, 0.82, 0.90, 0.93, 0.92, 0.90,
           0.88, 0.88, 0.90, 0.92, 0.96, 1.00, 0.98, 0.95, 0.90, 0.86, 0.80, 0.75],
  mid:    [0.62, 0.58, 0.55, 0.54, 0.54, 0.57, 0.64, 0.72, 0.80, 0.86, 0.88, 0.88,
           0.87, 0.88, 0.90, 0.91, 0.92, 0.93, 0.90, 0.86, 0.80, 0.75, 0.70, 0.65],
};
const SEASON_PEAK = { summer: 1.10, winter: 1.12, mid: 0.95 };   // 계절별 최대 수요 배율 (여름·겨울과 봄가을 차이를 완만하게)
const SOLAR_PEAK  = { summer: 0.85, winter: 0.55, mid: 0.75 };
const SEASON_NAME = { summer: '여름', winter: '겨울', mid: '봄·가을' };
const SEASON_TEMP = { summer: 27, winter: 0, mid: 14 };   // 계절 평균 기온 (℃)
const SEASON_WIND = { summer: 0.75, winter: 1.3, mid: 1.0 }; // 계절별 바람 세기 (겨울에 강하고 여름에 약함)

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
  const temp = Math.round(SEASON_TEMP[season] + rand(-4, 4));

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
    const sun = (h >= 6 && h <= 18) ? Math.sin(Math.PI * (h - 6) / 12) : 0;
    solarHourly.push(clamp(sun * SOLAR_PEAK[season] * solarFactor, 0, 1));
    if (storm) {
      // 강풍이 몰아치는 시간대(약 40%)는 정지, 나머지는 거의 최대 출력
      windHourly.push(Math.random() < 0.4 ? 0 : clamp(windFactor * rand(0.8, 1.1), 0, 1));
    } else {
      windHourly.push(clamp(windFactor * SEASON_WIND[season] * rand(0.4, 1.6), 0, 1));
    }
  }

  // 이웃 나라의 여유: 여름·겨울에는 이웃도 피크라 수입 가능량이 줄어듦
  const availRange = season === 'mid' ? ECON.linkAvailMid : ECON.linkAvailPeak;
  const linkAvail = rand(availRange[0], availRange[1]);

  return { season, seasonName: SEASON_NAME[season], solarFactor, windFactor, storm, temp, solarHourly, windHourly, sky, wind, linkAvail };
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
  const mult = ((state.event && state.event.demandMult) || 1) * effectsNow(state).demandMult;
  const peak = pop * perCapitaNow(state) * SEASON_PEAK[season] * mult;
  return DEMAND_SHAPE[season].map((v) => Math.round(v * peak));
}

// ------------------------------------------------------------
// 이웃 나라 수요: 우리와 같은 하루 모양, 최대 수요는 게임 시작 때 우리와 같은 크기에서 출발해 해마다 4%씩 늘어남
// ------------------------------------------------------------
function neighborBasePeak(state) {
  const pop = state.cities.reduce((s, c) => s + c.pop, 0);
  return Math.round(pop * ECON.perCapitaMW * ECON.neighborDemandRatio);
}
function neighborDemandCurve(state) {
  const season = seasonOf(state.month);
  const peak = (state.neighborPeak || neighborBasePeak(state)) * SEASON_PEAK[season];
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
  // 경제가 커질수록 유입 상한이 완만해짐 (시작 대비 수요 10배면 상한 1/4): 후반에는 재생을 수요보다 크게 키워 잉여·수소를 만들 수 있게
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
  const caps = { solar: 0, wind: 0, nuclear: 0, smr: 0, coal: 0, ccgt: 0, gt: 0, link: 0, ess: 0, essEnergy: 0, h2: 0 };
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
  const coal = plantStats(state, 'coal'), nuc = plantStats(state, 'nuclear');
  return {
    gt:      { fuel: gt.fuelCost,   co2: gt.co2,   varOm: PLANTS.gasTurbine.varOm },
    ccgt:    { fuel: cc.fuelCost,   co2: cc.co2,   varOm: PLANTS.ccgt.varOm },
    coal:    { fuel: coal.fuelCost, co2: coal.co2, varOm: PLANTS.coal.varOm },
    nuclear: { fuel: nuc.fuelCost,  co2: 0,        varOm: PLANTS.nuclear.varOm },
    smr:     { fuel: PLANTS.smr.fuelCost, co2: 0,  varOm: PLANTS.smr.varOm },
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
  return Math.max(1, (popNow / Math.max(1, pop0)) * Math.pow(1 + ECON.perCapitaGrowth, yearsElapsed(state)));
}
// 기본 증가율 배수: 연간 곡선 floor + boost·e^(−연차/tau)를 월 증가율로 바꿔 ECON.popGrowth 대비 배수로 돌려줌
//  시작 ×1.7(연 13%) → 8년차 ×0.75(연 5.5%) → 20년차 ×0.36(연 2.6%)
function earlyGrowthMult(state) {
  const y = yearsElapsed(state);
  const annual = ECON.baseGrowthFloor + ECON.baseGrowthBoost * Math.exp(-y / ECON.baseGrowthTau);
  return (Math.pow(1 + annual, 1 / 12) - 1) / ECON.popGrowth;
}
// 이번 달 인구 증가율 상한: 초반 4.5%/월에서 growthCapYears에 걸쳐 growthCapLate까지 내려감
function growthCapNow(state) {
  return Math.max(ECON.growthCapLate, ECON.growthCap * (1 - yearsElapsed(state) / ECON.growthCapYears));
}
// 기본 증가율(정책·행복도 반영)과, 실제로 적용되는 이번 달 인구 증가율 (기본 + 유도, 상한·국토 포화 반영)
function baseGrowthNow(state) {
  const happyMult = clamp(1 + (state.happiness - ECON.happyGrowthPivot) * ECON.happyGrowthSlope, 0.5, 1.3);
  return ECON.popGrowth * earlyGrowthMult(state) * policyMods(state).popGrowth * happyMult;
}
function monthlyGrowth(state) {
  const landFactor = Math.max(0.4, 1 - ECON.landSaturationPerCity * Math.max(0, state.cities.length - ECON.landSaturationFrom));
  return Math.min(growthCapNow(state) * landFactor, baseGrowthNow(state) + inducedGrowth(state));
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

// 이번 달의 탄소 배출 기준 (t/MWh). 시작 연차 전에는 없음(null)
function intensityTarget(state) {
  const y = yearsElapsed(state);
  if (y < ECON.intensityStartYear) return null;
  const t = clamp((y - ECON.intensityStartYear) / (ECON.intensityEndYear - ECON.intensityStartYear), 0, 1);
  return ECON.intensityStart + (ECON.intensityEnd - ECON.intensityStart) * t;
}

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
// 주민 행복도
// ------------------------------------------------------------
function nuisanceOf(state, b) {
  const p = PLANTS[b.type];
  if (p.kind === 'solar') return b.mountain ? ECON.solarMountainNuisance : 0;   // 산지 태양광: 산림 훼손
  const rule = p.nuisance || ECON.nuisance[p.kind];
  if (!rule) return 0;
  const d = distToNearestCity(state.cities, b.type, b.col, b.row);
  if (d === 0) return rule.inside;
  return d <= rule.range ? rule.per : 0;
}

function happinessChange(state, report) {
  const items = [];
  const byKey = {};
  for (const b of state.buildings) {
    if (b.status === 'demolishing') continue;
    const n = nuisanceOf(state, b);
    if (n > 0) {
      const inside = distToNearestCity(state.cities, b.type, b.col, b.row) === 0;
      const key = PLANTS[b.type].kind + (inside ? ':in' : ':near');
      byKey[key] = (byKey[key] || 0) + n;
    }
  }
  const KIND_LABEL = { nuclear: '원전', wind: '풍력', coal: '석탄 매연', solar: '산지 태양광 (산림 훼손)' };
  for (const key in byKey) {
    const [kind, where] = key.split(':');
    if (kind === 'solar') items.push({ key: 'nuisance:solar', label: KIND_LABEL.solar, delta: -Math.min(ECON.solarMountainCap, byKey[key]) });
    else items.push({ key: 'nuisance:' + kind, label: (where === 'in' ? '도시 안 ' : '도시 근처 ') + KIND_LABEL[kind], delta: -byKey[key] });
  }

  // 도시 과밀 (도시별 상한 + 전체 합계 상한)
  let crowdTotal = 0;
  for (const c of state.cities) {
    const density = cityDensity(c);
    if (density > ECON.densityLimit) {
      let steps = Math.min(Math.max(1, ECON.densityCap + policyMods(state).densityCapDelta), Math.ceil((density - ECON.densityLimit) / ECON.densityStep));
      steps = Math.min(steps, ECON.densityTotalCap - crowdTotal);
      if (steps <= 0) continue;
      crowdTotal += steps;
      items.push({ key: 'crowd', label: c.name + ' 과밀 (' + density.toFixed(1) + '만/칸)', delta: -steps });
    }
  }

  // 탄소 배출 기준(원단위) 초과: 시간이 갈수록 기준이 낮아져 전환 압박이 커짐
  const target = intensityTarget(state);
  if (target !== null) {
    const inten = reportIntensity(report);
    if (inten > target) {
      // 도입 초기에는 벌점 상한이 낮고(−1), 3년마다 1씩 올라 최대치에 이름 (유예 기간)
      const yearsIn = yearsElapsed(state) - ECON.intensityStartYear;
      const capNow = Math.min(ECON.intensityCap, 1 + Math.floor(yearsIn / 3));
      const steps = Math.min(capNow, Math.ceil((inten - target) / ECON.intensityStep));
      items.push({ key: 'intensity', label: '배출 기준 초과 (' + inten.toFixed(2) + ' > ' + target.toFixed(2) + ' t/MWh)', delta: -steps });
    }
  }

  // 절대 배출량 기준은 경제 규모(수요 배율)에 맞춰 커짐: 나라가 커졌다고 벌점이 자동으로 늘지 않게
  const co2 = report.energy.co2;
  const co2Scale = econScale(state);
  if (co2 > ECON.co2Threshold * co2Scale) {
    const steps = Math.min(ECON.co2Cap, Math.ceil((co2 - ECON.co2Threshold * co2Scale) / (ECON.co2Step * co2Scale)));
    items.push({ key: 'co2', label: '탄소 배출 과다 (' + fmt(co2) + ' t)', delta: -steps });
  }

  const normal = report.hours.filter((h) => h.unmet <= 0);
  if (normal.length > 0) {
    const avgSmp = normal.reduce((s, h) => s + h.smp, 0) / normal.length;
    if (avgSmp > ECON.smpThreshold) {
      const steps = Math.min(policyMods(state).smpPenaltyCap, Math.ceil((avgSmp - ECON.smpThreshold) / ECON.smpStep));
      items.push({ key: 'smp', label: '전기 요금 부담 (평균 SMP ' + fmt(avgSmp) + '원/kWh)', delta: -steps });
    } else if (avgSmp < ECON.smpCheap) {
      items.push({ key: 'cheap', label: '저렴한 전기 요금 (평균 SMP ' + fmt(avgSmp) + '원/kWh)', delta: 1 });
    }
  }
  if (report.blackoutHours > 0) {
    items.push({ key: 'blackout', label: '정전 ' + report.blackoutHours + '시간대', delta: -Math.min(ECON.happinessBlackoutCap, report.blackoutHours * ECON.happinessBlackout) });
  }
  if (report.freqHours > 0) {
    items.push({ key: 'freq', label: '주파수 사고 ' + report.freqHours + '시간대', delta: -Math.min(ECON.happinessFreqCap, report.freqHours * ECON.happinessFreq) });
  }
  // 이번 달 날씨·환경 사건이 주는 행복도 변화 (예: 미세먼지 −1)
  if (state.event && state.event.happyDelta) items.push({ key: 'event', label: state.event.name, delta: state.event.happyDelta });
  // 높아진 기대치: 행복도가 아주 높으면 국민이 더 많은 걸 바라기 시작함 (95 이상이면 매달 −1). 100은 계속 무언가를 잘해야 유지됨
  if (state.happiness >= ECON.happinessExpectAt) items.push({ key: 'expect', label: '높아진 국민 기대치', delta: -ECON.happinessExpectPenalty });
  // 경기 호황: 최근 1년 인구가 빠르게 늘었고 이번 달 정전이 없으면 일자리 증가로 행복도 +1
  const hist = state.history || [];
  if (hist.length >= 12 && hist[hist.length - 12].pop) {
    const popNow = state.cities.reduce((s, c) => s + c.pop, 0);
    if (popNow / hist[hist.length - 12].pop - 1 >= ECON.boomGrowth && report.blackoutHours === 0) items.push({ key: 'boom', label: '경기 호황 (일자리 증가)', delta: 1 });
  }
  // 배출 기준을 넘긴 달에는 "안정적 공급" 회복 보너스가 없음 (기준을 못 맞추면 여론이 회복되지 않음)
  const exceeding = target !== null && reportIntensity(report) > target;
  const trouble = report.blackoutHours + report.freqHours;
  if (exceeding) { /* 회복 없음 */ }
  // 행복도가 높을수록 국민 기대치도 높아져 회복이 느려짐 (90 이상이면 +1만): 100은 계속 잘해야 유지되는 상태
  else if (trouble === 0) {
    // 회복은 행복도가 낮을수록 큼: 70 미만 +2, 70~89 +1, 90 이상 0 (90대는 성과가 있어야 올라감)
    const rec = state.happiness < ECON.happinessLowBar ? ECON.happinessRecovery : state.happiness < ECON.happinessHighBar ? ECON.happinessRecoveryMid : ECON.happinessRecoveryHigh;
    if (rec > 0) items.push({ key: 'recover', label: '안정적인 전력 공급', delta: rec });
  }
  else if (trouble <= ECON.happinessMinorBlackout && state.happiness < ECON.happinessHighBar) items.push({ key: 'recover', label: '대체로 안정적인 공급', delta: ECON.happinessRecoveryMinor });

  const total = items.reduce((s, it) => s + it.delta, 0);
  return { items, total };
}

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
  const ks = kindStats(state);
  const m = techMods(state);

  // 가격 상한: 탄소세가 오르면 함께 올라 발전기가 원가 이하로 팔지 않게 함
  const pm = policyMods(state);
  // 연료비가 오르면 상한도 같이 올라 발전기가 원가 이하로 팔지 않게 함 (대신 전기 요금 부담 → 행복도 하락)
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
    blackoutHours: 0, freqHours: 0, smpSum: 0, maxRenShare: 0, maxRamp: 0,
    h2Prod: 0, h2Burn: 0, h2Export: 0, h2Gen: 0, h2Fuel: 0, crackLoad: 0,   // 수소 (kg, 발전은 MWh, 연료비는 원)
  };

  // 수소: 암모니아 크래킹 설비가 매시간 일정량의 수소를 만들고(kg), 수소 터빈 테크가 있으면 가스 발전이 그 수소를 먼저 태움. 남는 수소는 즉시 수출 (저장 없음)
  const crackers = state.buildings.filter((b) => b.status === 'online' && PLANTS[b.type].isH2 && state.outageId !== b.id && !fx.outageIds.has(b.id)).length;
  const h2RateHour = crackers * PLANTS.cracker.capacity * ECON.h2KgPerMWh;      // kg/h: 기당 터빈 200MW분의 수소
  const crackLoad = crackers * PLANTS.cracker.elecLoad * m.crackerLoadMult;      // MW: 크래킹에 드는 전력 (유연 부하: 모자라면 먼저 줄임)
  const h2CostPerMWh = m.h2KgPerMWh * ECON.nh3CostPerKgH2 * m.h2FuelMult / 1000;  // 수소로 1MWh 낼 때 암모니아 값 (원/kWh)

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
    const nuclear = caps.nuclear;
    let coal = 0, ccgt = 0, gt = 0, smr = 0, exp = 0, imp = 0, curtail = 0, over = 0, unmet = 0, essIn = 0, essOut = 0;
    let marginal = null;
    let h2Gen = 0, h2BurnHour = 0, h2ExportHour = 0, h2ProdHour = 0, crackServed = 0;
    const load = demand + crackLoad;   // 크래킹 전력을 더한 부하 (모자라면 크래킹부터 줄임)

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
      essOut = essIn > 0 ? 0 : Math.min(need, essPower, soc);   // 같은 시간에 충전과 방전을 동시에 하지 않음
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

    // 크래킹 부하: 전기가 모자라면 크래킹부터 줄임 (그만큼 수소 생산도 줄어듦)
    if (unmet > 0 && crackLoad > 0) { const cutLoad = Math.min(unmet, crackLoad); unmet -= cutLoad; crackServed = crackLoad - cutLoad; } else crackServed = crackLoad;
    h2ProdHour = crackLoad > 0 ? h2RateHour * crackServed / crackLoad : (crackers > 0 ? h2RateHour : 0);
    // 수소 터빈: 크래킹 수소를 가스터빈·복합발전 연료로 (테크에 따라 연료의 30% 또는 100%까지). 남는 수소는 그 시간에 수출
    if (m.h2Blend > 0 && h2ProdHour > 0 && ccgt + gt > 0) {
      h2Gen = Math.min((ccgt + gt) * m.h2Blend, h2ProdHour / m.h2KgPerMWh);
      h2BurnHour = h2Gen * m.h2KgPerMWh;
    }
    h2ExportHour = Math.max(0, h2ProdHour - h2BurnHour);

    // 램프 부족: 설비는 충분한데 출력을 제때 못 올려 생긴 미공급
    const fullCap = caps.smr + caps.coal + caps.ccgt + caps.gt;
    const rampShort = (unmet > 0 && (smr + coal + ccgt + gt) < fullCap) ? Math.min(unmet, fullCap - (smr + coal + ccgt + gt)) : 0;

    // 관성 한도에서 낮은 확률로 주파수 사고
    const totalGen = solar + wind + nuclear + smr + coal + ccgt + gt + imp + essOut;
    const renShare = totalGen > 0 ? (solar + wind + essOut + imp) / totalGen : 0;   // 관성 없는 전원: 재생e, ESS 방전, 수입
    let freq = false;
    // 그리드포밍 인버터(계통 테크 2단계)가 있으면 인버터가 관성을 대신하므로 주파수 사고가 나지 않음
    if (record && !m.gridForming && (atLimit || renShare > m.inertiaLimit) && solar + wind > 0 && Math.random() < ECON.freqRiskAtLimit) {
      freq = true;
      unmet += demand * ECON.freqLossRatio;
    }

    // 수소를 태우는 시간엔 한계 발전기(가스) 원가에 암모니아 값이 섞여 SMP가 오름
    if (marginal !== null && h2Gen > 0 && ccgt + gt > 0 && (marginal === margCost.ccgt || marginal === margCost.gt)) {
      const f = h2Gen / (ccgt + gt);
      marginal = marginal * (1 - f) + (h2CostPerMWh + (marginal === margCost.gt ? ks.gt.varOm : ks.ccgt.varOm)) * f;
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
    // 수소로 대신한 가스 발전 비율: 그만큼 연료비·탄소가 0
    const gasFuelFrac = gasNow > 0 ? 1 - h2Gen / gasNow : 1;

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
    const fuel = (nuclear * ks.nuclear.fuel + smr * ks.smr.fuel + coal * ks.coal.fuel * coalMult + (ccgt * ks.ccgt.fuel + gt * ks.gt.fuel) * gasMult * gasFuelFrac) * 1000;
    const varOm = (nuclear * ks.nuclear.varOm + smr * ks.smr.varOm + coal * ks.coal.varOm + ccgt * ks.ccgt.varOm + gt * ks.gt.varOm + solar * ks.solar.varOm + wind * ks.wind.varOm + essOut * PLANTS.ess.varOm) * 1000;
    const co2 = coal * ks.coal.co2 + (ccgt * ks.ccgt.co2 + gt * ks.gt.co2) * gasFuelFrac;
    const carbon = co2 * state.carbonTax;
    const overCost = over * ECON.overGenCost * 1000;
    const h2Fuel = h2BurnHour * ECON.nh3CostPerKgH2 * m.h2FuelMult;   // 수소로 낸 발전의 연료비 = 암모니아 값 (원)

    hours.push({ demand, solar, wind, nuclear: nuclear + smr, smr, coal, ccgt, gt, imp, exp, curtail, over, unmet, rampShort, smp, freq, renShare, essIn, essOut, soc });

    sum.demand += demand; sum.unmet += unmet; sum.rampShort += rampShort; sum.curtail += curtail; sum.over += over;
    sum.exp += exp; sum.imp += imp; sum.essIn += essIn; sum.essOut += essOut;
    sum.h2Prod += h2ProdHour; sum.h2Burn += h2BurnHour; sum.h2Export += h2ExportHour; sum.h2Gen += h2Gen; sum.h2Fuel += h2Fuel; sum.crackLoad += crackServed;
    sum.gen.nuclear += nuclear + smr; sum.gen.coal += coal; sum.gen.ccgt += ccgt; sum.gen.gt += gt;
    sum.gen.solar += solar; sum.gen.wind += wind;
    sum.energyRev += energyRev; sum.rec += rec; sum.exportRev += exportRev; sum.importCost += importCost;
    sum.tax += sold * ECON.powerTax * 1000;   // 세수: 국내에 공급한 전기 1kWh당 전력산업기반기금
    sum.blackoutCost += blackoutCost; sum.fuel += fuel; sum.carbon += carbon; sum.overCost += overCost;
    sum.varOm += varOm; sum.co2 += co2;
    if (unmet > 0) sum.blackoutHours++;
    if (freq) sum.freqHours++;
    sum.smpSum += smp;
    sum.maxRenShare = Math.max(sum.maxRenShare, renShare);
  }

  const days = ECON.daysPerMonth;
  const toEok = (won) => won * days / 1e8;
  const scaleMWh = (v) => v * days;

  const energy = {
    demand: scaleMWh(sum.demand), unmet: scaleMWh(sum.unmet), rampShort: scaleMWh(sum.rampShort), curtail: scaleMWh(sum.curtail),
    over: scaleMWh(sum.over), exp: scaleMWh(sum.exp), imp: scaleMWh(sum.imp), essIn: scaleMWh(sum.essIn), essOut: scaleMWh(sum.essOut),
    h2: { prod: sum.h2Prod * days, burn: sum.h2Burn * days, export: sum.h2Export * days, gen: scaleMWh(sum.h2Gen), crackers, load: scaleMWh(sum.crackLoad) },   // kg (gen·load는 MWh)
    gen: {}, co2: sum.co2 * days,
  };
  for (const k in sum.gen) energy.gen[k] = scaleMWh(sum.gen[k]);

  const perks = rdPerks(state);
  let om = 0, capPay = 0, dispCapForPay = 0;
  for (const b of state.buildings) {
    if (b.status === 'building' || b.status === 'demolishing') continue;
    const p = PLANTS[b.type];
    om += plantStats(state, b.type).capex * p.omRate / 12 * perks.omMult;
    if (p.dispatchable && b.status === 'online') dispCapForPay += plantStats(state, b.type).capacity;
  }

  // 용량 요금은 필요한 예비력(최대 수요 × capacityReserveCap)까지만 지급. 그 이상 지은 설비는 유지비만 나가는 손해
  capPay = Math.min(dispCapForPay, Math.max(...state.demandCurve) * ECON.capacityReserveCap) * ECON.capacityPayment * pm.capPay;
  const interest = state.money < 0 ? -state.money * ECON.loanRate : 0;
  const salary = rdSalary(state);
  const patent = perks.patent;

  const money = {
    // 남는 수소 수출: 판매가(암모니아 원가 + 작은 마진, 사건·정책 배수 적용)에서 그 수소를 만드는 데 든 암모니아 값을 뺀 순이익
    h2Rev: toEok(sum.h2Export * ECON.nh3CostPerKgH2 * m.h2FuelMult * ((1 + ECON.h2ExportMargin) * effectsNow(state).h2PriceMult * policyMods(state).h2Price - 1)),
    h2Fuel: toEok(sum.h2Fuel),   // 암모니아 연료비
    energyRev: toEok(sum.energyRev), rec: toEok(sum.rec), exportRev: toEok(sum.exportRev), capPay, patent, tax: toEok(sum.tax),
    fuel: toEok(sum.fuel), carbon: toEok(sum.carbon), om, varOm: toEok(sum.varOm), importCost: toEok(sum.importCost),
    blackoutCost: toEok(sum.blackoutCost), overCost: toEok(sum.overCost), interest,
    overhead: ECON.overhead, salary,
  };
  // 초과 이윤 환수(요금 규제): 최근 1년 이익이 투자 자본의 clawRoi(연 15%)를 넘으면 넘는 비율만큼 국내 정산 수입을 깎음 (정책별 환수 비율: 자유화 50% · 기본 60% · 규제 70%)
  {
    const invested = state.buildings.filter((b) => b.status !== 'demolishing').reduce((s, b) => s + plantStats(state, b.type).capex, 0);
    const hist12 = (state.history || []).slice(-12);
    const prof12 = hist12.length ? hist12.reduce((s, x) => s + (x.profit || 0), 0) * (12 / hist12.length) : 0;
    // 이번 달 이익(환수 전)이 허용 이익(투자 자본 × clawRoi ÷ 12)을 넘으면 초과분의 pm.clawMax만큼 환수
    const grossIncome = money.energyRev + money.rec + money.exportRev + money.capPay + money.patent + money.tax + money.h2Rev;
    const grossExpense = money.fuel + money.h2Fuel + money.varOm + money.carbon + money.om + money.overhead + money.salary + money.importCost + money.blackoutCost + money.overCost + money.interest;
    const allowed = invested * ECON.clawRoi / 12;
    money.roi12 = invested > 0 ? prof12 / invested : 0;
    money.clawback = Math.max(0, grossIncome - grossExpense - allowed) * pm.clawMax;
  }
  money.income = money.energyRev + money.rec + money.exportRev + money.capPay + money.patent + money.tax + money.h2Rev;
  money.expense = money.fuel + money.h2Fuel + money.varOm + money.carbon + money.om + money.overhead + money.salary
                + money.importCost + money.blackoutCost + money.overCost + money.interest + money.clawback;
  money.profit = money.income - money.expense;

  return {
    year: state.year, month: state.month,
    hours, energy, money,
    blackoutHours: sum.blackoutHours, freqHours: sum.freqHours,
    avgSmp: sum.smpSum / 24, maxRenShare: sum.maxRenShare, maxRamp: sum.maxRamp,
    gasMult, event: state.event, weather: w,
    tempFactor: gtTempFactor(w.temp + (ev.tempDelta || 0)),
  };
}
