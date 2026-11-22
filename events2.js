// ============================================================
// 사건 확장: 앞선 선택과 이어지는 사건, 정책에 맞춘 목표, 다양한 날씨·환경 사건
//  - events.js의 DECISIONS / QUESTS, plants.js의 EVENTS 배열에 덧붙임
//  - 연계 조건은 chose(사건 id, 선택 문구) · questDone(목표 id) · pol(정책 키)로 판단
// ============================================================

function chose(s, id, substr) { return (s.decisionLog || []).some((d) => d.id === id && (!substr || (d.choice || '').includes(substr))); }
function questDone(s, id) { return (s.quests || []).some((q) => q.id === id && q.status === 'done'); }
function questFailed(s, id) { return (s.quests || []).some((q) => q.id === id && q.status === 'failed'); }
function pol(s, key) { return (s.policies || {})[key]; }
function flag(s, key) { return !!(s.flags && s.flags[key]); }
function setFlag(s, key) { if (!s.flags) s.flags = {}; s.flags[key] = true; }
function rdCount(s) { return Math.floor(rdLevel(s) / 20); }   // (예전의 "연구원 수" 조건을 연구소 규모로 환산)
function intensityNow(s) { return s.lastReport ? reportIntensity(s.lastReport) : 0.4; }
function mountainRenewables(s) { return s.buildings.filter((b) => b.status === 'online' && b.mountain && PLANTS[b.type].renewable).length; }
function stopRandom(s, pred, name, months, n) {
  const list = onlineOf(s, pred).slice();
  let stopped = 0;
  for (let i = 0; i < (n || 1) && list.length; i++) { const b = list.splice(Math.floor(Math.random() * list.length), 1)[0]; stopPlant(s, b, name, months); stopped++; }
  return stopped;
}
const isThermal2 = (p) => p.kind === 'gt' || p.kind === 'ccgt' || p.kind === 'coal';
const isNuke2 = (p) => p.kind === 'nuclear';

