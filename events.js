// ============================================================
// 사건(정책 선택)과 퀘스트(목표)
//  - 위기 일정표: 게임마다 같은 횟수·같은 종류 구성의 위기가 오지만 시점·순서·내용은 무작위 → 난이도는 비슷하되 매번 다르게
//  - 위기: 선택지로 대응. 잘 넘기면(정전 없이) 보너스
//  - 기회: 낮은 확률로 찾아오는 긍정적 제안
//  - 퀘스트: 기한 안에 목표를 이루면 보상, 못 이루면 국민 실망
//  - 지속 효과는 state.effects 목록에 쌓이고 기한이 지나면 사라짐
// ============================================================

// ---------- 지속 효과 ----------
function monthIdxOf(state) { return state.year * 12 + state.month; }

function addEffect(state, eff, months) {
  if (!state.effects) state.effects = [];
  eff.start = monthIdxOf(state);
  eff.until = eff.start + months - 1;
  eff.blackouts = 0;
  state.effects.push(eff);
  return eff;
}

// 지금 유효한 효과를 하나로 합침
function effectsNow(state) {
  const now = monthIdxOf(state);
  const agg = { gasMult: 1, coalMult: 1, techBonus: 0, nuclearDerate: 0, smpCapMult: 1, exportBan: false, exportMult: 1, h2PriceMult: 1, capexMult: 1, demandMult: 1, monthlyCost: 0, outageIds: new Set(), kindDerate: {}, list: [] };
  for (const e of state.effects || []) {
    if (e.until < now) continue;
    if (e.gasMult) agg.gasMult *= e.gasMult;
    if (e.coalMult) agg.coalMult *= e.coalMult;
    if (e.techBonus) agg.techBonus += e.techBonus;
    if (e.nuclearDerate) agg.nuclearDerate = Math.max(agg.nuclearDerate, e.nuclearDerate);
    if (e.smpCapMult) agg.smpCapMult *= e.smpCapMult;
    if (e.exportBan) agg.exportBan = true;
    if (e.exportMult) agg.exportMult *= e.exportMult;
    if (e.h2PriceMult) agg.h2PriceMult *= e.h2PriceMult;
    if (e.capexMult) agg.capexMult *= e.capexMult;
    if (e.demandMult) agg.demandMult *= e.demandMult;
    if (e.monthlyCost) agg.monthlyCost += e.monthlyCost;
    if (e.plantId !== undefined) agg.outageIds.add(e.plantId);
    if (e.kindDerate) agg.kindDerate[e.kindDerate.kind] = Math.max(agg.kindDerate[e.kindDerate.kind] || 0, e.kindDerate.factor);
    agg.list.push({ name: e.name, left: e.until - now + 1, track: e.track });
  }
  return agg;
}

// 결산 뒤: 위기 기간 중 정전이 났는지 기록, 매달 비용 차감
function tickEffects(state, report) {
  const now = monthIdxOf(state);
  for (const e of state.effects || []) {
    if (e.until < now) continue;
    if (report.blackoutHours > 0) e.blackouts = (e.blackouts || 0) + 1;
    if (e.monthlyCost) state.money -= e.monthlyCost;
  }
}

// 달이 바뀔 때: 끝난 효과 정리. "정전 없이 넘기면 보상"이 걸린 위기는 여기서 판정. 알림 문구 목록을 돌려줌
function expireEffects(state) {
  const now = monthIdxOf(state);
  const notices = [];
  const keep = [];
  for (const e of state.effects || []) {
    if (e.until >= now) { keep.push(e); continue; }
    if (e.track === 'olympics') {
      // 준비 기간 끝 → 대회 기간 시작 (수요 +20%, 정전 없이 넘기면 큰 보상)
      keep.push(Object.assign({ name: '올림픽 개최 (수요 +20%)', demandMult: 1.2, track: 'noBlackout', reward: e.reward, start: now, until: now + 5, blackouts: 0 }));
      notices.push('🏟 올림픽 개막! 6개월 동안 수요 +20%. 정전 없이 치르면 ' + rewardParts(e.reward));
    } else if (e.track === 'repay') {
      state.money -= e.principal;
      notices.push('🏦 국채 원금 ' + fmt(e.principal) + '억 상환 (차환 만기)');
    } else if (e.track === 'noBlackout' && e.reward) {
      if (!e.blackouts) {
        if (e.reward.money) state.money += scaleMoney(state, e.reward.money);
        if (e.reward.happy) state.happiness = clamp(state.happiness + e.reward.happy, 0, 100);
        state.crisisWins = (state.crisisWins || 0) + 1;
        notices.push('🏅 ' + e.name + ' 극복: 정전 없이 버텨 국민 신뢰 상승 (' + rewardParts(e.reward) + ')');
      } else notices.push(e.name + ' 종료 (기간 중 정전 ' + e.blackouts + '개월 · 보너스 없음)');
    } else notices.push(e.name + ' 종료');
  }
  state.effects = keep;
  return notices;
}
function rewardParts(r) {
  const parts = [];
  if (r.money) parts.push('+' + fmt(typeof state !== 'undefined' && state ? scaleMoney(state, r.money) : r.money) + '억');
  if (r.happy) parts.push('행복도 +' + r.happy);
  return parts.join(' · ');
}

// ---------- 도우미 ----------
function onlineOf(state, pred) { return state.buildings.filter((b) => b.status === 'online' && pred(PLANTS[b.type], b)); }
const isThermal = (p) => p.kind === 'gt' || p.kind === 'ccgt' || p.kind === 'coal';
const isGas = (p) => p.kind === 'gt' || p.kind === 'ccgt';
const isNuke = (p) => p.kind === 'nuclear';
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function peakDemandOf(state) { return Math.max(...state.demandCurve); }
// 무탄소 설비 용량 (원전·SMR·태양광·풍력, 가동 중)
function cleanCapOf(state) { const c = fleetCapacities(state); return c.nuclear + c.smr + c.solar + c.wind; }
function firmCapOf(state) {
  const c = fleetCapacities(state);
  return c.gt + c.ccgt + c.coal + c.nuclear + c.smr;
}
// 게임 진행 정도에 따라 금액을 키움 (초반 1배 → 20년 차 2.5배)
// 금액 규모 보정: 경제(전력 수요) 규모에 따라 사건 비용·보상이 커짐 (시작 대비 수요 배율^0.75, 1~12배)
function scaleMoney(state, base) { return Math.round(base * Math.min(12, Math.max(1, Math.pow(econScale(state), 0.75))) / 100) * 100; }
const KIND_NAME = { gt: '가스터빈', ccgt: '복합발전', coal: '석탄화력', nuclear: '원전', solar: '태양광', wind: '풍력', ess: 'ESS', link: '연계선', h2: '크래킹 설비' };
function countByKind(state) {
  const c = {};
  for (const b of state.buildings) if (b.status === 'online') { const k = PLANTS[b.type].kind; c[k] = (c[k] || 0) + 1; }
  return c;
}
function biggestKind(state) { const c = countByKind(state); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }
function stopPlant(state, b, name, months) { return addEffect(state, { name, plantId: b.id }, months); }
// 국채 만기 금액: 시점에 따라 커지되 보유 자금의 40%를 넘지 않음 (가난할 때 파산시키지 않도록)
function debtAmount(s) { return Math.max(800, Math.min(scaleMoney(s, 2500), Math.round(Math.max(0, s.money) * 0.4 / 100) * 100)); }

