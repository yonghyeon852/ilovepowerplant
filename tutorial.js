// ------------------------------------------------------------
// 튜토리얼: 비서가 단계별로 게임 요소를 안내
//  - 각 단계는 설명 + (있으면) 확인 조건(check). 조건이 맞으면 자동으로 다음 단계로 넘어감
//  - state.tutorial = { step, done, guard }  (guard: 튜토리얼 시작 게임이면 끝날 때까지 위기 사건을 미룸)
//  - 안내 창은 머리 부분을 끌어 옮길 수 있고(위치는 브라우저에 기억), 설명 대상은 주변을 어둡게 하는 스포트라이트로 표시
// ------------------------------------------------------------
const TUT_NAME = '에너지 정책 비서';

// ---------- 튜토리얼 전용 사건·목표 ----------
//  무작위로는 나오지 않고, 안내 중에 직접 띄워서 "사건 카드에 답하기"와 "후속 목표"를 실제로 겪어 보게 함
// (연구원 수 대신 연구소 규모를 봄)
function tutOnlineCount(s) { return s.buildings.filter((b) => b.status === 'online').length; }
QUESTS.push({
  id: 'tut_first', icon: '🏗', title: '첫 설비 가동', months: 12, followup: true, reward: { money: 500, happy: 2 }, penalty: { happy: 2 },
  desc: '새로 지은 발전 설비 1기를 완공해 가동하세요. 공사가 끝나는 달에 달성됩니다.',
  cond: () => true,
  base: (s) => ({ n: tutOnlineCount(s) }),
  check: (s, r, q) => tutOnlineCount(s) > q.base.n,
  progress: (s) => { const b = s.buildings.filter((x) => x.status === 'building').sort((a, c) => a.monthsLeft - c.monthsLeft)[0]; return b ? '공사 중 · ' + b.monthsLeft + '개월 남음' : '공사 중인 설비 없음 (하나 지으세요)'; },
});
QUESTS.push({
  id: 'tut_rd', icon: '🔬', title: '연구소 규모 20', months: 12, followup: true, reward: { money: 400, happy: 2 }, penalty: { happy: 2 },
  desc: '주민 간담회에서 약속했습니다: 1년 안에 연구소 규모를 20 이상으로 키우세요. 왼쪽 아래 연구 칸에서 확장할 수 있습니다.',
  cond: () => true,
  check: (s) => rdLevel(s) >= 20,
  progress: (s) => rdLevel(s) + ' / 20',
});
DECISIONS.push({
  id: 'tut_event', cat: 'tutorial', icon: '🗣', name: '발전소 주변 주민 간담회',
  cond: () => false,   // 무작위 사건 후보에서는 빠짐
  desc: '새로 짓는 발전소 근처 주민들이 대통령님과의 간담회를 요청했습니다. 어떻게 답할지 정하세요. (연습용 사건이라 효과는 작지만 실제로 적용됩니다.)',
  choices: [
    { label: '주민 지원금을 약속한다', cost: () => 100, desc: () => '−100억 · 민심 +2', apply(s) { s.money -= 100; moodBump(s, 2); return '주민 지원금 100억 지급 · 민심 +2'; } },
    { label: '설명회만 연다', desc: () => '비용 없음 · 변화 없음', apply() { return '설명회 개최 · 변화 없음'; } },
    { label: '연구 투자를 약속한다', desc: () => '비용 없음 · 목표 "연구소 규모 20"이 생김', apply(s) { return '연구 투자 약속' + giveQuest(s, 'tut_rd'); } },
  ],
});

