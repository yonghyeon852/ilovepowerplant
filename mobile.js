// ============================================================
// 모바일 화면 (휴대폰으로 접속했을 때). 웹(넓은 화면)은 그대로 두고, 좁은 화면에서만 배치와 조작을 바꿈
//  - 배치: 위 = 핵심 숫자와 진행 버튼, 가운데 = 지도, 아래 = 탭으로 고르는 칸 하나(건설 · 연구 · 전망 · 정책 · 설비 · 소식)
//          같은 탭을 한 번 더 누르면 칸이 접혀 지도가 넓어짐
//  - 짓기: 끌어다 놓는 대신, 카드를 누르면 지도에 놓을 자리가 나타나고 → 지도를 눌러 자리를 옮긴 뒤 → "여기에 짓기"로 확정
//  - 지도: 한 손가락으로 끌어 이동, 두 손가락으로 벌려 확대·축소 (오른쪽의 ＋ / － / 전체 버튼도 같음)
//  - 안내(튜토리얼) 창은 설명하는 곳을 가리지 않게 위나 아래에 붙고, 머리를 누르면 접힘
//  화면이 넓어지면(가로 821px 이상) 자동으로 웹 배치로 돌아감
// ============================================================
const MQ_MOBILE = window.matchMedia('(max-width: 820px), (max-height: 540px) and (pointer: coarse)');
function isMobile() { return MQ_MOBILE.matches; }
const M_SECTIONS = ['build', 'research', 'chart', 'policy', 'fleet', 'news'];
const M_PANES = ['chart', 'policy', 'fleet', 'news'];   // 오른쪽 칸의 탭에 해당하는 것들

// ---------- 아래 칸 고르기 ----------
const M_TITLES = { build: '건설', research: '연구', chart: '길잡이 · 이번 달 전망', policy: '정책 · 공약 · 목표', fleet: '설비', news: '소식' };
// 아래 칸의 머리줄: 지금 보는 칸의 이름과 "크게 보기 / 지도 보기" 버튼
function mobileSheetSync() {
  const t = document.getElementById('msheet-title'); if (t) t.textContent = M_TITLES[document.body.dataset.msec] || '';
  const b = document.querySelector('#msheet-bar [data-ms="size"]'); if (b) b.textContent = document.body.classList.contains('msheet-big') ? '🗺 지도 보기' : '⤢ 크게 보기';
}
// 크게 보기: 지도를 가리고 칸을 화면 가득 (글이 많은 전망 · 정책 · 연구를 읽을 때). 끄면 지도가 다시 나옴
function mobileSheetBig(on) {
  if (document.body.classList.contains('msheet-big') === !!on) return;
  document.body.classList.toggle('msheet-big', !!on);
  mobileSheetSync();
  if (!on) { try { refitMapCanvas(); } catch (e) { /* 1초 안에 다시 맞춰짐 */ } }
  mobileRedraw();
  if (typeof tutorialSpot === 'function') tutorialSpot();
}
function mobileNavSync() {
  mobileSheetSync();
  const cur = document.body.dataset.msec, closed = document.body.classList.contains('msheet-closed');
  document.querySelectorAll('#mnav button').forEach((b) => b.classList.toggle('active', b.dataset.msec === cur && !closed));
  // 진행 중인 목표 수 배지 (정책 탭)
  const src = document.getElementById('goal-badge'), dst = document.getElementById('mnav-badge');
  if (src && dst) { dst.textContent = src.textContent; dst.className = src.className; }
}
// 숨겨져 있던 그래프는 크기가 0이었으므로, 칸이 보이게 된 뒤 다시 그림
function mobileRedraw() {
  if (typeof state === 'undefined' || !state || !state.demandCurve) return;
  try { const s = document.body.dataset.msec; if (s === 'chart') renderForecast(state); else if (s === 'fleet') renderFleet(state); } catch (e) { /* 다음 갱신 때 그려짐 */ }
  try { render(); } catch (e) { /* 지도는 1초 안에 다시 맞춰짐 */ }
}
// 아래 탭이 전망 · 정책 · 설비 · 소식이면, 그 안에 실제로 보이는 내용(웹 화면의 오른쪽 탭)도 같은 것으로 맞춤
function mobilePaneSync() {
  const name = document.body.dataset.msec;
  if (!M_PANES.includes(name)) return;
  const cur = document.querySelector('#side-panes .side-pane:not(.hidden)');
  if (!cur || cur.dataset.pane !== name) _showSidePaneDesktop(name);
}
// 칸을 엶 (프로그램이 부를 때: 항상 펼침)
function mobileOpen(name) {
  if (!isMobile() || !M_SECTIONS.includes(name)) return;
  if (document.body.dataset.msec !== name) for (const id of ['left-col', 'side']) { const sc = document.getElementById(id); if (sc) sc.scrollTop = 0; }   // 다른 칸으로 바꾸면 맨 위부터
  document.body.dataset.msec = name;
  document.body.classList.remove('msheet-closed');
  mobilePaneSync();
  mobileNavSync();
  mobileRedraw();
  if (typeof tutorialSpot === 'function') tutorialSpot();
}
// 탭을 눌렀을 때: 같은 탭이면 접었다 폈다
function mobileNavTap(name) {
  const same = document.body.dataset.msec === name && !document.body.classList.contains('msheet-closed');
  if (same) { document.body.classList.add('msheet-closed'); document.body.classList.remove('msheet-big'); mobileNavSync(); mobileRedraw(); if (typeof tutorialSpot === 'function') tutorialSpot(); return; }
  if (M_PANES.includes(name)) showSidePane(name); else mobileOpen(name);
}