DECISIONS.push(
  // ================= 경제 =================
  {
    id: 'won_crash', cat: 'economy', crisis: true, icon: '💱', name: '환율 급등으로 수입 연료비 상승',
    cond: (s) => onlineOf(s, isThermal2).length > 0,
    desc: '원화 가치가 급락해 달러로 사 오는 가스·석탄 값이 함께 뛰었습니다. 아무 조치도 없으면 6개월 동안 가스·석탄 연료비가 1.35배가 됩니다.',
    choices: [
      { label: '환헤지 계약', cost: (s) => scaleMoney(s, 900), desc: (s) => '−' + fmt(scaleMoney(s, 900)) + '억 · 6개월 연료비 ×1.15', apply(s) { const c = scaleMoney(s, 900); s.money -= c; addEffect(s, { name: '환율 충격 (연료비 ×1.15)', gasMult: 1.15, coalMult: 1.15, track: 'noBlackout', reward: { money: scaleMoney(s, 500), happy: 2 } }, 6); return '환헤지 ' + fmt(c) + '억: 6개월 연료비 ×1.15'; } },
      { label: '감수한다', desc: () => '6개월 연료비 ×1.35 · 정전 없이 넘기면 보너스', apply(s) { addEffect(s, { name: '환율 충격 (연료비 ×1.35)', gasMult: 1.35, coalMult: 1.35, track: 'noBlackout', reward: { money: scaleMoney(s, 900), happy: 4 } }, 6); return '환율 충격 감수: 6개월 연료비 ×1.35'; } },
      { label: '수출로 달러를 번다', desc: (s) => onlineOf(s, (p) => p.isLink).length ? '6개월 연료비 ×1.35 + 수출 단가 ×1.4' : '연계선이 없어 고를 수 없음', cost: (s) => onlineOf(s, (p) => p.isLink).length ? 0 : Infinity, apply(s) { addEffect(s, { name: '환율 충격 + 수출 확대 (연료비 ×1.35, 수출 단가 ×1.4)', gasMult: 1.35, coalMult: 1.35, exportMult: 1.4 }, 6); return '수출 확대: 6개월 수출 단가 ×1.4' + giveQuest(s, 'export'); } },
    ],
  },
  {
    id: 'coal_finance', cat: 'economy', crisis: true, icon: '🏦', name: '국제 석탄 금융 제재', minYear: 3,
    cond: (s) => onlineOf(s, (p) => p.kind === 'coal').length > 0,
    desc: '국제 금융기관이 석탄 발전에 대한 투자와 보험을 끊겠다고 발표했습니다. 석탄을 계속 쓰면 투자 비용이 오르고, 폐쇄 계획을 내면 전환 기금을 받을 수 있습니다.',
    choices: [
      { label: '석탄 단계적 폐쇄 로드맵 발표', desc: () => '민심 +3 · 2년 안에 석탄 1기 철거 목표 (달성 시 전환 기금)', apply(s) { moodBump(s, 3); return '석탄 폐쇄 로드맵 발표' + giveQuest(s, 'coal_exit'); } },
      { label: '탄소 포집에 투자', cost: (s) => scaleMoney(s, 1200), desc: (s) => '−' + fmt(scaleMoney(s, 1200)) + '억 · 석탄 테크 다음 연구 확률 +15%', apply(s) { const c = scaleMoney(s, 1200); s.money -= c; if (!s.techPity) s.techPity = {}; s.techPity.coal = (s.techPity.coal || 0) + 0.15; return '탄소 포집 투자 ' + fmt(c) + '억: 석탄 연구 확률 +15%'; } },
      { label: '석탄을 유지한다', desc: () => '12개월 모든 건설비 +15% (투자자 이탈) · 민심 −3', apply(s) { addEffect(s, { name: '석탄 제재 (건설비 +15%)', capexMult: 1.15 }, 12); moodBump(s, -3); setFlag(s, 'coalStay'); return '석탄 유지: 12개월 건설비 +15%, 민심 −3'; } },
    ],
  },
  {
    id: 'lng_terminal', cat: 'economy', icon: '⚓', name: 'LNG 터미널·장기계약 증설 제안', minYear: 2,
    cond: (s) => chose(s, 'lng_war') && onlineOf(s, isGas).length > 0 && !chose(s, 'lng_terminal'),
    desc: 'LNG 위기를 겪은 뒤, 가스공사가 터미널 증설과 20년 장기계약을 제안했습니다. 큰돈이 들지만 앞으로 5년 동안 가스 연료비가 15% 싸집니다.',
    choices: [
      { label: '증설한다', cost: (s) => scaleMoney(s, 2500), desc: (s) => '−' + fmt(scaleMoney(s, 2500)) + '억 · 60개월 가스 연료비 −15%', apply(s) { const c = scaleMoney(s, 2500); s.money -= c; addEffect(s, { name: 'LNG 장기계약 (가스 연료비 −15%)', gasMult: 0.85 }, 60); return 'LNG 터미널 증설 ' + fmt(c) + '억: 5년 가스 연료비 −15%'; } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return 'LNG 터미널 증설을 거절했습니다'; } },
    ],
  },
  {
    id: 'credit_downgrade', cat: 'economy', icon: '📉', name: '국가 신용등급 하락 경고', minYear: 2,
    cond: (s) => (chose(s, 'debt_call', '차환') || s.money < 0) && !chose(s, 'credit_downgrade'),
    desc: '신용평가사가 전력 부문 부채를 이유로 등급 하락을 경고했습니다. 긴축을 선언하거나, 높은 이자를 감수해야 합니다.',
    choices: [
      { label: '긴축 선언', desc: () => '1년 동안 흑자 유지 목표 · 성공 시 보너스', apply(s) { return '긴축 선언' + giveQuest(s, 'austerity'); } },
      { label: '감수한다', desc: (s) => '12개월 매달 ' + fmt(scaleMoney(s, 150)) + '억 이자 부담', apply(s) { const c = scaleMoney(s, 150); addEffect(s, { name: '신용등급 하락 (매달 이자 ' + fmt(c) + '억)', monthlyCost: c }, 12); return '신용등급 하락 감수: 12개월 매달 ' + fmt(c) + '억'; } },
    ],
  },
  // ================= 재해 =================
  {
    id: 'earthquake', cat: 'disaster', crisis: true, icon: '🌋', name: '원전 인근 지진 발생',
    cond: (s) => onlineOf(s, isNuke2).length > 0,
    desc: '원전에서 30km 떨어진 곳에서 규모 5.8 지진이 났습니다. 설비 손상은 확인되지 않았지만 국민은 불안해합니다.',
    choices: [
      { label: '정밀 점검 (2개월 정지)', cost: (s) => scaleMoney(s, 400), desc: (s) => '−' + fmt(scaleMoney(s, 400)) + '억 · 원전 1기 2개월 정지 · 민심 +2', apply(s) { const c = scaleMoney(s, 400); s.money -= c; stopRandom(s, isNuke2, '지진 정밀 점검', 2); moodBump(s, 2); return '정밀 점검: 원전 1기 2개월 정지, 민심 +2'; } },
      { label: '가동 유지', desc: () => '민심 −5 · 30% 확률로 균열 발견 → 6개월 정지', apply(s) { moodBump(s, -5); if (Math.random() < 0.3) { stopRandom(s, isNuke2, '지진 균열 보수', 6); return '가동 유지 → 균열 발견! 원전 1기 6개월 정지, 민심 −5'; } return '가동 유지: 이상 없음, 민심 −5'; } },
    ],
  },
  {
    id: 'wildfire', cat: 'disaster', crisis: true, icon: '🔥', name: '대형 산불', seasons: ['mid'],
    cond: (s) => mountainRenewables(s) > 0,
    desc: '건조한 날씨에 산불이 번져 산지 태양광·풍력 단지를 위협합니다.',
    choices: [
      { label: '진화 예산 투입', cost: (s) => scaleMoney(s, 600), desc: (s) => '−' + fmt(scaleMoney(s, 600)) + '억 · 1개월 태양광 −30%', apply(s) { const c = scaleMoney(s, 600); s.money -= c; addEffect(s, { name: '산불 (태양광 −30%)', kindDerate: { kind: 'solar', factor: 0.3 } }, 1); return '진화 ' + fmt(c) + '억: 1개월 태양광 −30%'; } },
      { label: '자연 진화를 기다린다', desc: () => '2개월 태양광 −60%, 풍력 −30% · 민심 −3', apply(s) { addEffect(s, { name: '산불 (태양광 −60%)', kindDerate: { kind: 'solar', factor: 0.6 } }, 2); addEffect(s, { name: '산불 (풍력 −30%)', kindDerate: { kind: 'wind', factor: 0.3 } }, 2); moodBump(s, -3); return '산불 방치: 2개월 재생 출력 감소, 민심 −3'; } },
    ],
  },
  {
    id: 'flood', cat: 'disaster', crisis: true, icon: '🌊', name: '기록적 폭우와 홍수', seasons: ['summer'],
    cond: (s) => onlineOf(s, isThermal2).length > 0 && !flag(s, 'floodSafe'),
    desc: '하천이 범람해 저지대 발전소가 침수됐습니다. 화력 1기가 복구 때까지 멈춥니다.',
    choices: [
      { label: '제방·배수 시설 투자', cost: (s) => scaleMoney(s, 800), desc: (s) => '−' + fmt(scaleMoney(s, 800)) + '억 · 화력 1기 1개월 정지 · 앞으로 홍수 피해 없음', apply(s) { const c = scaleMoney(s, 800); s.money -= c; stopRandom(s, isThermal2, '침수 복구', 1); setFlag(s, 'floodSafe'); return '제방 투자 ' + fmt(c) + '억: 이후 홍수 면역'; } },
      { label: '복구만 한다', desc: () => '화력 1기 2개월 정지 · 민심 −2', apply(s) { stopRandom(s, isThermal2, '침수 복구', 2); moodBump(s, -2); return '침수 복구: 화력 1기 2개월 정지, 민심 −2'; } },
    ],
  },
  {
    id: 'cyber', cat: 'disaster', crisis: true, icon: '🛡', name: '전력망 사이버 공격', minYear: 4,
    cond: (s) => onlineOf(s, () => true).length >= 4 && !flag(s, 'cyberSafe'),
    desc: '해외 해커 조직이 급전 시스템을 공격했습니다. 발전소 두 곳이 수동 운전으로 전환돼 한 달 동안 멈춥니다.',
    choices: [
      { label: '보안 체계 전면 투자', cost: (s) => scaleMoney(s, 700), desc: (s) => '−' + fmt(scaleMoney(s, 700)) + '억 · 설비 1기 1개월 정지 · 앞으로 사이버 공격 면역', apply(s) { const c = scaleMoney(s, 700); s.money -= c; stopRandom(s, isThermal2, '사이버 공격 복구', 1); setFlag(s, 'cyberSafe'); return '보안 투자 ' + fmt(c) + '억: 이후 사이버 공격 면역'; } },
      { label: '수동 운전으로 버틴다', desc: () => '설비 2기 1개월 정지 · 정전 없이 넘기면 민심 +3', apply(s) { stopRandom(s, isThermal2, '사이버 공격 복구', 1, 2); addEffect(s, { name: '사이버 공격 대응 (수동 운전)', track: 'noBlackout', reward: { money: scaleMoney(s, 300), happy: 3 } }, 1); return '수동 운전: 설비 2기 1개월 정지'; } },
    ],
  },
  // ================= 정치 =================
  {
    id: 'audit', cat: 'politics', crisis: true, icon: '🔎', name: '감사원, 전력 부문 초과 이윤 지적', minYear: 3,
    cond: (s) => s.lastReport && (s.lastReport.money.clawback || 0) > 0,
    desc: '감사원이 전력 부문이 국민 부담으로 과도한 이익을 냈다고 지적했습니다. 이익을 국민에게 돌려주거나 투자로 증명해야 합니다.',
    choices: [
      { label: '6개월 요금 인하로 환원', desc: () => 'SMP 상한 −15% (6개월) · 민심 +4', apply(s) { addEffect(s, { name: '감사 후 요금 인하 (SMP 상한 −15%)', smpCapMult: 0.85 }, 6); moodBump(s, 4); return '요금 인하: 6개월 SMP 상한 −15%, 민심 +4'; } },
      { label: '설비 투자 확대 약속', desc: () => '15개월 안에 조절 설비를 최대 수요의 115%로 (목표)', apply(s) { return '투자 확대 약속' + giveQuest(s, 'capacity_up'); } },
      { label: '반박한다', desc: () => '민심 −4', apply(s) { moodBump(s, -4); return '감사 결과 반박: 민심 −4'; } },
    ],
  },
  {
    id: 'referendum', cat: 'politics', crisis: true, icon: '🗳', name: '원전 건설 주민투표 요구',
    cond: (s) => s.buildings.some((b) => PLANTS[b.type].kind === 'nuclear' && b.status === 'building'),
    desc: '건설 중인 원전 지역 주민들이 주민투표를 요구합니다. 지역 지원금으로 달래거나, 투표를 강행할 수 있습니다.',
    choices: [
      { label: '지역 지원금 지급', cost: (s) => scaleMoney(s, 900), desc: (s) => '−' + fmt(scaleMoney(s, 900)) + '억 · 민심 +2', apply(s) { const c = scaleMoney(s, 900); s.money -= c; moodBump(s, 2); return '지역 지원금 ' + fmt(c) + '억, 민심 +2'; } },
      { label: '투표를 강행한다', desc: () => '50%: 가결(민심 +3) / 50%: 부결(공사 +6개월, 민심 −5)', apply(s) { if (Math.random() < 0.5) { moodBump(s, 3); return '주민투표 가결: 민심 +3'; } for (const b of s.buildings) if (PLANTS[b.type].kind === 'nuclear' && b.status === 'building') b.monthsLeft += 6; moodBump(s, -5); return '주민투표 부결: 원전 공사 +6개월, 민심 −5'; } },
    ],
  },
  {
    id: 'union_rd', cat: 'politics', crisis: true, icon: '✊', name: '연구소 처우 개선 요구', minYear: 2,
    cond: (s) => rdCount(s) >= 5,
    desc: '연구소 노조가 급여 인상을 요구하며 연구 중단을 예고했습니다.',
    choices: [
      { label: '처우 개선', cost: (s) => scaleMoney(s, 300), desc: (s) => '−' + fmt(scaleMoney(s, 300)) + '억 · 2년간 연구 확률 +5%', apply(s) { const c = scaleMoney(s, 300); s.money -= c; addEffect(s, { name: '연구소 처우 개선 (연구 확률 +5%)', techBonus: 0.05 }, 24); return '처우 개선 ' + fmt(c) + '억: 2년간 연구 확률 +5%'; } },
      { label: '거부한다', desc: () => '연구소 규모 −10 · 민심 −1', apply(s) { s.rdLab = Math.max(0, rdLevel(s) - 10); moodBump(s, -1); return '요구 거부: 연구소 규모 −10, 민심 −1'; } },
    ],
  },
  {
    id: 'green_court', cat: 'politics', crisis: true, icon: '⚖', name: '법원, 탄소 배출 기준 위반 판결', minYear: 7,
    cond: (s) => intensityTarget(s) !== null && intensityNow(s) > intensityTarget(s) * 1.2,
    desc: '환경단체가 낸 소송에서 법원이 정부의 배출 기준 위반을 인정했습니다. 감축 계획을 내거나 벌금을 내야 합니다.',
    choices: [
      { label: '감축 계획 제출', desc: () => '5년 안에 탄소 원단위 30% 감축 목표', apply(s) { return '감축 계획 제출' + giveQuest(s, 'co2cut'); } },
      { label: '벌금을 낸다', cost: (s) => scaleMoney(s, 1500), desc: (s) => '−' + fmt(scaleMoney(s, 1500)) + '억 · 민심 −2', apply(s) { const c = scaleMoney(s, 1500); s.money -= c; moodBump(s, -2); return '벌금 ' + fmt(c) + '억, 민심 −2'; } },
    ],
  },
  {
    id: 'local_election', cat: 'politics', icon: '🏛', name: '지방선거 에너지 공약', minYear: 5,
    cond: (s) => !chose(s, 'local_election'),
    desc: '지방선거를 앞두고 여당이 에너지 공약을 요구합니다. 공약은 목표가 되고, 지키면 큰 지지를 얻습니다.',
    choices: [
      { label: '재생에너지 40% 공약', desc: () => '민심 +3 · 4년 안에 재생 비중 40% 목표', apply(s) { moodBump(s, 3); return '재생 40% 공약' + giveQuest(s, 'ren40'); } },
      { label: '전기요금 안정 공약', desc: () => '민심 +3 · 1년 안에 SMP 10% 인하 목표', apply(s) { moodBump(s, 3); return '요금 안정 공약' + giveQuest(s, 'cheap_power'); } },
      { label: '공약을 내지 않는다', desc: () => '민심 −2', apply(s) { moodBump(s, -2); return '공약 없음: 민심 −2'; } },
    ],
  },
  // ================= 산업·기회 (앞선 선택과 연계) =================
  {
    id: 'olympics_legacy', cat: 'industry', icon: '🎉', name: '올림픽 이후 관광 붐', minYear: 4,
    cond: (s) => chose(s, 'olympics', '유치') && !chose(s, 'olympics_legacy') && !(s.effects || []).some((e) => e.until >= monthIdxOf(s) && /올림픽/.test(e.name)),
    desc: '올림픽을 치른 뒤 관광객과 이주민이 늘고 있습니다. 인구가 3% 늘고 관광 수입이 들어옵니다.',
    choices: [
      { label: '확인', desc: (s) => '인구 +3% · +' + fmt(scaleMoney(s, 1000)) + '억', apply(s) { for (const c of s.cities) c.pop *= 1.03; const m = scaleMoney(s, 1000); s.money += m; return '관광 붐: 인구 +3%, ' + fmt(m) + '억'; } },
    ],
  },
  {
    id: 'datacenter_expand', cat: 'industry', icon: '🖥', name: '데이터센터 증설 요청', minYear: 4,
    cond: (s) => chose(s, 'datacenter', '유치') && !chose(s, 'datacenter_expand'),
    desc: '유치했던 데이터센터가 AI 수요로 증설을 요청합니다. 수요가 6% 더 늘지만 보조금이 큽니다. 전력이 모자라면 정전이 납니다.',
    choices: [
      { label: '증설 허가', desc: (s) => '수요 +6% · +' + fmt(scaleMoney(s, 2500)) + '억', apply(s) { for (const c of s.cities) c.pop *= 1.06; const m = Math.round(scaleMoney(s, 2500) * policyMods(s).subsidyMult); s.money += m; return '데이터센터 증설: 수요 +6%, 보조금 ' + fmt(m) + '억' + giveQuest(s, 'capacity_up'); } },
      { label: '거절한다', desc: () => '민심 −1', apply(s) { moodBump(s, -1); return '증설 거절: 민심 −1'; } },
    ],
  },
  {
    id: 'factory_pollution', cat: 'industry', icon: '🏭', name: '공장 단지 오염 민원', minYear: 2,
    cond: (s) => chose(s, 'factory', '유치') && !chose(s, 'factory_pollution'),
    desc: '유치한 공장 단지 주변에서 대기·수질 오염 민원이 잇따릅니다.',
    choices: [
      { label: '정화 시설 지원', cost: (s) => scaleMoney(s, 700), desc: (s) => '−' + fmt(scaleMoney(s, 700)) + '억 · 민심 +2', apply(s) { const c = scaleMoney(s, 700); s.money -= c; moodBump(s, 2); return '정화 시설 ' + fmt(c) + '억, 민심 +2'; } },
      { label: '기업에 맡긴다', desc: () => '민심 −4', apply(s) { moodBump(s, -4); return '오염 민원 방치: 민심 −4'; } },
    ],
  },
  {
    id: 'carbon_credit', cat: 'industry', icon: '🌿', name: '탄소 배출권 판매 기회', minYear: 7,
    cond: (s) => chose(s, 'pact', '가입') && intensityTarget(s) !== null && intensityNow(s) < intensityTarget(s) * 0.8,
    desc: '협약 기준보다 배출을 크게 줄여 남는 배출권을 팔 수 있습니다.',
    choices: [
      { label: '판매한다', desc: (s) => '+' + fmt(scaleMoney(s, 1800)) + '억', apply(s) { const m = scaleMoney(s, 1800); s.money += m; return '배출권 판매: +' + fmt(m) + '억'; } },
    ],
  },
  {
    id: 'pact_warning', cat: 'politics', crisis: true, icon: '📨', name: '탄소 협약 이행 경고', minYear: 7,
    cond: (s) => chose(s, 'pact', '가입') && intensityTarget(s) !== null && intensityNow(s) > intensityTarget(s) && !chose(s, 'pact_warning'),
    desc: '가입한 탄소 협약 사무국이 감축 목표 미달을 경고했습니다.',
    choices: [
      { label: '감축 계획 제출', desc: () => '5년 안에 탄소 원단위 30% 감축 목표', apply(s) { return '감축 계획 제출' + giveQuest(s, 'co2cut'); } },
      { label: '분담금을 더 낸다', cost: (s) => scaleMoney(s, 1000), desc: (s) => '−' + fmt(scaleMoney(s, 1000)) + '억', apply(s) { const c = scaleMoney(s, 1000); s.money -= c; return '추가 분담금 ' + fmt(c) + '억'; } },
      { label: '탈퇴한다', desc: () => '3년간 수출 금지 · 민심 −4', apply(s) { addEffect(s, { name: '탄소 협약 탈퇴 (수출 금지)', exportBan: true }, 36); moodBump(s, -4); return '협약 탈퇴: 3년 수출 금지, 민심 −4'; } },
    ],
  },
  {
    id: 'ev_boom', cat: 'industry', icon: '🚗', name: '전기차 보급 급증', minYear: 3,
    cond: (s) => !chose(s, 'ev_boom'),
    desc: '전기차가 빠르게 늘며 밤 충전 수요가 커지고 있습니다. 그냥 두면 수요가 4% 뛰고, 스마트 충전을 지원하면 절반으로 줄일 수 있습니다.',
    choices: [
      { label: '스마트 충전 보조', cost: (s) => scaleMoney(s, 600), desc: (s) => '−' + fmt(scaleMoney(s, 600)) + '억 · 수요 +2%', apply(s) { const c = scaleMoney(s, 600); s.money -= c; for (const x of s.cities) x.pop *= 1.02; return '스마트 충전 ' + fmt(c) + '억: 수요 +2%'; } },
      { label: '그대로 둔다', desc: () => '수요 +4%', apply(s) { for (const x of s.cities) x.pop *= 1.04; return '전기차 수요 +4%' + giveQuest(s, 'capacity_up'); } },
    ],
  },
  {
    id: 'smr_export', cat: 'industry', icon: '🚢', name: 'SMR 해외 수출 계약', minYear: 5,
    cond: (s) => (s.tech.nuclear || 0) >= 5 && onlineOf(s, (p) => p.short === 'SMR').length > 0 && !chose(s, 'smr_export'),
    desc: '양산 체계를 갖춘 우리 SMR을 해외에서 사겠다고 합니다. 수출 수입과 국가 위상이 오릅니다.',
    choices: [
      { label: '계약한다', desc: (s) => '+' + fmt(scaleMoney(s, 3000)) + '억 · 민심 +4', apply(s) { const m = scaleMoney(s, 3000); s.money += m; moodBump(s, 4); return 'SMR 수출: +' + fmt(m) + '억, 민심 +4'; } },
    ],
  },
  {
    id: 'interconnect_treaty', cat: 'industry', icon: '🤝', name: '계통 연결 협정 제안', minYear: 3,
    cond: (s) => onlineOf(s, (p) => p.isLink).length > 0 && !chose(s, 'interconnect_treaty'),
    desc: '이웃 나라가 정식 계통 연결 협정을 제안했습니다. 2년 동안 수출 단가가 오르지만, 그만큼 팔 전기를 만들어야 합니다.',
    choices: [
      { label: '협정 체결', desc: () => '24개월 수출 단가 ×1.5 · 3년 안에 500 GWh 수출 목표', apply(s) { addEffect(s, { name: '계통 연결 협정 (수출 단가 ×1.5)', exportMult: 1.5 }, 24); return '협정 체결: 24개월 수출 단가 ×1.5' + giveQuest(s, 'export'); } },
      { label: '거절한다', desc: () => '변화 없음', apply() { return '협정을 거절했습니다'; } },
    ],
  },
  {
    id: 'coal_exit_fund', cat: 'industry', icon: '💰', name: '정의로운 전환 기금 지급', minYear: 3,
    cond: (s) => questDone(s, 'coal_exit') && !chose(s, 'coal_exit_fund'),
    desc: '석탄 폐쇄 약속을 지킨 정부에 국제 기금이 전환 자금을 지급합니다.',
    choices: [
      { label: '수령', desc: (s) => '+' + fmt(scaleMoney(s, 2000)) + '억 · 민심 +3', apply(s) { const m = scaleMoney(s, 2000); s.money += m; moodBump(s, 3); return '전환 기금 +' + fmt(m) + '억, 민심 +3'; } },
    ],
  },
);