// ============================================================
// 사건 목록
//  cat: economy(경제) · disaster(재해) · politics(정치) · industry(기회)
//  cond(state): 지금 일어날 수 있는지. choices: 정책 선택지. apply(state)는 결과 문구를 돌려줌
//  crisis: true 면 위기 일정표에서 오는 사건, 아니면 낮은 확률의 기회
// ============================================================
const DECISIONS = [
  // ---------- 경제 ----------
  {
    id: 'lng_war', cat: 'economy', crisis: true, icon: '🛢', name: '해외 전쟁으로 LNG 수입가 급등',
    cond: (s) => onlineOf(s, isGas).length > 0,
    desc: '주요 산유국 사이에 전쟁이 터져 LNG 현물 가격이 치솟았습니다. 아무 조치도 없으면 9개월 동안 가스 연료비가 1.8배가 됩니다. 정부가 어떻게 대응할지 정하세요. 위기 기간을 정전 없이 넘기면 국민 신뢰가 오릅니다.',
    choices: [
      { label: '비축 물량 방출 + 장기 계약', cost: (s) => scaleMoney(s, 1200), desc: (s) => '−' + fmt(scaleMoney(s, 1200)) + '억 · 6개월 연료비 ×1.3', apply(s) { const c = scaleMoney(s, 1200); s.money -= c; addEffect(s, { name: 'LNG 위기 (연료비 ×1.3)', gasMult: 1.3, track: 'noBlackout', reward: { money: scaleMoney(s, 600), happy: 4 } }, 6); return '비축 방출·장기 계약 체결 (' + fmt(c) + '억): 6개월 연료비 ×1.3' + giveQuest(s, 'fuel_diversify'); } },
      { label: '시장에 맡긴다', desc: () => '9개월 연료비 ×1.8 · 비용 없음', apply(s) { addEffect(s, { name: 'LNG 위기 (연료비 ×1.8)', gasMult: 1.8, track: 'noBlackout', reward: { money: scaleMoney(s, 800), happy: 5 } }, 9); return '시장 가격 감수: 9개월 연료비 ×1.8' + giveQuest(s, 'fuel_diversify'); } },
      { label: '전기요금 동결', desc: () => '9개월 연료비 ×1.8 + SMP 상한 −25% · 행복도 +4', apply(s) { addEffect(s, { name: 'LNG 위기 + 요금 동결 (연료비 ×1.8, SMP 상한 −25%)', gasMult: 1.8, smpCapMult: 0.75, track: 'noBlackout', reward: { money: scaleMoney(s, 500), happy: 4 } }, 9); s.happiness = clamp(s.happiness + 4, 0, 100); return '요금 동결: 9개월 연료비 ×1.8, SMP 상한 −25%, 행복도 +4' + giveQuest(s, 'fuel_diversify'); } },
    ],
  },
  {
    id: 'debt_call', cat: 'economy', crisis: true, icon: '🏦', name: '전력 부문 국채 만기',
    desc: '전임 정부가 발행한 전력 부문 국채가 만기를 맞았습니다. 지금 갚거나, 이자를 내며 1년 연장할 수 있습니다.',
    choices: [
      { label: '즉시 상환', cost: (s) => debtAmount(s), desc: (s) => '−' + fmt(debtAmount(s)) + '억', apply(s) { const c = debtAmount(s); s.money -= c; return '국채 ' + fmt(c) + '억 상환'; } },
      { label: '1년 차환', desc: (s) => '12개월 동안 매달 이자 ' + fmt(debtAmount(s) * 0.1) + '억 (원금 ' + fmt(debtAmount(s)) + '억은 1년 뒤 자동 상환)', apply(s) { const c = debtAmount(s); addEffect(s, { name: '국채 차환 (매달 이자 ' + fmt(c * 0.1) + '억)', monthlyCost: c * 0.1, principal: c, track: 'repay' }, 12); return '1년 차환: 매달 이자 ' + fmt(c * 0.1) + '억, 1년 뒤 원금 ' + fmt(c) + '억 상환' + giveQuest(s, 'austerity'); } },
    ],
  },
  {
    id: 'tariff', cat: 'politics', crisis: true, icon: '🗳', name: '전기요금 인하 요구 시위',
    desc: '물가 부담에 지친 국민이 거리로 나와 전기요금 인하를 요구합니다. 요금을 내리면 발전 수입이 줄고, 거부하면 지지율이 떨어집니다.',
    choices: [
      { label: '6개월 요금 인하', desc: () => 'SMP 상한 −25% (6개월) · 행복도 +6', apply(s) { addEffect(s, { name: '전기요금 인하 (SMP 상한 −25%)', smpCapMult: 0.75 }, 6); s.happiness = clamp(s.happiness + 6, 0, 100); return '요금 인하: 6개월 SMP 상한 −25%, 행복도 +6' + giveQuest(s, 'cheap_power'); } },
      { label: '취약계층 지원금만 지급', cost: (s) => scaleMoney(s, 700), desc: (s) => '−' + fmt(scaleMoney(s, 700)) + '억 · 행복도 +2', apply(s) { const c = scaleMoney(s, 700); s.money -= c; s.happiness = clamp(s.happiness + 2, 0, 100); return '지원금 ' + fmt(c) + '억 지급, 행복도 +2'; } },
      { label: '거부한다', desc: () => '행복도 −5', apply(s) { s.happiness = clamp(s.happiness - 5, 0, 100); return '요금 인하 거부: 행복도 −5'; } },
    ],
  },
  // ---------- 재해 ----------
  {
    id: 'plant_fire', cat: 'disaster', crisis: true, icon: '🔥', name: '발전소 화재',
    cond: (s) => onlineOf(s, isThermal).length > 0,
    desc: '화력 발전소 한 곳에서 큰불이 났습니다. 인명 피해는 없지만 설비가 멈췄습니다. 복구 방식을 정하세요. 복구 기간을 정전 없이 넘기면 국민 신뢰가 오릅니다.',
    choices: [
      { label: '긴급 복구', cost: (s) => scaleMoney(s, 500), desc: (s) => '−' + fmt(scaleMoney(s, 500)) + '억 · 1개월 정지', apply(s) { const b = pickRandom(onlineOf(s, isThermal)); const c = scaleMoney(s, 500); s.money -= c; const e = stopPlant(s, b, PLANTS[b.type].name + ' 화재 긴급 복구', 1); e.track = 'noBlackout'; e.reward = { happy: 3 }; s.happiness = clamp(s.happiness - 1, 0, 100); return PLANTS[b.type].name + ' 긴급 복구 (' + fmt(c) + '억): 1개월 정지'; } },
      { label: '정상 복구', desc: () => '비용 없음 · 3개월 정지 · 행복도 −2', apply(s) { const b = pickRandom(onlineOf(s, isThermal)); const e = stopPlant(s, b, PLANTS[b.type].name + ' 화재 복구', 3); e.track = 'noBlackout'; e.reward = { money: scaleMoney(s, 400), happy: 3 }; s.happiness = clamp(s.happiness - 2, 0, 100); return PLANTS[b.type].name + ' 화재: 3개월 정지, 행복도 −2'; } },
    ],
  },
  {
    id: 'tsunami', cat: 'disaster', crisis: true, icon: '🌊', name: '지진·해일 경보',
    cond: (s) => onlineOf(s, isNuke).length > 0,
    desc: '앞바다에서 강한 지진이 감지되어 해일 경보가 내려졌습니다. 원전을 예방 정지하고 점검할지, 그대로 운전할지 결정해야 합니다.',
    choices: [
      { label: '예방 정지·점검', cost: (s) => scaleMoney(s, 300), desc: (s) => '원전 1기 1개월 정지 · 점검비 ' + fmt(scaleMoney(s, 300)) + '억', apply(s) { const b = pickRandom(onlineOf(s, isNuke)); const c = scaleMoney(s, 300); s.money -= c; const e = stopPlant(s, b, PLANTS[b.type].name + ' 안전 점검', 1); e.track = 'noBlackout'; e.reward = { happy: 3 }; return PLANTS[b.type].name + ' 예방 정지 1개월, 점검비 ' + fmt(c) + '억'; } },
      { label: '그대로 운전', desc: () => '20% 확률로 사고 (6개월 정지 · 행복도 −15)', apply(s) {
        if (Math.random() < 0.2) { const b = pickRandom(onlineOf(s, isNuke)); stopPlant(s, b, PLANTS[b.type].name + ' 사고 복구', 6); const hit = Math.round(15 * policyMods(s).accidentMult); s.happiness = clamp(s.happiness - hit, 0, 100); return '⚠ 해일로 ' + PLANTS[b.type].name + ' 냉각 계통 손상: 6개월 정지, 행복도 −' + hit; }
        s.happiness = clamp(s.happiness + 1, 0, 100); return '해일은 원전을 비껴갔습니다. 침착한 대응에 행복도 +1';
      } },
    ],
  },
  {
    id: 'drought', cat: 'disaster', crisis: true, icon: '☀', name: '기록적 가뭄', seasons: ['summer'],
    cond: (s) => onlineOf(s, isNuke).length > 0,
    desc: '가뭄으로 냉각수 온도가 올라 원전 출력을 줄여야 합니다. 임시 해수 냉각 설비를 놓으면 출력 손실을 줄일 수 있습니다.',
    choices: [
      { label: '임시 냉각 설비 설치', cost: (s) => scaleMoney(s, 400), desc: (s) => '−' + fmt(scaleMoney(s, 400)) + '억 · 3개월 원전 출력 −10%', apply(s) { const c = scaleMoney(s, 400); s.money -= c; addEffect(s, { name: '가뭄 (원전 출력 −10%)', nuclearDerate: 0.1, track: 'noBlackout', reward: { happy: 3 } }, 3); return '임시 냉각 설비 (' + fmt(c) + '억): 3개월 원전 출력 −10%'; } },
      { label: '출력을 줄인다', desc: () => '3개월 원전 출력 −30%', apply(s) { addEffect(s, { name: '가뭄 (원전 출력 −30%)', nuclearDerate: 0.3, track: 'noBlackout', reward: { money: scaleMoney(s, 400), happy: 3 } }, 3); return '가뭄: 3개월 원전 출력 −30%'; } },
    ],
  },
  {
    id: 'aging_accident', cat: 'disaster', crisis: true, icon: '💥', name: '노후 설비 사고',
    cond: (s) => s.buildings.some((b) => b.status === 'online' && plantAgeStatus(b) === 'aging'),
    desc: '노후 설비에서 큰 사고가 났습니다. 국민 불안이 커졌습니다. 설비를 폐쇄할지, 큰돈을 들여 수명을 연장할지 정하세요.',
    choices: [
      { label: '폐쇄한다', desc: () => '노후 설비 1기 영구 정지 · 행복도 −4', apply(s) { const b = pickRandom(s.buildings.filter((x) => x.status === 'online' && plantAgeStatus(x) === 'aging')); b.status = 'retired'; s.happiness = clamp(s.happiness - 4, 0, 100); return PLANTS[b.type].name + ' 영구 정지 (철거 필요), 행복도 −4' + giveQuest(s, 'safety_audit'); } },
      { label: '대수선으로 수명 연장', desc: (s) => '건설비의 30% · 3개월 정지 · 나이 5년 젊어짐 · 행복도 −6', apply(s) { const b = pickRandom(s.buildings.filter((x) => x.status === 'online' && plantAgeStatus(x) === 'aging')); const c = Math.round(plantStats(s, b.type).capex * 0.3); s.money -= c; b.age = Math.max(0, b.age - 60); stopPlant(s, b, PLANTS[b.type].name + ' 대수선', 3); s.happiness = clamp(s.happiness - 6, 0, 100); return PLANTS[b.type].name + ' 대수선 (' + fmt(c) + '억): 3개월 정지, 수명 5년 연장, 행복도 −6' + giveQuest(s, 'safety_audit'); } },
    ],
  },
  // ---------- 정치 ----------
  {
    id: 'fake_news', cat: 'politics', crisis: true, icon: '📢', name: '전력 요금 폭리 루머 확산',
    desc: '"정부가 전기를 비싸게 팔아 폭리를 취한다"는 루머가 SNS에서 번지고 있습니다. 그대로 두면 지지율이 크게 떨어집니다.',
    choices: [
      { label: '공개 검증·설명회', cost: (s) => scaleMoney(s, 500), desc: (s) => '−' + fmt(scaleMoney(s, 500)) + '억 · 행복도 −2', apply(s) { const c = scaleMoney(s, 500); s.money -= c; s.happiness = clamp(s.happiness - 2, 0, 100); return '공개 검증 (' + fmt(c) + '억): 행복도 −2로 방어' + giveQuest(s, 'cheap_power'); } },
      { label: '요금 환급', cost: (s) => scaleMoney(s, 1200), desc: (s) => '−' + fmt(scaleMoney(s, 1200)) + '억 · 행복도 +3', apply(s) { const c = scaleMoney(s, 1200); s.money -= c; s.happiness = clamp(s.happiness + 3, 0, 100); return '요금 환급 (' + fmt(c) + '억): 행복도 +3'; } },
      { label: '무시한다', desc: () => '행복도 −10', apply(s) { s.happiness = clamp(s.happiness - 10, 0, 100); return '루머 방치: 행복도 −10'; } },
    ],
  },
  {
    id: 'strike', cat: 'politics', crisis: true, icon: '✊', name: '발전 노조 파업 예고',
    cond: (s) => onlineOf(s, isThermal).length >= 2,
    desc: '발전 노조가 임금 인상을 요구하며 파업을 예고했습니다. 요구를 받아들이면 돈이 들고, 강행하면 화력 설비 두 곳이 한 달 멈춥니다.',
    choices: [
      { label: '요구 수용', cost: (s) => scaleMoney(s, 800), desc: (s) => '−' + fmt(scaleMoney(s, 800)) + '억', apply(s) { const c = scaleMoney(s, 800); s.money -= c; return '임금 인상 수용: ' + fmt(c) + '억'; } },
      { label: '강행한다', desc: () => '화력 2기 1개월 정지 · 정전 없이 넘기면 행복도 +3', apply(s) { const list = onlineOf(s, isThermal).slice(); let e = null; for (let i = 0; i < 2 && list.length; i++) { const b = list.splice(Math.floor(Math.random() * list.length), 1)[0]; e = stopPlant(s, b, PLANTS[b.type].name + ' 파업', 1); } if (e) { e.track = 'noBlackout'; e.reward = { happy: 3 }; } return '파업 강행: 화력 2기 1개월 정지'; } },
    ],
  },
  {
    id: 'pact', cat: 'politics', crisis: true, icon: '🌍', name: '국제 탄소 협약 가입 요청', minYear: 4,
    desc: '국제 탄소 협약 가입을 요청받았습니다. 가입하면 탄소세가 즉시 30% 오르지만 3년 동안 무탄소 설비(원전·SMR·태양광·풍력·ESS) 건설비가 20% 싸집니다. 불참하면 3년 동안 전력 수출이 막히고 국제 여론이 나빠집니다.',
    choices: [
      { label: '가입한다', desc: () => '탄소세 +30% · 3년간 무탄소 설비 건설비 −20%', apply(s) { s.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(s.carbonTax * 1.3)); addEffect(s, { name: '탄소 협약 (무탄소 설비 건설비 −20%)', capexMult: 0.8 }, 36); return '탄소 협약 가입: 탄소세 +30%, 3년간 무탄소 건설비 −20%' + giveQuest(s, 'clean_build'); } },
      { label: '불참한다', desc: () => '3년간 수출 금지 · 행복도 −3', apply(s) { addEffect(s, { name: '수출 금지 (협약 불참)', exportBan: true }, 36); s.happiness = clamp(s.happiness - 3, 0, 100); return '협약 불참: 3년간 수출 금지, 행복도 −3'; } },
    ],
  },
  {
    id: 'protest_nuclear', cat: 'politics', crisis: true, icon: '📣', name: '반원전 시위',
    cond: (s) => s.buildings.some((b) => PLANTS[b.type].kind === 'nuclear' && (b.status === 'online' || b.status === 'building')),
    desc: '원전 반대 단체가 대규모 시위를 벌이고 있습니다. 공청회를 열어 설득할지, 강행할지 정하세요.',
    choices: [
      { label: '공청회·안전 설명회', cost: (s) => scaleMoney(s, 600), desc: (s) => '−' + fmt(scaleMoney(s, 600)) + '억 · 행복도 −1', apply(s) { const c = scaleMoney(s, 600); s.money -= c; s.happiness = clamp(s.happiness - 1, 0, 100); return '공청회 개최 (' + fmt(c) + '억): 행복도 −1로 방어'; } },
      { label: '강행한다', desc: () => '행복도 −6 · 건설 중인 원전 3개월 지연', apply(s) { s.happiness = clamp(s.happiness - 6, 0, 100); let n = 0; for (const b of s.buildings) if (PLANTS[b.type].kind === 'nuclear' && b.status === 'building') { b.monthsLeft += 3; n++; } return '강행: 행복도 −6' + (n ? ', 건설 중인 원전 ' + n + '기 3개월 지연' : ''); } },
    ],
  },
  {
    id: 'election', cat: 'politics', crisis: true, icon: '🗳', name: '총선 공약', minYear: 2,
    desc: '총선이 다가옵니다. 여당이 에너지 공약을 내걸어야 합니다. 공약은 지지율을 올리지만, 지키지 못하면 그만큼 잃습니다.',
    choices: [
      { label: '전기요금 안정 공약', desc: () => '행복도 +4 · 1년 안에 SMP 10% 인하 목표', apply(s) { s.happiness = clamp(s.happiness + 4, 0, 100); return '요금 안정 공약: 행복도 +4' + giveQuest(s, 'cheap_power'); } },
      { label: '탈탄소 공약', desc: () => '행복도 +4 · 3년 안에 무탄소 설비 3기 목표', apply(s) { s.happiness = clamp(s.happiness + 4, 0, 100); return '탈탄소 공약: 행복도 +4' + giveQuest(s, 'clean_build'); } },
      { label: '공약 없이 간다', desc: () => '행복도 −2', apply(s) { s.happiness = clamp(s.happiness - 2, 0, 100); return '공약 없음: 행복도 −2'; } },
    ],
  },
  {
    id: 'h2_leak', cat: 'disaster', crisis: true, icon: '💧', name: '암모니아 저장 탱크 누출 경보',
    cond: (s) => onlineOf(s, (p) => p.isH2).length > 0,
    desc: '크래킹 설비의 암모니아 저장 탱크에서 누출이 감지됐습니다. 지금 멈추고 점검할지, 생산을 이어갈지 정하세요. 고효율 촉매 크래킹 테크가 있으면 사고 확률이 낮습니다.',
    choices: [
      { label: '긴급 정지·점검', cost: (s) => scaleMoney(s, 400), desc: (s) => '−' + fmt(scaleMoney(s, 400)) + '억 · 크래킹 1기 2개월 정지', apply(s) { const b = pickRandom(onlineOf(s, (p) => p.isH2)); const c = scaleMoney(s, 400); s.money -= c; stopPlant(s, b, '크래킹 설비 안전 점검', 2); return '긴급 점검 (' + fmt(c) + '억): 크래킹 1기 2개월 정지'; } },
      { label: '생산을 이어간다', desc: (s) => ((s.tech.h2crack || 0) >= 2 ? '10%' : '30%') + ' 확률로 폭발 사고 (설비 영구 정지 · 행복도 −10)', apply(s) {
        const risk = (s.tech.h2crack || 0) >= 2 ? 0.1 : 0.3;
        if (Math.random() < risk) { const b = pickRandom(onlineOf(s, (p) => p.isH2)); b.status = 'retired'; s.happiness = clamp(s.happiness - 10, 0, 100); return '⚠ 암모니아 탱크 폭발: 크래킹 설비 영구 정지, 행복도 −10'; }
        return '누출은 경미했습니다. 별일 없이 지나갔습니다';
      } },
    ],
  },
  // ---------- 기회 (낮은 확률로 랜덤) ----------
  {
    id: 'h2_contract', cat: 'industry', icon: '💧', name: '이웃 나라 수소 장기 구매 계약', minYear: 2,
    cond: (s) => onlineOf(s, (p) => p.isH2).length > 0,
    desc: '이웃 나라가 우리 수소를 3년 동안 비싸게 사겠다고 제안했습니다. 계약하면 수소 수출 단가가 15% 오르지만, 3년 안에 누적 10만 톤을 못 만들면(터빈에 쓴 양도 인정) 위약금을 물어야 합니다.',
    choices: [
      { label: '계약한다', desc: () => '3년 수소 수출 단가 ×1.15 · 목표: 10만 t 생산', apply(s) { addEffect(s, { name: '수소 장기 계약 (수출 단가 ×1.15)', h2PriceMult: 1.15 }, 36); return '수소 장기 계약: 3년 수출 단가 ×1.15' + giveQuest(s, 'h2_contract'); } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '계약을 거절했습니다'; } },
    ],
  },
  {
    id: 'olympics', cat: 'industry', icon: '🏟', name: '올림픽 유치 제안', minYear: 2,
    cond: (s) => !(s.decisionLog || []).some((d) => d.id === 'olympics'),
    desc: '올림픽 유치 기회가 왔습니다. 유치하면 2년 뒤 대회 기간 6개월 동안 전력 수요가 20% 늘어납니다. 그 기간을 정전 없이 넘기면 국가 위상이 크게 오르고 큰 보너스를 받습니다.',
    choices: [
      { label: '유치한다', cost: (s) => scaleMoney(s, 1500), desc: (s) => '−' + fmt(scaleMoney(s, 1500)) + '억 · 2년 뒤 6개월 수요 +20% · 정전 없이 넘기면 +' + fmt(scaleMoney(s, 4000)) + '억, 행복도 +10', apply(s) { const c = scaleMoney(s, 1500); s.money -= c; addEffect(s, { name: '올림픽 준비 (2년 뒤 개최)', track: 'olympics', reward: { money: scaleMoney(s, 4000), happy: 10 } }, 24); return '올림픽 유치 (' + fmt(c) + '억): 2년 뒤 개최. 그때까지 설비를 준비하세요'; } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '올림픽 유치를 거절했습니다'; } },
    ],
  },
  {
    id: 'factory', cat: 'industry', icon: '🏭', name: '대기업 공장 유치 제안', minYear: 1,
    cond: (s) => (s.decisionLog || []).filter((d) => d.id === 'factory').length < 2,   // 한 게임에 최대 2번
    desc: '대기업이 대규모 공장 단지를 세우겠다고 제안했습니다. 유치하면 인구와 전력 수요가 5% 늘고 보조금을 받지만, 설비가 부족하면 정전이 날 수 있습니다.',
    choices: [
      { label: '유치한다', desc: (s) => '수요 +5% · 보조금 +' + fmt(scaleMoney(s, 1500)) + '억', apply(s) { for (const c of s.cities) c.pop *= 1.05; const m = Math.round(scaleMoney(s, 1500) * policyMods(s).subsidyMult); s.money += m; return '공장 단지 유치: 수요 +5%, 보조금 ' + fmt(m) + '억' + giveQuest(s, 'capacity_up'); } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '공장 유치를 거절했습니다'; } },
    ],
  },
  {
    id: 'datacenter', cat: 'industry', icon: '🖥', name: '데이터센터 유치 경쟁', minYear: 3,
    cond: (s) => (s.decisionLog || []).filter((d) => d.id === 'datacenter').length < 2,   // 한 게임에 최대 2번
    desc: '글로벌 IT 기업이 초대형 데이터센터 부지를 찾고 있습니다. 유치하면 큰 보조금이 들어오지만 전력 수요가 즉시 10% 뛰어오릅니다.',
    choices: [
      { label: '유치한다', desc: (s) => '수요 +10% · 보조금 +' + fmt(scaleMoney(s, 3000)) + '억', apply(s) { for (const c of s.cities) c.pop *= 1.10; const m = Math.round(scaleMoney(s, 3000) * policyMods(s).subsidyMult); s.money += m; return '데이터센터 유치: 수요 +10%, 보조금 ' + fmt(m) + '억' + giveQuest(s, 'capacity_up'); } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '데이터센터 유치를 거절했습니다'; } },
    ],
  },
  {
    id: 'scout', cat: 'industry', icon: '🧑‍🔬', name: '해외 연구팀 스카우트', minYear: 2,
    cond: (s) => s.money >= 6000,
    desc: '해외 연구소가 문을 닫으며 중견 연구원 두 명을 한꺼번에 데려올 기회가 생겼습니다. 5,000억 원이 듭니다(정가 8,000억).',
    choices: [
      { label: '영입한다', cost: () => 5000, desc: () => '−5,000억 · 중견 연구원 +2', apply(s) { s.money -= 5000; rdJoined(s); s.rd.sr = (s.rd.sr || 0) + 2; s.rdJoined.sr.push(monthIdxOf(s), monthIdxOf(s)); return '중견 연구원 2명 영입 (5,000억)'; } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '스카우트 제안을 거절했습니다'; } },
    ],
  },
  {
    id: 'export_boom', cat: 'industry', icon: '📈', name: '이웃 나라 전력난', minYear: 2,
    cond: (s) => onlineOf(s, (p) => p.isLink).length > 0,
    desc: '이웃 나라가 전력난을 겪고 있습니다. 6개월 동안 수출 단가가 두 배로 뜁니다. 남는 전기가 있다면 큰 기회입니다.',
    choices: [
      { label: '확인', desc: () => '6개월 수출 단가 ×2', apply(s) { addEffect(s, { name: '이웃 나라 전력난 (수출 단가 ×2)', exportMult: 2 }, 6); return '6개월 동안 수출 단가 ×2'; } },
    ],
  },
  {
    id: 'breakthrough', cat: 'industry', icon: '💡', name: '연구소의 뜻밖의 성과', minYear: 2,
    cond: (s) => rdLevel(s) >= 40,
    desc: '연구소에서 예상 밖의 성과가 나왔습니다. 다음에 시작하는 연구 하나의 성공 확률이 크게 오릅니다.',
    choices: [
      { label: '확인', desc: () => '다음 연구 성공 확률 +25%', apply(s) { s.techBoost = (s.techBoost || 0) + 0.25; return '다음 연구 성공 확률 +25%'; } },
    ],
  },
  {
    id: 'recall', cat: 'industry', icon: '🛠', name: '설비 결함 리콜', minYear: 2,
    cond: (s) => Object.values(countByKind(s)).some((n) => n >= 2),
    desc: '제조사가 한 기종의 결함을 발표했습니다. 지금 수리하면 기당 400억 원이 들고, 방치하면 6개월 동안 그 기종 출력이 25% 떨어집니다.',
    choices: [
      { label: '즉시 수리', desc: () => '기당 400억', apply(s) { const k = biggestKind(s); const n = countByKind(s)[k]; s.money -= 400 * n; return KIND_NAME[k] + ' ' + n + '기 수리: ' + fmt(400 * n) + '억'; } },
      { label: '방치한다', desc: () => '6개월 그 기종 출력 −25%', apply(s) { const k = biggestKind(s); addEffect(s, { name: KIND_NAME[k] + ' 결함 (출력 −25%)', kindDerate: { kind: k, factor: 0.25 } }, 6); return KIND_NAME[k] + ' 결함 방치: 6개월 출력 −25%'; } },
    ],
  },
];