// 오른쪽 칸의 탭을 여는 기존 함수에 모바일 칸 전환을 얹음 (설비를 누르면 "설비", 연구 단축키면 "연구" 칸이 열리도록)
const _showSidePaneDesktop = showSidePane;
showSidePane = function (name) {
  _showSidePaneDesktop(name);
  if (!isMobile()) return;
  if (name === 'goals') name = 'policy';
  if (M_SECTIONS.includes(name) && !document.body.classList.contains('mplacing')) mobileOpen(name);
};

// ---------- 짓기: 카드를 눌러 고르고, 지도에서 자리를 잡고, 확정 ----------
function mobilePlaceUpdate() {
  const bar = document.getElementById('mplace');
  if (!bar || !drag || !drag.tap) return;
  const p = PLANTS[drag.type], info = canBuild(drag.type, drag.col, drag.row);
  const ok = info.ok && state.money >= info.cost;
  const lab = placeLabel(drag, info), el = bar.querySelector('.mp-info');
  bar.querySelector('.mp-name').textContent = p.name;
  el.textContent = info.ok ? lab.label.replace('개월', '개월 공사') : lab.label;
  el.classList.toggle('bad', !ok);
  el.classList.toggle('warn', ok && lab.color !== '#fff');
  bar.querySelector('#mplace-ok').disabled = !ok;
}
function mobileStartPlacing(type) {
  if (typeof state === 'undefined' || !state || state.finished) return;
  if (state.cityDraft) { showMessage('도시 조성을 확정하거나 취소한 뒤 지으세요'); return; }
  const card = document.querySelector('.plant-card[data-plant="' + type + '"]');
  if (card && card.classList.contains('locked')) { showMessage('🔒 테크트리에서 먼저 개발해야 합니다'); return; }
  if (typeof hidePlantDetail === 'function') { plantDetailPinned = null; hidePlantDetail(true); }
  document.body.classList.remove('msheet-big');
  document.body.classList.add('mplacing');   // 아래 칸을 접어 지도를 넓힘 (지도 크기가 바뀌므로 먼저)
  refitMapCanvas();
  // 지도 전체를 보고 있으면 칸이 너무 작으므로, 가장 큰 도시 둘레를 확대해서 시작
  if (isFullMapView()) {
    const main = state.cities.slice().sort((a, b) => b.pop - a.pop)[0];
    state.zoom = clamp(zoomMin() * 2.6, zoomMin(), ZOOM_MAX);
    if (main) centerView(main.center.col, main.center.row); else setView(state.view.col, state.view.row);
  }
  const p = PLANTS[type];
  const c0 = clamp(Math.round(state.view.col + visCols() / 2 - p.width / 2), 0, COLS - p.width), r0 = clamp(Math.round(state.view.row + visRows() / 2 - p.height / 2), 0, ROWS - p.height);
  const spot = mobileNearestSpot(type, c0, r0);
  drag = { type, col: spot.col, row: spot.row, tap: true };
  // 그 자리가 화면 밖이면 그쪽으로 지도를 옮김
  if (spot.col < state.view.col + 1 || spot.row < state.view.row + 1 || spot.col + p.width > state.view.col + visCols() - 1 || spot.row + p.height > state.view.row + visRows() - 1) centerView(spot.col + p.width / 2, spot.row + p.height / 2);
  render();
  mobilePlaceUpdate();
}
// (c0, r0)에서 가까운 순서로 둘러보며 지을 수 있는 첫 자리를 찾음. 없으면 그 자리 그대로
function mobileNearestSpot(type, c0, r0) {
  const p = PLANTS[type], maxR = Math.max(COLS, ROWS);
  for (let rad = 0; rad <= maxR; rad++) {
    let best = null, bestD = Infinity;
    for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
      const c = c0 + dc, r = r0 + dr;
      if (c < 0 || r < 0 || c > COLS - p.width || r > ROWS - p.height) continue;
      const d = dc * dc + dr * dr;
      if (d < bestD && canBuild(type, c, r).ok) { best = { col: c, row: r }; bestD = d; }
    }
    if (best) return best;
  }
  return { col: c0, row: r0 };
}
function mobilePlaceCancel(quiet) {
  if (drag && drag.tap) drag = null;
  document.body.classList.remove('mplacing');
  if (!quiet && typeof state !== 'undefined' && state) { try { render(); } catch (e) { /* 무시 */ } }
}
function mobilePlaceConfirm() {
  if (!drag || !drag.tap) return;
  const d = drag, info = canBuild(d.type, d.col, d.row);
  if (!info.ok) { showMessage('✕ ' + info.reason); return; }
  if (state.money < info.cost) { showMessage('✕ 자금이 부족합니다 (' + fmt(info.cost) + '억 필요)'); return; }
  drag = null;
  document.body.classList.remove('mplacing');
  tryBuild(d.type, d.col, d.row);   // 지은 설비가 선택되고 착공 알림이 뜸
  // 이어서 다른 설비도 고를 수 있게 건설 칸으로 돌아감 (안내 중에는 안내가 설비 칸을 엶)
  if (!(state.tutorial && !state.tutorial.done)) mobileOpen('build');
}

