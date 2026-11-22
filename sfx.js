// ------------------------------------------------------------
// 효과음 (SFX): 소리 파일 없이 브라우저가 그 자리에서 만들어 내는 짧은 소리 (Web Audio)
//  sfx('click')   버튼을 누를 때의 아주 작은 "틱" (자동: 모든 버튼 · 설비 카드)
//  sfx('place')   건물(설비 · 새 도시)을 놓을 때의 "툭"
//  sfx('rdok')    연구 성공: 올라가는 네 음
//  sfx('rdfail')  연구 실패: 내려가는 두 음
//  - 달이 넘어갈 때 나는 소리는 연구 성공 · 실패뿐 (완공 · 사건 같은 다른 소식에는 소리를 붙이지 않음)
//  - 같은 순간에 다른 효과음이 나면 버튼 "틱"은 내지 않음 (툭 · 연구 소리와 겹치지 않게)
//  - 켜짐/꺼짐: 메뉴의 "효과음" 항목 (data-sfx 속성이 붙은 버튼). 브라우저에 기억, 기본은 켜짐
// ------------------------------------------------------------
(function () {
  const KEY = 'ilpp-sfx';
  const MASTER = 0.6;        // 효과음 전체 음량
  const MIN_GAP_MS = 45;     // 같은 소리가 이보다 촘촘히 겹치면 건너뜀

  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 저장소를 못 쓰면 기본값(켜짐) */ }

  let ctx = null, master = null, noiseBuf = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  // 한 음: f0에서 f1로 미끄러지며(없으면 고정) dur초 동안 작아짐
  function tone(o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    const s = o.t, e = o.t + o.dur;
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, s);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, e);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(o.gain, s + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, e);
    osc.connect(g); g.connect(master);
    osc.start(s); osc.stop(e + 0.02);
  }
  // 짧은 잡음 (부딪히는 느낌): 낮은 쪽만 남겨 "툭"의 앞머리로 씀
  function noise(o) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = 'lowpass'; f.frequency.value = o.freq;
    g.gain.setValueAtTime(o.gain, o.t);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(o.t); src.stop(o.t + o.dur + 0.02);
  }

  const SOUNDS = {
    // 버튼: 아주 짧고 작은 틱
    click(t) { tone({ type: 'triangle', f0: 1150, f1: 820, t, dur: 0.035, gain: 0.09 }); },
    // 건물 놓기: 낮은 음이 뚝 떨어지는 "툭" + 살짝 부딪히는 잡음
    place(t) {
      tone({ type: 'sine', f0: 165, f1: 52, t, dur: 0.14, gain: 0.7 });
      noise({ t, dur: 0.045, gain: 0.22, freq: 700 });
    },
    // 연구 성공: 도-미-솔-도 (오락실 느낌)
    rdok(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ type: 'square', f0: f, t: t + i * 0.075, dur: i === 3 ? 0.26 : 0.09, gain: 0.11 }));
      tone({ type: 'triangle', f0: 1046.5, t: t + 0.225, dur: 0.3, gain: 0.14 });
    },
    // 연구 실패: 낮게 내려가는 두 음
    rdfail(t) {
      tone({ type: 'square', f0: 311.13, t, dur: 0.15, gain: 0.1 });
      tone({ type: 'square', f0: 233.08, f1: 185, t: t + 0.16, dur: 0.3, gain: 0.1 });
    },
  };

  function fire(name, delay) {
    const c = audio();
    if (!c) return;
    const go = () => { try { SOUNDS[name](c.currentTime + 0.005 + (delay || 0)); } catch (e) { /* 소리만 안 남 */ } };
    if (c.state === 'running') { go(); return; }
    // 아직 깨어나지 않은 상태(첫 입력 직후 · 탭을 다녀온 뒤): 깨운 다음에 냄. 너무 늦게 깨어나면 버림 (밀린 소리가 한꺼번에 나지 않게)
    const asked = performance.now();
    const p = c.resume ? c.resume() : null;
    if (p && p.then) p.then(() => { if (performance.now() - asked < 400) go(); }, () => {});
  }

  const last = {};
  let clickTimer = 0;
  // 게임 코드에서 부르는 함수. delay(초)를 주면 그만큼 뒤에 남
  window.sfx = function (name, delay) {
    if (!on || !SOUNDS[name]) return;
    clearTimeout(clickTimer);   // 다른 효과음이 나는 순간에는 버튼 틱을 내지 않음
    const now = performance.now();
    if (!delay && last[name] && now - last[name] < MIN_GAP_MS) return;
    last[name] = now;
    fire(name, delay);
  };

  function sync() {
    document.querySelectorAll('[data-sfx]').forEach((b) => {
      b.textContent = on ? '🔔 효과음 켜짐' : '🔕 효과음 꺼짐';
      b.title = on ? '효과음(버튼 · 건설 · 연구 결과) 끄기' : '효과음(버튼 · 건설 · 연구 결과) 켜기';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  window.sfxSet = function (v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 기억만 못 함 */ }
    clearTimeout(clickTimer);
    sync();
    if (on) fire('click');   // 켰다는 표시로 한 번
  };
  window.sfxIsOn = () => on;

  // 버튼 · 설비 카드를 누르면 틱. 누른 결과로 다른 효과음이 나면(건물 놓기 · 연구 결과) 그 소리만 남
  document.addEventListener('click', (e) => {
    if (!on) return;
    const t = e.target && e.target.closest ? e.target.closest('button, summary, .plant-card') : null;
    if (!t || t.disabled) return;
    // 달 진행 버튼을 누르는 것 자체에는 소리를 내지 않는다. 그 결과로 끝난 연구만 알린다.
    if (t.matches('#next-month, #report-close')) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => fire('click'), 0);
  }, true);

  // 효과음 켜기/끄기 버튼
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-sfx]') : null;
    if (b) window.sfxSet(!on);
  });

  // 첫 입력 때 소리 장치를 미리 깨워 둠 (첫 효과음이 늦게 나지 않게)
  const wake = () => { if (!on) return; const c = audio(); if (c && c.state !== 'running' && c.resume) { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, wake, true);

  sync();
})();
