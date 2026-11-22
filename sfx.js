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
  const MASTER = 0.6;        // 효과음 전체 음량 (소리마다의 크기는 아래 SOUNDS의 gain). 1.0은 너무 크다는 의견이 있어 0.6으로 낮춤
  //  크기 기준: BGM은 평균 0.07(컴퓨터) ~ 0.12(아이폰), 최대 0.3 ~ 0.5 정도로 남.
  //  처음에는 효과음을 0.05 안팎으로 만들어 BGM에 묻혀 거의 안 들렸음 → 연구 소리는 BGM 평균의 서너 배, 버튼 틱은 두 배쯤으로 키움.
  //  "툭"은 낮은 음만으로는 노트북 · 휴대폰 스피커에서 안 들려서 한 옥타브 위 음과 부딪히는 잡음을 겹침
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

  // 한 음: f0에서 f1로 미끄러지며(없으면 고정) dur초 동안 남. 앞쪽 hold 비율만큼은 제 크기를 유지하고 그 뒤에 작아짐
  //  (처음부터 바로 작아지게 하면 음 길이의 4분의 1만 지나도 10분의 1 크기가 되어, 최대 크기에 비해 훨씬 작게 들림)
  function tone(o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    const s = o.t, e = o.t + o.dur;
    const holdUntil = s + Math.max(0.005, o.dur * (o.hold === undefined ? 0.55 : o.hold));
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, s);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, e);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(o.gain, s + 0.004);
    g.gain.setValueAtTime(o.gain, holdUntil);
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
    click(t) { tone({ type: 'triangle', f0: 1250, f1: 900, t, dur: 0.05, gain: 0.32, hold: 0.4 }); },
    // 건물 놓기: 낮은 음이 뚝 떨어지는 "툭" + 한 옥타브 위 음(작은 스피커용) + 부딪히는 잡음
    place(t) {
      tone({ type: 'sine', f0: 210, f1: 70, t, dur: 0.16, gain: 0.5, hold: 0.35 });
      tone({ type: 'triangle', f0: 420, f1: 150, t, dur: 0.1, gain: 0.26, hold: 0.3 });
      noise({ t, dur: 0.055, gain: 0.3, freq: 1500 });
    },
    // 연구 성공: 도-미-솔-도 (오락실 느낌)
    rdok(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ type: 'square', f0: f, t: t + i * 0.075, dur: i === 3 ? 0.28 : 0.09, gain: 0.26 }));
      tone({ type: 'triangle', f0: 1046.5, t: t + 0.225, dur: 0.32, gain: 0.3 });
    },
    // 연구 실패: 낮게 내려가는 두 음
    rdfail(t) {
      tone({ type: 'square', f0: 311.13, t, dur: 0.16, gain: 0.26 });
      tone({ type: 'square', f0: 233.08, f1: 185, t: t + 0.17, dur: 0.32, gain: 0.26 });
    },
  };

  // 점검용: 소리를 화면 밖에서 그려 보고 크기를 잼 (귀로 듣지 못할 때 숫자로 확인) → { peak 최대, rms 평균, ms 길이 }
  window.sfxMeasure = async function (name) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC || !SOUNDS[name]) return null;
    const keep = [ctx, master, noiseBuf];
    const off = new OC(1, 44100, 44100);
    ctx = off; master = off.createGain(); master.gain.value = MASTER; master.connect(off.destination); noiseBuf = null;
    try { SOUNDS[name](0.01); } finally { ctx = keep[0]; master = keep[1]; noiseBuf = keep[2]; }
    const d = (await off.startRendering()).getChannelData(0);
    let peak = 0, sum = 0, n = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.002) { sum += d[i] * d[i]; n++; } }
    return { peak: +peak.toFixed(3), rms: n ? +Math.sqrt(sum / n).toFixed(3) : 0, ms: Math.round(n / 44.1) };
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