// ================= 정책에 맞춘 목표 =================
QUESTS.push(
  {
    id: 'coal_exit', icon: '🏭', title: '석탄 1기 폐쇄', months: 24, followup: true, reward: { money: 1500, happy: 3 }, penalty: { happy: 4, text: '약속 위반으로 지지율 하락' },
    desc: '석탄 폐쇄 로드맵: 2년 안에 석탄화력을 지금보다 1기 이상 줄이세요(철거).',
    cond: () => true,
    base: (s) => ({ n: s.buildings.filter((b) => b.type === 'coal' && b.status !== 'demolishing').length }),
    check: (s, r, q) => s.buildings.filter((b) => b.type === 'coal' && b.status !== 'demolishing').length <= q.base.n - 1,
    progress: (s, q) => '석탄 ' + s.buildings.filter((b) => b.type === 'coal' && b.status !== 'demolishing').length + '기 (목표 ' + (q.base.n - 1) + '기 이하)',
  },
  {
    id: 'ren40', icon: '🌱', title: '재생에너지 40%', months: 48, reward: { money: 3000, happy: 6 }, penalty: { happy: 4 },
    desc: '한 달 발전량의 40% 이상을 태양광·풍력으로 채우세요.',
    cond: (s) => (pol(s, 'energy') === 'renew' || chose(s, 'local_election', '재생')) && s.lastReport && renShareOf(s.lastReport) >= 0.2 && renShareOf(s.lastReport) < 0.4,
    check: (s, r) => renShareOf(r) >= 0.4,
    progress: (s) => (s.lastReport ? fmt(renShareOf(s.lastReport) * 100) : '0') + '% / 40%',
  },
  {
    id: 'nuclear_share', icon: '☢', title: '원자력 비중 30%', months: 48, reward: { money: 3000, happy: 5 }, penalty: { happy: 3 },
    desc: '한 달 발전량의 30% 이상을 원전·SMR로 채우세요.',
    cond: (s) => pol(s, 'energy') === 'nuclear' && onlineOf(s, isNuke2).length > 0 && s.lastReport && (s.lastReport.energy.gen.nuclear / Math.max(1, s.lastReport.energy.gen.nuclear + s.lastReport.energy.gen.coal + s.lastReport.energy.gen.ccgt + s.lastReport.energy.gen.gt + s.lastReport.energy.gen.solar + s.lastReport.energy.gen.wind)) < 0.3,
    check: (s, r) => { const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return t > 0 && g.nuclear / t >= 0.3; },
    progress: (s) => { const r = s.lastReport; if (!r) return '0% / 30%'; const g = r.energy.gen; const t = g.nuclear + g.coal + g.ccgt + g.gt + g.solar + g.wind; return fmt(t > 0 ? g.nuclear / t * 100 : 0) + '% / 30%'; },
  },
  {
    id: 'export_income', icon: '💵', title: '전력 수출 수입 확보', months: 36, reward: { money: 2000 }, penalty: { happy: 2 },
    desc: '시장 자유화 노선: 3년 안에 누적 1,000 GWh를 수출하세요.',
    cond: (s) => pol(s, 'market') === 'free' && onlineOf(s, (p) => p.isLink).length > 0,
    base: (s) => ({ exp: s.exportTotal || 0 }),
    check: (s, r, q) => (s.exportTotal || 0) - q.base.exp >= 1000000,
    progress: (s, q) => fmt(((s.exportTotal || 0) - q.base.exp) / 1000) + ' / 1,000 GWh',
  },
  {
    id: 'price_stability', icon: '🧾', title: '전기요금 안정 유지', months: 12, reward: { money: 1200, happy: 3 }, penalty: { happy: 3 },
    desc: '요금 규제 노선: 12개월 동안 한 달 평균 SMP를 180원 아래로 유지하세요. 두 달 연속 넘기면 실패입니다.',
    cond: (s) => pol(s, 'market') === 'regulated' && s.lastReport && avgSmpOf(s.lastReport) < 180,
    fail: (s, r) => avgSmpOf(r) >= 180 && s.history.length >= 2 && s.history[s.history.length - 2].smp >= 180,
    check: (s, r, q) => monthIdxOf(s) >= q.deadline,
    progress: (s, q) => (q.deadline - monthIdxOf(s) + 1) + '개월 남음 · 지난달 SMP ' + (s.lastReport ? fmt(avgSmpOf(s.lastReport)) : '-') + '원',
  },
  {
    id: 'capacity_growth', icon: '🏗', title: '설비 30% 확충', months: 36, reward: { money: 2500, happy: 3 }, penalty: { happy: 3 },
    desc: '제조업 육성 노선: 3년 안에 조절 가능 설비를 지금보다 30% 늘리세요.',
    cond: (s) => pol(s, 'industry') === 'growth',
    base: (s) => ({ firm: firmCapOf(s) }),
    check: (s, r, q) => firmCapOf(s) >= q.base.firm * 1.3,
    progress: (s, q) => fmt(firmCapOf(s)) + ' / ' + fmt(q.base.firm * 1.3) + ' MW',
  },
  {
    id: 'rd200', icon: '🔬', title: '연구소 규모 200', months: 48, reward: { money: 2500, happy: 3 }, penalty: { happy: 2 },
    desc: '연구소를 크게 키우세요. 더 높은 단계의 연구가 열립니다.',
    cond: (s) => !!pol(s, 'rd') && rdLevel(s) >= 100 && rdLevel(s) < 160,
    check: (s) => rdLevel(s) >= 200,
    progress: (s) => rdLevel(s) + ' / 200',
  },
);

