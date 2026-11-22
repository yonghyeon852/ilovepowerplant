// ============================================================
// 사건(정책 선택)과 퀘스트(목표)
//  - 위기 일정표: 게임마다 같은 횟수·같은 종류 구성의 위기가 오지만 시점·순서·내용은 무작위 → 난이도는 비슷하되 매번 다르게
//  - 정책 결정도 에너지 정책만 먼저이고 나머지 셋은 판마다 순서와 시점이 다름
//  - 화제: 가벼운 소동 카드 (events3.js · events4.js). 평균 석 달에 한 번, 한 판에 같은 카드는 한 번만
//  - 위기: 선택지로 대응. 잘 넘기면(정전 없이) 보너스
//  - 기회: 낮은 확률로 찾아오는 긍정적 제안
//  - 퀘스트: 기한 안에 목표를 이루면 보상, 못 이루면 국민 실망
//  - 지속 효과는 state.effects 목록에 쌓이고 기한이 지나면 사라짐
// ============================================================

// ---------- 지속 효과 ----------
function monthIdxOf(state) { return state.year * 12 + state.month; }
// 목표의 남은 기간 문구. 기한 달이 지났는데 아직 진행 중이면(left 0 이하) 이번 달 결산이 마지막 판정임
//  (판정은 결산 때 하고, 기한을 넘긴 달의 결산에서 실패로 처리됨 → 그 달에 "0개월 남음"이라고 나오던 것을 바로잡음)
function monthsLeftText(left) { return left <= 0 ? '이번 달 결산에서 판정' : left + '개월 남음'; }

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
  const agg = { gasMult: 1, coalMult: 1, techBonus: 0, nuclearDerate: 0, smpCapMult: 1, exportBan: false, exportMult: 1, capexMult: 1, demandMult: 1, monthlyCost: 0, outageIds: new Set(), kindDerate: {}, list: [] };
  for (const e of state.effects || []) {
    if (e.until < now) continue;
    if (e.gasMult) agg.gasMult *= e.gasMult;
    if (e.coalMult) agg.coalMult *= e.coalMult;
    if (e.techBonus) agg.techBonus += e.techBonus;
    if (e.nuclearDerate) agg.nuclearDerate = Math.max(agg.nuclearDerate, e.nuclearDerate);
    if (e.smpCapMult) agg.smpCapMult *= e.smpCapMult;
    if (e.exportBan) agg.exportBan = true;
    if (e.exportMult) agg.exportMult *= e.exportMult;
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
      notices.push('🏟 올림픽 개막! 6개월 동안 수요 +20%. 정전 없이 치르면 ' + rewardPartsRaw(e.reward));
    } else if (e.track === 'repay') {
      state.money -= e.principal;
      notices.push('🏦 국채 원금 ' + fmt(e.principal) + '억 상환 (차환 만기)');
    } else if (e.track === 'noBlackout' && e.reward) {
      if (!e.blackouts) {
        if (e.reward.money) state.money += e.reward.money;   // 사건에서 약속한 금액 그대로 (이미 그때의 경제 규모로 정해진 값. 예전에는 여기서 한 번 더 곱해져 보상이 몇 배로 부풀었음)
        if (e.reward.happy) moodBump(state, e.reward.happy);
        state.crisisWins = (state.crisisWins || 0) + 1;
        notices.push('🏅 ' + e.name + ' 극복: 정전 없이 버텨 국민 신뢰 상승 (' + rewardPartsRaw(e.reward) + ')');
      } else notices.push(e.name + ' 종료 (기간 중 정전 ' + e.blackouts + '개월 · 보너스 없음)');
    } else notices.push(e.name + ' 종료');
  }
  state.effects = keep;
  return notices;
}
// 사건 효과의 보상 문구: 금액이 이미 정해져 있으므로 그대로 표시
function rewardPartsRaw(r) {
  const parts = [];
  if (r.money) parts.push('+' + fmt(r.money) + '억');
  if (r.happy) parts.push('민심 +' + r.happy);
  return parts.join(' · ');
}
function rewardParts(r) {
  const parts = [];
  if (r.money) parts.push('+' + fmt(typeof state !== 'undefined' && state ? scaleMoney(state, r.money) : r.money) + '억');
  if (r.happy) parts.push('민심 +' + r.happy);
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
const KIND_NAME = { gt: '가스터빈', ccgt: '복합발전', coal: '석탄화력', nuclear: '원전', solar: '태양광', wind: '풍력', ess: '배터리', link: '연계선' };
function countByKind(state) {
  const c = {};
  for (const b of state.buildings) if (b.status === 'online') { const k = PLANTS[b.type].kind; c[k] = (c[k] || 0) + 1; }
  return c;
}
function biggestKind(state) { const c = countByKind(state); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }
function stopPlant(state, b, name, months) { return addEffect(state, { name, plantId: b.id }, months); }
// 국채 만기 금액: 시점에 따라 커지되 보유 자금의 40%를 넘지 않음 (가난할 때 파산시키지 않도록)
// 국채 차환 이자: 매달 원금의 4% (1년에 48%). 재정 건전화 목표를 지키면 그 절반쯤을 돌려받아 실제 부담은 연 24% 수준
//  (예전 10%/월은 1년 이자가 원금보다 커서 고를 이유가 없는 선택이었음)
const DEBT_ROLL_RATE = 0.04;
function debtAmount(s) { return Math.max(800, Math.min(scaleMoney(s, 2500), Math.round(Math.max(0, s.money) * 0.4 / 100) * 100)); }

// ============================================================
// 사건 목록
//  cat: economy(경제) · disaster(재해) · politics(정치) · industry(기회)
//  cond(state): 지금 일어날 수 있는지. choices: 정책 선택지. apply(state)는 결과 문구를 돌려줌
//  crisis: true 면 위기 일정표에서 오는 사건, 아니면 낮은 확률의 기회
// ============================================================
const DECISIONS = [
  // ---------- 재선 공약 발표 (선거 1년 전에 main.js가 띄움. 무작위 사건 후보에는 들어가지 않음) ----------
  //  선택지 = 분야 6 × 수위 3. 화면에는 큰 카드로, 먼저 분야를 고르고 그다음 수위를 고름 (ui.js decisionCardsHtml)
  {
    id: 'term2_pledge', cat: 'term2', icon: '🗳', name: '재선 공약 발표', cards: true,
    cond: () => false,
    desc: '선거가 1년 앞으로 다가왔습니다. 재선하면 지킬 국정 과제를 국민 앞에 약속하세요. 과감한 약속일수록 지금 기대감으로 민심이 오르지만, 18년 차 말까지 못 지키면 그만큼 크게 깎입니다. 판정은 1년 평균으로 합니다.',
    choices: ['renew', 'export', 'growth', 'price', 'gas', 'tech'].flatMap((key) => [0, 1, 2].map((lv) => ({
      theme: key, lv, t2: 'term2_' + key + '_' + lv,
      get label() { return term2Theme(key).title + ' · ' + term2Theme(key).goal(term2Theme(key).targets[lv]) + ' (' + TERM2_LEVELS[lv].short + ')'; },
      show: (s) => { const T = term2Theme(key); return !T.show || T.show(s); },
      desc: () => { const d = questById('term2_' + key + '_' + lv); return d.brief + (d.boost ? ' · 발표하면 1년간 민심 +' + d.boost : '') + ' · 지키면 민심 +' + d.kept + ' (임기 끝까지) · 못 지키면 민심 −' + d.penalty.happy; },
      apply(s) { const d = questById('term2_' + key + '_' + lv); giveTerm2(s, d.id); return '"' + term2Theme(key).title + '"을 약속했습니다 (' + TERM2_LEVELS[lv].name + '). ' + d.short + '. 진행 상황은 길잡이와 정책 탭에 나옵니다.' + (d.boost ? ' 공약 기대감으로 한동안 민심이 +' + d.boost + ' 오릅니다.' : ''); },
    }))),
  },
  // ---------- 원전 중대 사고 ----------
  //  극히 드묾 (ECON.nukeAccidentPerYear). 일어난 달에 main.js(nuclearAccident)가 결과를 적용하고 이 카드를 띄움. 무작위 사건 후보에는 들어가지 않고, 게임 안 어디에도 미리 설명하지 않음
  {
    id: 'nuke_accident', cat: 'accident', icon: '☢', name: '원전 중대 사고',
    cond: () => false,
    desc: (s) => { const a = s.accident || {}; return (a.name || '원전') + '에서 노심이 녹아내리는 중대 사고가 났습니다. 발전소 둘레는 출입이 금지되었고 주민들이 대피했습니다. 나라 전체가 충격에 빠졌습니다.'; },
    choices: [
      { label: '수습에 나선다', desc: (s) => { const a = s.accident || {}; return '민심 −' + (a.hit || 0) + ' · 그 뒤로도 −' + (a.mood || 0) + ' (임기 끝까지) · 주변 접근 금지'; },
        apply(s) { const a = s.accident || {}; return '사고 수습을 시작했습니다. ' + (a.lost ? '구역 안의 다른 설비 ' + a.lost + '기를 잃었고, ' : '') + (a.evac >= 1 ? '주민 ' + fmt(a.evac) + '만 명이 삶터를 떠났습니다. ' : '') + '접근 금지 구역에는 설비도 도시도 지을 수 없습니다.'; } },
    ],
  },
  // ---------- 경제 ----------
  {
    id: 'lng_war', cat: 'economy', crisis: true, icon: '🛢', name: '해외 전쟁으로 LNG 수입가 급등',
    cond: (s) => onlineOf(s, isGas).length > 0,
    desc: '주요 산유국 사이에 전쟁이 터져 LNG 현물 가격이 치솟았습니다. 아무 조치도 없으면 9개월 동안 가스 연료비가 1.8배가 됩니다. 정부가 어떻게 대응할지 정하세요. 위기 기간을 정전 없이 넘기면 국민 신뢰가 오릅니다.',
    choices: [
      { label: '비축 물량 방출 + 장기 계약', cost: (s) => scaleMoney(s, 1200), desc: (s) => '−' + fmt(scaleMoney(s, 1200)) + '억 · 6개월 연료비 ×1.3', apply(s) { const c = scaleMoney(s, 1200); s.money -= c; addEffect(s, { name: 'LNG 위기 (연료비 ×1.3)', gasMult: 1.3, track: 'noBlackout', reward: { money: scaleMoney(s, 600), happy: 4 } }, 6); return '비축 방출·장기 계약 체결 (' + fmt(c) + '억): 6개월 연료비 ×1.3' + giveQuest(s, 'fuel_diversify'); } },
      { label: '시장에 맡긴다', desc: () => '9개월 연료비 ×1.8 · 비용 없음', apply(s) { addEffect(s, { name: 'LNG 위기 (연료비 ×1.8)', gasMult: 1.8, track: 'noBlackout', reward: { money: scaleMoney(s, 800), happy: 5 } }, 9); return '시장 가격 감수: 9개월 연료비 ×1.8' + giveQuest(s, 'fuel_diversify'); } },
      { label: '전기요금 동결', desc: () => '9개월 연료비 ×1.8 + SMP 상한 −25% · 민심 +4', apply(s) { addEffect(s, { name: 'LNG 위기 + 요금 동결 (연료비 ×1.8, SMP 상한 −25%)', gasMult: 1.8, smpCapMult: 0.75, track: 'noBlackout', reward: { money: scaleMoney(s, 500), happy: 4 } }, 9); moodBump(s, 4); return '요금 동결: 9개월 연료비 ×1.8, SMP 상한 −25%, 민심 +4' + giveQuest(s, 'fuel_diversify'); } },
    ],
  },
  {
    id: 'debt_call', cat: 'economy', crisis: true, icon: '🏦', name: '전력 부문 국채 만기',
    desc: '전임 정부가 발행한 전력 부문 국채가 만기를 맞았습니다. 지금 갚거나, 이자를 내며 1년 연장할 수 있습니다.',
    choices: [
      { label: '즉시 상환', cost: (s) => debtAmount(s), desc: (s) => '−' + fmt(debtAmount(s)) + '억', apply(s) { const c = debtAmount(s); s.money -= c; return '국채 ' + fmt(c) + '억 상환'; } },
      { label: '1년 차환', desc: (s) => '1년간 매달 이자 ' + fmt(debtAmount(s) * DEBT_ROLL_RATE) + '억 · 1년 뒤 원금 ' + fmt(debtAmount(s)) + '억 상환', apply(s) { const c = debtAmount(s); addEffect(s, { name: '국채 차환 (매달 이자 ' + fmt(c * DEBT_ROLL_RATE) + '억)', monthlyCost: c * DEBT_ROLL_RATE, principal: c, track: 'repay' }, 12); const msg = giveQuest(s, 'austerity'); const aq = (s.quests || []).find((q) => q.id === 'austerity' && q.status === 'active'); if (aq && msg) aq.base = Object.assign({}, aq.base, { refund: Math.round(c * DEBT_ROLL_RATE * 12 * 0.5) }); return '1년 차환: 매달 이자 ' + fmt(c * DEBT_ROLL_RATE) + '억, 1년 뒤 원금 ' + fmt(c) + '억 상환' + msg; } },
    ],
  },
  {
    id: 'tariff', cat: 'politics', crisis: true, icon: '🗳', name: '전기요금 인하 요구 시위',
    desc: '물가 부담에 지친 국민이 거리로 나와 전기요금 인하를 요구합니다. 요금을 내리면 발전 수입이 줄고, 거부하면 지지율이 떨어집니다.',
    choices: [
      { label: '6개월 요금 인하', desc: () => 'SMP 상한 −25% (6개월) · 민심 +6', apply(s) { addEffect(s, { name: '전기요금 인하 (SMP 상한 −25%)', smpCapMult: 0.75 }, 6); moodBump(s, 6); return '요금 인하: 6개월 SMP 상한 −25%, 민심 +6' + giveQuest(s, 'cheap_power'); } },
      { label: '취약계층 지원금만 지급', cost: (s) => scaleMoney(s, 700), desc: (s) => '−' + fmt(scaleMoney(s, 700)) + '억 · 민심 +2', apply(s) { const c = scaleMoney(s, 700); s.money -= c; moodBump(s, 2); return '지원금 ' + fmt(c) + '억 지급, 민심 +2'; } },
      { label: '거부한다', desc: () => '민심 −5', apply(s) { moodBump(s, -5); return '요금 인하 거부: 민심 −5'; } },
    ],
  },
  // ---------- 재해 ----------
  {
    id: 'plant_fire', cat: 'disaster', crisis: true, icon: '🔥', name: '발전소 화재',
    cond: (s) => onlineOf(s, isThermal).length > 0,
    desc: '화력 발전소 한 곳에서 큰불이 났습니다. 인명 피해는 없지만 설비가 멈췄습니다. 복구 방식을 정하세요. 복구 기간을 정전 없이 넘기면 국민 신뢰가 오릅니다.',
    choices: [
      { label: '긴급 복구', cost: (s) => scaleMoney(s, 500), desc: (s) => '−' + fmt(scaleMoney(s, 500)) + '억 · 1개월 정지', apply(s) { const b = pickRandom(onlineOf(s, isThermal)); const c = scaleMoney(s, 500); s.money -= c; const e = stopPlant(s, b, PLANTS[b.type].name + ' 화재 긴급 복구', 1); e.track = 'noBlackout'; e.reward = { happy: 3 }; moodBump(s, -1); return PLANTS[b.type].name + ' 긴급 복구 (' + fmt(c) + '억): 1개월 정지'; } },
      { label: '정상 복구', desc: () => '비용 없음 · 3개월 정지 · 민심 −2', apply(s) { const b = pickRandom(onlineOf(s, isThermal)); const e = stopPlant(s, b, PLANTS[b.type].name + ' 화재 복구', 3); e.track = 'noBlackout'; e.reward = { money: scaleMoney(s, 400), happy: 3 }; moodBump(s, -2); return PLANTS[b.type].name + ' 화재: 3개월 정지, 민심 −2'; } },
    ],
  },
  {
    id: 'tsunami', cat: 'disaster', crisis: true, icon: '🌊', name: '지진·해일 경보',
    cond: (s) => onlineOf(s, isNuke).length > 0,
    desc: '앞바다에서 강한 지진이 감지되어 해일 경보가 내려졌습니다. 원전을 예방 정지하고 점검할지, 그대로 운전할지 결정해야 합니다.',
    choices: [
      { label: '예방 정지·점검', cost: (s) => scaleMoney(s, 300), desc: (s) => '원전 1기 1개월 정지 · 점검비 ' + fmt(scaleMoney(s, 300)) + '억', apply(s) { const b = pickRandom(onlineOf(s, isNuke)); const c = scaleMoney(s, 300); s.money -= c; const e = stopPlant(s, b, PLANTS[b.type].name + ' 안전 점검', 1); e.track = 'noBlackout'; e.reward = { happy: 3 }; return PLANTS[b.type].name + ' 예방 정지 1개월, 점검비 ' + fmt(c) + '억'; } },
      { label: '그대로 운전', desc: () => '20% 확률로 사고 (6개월 정지 · 민심 −15)', apply(s) {
        if (Math.random() < 0.2) { const b = pickRandom(onlineOf(s, isNuke)); stopPlant(s, b, PLANTS[b.type].name + ' 사고 복구', 6); const hit = Math.round(15 * policyMods(s).accidentMult); moodBump(s, -(hit)); return '⚠ 해일로 ' + PLANTS[b.type].name + ' 냉각 계통 손상: 6개월 정지, 민심 −' + hit; }
        moodBump(s, 1); return '해일은 원전을 비껴갔습니다. 침착한 대응에 민심 +1';
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
      { label: '폐쇄한다', desc: () => '노후 설비 1기 영구 정지 · 민심 −4', apply(s) { const b = pickRandom(s.buildings.filter((x) => x.status === 'online' && plantAgeStatus(x) === 'aging')); b.status = 'retired'; moodBump(s, -4); return PLANTS[b.type].name + ' 영구 정지 (철거 필요), 민심 −4' + giveQuest(s, 'safety_audit'); } },
      { label: '대수선으로 수명 연장', desc: (s) => '건설비의 30% · 3개월 정지 · 나이 5년 젊어짐 · 민심 −6', apply(s) { const b = pickRandom(s.buildings.filter((x) => x.status === 'online' && plantAgeStatus(x) === 'aging')); const c = Math.round(plantStats(s, b.type).capex * 0.3); s.money -= c; b.age = Math.max(0, b.age - 60); stopPlant(s, b, PLANTS[b.type].name + ' 대수선', 3); moodBump(s, -6); return PLANTS[b.type].name + ' 대수선 (' + fmt(c) + '억): 3개월 정지, 수명 5년 연장, 민심 −6' + giveQuest(s, 'safety_audit'); } },
    ],
  },
  // ---------- 정치 ----------
  {
    id: 'fake_news', cat: 'politics', crisis: true, icon: '📢', name: '전력 요금 폭리 루머 확산',
    desc: '"정부가 전기를 비싸게 팔아 폭리를 취한다"는 루머가 SNS에서 번지고 있습니다. 그대로 두면 지지율이 크게 떨어집니다.',
    choices: [
      { label: '공개 검증·설명회', cost: (s) => scaleMoney(s, 500), desc: (s) => '−' + fmt(scaleMoney(s, 500)) + '억 · 민심 −2', apply(s) { const c = scaleMoney(s, 500); s.money -= c; moodBump(s, -2); return '공개 검증 (' + fmt(c) + '억): 민심 하락을 −2로 막음' + giveQuest(s, 'cheap_power'); } },
      { label: '요금 환급', cost: (s) => scaleMoney(s, 1200), desc: (s) => '−' + fmt(scaleMoney(s, 1200)) + '억 · 민심 +3', apply(s) { const c = scaleMoney(s, 1200); s.money -= c; moodBump(s, 3); return '요금 환급 (' + fmt(c) + '억): 민심 +3'; } },
      { label: '무시한다', desc: () => '민심 −10', apply(s) { moodBump(s, -10); return '루머 방치: 민심 −10'; } },
    ],
  },
  {
    id: 'strike', cat: 'politics', crisis: true, icon: '✊', name: '발전 노조 파업 예고',
    cond: (s) => onlineOf(s, isThermal).length >= 2,
    desc: '발전 노조가 임금 인상을 요구하며 파업을 예고했습니다. 요구를 받아들이면 돈이 들고, 강행하면 화력 설비 두 곳이 한 달 멈춥니다.',
    choices: [
      { label: '요구 수용', cost: (s) => scaleMoney(s, 800), desc: (s) => '−' + fmt(scaleMoney(s, 800)) + '억', apply(s) { const c = scaleMoney(s, 800); s.money -= c; return '임금 인상 수용: ' + fmt(c) + '억'; } },
      { label: '강행한다', desc: () => '화력 2기 1개월 정지 · 정전 없이 넘기면 민심 +3', apply(s) { const list = onlineOf(s, isThermal).slice(); let e = null; for (let i = 0; i < 2 && list.length; i++) { const b = list.splice(Math.floor(Math.random() * list.length), 1)[0]; e = stopPlant(s, b, PLANTS[b.type].name + ' 파업', 1); } if (e) { e.track = 'noBlackout'; e.reward = { happy: 3 }; } return '파업 강행: 화력 2기 1개월 정지'; } },
    ],
  },
  {
    id: 'pact', cat: 'politics', crisis: true, icon: '🌍', name: '국제 탄소 협약 가입 요청', minYear: 4,
    desc: '국제 탄소 협약 가입을 요청받았습니다. 가입하면 탄소세가 즉시 30% 오르지만 3년 동안 무탄소 설비(원전·SMR·태양광·풍력) 건설비가 20% 싸집니다. 불참하면 3년 동안 전력 수출이 막히고 국제 여론이 나빠집니다.',
    choices: [
      { label: '가입한다', desc: () => '탄소세 +30% · 3년간 무탄소 설비 건설비 −20%', apply(s) { s.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(s.carbonTax * 1.3)); addEffect(s, { name: '탄소 협약 (무탄소 설비 건설비 −20%)', capexMult: 0.8 }, 36); return '탄소 협약 가입: 탄소세 +30%, 3년간 무탄소 건설비 −20%' + giveQuest(s, 'clean_build'); } },
      { label: '불참한다', desc: () => '3년간 수출 금지 · 민심 −3', apply(s) { addEffect(s, { name: '수출 금지 (협약 불참)', exportBan: true }, 36); moodBump(s, -3); return '협약 불참: 3년간 수출 금지, 민심 −3'; } },
    ],
  },
  {
    id: 'protest_nuclear', cat: 'politics', crisis: true, icon: '📣', name: '반원전 시위',
    cond: (s) => s.buildings.some((b) => PLANTS[b.type].kind === 'nuclear' && (b.status === 'online' || b.status === 'building')),
    desc: '원전 반대 단체가 대규모 시위를 벌이고 있습니다. 공청회를 열어 설득할지, 강행할지 정하세요.',
    choices: [
      { label: '공청회·안전 설명회', cost: (s) => scaleMoney(s, 600), desc: (s) => '−' + fmt(scaleMoney(s, 600)) + '억 · 민심 −1', apply(s) { const c = scaleMoney(s, 600); s.money -= c; moodBump(s, -1); return '공청회 개최 (' + fmt(c) + '억): 민심 하락을 −1로 막음'; } },
      { label: '강행한다', desc: () => '민심 −6 · 건설 중인 원전 3개월 지연', apply(s) { moodBump(s, -6); let n = 0; for (const b of s.buildings) if (PLANTS[b.type].kind === 'nuclear' && b.status === 'building') { b.monthsLeft += 3; n++; } return '강행: 민심 −6' + (n ? ', 건설 중인 원전 ' + n + '기 3개월 지연' : ''); } },
    ],
  },
  {
    id: 'election', cat: 'politics', crisis: true, icon: '🗳', name: '총선 공약', minYear: 2,
    desc: '총선이 다가옵니다. 여당이 에너지 공약을 내걸어야 합니다. 공약은 지지율을 올리지만, 지키지 못하면 그만큼 잃습니다.',
    choices: [
      { label: '전기요금 안정 공약', desc: () => '민심 +4 · 1년 안에 SMP 10% 인하 목표', apply(s) { moodBump(s, 4); return '요금 안정 공약: 민심 +4' + giveQuest(s, 'cheap_power'); } },
      { label: '탈탄소 공약', desc: () => '민심 +4 · 3년 안에 무탄소 설비 3기 목표', apply(s) { moodBump(s, 4); return '탈탄소 공약: 민심 +4' + giveQuest(s, 'clean_build'); } },
      { label: '공약 없이 간다', desc: () => '민심 −2', apply(s) { moodBump(s, -2); return '공약 없음: 민심 −2'; } },
    ],
  },
  // ---------- 기회 (낮은 확률로 랜덤) ----------
  {
    id: 'olympics', cat: 'industry', icon: '🏟', name: '올림픽 유치 제안', minYear: 2,
    cond: (s) => !(s.decisionLog || []).some((d) => d.id === 'olympics'),
    desc: '올림픽 유치 기회가 왔습니다. 유치하면 2년 뒤 대회 기간 6개월 동안 전력 수요가 20% 늘어납니다. 그 기간을 정전 없이 넘기면 국가 위상이 크게 오르고 큰 보너스를 받습니다.',
    choices: [
      { label: '유치한다', cost: (s) => scaleMoney(s, 1500), desc: (s) => '−' + fmt(scaleMoney(s, 1500)) + '억 · 2년 뒤 6개월 수요 +20% · 무정전이면 +' + fmt(scaleMoney(s, 4000)) + '억 · 민심 +10', apply(s) { const c = scaleMoney(s, 1500); s.money -= c; addEffect(s, { name: '올림픽 준비 (2년 뒤 개최)', track: 'olympics', reward: { money: scaleMoney(s, 4000), happy: 10 } }, 24); return '올림픽 유치 (' + fmt(c) + '억): 2년 뒤 개최. 그때까지 설비를 준비하세요'; } },
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
    desc: '해외 연구소가 문을 닫아 연구팀을 통째로 데려올 기회가 생겼습니다. 5,000억 원으로 연구소 규모가 120 커집니다(보통은 6,000억).',
    choices: [
      { label: '영입한다', cost: () => 5000, desc: () => '−5,000억 · 연구소 규모 +120', apply(s) { s.money -= 5000; s.rdLab = rdLevel(s) + 120; rdLogAdd(s, '해외 연구팀 영입: 규모 +120 (5,000억)', 'hire'); return '해외 연구팀 영입: 연구소 규모 +120 (5,000억)'; } },
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
    desc: '제조사가 한 기종의 결함을 발표했습니다. 지금 수리하면 그 기종 설비값의 4%가 들고, 방치하면 6개월 동안 그 기종 출력이 25% 떨어집니다.',
    choices: [
      { label: '즉시 수리', cost: (s) => recallCost(s), desc: (s) => KIND_NAME[biggestKind(s)] + ' ' + countByKind(s)[biggestKind(s)] + '기 · −' + fmt(recallCost(s)) + '억 (설비값의 4%)', apply(s) { const k = biggestKind(s); const n = countByKind(s)[k]; const c = recallCost(s); s.money -= c; return KIND_NAME[k] + ' ' + n + '기 수리: ' + fmt(c) + '억'; } },
      { label: '방치한다', desc: () => '6개월 그 기종 출력 −25%', apply(s) { const k = biggestKind(s); addEffect(s, { name: KIND_NAME[k] + ' 결함 (출력 −25%)', kindDerate: { kind: k, factor: 0.25 } }, 6); return KIND_NAME[k] + ' 결함 방치: 6개월 출력 −25%'; } },
    ],
  },
];

// 리콜 수리비: 가장 많은 기종의 가동 설비를 지금 새로 짓는 값의 4% (태양광 수십 기든 원전 두 기든 설비 규모에 비례)
function recallCost(s) {
  const k = biggestKind(s);
  const sum = s.buildings.filter((b) => b.status === 'online' && PLANTS[b.type].kind === k).reduce((a, b) => a + plantStats(s, b.type).capex, 0);
  return Math.max(100, Math.round(sum * 0.04 / 10) * 10);
}
const EVENT_BRIEF = {
  lng_war: '해외 전쟁으로 가스값이 치솟았습니다. 그대로 두면 9개월 동안 가스 연료비가 1.8배입니다.',
  debt_call: '전임 정부의 국채가 만기입니다. 지금 갚거나 이자를 내고 1년 미룰 수 있습니다.',
  tariff: '국민이 전기요금 인하를 요구하며 시위에 나섰습니다.',
  plant_fire: '화력 발전소 한 곳에 불이 나 멈췄습니다. 어떻게 복구할지 정하세요.',
  tsunami: '해일 경보입니다. 원전을 미리 멈추고 점검할지 정하세요.',
  drought: '가뭄으로 냉각수가 부족해 원전 출력을 줄여야 합니다.',
  aging_accident: '낡은 설비에서 큰 사고가 났습니다. 닫을지, 고쳐서 더 쓸지 정하세요.',
  fake_news: '"정부가 전기로 폭리를 취한다"는 소문이 퍼지고 있습니다.',
  strike: '발전 노조가 임금 인상을 요구하며 파업을 예고했습니다.',
  pact: '국제 탄소 협약 가입을 요청받았습니다. 가입하면 탄소세가 오르는 대신 무탄소 설비가 싸집니다.',
  protest_nuclear: '원전 반대 시위가 크게 벌어지고 있습니다.',
  election: '총선이 다가옵니다. 공약을 걸면 지지를 얻지만, 못 지키면 그만큼 잃습니다.',
  olympics: '올림픽 유치 기회입니다. 2년 뒤 여섯 달 동안 전력 수요가 20% 늘어납니다.',
  factory: '대기업이 공장 단지를 짓겠다고 합니다. 보조금을 받지만 수요가 5% 늘어납니다.',
  datacenter: '초대형 데이터센터 유치 기회입니다. 큰 보조금을 받지만 수요가 10% 뜁니다.',
  scout: '해외 연구소가 문을 닫아 연구팀을 통째로 데려올 수 있습니다.',
  export_boom: '이웃 나라가 전력난입니다. 여섯 달 동안 수출값이 두 배가 됩니다.',
  breakthrough: '연구소에서 뜻밖의 성과가 나왔습니다.',
  recall: '제조사가 한 기종의 결함을 발표했습니다. 고치지 않으면 여섯 달 동안 출력이 떨어집니다.',
};
function decisionById(id) { return DECISIONS.find((d) => d.id === id); }

// ---------- 위기 일정표 ----------
//  20년 기준 8번: 경제 3 · 재해 2 · 정치 3 → 순서를 섞고, 간격도 판마다 다르게 (약 11~49개월, 보통 14~34개월). 임기가 길면 그만큼 벌어짐
//  횟수와 종류 구성이 같아 난이도는 비슷하지만, 언제 무엇이 올지는 판마다 다름
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeCrisisPlan(state, years) {
  const cats = shuffled(['economy', 'disaster', 'politics', 'economy', 'disaster', 'politics', 'politics', 'economy']);
  const plan = [];
  const start = monthIdxOf(state);
  const total = Math.max(years || 20, 10);
  // 임기를 (위기 수 + 1)개의 구간으로 나누되 구간 길이를 0.6~1.4배로 흔듦. 마지막 구간은 임기 끝의 여유
  const w = cats.map(() => 0.6 + Math.random() * 0.8); const tailW = 0.6 + Math.random() * 0.8;
  const sum = w.reduce((a, b) => a + b, 0) + tailW;
  const span = total * 12 - 24;
  let acc = 0;
  cats.forEach((cat, i) => { acc += w[i]; plan.push({ at: start + 6 + Math.round(span * acc / sum), cat, done: false }); });
  // 정책 결정: 에너지 정책이 먼저(1년 차 끝 무렵 — 8년 뒤 재검토가 재선 공약 발표보다 앞서도록 9~11개월째), 나머지 셋은 순서를 섞어 2~4년 차에 하나씩(±3개월)
  //  각각 8년(POLICY_REVIEW_MONTHS) 뒤 재검토. 정해진 시점은 state.policyAt에 남겨 정책 탭이 "몇 개월 뒤 결정"을 보여 줌
  const polAt = { energy: 9 + Math.floor(Math.random() * 3) };
  shuffled(Object.keys(POLICIES).filter((k) => k !== 'energy')).forEach((k, i) => { polAt[k] = 24 + 12 * i + Math.floor(Math.random() * 7) - 3; });
  state.policyAt = polAt;
  for (const key of Object.keys(POLICIES)) {
    for (let at = start + polAt[key]; at < start + total * 12 - 12; at += POLICY_REVIEW_MONTHS) plan.push({ at, cat: 'policy', id: 'policy_' + key, done: false });
  }
  plan.sort((a, b) => a.at - b.at);
  return plan;
}
// 이 판에서 그 정책을 처음 정하는 달 (시작부터 몇 개월째). 예전 저장에는 없으므로 기본 시점으로
function policyAtOf(state, key) { return (state && state.policyAt && state.policyAt[key] !== undefined) ? state.policyAt[key] : POLICIES[key].at; }

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
  // 기회: 평균 22개월에 한 번 (제조업 육성이면 2배). 화제보다 먼저 굴려서, 화제가 잦아져도 기회 빈도는 그대로
  if (yearsElapsed(state) >= 1 && Math.random() <= policyMods(state).offerMult / 22) {
    const pool = DECISIONS.filter((d) => !d.crisis && d.cat !== 'policy' && d.cat !== 'buzz' && usable(d));
    if (pool.length) return pickRandom(pool);
  }
  // 정국 카드: 에너지 정책을 둘러싼 정치·사회 사건 (events4.js). 평균 넉 달 남짓에 한 번
  //  - 마지막 카드 뒤 BUZZ_GAP_MIN개월은 쉬고, 그 뒤로 달마다 BUZZ_CHANCE 확률 → 간격이 3~8개월로 들쭉날쭉
  //  - 이 판에서 아직 안 나온 카드부터 뽑음 (다 나왔으면 5년 지난 것). 때를 타는 카드는 그때 더 잘 뽑힘(가중치 w)
  if ((state.history || []).length >= BUZZ_FROM_MONTH && now - (state.lastBuzzAt === undefined ? -99 : state.lastBuzzAt) >= BUZZ_GAP_MIN && Math.random() < BUZZ_CHANCE) {
    const seen = new Set(recent.map((r) => r.id));
    let buzz = DECISIONS.filter((d) => d.cat === 'buzz' && !seen.has(d.id) && usable(d));
    if (!buzz.length) buzz = DECISIONS.filter((d) => d.cat === 'buzz' && usable(d));
    if (buzz.length) { state.lastBuzzAt = now; return pickWeighted(buzz); }
  }
  return null;
}
const BUZZ_FROM_MONTH = 2;   // 화제가 나오기 시작하는 때 (시작 뒤 몇 개월)
const BUZZ_GAP_MIN = 3;      // 정국 카드 사이 최소 간격 (개월). 예전의 가벼운 화제 카드보다 무게가 있어 한 달 늘림
const BUZZ_CHANCE = 0.4;     // 그 뒤로 달마다 나올 확률 → 평균 간격 = BUZZ_GAP_MIN + 1 / BUZZ_CHANCE − 1 = 4.5개월
function pickWeighted(arr) {
  const total = arr.reduce((s, d) => s + (d.w || 1), 0);
  let pick = Math.random() * total;
  for (const d of arr) { pick -= (d.w || 1); if (pick <= 0) return d; }
  return arr[arr.length - 1];
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
    id: 'rd100', icon: '🔬', title: '연구소 규모 100', months: 48, reward: { money: 1500, happy: 3 }, penalty: { happy: 3 },
    desc: '연구소를 키워 연구소 규모 100에 도달하세요. 2단계 연구가 열립니다.',
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
    cond: (s) => yearsElapsed(s) >= 2 && s.lastReport && renShareOf(s.lastReport) >= 0.08 && onlineOf(s, (p) => !!p.renewable).length >= 4,   // 재생 비중이 8% 이상이고 시작 설비(태양광 1 · 풍력 1) 말고도 2기 넘게 지은 사람에게만
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
      (cleanCapOf(s) >= peakDemandOf(s) * 0.35 || (s.tech.nuclear || 0) >= 2 || (s.tech.ccgt || 0) >= 5 || (s.tech.coal || 0) >= 5),
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
    id: 'happy90', icon: '😊', title: '민심 75 회복', months: 36, reward: { money: 1000 }, penalty: { happy: 2 },
    desc: '민심을 75 이상으로 끌어올리세요.',
    cond: (s) => s.happiness < 48,
    check: (s) => s.happiness >= 62,
    progress: (s) => fmt(s.happiness) + ' / 62',
  },
  // ---------- 사건의 선택에서 이어지는 후속 목표 (자동으로는 안 주어짐) ----------
  {
    id: 'fuel_diversify', icon: '🧯', title: '연료 다변화', months: 18, followup: true, reward: { money: 1500, happy: 3 }, penalty: { happy: 3, gasShock: true, text: '가스 의존 지속 · 3개월 연료비 ×1.3' },
    desc: 'LNG 위기의 교훈: 18개월 안에 가스가 아닌 조절 가능 설비(석탄·원전·SMR)를 1기 더 가동하세요.',
    cond: () => true,
    base: (s) => ({ n: onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length }),
    check: (s, r, q) => onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length > q.base.n,
    progress: (s, q) => (onlineOf(s, (p) => p.kind === 'coal' || p.kind === 'nuclear' || p.isStorage).length - q.base.n) + ' / 1기 추가',
  },
  {
    id: 'austerity', icon: '📉', title: '재정 건전화', months: 12, followup: true, hold: true, reward: { happy: 2 }, rewardNote: '낸 이자의 절반 환급', penalty: { happy: 3, money: 600, text: '신용도 하락으로 위약금 600억' },
    desc: '국채를 차환한 대가: 1년 동안 흑자를 지키세요. 두 달 연속 적자면 실패입니다. 성공하면 낸 이자의 절반을 돌려받습니다.',
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
    desc: '탄소 협약 이행: 3년 안에 무탄소 설비(원전·SMR·태양광·풍력)를 3기 더 가동하세요. 건설비 할인이 끝나기 전에 서두르세요.',
    cond: () => true,
    base: (s) => ({ n: onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length }),
    check: (s, r, q) => onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length - q.base.n >= 3,
    progress: (s, q) => (onlineOf(s, (p) => p.kind === 'nuclear' || p.kind === 'solar' || p.kind === 'wind' || p.isStorage).length - q.base.n) + ' / 3기',
  },
];
// 재선: 10년을 채우는 달의 민심이 기준 이상이어야 임기를 이어 감 (평균이 아니라 그 달의 값). 선거 2년 전에 예고(startMonth에서 부여)
QUESTS.push({
  id: 'reelection', icon: '🗳', title: '재선 (10년 차 선거)', months: ECON.electionNotice, followup: true, hold: true,
  reward: { happy: 4 }, penalty: { text: '정권이 바뀌어 임기 종료' },
  desc: '10년 차가 끝날 때 선거가 있습니다. 10년을 넘기는 그 달의 민심이 ' + ECON.electionBar + ' 이상이면 재선에 성공해 임기를 이어 갑니다. 못 미치면 정권이 바뀌어 게임이 끝납니다.',
  cond: () => true,
  fail: (s, r, q) => monthIdxOf(s) >= q.deadline && s.happiness < ECON.electionBar,
  check: (s, r, q) => monthIdxOf(s) >= q.deadline && s.happiness >= ECON.electionBar,
  progress: (s, q) => '지금 민심 ' + fmt(s.happiness, 1) + ' / ' + ECON.electionBar + ' · 선거까지 ' + Math.max(0, q.deadline - monthIdxOf(s) + 1) + '개월',
});
// ============================================================
// 정책 공약: 정책 노선을 고르면 그 노선에 맞는 장기 약속이 따라옴 (정책 → 설비 → 테크 → R&D가 한 줄로 이어지게)
//  지키면 민심 +moodPledgeKept(임기 끝까지), 기한을 넘기면 −moodPledgeBroken. 늦게라도 지키면 벌점만 사라짐. 노선을 바꾸면 예전 공약은 없어짐
//  판정은 happinessChange(sim.js)의 "정책 공약" 요인이 목표 상태(done/failed)를 보고 매달 반영
// ============================================================
function nukeShareOf(r) { const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return t > 0 ? g.nuclear / t : 0; }
function renTiersOf(s) { return (s.tech.solar || 0) + (s.tech.wind || 0); }
function thermalTiersOf(s) { return (s.tech.ccgt || 0) + (s.tech.coal || 0); }
// 태양광·풍력 가운데 적은 쪽의 발전 비중 (둘을 고르게 섞었는지 보는 값)
function renMinShareOf(r) { const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return t > 0 ? Math.min(g.solar, g.wind) / t : 0; }
function thermalShareOf(r) { const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return t > 0 ? (g.coal + g.ccgt + g.gt) / t : 0; }
// 최근 12개월 평균 체감 요금과 기대 요금 (기록이 12개월 안 되면 null)
function feltYearOf(s) {
  const h = (s.history || []).slice(-12);
  if (h.length < 12 || h.some((x) => x.felt === undefined)) return null;
  return { felt: h.reduce((a, x) => a + x.felt, 0) / 12, ref: h.reduce((a, x) => a + x.pref, 0) / 12 };
}
// 공약한 달부터 센, 지금까지 이어진 무정전 개월 수
function noBlackoutRunOf(s, q) {
  const h = s.history || []; let n = 0;
  for (let i = h.length - 1; i >= 0 && !(h[i].blackoutHours > 0); i--) n++;
  return Math.max(0, Math.min(n, monthIdxOf(s) - q.start + 1));
}
function normPeakOf(s) { return s.cities.reduce((a, c) => a + c.pop, 0) * perCapitaNow(s); }   // 계절·날씨·사건의 영향을 뺀 최대 수요 (인구 × 1인당 수요). 예전에는 계절 배율만 나눠서, 봄가을에 잰 값이 여름·겨울보다 7%쯤 작게 나왔음
function crowdedCitiesOf(s) { return s.cities.filter((c) => cityDensity(c) > ECON.densityLimit).length; }
const PLEDGES = [
  {
    id: 'pledge_energy_nuclear', policy: 'energy', months: 120, title: '공약: 원전 시대', brief: '10년 안에 원자력 비중 30% + 원자력 테크 5단계',
    short: '10년 안에 원전·SMR로 한 달 전기의 30% 이상을 만들고, 원자력 테크 5단계까지 개발',
    check: (s, r) => nukeShareOf(r) >= 0.3 && (s.tech.nuclear || 0) >= 5,
    progress: (s) => '원자력 ' + (s.lastReport ? fmt(nukeShareOf(s.lastReport) * 100) : '0') + '% / 30% · 테크 ' + (s.tech.nuclear || 0) + ' / 5단계',
  },
  {
    id: 'pledge_energy_thermal', policy: 'energy', months: 120, title: '공약: 깨끗한 화력', brief: '10년 안에 화력 비중 50% + 복합발전·석탄 테크 합쳐 8단계',
    short: '10년 안에 복합발전·석탄으로 한 달 전기의 50% 이상을 만들고, 복합발전·석탄 테크를 합쳐 8단계 개발',
    check: (s, r) => thermalShareOf(r) >= 0.5 && thermalTiersOf(s) >= 8,
    progress: (s) => '화력 ' + (s.lastReport ? fmt(thermalShareOf(s.lastReport) * 100) : '0') + '% / 50% · 테크 ' + thermalTiersOf(s) + ' / 8단계',
  },
  {
    id: 'pledge_energy_renew', policy: 'energy', months: 120, title: '공약: 재생에너지 전환', brief: '10년 안에 태양광·풍력 비중 40% (각각 10% 이상) + 테크 합쳐 6단계',
    short: '10년 안에 태양광·풍력으로 한 달 전기의 40% 이상을 만들되 둘 다 10% 이상이 되게 섞고, 태양광·풍력 테크를 합쳐 6단계 개발',
    check: (s, r) => renShareOf(r) >= 0.4 && renMinShareOf(r) >= 0.1 && renTiersOf(s) >= 6,
    progress: (s) => { const r = s.lastReport, g = r && r.energy.gen, t = g ? (g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind) || 1 : 1; return '태양광 ' + (g ? fmt(g.solar / t * 100) : '0') + '% + 풍력 ' + (g ? fmt(g.wind / t * 100) : '0') + '% / 40% (각 10%↑) · 테크 ' + renTiersOf(s) + ' / 6단계'; },
  },
  {
    // 자유화의 약속은 "결국 전기값이 내려간다". 기한이 되는 해에 한 번 평가 (선거처럼). 요금 지원으로 맞춰도 인정
    id: 'pledge_market_free', policy: 'market', months: 96, title: '공약: 경쟁으로 싼 전기', brief: '8년 뒤 소비자 요금이 기대 요금 이하',
    short: '8년 뒤, 그 직전 1년 동안 국민이 낸 평균 전기 요금(요금 지원 포함)이 기대 요금 이하',
    fail: (s, r, q) => { const f = feltYearOf(s); return monthIdxOf(s) >= q.deadline && !(f && f.felt <= f.ref * ECON.pledgeFreePriceRatio); },
    check: (s, r, q) => { const f = feltYearOf(s); return monthIdxOf(s) >= q.deadline && !!f && f.felt <= f.ref * ECON.pledgeFreePriceRatio; },
    progress: (s) => { const f = feltYearOf(s); return f ? '최근 1년 체감 요금 ' + fmt(f.felt) + '원 / 기대 ' + fmt(f.ref * ECON.pledgeFreePriceRatio) + '원 이하' + (f.felt <= f.ref * ECON.pledgeFreePriceRatio ? ' (지금 기준 통과)' : ' (지금 기준 미달)') : '1년 기록이 쌓이면 표시'; },
  },
  {
    id: 'pledge_market_regulated', policy: 'market', months: 96, title: '공약: 끊기지 않는 전기', brief: '8년 안에 정전 없는 24개월 연속',
    short: '8년 안에 정전 없는 24개월 연속 달성 (약속한 달부터 셈)',
    check: (s, r, q) => noBlackoutRunOf(s, q) >= 24,
    progress: (s, q) => '무정전 ' + noBlackoutRunOf(s, q) + ' / 24개월 연속',
  },
  {
    id: 'pledge_industry_growth', policy: 'industry', months: 96, title: '공약: 산업 강국', brief: '8년 안에 최대 전력 수요 2.5배',
    short: '8년 안에 최대 전력 수요를 지금의 2.5배로 (전기가 넉넉해야 공장과 사람이 들어옵니다)',
    base: (s) => ({ peak: normPeakOf(s) }),
    check: (s, r, q) => normPeakOf(s) >= q.base.peak * 2.5,
    progress: (s, q) => '최대 수요 ' + fmt(normPeakOf(s) / q.base.peak, 2) + '배 / 2.5배',
  },
  {
    id: 'pledge_industry_balance', policy: 'industry', months: 72, title: '공약: 고른 국토', brief: '6년 안에 새 도시 2곳 + 과밀 도시 없음',
    short: '6년 안에 새 도시 2곳을 세우고, 과밀 도시가 하나도 없게',
    base: (s) => ({ n: s.cities.length }),
    check: (s, r, q) => s.cities.length >= q.base.n + 2 && crowdedCitiesOf(s) === 0,
    progress: (s, q) => '새 도시 ' + Math.min(2, s.cities.length - q.base.n) + ' / 2곳 · 과밀 도시 ' + crowdedCitiesOf(s) + '곳',
  },
  {
    id: 'pledge_rd_public', policy: 'rd', months: 72, title: '공약: 과학 기술 입국', brief: '6년 안에 연구소 규모 300',
    short: '6년 안에 연구소 규모 300 달성 (8단계 연구가 열리는 수준)',
    check: (s) => rdLevel(s) >= 300,
    progress: (s) => '연구소 규모 ' + fmt(rdLevel(s)) + ' / 300',
  },
  {
    id: 'pledge_rd_private', policy: 'rd', months: 72, title: '공약: 기술 상용화', brief: '6년 안에 연구 12건 성공',
    short: '6년 안에 테크 연구 12건 성공',
    base: (s) => ({ tiers: totalTiers(s) }),
    check: (s, r, q) => totalTiers(s) - q.base.tiers >= 12,
    progress: (s, q) => '연구 성공 ' + (totalTiers(s) - q.base.tiers) + ' / 12건',
  },
];
for (const d of PLEDGES) QUESTS.push(Object.assign({ icon: '📜', followup: true, pledge: true, reward: {}, penalty: {}, cond: () => true, desc: d.short + '.' }, d));

// ============================================================
// 재선 공약: 선거 1년 전(9년 차 말)에 발표하는 2기 국정 과제. 후반 10년의 목표
//  - 분야 하나와 수위 하나를 고름. 수위 = 현실적 · 과감 · 파격 (같은 분야라도 약속하는 숫자가 다름)
//      과감할수록 발표 직후 "공약 기대감"으로 민심이 올라 재선에 도움이 되지만, 달성은 훨씬 어렵고 못 지켰을 때 타격도 큼
//  - 기한은 18년 차 말. 한 달 반짝이 아니라 최근 12개월 평균으로 판정
//  - 지키면 임기 끝까지 민심 +kept. 못 지키면 그달 민심 −hit, 그 뒤로 민심 −broken (늦게라도 지키면 민심 벌점만 사라짐)
//  - 숫자의 근거 (봇 실험 2026-11-21, 재선 뒤 8년 동안의 12개월 평균 최고치):
//      평소대로 하면 재생 39~60% · 수출 0~19% · 요금/기대 0.48~0.96 · 수요 1.4~2.0배 · 노선 트리 8~9, 원자력 13~15, 계통 7~9
//      일부러 챙기면 재생 75%는 3판 중 2판(약 6년), 수출 30%는 3판 중 1판, 수요 2.2배는 성장 정책+도시로 3판 중 2판, 트리 끝 단계는 5판 모두 실패
//      수위를 나눈 뒤 일부러 챙기는 봇 (각 2판): 수출 15%는 2판 모두, 25%는 1판 + 늦게 1판, 35%는 1판 → 파격을 40%로 올림. 재생 55%는 2판 모두, 70%는 1판 + 늦게 1판, 85%는 2판 모두(7~8년 걸림) → 파격을 90%로 올림
//      다시 잰 값 (일부러 챙기는 봇, 각 6~7판): 재생 55%는 6판 모두 / 70%도 6판 모두라 과감을 80%로 올림 → 7판 중 4판(+늦게 1) / 90%는 10판 모두 실패(기한 때 77~86%)
//        수출 15%는 6판 중 4판(+늦게 1) / 25%는 3판(+늦게 1) / 40%는 1판. 수요 1.9배는 5판(+늦게 1) / 2.3배는 3판(+늦게 3) / 2.7배는 0판(+늦게 1)
//        선거하는 달의 민심(재생 노선 6판 평균): 현실적 80 · 과감 87 · 파격 95. 과감(재생 80%)에서 지킨 판 평균 848점, 못 지킨 판 743점
//      값싼 전기 · 에너지 자립 · 기술의 수위별 숫자는 위 측정치로 어림한 값 (챙기는 봇이 없어 칸마다 따로 재지는 못함)
//  - 카드에는 내 에너지 정책에 맞는 분야 하나 + 공통 셋이 뜸
// ============================================================
const TERM2_LEAD_MONTHS = 12;        // 선거 몇 달 전에 공약을 발표하나
const TERM2_DEADLINE_MONTH = 216;    // 18년 차 말 (임기 216번째 달)
const TERM2_BOOST_FULL = 12, TERM2_BOOST_FADE = 12;   // 공약 기대감: 발표 뒤 12개월은 온전히, 그 뒤 12개월에 걸쳐 사라짐
const TERM2_LEVELS = [
  { name: '현실적인 약속', short: '현실적', kept: 2,   broken: 3, hit: 8,  boost: 0 },
  { name: '과감한 약속',   short: '과감',   kept: 3.5, broken: 5, hit: 12, boost: 2 },
  { name: '파격적인 약속', short: '파격',   kept: 5,   broken: 7, hit: 16, boost: 4 },
];
function avg12Of(s, f) { const h = (s.history || []).slice(-12); return h.length ? h.reduce((a, x) => a + (f(x) || 0), 0) / h.length : 0; }
// 연구 공약이 보는 트리: 내 노선의 트리 전부 (중립이면 가장 많이 올린 두 트리) + 계통
function term2TechKeys(s) {
  const line = typeof techLineOf === 'function' ? techLineOf(s) : null;
  return line ? TECH_LINE[line].slice() : TECH_ORDER.filter((k) => k !== 'grid').sort((a, b) => (s.tech[b] || 0) - (s.tech[a] || 0)).slice(0, 2);
}
// 기술 공약이 요구하는 단계: 10단계 트리 기준 숫자를 15단계인 원자력에 맞게 바꿈 (7 → 11, 8 → 13, 10 → 15)
function term2TechNeed(k, t) { return TECH[k].tiers.length >= 15 ? ({ 7: 11, 8: 13, 10: 15 }[t] || Math.round(t * 1.5)) : t; }
const pct0 = (v) => Math.round(v * 100) + '%';   // (이 파일이 읽힐 때 바로 쓰이므로 ui.js의 fmt를 쓰지 않음)
//  분야: value(s, q) = 지금 값 · ok(v, t) = 달성 여부 · targets = 수위별 목표 · show = 내 에너지 정책에 맞을 때만 뜨는 분야
const TERM2_THEMES = [
  { key: 'renew', ico: '🌱', color: '#6fd08c', title: '재생에너지 대전환', what: '태양광·풍력이 1년 평균 발전량에서 차지하는 비중',
    show: (s) => pol(s, 'energy') === 'renew', targets: [0.55, 0.80, 0.90], fmtT: pct0, goal: (t) => '재생 ' + pct0(t),
    brief: (t) => '태양광·풍력이 1년 평균 발전량의 ' + pct0(t) + ' 이상', value: (s) => avg12Of(s, (x) => x.ren), ok: (v, t) => v >= t, fmtV: pct0 },
  { key: 'export', ico: '🔌', color: '#c58af9', title: '전력 수출 강국', what: '이웃 나라에 파는 전기가 1년 평균 우리 수요에서 차지하는 비중',
    show: (s) => pol(s, 'energy') === 'nuclear', targets: [0.15, 0.25, 0.40], fmtT: pct0, goal: (t) => '수출 ' + pct0(t),
    brief: (t) => '전력 수출이 1년 평균 수요의 ' + pct0(t) + ' 이상', value: (s) => avg12Of(s, (x) => x.exp), ok: (v, t) => v >= t, fmtV: (v) => fmt(v * 100, 1) + '%' },
  { key: 'growth', ico: '🏙', color: '#ffab5c', title: '성장 국가', what: '최대 전력 수요가 공약을 발표한 때의 몇 배가 되는가',
    show: (s) => pol(s, 'energy') !== 'renew' && pol(s, 'energy') !== 'nuclear', targets: [1.8, 2.15, 2.5], fmtT: (t) => t + '배', goal: (t) => '수요 ' + t + '배',
    brief: (t) => '최대 전력 수요를 지금의 ' + t + '배로', base: (s) => ({ peak: normPeakOf(s) }), value: (s, q) => normPeakOf(s) / ((q && q.base && q.base.peak) || normPeakOf(s)), ok: (v, t) => v >= t, fmtV: (v) => fmt(v, 2) + '배' },
  { key: 'price', ico: '💡', color: '#ffd666', title: '값싼 전기', what: '국민이 내는 요금(요금 지원 포함)이 1년 평균 기대 요금의 몇 %인가',
    targets: [0.70, 0.55, 0.40], fmtT: pct0, goal: (t) => '요금 ' + pct0(t),
    brief: (t) => '소비자 요금이 1년 평균 기대 요금의 ' + pct0(t) + ' 이하', value: (s) => { const f = feltYearOf(s); return f ? f.felt / f.ref : 1; }, ok: (v, t) => v <= t, fmtV: pct0 },
  { key: 'gas', ico: '🛡', color: '#5ad1e0', title: '에너지 자립', what: '가스 발전(복합발전)이 1년 평균 발전량에서 차지하는 비중',
    show: (s) => pol(s, 'energy') !== 'thermal',   // 화력 중심 노선에는 내지 않음: 복합발전을 주력으로 키우기로 한 노선에 복합발전을 줄이라는 약속은 어긋남
    targets: [0.25, 0.10, 0.03], fmtT: pct0, goal: (t) => '가스 ' + pct0(t),
    brief: (t) => '가스 발전이 1년 평균 발전량의 ' + pct0(t) + ' 이하', value: (s) => ((s.history || []).length >= 12 ? avg12Of(s, (x) => (x.gasS === undefined ? 1 : x.gasS)) : 1), ok: (v, t) => v <= t, fmtV: pct0 },
  { key: 'tech', ico: '🔬', color: '#7fb6ff', title: '기술 선도국', what: '내 노선의 테크트리와 계통 테크를 모두 몇 단계까지 올리는가 (가장 낮은 것 기준)',
    targets: [7, 8, 10], fmtT: (t) => t + '단계', goal: (t) => '테크 ' + t + '단계',
    brief: (t) => '내 노선 트리와 계통 테크를 모두 ' + t + '단계까지' + (t >= 10 ? ' (끝 단계)' : '') + ' · 원자력은 ' + ({ 7: 11, 8: 13, 10: 15 }[t]) + '단계',
    // 값 = 10단계 눈금으로 본 "가장 덜 올린 트리의 단계"
    value: (s) => Math.min.apply(null, term2TechKeys(s).concat(['grid']).map((k) => (s.tech[k] || 0) * 10 / TECH[k].tiers.length)),
    ok: (v, t, s) => term2TechKeys(s).concat(['grid']).every((k) => (s.tech[k] || 0) >= term2TechNeed(k, t)),
    fmtV: (v) => fmt(v, 1) + '단계', nowText: (s) => term2TechKeys(s).concat(['grid']).map((k) => TECH[k].name.replace(' · 배터리', '') + ' ' + (s.tech[k] || 0)).join(' · ') },
];
function term2Theme(key) { return TERM2_THEMES.find((t) => t.key === key); }
// 분야 × 수위마다 공약 하나 (id = term2_<분야>_<수위>)
for (const T of TERM2_THEMES) TERM2_LEVELS.forEach((L, lv) => {
  const t = T.targets[lv];
  QUESTS.push({
    id: 'term2_' + T.key + '_' + lv, icon: '🗳', followup: true, pledge: true, term2: true, policy: 'term2', theme: T.key, lv,
    title: '재선 공약: ' + T.title, brief: T.brief(t) + ' (' + L.short + ')', short: '18년 차 말까지, ' + T.brief(t) + ' — ' + L.name,
    desc: '18년 차 말까지, ' + T.brief(t) + '. ' + L.name + '.',
    kept: L.kept, broken: L.broken, boost: L.boost, reward: {}, penalty: { happy: L.hit }, cond: () => true,
    base: T.base,
    check: (s, r, q) => T.ok(T.value(s, q), t, s),
    progress: (s, q) => (T.nowText ? T.nowText(s) : T.fmtV(T.value(s, q))) + ' / ' + T.fmtT(t) + (T.key === 'price' || T.key === 'gas' ? ' 이하' : ''),
  });
});
// 재선 공약을 약속함 (기한 = 임기 216번째 달)
function giveTerm2(state, id) {
  const def = questById(id); if (!def) return '';
  if (!state.quests) state.quests = [];
  state.quests = state.quests.filter((q) => { const d = questById(q.id); return !(d && d.term2); });
  const now = monthIdxOf(state);
  const left = Math.max(12, TERM2_DEADLINE_MONTH - (state.history || []).length);
  state.quests.push({ id, start: now, deadline: now + left - 1, status: 'active', base: def.base ? def.base(state) : {} });
  return def.title.replace('재선 공약: ', '');
}
// 공약 기대감: 과감한 약속을 발표하면 한동안 민심이 오름 (발표 뒤 TERM2_BOOST_FULL개월은 온전히, 그 뒤 TERM2_BOOST_FADE개월에 걸쳐 사라짐)
function term2BoostNow(state, q, def) {
  if (!def || !def.boost) return 0;
  const age = monthIdxOf(state) - q.start;
  if (age < TERM2_BOOST_FULL) return def.boost;
  return age < TERM2_BOOST_FULL + TERM2_BOOST_FADE ? def.boost * (TERM2_BOOST_FULL + TERM2_BOOST_FADE - age) / TERM2_BOOST_FADE : 0;
}
function isPledgeQuest(q) { const d = questById(q.id); return !!(d && d.pledge); }
// 정책 선택지 설명에 붙는 공약 한 줄
function pledgeLine(key, opt) {
  const id = POLICIES[key].options[opt].pledge; const d = id && questById(id);
  return d ? '<br><b>📜 공약</b> ' + d.short + '. 지키면 민심 +' + ECON.moodPledgeKept + '(임기 끝까지), 기한을 넘기면 민심 −' + ECON.moodPledgeBroken + '.' : '';
}
// 정책 선택지 한 칸: 민심 → 좋은 점 → 부담 → 공약 순서로 한 줄씩 (긴 설명 대신 핵심만)
function policyChoiceHtml(s, key, opt) {
  const o = POLICIES[key].options[opt], cur = s.policies && s.policies[key];
  const li = (cls, mark, text) => '<span class="pt ' + cls + '"><i>' + mark + '</i>' + text + '</span>';
  let html = '';
  if (o.happy) html += li(o.happy > 0 ? 'good' : 'bad', o.happy > 0 ? '+' : '−', '민심 ' + (o.happy > 0 ? '+' : '−') + Math.abs(o.happy) + ' <small>(이 노선을 유지하는 동안)</small>');
  for (const g of o.good || []) html += li('good', '+', g);
  for (const b of o.bad || []) html += li('bad', '−', b);
  if (!html) html = li('none', '·', '보너스도 제약도 없음');
  const pd = o.pledge && questById(o.pledge);
  if (cur === opt) html += li('none', '·', '지금 노선 유지 (공약도 그대로)');
  else {
    if (pd) html += '<span class="pt pledge"><i>📜</i>공약: ' + (pd.brief || pd.short) + (pledgeEarlyMonths(s, key) > 0 ? ' <small>(일찍 정해 기한 +' + pledgeEarlyMonths(s, key) + '개월)</small>' : '') + ' <small>지키면 민심 +' + ECON.moodPledgeKept + ' · 어기면 −' + ECON.moodPledgeBroken + '</small></span>';
    else html += li('none', '·', '공약 없음');
    if (cur) html += li('bad', '−', '정책 번복: 민심 −4, 지금 공약은 사라짐');
  }
  return '<span class="pts">' + html + '</span>';
}
// 정책을 정하면(또는 바꾸면) 그 노선의 공약을 줌. 같은 정책의 예전 공약은 지움 (보너스·벌점도 함께 사라짐)
function givePledge(state, key, opt) {
  if (!state.quests) state.quests = [];
  state.quests = state.quests.filter((q) => { const d = questById(q.id); return !(d && d.pledge && d.policy === key); });
  const id = POLICIES[key].options[opt] && POLICIES[key].options[opt].pledge;
  if (!id) return '';
  const def = questById(id); const now = monthIdxOf(state);
  // 임기가 얼마 안 남았으면 기한을 줄임 (임기 끝나기 6개월 전까지)
  const termLeft = (state.mode === 'normal' ? ECON.normalYears : 20) * 12 - (state.history || []).length;
  // 정책을 정하는 순서가 판마다 달라도 공약이 더 어려워지지는 않게: 기본 시점(POLICIES[key].at)보다 일찍 정했으면 그만큼 기한을 늘림
  const months = Math.max(12, Math.min(def.months + pledgeEarlyMonths(state, key), termLeft - 6));
  state.quests.push({ id, start: now, deadline: now + months - 1, status: 'active', base: def.base ? def.base(state) : {} });
  return ' → 📜 ' + def.title + ' (' + (months % 12 === 0 ? months / 12 + '년' : Math.floor(months / 12) + '년 ' + (months % 12) + '개월') + ' 기한)';
}
// 이 정책을 기본 시점보다 몇 달 일찍 정하는가 (재검토 때는 0)
function pledgeEarlyMonths(state, key) { return Math.max(0, POLICIES[key].at - ((state && state.history) || []).length); }
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
  const normal = state.quests.filter((q) => q.id !== 'reelection' && !isPledgeQuest(q));   // 재선·공약은 따로 셈
  const active = normal.filter((q) => q.status === 'active');
  if (active.length >= 2) return null;
  const now = monthIdxOf(state);
  const lastAt = normal.length ? Math.max(...normal.map((q) => q.start)) : -999;
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
    const def = questById(q.id);
    if (!def) continue;
    if (def.pledge && q.status === 'failed') {
      if (def.check(state, report, q)) { q.status = 'late'; q.lateAt = now; notices.push('📜 뒤늦은 공약 이행: ' + def.title.replace('공약: ', '') + ' (불이행 벌점이 사라졌습니다)'); }
      continue;
    }
    if (q.status !== 'active') continue;
    if (def.fail && def.fail(state, report, q)) { q.status = 'failed'; q.endAt = now; applyPenalty(state, def); notices.push('✕ 목표 실패: ' + def.title + ' (' + penaltyText(def) + ')'); continue; }
    if (def.check(state, report, q)) {
      q.status = 'done'; q.endAt = now;
      if (def.reward.money) state.money += scaleMoney(state, def.reward.money);
      if (q.base && q.base.refund) state.money += q.base.refund;   // 국채 차환: 낸 이자의 절반 환급
      if (def.reward.happy) moodBump(state, def.reward.happy);
      notices.push('🎉 목표 달성: ' + def.title + ' (' + rewardText(def) + ')');
      continue;
    }
    if (now > q.deadline) { q.status = 'failed'; q.endAt = now; applyPenalty(state, def); notices.push('✕ 목표 실패: ' + def.title + ' (' + penaltyText(def) + ')'); }
  }
  return notices;
}
// 실패 벌칙: 민심 하락은 기본, 목표에 따라 벌금·탄소세 인상·연료비 충격이 더해짐
function applyPenalty(state, def) {
  const p = def.penalty || {};
  if (p.happy) moodBump(state, -(p.happy));
  if (p.money) state.money -= p.money;
  if (p.carbonTaxUp) state.carbonTax = Math.min(ECON.carbonTaxMax, Math.round(state.carbonTax * (1 + p.carbonTaxUp)));
  if (p.gasShock) addEffect(state, { name: '가스 의존 후폭풍 (연료비 ×1.3)', gasMult: 1.3 }, 3);
}
function penaltyText(def) {
  if (def.pledge) return def.term2 ? '그달 민심 −' + def.penalty.happy + ', 그 뒤로도 −' + def.broken + ' (늦게라도 지키면 뒤의 몫은 사라짐)' : '민심 −' + (def.broken || ECON.moodPledgeBroken) + ' (늦게라도 지키면 사라짐)';
  const p = def.penalty || {};
  const parts = [];
  if (p.happy) parts.push('민심 −' + p.happy);
  if (p.text) parts.push(p.text);
  return parts.join(' · ');
}
function rewardText(def) { return def.pledge ? '민심 +' + (def.kept || ECON.moodPledgeKept) + ' (임기 끝까지)' : [rewardParts(def.reward), def.rewardNote].filter(Boolean).join(' · '); }