function decisionById(id) { return DECISIONS.find((d) => d.id === id); }

// ---------- 위기 일정표 ----------
//  20년 기준 7번: 경제 2 · 재해 2 · 정치 3 → 순서를 섞고 시점을 흔듦. 임기가 길면 반복
function makeCrisisPlan(state, years) {
  const cats = ['economy', 'disaster', 'politics', 'economy', 'disaster', 'politics', 'politics', 'economy'];
  for (let i = cats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cats[i], cats[j]] = [cats[j], cats[i]]; }
  const plan = [];
  const start = monthIdxOf(state);
  const total = Math.max(years || 20, 10);
  const gap = Math.floor(total * 12 / (cats.length + 1));   // 20년이면 약 30개월 간격
  cats.forEach((cat, i) => { plan.push({ at: start + gap * (i + 1) + Math.floor(Math.random() * 7) - 3, cat, done: false }); });
  // 정책 결정: 1·2·3·4년 차에 하나씩, 그 뒤 6년마다 재검토
  for (const key of Object.keys(POLICIES)) {
    for (let at = start + POLICIES[key].at; at < start + total * 12 - 12; at += POLICY_REVIEW_MONTHS) plan.push({ at, cat: 'policy', id: 'policy_' + key, done: false });
  }
  plan.sort((a, b) => a.at - b.at);
  return plan;
}

