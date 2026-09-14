// ------------------------------------------------------------
// 튜토리얼: 비서가 단계별로 게임 요소를 안내
//  - 각 단계는 설명 + (있으면) 확인 조건(check). 조건이 맞으면 자동으로 다음 단계로 넘어감
//  - state.tutorial = { step, done, guard }  (guard: 튜토리얼 시작 게임이면 끝날 때까지 위기 사건을 미룸)
//  - 안내 창은 머리 부분을 끌어 옮길 수 있고(위치는 브라우저에 기억), 설명 대상은 주변을 어둡게 하는 스포트라이트로 표시
// ------------------------------------------------------------
const TUT_NAME = '비서 용현';

const TUTORIAL_STEPS = [
  {
    id: 'intro', title: '처음 뵙겠습니다, 대통령님',
    text: '저는 청와대 에너지 비서 <b>용현</b>입니다. 앞으로 20년, 나라의 전력망을 함께 꾸려 갈 거예요.<br><br>' +
      '이 안내는 <b>{N}단계</b>입니다. 화면에서 <b>밝게 남는 부분</b>이 지금 설명하는 곳이고, 직접 해 보셔야 하는 단계는 하시면 저절로 넘어갑니다. 급하시면 "이 단계 건너뛰기"를 누르셔도 됩니다. 이 창은 위쪽을 잡고 끌어서 옮길 수 있어요.<br><br>' +
      '핵심은 세 가지예요. <b>전기가 모자라지 않게</b>, <b>탄소를 줄이면서</b>, <b>돈이 마르지 않게</b>. 이 셋이 국민 행복도와 국정 운영 점수를 정합니다.',
  },
  {
    id: 'topbar', title: '위쪽 막대: 나라의 상태', target: '#topbar',
    text: '왼쪽부터 <b>💰 자금</b>, <b>😊 행복도</b>(너무 낮아지면 탄핵됩니다), <b>👥 인구</b>(전력 수요를 정함), <b>🏆 국정 운영 점수</b>(지금 끝나면 받을 점수), <b>R&amp;D 수준</b>입니다.<br><br>' +
      '오른쪽의 <b>이번 달 진행 ▶</b>(단축키 Space)을 누르면 한 달이 지나고 결산이 나옵니다. <b>📋 요약</b>은 지금 상황을 글로 복사해 주니, 저에게(또는 AI에게) 조언을 구할 때 붙여 넣으세요. 게임은 매달 자동 저장됩니다.',
  },
  {
    id: 'map', title: '지도 읽기', target: '#board',
    text: '<b>회색 칸</b>이 도시(전기를 사는 곳), <b>초록</b>은 땅, <b>파랑</b>은 강과 바다, <b>진한 초록 ▲</b>은 산이에요. 산에는 태양광·풍력만 지을 수 있고, 산 위 도시는 사람이 덜 삽니다. 도시 옆에 시작 설비 <b>복합발전 1기</b>와 <b>가스터빈 1기</b>가 이미 돌아가고 있습니다.<br><br>' +
      '빈 땅을 <b>끌면</b> 지도가 움직이고, <b>마우스 휠</b>로 확대·축소, 아래 <b>미니맵</b>을 누르면 그곳으로 이동합니다. 설비 위 <b>빗금</b>은 건설 중, <b>노란 점</b>은 노후, <b>붉은 글씨</b>는 수명이 끝나 멈춘 설비예요. 멈춘 설비는 철거하고 새로 지어야 합니다.',
  },
  {
    id: 'forecast', title: '이번 달 전망: 매달 제일 먼저 볼 곳', target: '#forecast-info',
    text: '세 칸이 나라의 건강 지표예요.<br>' +
      '· <b>공급 / 수요</b>: 언제든 낼 수 있는 공급과 이달 최대 수요. "부족"이 뜨면 정전입니다.<br>' +
      '· <b>탄소</b>: 발전량당 배출량. 몇 년 뒤부터 <b>배출 기준</b>이 생기고 해마다 엄격해져, 넘기면 행복도가 매달 깎여요.<br>' +
      '· <b>계통 안정도</b>: <b>주파수</b>가 흔들리지 않을지 보는 점수예요. 재생에너지 비중이 너무 높거나, 예비력이 얇거나, 밤에 과잉 발전이 생기면 내려갑니다.<br><br>' +
      '세 칸의 색이 초록이면 괜찮고, 노랑은 주의, 빨강은 지금 손써야 한다는 뜻이에요. 칸 아래 한 줄에 가장 큰 이유가 적혀 있습니다. 그 아래 그래프는 다음 단계에서 자세히 볼게요.',
  },
  {
    id: 'chart', title: '하루 그래프 읽기', target: '#forecast-graph',
    text: '이번 달 <b>하루 24시간</b>의 수요와 공급이에요.<br>' +
      '· <b>흰 선</b> = 수요. 저녁에 가장 높습니다.<br>' +
      '· <b>색 띠</b> = 공급. 회색은 언제든 낼 수 있는 전원(원전·화력·수입), 주황은 태양광(낮에만), 하늘색은 풍력(바람 따라).<br>' +
      '· <b>빨강</b> = 흰 선이 띠 위로 올라간 시간 = <b>정전</b>.<br><br>' +
      '<b>어디가 빨간지</b>가 답이에요. 낮이면 태양광, 저녁·새벽이면 조절 전원이나 ESS, 종일이면 기저 전원.<br><br>' +
      '<b>유연성</b>: 해 질 무렵 태양광이 빠지며 수요는 오르는 구간이 고비예요. 남은 전원이 그만큼 <b>빨리 출력을 올려야</b> 하고, 느린 전원만 있으면 띠가 충분해 보여도 정전이 납니다.<br><br>' +
      '아래 <b>진단</b> 한 줄이 부족 시간대·추천 설비·언제 부족해질지를 알려 줘요. 지금 읽어 보세요.',
  },
  {
    id: 'build', title: '첫 설비 짓기 (직접 해 보세요)', target: '#palette-cards',
    text: '왼쪽 카드에서 <b>가스터빈</b>을 <b>끌어서</b> 도시 근처 빈 땅에 놓아 보세요. 놓기 전에 자리 위에 비용과 공사 기간이 뜹니다.<br><br>' +
      '기억하실 것: <b>도시에서 멀수록 송전 손실</b>이 커지고, 원전·풍력·석탄은 <b>도시 가까이 두면 주민 반발</b>이 있고, 모든 설비는 <b>공사 기간</b>이 있어요(카드에 적혀 있습니다). 수요는 해마다 늘고, <b>조절 전원(가스·석탄·원전)이 넉넉하면 그만큼 사람과 공장이 몰려와 더 빨리 늘어요</b>. 태양광·풍력은 수요를 부르지 않습니다. 여유를 크게 지어도 몇 달이면 채워지니, 늘 <b>부족해지기 전에</b> 다음 설비를 착공하는 게 대통령의 일입니다.',
    check: (s) => s.buildings.some((b) => b.status === 'building'),
    wait: '가스터빈 카드를 지도 위 빈 땅으로 끌어다 놓으면 넘어갑니다.',
  },
  {
    id: 'select', title: '설비 정보 보기 (직접 해 보세요)', target: '#selected-panel',
    text: '방금 지은 설비를 <b>클릭</b>해 보세요. 오른쪽 "선택한 설비"에 용량, 송전 손실, 남은 공사 기간, 수명이 나옵니다.<br><br>' +
      '여기서 <b>철거</b>를 하고, 가스터빈은 <b>복합발전으로 개조</b>할 수도 있습니다. 테크트리 연구 효과는 따로 적용할 필요 없이 <b>이미 지은 설비에도 바로</b> 붙습니다. 수명이 끝난 설비는 자리만 차지하고 유지비가 나가니 꼭 철거하세요.',
    check: (s) => s.selectedId !== null && s.selectedId !== undefined && s.buildings.some((b) => b.id === s.selectedId),
    wait: '지도에서 설비 하나를 클릭하면 넘어갑니다.',
  },
  {
    id: 'advance', title: '한 달 진행하기 (직접 해 보세요)', target: '#next-month',
    text: '이제 <b>이번 달 진행 ▶</b>을 누르거나 <b>Space</b>를 눌러 보세요. 한 달 동안의 전력 거래가 시간대별로 계산되고 결산 보고서가 뜹니다.<br><br>' +
      '한 달에 할 수 있는 일: 설비 짓기(제한 없음), 연구원 영입 1명 + 강화 1명, 연구 시작(동시 진행 수는 R&amp;D 수준에 따라). 다 하셨으면 진행하세요.',
    check: (s) => (s.history || []).length >= 1,
    wait: '"이번 달 진행" 버튼을 누르면 넘어갑니다.',
  },
  {
    id: 'report', title: '결산 보고서 읽기', target: '#report',
    text: '매달 이 보고서가 뜹니다. 왼쪽이 <b>돈</b>, 오른쪽이 <b>전기</b>예요.<br>' +
      '· <b>전력 판매</b>: 발전량 × 그 시간 전기값(SMP). 가장 비싼 발전기의 원가가 전기값을 정하니, 가스가 비쌀수록 전기값도 오릅니다.<br>' +
      '· <b>용량 요금</b>: 조절 가능 설비에 주는 대기료. 필요한 예비력까지만 줘서 <b>과잉 건설은 손해</b>예요.<br>' +
      '· <b>연료비 · 탄소세 · 유지비 · 인건비</b>가 지출. 정전이 나면 <b>정전 보상</b>이 크게 나갑니다.<br>' +
      '· 이익이 지나치게 크면 <b>초과 이윤 환수</b>로 일부를 정부가 가져갑니다.<br><br>' +
      '아래 <b>행복도 변화</b> 항목을 꼭 보세요. 무엇 때문에 올랐고 내렸는지 다 적혀 있습니다.',
    check: () => document.getElementById('report').classList.contains('hidden'),
    wait: '다 읽으셨으면 보고서의 "다음 달로" 버튼이나 Space로 닫으세요. 닫히면 넘어갑니다.',
  },
  {
    id: 'quests', title: '🎯 목표와 사건', target: '#quest-panel',
    text: '여기에 지금 목표가 있어요. 기한 안에 이루면 <b>보상</b>(자금·행복도)이 있고, 놓치면 <b>페널티</b>가 있습니다.<br><br>' +
      '가끔 <b>사건 카드</b>가 뜹니다. 선택지마다 비용과 효과가 다르고, 어떤 선택은 <b>후속 목표</b>로 이어져요. 무엇이 올지는 겪어 보셔야 압니다.',
  },
  {
    id: 'bottom', title: '지도 아래: 나라 운영 요약', target: '#board-bottom', tab: 'map',
    text: '미니맵 둘레에 매달 봐야 할 것들이 모여 있어요.<br>' +
      '· <b>🎯 목표</b>: 기한과 진행률. 이루면 보상, 놓치면 페널티.<br>' +
      '· <b>📰 최근 소식</b>: 사건, 목표 결과, 첫 정전·첫 원전 가동 같은 기록이 최신순으로.<br>' +
      '· <b>🏛 정책</b>: 임기 초반 몇 년 동안 해마다 하나씩 정하는 <b>정책 노선</b>과, 사건에서 내린 선택·목표 결과의 <b>최근 기록</b>. 노선은 나라의 조건을 오래 바꾸니 그때그때 설명을 읽고 고르세요.<br>' +
      '· <b>🧪 테크 · 🔬 R&amp;D</b>: R&amp;D 수준, 연구원 수, 동시 연구 수, 다음 관문, 그리고 트리별 개발 단계(●○)와 진행 중인 연구. 누르면 테크트리 탭으로 갑니다.<br><br>' +
      '매달 진행하기 전에 이 줄을 한 번씩 훑는 습관을 들이세요.',
  },
  {
    id: 'tech-tab', title: '테크트리 탭으로 (직접 해 보세요)', target: '#tabs',
    text: '위쪽 <b>🧪 테크트리</b> 탭을 눌러 보세요(단축키 2).',
    check: () => typeof currentTab !== 'undefined' && currentTab === 'tech',
    wait: '테크트리 탭을 누르면 넘어갑니다.',
    tab: 'tech',
  },
  {
    id: 'tech', title: '테크트리: 설비를 강하게', target: '#tech-grid',
    text: '발전원마다 <b>4단계</b>가 있고, 단계마다 설비가 눈에 띄게 좋아져요(연료비·탄소 감소, 출력 증가, 건설비 감소, 새 설비 해금 등). 새 설비는 테크로 열리는 것도 있습니다.<br><br>' +
      '연구는 <b>돈을 내고 몇 달 뒤 확률로</b> 성공합니다. 단계가 높을수록 확률이 낮고, <b>R&amp;D 수준이 높을수록, 실패가 쌓일수록</b> 확률이 올라가요. 실패해도 돈은 돌아오지 않습니다.<br><br>' +
      '단계마다 <b>R&amp;D 수준 관문</b>이 있어서, 연구소를 키우지 않으면 좋은 설비를 못 써요. 업계 표준 효율은 해마다 좋아지니, 연구를 안 하면 마진이 점점 얇아집니다. 각 카드에 비용·확률·필요 수준이 적혀 있어요.',
  },
  {
    id: 'rd-tab', title: 'R&D 탭으로 (직접 해 보세요)', target: '#tabs',
    text: '이번엔 <b>🔬 R&amp;D</b> 탭을 눌러 보세요(단축키 3).',
    check: () => typeof currentTab !== 'undefined' && currentTab === 'rd',
    wait: 'R&D 탭을 누르면 넘어갑니다.',
    tab: 'rd',
  },
  {
    id: 'hire', title: '연구원 영입 (직접 해 보세요)', target: '#rd-table',
    text: '<b>학부 연구원</b>을 한 명 영입해 보세요. 연구원 수와 등급이 <b>R&amp;D 수준</b>이 됩니다.<br><br>' +
      '· 영입과 강화(승급)는 <b>한 달에 한 번씩</b>. 강화는 확률이고, 기대 비용은 바로 영입하는 것과 비슷하게 맞춰져 있어요.<br>' +
      '· 낮은 등급은 조금씩 퇴사하고, 높은 등급은 <b>연구가 실패하면 책임지고 퇴사</b>할 수 있습니다. 오래 근무하면 은퇴해요.<br>' +
      '· R&amp;D 수준은 연구 성공 확률, 동시 연구 수, 건설비·유지비 할인, <b>특허 수입</b>을 줍니다. 인건비는 매달 나가니 감당할 만큼만 키우세요.',
    check: (s) => Object.values(s.rd || {}).reduce((a, b) => a + (b || 0), 0) > 0,
    wait: '연구원을 한 명 영입하면 넘어갑니다.',
  },
  {
    id: 'research', title: '첫 연구 시작하기', target: '#tabs',
    text: 'R&amp;D 수준이 첫 관문을 넘으면 테크트리에서 1단계 연구를 시작할 수 있어요. 추천은 <b>가스터빈 1단계</b>처럼 지금 쓰는 설비를 바로 좋게 하는 것.<br><br>' +
      '연구는 <b>몇 달 뒤</b> 결과가 나오고, 성공하면 <b>이미 지은 설비와 새 설비 모두</b>에 그 달부터 바로 적용됩니다. 따로 개조할 필요가 없어요.<br><br>' +
      '아직 관문에 못 미치면 지금은 넘어가고, 나중에 꼭 시작하세요. 연구 없이 20년을 버티기는 어렵습니다.',
    check: (s) => !!(s.techBusy && Object.keys(s.techBusy).length) || (s.techLog || []).length > 0,
    wait: '연구를 시작하면 자동으로 넘어갑니다. 아직이면 "다음"을 누르세요.',
    optional: true,
  },
  {
    id: 'city', title: '도시와 인구', target: '#palette', tab: 'map', subtab: 'city',
    text: '인구는 행복도가 높을수록, 전기가 남을수록 빨리 늘어요. 도시가 <b>과밀</b>해지면 행복도가 매달 깎입니다.<br><br>' +
      '왼쪽의 <b>도시</b> 서브탭에서 <b>새 도시</b>를 세워 인구를 나누세요. 빈 땅을 직접 칠하거나 <b>자동 부지</b> 버튼으로 고르면 됩니다. 새 도시가 생기면 이주민이 들어와 <b>수요가 더 늘어나니</b> 설비도 같이 늘려야 해요.<br><br>' +
      '도시는 저절로 넓어지지 않습니다. 산에도 세울 수 있지만 산 칸은 반 칸으로 쳐서 사람이 덜 살아요. 언제 어디에 도시를 세울지는 대통령님의 전략이에요.',
  },
  {
    id: 'happy', title: '행복도를 지키는 법', target: '#happy-value',
    text: '행복도는 매달 이런 것들로 움직여요.<br>' +
      '· <b>내려가는 것</b>: 정전, 주파수 사고, 비싼 전기, 탄소 배출 기준 초과, 도시 과밀, 원전·풍력·석탄이 도시 가까이.<br>' +
      '· <b>올라가는 것</b>: 안정적인 공급, 싼 전기, 경기 호황, 목표 달성 보상.<br>' +
      '· 행복도가 아주 높으면 국민의 <b>기대치도 높아져</b> 유지가 어려워집니다.<br><br>' +
      '행복도가 바닥까지 떨어지면 <b>탄핵</b>, 부채가 한도를 넘으면 <b>국가 부도</b>로 임기가 끝납니다.',
  },
  {
    id: 'carbon', title: '탄소: 20년의 큰 흐름', target: '#co2-chip',
    text: '탄소를 배출하면 톤당 <b>탄소세</b>를 내고, 세율은 해마다 오르며 사건에 따라 더 오르기도 해요. 몇 년 뒤부터는 <b>배출 원단위 기준</b>이 생기고 임기 내내 엄격해집니다. 가스·석탄만으로는 20년을 버티기 어려워요.<br><br>' +
      '무탄소 전원으로 가는 길은 여러 가지이고, 어느 길이든 <b>R&amp;D와 테크</b>가 받쳐 줘야 합니다. 어떤 조합이 나라에 맞는지는 대통령님이 찾아내셔야 해요.',
  },
  {
    id: 'plants1', title: '발전 설비 ①: 조절할 수 있는 전원', target: '#palette-cards', tab: 'map', subtab: 'plants',
    text: '카드에 마우스를 올리면 상세가 뜹니다. 성격만 한 줄씩.<br>' +
      '· <b>가스터빈</b>: 빨리 짓고 출력을 빠르게 올림. 연료비 비쌈. 피크·비상용.<br>' +
      '· <b>복합발전</b>: 가스보다 효율 높고 탄소 적음. 조절 전원의 주력.<br>' +
      '· <b>석탄</b>: 연료 싸고 24시간 기저. 탄소 최다, 출력 조절 느림.<br>' +
      '· <b>원전·SMR</b>: 무탄소 기저. 비싸고 오래 걸리며 항상 최대 출력. 테크로 열림.',
  },
  {
    id: 'plants2', title: '발전 설비 ②: 재생에너지', target: () => document.querySelector('.pc-group[data-group="renew"]') || document.getElementById('palette-cards'),
    text: '카드의 MW는 <b>설비 용량</b>, 실제 출력은 날씨 때문에 훨씬 낮습니다(카드에 "평균 ~"로 표시).<br>' +
      '· <b>태양광</b>: 싸고 빠르지만 <b>낮에만</b>. 저녁 피크엔 도움 안 됨.<br>' +
      '· <b>풍력</b>: 바람 따라, 밤에도 발전. <b>해안이나 산</b>에 두면 보너스, 평지면 페널티.<br>' +
      '· 태양광을 <b>산</b>에 지으면 땅은 아끼지만 산림 훼손으로 행복도가 조금씩 깎여요.<br>' +
      '재생이 많아질수록 저녁 유연성과 주파수 안정이 흔들리니, 다음 탭의 설비와 계통 테크로 받쳐야 합니다.',
  },
  {
    id: 'infra-tab', title: '저장·수소·연계 탭 (직접 해 보세요)', target: '.subtab[data-subtab="infra"]',
    text: '왼쪽 위 <b>저장·수소·연계</b> 탭을 눌러 보세요. 발전은 안 하지만 전력망을 받쳐 주는 설비들입니다.',
    check: () => typeof paletteCat !== 'undefined' && paletteCat === 'infra',
    wait: '저장·수소·연계 탭을 누르면 넘어갑니다.',
  },
  {
    id: 'infra', title: '저장 · 수소 · 연계', target: '#palette-cards',
    text: '· <b>ESS</b>: 남는 낮 전기를 저장해 저녁에 방전. 재생에너지의 빈틈을 메우고 출력 제한을 줄임.<br>' +
      '· <b>암모니아 크래킹</b>: 수입 암모니아에서 수소를 뽑아 가스터빈·복합발전 연료로 씁니다(수소 터빈 테크 필요). 가스보다 비싸 전기값은 오르지만 탄소가 0이 되고, 남는 수소는 수출. 모두 자동.<br>' +
      '· <b>연계선</b>: 이웃 나라와 전기 수출입. 수출은 이웃 수요만큼, 수입은 한도 안에서.<br>' +
      '재생을 크게 가면 ESS·계통 테크가 세트이고, 밤을 무탄소로 넘기려면 크래킹 + 수소 터빈이 답입니다.',
  },
  {
    id: 'money', title: '돈이 도는 원리', target: '#money-value',
    text: '· <b>전기값(SMP)</b>은 그 시간 가장 비싼 발전기의 원가로 정해집니다. 밤에 싼 기저 전원만 돌면 값이 크게 떨어지고, 가스가 돌면 올라가요. 그래서 싼 전원을 가진 사람이 비싼 시간에 돈을 법니다.<br>' +
      '· 원전·석탄 같은 기저 전원은 <b>정산조정계수</b>로 SMP보다 조금 싸게 정산되고, 재생에너지는 비중이 높은 시간에 <b>계통 통합 비용</b>이 공제돼요.<br>' +
      '· <b>용량 요금</b>은 필요한 예비력까지만 나옵니다. 그 이상 지은 설비는 유지비만 나가요.<br>' +
      '· 이익이 투자에 비해 지나치면 일부를 <b>환수</b>당합니다. 그래도 잘 운영하면 돈은 쌓이니 R&amp;D와 다음 설비에 재투자하세요.<br>' +
      '· 세수, 특허 수입, 수소·전력 수출이 보너스 수입입니다. 자세한 숫자는 결산 보고서에서 확인하세요.',
  },
  {
    id: 'finish', title: '이제 대통령님의 시간입니다', target: '#score-stat',
    text: '임기가 끝나면 <b>국정 운영 점수</b>(행복 · 전력 시스템 · 탄소 · 경제 규모 · 자본)가 나오고 랭킹에 올릴 수 있어요. 안정만 좇으면 경제·자본 점수가 낮고, 탄소를 무시하면 탄소 점수가 없으니 <b>다섯 축을 고루</b> 챙기세요.<br><br>' +
      '매달 순서를 추천드려요: ① 전망 진단 읽기 → ② 부족 예상이면 착공 → ③ 연구원·연구 → ④ 목표·사건 확인 → ⑤ 진행. 막히면 <b>📋 요약</b>을 복사해 물어보시고, 이 안내는 위쪽 <b>❓</b> 버튼으로 언제든 다시 볼 수 있습니다.<br><br>' +
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
  tutBox.querySelector('.tut-close').addEventListener('click', () => { if (confirm('안내를 끌까요? 위쪽 ❓ 버튼으로 다시 볼 수 있습니다.')) tutorialFinish(false); });
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
  const end = () => { if (drag) { drag = null; try { localStorage.setItem('ilpp-tut-pos', JSON.stringify({ x: tutBox.offsetLeft, y: tutBox.offsetTop })); } catch (e) {} } };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  // 저장된 위치
  let pos = null; try { pos = JSON.parse(localStorage.getItem('ilpp-tut-pos') || 'null'); } catch (e) {}
  if (pos) tutorialPlace(pos.x, pos.y);
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
  if (!t || t.done || state.finished) { if (tutBox) tutBox.classList.add('hidden'); tutorialHighlight(null); return; }
  if (t.step >= TUTORIAL_STEPS.length) { tutorialFinish(true); return; }
  const step = TUTORIAL_STEPS[t.step];
  // 조건이 맞으면 자동으로 다음 단계
  if (step.check && step.check(state)) { t.step++; tutLastKey = null; saveGame(); if (t.step >= TUTORIAL_STEPS.length) { tutorialFinish(true); return; } return tutorialTick(); }
  const box = tutorialEl();
  box.classList.remove('hidden');
  const key = step.id + ':' + t.step;
  if (key !== tutLastKey) {
    tutLastKey = key;
    // 필요한 탭·서브탭으로 이동
    if (step.tab && typeof currentTab !== 'undefined' && currentTab !== step.tab && !step.check) showTab(step.tab);
    if (step.subtab) { const b = document.querySelector('.subtab[data-subtab="' + step.subtab + '"]'); if (b && !b.classList.contains('active')) b.click(); }
    box.querySelector('.tut-step').textContent = (t.step + 1) + ' / ' + TUTORIAL_STEPS.length + '단계';
    box.querySelector('.tut-title').textContent = step.title;
    box.querySelector('.tut-body').innerHTML = step.text.replace('{N}', TUTORIAL_STEPS.length);
    box.querySelector('.tut-body').scrollTop = 0;
    box.querySelector('.tut-wait').textContent = step.wait || '';
    box.querySelector('.tut-wait').classList.toggle('hidden', !step.wait);
    box.querySelector('.tut-skip').classList.toggle('hidden', !step.check || !!step.optional);
    box.querySelector('.tut-next').classList.toggle('hidden', !!step.check && !step.optional);
    box.querySelector('.tut-next').textContent = step.last ? '안내 마치기 ✓' : '다음 →';
    box.querySelector('.tut-prev').classList.toggle('hidden', t.step === 0);
    if (box.style.left) tutorialPlace(box.offsetLeft, box.offsetTop);   // 옮긴 적이 있을 때만 화면 안으로 되돌림
  }
  // 보고서(결산 창)가 열려 있으면 안내 창을 그 위에 띄우고, 스포트라이트는 보고서 안의 대상일 때만
  const reportOpen = !document.getElementById('report').classList.contains('hidden');
  box.classList.toggle('over-modal', reportOpen);
  tutorialHighlight(step.target);
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
  saveGame();
  if (typeof showMessage === 'function') showMessage(completed ? '🎓 안내를 마쳤습니다. 이제 자유롭게 운영하세요! (❓ 버튼으로 다시 볼 수 있어요)' : '안내를 껐습니다. ❓ 버튼으로 다시 볼 수 있어요.');
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