// ============================================================
// 정책 노선: 한 번 정하면 게임 조건이 오래 바뀌어 전략 자체가 갈림. 8년 뒤 재검토(번복하면 지지율 손해)
// ============================================================
const POLICIES = {
  energy: {
    name: '에너지 정책', icon: '⚡', at: 12,
    desc: '앞으로 어떤 발전을 주력으로 키울지 정합니다. 8년 동안 유지되고, 그 뒤 한 번 다시 고를 수 있습니다.',
    options: {
      nuclear: { label: '친원전', pledge: 'pledge_energy_nuclear', good: ['원전·SMR 건설비 −25%', '원전이 많아도 불안 절반'], bad: ['원전 사고 타격 1.5배', '반원전 시위가 잦아짐'], desc: '원전·SMR 건설비 −25% · 원전 밀집 불안 절반 · 원전 사고 타격 1.5배' },
      thermal: { label: '화력 중심', pledge: 'pledge_energy_thermal', good: ['복합발전·석탄 건설비 −20%', '화력 연료비 −10%'], bad: ['환경 점수를 거의 못 받음 (쉽지만 고점이 낮은 길)'], desc: '복합발전·석탄 건설비 −20% · 화력 연료비 −10% · 쉽지만 탄소 때문에 환경 점수를 거의 못 받아 고점이 낮음' },
      renew:   { label: '재생에너지 중심', happy: 1, pledge: 'pledge_energy_renew', good: ['태양광·풍력·배터리 건설비 −20%', '땅을 많이 써도 불만 절반'], bad: ['원전·SMR 건설비 +20%'], desc: '태양광·풍력·배터리 건설비 −20% · 국토 잠식 불만 절반 · 원전·SMR 건설비 +20% · 민심 +1' },
      neutral: { label: '중립', desc: '보너스도 제약도 없음' },
    },
  },
  market: {
    name: '전력시장 정책', icon: '⚖', at: 24,
    desc: '전기값을 시장에 맡길지, 정부가 누를지 정합니다.',    options: {
      free:      { label: '시장 자유화', happy: -1, pledge: 'pledge_market_free', good: ['전기 판매 수입 증가', '초과 이윤 환수 60% → 50%'], bad: ['소비자 요금 상승'], desc: '돈을 더 버는 노선: 초과 이윤 환수 50% (기본 60%) · SMP 마진 1.3배 → 1.5배 · 기저(원전·석탄) 정산조정계수 75% → 85% · 대신 민심 −1, 전기값이 올라 요금 점수가 내려감 · 요금 시위가 잦아짐' },
      regulated: { label: '요금 규제', happy: 1, pledge: 'pledge_market_regulated', good: ['소비자 요금 하락', '용량 요금 1.5배'], bad: ['초과 이윤 환수 60% → 70%', '원전·석탄 정산 단가 하락'], desc: '민심을 얻는 노선: 민심 +1, SMP 상한 −15%로 전기값이 내려가 요금 점수가 오름 · 대신 초과 이윤 환수 70% · 기저 정산조정계수 75% → 65% · 용량 요금은 1.5배(정부 손실 보전)' },
    },
  },
  industry: {
    name: '산업 정책', icon: '🏭', at: 36,
    desc: '나라를 어떤 방향으로 키울지 정합니다.',    options: {
      growth:  { label: '제조업 육성', happy: -3, pledge: 'pledge_industry_growth', good: ['인구·수요 증가 1.25배', '공장 유치 제안 2배'], bad: [], desc: '인구·수요 증가 1.25배 · 공장·데이터센터 유치 제안 2배 · 유치 보조금 1.3배 · 민심 −3 (환경·과밀 부담)' },
      balance: { label: '균형 발전', happy: 2, pledge: 'pledge_industry_balance', good: ['모든 건설비 −10%', '새 도시 조성비 절반'], bad: ['인구·수요 증가 0.85배'], desc: '인구·수요 증가 0.85배 · 모든 설비 건설비 −10% · 새 도시 조성비 −50% · 민심 +2' },
    },
  },
  rd: {
    name: 'R&D 정책', icon: '🔬', at: 48,
    desc: '연구소를 싸게 키울지, 연구를 싸게 할지 정합니다.',
    options: {
      public:  { label: '국가 주도 R&D', pledge: 'pledge_rd_public', good: ['연구소 확장비 −30%'], bad: [], desc: '연구소 확장비 −30%' },
      private: { label: '민간 주도 R&D', pledge: 'pledge_rd_private', good: ['테크 연구비 −25%'], bad: [], desc: '테크 연구비 −25%' },
    },
  },
};
const POLICY_REVIEW_MONTHS = 96;   // 8년 뒤 한 번 재검토