// ---------- 지도: 두 손가락으로 확대·축소와 이동 ----------
const mTouch = new Map();
let mPinch = null;
function mPinchMeasure() {
  const pts = Array.from(mTouch.values());
  return { d: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || e.target !== canvas || typeof state === 'undefined' || !state) return;
  mTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mTouch.size === 2) {
    // 한 손가락으로 하던 일(이동 · 선택 · 도시 칠하기)은 그만두고 두 손가락 조작으로 넘어감
    pressPos = null; panStart = null; draftPaint = null;
    const m = mPinchMeasure();
    mPinch = { d0: m.d, z0: zoomOf(), x: m.x, y: m.y };
    e.stopPropagation();
  } else if (mTouch.size > 2) e.stopPropagation();
}, true);
document.addEventListener('pointermove', (e) => {
  if (!mTouch.has(e.pointerId)) return;
  mTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!mPinch) return;
  e.stopPropagation();
  if (mTouch.size < 2) return;   // 한 손가락만 남았으면 뗄 때까지 아무것도 하지 않음
  const m = mPinchMeasure();
  // 두 손가락의 가운데가 가리키던 칸이 그대로 가운데에 오도록 확대하고, 가운데가 움직인 만큼 지도를 옮김
  const rect = canvas.getBoundingClientRect();
  zoomAt(mPinch.z0 * (m.d / mPinch.d0), mPinch.x, mPinch.y);
  const ts = TILE * zoomOf(), scale = canvas.width / rect.width;
  setView(state.view.col - (m.x - mPinch.x) * scale / ts, state.view.row - (m.y - mPinch.y) * scale / ts);
  mPinch.x = m.x; mPinch.y = m.y; mPinch.d0 = m.d; mPinch.z0 = zoomOf();
  render();
}, true);
function mTouchEnd(e) {
  if (!mTouch.has(e.pointerId)) return;
  mTouch.delete(e.pointerId);
  if (mPinch) { e.stopPropagation(); if (mTouch.size === 0) mPinch = null; }   // 두 손가락 조작의 끝은 "누름"으로 치지 않음
}
document.addEventListener('pointerup', mTouchEnd, true);
document.addEventListener('pointercancel', mTouchEnd, true);

