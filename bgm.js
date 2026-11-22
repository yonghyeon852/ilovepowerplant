// ------------------------------------------------------------
// 배경 음악 (BGM)
//  - 파일: assets/audio/bgm.aac (원본 wav 32MB를 3.6MB로 줄인 것. 음량도 절반으로 낮춰 둠: 아이폰은 웹에서 음량을 못 줄여서)
//  - 브라우저는 사용자가 화면을 누르거나 키를 누르기 전에는 소리를 못 냄(자동 재생 차단).
//      접속하자마자 재생을 시도해 보고(허용해 주는 브라우저에서는 타이틀 화면부터 나옴), 막히면 첫 입력 때 시작함.
//      타이틀 화면의 BGM 버튼을 누르면 그 화면에 머문 채로 음악만 켤 수 있음
//  - 켜짐/꺼짐은 브라우저에 기억 (기본은 켜짐). data-bgm 속성이 붙은 버튼은 모두 켜기/끄기 버튼
//      data-bgm="long"  → "🔊 BGM 켜짐" / "🔇 BGM 꺼짐" (타이틀 화면 · 시작 화면)
//      data-bgm="short" → "🔊 BGM" / "🔇 BGM" (게임 화면 위쪽 막대. 휴대폰에서는 그림만)
//    버튼은 "지금 소리가 나는지"를 보여 줌: 켜 두었어도 아직 브라우저에 막혀 있으면 꺼짐으로 보이고, 누르면 켜짐
// ------------------------------------------------------------
(function () {
  const KEY = 'ilpp-bgm';
  const SRC = 'assets/audio/bgm.aac?v=1';
  const VOLUME = 0.6;

  let on = true;         // 사용자가 고른 설정 (켜짐/꺼짐)
  let blocked = true;    // 아직 소리를 못 내는 상태 (첫 입력 전). 재생이 한 번 시작되면 false
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 저장소를 못 쓰면 기본값(켜짐) */ }

  let audio = null;
  function player() {
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = VOLUME;
      audio.src = SRC;
    }
    return audio;
  }
  // byUser: 사용자의 입력(클릭·키) 안에서 부른 것 → 재생이 허용되므로 버튼을 바로 "켜짐"으로 바꿈
  function tryPlay(byUser) {
    if (!on || document.hidden) return;
    if (byUser && blocked) { blocked = false; sync(); }
    const p = player().play();
    if (p && p.then) {
      p.then(() => { if (blocked) { blocked = false; sync(); } },
             (err) => { if (err && err.name === 'NotAllowedError' && !blocked) { blocked = true; sync(); } });   // 브라우저가 막음: 다음 입력 때 다시 시도
    }
  }
  function sync() {
    const live = on && !blocked;
    document.querySelectorAll('[data-bgm]').forEach((b) => {
      b.classList.toggle('off', !live);
      b.setAttribute('aria-pressed', live ? 'true' : 'false');
      b.title = live ? '배경 음악 끄기' : '배경 음악 켜기';
      b.innerHTML = b.dataset.bgm === 'long' ? (live ? '🔊 BGM 켜짐' : '🔇 BGM 꺼짐') : (live ? '🔊' : '🔇') + '<span> BGM</span>';
    });
  }
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 기억만 못 함 */ }
    if (on) tryPlay(true); else if (audio) audio.pause();
    sync();
  }
  window.bgmSet = set;
  window.bgmIsOn = () => on && !blocked;

  const onBgmButton = (e) => (e.target && e.target.closest ? e.target.closest('[data-bgm]') : null);

  // 첫 입력(그리고 멈춰 있을 때의 모든 입력)에서 재생을 시도. BGM 버튼을 누른 입력은 아래 버튼 처리에 맡김
  //  (Shift 같은 보조 키나 손가락을 막 댄 순간은 브라우저가 "입력"으로 쳐 주지 않을 수 있어, 그때는 버튼 표시를 미리 바꾸지 않음)
  const QUIET_KEYS = ['Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'];
  const kick = (e) => {
    if (onBgmButton(e)) return;
    if (!on || !(blocked || !audio || audio.paused)) return;
    const sure = !(e.type === 'keydown' && QUIET_KEYS.includes(e.key)) && !(e.type === 'pointerdown' && e.pointerType !== 'mouse');
    tryPlay(sure);
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) document.addEventListener(ev, kick, true);

  // 켜기/끄기 버튼
  document.addEventListener('click', (e) => {
    const b = onBgmButton(e);
    if (!b) return;
    if (on && blocked) tryPlay(true);   // 켜 두었지만 아직 소리가 안 나던 상태 → 설정은 그대로 두고 재생만 시작
    else set(!on);
    b.blur();   // 버튼에 초점이 남으면 Space(이번 달 진행)를 누를 때 음악이 같이 꺼짐
  });

  // 다른 탭·앱으로 가면 멈추고, 돌아오면 다시 재생
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.pause(); else tryPlay(false);
  });

  sync();
  tryPlay(false);   // 접속하자마자 한 번 시도 (대부분의 브라우저에서는 막히고, 그러면 첫 입력을 기다림)
})();