// 현재 정책이 게임 수치에 미치는 영향 (곱셈 계수 묶음)
function policyMods(state) {
  const p = (state && state.policies) || {};
  return {
    nuclearCapex: p.energy === 'nuclear' ? 0.75 : p.energy === 'renew' ? 1.2 : 1,    // 친원전: 원전·SMR 건설비 −25% · 재생에너지 중심: +20%
    nuclearBan: false,                                  // (정책은 중점일 뿐, 어느 노선에서도 다른 설비를 지을 수 있음. 예전에는 재생에너지 중심이면 원전 금지였음)
    cleanCapex: p.energy === 'renew' ? 0.8 : 1,         // 재생에너지 중심: 태양광·풍력·배터리 건설비 −20%
    thermalCapex: p.energy === 'thermal' ? 0.8 : 1,     // 화력 중심: 복합발전·석탄 건설비 −20%
    thermalFuel: p.energy === 'thermal' ? 0.9 : 1,      // 화력 중심: 화력 연료비 −10%
    nuclearOppDelta: p.energy === 'nuclear' ? -1 : 0,
    accidentMult: p.energy === 'nuclear' ? 1.5 : 1,
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
    researcherCost: p.rd === 'public' ? 0.7 : 1,        // 국가 주도 R&D: 연구소 확장비 −30%
    techCost: p.rd === 'private' ? 0.75 : 1,            // 민간 주도 R&D: 테크 연구비 −25%
    patent: 0,
    protestWeight: p.energy === 'nuclear' ? 2 : 1,
    tariffWeight: p.market === 'free' ? 2 : 1,
  };
}
function policyLabel(key, val) { const o = POLICIES[key].options[val]; return o ? o.label : '미정'; }
function researcherCost(state, st) { return Math.round(st.cost * policyMods(state).researcherCost); }