// ================= 날씨·환경 사건 (그 달만) =================
EVENTS.push(
  { id: 'dust', name: '황사·미세먼지', seasons: ['mid'], solarMult: 0.75, happyDelta: -1, weight: 0.8,
    desc: '뿌연 하늘에 태양광 발전이 25% 줄고, 국민 불만이 조금 늘어납니다.' },
  { id: 'heatdome', name: '열돔 현상', seasons: ['summer'], demandMult: 1.22, tempDelta: 8, weight: 0.4,
    desc: '기록적인 폭염이 이어져 수요가 22% 뛰고 복합발전 출력이 크게 떨어집니다.' },
  { id: 'snowstorm', name: '폭설', seasons: ['winter'], solarMult: 0.6, demandMult: 1.08, tempDelta: -4, weight: 0.7,
    desc: '눈이 패널을 덮어 태양광이 40% 줄고 난방 수요가 8% 늘어납니다.' },
  { id: 'clearSkies', name: '맑은 날 연속', seasons: ['mid'], solarMult: 1.25, weight: 0.7,
    desc: '한 달 내내 맑아 태양광 발전이 25% 늘어납니다.' },
  { id: 'windyMonth', name: '강풍의 달', seasons: ['winter', 'mid'], windMult: 1.4, weight: 0.7,
    desc: '계절풍이 강해 풍력 발전이 40% 늘어납니다.' },
  { id: 'calmMonth', name: '무풍 지속', seasons: ['summer'], windMult: 0.5, weight: 0.7,
    desc: '바람이 잦아들어 풍력 발전이 절반으로 줄어듭니다.' },
  { id: 'gasDrop', name: 'LNG 가격 급락', gasMult: 0.7, weight: 0.5,
    desc: '국제 가스 가격이 떨어져 이번 달 가스 연료비가 30% 싸집니다.' },
  { id: 'coalSpike', name: '석탄 가격 급등', coalMult: 1.5, weight: 0.5,
    desc: '수출국 항만 파업으로 이번 달 석탄 연료비가 50% 오릅니다.' },
  { id: 'holiday', name: '긴 연휴', demandMult: 0.92, weight: 0.5,
    desc: '연휴로 공장이 쉬어 수요가 8% 줄어듭니다.' },
  { id: 'strikeTransport', name: '연료 운송 파업', gasMult: 1.2, coalMult: 1.3, weight: 0.4,
    desc: '연료 운송이 막혀 이번 달 가스 연료비 +20%, 석탄 연료비 +30%.' },
);