// 이번 달 사건 고르기: 일정표의 위기가 있으면 그 종류에서, 아니면 낮은 확률로 기회
function pickDecision(state) {
  const now = monthIdxOf(state);
  const recent = state.decisionLog || [];
  const usable = (d) => {
    if (yearsElapsed(state) < (d.minYear || 0)) return false;
    if (d.seasons && !d.seasons.includes(seasonOf(state.month))) return false;
    if (d.cond && !d.cond(state)) return false;
    const last = recent.filter((r) => r.id === d.id).pop();
    return !(last && now - last.at < (d.crisis ? 36 : 60));   // 같은 위기는 3년, 같은 기회는 5년 안에 반복 안 함
  };
  const plan = state.crisisPlan || [];
  const due = plan.find((p) => !p.done && p.at <= now);
  if (due && due.cat === 'policy') { due.done = true; return decisionById(due.id); }
  if (due) {
    const pm = policyMods(state);
    const w = (d) => d.id === 'protest_nuclear' ? pm.protestWeight : d.id === 'tariff' ? pm.tariffWeight : 1;
    let pool = DECISIONS.filter((d) => d.crisis && d.cat === due.cat && usable(d));
    if (pool.length) {
      // 정책에 따라 특정 위기가 더 잦아짐 (친원전 → 반원전 시위, 시장 자유화 → 요금 시위)
      const total = pool.reduce((s, d) => s + w(d), 0);
      let pick = Math.random() * total;
      for (const d of pool) { pick -= w(d); if (pick <= 0) { due.done = true; return d; } }
    }
    if (!pool.length) pool = DECISIONS.filter((d) => d.crisis && usable(d));
    if (pool.length) { due.done = true; return pickRandom(pool); }
    if (now - due.at > 6) due.done = true;    // 6개월 기다려도 조건이 안 맞으면 건너뜀
    return null;
  }
  if (yearsElapsed(state) < 1 || Math.random() > policyMods(state).offerMult / 22) return null;   // 기회: 평균 22개월에 한 번 (제조업 육성이면 2배)
  const pool = DECISIONS.filter((d) => !d.crisis && d.cat !== 'policy' && usable(d));
  return pool.length ? pickRandom(pool) : null;
}

