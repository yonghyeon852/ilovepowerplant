// ============================================================
// 화제(buzz) 사건: 세상 돌아가는 이야기에서 따온 가벼운 사건 카드
//  - 위기도 기회도 아닌 "소동". 효과는 작고(민심 ±1~4, 돈 조금, 몇 달짜리 출력 변화) 글은 짧게
//  - 답이 정해진 카드를 만들지 않음: 선택지마다 얻는 것과 치르는 것이 있어야 함 (원칙은 events4.js 머리말)
//  - 인물과 작품 이름은 전부 지어낸 것 (실제 인물·단체와 무관한 패러디)
//  - events4.js의 가벼운 카드들과 한 묶음으로 평균 석 달 남짓에 한 번 나오고(events.js의 pickDecision), 한 판에 같은 카드는 한 번만 나옴
// ============================================================
(function () {
  const hp = (s, v) => { s.happiness = clamp(s.happiness + v, 0, 100); };
  const cash = (s, base) => scaleMoney(s, base);
  const won = (v) => fmt(v) + '억';
  const count = (s, type) => s.buildings.filter((b) => b.type === type && b.status === 'online').length;
  const hasNuke = (s) => s.buildings.some((b) => PLANTS[b.type].kind === 'nuclear' && (b.status === 'online' || b.status === 'building'));
  const recentBlackout = (s) => (s.history || []).slice(-6).some((x) => x.blackoutHours > 0);
  const grow = (s, f) => { for (const c of s.cities) c.pop *= f; };
  const B = (o) => Object.assign({ cat: 'buzz' }, o);

  DECISIONS.push(
    B({
      id: 'buzz_greta', icon: '🧒', name: '환경 운동가 그레타 툰드리 방한',
      cond: (s) => count(s, 'coal') > 0,
      desc: '세계적인 10대 환경 운동가가 석탄발전소 정문 앞에 텐트를 쳤습니다. "하우 데어 유!"가 실시간 검색어 1위입니다.',
      choices: [
        { label: '함께 사진을 찍고 탈석탄을 약속한다', desc: () => '민심 +3 · 목표 "석탄 1기 폐쇄"가 생김', apply(s) { hp(s, 3); return '탈석탄 약속: 민심 +3' + giveQuest(s, 'coal_exit'); } },
        { label: '발전소 견학을 시켜 준다', cost: (s) => cash(s, 100), desc: (s) => '−' + won(cash(s, 100)) + ' · 민심 +1', apply(s) { const c = cash(s, 100); s.money -= c; hp(s, 1); return '발전소 견학: 툰드리는 굴뚝을 한참 노려보다 돌아갔습니다. 민심 +1'; } },
        { label: '정중히 모른 척한다', desc: () => '민심 −3', apply(s) { hp(s, -3); return '모른 척: 텐트가 일주일 더 머물렀습니다. 민심 −3'; } },
      ],
    }),
    B({
      id: 'buzz_movie', icon: '🎬', name: '원전 재난 영화 〈멜트다운〉 천만 관객',
      cond: hasNuke,
      desc: '극장을 나선 관객들이 원전 위치 지도 앱을 깔고 있습니다. 주연 배우는 "실화가 아니라서 다행"이라고 인터뷰했습니다.',
      choices: [
        { label: '감독과 공개 토론을 한다', desc: () => '반반 확률 · 민심 +2 또는 −5', apply(s) { if (Math.random() < 0.5) { hp(s, 2); return '토론 승리: "영화는 영화일 뿐"이 유행어가 됐습니다. 민심 +2'; } hp(s, -5); return '토론 참패: 감독의 말솜씨가 한 수 위였습니다. 민심 −5'; } },
        { label: '원전 안전 다큐로 맞불을 놓는다', cost: (s) => cash(s, 300), desc: (s) => '−' + won(cash(s, 300)) + ' · 민심 −1', apply(s) { const c = cash(s, 300); s.money -= c; hp(s, -1); return '안전 다큐 방영: 시청률은 낮았지만 불안은 가라앉았습니다. 민심 −1'; } },
        { label: '극장가가 잠잠해지길 기다린다', desc: () => '민심 −4', apply(s) { hp(s, -4); return '기다림: 속편 제작이 확정됐습니다. 민심 −4'; } },
      ],
    }),
    B({
      id: 'buzz_birds', icon: '🦅', name: '철새 떼, 풍력 단지와 충돌',
      cond: (s) => count(s, 'wind') >= 3,
      desc: '철새 수백 마리가 풍력 터빈에 부딪혔다는 영상이 퍼졌습니다. 조류 협회가 "새들도 유권자의 친구"라는 성명을 냈습니다.',
      choices: [
        { label: '이동철 두 달 풍력을 반만 돌린다', desc: () => '2개월 풍력 출력 −50% · 민심 +2', apply(s) { addEffect(s, { name: '철새 보호 (풍력 출력 −50%)', kindDerate: { kind: 'wind', factor: 0.5 } }, 2); hp(s, 2); return '철새 보호: 2개월 풍력 출력 −50%, 민심 +2'; } },
        { label: '조류 감지 레이더를 단다', cost: (s) => cash(s, 400), desc: (s) => '−' + won(cash(s, 400)) + ' · 민심 +1', apply(s) { const c = cash(s, 400); s.money -= c; hp(s, 1); return '조류 레이더 설치: 민심 +1'; } },
        { label: '"새는 원래 부딪힌다"', desc: () => '민심 −3', apply(s) { hp(s, -3); return '실언: 발언이 그대로 기사 제목이 됐습니다. 민심 −3'; } },
      ],
    }),
    B({
      id: 'buzz_trumpet_lng', icon: '🎺', name: '강대국 트럼펫 대통령 "우리 가스를 사라"',
      cond: (s) => onlineOf(s, (p) => p.kind === 'ccgt' || p.kind === 'gt').length > 0,
      desc: '"아주 아름다운 가스다, 세계 최고다. 안 사면 관세다." 새벽 3시에 올라온 글 하나로 외교부가 비상입니다.',
      choices: [
        { label: '가스 장기 계약을 맺는다', desc: () => '2년간 가스 연료비 −15% · 민심 −2', apply(s) { addEffect(s, { name: '트럼펫 가스 계약 (연료비 −15%)', gasMult: 0.85 }, 24); hp(s, -2); return '가스 계약: 2년간 가스 연료비 −15%, "굴욕 외교" 논란으로 민심 −2'; } },
        { label: '거절한다', desc: () => '1년간 전력 수출 단가 −30% · 민심 +2', apply(s) { addEffect(s, { name: '트럼펫 관세 (수출 단가 −30%)', exportMult: 0.7 }, 12); hp(s, 2); return '거절: 1년간 수출 단가 −30%, 당당한 외교에 민심 +2'; } },
        { label: '골프 회동으로 푼다', cost: (s) => cash(s, 200), desc: (s) => '−' + won(cash(s, 200)) + ' · 없던 일이 됨', apply(s) { const c = cash(s, 200); s.money -= c; return '골프 회동: 18홀을 져 주고 없던 일로 했습니다 (' + won(c) + ')'; } },
      ],
    }),
    B({
      id: 'buzz_trumpet_wind', icon: '🎺', name: '트럼펫 "풍력 터빈은 고래를 미치게 한다"',
      cond: (s) => count(s, 'wind') >= 2,
      desc: '연설 한 대목이 번역돼 퍼지면서 풍력 반대 서명이 시작됐습니다. 고래 쪽 입장은 아직 확인되지 않았습니다.',
      choices: [
        { label: '과학자들과 팩트체크 방송', cost: (s) => cash(s, 150), desc: (s) => '−' + won(cash(s, 150)) + ' · 민심 +1', apply(s) { const c = cash(s, 150); s.money -= c; hp(s, 1); return '팩트체크 방송: 고래는 멀쩡했습니다. 민심 +1'; } },
        { label: '그냥 둔다', desc: () => '민심 −2', apply(s) { hp(s, -2); return '방치: 서명이 10만 명을 넘었습니다. 민심 −2'; } },
      ],
    }),
    B({
      id: 'buzz_trumpet_pact', icon: '🎺', name: '트럼펫, 탄소 협약 탈퇴 선언', minYear: 3,
      desc: '강대국이 탄소 협약에서 빠지겠다고 합니다. 우리도 따라갈지, 전 세계가 눈치 게임을 시작했습니다.',
      choices: [
        { label: '우리는 지킨다', desc: () => '민심 +2', apply(s) { hp(s, 2); return '협약 유지: 민심 +2'; } },
        { label: '슬쩍 따라간다', desc: () => '탄소세 −15% · 민심 −4', apply(s) { s.carbonTax = Math.round(s.carbonTax * 0.85); hp(s, -4); return '탄소세 −15%, 환경 단체의 항의로 민심 −4'; } },
      ],
    }),
    B({
      id: 'buzz_musk', icon: '🚀', name: '억만장자 일롱 머스킷의 내기', minYear: 2,
      desc: '"100일 안에 배터리 기술을 못 넘기면 돈을 안 받겠다." 글이 올라온 지 한 시간 만에 주가가 세 번 출렁였습니다.',
      choices: [
        { label: '내기를 받는다', cost: (s) => cash(s, 600), desc: (s) => '−' + won(cash(s, 600)) + ' · 계통·배터리 다음 연구 확률 +25%', apply(s) { const c = cash(s, 600); s.money -= c; if (!s.techPity) s.techPity = {}; s.techPity.grid = (s.techPity.grid || 0) + 0.25; return '기술 제휴 ' + won(c) + ': 계통·배터리 다음 연구 확률 +25%'; } },
        { label: '댓글로만 응수한다', desc: () => '민심 +1', apply(s) { hp(s, 1); return '대통령의 댓글이 "좋아요" 50만 개를 받았습니다. 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_ai', icon: '🤖', name: 'AI 챗봇 열풍', minYear: 1,
      desc: '온 국민이 AI에게 저녁 메뉴를 묻기 시작했습니다. 데이터센터가 전기를 물처럼 마십니다.',
      choices: [
        { label: '데이터센터를 환영한다', desc: (s) => '+' + won(cash(s, 600)) + ' · 수요 +4%', apply(s) { const m = cash(s, 600); s.money += m; grow(s, 1.04); return '데이터센터 유치: +' + won(m) + ', 수요 +4%'; } },
        { label: '전기 부담금을 매긴다', desc: (s) => '+' + won(cash(s, 300)) + ' · 민심 −2', apply(s) { const m = cash(s, 300); s.money += m; hp(s, -2); return '부담금 +' + won(m) + ', "AI 쇄국" 비판으로 민심 −2'; } },
      ],
    }),
    B({
      id: 'buzz_idol', icon: '🎤', name: '아이돌 네온핑크의 월드투어 조건',
      desc: '"콘서트 전기는 100% 재생에너지로." 팬덤이 대통령실 게시판에 줄을 섰습니다.',
      choices: [
        { label: '"우리 전기는 이미 깨끗합니다"', cost: (s) => (s.lastReport && renShareOf(s.lastReport) >= 0.3 ? 0 : Infinity), desc: (s) => (s.lastReport && renShareOf(s.lastReport) >= 0.3 ? '민심 +4' : '재생에너지 비중 30% 이상일 때만'), apply(s) { hp(s, 4); return '멤버들이 무대에서 우리 전력망을 칭찬했습니다. 민심 +4'; } },
        { label: '재생에너지 인증서를 사 준다', cost: (s) => cash(s, 200), desc: (s) => '−' + won(cash(s, 200)) + ' · 민심 +3', apply(s) { const c = cash(s, 200); s.money -= c; hp(s, 3); return '인증서 구매: 콘서트는 매진, 민심 +3'; } },
        { label: '디젤 발전기를 빌려준다', desc: () => '민심 −3', apply(s) { hp(s, -3); return '디젤 발전기: 팬덤의 분노가 실시간 트렌드에 올랐습니다. 민심 −3'; } },
      ],
    }),
    B({
      id: 'buzz_coin', icon: '⛏', name: '코인 채굴장 급증', minYear: 1,
      desc: '싼 심야 전기를 노린 채굴장이 빈 창고마다 들어섰습니다. 동네 변압기가 밤마다 웁니다.',
      choices: [
        { label: '채굴세를 걷는다', desc: (s) => '+' + won(cash(s, 500)) + ' · 수요 +3%', apply(s) { const m = cash(s, 500); s.money += m; grow(s, 1.03); return '채굴세 +' + won(m) + ', 수요 +3%'; } },
        { label: '단속한다', desc: () => '민심 +1', apply(s) { hp(s, 1); return '채굴장 단속: 밤이 조용해졌습니다. 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_worldcup', icon: '⚽', name: '월드컵 4강 진출!',
      desc: '온 국민이 치킨을 시키고 TV를 켰습니다. 치킨집 튀김기와 에어컨이 함께 돌아갑니다.',
      choices: [
        { label: '거리 응원을 지원한다', cost: (s) => cash(s, 150), desc: (s) => '−' + won(cash(s, 150)) + ' · 민심 +4 · 3개월 수요 +3%', apply(s) { const c = cash(s, 150); s.money -= c; hp(s, 4); addEffect(s, { name: '월드컵 열기 (수요 +3%)', demandMult: 1.03 }, 3); return '거리 응원: 민심 +4, 3개월 수요 +3%'; } },
        { label: '조용히 응원한다', desc: () => '민심 +1 · 3개월 수요 +3%', apply(s) { hp(s, 1); addEffect(s, { name: '월드컵 열기 (수요 +3%)', demandMult: 1.03 }, 3); return '민심 +1, 3개월 수요 +3%'; } },
      ],
    }),
    B({
      id: 'buzz_meme', icon: '😂', name: '"촛불 내각" 밈 대유행',
      cond: recentBlackout,
      desc: '정전 때 촛불을 켜고 회의하는 사진이 밈이 됐습니다. 합성 사진이 하루에 천 장씩 올라옵니다.',
      choices: [
        { label: '직접 패러디 영상을 올린다', desc: () => '60% 확률 · 민심 +3 · 아니면 · 민심 −2', apply(s) { if (Math.random() < 0.6) { hp(s, 3); return '셀프 패러디: "웃을 줄 아는 대통령". 민심 +3'; } hp(s, -2); return '셀프 패러디: "정전이 웃기냐"는 반응이 더 컸습니다. 민심 −2'; } },
        { label: '재발 방지 대책을 발표한다', cost: (s) => cash(s, 200), desc: (s) => '−' + won(cash(s, 200)) + ' · 민심 +2', apply(s) { const c = cash(s, 200); s.money -= c; hp(s, 2); return '설비 점검 예산 ' + won(c) + ': 밈은 남았지만 여론은 누그러졌습니다. 민심 +2'; } },
      ],
    }),
    B({
      id: 'buzz_fish', icon: '🐠', name: '원전 앞바다가 스노클링 명소로',
      cond: (s) => count(s, 'nuclear') > 0,
      desc: '따뜻한 온배수 덕에 열대어가 모여들었습니다. 여행 유튜버들이 "원전 뷰 스노클링"을 찍으러 옵니다.',
      choices: [
        { label: '"따뜻한 바다 축제"를 연다', desc: (s) => '70% 확률 · +' + won(cash(s, 300)) + ' · 민심 +1 · 아니면 · 민심 −3', apply(s) { if (Math.random() < 0.7) { const m = cash(s, 300); s.money += m; hp(s, 1); return '바다 축제: +' + won(m) + ', 민심 +1'; } hp(s, -3); return '바다 축제: 관광객이 취수구 근처까지 들어가 안전 논란이 일었습니다. 민심 −3'; } },
        { label: '안전 구역을 정해 조용히 허용한다', desc: () => '민심 +1', apply(s) { hp(s, 1); return '안전 구역 지정: 열대어도 사람도 무사합니다. 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_goat', icon: '🐐', name: '태양광 단지의 염소들',
      cond: (s) => count(s, 'solar') >= 4,
      desc: '패널 아래 풀을 뜯는 염소 영상이 조회수 천만을 넘었습니다. 염소 이름을 지어 달라는 청원이 올라왔습니다.',
      choices: [
        { label: '염소를 공식 마스코트로 삼는다', desc: () => '민심 +3', apply(s) { hp(s, 3); return '마스코트 "솔라 염소" 탄생: 민심 +3'; } },
        { label: '염소 치즈를 판다', desc: (s) => '+' + won(cash(s, 200)) + ' · 민심 +1', apply(s) { const m = cash(s, 200); s.money += m; hp(s, 1); return '"발전소 치즈" 완판: +' + won(m) + ', 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_volcano', icon: '🌋', name: '이웃 나라 화산 분화',
      cond: (s) => count(s, 'solar') >= 3,
      desc: '화산재가 하늘을 덮어 한낮에도 해가 흐립니다. 태양광 패널마다 재가 한 겹씩 앉았습니다.',
      choices: [
        { label: '패널 청소 부대를 보낸다', cost: (s) => cash(s, 300), desc: (s) => '−' + won(cash(s, 300)) + ' · 4개월 태양광 출력 −10%', apply(s) { const c = cash(s, 300); s.money -= c; addEffect(s, { name: '화산재 (태양광 출력 −10%)', kindDerate: { kind: 'solar', factor: 0.1 } }, 4); return '패널 청소: 4개월 태양광 출력 −10%'; } },
        { label: '재가 걷히길 기다린다', desc: () => '4개월 태양광 출력 −30%', apply(s) { addEffect(s, { name: '화산재 (태양광 출력 −30%)', kindDerate: { kind: 'solar', factor: 0.3 } }, 4); return '화산재: 4개월 태양광 출력 −30%'; } },
      ],
    }),
    B({
      id: 'buzz_drama', icon: '📺', name: '드라마 〈발전소 사람들〉 시청률 30%',
      desc: '발전소 직원이 주인공인 드라마가 대박이 났습니다. "나도 터빈 돌리고 싶다"는 견학 신청이 폭주합니다.',
      choices: [
        { label: '견학 프로그램을 연다', desc: (s) => '+' + won(cash(s, 150)) + ' · 민심 +2', apply(s) { const m = cash(s, 150); s.money += m; hp(s, 2); return '견학 프로그램: +' + won(m) + ', 민심 +2'; } },
        { label: '시즌 2 촬영지로 내준다', desc: () => '민심 +3', apply(s) { hp(s, 3); return '시즌 2 촬영 확정: 민심 +3'; } },
      ],
    }),
    B({
      id: 'buzz_necktie', icon: '👔', name: '"넥타이 풀기" 챌린지', seasons: ['summer'],
      desc: '방송인들이 에어컨 28도 맞추기 챌린지를 시작했습니다. 대통령님 차례라는 댓글이 달리고 있습니다.',
      choices: [
        { label: '넥타이를 풀고 동참한다', desc: () => '3개월 수요 −4% · 민심 −1', apply(s) { addEffect(s, { name: '절전 챌린지 (수요 −4%)', demandMult: 0.96 }, 3); hp(s, -1); return '절전 챌린지: 3개월 수요 −4%, 더위에 지친 국민으로 민심 −1'; } },
        { label: '"전기는 넉넉합니다"', desc: () => '민심 +1', apply(s) { hp(s, 1); return '"마음껏 트세요": 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_bill', icon: '📱', name: '유튜버의 "전기요금 폭탄" 영상', minYear: 2,
      cond: (s) => { const f = ((s.mood && s.mood.factors) || []).find((x) => x.key === 'price'); return !!f && f.value < 0; },
      desc: '고지서를 찢는 영상이 조회수 500만을 넘겼습니다. 썸네일의 대통령님 표정이 좋지 않습니다.',
      choices: [
        { label: '한 달 요금 감면 이벤트', cost: (s) => cash(s, 400), desc: (s) => '−' + won(cash(s, 400)) + ' · 민심 +3', apply(s) { const c = cash(s, 400); s.money -= c; hp(s, 3); return '요금 감면: 민심 +3'; } },
        { label: '무시한다', desc: () => '민심 −3', apply(s) { hp(s, -3); return '무시: 후속 영상 3편이 올라왔습니다. 민심 −3'; } },
      ],
    }),
    B({
      id: 'buzz_drone', icon: '🛸', name: '원전 상공의 미확인 드론',
      cond: (s) => count(s, 'nuclear') + count(s, 'smr') > 0,
      desc: '밤마다 원전 위를 맴도는 불빛이 찍혔습니다. 외계인설과 드론 동호회설이 맞서고 있습니다.',
      choices: [
        { label: '드론 방어망을 깐다', cost: (s) => cash(s, 300), desc: (s) => '−' + won(cash(s, 300)) + ' · 민심 +1', apply(s) { const c = cash(s, 300); s.money -= c; hp(s, 1); return '드론 방어망: 범인은 드론 동호회였습니다. 민심 +1'; } },
        { label: '"별일 아니다"라고 발표한다', desc: () => '민심 −2', apply(s) { hp(s, -2); return '"별일 아니다": 외계인설이 더 커졌습니다. 민심 −2'; } },
      ],
    }),
    B({
      id: 'buzz_squirrel', icon: '🐿', name: '다람쥐 한 마리가 변전소를 멈추다',
      desc: '다람쥐가 변압기에 들어가 도시 절반의 불이 깜빡였습니다. 다람쥐는 무사합니다.',
      choices: [
        { label: '변전소마다 다람쥐 막이를 단다', cost: (s) => cash(s, 100), desc: (s) => '−' + won(cash(s, 100)) + ' · 민심 +1', apply(s) { const c = cash(s, 100); s.money -= c; hp(s, 1); return '다람쥐 막이 설치: 민심 +1'; } },
        { label: '다람쥐를 공개 수배한다', desc: () => '민심 −1', apply(s) { hp(s, -1); return '"다람쥐 게이트": 수배 전단이 굿즈로 팔립니다. 민심 −1'; } },
      ],
    }),
    B({
      id: 'buzz_award', icon: '🏅', name: '우리 연구진, 국제 학술상 수상',
      cond: (s) => rdLevel(s) >= 100,
      desc: '연구소 막내가 시상식에서 "야근 덕분"이라고 소감을 말해 화제가 됐습니다.',
      choices: [
        { label: '상금으로 연구소를 넓힌다', desc: () => '연구소 규모 +10', apply(s) { s.rdLab = rdLevel(s) + 10; return '연구소 규모 +10'; } },
        { label: '수상 기념 휴가를 준다', desc: () => '다음 연구 확률 +15% · 민심 +1', apply(s) { s.techBoost = (s.techBoost || 0) + 0.15; hp(s, 1); return '기념 휴가: 다음 연구 확률 +15%, 민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_solo', icon: '💘', name: '연애 예능 〈나는 솔라〉',
      cond: (s) => count(s, 'solar') >= 2,
      desc: '태양광 단지에서 찍는 연애 예능이 화제입니다. 해가 지면 촬영도 끝난다고 합니다.',
      choices: [
        { label: '촬영에 협조한다', desc: (s) => '+' + won(cash(s, 100)) + ' · 민심 +1 · 2개월 태양광 출력 −10%', apply(s) { const m = cash(s, 100); s.money += m; hp(s, 1); addEffect(s, { name: '예능 촬영 (태양광 출력 −10%)', kindDerate: { kind: 'solar', factor: 0.1 } }, 2); return '촬영 협조: 최종 커플은 패널 3번 구역에서 나왔습니다. +' + won(m) + ', 민심 +1, 촬영 구역을 비우느라 2개월 태양광 출력 −10%'; } },
        { label: '보안을 이유로 거절한다', desc: () => '효과 없음', apply() { return '촬영 거절: 제작진은 이웃 나라 태양광 단지로 떠났습니다.'; } },
      ],
    }),
    B({
      id: 'buzz_cafe', icon: '☕', name: '송전탑 뷰 카페 성지 순례',
      desc: '송전탑이 보이는 카페가 "인더스트리얼 감성" 성지가 됐습니다. 송전탑 앞에서 찍은 사진이 하루 만 장씩 올라옵니다.',
      choices: [
        { label: '송전탑에 조명을 단다', cost: (s) => cash(s, 100), desc: (s) => '−' + won(cash(s, 100)) + ' · 민심 +3', apply(s) { const c = cash(s, 100); s.money -= c; hp(s, 3); return '송전탑 야경 명소 탄생: 민심 +3'; } },
        { label: '구경만 한다', desc: () => '민심 +1', apply(s) { hp(s, 1); return '민심 +1'; } },
      ],
    }),
    B({
      id: 'buzz_stove', icon: '🔥', name: '한겨울 "전기장판 대란"', seasons: ['winter'],
      desc: '한파에 전기장판과 난로가 동났습니다. 중고 장터에서 전기장판이 정가의 세 배에 팔립니다.',
      choices: [
        { label: '취약 계층에 난방기를 나눠 준다', cost: (s) => cash(s, 200), desc: (s) => '−' + won(cash(s, 200)) + ' · 민심 +3 · 2개월 수요 +3%', apply(s) { const c = cash(s, 200); s.money -= c; hp(s, 3); addEffect(s, { name: '난방기 보급 (수요 +3%)', demandMult: 1.03 }, 2); return '난방기 보급: 민심 +3, 2개월 수요 +3%'; } },
        { label: '"내복을 입읍시다"', desc: () => '민심 −2', apply(s) { hp(s, -2); return '내복 권장: 민심 −2'; } },
      ],
    }),
  );
})();