const TUTORIAL_STEPS = [
  {
    id: 'intro', title: '처음 뵙겠습니다, 대통령님',
    text: '저는 대통령님의 <b>에너지 정책 비서</b>입니다. 앞으로 20년, 나라의 전력망을 함께 꾸려 갈 거예요.<br><br>' +
      '이 안내는 <b>{N}단계</b>입니다. 화면에서 <b>밝게 남는 부분</b>이 지금 설명하는 곳이고, 직접 해 보셔야 하는 단계는 하시면 저절로 넘어갑니다. 급하시면 "이 단계 건너뛰기"를 누르셔도 됩니다. 이 창은 위쪽을 잡고 끌어서 옮길 수 있어요.<br><br>' +
      '목표는 하나, <b>민심</b>이에요. 매달 그달의 민심만큼 국정운영 점수가 쌓입니다. 전기가 모자라지 않게, 탄소를 줄이면서, 돈이 마르지 않게 하는 일이 전부 민심으로 이어져요.',
  },
  {
    id: 'topbar', title: '위쪽 막대: 나라의 상태', target: '#topbar',
    text: '왼쪽부터 <b>자금</b>(옆의 작은 숫자는 지난달에 벌거나 잃은 돈), <b>민심</b>(0이 되면 탄핵. 옆의 작은 숫자는 민심이 향하고 있는 <b>예상 민심</b>), <b>인구</b>(전력 수요를 정함), <b>국정운영 점수</b>(매달 민심만큼 쌓임), <b>연구소</b> 규모입니다. 가장 중요한 자금과 민심은 크게 적혀 있어요.<br><br>' +
      '오른쪽의 <b>이번 달 진행 ▶</b>(단축키 Space)을 누르면 한 달이 지나고 결산이 나옵니다. 그 옆 <b>☰ 메뉴</b>에는 지금 상황을 글로 복사해 주는 <b>상황 요약 복사</b>, 낯선 말을 쉬운 말로 푼 <b>용어 풀이</b>, <b>안내 다시 보기</b>가 있어요. 게임은 매달 자동 저장됩니다.',
  },
  {
    id: 'map', title: '지도 읽기', target: '#board',
    text: '<b>회색 칸</b>이 도시(전기를 사는 곳), <b>초록</b>은 땅, <b>파랑</b>은 강과 바다, <b>진한 초록 ▲</b>은 산이에요. 산에는 태양광·풍력만 지을 수 있고, 산 위 도시는 사람이 덜 삽니다. 시작 설비로 도시 옆의 <b>복합발전 1기</b>와 <b>태양광 1개 · 풍력 1개</b>가 이미 돌아가고 있습니다.<br><br>' +
      '처음에는 <b>지도 전체</b>가 보입니다. <b>마우스 휠</b>을 굴려 확대하면 도시 이름과 설비가 크게 보이고, 확대한 상태에서 빈 땅을 <b>끌거나</b> 왼쪽 아래에 나타나는 <b>미니맵</b>을 누르면 그곳으로 이동합니다. 지도 네 귀퉁이에는 날씨, 이번 달 최대 수요, 정전·탄소세, 가동 중인 설비 용량이 작게 떠 있어요. 설비 위 <b>빗금</b>은 건설 중, <b>노란 점</b>은 노후, <b>붉은 글씨</b>는 수명이 끝나 멈춘 설비예요. 멈춘 설비는 철거하고 새로 지어야 합니다.',
  },
  {
    id: 'forecast', title: '이번 달 전망: 매달 제일 먼저 볼 곳', target: '#forecast-info',
    text: '세 칸이 나라의 건강 지표예요.<br>' +
      '· <b>공급 / 수요</b>: 언제든 낼 수 있는 공급과 이달 최대 수요. "부족"이 뜨면 정전입니다.<br>' +
      '· <b>탄소</b>: 발전량당 배출량. 0에 가까울수록 <b>환경</b> 점수가 높고, <b>탄소 기준</b>(해마다 엄격해짐) 이상이면 0점이에요.<br>' +
      '· <b>주파수 안정도</b>: <b>주파수</b>가 흔들리지 않을지 보는 점수예요. 태양광·풍력·배터리처럼 관성 없는 전기의 비중이 너무 높거나, 예비력이 얇거나, 밤에 과잉 발전이 생기면 내려갑니다.<br><br>' +
      '세 칸의 색이 초록이면 괜찮고, 노랑은 주의, 빨강은 지금 손써야 한다는 뜻이에요. 칸 아래 한 줄에 가장 큰 이유가 적혀 있고, 그 밑의 <b>진단</b>이 부족 시간대와 추천 설비를 알려 줘요. 바로 아래 그래프는 다음 단계에서 볼게요.',
  },
  {
    id: 'chart', title: '하루 그래프 읽기', target: '#forecast-graph',
    text: '이번 달 <b>하루 24시간</b>의 수요와 공급이에요.<br>' +
      '· <b>흰 선</b> = 수요. 저녁에 가장 높습니다.<br>' +
      '· <b>색 띠</b> = 공급. 회색은 언제든 낼 수 있는 전원(원전·화력·수입), 주황은 태양광(낮에만), 하늘색은 풍력(바람 따라).<br>' +
      '· <b>빨강</b> = 흰 선이 띠 위로 올라간 시간 = <b>정전</b>.<br><br>' +
      '<b>어디가 빨간지</b>가 답이에요. 낮이면 태양광, 저녁·새벽이면 가스 같은 조절 전원, 종일이면 기저 전원.<br><br>' +
      '<b>유연성</b>: 해 질 무렵 태양광이 빠지며 수요는 오르는 구간이 고비예요. 남은 전원이 그만큼 <b>빨리 출력을 올려야</b> 하고, 느린 전원만 있으면 띠가 충분해 보여도 정전이 납니다.<br><br>' +
      '그래프 위의 <b>진단</b> 한 줄이 부족 시간대·추천 설비·언제 부족해질지를 알려 줘요. 전기가 곧 모자랄 때는 오른쪽 위 <b>길잡이</b>에도 경고가 뜹니다.',
  },
  {
    id: 'build', title: '첫 설비 짓기 (직접 해 보세요)', target: '#palette-cards',
    text: '먼저 지도 위에서 <b>마우스 휠</b>을 굴려 도시(회색 칸) 근처를 <b>확대</b>하세요. 지도 전체 화면에서는 칸이 작아 놓기 어렵습니다.<br><br>' +
      '그다음 왼쪽 카드에서 <b>복합발전</b>을 <b>끌어서</b> 도시 근처 빈 땅에 놓아 보세요. 놓기 전에 자리 위에 비용과 공사 기간이 뜹니다.<br><br>' +
      '기억하실 것: 설비는 <b>도시 안에는 지을 수 없어요</b>(도시 바로 옆은 됩니다). <b>도시에서 멀수록 송전 손실</b>이 커지고, 원전·풍력·석탄은 <b>도시 가까이 두면 주민 반발</b>이 있고, 모든 설비는 <b>공사 기간</b>이 있어요(카드에 적혀 있습니다). 수요는 해마다 늘고, <b>조절 전원(가스·석탄·원전)이 넉넉하면 그만큼 사람과 공장이 몰려와 더 빨리 늘어요</b>. 태양광·풍력은 수요를 부르지 않습니다. 여유를 크게 지어도 몇 달이면 채워지니, 늘 <b>부족해지기 전에</b> 다음 설비를 착공하는 게 대통령의 일입니다.',
    check: (s) => s.buildings.some((b) => b.status === 'building'),
    wait: '휠로 확대한 뒤, 복합발전 카드를 지도 위 빈 땅으로 끌어다 놓으면 넘어갑니다.',
  },
  {
    // 설비를 지으면 그 설비가 바로 선택되므로, 확인 조건 없이 설명만 보여 줌 (조건을 두면 이 단계가 뜨지도 않고 넘어가 버림)
    id: 'select', title: '설비 정보 보기', target: '#selected-panel',
    text: '방금 지은 설비가 선택되어, 오른쪽 "선택한 설비"에 용량, 송전 손실, 남은 공사 기간, 수명이 나와 있습니다. 지도에서 다른 설비를 <b>클릭</b>하면 그 설비의 정보로 바뀌어요(작게 보이면 휠로 확대).<br><br>' +
      '여기서 <b>철거</b>를 할 수 있습니다. 테크트리 연구 효과는 따로 적용할 필요 없이 <b>이미 지은 설비에도 바로</b> 붙습니다. 수명이 끝난 설비는 자리만 차지하고 유지비가 나가니 꼭 철거하세요.',
  },
  {
    id: 'advance', title: '한 달 진행하기 (직접 해 보세요)', target: '#next-month',
    text: '이제 <b>이번 달 진행 ▶</b>을 누르거나 <b>Space</b>를 눌러 보세요. 한 달 동안의 전력 거래가 시간대별로 계산되고 결산 보고서가 뜹니다.<br><br>' +
      '한 달에 할 수 있는 일: 설비 짓기(제한 없음), 연구소 확장 한 번, 연구 시작. 다 하셨으면 진행하세요.<br><br>' +
      '달을 넘기기 전에 길잡이의 경고만 훑어봐도 충분합니다.',
    check: (s) => (s.history || []).length >= 1,
    wait: '"이번 달 진행" 버튼을 누르면 넘어갑니다.',
  },
  {
    id: 'report', title: '결산 보고서 읽기', target: '#report',
    text: '매달 이 보고서가 뜹니다. 맨 위 네 칸이 핵심이에요: <b>이번 달 손익</b>, <b>민심</b>, <b>전력 공급</b>(정전 여부), <b>국정운영 점수</b>. 그 아래의 막대 다섯 개가 <b>민심 성적표</b>예요: <b>전력 공급 · 전기 요금 · 환경 · 도시·생활 · 미래·신뢰</b>, 분야마다 20점 만점입니다.<br><br>' +
      '세부 숫자는 아래 접힌 줄(<b>수입 · 지출 내역</b> 등)을 누르면 펼쳐져요. 알아 둘 것만 짚으면:<br>' +
      '· <b>전력 판매</b>: 발전량 × 그 시간 전기값(SMP). 가장 비싼 발전기의 원가가 전기값을 정하니, 가스가 비쌀수록 전기값도 오릅니다.<br>' +
      '· <b>용량 요금</b>: 조절 가능 설비에 주는 대기료. 필요한 예비력까지만 줘서 <b>과잉 건설은 손해</b>예요.<br>' +
      '· <b>연료비 · 탄소세 · 유지비</b>가 지출. 정전이 나면 <b>정전 보상</b>이 크게 나갑니다.<br>' +
      '· 이익이 지나치게 크면 <b>초과 이윤 환수</b>로 일부를 정부가 가져갑니다.<br><br>' +
      '이 다섯 막대는 매달 꼭 보세요. 다섯 점수를 더한 값이 <b>예상 민심</b>이고, 민심은 매달 그 값 쪽으로 움직여요(내려갈 때는 차이의 ' + Math.round(ECON.moodPull * 100) + '%, 올라갈 때는 ' + Math.round(ECON.moodPullUp * 100) + '%라 잃기는 쉽고 되찾기는 더뎌요). 짧아진 막대가 지금 손봐야 할 분야입니다. 낱낱의 내역은 아래 "민심 성적표 자세히"를 펼치면 나옵니다.',
    check: () => document.getElementById('report').classList.contains('hidden'),
    wait: '다 읽으셨으면 보고서의 "다음 달로" 버튼이나 Space로 닫으세요. 닫히면 넘어갑니다.',
  },
  {
    id: 'quests', title: '🎯 목표', target: '#quest-panel',
    text: '오른쪽 <b>정책</b> 탭 안에 <b>목표</b> 칸이 있습니다. 목표는 정부가 내건 과제로, 기한 안에 이루면 <b>보상</b>(자금·민심)이 있고 놓치면 <b>페널티</b>가 있습니다. 목표마다 기한과 진행률이 표시되고, 하나가 끝나면 얼마 뒤 새 목표가 주어져요.<br><br>' +
      '말로만 들으면 감이 안 오니, 다음 단계에서 목표를 하나 받아 직접 달성해 봅시다.',
  },
  {
    // 안내가 "첫 설비 가동" 목표를 직접 주고, 아까 착공한 설비가 완공될 때까지 달을 넘겨 실제로 달성해 보게 함
    //  (❓로 안내를 다시 볼 때나 이미 해 본 게임에서는 이 단계를 건너뜀)
    id: 'quest-do', title: '목표 달성해 보기 (직접 해 보세요)', target: '#quest-panel',
    text: '방금 목표를 하나 드렸습니다: <b>첫 설비 가동</b>. 아까 착공한 복합발전이 <b>완공돼 전기를 보내기 시작하면</b> 달성이에요. 목표 칸에 남은 공사 기간이 보입니다. (아직 아무것도 안 지으셨다면 지금 하나 지으세요.)<br><br>' +
      '<b>이번 달 진행 ▶</b>(Space)을 눌러 달을 넘겨 보세요. 달마다 결산이 뜨면 읽고 닫으면 됩니다. 목표를 이룬 달의 결산에는 <b>목표 달성</b>과 보상이 표시되고, 자금이 그만큼 늘어납니다.',
    skipIf: (s) => !s.tutorial.askedQuest && (!s.tutorial.guard || (s.quests || []).some((q) => q.id === 'tut_first')),
    enter: (s) => {
      if (s.tutorial.askedQuest) return;
      s.tutorial.askedQuest = true;
      giveQuest(s, 'tut_first');
      saveGame(); if (typeof renderAll === 'function') renderAll();
    },
    // 목표가 끝나면(달성·실패) 넘어감. 결산 창을 읽고 닫은 뒤에 넘어가도록 함
    check: (s) => !!s.tutorial.askedQuest && !(s.quests || []).some((q) => q.id === 'tut_first' && q.status === 'active') && document.getElementById('report').classList.contains('hidden'),
    wait: '설비가 완공돼 목표가 달성되면 넘어갑니다 (복합발전 공사는 약 6개월).',
  },
  {
    // 연습용 사건 카드를 띄워 직접 고르게 함. 이미 겪은 뒤 안내를 다시 볼 때는 설명만 보여 줌
    id: 'event', title: '사건 카드에 답하기 (직접 해 보세요)', infoTitle: '사건 카드', target: '#decision',
    text: '게임을 하다 보면 이렇게 <b>사건 카드</b>가 뜹니다. 전쟁으로 연료비가 뛰거나, 태풍이 오거나, 공장을 유치할 기회가 생기는 식이에요. 사건마다 <b>선택지</b>가 있고, 고르면 비용과 효과가 바로 적용됩니다. 답하기 전에는 다음 달로 넘어갈 수 없어요.<br><br>' +
      '큰 위기 말고도 파업 · 농성 · 스캔들 같은 <b>정국 카드</b>가 넉 달에 한 번쯤 찾아옵니다. 강경하게 누르면 돈은 안 들지만 여론이 뒤집힐 수 있고, 요구를 들어주면 그만큼 값을 치릅니다. 정해진 답은 없어요.<br><br>' +
      '지금은 연습용으로 가벼운 사건을 하나 띄웠습니다. 선택지를 읽고 <b>하나를 골라 보세요</b>. 세 번째처럼 <b>후속 목표</b>로 이어지는 선택도 있어요. 약속을 지키면 보상을 받고, 못 지키면 페널티가 있습니다.',
    infoText: '게임을 하다 보면 <b>사건 카드</b>가 뜹니다. 전쟁으로 연료비가 뛰거나, 태풍이 오거나, 공장을 유치할 기회가 생기는 식이에요. 사건마다 <b>선택지</b>가 있고, 고르면 비용과 효과가 바로 적용됩니다. 답하기 전에는 다음 달로 넘어갈 수 없어요.<br><br>' +
      '큰 위기 말고도 파업 · 농성 · 스캔들 같은 <b>정국 카드</b>가 넉 달에 한 번쯤 찾아옵니다. 강경하게 누르면 돈은 안 들지만 여론이 뒤집힐 수 있고, 요구를 들어주면 그만큼 값을 치릅니다. 정해진 답은 없어요.<br><br>' +
      '어떤 선택은 <b>후속 목표</b>로 이어집니다. 약속을 지키면 보상을 받고, 못 지키면 페널티가 있어요. 큰 위기는 임기 동안 여러 번 찾아오니, 평소에 자금과 예비력에 여유를 두는 게 좋습니다.',
    infoIf: (s) => !s.tutorial.askedEvent && (!s.tutorial.guard || (s.decisionLog || []).some((d) => d.id === 'tut_event') || !!s.pendingDecision),
    enter: (s) => {
      if (s.tutorial.askedEvent) { if (s.pendingDecision) renderDecision(s); return; }
      s.tutorial.askedEvent = true;
      s.pendingDecision = { id: 'tut_event', at: monthIdxOf(s) };
      saveGame(); renderDecision(s);
    },
    check: (s) => (s.decisionLog || []).some((d) => d.id === 'tut_event') && document.getElementById('decision').classList.contains('hidden'),
    wait: '선택지 하나를 고른 뒤 "확인"을 누르면 넘어갑니다.',
  },
  {
    // 첫 정책(에너지 정책)을 지금 실제로 정하게 함. 원래 1년 차 끝에 오는 결정을 앞당긴 것이라 일정표에서는 지움
    id: 'policy', title: '정책 노선 정하기 (직접 해 보세요)', infoTitle: '정책 노선', target: '#decision',
    text: '<b>정책</b>은 나라의 조건을 오래 바꾸는 큰 결정입니다. 임기 초반에 해마다 하나씩 정하고(에너지 정책이 먼저, 나머지 전력시장 · 산업 · R&amp;D는 판마다 순서가 달라요), 8년 뒤 한 번 다시 고를 수 있어요.<br><br>' +
      '가장 중요한 것이 지금 정할 <b>에너지 정책</b>입니다. <b>친원전 · 화력 중심 · 재생에너지 중심</b> 가운데 하나를 고르면 그 설비를 싸게 짓게 되고, <b>📜 공약</b>이 하나 따라옵니다. 공약은 <b>임기 후반까지</b> 챙겨야 하는 약속이에요. 4년마다 점검받는 것도 있고, 18년 차 말에 달성 정도로 평가받는 것도 있습니다. 지키면 민심이 크게 오르고 어기면 크게 깎여요. 그러니 <b>앞으로 주로 지을 설비와 올릴 테크</b>를 정한다고 생각하세요.<br><br>' +
      '다만 정책은 <b>중점</b>일 뿐이에요. 어느 정책이든 다른 설비를 <b>섞어 지어야</b> 합니다. 화력 중심은 쉽지만 탄소·가스 부담 때문에 고점이 낮고, 높은 점수는 재생에너지·원자력·전력 수출을 잘 관리해야 나옵니다.<br><br>' +
      '선택지마다 좋은 점(+)과 부담(−)이 한 줄씩 적혀 있습니다. 아직 잘 모르겠으면 <b>중립</b>이 무난해요(보너스도 공약도 없음).',
    infoText: '<b>정책</b>은 나라의 조건을 오래 바꾸는 큰 결정입니다. 임기 초반에 해마다 하나씩 정하고(에너지 정책이 먼저, 나머지 전력시장 · 산업 · R&amp;D는 판마다 순서가 달라요), 8년 뒤 한 번 다시 고를 수 있어요.<br><br>' +
      '고른 노선과 <b>📜 공약</b>의 진행 상황은 오른쪽 위 <b>길잡이</b>와 <b>정책</b> 탭에 나옵니다. 정책 탭의 막대가 지금 값과 목표 값이고, 그 위에 지금 달성률과 이대로면 받을 결과가 적혀 있어요.',
    infoIf: (s) => !s.tutorial.askedPolicy && (!s.tutorial.guard || !!(s.policies && s.policies.energy) || !!s.pendingDecision),
    enter: (s) => {
      if (s.tutorial.askedPolicy) { if (s.pendingDecision) renderDecision(s); return; }
      s.tutorial.askedPolicy = true;
      const due = (s.crisisPlan || []).find((x) => x.id === 'policy_energy' && !x.done);
      if (due) due.done = true;
      s.pendingDecision = { id: 'policy_energy', at: monthIdxOf(s) };
      saveGame(); renderDecision(s);
    },
    check: (s) => !!(s.policies && s.policies.energy) && document.getElementById('decision').classList.contains('hidden'),
    wait: '노선 하나를 고른 뒤 "확인"을 누르면 넘어갑니다.',
  },
  {
    id: 'bottom', title: '오른쪽 칸의 탭: 상황을 자세히 볼 때', target: '#side-tabs', tab: 'map',
    text: '오른쪽 위 <b>길잡이</b>는 항상 보입니다. 내가 고른 <b>노선</b>, 지켜야 할 <b>공약</b>, 지금 <b>신경 쓸 것</b> 세 가지만 나와요. 상황을 자세히 볼 때는 이 탭 줄에서 골라 봅니다.<br>' +
      '· <b>전망</b>: 이번 달 공급·탄소·계통 세 칸, 진단 한 줄, 하루 24시간 그래프.<br>' +
      '· <b>정책</b>: 정한 정책과 공약, 지금 받은 <b>목표</b>, 전기요금 손잡이. 숫자 배지는 진행 중인 목표 수이고, 기한이 임박하면 붉어집니다.<br>' +
      '· <b>설비</b>: 지도에서 누른 설비의 정보(철거)와 전체 설비 현황. 설비를 누르면 자동으로 열려요.<br>' +
      '· <b>소식</b>: 사건, 목표 결과, 첫 정전 같은 기록이 최신순으로.<br><br>' +
      '매달 진행하기 전에 <b>길잡이</b>만 훑어도 충분합니다. 달마다 돈을 쓰는 <b>연구</b>는 탭이 아니라 왼쪽 설비 목록 아래에 항상 보이는 칸으로 따로 있어요.',  },
  {
    id: 'research-pane', title: '연구 칸: 항상 보이는 곳', target: '#techrd-panel',
    text: '왼쪽 아래, 설비 목록 밑의 <b>연구</b> 칸은 항상 보입니다. 달마다 돈을 쓰고 확인하는 곳이라서요. 맨 위에 <b>연구소 규모 · 동시에 하는 연구 수 · 연구가 민심에 주는 영향</b>이 나오고, 그 아래에 연구소를 키우는 버튼과 테크 여섯 가지가 있습니다. 자리가 좁으면 "접기"로 접어 둘 수 있어요.',
    enter: () => { if (typeof setRdDock === 'function') setRdDock(false); },
  },
  {
    id: 'lab', title: '연구소 키우기 (직접 해 보세요)', target: '#techrd-panel',
    text: '<b>연구소 규모</b>가 곧 연구력이에요. 연구 칸 맨 위의 <b>+10</b> 버튼을 눌러 연구소를 키워 보세요(확장은 한 달에 한 번).<br><br>' +
      '· 규모 <b>20</b>부터 1단계 연구를 할 수 있고, 그 뒤로 <b>단계마다 40씩</b>(원자력은 25씩) 더 필요합니다.<br>' +
      '· 규모가 클수록 연구 성공 확률이 오르고, 100마다 동시에 하는 연구가 하나씩 늘어요.<br>' +
      '· 한 번 키우면 그대로입니다. 유지비는 없어요.',
    check: (s) => rdLevel(s) > 0,
    wait: '확장 버튼을 한 번 누르면 넘어갑니다.',
  },
  {
    id: 'tech', title: '테크트리: 설비를 강하게', target: '#techrd-panel',
    text: '그 버튼들 아래에 <b>테크</b> 여섯 가지가 있어요. 화력은 <b>복합발전 · 석탄화력</b>(각 10단계), 재생에너지는 <b>태양광 · 풍력</b>(각 10단계), 원자력은 <b>원자력</b> 하나(15단계), 그리고 어느 노선이든 쓰는 <b>계통 · 배터리</b>(10단계)입니다. 줄마다 지금 연구할 수 있는 <b>다음 단계</b>의 효과, 비용, 성공 확률과 <b>연구</b> 버튼이 있어요. 이름에 마우스를 올리면 전체 단계가 보입니다.<br><br>' +
      '연구는 <b>돈을 내고 석 달 뒤 확률로</b> 성공합니다. 실패해도 돈은 돌아오지 않지만, 실패할수록 다음 확률이 올라요.<br><br>' +
      '국민은 <b>내 노선의 테크</b>(1년 차에 고르는 에너지 정책의 노선)와 <b>계통 테크</b>를 보고 기대(해마다 올라감)와 비교합니다. 화력과 재생에너지는 트리가 둘이라 <b>두 설비를 모두 지어야</b> 온전히 반영돼요. 앞서면 민심이 오르고 뒤처지면 내려가니 임기 끝까지 꾸준히 올리세요.',
  },
  {
    id: 'research', title: '첫 연구 시작하기', target: '#techrd-panel',
    text: '연구소 규모가 20을 넘으면 1단계 연구를 시작할 수 있어요. 추천은 <b>복합발전</b>처럼 지금 쓰는 설비를 바로 좋게 하는 것.<br><br>' +
      '성공하면 <b>이미 지은 설비와 새 설비 모두</b>에 그 달부터 바로 적용됩니다. 따로 개조할 필요가 없어요.<br><br>' +
      '아직 규모가 모자라면 지금은 넘어가고, 나중에 꼭 시작하세요. 연구 없이 20년을 버티기는 어렵습니다.',
    check: (s) => !!(s.techBusy && Object.keys(s.techBusy).length) || (s.techLog || []).length > 0,
    wait: '연구를 시작하면 자동으로 넘어갑니다. 아직이면 "다음"을 누르세요.',
    optional: true,
  },
  {
    id: 'city', title: '도시와 인구', target: '#palette', tab: 'map', subtab: 'city',
    text: '인구는 민심이 높을수록, 전기가 넉넉할수록 빨리 늘어요. 다만 도시가 <b>빽빽해지면</b> 사람이 덜 들어오고 <b>주거 여유</b> 점수(도시·생활 분야)가 떨어집니다.<br><br>' +
      '왼쪽의 <b>도시</b> 서브탭에서 <b>새 도시</b>를 세우세요. 빈 땅을 직접 칠하거나 <b>자동으로 자리 잡기</b>로 고르면 됩니다. 세우기 전에 <b>들어오는 사람 · 늘어나는 전력 수요 · 주거 여유 점수</b>가 미리 나옵니다. 새 도시는 수요를 한꺼번에 끌어오니, 전기가 남을 때 세우면 딱 좋고 빠듯할 때 세우면 정전이 나요. 도시가 많아질수록 새 도시가 끌어오는 인구는 점점 줄어듭니다.<br><br>' +
      '도시는 저절로 넓어지지 않습니다. 산에도 세울 수 있지만 산 칸은 반 칸으로 쳐서 사람이 덜 살아요. 언제 어디에 도시를 세울지는 대통령님의 전략이에요.',
  },
  {
    id: 'happy', title: '민심이 곧 국정운영 점수입니다', target: '.stat.happy',
    text: '이 게임의 국정운영 점수는 <b>20년 동안의 민심을 쌓은 값</b>이에요. 그래서 끝까지 민심을 높게 지키는 것이 전부입니다. 11년 차부터는 한 달이 2배로 쳐져서 후반이 더 중요해요.<br><br>' +
      '민심은 <b>다섯 분야의 점수를 더한 값</b>(예상 민심) 쪽으로 매달 움직입니다. 분야마다 20점 만점이에요:<br>' +
      '· <b>⚡ 전력 공급</b>: 정전이 없으면 만점. 정전이 난 달에 크게 깎이고, 정전 없는 달마다 ' + ECON.moodPowerRecover + '점씩 돌아옵니다.<br>' +
      '· <b>💡 전기 요금</b>: 국민이 내는 요금이 기대보다 쌀수록 높음. 설비를 너무 많이 지어도 요금이 오릅니다.<br>' +
      '· <b>🌿 환경</b>: 전기를 만들 때 나오는 탄소가 0에 가까울수록 높음.<br>' +
      '· <b>🏙 도시·생활</b>: 일자리(인구 증가), 전력 수출, 주거 여유(새 도시)에서 주민 불만(기피 시설 · 원전 불안)을 뺌.<br>' +
      '· <b>🔬 미래·신뢰</b>: 앞선 연구와 지킨 공약.<br><br>' +
      '다섯 분야가 모두 만점이어야 100이라서, 한두 가지만 잘해서는 높이 못 올라갑니다. 국민의 눈높이도 해마다 올라가요(기대 요금은 내려가고, 탄소 기준은 엄격해지고, 기대하는 테크 단계는 올라감). <b>가만히 있으면 민심은 서서히 내려갑니다.</b> 사건 카드의 민심 효과는 그 자리에서 바로 움직였다가 <b>여론</b>으로 남아 서서히 옅어집니다.<br><br>' +
      '<b>10년 차에는 재선 선거</b>가 있어요. 10년을 넘기는 그 달의 민심이 ' + ECON.electionBar + '에 못 미치면 거기서 끝납니다. 선거 1년 전에는 <b>재선 공약</b>을 발표합니다. 분야와 수위(현실적 · 과감 · 파격)를 고르는데, 과감할수록 발표 직후 기대감으로 민심이 올라 선거에 도움이 되지만 달성은 훨씬 어렵습니다. 18년 차 말에 평가해서 지켰으면 민심이 크게 오르고, 못 지켰으면 크게 깎여요. 민심이 ' + ECON.happinessGameOver + ' 이하로 떨어지면 <b>탄핵</b>, 빚이 한도를 넘으면 <b>국가 부도</b>입니다.',
  },
  {
    id: 'tariff', title: '전기요금 조정: 돈과 민심의 맞교환', target: '#tariff-panel', tab: 'map',
    text: '오른쪽 <b>정책</b> 탭 아래쪽의 <b>전기요금</b> 손잡이는 <b>3년 차부터</b> 쓸 수 있어요. 국민이 실제로 내는 요금을 올리거나 내리는 장치입니다.<br>' +
      '· <b>▼ 지원</b>: 요금을 10%나 20% 깎아 줍니다. 그만큼이 전력 판매 수입에서 나가고, 요금 불만이 줄어듭니다.<br>' +
      '· <b>▲ 할증</b>: 요금을 더 받습니다. 돈이 더 들어오는 대신 요금 불만이 커집니다.<br><br>' +
      '이 손잡이로 고칠 수 있는 것은 <b>요금뿐</b>이에요. 탄소, 정전, 뒤처진 기술, 원전 반대는 돈으로 덮을 수 없습니다. 전기값이 이미 싼 나라는 지원해도 얻는 게 거의 없고요. 그러니 먼저 <b>플랜트 구성으로 전기값을 낮추고</b>, 그래도 남는 불만을 돈으로 메운다고 생각하세요. 한 번 바꾸면 6개월 동안 다시 못 바꿉니다.',
  },
  {
    id: 'carbon', title: '탄소: 20년의 큰 흐름', target: '#co2-chip',
    text: '탄소를 배출하면 톤당 <b>탄소세</b>를 내고, 세율은 해마다 오르며 사건에 따라 더 오르기도 해요.<br><br>' +
      '민심의 <b>환경</b> 분야는 전기 1MWh를 만들 때 나오는 탄소로 매깁니다. 0이면 만점(20점), <b>탄소 기준</b> 이상이면 0점이고, 기준은 해마다 엄격해져요. 복합발전은 초반에만 조금 받고, 석탄은 테크를 끝까지 올려도 받지 못합니다. 그래서 <b>화력만으로는 환경 20점을 거의 통째로 잃어요.</b> 무탄소 전원을 섞어야 합니다.<br><br>' +
      '길은 세 가지예요. <b>화력</b>을 계속 쓰면서 복합발전·석탄 테크의 <b>탄소 감축 기술</b>로 줄이거나, <b>원자력</b>으로 바꾸거나, <b>태양광·풍력과 배터리</b>로 바꾸거나. 어느 길이든 그 설비의 테크를 꾸준히 올려야 합니다. 1년 차에 고르는 에너지 정책이 이 길을 정하는 결정이에요.',
  },
  {
    id: 'plants1', title: '발전 설비 ①: 조절할 수 있는 전원', target: '#palette-cards', tab: 'map', subtab: 'plants',
    text: '카드에 마우스를 올리면 상세가 뜹니다. 성격만 한 줄씩.<br>' +
      '· <b>복합발전</b> (화력): 빨리 짓고 <b>수요를 따라 출력을 가장 잘 오르내림</b>. 연료비와 탄소세가 들고, 가스값이 뛰면 요금이 오름.<br>' +
      '· <b>석탄</b> (화력): 연료가 싸고 꾸준함. 탄소가 가장 많고 <b>출력 조절이 느려</b>(최소 55% · 한 시간에 5%) 바닥 수요를 맡기는 설비.<br>' +
      '· <b>원전·SMR</b>: 탄소 없는 싼 전기. 비싸고 오래 걸리며 <b>출력을 못 줄여</b> 밤에 전기가 남으면 전기요금이 오르고, 낮의 최대 수요를 못 채우면 정전이 납니다. 원자력 테크로 열림.<br>' +
      '어느 정책을 고르든 한 가지만 지어서는 안 됩니다. 서로의 약점을 메우도록 <b>섞는 것</b>이 이 게임의 핵심이에요.',
  },
  {
    id: 'plants2', title: '발전 설비 ②: 재생에너지', target: () => document.querySelector('.pc-group[data-group="renew"]') || document.getElementById('palette-cards'),
    text: '카드의 MW는 <b>설비 용량</b>, 실제 출력은 날씨 때문에 훨씬 낮습니다(카드에 "평균 ~"로 표시).<br>' +
      '· <b>태양광</b>: 싸고 빠르지만 <b>낮과 여름</b>에만 강함. 밤에는 0.<br>' +
      '· <b>풍력</b>: <b>밤과 겨울</b>에 강함. <b>해안이나 산</b>에 두면 보너스, 평지면 페널티.<br>' +
      '· 둘은 시간대와 계절이 <b>반대</b>라서 <b>섞어 지어야</b> 하루와 한 해가 고르게 채워져요. 한쪽만 지으면 남을 때는 버리고 모자랄 때는 다른 발전기가 메워야 합니다.<br>' +
      '· <b>배터리</b>(계통 · 배터리 묶음): 남는 전기를 담았다가 모자랄 때 내보냄. <b>발전 설비 바로 옆</b>에 붙여 지어요.<br>' +
      '· 태양광을 <b>산</b>에 지으면 숲을 베어 민심과 탄소에서 손해를 봐요.<br>' +
      '재생에너지가 한꺼번에 너무 많으면 계통이 받아내지 못해 버려집니다. <b>배터리</b>와 <b>계통 테크</b>로 받쳐야 해요.',
  },
  {
    id: 'money', title: '돈이 도는 원리', target: '#money-value',
    text: '· <b>전기값(SMP)</b>은 그 시간 가장 비싼 발전기의 원가로 정해집니다. 밤에 싼 기저 전원만 돌면 값이 크게 떨어지고, 가스가 돌면 올라가요. 그래서 싼 전원을 가진 사람이 비싼 시간에 돈을 법니다. 싼 발전기만 늘리면 전기값이 내려가 판매 수입은 줄 수 있어요.<br>' +
      '· 원전·석탄 같은 기저 전원은 <b>정산조정계수</b>로 SMP보다 조금 싸게 정산되고, 재생에너지는 비중이 높은 시간에 <b>계통 통합 비용</b>이 공제돼요.<br>' +
      '· <b>용량 요금</b>은 필요한 예비력까지만 나옵니다. 그 이상 지은 설비는 유지비만 나가요.<br>' +
      '· 이익이 투자에 비해 지나치면 일부를 <b>환수</b>당합니다. 그래도 잘 운영하면 돈은 쌓이니 연구와 다음 설비에 재투자하세요.<br>' +
      '· 경제가 커질수록 <b>건설 물가</b>가 올라 건설비·유지비가 비싸집니다(배수는 지도 왼쪽 아래에 표시).<br>' +
      '· 세수와 전력 수출이 보너스 수입입니다. 남는 전기를 수출하면 <b>민심도 오릅니다</b>. 화력은 남는 전기가 없어서 못 팔고, 원전이나 태양광·풍력을 넉넉히 짓고 연계선을 놓아야 해요. 자세한 숫자는 결산 보고서에서 확인하세요.',
  },
  {
    id: 'finish', title: '이제 대통령님의 시간입니다', target: '#score-stat',
    text: '<b>국정운영 점수</b>는 매달 그달의 민심만큼 쌓이고, 20년 내내 민심 100이면 1,000점입니다. 돈, 설비, 테크, 정책은 따로 점수가 없어요. 전부 <b>민심을 지키는 수단</b>입니다. 임기가 끝나면 랭킹에 올릴 수 있어요.<br><br>' +
      '매달 순서를 추천드려요: ① 길잡이 읽기 → ② 전기가 모자랄 것 같으면 착공 → ③ 연구소·연구 → ④ 진행. 막히면 위쪽 <b>☰ 메뉴</b>의 <b>상황 요약 복사</b>로 물어보시고, 낯선 말은 <b>용어 풀이</b>에서 찾아보세요. 이 안내도 메뉴의 <b>안내 다시 보기</b>로 다시 볼 수 있습니다.<br><br>' +
      '<div class="tut-emph">마지막으로 한 가지만 강조드릴게요. <b>처음부터 모든 시스템을 다 파악하고 움직이려 하지 마세요.</b> 지금 보이는 것만 보고 직감대로 결정하고, 결과가 나오면 그때 대응하는 쪽이 훨씬 빨리 배우고, 훨씬 재미있습니다. 정전도 나고 돈도 부족해질 텐데 그게 이 게임의 정상적인 경로예요.</div>' +
      '그럼, 20년 뒤에 뵙겠습니다. 행운을 빕니다, 대통령님!',
    last: true,
  },
];

