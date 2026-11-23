// ------------------------------------------------------------
// 인트로 영상
//  - 파일: assets/cinematics/opening-20s.mp4 (20초 · 19MB). 시작 화면의 "인트로" 칸을 눌렀을 때에만 내려받음
//  - 화면 가득 재생하고, 끝나거나 "건너뛰기"(Esc · Enter · Space)를 누르면 시작 화면으로 돌아옴
//  - 영상에 소리가 들어 있어 재생하는 동안 BGM은 잠시 멈춤 (bgm.js의 bgmHold).
//      BGM을 꺼 둔 사람에게는 영상도 소리 없이 시작하고, 왼쪽 위 버튼으로 켤 수 있음
//  - 영상을 바꾸려면: 새 파일을 같은 폴더에 넣고 아래 SRC의 파일 이름(과 ?v= 숫자)을 바꾸면 됨
// ------------------------------------------------------------
(function () {
  const SRC = 'assets/cinematics/opening-20s.mp4?v=1';
  const box = document.getElementById('intro');
  const video = document.getElementById('intro-video');
  const openBtn = document.getElementById('intro-open');
  if (!box || !video || !openBtn) return;
  const wait = document.getElementById('intro-wait');
  const soundBtn = document.getElementById('intro-sound');
  let open = false;
  let sound = true;      // 영상 소리 (열 때마다 BGM 설정을 따라 정함)

  const say = (t) => { wait.textContent = t || ''; wait.classList.toggle('hidden', !t); };
  // 영상 음량은 BGM 음량 막대를 따름 (막대가 0이면 소리 없이 시작하되, 켜면 들리는 크기로)
  const level = () => { const v = window.bgmVolume ? window.bgmVolume() : 0.6; return v > 0 ? v : 0.4; };
  const syncSound = () => {
    video.muted = !sound;
    try { video.volume = level(); } catch (e) { /* 아이폰은 웹페이지가 음량을 못 바꿈 */ }
    soundBtn.textContent = sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
    soundBtn.setAttribute('aria-pressed', sound ? 'true' : 'false');
  };
  const fail = () => {
    if (!open) return;
    say('영상을 불러오지 못했습니다');
    setTimeout(hide, 1600);
  };
  const play = () => {
    const p = video.play();
    if (!p || !p.catch) return;
    p.catch((err) => {
      if (!open || !err) return;
      // 브라우저가 소리 있는 재생을 막으면 소리 없이 다시 시도
      if (err.name === 'NotAllowedError' && sound) { sound = false; syncSound(); const q = video.play(); if (q && q.catch) q.catch(fail); }
      else if (err.name !== 'AbortError') fail();   // AbortError: 재생이 시작되기 전에 건너뛴 것
    });
  };

  function show() {
    if (open) return;
    open = true;
    sound = !(window.bgmWanted && !window.bgmWanted()) && !(window.bgmVolume && window.bgmVolume() <= 0);
    if (window.bgmHold) window.bgmHold(true);
    box.classList.remove('hidden', 'leaving');
    say('불러오는 중…');
    if (!video.getAttribute('src')) video.src = SRC;
    try { video.currentTime = 0; } catch (e) { /* 아직 불러오기 전 */ }
    syncSound();
    play();
    openBtn.blur();
    document.addEventListener('keydown', onKey, true);
  }
  function hide() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    video.pause();
    box.classList.add('leaving');
    // 사라지는 동안 연달아 누른 손가락이 밑의 시작 화면 버튼으로 들어가지 않게 잠깐 잠금 (타이틀 화면과 같은 방식)
    document.body.classList.add('start-guard');
    setTimeout(() => { if (!open) box.classList.add('hidden'); box.classList.remove('leaving'); }, 300);
    setTimeout(() => document.body.classList.remove('start-guard'), 500);
    if (window.bgmHold) window.bgmHold(false);
  }
  // 재생 중에는 키가 뒤의 화면으로 가지 않게 하고, Esc · Enter · Space는 건너뛰기 (브라우저 조작 키는 그대로 둠)
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'F5', 'F11', 'F12'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;   // 인트로 칸을 Enter로 누른 채 있으면 바로 닫히지 않게
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.code === 'Space') hide();
  }

  openBtn.addEventListener('click', show);
  document.getElementById('intro-skip').addEventListener('click', hide);
  soundBtn.addEventListener('click', () => { sound = !sound; syncSound(); soundBtn.blur(); });
  video.addEventListener('waiting', () => { if (open) say('불러오는 중…'); });
  video.addEventListener('playing', () => say(''));
  video.addEventListener('ended', hide);
  video.addEventListener('error', fail);
  // 다른 탭·앱으로 가면 멈추고, 돌아오면 이어서 재생
  document.addEventListener('visibilitychange', () => {
    if (!open) return;
    if (document.hidden) video.pause(); else play();
  });
})();