// 정책 결정 사건: 처음엔 정하고, 8년 뒤 재검토 때는 유지(비용 없음) 또는 변경(민심 −4)
for (const key of Object.keys(POLICIES)) {
  const pol = POLICIES[key];
  DECISIONS.push({
    id: 'policy_' + key, cat: 'policy', icon: pol.icon, name: pol.name + ' 결정',
    desc: pol.desc,
    choices: Object.keys(pol.options).map((opt) => ({
      label: pol.options[opt].label,
      desc: (s) => policyChoiceHtml(s, key, opt),      apply(s) {
        if (!s.policies) s.policies = {};
        const prev = s.policies[key];
        let msg = pol.name + ': ' + pol.options[opt].label;
        if (prev && prev !== opt) { moodBump(s, -4); msg += ' (정책 번복, 민심 −4)'; }
        else if (prev) msg += ' (유지)';
        const hv = pol.options[opt].happy || 0;
        if (hv) msg += ' · 노선이 유지되는 동안 민심 ' + (hv > 0 ? '+' : '−') + Math.abs(hv);
        s.policies[key] = opt;
        s.policySetAt = s.policySetAt || {}; s.policySetAt[key] = monthIdxOf(s);
        if (prev !== opt) msg += givePledge(s, key, opt);
        return msg;
      },
    })),
  });
}