let tutBox = null, tutMask = null, tutLastKey = null, tutHighlighted = null;

function tutorialActive() { return typeof state !== 'undefined' && state && state.tutorial && !state.tutorial.done; }

function tutorialEl() {
  if (tutBox) return tutBox;
  tutBox = document.createElement('div');
  tutBox.id = 'tutorial-guide';
  tutBox.innerHTML = '<div class="tut-head" title="잡고 끌어서 옮기기"><span class="tut-avatar">👩‍💼</span><div><div class="tut-name">' + TUT_NAME + '</div><div class="tut-step"></div></div><span class="tut-grip">⋮⋮</span><button class="tut-close" title="안내 끄기">✕</button></div>' +
    '<div class="tut-title"></div><div class="tut-body"></div><div class="tut-wait"></div>' +
    '<div class="tut-actions"><button class="small ghost tut-skip">이 단계 건너뛰기</button><button class="small ghost tut-prev">← 이전</button><button class="small primary tut-next">다음 →</button></div>';
  document.body.appendChild(tutBox);
  tutBox.querySelector('.tut-next').addEventListener('click', tutorialNext);
  tutBox.querySelector('.tut-skip').addEventListener('click', tutorialNext);
  tutBox.querySelector('.tut-prev').addEventListener('click', () => { if (state.tutorial.step > 0) { state.tutorial.step--; tutLastKey = null; saveGame(); tutorialTick(); } });
  tutBox.querySelector('.tut-close').addEventListener('click', () => { if (confirm('안내를 끌까요? 위쪽 메뉴의 "안내 다시 보기"로 다시 볼 수 있습니다.')) tutorialFinish(false); });
  // 끌어서 옮기기 (머리 부분)
  const head = tutBox.querySelector('.tut-head');
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = tutBox.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    tutorialPlace(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const end = () => { if (drag) { drag = null; tutBox.dataset.moved = '1'; try { localStorage.setItem('ilpp-tut-pos', JSON.stringify({ x: tutBox.offsetLeft, y: tutBox.offsetTop })); } catch (e) {} } };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  // 저장된 위치
  let pos = null; try { pos = JSON.parse(localStorage.getItem('ilpp-tut-pos') || 'null'); } catch (e) {}
  if (pos) { tutorialPlace(pos.x, pos.y); tutBox.dataset.moved = '1'; }
  window.addEventListener('resize', () => { if (tutBox.style.left) tutorialPlace(tutBox.offsetLeft, tutBox.offsetTop); tutorialSpot(); });
  // 스포트라이트 마스크 (대상 주변을 어둡게)
  tutMask = document.createElement('div');
  tutMask.id = 'tutorial-mask';
  tutMask.className = 'hidden';
  document.body.appendChild(tutMask);
  document.addEventListener('scroll', tutorialSpot, true);
  return tutBox;
}

function tutorialPlace(x, y) {
  const w = tutBox.offsetWidth, h = tutBox.offsetHeight;
  x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
  y = Math.max(4, Math.min(window.innerHeight - h - 4, y));
  tutBox.style.left = x + 'px'; tutBox.style.top = y + 'px';
  tutBox.style.bottom = 'auto'; tutBox.style.right = 'auto';
}

// 대상 요소 주변을 어둡게: 마스크를 대상 크기로 두고 아주 큰 그림자로 나머지를 덮음
function tutorialSpot() {
  if (!tutMask) return;
  const el = tutHighlighted;
  if (!el || !document.body.contains(el) || el.classList.contains('hidden')) { tutMask.classList.add('hidden'); return; }
  const reportEl = document.getElementById('report');
  if (reportEl && !reportEl.classList.contains('hidden') && !reportEl.contains(el)) { tutMask.classList.add('hidden'); return; }   // 보고서가 열려 있으면 그 뒤를 어둡게 하지 않음
  const r = el.getBoundingClientRect();
  const full = r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8;   // 보고서처럼 화면 전체인 대상은 어둡게 하지 않음
  if (full || r.width === 0) { tutMask.classList.add('hidden'); return; }
  const pad = 6;
  tutMask.style.left = (r.left - pad) + 'px'; tutMask.style.top = (r.top - pad) + 'px';
  tutMask.style.width = (r.width + pad * 2) + 'px'; tutMask.style.height = (r.height + pad * 2) + 'px';
  tutMask.classList.remove('hidden');
}

function tutorialHighlight(sel) {
  if (tutHighlighted) { tutHighlighted.classList.remove('tut-target'); tutHighlighted = null; }
  if (sel) {
    const el = typeof sel === 'function' ? sel() : document.querySelector(sel);
    if (el) { el.classList.add('tut-target'); tutHighlighted = el; }
  }
  tutorialSpot();
}

function tutorialTick() {
  if (typeof state === 'undefined' || !state) return;
  const t = state.tutorial;
  if (!t || t.done || state.finished) { if (tutBox) tutBox.classList.add('hidden'); tutorialHighlight(null); tutorialDecisionSide(false); return; }
  if (t.step >= TUTORIAL_STEPS.length) { tutorialFinish(true); return; }
  const step = TUTORIAL_STEPS[t.step];
  // 지금 상황에 맞지 않는 단계는 조용히 건너뜀 (예: 안내를 다시 볼 때의 "목표 달성해 보기")
  if (step.skipIf && step.skipIf(state)) { t.step++; tutLastKey = null; saveGame(); if (t.step >= TUTORIAL_STEPS.length) { tutorialFinish(true); return; } return tutorialTick(); }
  // 직접 해 보는 단계인지: 확인 조건이 있고, "이미 겪어서 설명만 보여 줄 상황"(infoIf)이 아닐 때
  const hands = !!step.check && !(step.infoIf && step.infoIf(state));
  // 조건이 맞으면 자동으로 다음 단계
  if (hands && step.check(state)) { t.step++; tutLastKey = null; saveGame(); if (t.step >= TUTORIAL_STEPS.length) { tutorialFinish(true); return; } return tutorialTick(); }
  const box = tutorialEl();
  box.classList.remove('hidden');
  const key = step.id + ':' + t.step;
  if (key !== tutLastKey) {
    tutLastKey = key;
    // 필요한 탭·서브탭으로 이동
    if (step.tab && typeof currentTab !== 'undefined' && currentTab !== step.tab && !step.check) showTab(step.tab);
    if (hands && step.enter) step.enter(state);   // 단계에 들어설 때 한 번: 연습용 사건·정책 결정 띄우기
    if (step.subtab) { const b = document.querySelector('.subtab[data-subtab="' + step.subtab + '"]'); if (b && !b.classList.contains('active')) b.click(); }
    if (typeof step.target === 'string' && typeof showSidePane === 'function') { const tEl = document.querySelector(step.target); const pane = tEl && tEl.closest('.side-pane'); if (pane) showSidePane(pane.dataset.pane); }
    box.querySelector('.tut-step').textContent = (t.step + 1) + ' / ' + TUTORIAL_STEPS.length + '단계';
    box.querySelector('.tut-title').textContent = hands || !step.infoTitle ? step.title : step.infoTitle;
    box.querySelector('.tut-body').innerHTML = (hands || !step.infoText ? step.text : step.infoText).replace('{N}', TUTORIAL_STEPS.length);
    box.querySelector('.tut-body').scrollTop = 0;
    const waitText = (hands || !step.infoIf) ? (step.wait || '') : '';
    box.querySelector('.tut-wait').textContent = waitText;
    box.querySelector('.tut-wait').classList.toggle('hidden', !waitText);
    box.querySelector('.tut-skip').classList.toggle('hidden', !hands || !!step.optional);
    box.querySelector('.tut-next').classList.toggle('hidden', hands && !step.optional);
    box.querySelector('.tut-next').textContent = step.last ? '안내 마치기 ✓' : '다음 →';
    box.querySelector('.tut-prev').classList.toggle('hidden', t.step === 0);
    if (box.style.left) tutorialPlace(box.offsetLeft, box.offsetTop);   // 옮긴 적이 있을 때만 화면 안으로 되돌림
  }
  // 보고서(결산 창)가 열려 있으면 안내 창을 그 위에 띄우고, 스포트라이트는 보고서 안의 대상일 때만
  const reportOpen = !document.getElementById('report').classList.contains('hidden');
  const decisionOpen = !document.getElementById('decision').classList.contains('hidden');
  box.classList.toggle('over-modal', reportOpen || decisionOpen);
  box.classList.toggle('over-decision', decisionOpen);   // 좁은 화면에서는 안내 창을 낮춰 선택지를 덜 가리게 함
  tutorialDecisionSide(decisionOpen);
  tutorialHighlight(step.target);
  tutorialDodge();
}

// 안내 창의 기본 자리는 왼쪽 아래인데, 설명하는 대상(설비 목록 · 연구 칸)도 왼쪽에 있으면 가려짐 → 대상 오른쪽으로 비켜 줌
//  사용자가 손으로 옮겨 둔 뒤에는 건드리지 않음
let tutDodged = false;
function tutorialDodge() {
  if (!tutBox || tutBox.dataset.moved === '1') return;
  const reset = () => { tutBox.style.left = ''; tutBox.style.top = ''; tutBox.style.bottom = ''; tutBox.style.right = ''; };
  if (tutDodged) { reset(); tutDodged = false; }
  const el = tutHighlighted;
  if (!el || el.classList.contains('hidden')) return;
  const b = tutBox.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.width === 0 || r.width > window.innerWidth * 0.6) return;   // 화면 대부분을 차지하는 대상(위쪽 막대 · 결산 창)은 비켜도 소용없음
  const ox = Math.min(b.right, r.right) - Math.max(b.left, r.left), oy = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
  if (ox > 40 && oy > 40) {
    const x = r.right + 16 + b.width <= window.innerWidth - 4 ? r.right + 16 : window.innerWidth - b.width - 14;
    tutorialPlace(x, window.innerHeight - b.height - 14);
    tutDodged = true;
  }
}