// ============================================================
// 퀘스트 목록
// ============================================================
const QUESTS = [
  // ---------- 자동으로 주어지는 목표 ----------
  {
    id: 'reserve', icon: '🔋', title: '예비력 확보', months: 18, reward: { money: 800 }, penalty: { happy: 3 },
    desc: '조절 가능 설비(가스·석탄·원전)를 최대 수요의 115% 이상으로 늘리세요.',
    cond: (s) => firmCapOf(s) < peakDemandOf(s) * 1.1,
    check: (s) => firmCapOf(s) >= peakDemandOf(s) * 1.15,
    progress: (s) => fmt(firmCapOf(s) / peakDemandOf(s) * 100) + '% / 115%',
  },
  {
    id: 'noblackout', icon: '🕯', title: '무정전 2년', months: 24, reward: { money: 1500, happy: 4 }, penalty: { happy: 3 },
    desc: '앞으로 2년 동안 정전 없이 나라를 운영하세요. 처음 3개월은 준비 기간이고, 그 뒤에 정전이 나면 실패입니다.',
    // 최근 반년 동안 정전이 없었고 예비력이 넉넉할 때만 (갑자기 불가능한 목표를 주지 않도록)
    cond: (s) => yearsElapsed(s) >= 1 && firmCapOf(s) >= peakDemandOf(s) * 1.1 && s.history.slice(-6).every((h) => h.blackoutHours === 0),
    fail: (s, r, q) => monthIdxOf(s) - q.start >= 3 && r.blackoutHours > 0,
    check: (s, r, q) => monthIdxOf(s) >= q.deadline,
    progress: (s, q) => (q.deadline - monthIdxOf(s) + 1) + '개월 남음',
  },
  {
    id: 'rd100', icon: '🔬', title: 'R&D 수준 100', months: 48, reward: { money: 1500, happy: 3 }, penalty: { happy: 3 },
    desc: '연구소를 키워 R&D 수준 100에 도달하세요. 2단계 연구가 열립니다.',
    cond: (s) => rdLevel(s) >= 40 && rdLevel(s) < 80,   // 이미 연구소를 키우는 중인 사람에게만
    check: (s) => rdLevel(s) >= 100,
    progress: (s) => rdLevel(s) + ' / 100',
  },
  {
    id: 'tech3', icon: '🧪', title: '연구 3건 성공', months: 36, reward: { money: 1200 }, penalty: { happy: 2 },
    desc: '3년 안에 테크트리 연구를 3건 성공시키세요.',
    cond: (s) => rdLevel(s) >= 20 && (s.techLog || []).some((t) => !t.rd),   // 연구를 한 번이라도 해 본 사람에게만
    base: (s) => ({ tiers: totalTiers(s) }),
    check: (s, r, q) => totalTiers(s) - q.base.tiers >= 3,
    progress: (s, q) => (totalTiers(s) - q.base.tiers) + ' / 3건',
  },
  {
    id: 'ren20', icon: '🌱', title: '재생에너지 20%', months: 48, reward: { money: 2000, happy: 5 }, penalty: { happy: 3 },
    desc: '한 달 발전량의 20% 이상을 태양광·풍력으로 채우세요.',
    cond: (s) => yearsElapsed(s) >= 2 && s.lastReport && renShareOf(s.lastReport) >= 0.08,   // 이미 재생 비중이 8% 이상인 사람에게만 (토큰 태양광 하나로는 안 줌)
    check: (s, r) => renShareOf(r) >= 0.2,
    progress: (s) => (s.lastReport ? fmt(renShareOf(s.lastReport) * 100) : '0') + '% / 20%',
  },
  {
    id: 'nuclear', icon: '☢', title: '첫 원자력 가동', months: 96, reward: { money: 3000, happy: 5 }, penalty: { happy: 3 },
    desc: '8년 안에 원전 또는 SMR을 가동하세요. 무탄소 기저 전원이 전환의 핵심입니다.',
    cond: (s) => yearsElapsed(s) >= 2 && onlineOf(s, isNuke).length === 0 && (s.tech.nuclear || 0) >= 1 && (s.money >= 6000 || (s.tech.nuclear || 0) >= 2),   // 원자력 테크를 열고 지을 여력(자금 6,000억 또는 SMR 해금)이 있는 사람에게만
    check: (s) => onlineOf(s, isNuke).length > 0,
    progress: (s) => { const b = s.buildings.find((x) => PLANTS[x.type].kind === 'nuclear'); return b ? (b.status === 'building' ? '건설 중 · ' + b.monthsLeft + '개월' : b.status) : '아직 없음'; },
  },
  {
    id: 'co2cut', icon: '🌍', title: '탄소 원단위 30% 감축', months: 60, reward: { money: 2500, happy: 5 }, penalty: { happy: 3 },
    desc: '발전량당 탄소 배출(t/MWh)을 지금보다 30% 줄이세요. 수요가 늘어도 무탄소 전원 비중을 키우면 됩니다.',
    // 무탄소 전원을 짓기 시작했거나 관련 테크가 있을 때만
    // 무탄소 설비가 이미 최대 수요의 15% 이상이거나 SMR·CCS급 테크가 있을 때만 (감축 수단이 있는 사람에게만)
    cond: (s) => yearsElapsed(s) >= 3 && s.lastReport && s.lastReport.energy.co2 > 50000 &&
      (cleanCapOf(s) >= peakDemandOf(s) * 0.15 || (s.tech.nuclear || 0) >= 2 || (s.tech.coal || 0) >= 3),
    base: (s) => ({ inten: reportIntensity(s.lastReport) }),
    check: (s, r, q) => reportIntensity(r) <= q.base.inten * 0.7,
    progress: (s, q) => (s.lastReport ? fmt((1 - reportIntensity(s.lastReport) / q.base.inten) * 100) : '0') + '% / 30% 감축 (' + (s.lastReport ? reportIntensity(s.lastReport).toFixed(2) : '-') + ' → ' + (q.base.inten * 0.7).toFixed(2) + ' t/MWh)',
  },
  {
    id: 'city', icon: '🏙', title: '신도시 조성', months: 24, reward: { money: 1000, happy: 3 }, penalty: { happy: 3 },
    desc: '도시가 붐비고 있습니다. 2년 안에 새 도시를 세워 인구를 나누세요.',
    cond: (s) => s.cities.some((c) => cityDensity(c, s.grid) > ECON.densityLimit * 0.8),
    base: (s) => ({ n: s.cities.length }),
    check: (s, r, q) => s.cities.length > q.base.n,
    progress: (s, q) => s.cities.length > q.base.n ? '완료' : '도시 탭에서 40칸을 칠하세요',
  },
  {
    id: 'export', icon: '🔌', title: '전력 수출 500 GWh', months: 36, reward: { money: 1500 }, penalty: { happy: 2 },
    desc: '3년 안에 누적 500 GWh를 수출하세요. 남는 전기를 이웃 나라에 파세요.',
    cond: (s) => onlineOf(s, (p) => p.isLink).length > 0,
    base: (s) => ({ exp: s.exportTotal || 0 }),
    check: (s, r, q) => (s.exportTotal || 0) - q.base.exp >= 500000,
    progress: (s, q) => fmt(((s.exportTotal || 0) - q.base.exp) / 1000) + ' / 500 GWh',
  },
  {
    id: 'ess', icon: '🔋', title: 'ESS 2기 가동', months: 36, reward: { money: 1200, happy: 2 }, penalty: { happy: 2 },
    desc: '재생에너지 출력 제한을 줄이도록 ESS를 2기 이상 가동하세요.',
    cond: (s) => fleetCapacities(s).solar + fleetCapacities(s).wind >= 200 && onlineOf(s, (p) => p.isStorage).length < 2,
    check: (s) => onlineOf(s, (p) => p.isStorage).length >= 2,
    progress: (s) => onlineOf(s, (p) => p.isStorage).length + ' / 2기',
  },
  {
    id: 'happy90', icon: '😊', title: '행복도 90 회복', months: 36, reward: { money: 1000 }, penalty: { happy: 2 },
    desc: '국민 행복도를 90 이상으로 끌어올리세요.',
    cond: (s) => s.happiness < 70,
    check: (s) => s.happiness >= 90,
    progress: (s) => fmt(s.happiness) + ' / 90',
  },
  {
    id: 'h2_first', icon: '💧', title: '첫 수소 생산', months: 36, reward: { money: 1500, happy: 3 }, penalty: { happy: 2 },
    desc: '크래킹 테크를 열었습니다. 3년 안에 암모니아 크래킹 설비를 가동해 수소를 만들어 보세요.',
    cond: (s) => (s.tech.h2crack || 0) >= 1 && onlineOf(s, (p) => p.isH2).length === 0,
    check: (s, r) => !!(r.energy.h2 && r.energy.h2.prod > 0),
    progress: (s) => onlineOf(s, (p) => p.isH2).length ? '가동 중' : '크래킹 설비를 지으세요',
  },
  {
    id: 'h2_export', icon: '🚢', title: '수소 5만 톤 생산', months: 36, reward: { money: 2000, happy: 3 }, penalty: { happy: 2 },
    desc: '3년 안에 수소를 누적 5만 톤 만드세요. 터빈에 태우든 수출하든 생산량으로 셉니다 (크래킹 1기가 한 달에 7천 톤쯤).',
    cond: (s) => onlineOf(s, (p) => p.isH2).length > 0,
    base: (s) => ({ h2: s.h2ProdTotal || 0 }),
    check: (s, r, q) => (s.h2ProdTotal || 0) - q.base.h2 >= 50000000,
    progress: (s, q) => fmt(((s.h2ProdTotal || 0) - q.base.h2) / 1000, 0) + ' / 50,000 t',
  },
  // ---------- 사건의 선택에서 이어지는 후속 목표 (자동으로는 안 주어짐) ----------
  {
    id: 'h2_contract', icon: '📜', title: '수소 계약 이행', months: 36, followup: true, reward: { money: 1500, happy: 3 }, penalty: { happy: 3, money: 1000, text: '위약금 1,000억' },
    desc: '이웃 나라와 맺은 계약: 3년 안에 수소 10만 톤을 생산해 계약 물량을 대세요 (터빈에 쓴 양도 인정).',
    cond: () => true,
    base: (s) => ({ h2: s.h2ProdTotal || 0 }),
    check: (s, r, q) => (s.h2ProdTotal || 0) - q.base.h2 >= 100000000,
    progress: (s, q) => fmt(((s.h2ProdTotal || 0) - q.base.h2) / 1000, 0) + ' / 100,000 t',
  },
  {
    id: 'fuel_diversify', icon: '🧯', title: '연료 다변화', months: 18, followup: true, reward: { money: 1500, happy: 3 }, penalty: { happy: 3, gasShock: true, text: '가스 의존 지속 · 3개월 연료비 ×1.3' },
    desc: 'LNG 위기의 교훈: 18개월 안에 가스가 아닌 조절 가능 설비(석탄·원전·SMR)나 ESS를 1기 더 가동하세요.',
    cond: () => true,
    base: (s) => ({ n: onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length }),
    check: (s, r, q) => onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length > q.base.n,
    progress: (s, q) => (onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length - q.base.n) + ' / 1기 추가',
  },
  {
    id: 'austerity', icon: '📉', title: '재정 건전화', months: 12, followup: true, hold: true, reward: { money: 1200, happy: 2 }, penalty: { happy: 3, money: 600, text: '신용도 하락으로 위약금 600억' },
    desc: '국채를 차환한 대가: 1년 동안 흑자를 지키세요. 두 달 연속 적자면 실패입니다. 성공하면 이자 일부를 돌려받습니다.',
    cond: () => true,
    fail: (s, r) => r.money.profit < 0 && s.history.length >= 2 && s.history[s.history.length - 2].profit < 0,
    check: (s, r, q) => monthIdxOf(s) >= q.deadline,
    progress: (s, q) => (q.deadline - monthIdxOf(s) + 1) + '개월 남음 · 지난달 ' + (s.lastReport ? (s.lastReport.money.profit >= 0 ? '흑자' : '적자') : '-'),
  },
  {
    id: 'cheap_power', icon: '💡', title: '전기요금 안정', months: 12, followup: true, reward: { money: 800, happy: 5 }, penalty: { happy: 5, text: '약속을 어겨 지지율 하락' },
    desc: '국민에게 약속했습니다: 1년 안에 한 달 평균 SMP를 지금보다 10% 낮추세요. 연료비 싼 전원이나 재생에너지가 답입니다.',
    cond: () => true,
    base: (s) => ({ target: Math.max(110, Math.round((s.lastReport ? avgSmpOf(s.lastReport) : 150) * 0.9)) }),
    check: (s, r, q) => avgSmpOf(r) <= q.base.target,
    progress: (s, q) => (s.lastReport ? fmt(avgSmpOf(s.lastReport)) : '-') + '원 / ' + q.base.target + '원 이하',
  },
  {
    id: 'capacity_up', icon: '🏗', title: '수요 증가 대응', months: 15, followup: true, reward: { money: 1200, happy: 3 }, penalty: { happy: 4, money: 800, text: '공장 가동 차질 보상금 800억' },
    desc: '유치한 공장·데이터센터가 가동을 시작합니다. 15개월 안에 조절 가능 설비를 새로 지어 최대 수요의 115% 이상으로 맞추세요.',
    cond: () => true,
    base: (s) => ({ firm: firmCapOf(s) }),
    check: (s, r, q) => firmCapOf(s) >= peakDemandOf(s) * 1.15 && firmCapOf(s) > q.base.firm + 50,
    progress: (s, q) => fmt(firmCapOf(s) / peakDemandOf(s) * 100) + '% / 115%' + (firmCapOf(s) > q.base.firm + 50 ? '' : ' · 새 설비 필요'),
  },
  {
    id: 'safety_audit', icon: '🔍', title: '노후 설비 정리', months: 18, followup: true, reward: { money: 1000, happy: 4 }, penalty: { happy: 5, text: '안전 불신 확산' },
    desc: '사고 뒤 국민이 안전 점검을 요구합니다. 18개월 안에 노후·정지 설비(출력 −10% 표시, 수명 종료)를 지금보다 하나 이상 줄이세요. 철거하면 됩니다.',
    cond: () => true,
    base: (s) => ({ n: agingCount(s) }),
    check: (s, r, q) => agingCount(s) === 0 || agingCount(s) <= q.base.n - 1,
    progress: (s, q) => '노후·정지 설비 ' + agingCount(s) + '기 (목표 ' + Math.max(0, q.base.n - 1) + '기 이하)',
  },
  {
    id: 'clean_build', icon: '🌿', title: '무탄소 설비 확충', months: 36, followup: true, reward: { money: 2500, happy: 4 }, penalty: { happy: 3, carbonTaxUp: 0.15, text: '협약 불이행으로 탄소세 +15%' },
    desc: '탄소 협약 이행: 3년 안에 무탄소 설비(원전·SMR·태양광·풍력·ESS)를 3기 더 가동하세요. 건설비 할인이 끝나기 전에 서두르세요.',
    cond: () => true,
    base: (s) => ({ n: onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length }),
    check: (s, r, q) => onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length - q.base.n >= 3,
    progress: (s, q) => (onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length - q.base.n) + ' / 3기',
  },
];
function totalTiers(s) { return TECH_ORDER.reduce((a, k) => a + (s.tech[k] || 0), 0); }
function agingCount(s) { return s.buildings.filter((b) => b.status === 'retired' || (b.status === 'online' && plantAgeStatus(b) === 'aging')).length; }
function avgSmpOf(r) { const hs = r.hours.filter((h) => h.unmet <= 0); return hs.length ? hs.reduce((a, h) => a + h.smp, 0) / hs.length : 999; }
// 사건의 선택에서 후속 목표를 줌. 이미 진행 중이면 다시 주지 않음. 문구를 돌려줌
function giveQuest(state, id) {
  if (!state.quests) state.quests = [];
  if (state.quests.some((q) => q.id === id && q.status === 'active')) return '';
  const now = monthIdxOf(state);
  // 같은 후속 목표를 3년 안에 또 주지 않음 (반복 보상으로 밸런스가 깨지지 않도록)
  if (state.quests.some((q) => q.id === id && q.endAt && now - q.endAt < 36)) return '';
  const def = questById(id);
  const q = { id, start: now, deadline: now + def.months - 1, status: 'active', base: def.base ? def.base(state) : {} };
  // 주자마자 달성되는 목표는 주지 않음
  if (state.lastReport && !def.hold && def.check(state, state.lastReport, q)) return '';
  state.quests.push(q);
  return ' → 새 목표 "' + def.title + '" (' + def.months + '개월)';
}
function renShareOf(r) { const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return t > 0 ? (g.solar + g.wind) / t : 0; }
function questById(id) { return QUESTS.find((q) => q.id === id); }