// 스크롤되는 칸(아래 칸 · 창 · 안내 글) 밖에서 손가락을 밀 때 화면 전체가 딸려 움직이는 것(튕김)과 두 손가락 페이지 확대를 막음
document.addEventListener('touchmove', (e) => {
  if (!isMobile()) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  for (let el = e.target; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
    const st = getComputedStyle(el);
    if ((/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 1)) return;   // 이 칸은 스크롤됨: 그대로 둠
  }
  e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => { if (isMobile()) e.preventDefault(); });

// ---------- 안내(튜토리얼): 모바일 문구 · 대상이 있는 칸 열기 · 창 자리 ----------
const M_TUT_TEXT = {
  map: '<b>회색 칸</b>이 도시(전기를 사는 곳), <b>초록</b>은 땅, <b>파랑</b>은 강과 바다, <b>진한 초록 ▲</b>은 산이에요. 산에는 태양광·풍력만 지을 수 있습니다. 시작 설비로 도시 옆의 <b>복합발전 1기</b>와 <b>태양광 1개 · 풍력 1개</b>가 이미 돌아가고 있어요.<br><br>' +
    '처음에는 <b>지도 전체</b>가 보입니다. <b>두 손가락을 벌리면 확대</b>, 오므리면 축소, <b>한 손가락으로 끌면 이동</b>이에요. 지도 오른쪽의 <b>＋ / － / ⤢</b> 버튼으로도 됩니다. <b>도시를 누르면</b> 인구와 수요가 잠깐 뜨고, <b>설비를 누르면</b> 아래 설비 탭에 정보가 나와요. 설비 위 <b>빗금</b>은 건설 중, <b>노란 점</b>은 노후, <b>붉은 글씨</b>는 수명이 끝나 멈춘 설비예요.',
  build: '아래 탭 줄의 <b>건설</b>에 설비 카드가 있습니다. <b>복합발전</b> 카드를 <b>눌러 보세요</b>. 지도가 넓어지면서 놓을 자리가 초록 테두리로 나타납니다.<br><br>' +
    '<b>지도를 짧게 누르면</b> 그곳으로 자리가 옮겨 가고, <b>누른 채 끌면</b> 지도가 움직입니다(두 손가락을 벌리면 확대). 화면 맨 아래 줄에 비용과 공사 기간이 뜹니다. 마음에 들면 그 옆의 <b>여기에 짓기</b>를 누르세요.<br><br>' +
    '기억하실 것: 설비는 <b>도시 안에는 지을 수 없어요</b>(도시 바로 옆은 됩니다). <b>도시에서 멀수록 송전 손실</b>이 커지고, 원전·풍력·석탄은 <b>도시 가까이 두면 주민 반발</b>이 있고, 모든 설비는 <b>공사 기간</b>이 있어요. 수요는 해마다 늘어나니 늘 <b>부족해지기 전에</b> 다음 설비를 지어야 합니다.',
  select: '방금 지은 설비가 선택되어, 아래 <b>설비</b> 탭에 용량, 송전 손실, 남은 공사 기간, 수명이 나와 있습니다. 지도에서 다른 설비를 <b>누르면</b> 그 설비의 정보로 바뀌어요.<br><br>' +
    '여기서 <b>철거</b>를 할 수 있습니다. 테크트리 연구 효과는 <b>이미 지은 설비에도 바로</b> 붙습니다. 수명이 끝난 설비는 자리만 차지하고 유지비가 나가니 꼭 철거하세요.',
  bottom: '맨 아래 <b>탭 줄</b>에서 볼 칸을 고릅니다. 칸 위의 <b>크게 보기</b>를 누르면 지도 대신 칸이 화면 가득 펼쳐지고(<b>지도 보기</b>로 돌아옴), <b>접기</b>를 누르면 칸이 접혀 지도가 넓어져요.<br>' +
    '· <b>건설</b>: 설비 카드와 도시.<br>' +
    '· <b>연구</b>: 연구소를 키우고 테크를 연구하는 곳. 달마다 들르세요.<br>' +
    '· <b>전망</b>: 길잡이(내 노선 · 공약 · 지금 신경 쓸 것)와 이번 달 공급·탄소·계통, 하루 그래프.<br>' +
    '· <b>정책</b>: 정한 정책과 공약, 지금 받은 <b>목표</b>, 전기요금 손잡이.<br>' +
    '· <b>설비</b>: 지도에서 누른 설비의 정보(철거)와 전체 설비 현황.<br>' +
    '· <b>소식</b>: 사건, 목표 결과 같은 기록.<br><br>' +
    '매달 진행하기 전에 <b>전망</b> 탭 맨 위의 길잡이만 훑어도 충분합니다.',
  'research-pane': '아래 탭 줄의 <b>연구</b>가 연구 칸입니다. 맨 위에 <b>연구소 규모 · 동시에 하는 연구 수 · 연구가 민심에 주는 영향</b>이 나오고, 그 아래에 연구소를 키우는 버튼과 테크 여섯 가지가 있습니다. 달마다 돈을 쓰는 곳이니 자주 들르세요.',
};
const M_TUT_WAIT = { build: '건설 탭에서 복합발전 카드를 누르고, 지도에서 자리를 잡은 뒤 "여기에 짓기"를 누르면 넘어갑니다.' };
const M_TUT_TITLE = { bottom: '아래 탭 줄: 볼 칸 고르기', 'research-pane': '연구 탭: 달마다 들르는 곳' };
// 문구 속의 PC 화면 기준 표현 → 휴대폰 기준 (앞의 글이 있으면 뒤의 글로 바꿈)
const M_TUT_SWAP = [
  ['(단축키 Space)', ''], ['을 누르거나 <b>Space</b>를 눌러 보세요', '을 눌러 보세요'], ['(단축키 F)', ''], ['</b>(Space)을', '</b>을'], ['버튼이나 Space로 닫으세요', '버튼으로 닫으세요'],
  ['이 창은 위쪽을 잡고 끌어서 옮길 수 있어요.', '직접 해 보는 단계에서는 <b>직접 해 보기</b>를 누르면 이 창이 작게 접혀요. 제 이름이 있는 줄을 누르면 언제든 접었다 펼 수 있습니다.'],
  [', <b>연구소</b> 규모입니다. 가장 중요한 자금과 민심은 크게 적혀 있어요.', '입니다. 가장 중요한 자금과 민심은 크게 적혀 있어요. 숫자를 <b>누르면 설명</b>이 뜹니다.'], [', <b>연구소</b> 규모입니다.', '입니다.'], ['오른쪽의 <b>이번 달 진행 ▶</b>', '그 아랫줄의 <b>이번 달 진행 ▶</b>'],
  ['오른쪽 위 <b>길잡이</b>', '<b>전망</b> 탭의 <b>길잡이</b>'], ['오른쪽 <b>정책</b> 탭', '아래 <b>정책</b> 탭'],
  ['왼쪽 아래, 설비 목록 밑의 <b>연구</b> 칸', '아래 <b>연구</b> 탭'], ['왼쪽 아래 연구 칸', '아래 연구 탭'],
  ['왼쪽의 <b>도시</b> 서브탭', '<b>건설</b> 탭 위쪽의 <b>도시</b>'], ['오른쪽 "선택한 설비"', '아래 "설비" 탭'], ['(작게 보이면 휠로 확대)', ''],
  [' 이름에 마우스를 올리면 전체 단계가 보입니다.', ' 이름을 누르면 전체 단계가 보입니다.'], ['카드에 마우스를 올리면 상세가 뜹니다.', '카드 오른쪽의 <b>ⓘ</b>를 누르면 상세가 뜹니다.'],
];
let mTutPatched = false;
function mobileTutorialTexts() {
  if (mTutPatched || !isMobile() || typeof TUTORIAL_STEPS === 'undefined') return;
  mTutPatched = true;
  for (const s of TUTORIAL_STEPS) {
    if (M_TUT_TEXT[s.id]) s.text = M_TUT_TEXT[s.id];
    if (M_TUT_WAIT[s.id]) s.wait = M_TUT_WAIT[s.id];
    if (M_TUT_TITLE[s.id]) s.title = M_TUT_TITLE[s.id];
    for (const k of ['text', 'infoText', 'wait']) {
      if (typeof s[k] !== 'string') continue;
      for (const [a, b] of M_TUT_SWAP) s[k] = s[k].split(a).join(b);
    }
  }
  // 안내용 목표의 설명도 같이
  if (typeof QUESTS !== 'undefined') for (const q of QUESTS) if (typeof q.desc === 'string') q.desc = q.desc.replace('왼쪽 아래 연구 칸', '아래 연구 탭');
}
// 설명 대상이 들어 있는 칸
function mobileSectionOf(el) {
  if (!el || !el.closest) return null;
  if (el.closest('#palette')) return 'build';
  if (el.closest('#techrd-panel')) return 'research';
  if (el.closest('#now-panel')) return 'chart';
  const pane = el.closest('.side-pane');
  return pane ? pane.dataset.pane : null;
}
// 대상이 아래 칸 안에서 화면 밖에 있으면 보이는 자리까지 칸을 밀어 줌
function mobileScrollTo(el) {
  const sc = el && el.closest ? el.closest('#left-col, #side') : null;
  if (!sc) return;
  const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
  if (r.height === 0 || s.height === 0) return;
  if (r.top < s.top || r.bottom > s.bottom) sc.scrollTop += r.top - s.top - 6;
}
// 위쪽 막대의 높이 (안내 창을 그 바로 아래에 붙이려고)
function mobileMeasure() {
  const tb = document.getElementById('topbar');
  if (tb) document.body.style.setProperty('--mtop', Math.round(tb.getBoundingClientRect().bottom + 3) + 'px');
}
let mTutKey = null;
let mTutAutoMin = false, mTutWasMin = false;   // 결산 창 때문에 안내 창을 저절로 접어 둔 상태
if (typeof tutorialHighlight === 'function') {
  const _tutorialHighlight = tutorialHighlight;
  tutorialHighlight = function (sel) {
    if (isMobile() && sel) {
      if (sel === '#side-tabs') sel = '#mnav';
      // 단계가 바뀐 그때 한 번만 대상이 있는 칸을 엶 (그 뒤로는 사용자가 다른 칸을 봐도 끌어오지 않음)
      if (tutLastKey !== mTutKey) {
        mTutKey = tutLastKey;
        document.body.classList.remove('msheet-big'); mobileSheetSync();
        const el = typeof sel === 'function' ? sel() : document.querySelector(sel);
        const sec = mobileSectionOf(el);
        if (sec && !document.body.classList.contains('mplacing')) { if (M_PANES.includes(sec)) _showSidePaneDesktop(sec); mobileOpen(sec); }
        mobileScrollTo(el);
        if (tutBox) tutBox.classList.remove('m-min');
      }
    }
    return _tutorialHighlight(sel);
  };
}
// 안내 창의 자리와 최대 높이 (세로 화면). 화면이 낮은 휴대폰(주소창이 있는 사파리 등)에서도 설명 대상과 겹치지 않게 그때그때 계산함
//  - 대상이 아래 칸(또는 탭 줄)에 있으면 창은 위쪽: 지도 위. 자리가 모자라면 읽는 동안만 위쪽 막대까지 덮음
//  - 대상이 위쪽 막대나 지도면 창은 아래쪽: 아래 칸 위. 자리가 모자라면 탭 줄까지 덮음
//  - 결산 · 사건 창 위에 뜰 때와 가로 화면, 설비 자리 잡는 중은 style.css가 맡음
function mobileTutPlace() {
  if (!tutBox) return;
  const el = tutHighlighted, H = window.innerHeight;
  const shown = !!(el && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0);
  const inSheet = !!(el && el.closest && el.closest('#left-col, #side, #mnav'));
  tutBox.classList.toggle('m-top', inSheet);
  const set = (top, bottom, max) => { tutBox.style.setProperty('--mt-top', top); tutBox.style.setProperty('--mt-bottom', bottom); tutBox.style.setProperty('--mt-max', max); };
  if (tutBox.classList.contains('over-modal')) { set('auto', '6px', 'calc(54dvh - 18px)'); return; }
  const tb = Math.round(document.getElementById('topbar').getBoundingClientRect().bottom);
  const navR = document.getElementById('mnav').getBoundingClientRect(), navTop = navR.height > 0 ? navR.top : H;
  const min = tutBox.classList.contains('m-min');
  if (inSheet) {
    const sh = ['left-col', 'side'].map((id) => document.getElementById(id).getBoundingClientRect()).find((r) => r.height > 0);
    const barR = document.getElementById('msheet-bar').getBoundingClientRect();
    const sheetTop = barR.height > 0 ? barR.top : sh ? sh.top : navTop;   // 아래 칸의 머리줄(크게 보기 · 접기)은 가리지 않음
    let t = tb + 3;
    if (!min && sheetTop - t - 4 < 330) t = 4;   // 낮은 화면: 읽는 동안은 위쪽 막대까지 덮고, 접으면("직접 해 보기") 막대 아래로 내려옴
    set(t + 'px', 'auto', Math.max(180, Math.round(sheetTop - t - 4)) + 'px');
  } else {
    let limit = tb + 3;   // 창의 위쪽 끝이 넘지 않을 선
    if (shown) {
      const r = el.getBoundingClientRect(), board = document.getElementById('board');
      if (el === board) limit = r.top + r.height * 0.55;            // 지도 설명: 지도의 위쪽 절반은 보이게
      else if (board.contains(el)) limit = Math.max(limit, r.bottom + 6);   // 지도 위의 표시(탄소세 등)
    }
    let b = Math.round(H - navTop + 5);   // 탭 줄 바로 위
    if (!min && H - b - limit - 4 < 300) b = 6;   // 낮은 화면: 탭 줄까지 덮음
    set('auto', b + 'px', Math.max(180, Math.round(H - b - limit - 4)) + 'px');
  }
}
function mobileTutBind() {
  if (!tutBox || tutBox.dataset.mbound) return;
  tutBox.dataset.mbound = '1';
  // 머리를 누르면 접었다 폈다 (뒤에 가린 것을 보려고)
  tutBox.querySelector('.tut-head').addEventListener('click', (e) => { if (isMobile() && !e.target.closest('button')) { tutBox.classList.toggle('m-min'); mobileTutPlace(); tutorialSpot(); } });
  // 휴대폰에서는 창을 끌어 옮기지 않음
  tutBox.addEventListener('pointerdown', (e) => { if (isMobile() && e.target.closest('.tut-head') && !e.target.closest('button')) e.stopPropagation(); }, true);
  // 직접 해 보는 단계: 설명을 읽고 이 버튼을 누르면 창이 한 줄 안내로 접혀 화면을 비켜 줌
  const tryBtn = document.createElement('button');
  tryBtn.className = 'tut-try primary hidden';
  tryBtn.textContent = '직접 해 보기 ▸';
  tutBox.querySelector('.tut-actions').appendChild(tryBtn);
  tryBtn.addEventListener('click', () => { tutBox.classList.add('m-min'); mobileTutPlace(); tutorialSpot(); });
}
if (typeof tutorialDodge === 'function') {
  const _tutorialDodge = tutorialDodge;
  tutorialDodge = function () {
    if (!isMobile()) {
      if (tutBox) { tutBox.classList.remove('m-top', 'm-min'); for (const p of ['--mt-top', '--mt-bottom', '--mt-max']) tutBox.style.removeProperty(p); }
      return _tutorialDodge();
    }
    if (!tutBox) return;
    mobileMeasure();
    mobileTutBind();
    const el = tutHighlighted;
    // 결산 창이 떴는데 지금 설명이 결산에 관한 것이 아니면(예: 달을 여러 번 넘기는 단계) 안내 창을 잠깐 접어 결산을 다 보이게 함
    const rep = document.getElementById('report');
    const repOpen = rep && !rep.classList.contains('hidden'), aboutRep = el && rep && (el === rep || rep.contains(el));
    //  (결산을 닫으면 원래대로: 이미 접어 두었던 창은 접힌 채로 둠 — 달을 여러 번 넘길 때 매번 다시 접지 않아도 되게)
    if (repOpen && !aboutRep) { if (!mTutAutoMin) { mTutAutoMin = true; mTutWasMin = tutBox.classList.contains('m-min'); tutBox.classList.add('m-min'); } }
    else if (mTutAutoMin) { mTutAutoMin = false; if (!mTutWasMin) tutBox.classList.remove('m-min'); }
    // "직접 해 보기"는 직접 해 보는 단계(다음 버튼이 없는 단계)에서만
    tutBox.querySelector('.tut-try').classList.toggle('hidden', !tutBox.querySelector('.tut-next').classList.contains('hidden'));
    mobileTutPlace();
  };
}

// ---------- 설명 말풍선 ----------
let mTipTimer = null, mTipClosedAt = -1e9;
function mobileTipHide() { const tip = document.getElementById('mtip'); if (tip) tip.classList.add('hidden'); clearTimeout(mTipTimer); }

// ---------- 켜고 끄기 ----------
function mobileApply() {
  const on = isMobile();
  document.body.classList.toggle('mobile', on);
  document.documentElement.classList.toggle('mobile-root', on);
  if (on) {
    if (!M_SECTIONS.includes(document.body.dataset.msec)) document.body.dataset.msec = 'chart';
    mobilePaneSync();
    mobileTutorialTexts();
    const press = document.querySelector('.title-press'); if (press) press.textContent = '화면을 눌러 시작';
    const dock = document.getElementById('techrd-panel'); if (dock) dock.classList.remove('closed');
  } else { mobilePlaceCancel(true); document.body.classList.remove('msheet-big'); mobileTipHide(); }
  mobileNavSync();
  if (on) mobileMeasure();
  if (typeof state !== 'undefined' && state && state.demandCurve) { try { renderAll(); } catch (e) { /* 다음 갱신 때 그려짐 */ } }
}
window.addEventListener('resize', () => { if (isMobile()) mobileMeasure(); });

(function () {
  // 아래 탭 줄
  const nav = document.getElementById('mnav');
  if (nav) nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-msec]'); if (b) mobileNavTap(b.dataset.msec); });
  // 카드: 모바일에서는 끌기를 막고(목록을 위아래로 밀 수 있게) 누르면 고르기
  const pal = document.getElementById('palette');
  if (pal) {
    pal.addEventListener('pointerdown', (e) => { if (isMobile() && e.target.closest('.plant-card') && !e.target.closest('.pc-info')) e.stopPropagation(); }, true);
    // 손가락에는 "올려 두기"가 없으므로 카드에 닿을 때 뜨는 상세 창은 막고, ⓘ를 눌렀을 때만 띄움
    pal.addEventListener('mouseover', (e) => { if (isMobile()) e.stopPropagation(); }, true);
    pal.addEventListener('click', (e) => {
      if (!isMobile()) return;
      const card = e.target.closest('.plant-card');
      if (card && !e.target.closest('.pc-info')) mobileStartPlacing(card.dataset.plant);
    });
  }
  // 아래 칸의 머리줄: 크게 보기 ↔ 지도 보기 · 접기
  const bar = document.getElementById('msheet-bar');
  if (bar) bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ms]'); if (!b) return;
    if (b.dataset.ms === 'size') mobileSheetBig(!document.body.classList.contains('msheet-big'));
    else mobileNavTap(document.body.dataset.msec);   // 접기 = 같은 탭을 한 번 더 누른 것과 같음
  });
  // 새 도시 자리를 잡을 때는 지도가 보여야 함
  for (const id of ['city-start', 'city-auto']) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { if (isMobile()) mobileSheetBig(false); }, true); }
  // 설명 말풍선: 마우스를 올려야 나오던 설명(title)을 눌러서 봄. 버튼처럼 누르면 일을 하는 것은 빼고, 아무 곳이나 다시 누르면 닫힘
  document.addEventListener('click', (e) => {
    if (!isMobile()) return;
    const tip = document.getElementById('mtip'); if (!tip) return;
    const wasOpen = !tip.classList.contains('hidden') || performance.now() - mTipClosedAt < 500;   // 방금 이 누름으로 닫았으면 다시 열지 않음
    mobileTipHide();
    if (wasOpen || !e.target.closest) return;
    if (e.target.closest('button, a, summary, input, select, textarea, label, .plant-card, #mnav, #mplace, canvas, #tutorial-guide')) return;
    const el = e.target.closest('[title]');
    const text = el && (el.getAttribute('title') || '').trim();
    if (!text || text.length < 8) return;
    tip.textContent = text;
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect(), h = tip.offsetHeight, H = window.innerHeight;
    const below = r.bottom + 8, above = r.top - 8 - h;
    tip.style.top = Math.round(below + h <= H - 8 ? below : above >= 8 ? above : Math.max(8, H - h - 8)) + 'px';
    clearTimeout(mTipTimer); mTipTimer = setTimeout(mobileTipHide, 9000);
  });
  // 말풍선이 떠 있을 때는 어디를 누르든(지도 포함) 누르는 순간 닫음
  document.addEventListener('pointerdown', () => { const tip = document.getElementById('mtip'); if (tip && !tip.classList.contains('hidden')) { mobileTipHide(); mTipClosedAt = performance.now(); } }, true);
  // 놓을 자리 확정 · 취소
  const ok = document.getElementById('mplace-ok'), no = document.getElementById('mplace-cancel');
  if (ok) ok.addEventListener('click', mobilePlaceConfirm);
  if (no) no.addEventListener('click', () => { mobilePlaceCancel(); mobileOpen('build'); });
  // 확대 · 축소 · 전체 보기 버튼
  const zoom = document.getElementById('mzoom');
  if (zoom) zoom.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-z]'); if (!b || typeof state === 'undefined' || !state) return;
    const r = canvas.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (b.dataset.z === 'in') zoomAt(zoomOf() * 1.5, cx, cy);
    else if (b.dataset.z === 'out') zoomAt(zoomOf() / 1.5, cx, cy);
    else { fullMapView(); render(); }
  });
  // 정책 탭의 목표 수 배지가 바뀌면 아래 탭 줄에도 반영
  const badge = document.getElementById('goal-badge');
  if (badge && typeof MutationObserver !== 'undefined') new MutationObserver(mobileNavSync).observe(badge, { childList: true, attributes: true, characterData: true, subtree: true });
  if (MQ_MOBILE.addEventListener) MQ_MOBILE.addEventListener('change', mobileApply); else if (MQ_MOBILE.addListener) MQ_MOBILE.addListener(mobileApply);
  mobileApply();
})();