// 안내 중에 사건 창이 뜨면 창을 오른쪽으로 붙여, 왼쪽 아래의 안내 창과 겹치지 않게 함
function tutorialDecisionSide(on) {
  const d = document.getElementById('decision');
  if (d) d.classList.toggle('tut-side', !!on);
}

function tutorialNext() {
  const t = state.tutorial; if (!t) return;
  const step = TUTORIAL_STEPS[t.step];
  if (step && step.last) { tutorialFinish(true); return; }
  t.step++; tutLastKey = null;
  saveGame();
  tutorialTick();
}

function tutorialFinish(completed) {
  const t = state.tutorial; if (!t) return;
  t.done = true;
  tutLastKey = null;
  if (tutBox) tutBox.classList.add('hidden');
  tutorialHighlight(null);
  tutorialDecisionSide(false);
  saveGame();
  if (typeof showMessage === 'function') showMessage(completed ? '🎓 안내를 마쳤습니다. 이제 자유롭게 운영하세요! (메뉴 → 안내 다시 보기)' : '안내를 껐습니다. 메뉴 → 안내 다시 보기로 다시 볼 수 있어요.');
  if (typeof renderAll === 'function') renderAll();
}

// 도움말(❓): 어떤 게임에서든 안내를 처음부터 다시
function tutorialRestart() {
  if (!state) return;
  state.tutorial = { step: 0, done: false, guard: false };
  tutLastKey = null;
  saveGame();
  tutorialTick();
}

// 상태가 바뀔 때마다 조건을 확인 (렌더링 훅 외에도 안전망으로 주기 확인)
setInterval(() => { if (tutorialActive()) tutorialTick(); }, 700);
document.addEventListener('click', (e) => {
  if (e.target && (e.target.id === 'report-close' || e.target.closest('#tabs') || e.target.closest('.subtab'))) setTimeout(tutorialTick, 0);
});