// 새 퀘스트를 줄지 결정. 활성 2개 이하, 마지막 부여 후 10개월 이상, 이미 했던 퀘스트는 다시 안 줌
function maybeAssignQuest(state, force) {
  if (!state.quests) state.quests = [];
  const active = state.quests.filter((q) => q.status === 'active');
  if (active.length >= 2) return null;
  const now = monthIdxOf(state);
  const lastAt = state.quests.length ? Math.max(...state.quests.map((q) => q.start)) : -999;
  if (!force && (now - lastAt < 10 || Math.random() > 0.3)) return null;
  const done = new Set(state.quests.map((q) => q.id));
  const pool = QUESTS.filter((q) => !q.followup && !done.has(q.id) && q.cond(state));
  if (!pool.length) return null;
  const def = pickRandom(pool);
  const q = { id: def.id, start: now, deadline: now + def.months - 1, status: 'active', base: def.base ? def.base(state) : {} };
  // 주자마자 달성되는 목표는 의미가 없으니 건너뜀
  if (state.lastReport && !def.hold && def.check(state, state.lastReport, q)) return null;
  state.quests.push(q);
  return q;
}

// 매달 결산 뒤 퀘스트 판정. 알림 문구 목록을 돌려줌
function updateQuests(state, report) {
  const notices = [];
  const now = monthIdxOf(state);
  for (const q of state.quests || []) {
    if (q.status !== 'active') continue;
    const def = questById(q.id);
    if (!def) continue;
    if (def.fail && def.fail(state, report, q)) { q.status = 'failed'; q.endAt = now; applyPenalty(state, def); notices.push('✕ 목표 실패: ' + def.title + ' (' + penaltyText(def) + ')'); continue; }
    if (def.check(state, report, q)) {
      q.status = 'done'; q.endAt = now;
      if (def.reward.money) state.money += scaleMoney(state, def.reward.money);
      if (def.reward.happy) state.happiness = clamp(state.happiness + def.reward.happy, 0, 100);
      notices.push('🎉 목표 달성: ' + def.title + ' (' + rewardText(def) + ')');
      continue;
    }
    if (now > q.deadline) { q.status = 'failed'; q.endAt = now; applyPenalty(state, def); notices.push('✕ 목표 실패: ' + def.title + ' (' + penaltyText(def) + ')'); }
  }
  return notices;
}
// 실패 벌칙: 행복도 하락은 기본, 목표에 따라 벌금·탄소세 인상·연료비 충격이 더해짐
function applyPenalty(state, def) {
  const p = def.penalty || {};
  if (p.happy) state.happiness = clamp(state.happiness - p.happy, 0, 100);
  if (p.money) state.money -= p.money;
  if (p.carbonTaxUp) state.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(state.carbonTax * (1 + p.carbonTaxUp)));
  if (p.gasShock) addEffect(state, { name: '가스 의존 후폭풍 (연료비 ×1.3)', gasMult: 1.3 }, 3);
}
function penaltyText(def) {
  const p = def.penalty || {};
  const parts = [];
  if (p.happy) parts.push('행복도 −' + p.happy);
  if (p.text) parts.push(p.text);
  return parts.join(' · ');
}
function rewardText(def) { return rewardParts(def.reward); }

// ============================================================
// 정책 노선: 한 번 정하면 게임 조건이 오래 바뀌어 전략 자체가 갈림. 6년마다 재검토(번복하면 지지율 손해)
// ============================================================
const POLICIES = {
  nuclear: {
    name: '원자력 정책', icon: '☢', at: 12,
    desc: '원자력을 어떻게 다룰지 정합니다. 이 결정은 6년 동안 유지되고, 그때 다시 검토할 수 있습니다.',
    options: {
      pro:     { label: '친원전', desc: '원전·SMR 건설비 −15%, 주민 반발 범위 −1칸 · 원전 사고 때 행복도 타격 1.5배 · 반원전 시위가 잦아짐' },
      anti:    { label: '탈원전', desc: '원전·SMR 신규 건설 금지 · 태양광·풍력·ESS 건설비 −20% · 지금 행복도 +5' },
      neutral: { label: '중립', desc: '보너스도 제약도 없음' },
    },
  },
  market: {
    name: '전력시장 정책', icon: '⚖', at: 24,
    desc: '전기값을 시장에 맡길지, 정부가 누를지 정합니다.',
    options: {
      free:      { label: '시장 자유화', desc: '초과 이윤 환수 50% (기본 60%) · SMP 마진 1.35배 → 1.5배 · 기저(원전·석탄) 정산조정계수 75% → 85% · 전기요금 불만 벌점 상한 2 → 3 · 요금 시위가 잦아짐' },
      regulated: { label: '요금 규제', desc: '초과 이윤 환수 70% · SMP 상한 −15% · 기저 정산조정계수 75% → 65% · 대신 용량 요금 1.5배(정부 손실 보전) · 전기요금 불만 벌점 상한 2 → 1 · 지금 행복도 +3' },
    },
  },
  industry: {
    name: '산업 정책', icon: '🏭', at: 36,
    desc: '나라를 어떤 방향으로 키울지 정합니다. 수요 성장 속도와 도시 정책이 달라집니다.',
    options: {
      growth:  { label: '제조업 육성', desc: '인구·수요 증가 1.25배 · 공장·데이터센터 유치 제안 2배 · 유치 보조금 1.3배' },
      balance: { label: '균형 발전', desc: '인구·수요 증가 0.85배 · 모든 설비 건설비 −10% · 새 도시 조성비 −50% · 과밀 벌점 상한 −1' },
    },
  },
  hydrogen: {
    name: '수소 정책', icon: '💧', at: 60,
    desc: '수소 경제를 국가가 밀어줄지 정합니다. 밀어주면 크래킹 설비가 싸지고 수소 연구가 쉬워지며 수출 단가가 오르지만, 매달 보조금이 나갑니다.',
    options: {
      push: { label: '수소 경제 육성', desc: '크래킹 설비 건설비 −25% · 수소 연구 성공 확률 +10% · 수소 수출 단가 +10% · 매달 보조금 20억' },
      wait: { label: '시장에 맡긴다', desc: '변화 없음' },
    },
  },
  rd: {
    name: 'R&D 정책', icon: '🔬', at: 48,
    desc: '연구 개발을 국가가 끌고 갈지, 민간에 맡길지 정합니다.',
    options: {
      public:  { label: '국가 주도 R&D', desc: '연구원 영입비 −30% · 특허 수입 절반 (국가 귀속)' },
      private: { label: '민간 주도 R&D', desc: '특허 수입 1.5배 · 연구 실패 책임 퇴사 확률 30% → 15% · 영입비 그대로' },
    },
  },
};
const POLICY_REVIEW_MONTHS = 96;   // 8년 뒤 한 번 재검토

// 현재 정책이 게임 수치에 미치는 영향 (곱셈 계수 묶음)
function policyMods(state) {
  const p = (state && state.policies) || {};
  return {
    nuclearCapex: p.nuclear === 'pro' ? 0.85 : 1,
    nuclearBan: p.nuclear === 'anti',
    cleanCapex: p.nuclear === 'anti' ? 0.8 : 1,
    nuclearOppDelta: p.nuclear === 'pro' ? -1 : 0,
    accidentMult: p.nuclear === 'pro' ? 1.5 : 1,
    smpMarkup: p.market === 'free' ? 1.5 / ECON.smpMarkup : 1,
    smpCap: p.market === 'regulated' ? 0.85 : 1,
    clawMax: p.market === 'free' ? 0.5 : p.market === 'regulated' ? 0.7 : 0.6,   // 초과 이윤 환수 비율 (허용 이익을 넘는 이익 중 환수하는 몫)
    settle: p.market === 'free' ? 1.133 : p.market === 'regulated' ? 0.867 : 1,   // 정산조정계수 0.75 → 자유화 0.85 / 규제 0.65
    capPay: p.market === 'regulated' ? 1.5 : 1,        // 요금 규제: 정부가 용량 요금으로 손실 보전
    capexAll: p.industry === 'balance' ? 0.9 : 1,      // 균형 발전: 지방 설비 건설 보조 (모든 건설비 −10%)
    smpPenaltyCap: p.market === 'free' ? 3 : p.market === 'regulated' ? 1 : ECON.smpPenaltyCap,
    popGrowth: p.industry === 'growth' ? 1.25 : p.industry === 'balance' ? 0.85 : 1,
    offerMult: p.industry === 'growth' ? 2 : 1,
    subsidyMult: p.industry === 'growth' ? 1.3 : 1,
    cityCost: p.industry === 'balance' ? 0.5 : 1,
    densityCapDelta: p.industry === 'balance' ? -1 : 0,
    researcherCost: p.rd === 'public' ? 0.7 : 1,
    h2Price: p.hydrogen === 'push' ? 1.1 : 1,          // 수소 경제 육성: 수소 수출 단가 +10%
    h2Capex: p.hydrogen === 'push' ? 0.75 : 1,         // 수소 경제 육성: 크래킹 설비 건설비 −25%
    h2TechBonus: p.hydrogen === 'push' ? 0.1 : 0,      // 수소 경제 육성: 수소 연구 성공 확률 +10%
    h2Subsidy: p.hydrogen === 'push' ? 20 : 0,         // 수소 경제 육성: 매달 보조금 지출 (억)
    patent: p.rd === 'public' ? 0.5 : p.rd === 'private' ? 1.5 : 1,
    blameProb: p.rd === 'private' ? 0.15 : RD_BLAME_PROB,
    protestWeight: p.nuclear === 'pro' ? 2 : 1,
    tariffWeight: p.market === 'free' ? 2 : 1,
  };
}
function policyLabel(key, val) { const o = POLICIES[key].options[val]; return o ? o.label : '미정'; }
function researcherCost(state, st) { return Math.round(st.cost * policyMods(state).researcherCost); }

// 정책 결정 사건: 처음엔 정하고, 6년 뒤 재검토 때는 유지(비용 없음) 또는 변경(행복도 −4)
for (const key of Object.keys(POLICIES)) {
  const pol = POLICIES[key];
  DECISIONS.push({
    id: 'policy_' + key, cat: 'policy', icon: pol.icon, name: pol.name + ' 결정',
    desc: pol.desc,
    choices: Object.keys(pol.options).map((opt) => ({
      label: pol.options[opt].label,
      desc: (s) => pol.options[opt].desc + (s.policies && s.policies[key] && s.policies[key] !== opt ? ' · 정책 번복: 행복도 −4' : s.policies && s.policies[key] === opt ? ' · 현행 유지' : ''),
      apply(s) {
        if (!s.policies) s.policies = {};
        const prev = s.policies[key];
        let msg = pol.name + ': ' + pol.options[opt].label;
        if (prev && prev !== opt) { s.happiness = clamp(s.happiness - 4, 0, 100); msg += ' (정책 번복, 행복도 −4)'; }
        else if (!prev) {
          if (key === 'nuclear' && opt === 'anti') { s.happiness = clamp(s.happiness + 5, 0, 100); msg += ' (행복도 +5)'; }
          if (key === 'market' && opt === 'regulated') { s.happiness = clamp(s.happiness + 3, 0, 100); msg += ' (행복도 +3)'; }
        } else msg += ' (유지)';
        s.policies[key] = opt;
        s.policySetAt = s.policySetAt || {}; s.policySetAt[key] = monthIdxOf(s);
        return msg;
      },
    })),
  });
}
