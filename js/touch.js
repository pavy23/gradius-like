'use strict';
/* =============================================================
 * On-screen touch controls (only appear on touch devices).
 *   left thumb  : drag anywhere in the left half = move (virtual stick)
 *   SHOT button : hold to fire        POWER button : activates the lit meter slot
 *   II          : pause               tap the screen on menus = start
 * ============================================================= */
(function touchControls() {
  let built = false;

  function build() {
    if (built) return;
    built = true;
    const css = document.createElement('style');
    css.textContent = `
      #touch { position: fixed; inset: 0; z-index: 5; pointer-events: none; user-select: none; -webkit-user-select: none; touch-action: none; }
      #touch .zone { position: absolute; left: 0; bottom: 0; width: 55%; height: 62%; pointer-events: auto; touch-action: none; }
      #touch .stick { position: absolute; width: 92px; height: 92px; margin: -46px 0 0 -46px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.35); background: rgba(120,160,255,.12); display: none; }
      #touch .stick i { position: absolute; left: 50%; top: 50%; width: 38px; height: 38px; margin: -19px 0 0 -19px; border-radius: 50%;
        background: rgba(200,220,255,.45); border: 2px solid rgba(255,255,255,.6); }
      #touch .btn { position: absolute; pointer-events: auto; touch-action: none; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font: bold 13px/1 monospace; letter-spacing: 1px; color: #fff; border: 2px solid rgba(255,255,255,.55); }
      #touch .fire { right: 3%; bottom: 5%; width: 92px; height: 92px; background: rgba(255,90,60,.30); }
      #touch .power { right: 3%; bottom: calc(5% + 104px); width: 74px; height: 74px; margin-right: 9px; background: rgba(255,190,40,.30); }
      #touch .pause { right: 10px; top: 10px; width: 38px; height: 38px; font-size: 14px; background: rgba(255,255,255,.14); }
      #touch .btn.on { background: rgba(255,255,255,.5); }
    `;
    document.head.appendChild(css);

    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML =
      '<div class="zone"><div class="stick"><i></i></div></div>' +
      '<div class="btn power">POWER</div>' +
      '<div class="btn fire">SHOT</div>' +
      '<div class="btn pause">II</div>';
    document.body.appendChild(root);

    // ----- virtual stick -----
    const zone = root.querySelector('.zone');
    const stick = root.querySelector('.stick');
    const knob = stick.querySelector('i');
    let pid = null, ox = 0, oy = 0;
    const setDir = (dx, dy) => {
      const T = 10;
      Input.setVirtual('left', dx < -T);
      Input.setVirtual('right', dx > T);
      Input.setVirtual('up', dy < -T);
      Input.setVirtual('down', dy > T);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      zone.setPointerCapture(pid);
      ox = e.clientX;
      oy = e.clientY;
      stick.style.display = 'block';
      stick.style.left = ox + 'px';
      stick.style.top = oy + 'px';
      knob.style.transform = 'translate(0,0)';
      setDir(0, 0);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy), max = 46;
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      setDir(dx, dy);
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      stick.style.display = 'none';
      setDir(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // ----- buttons -----
    const hold = (el, actions) => {
      const on = (e) => {
        el.classList.add('on');
        for (const a of actions) Input.setVirtual(a, true);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      };
      const off = () => {
        el.classList.remove('on');
        for (const a of actions) Input.setVirtual(a, false);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
    };
    hold(root.querySelector('.fire'), ['fire', 'start']);
    hold(root.querySelector('.power'), ['power']);
    hold(root.querySelector('.pause'), ['pause']);

  }

  const isTouchDevice = () =>
    ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  window.addEventListener('load', () => {
    const q = new URLSearchParams(location.search);
    if (q.get('touch') === '1' || isTouchDevice()) build();
    else window.addEventListener('touchstart', build, { once: true, passive: true });
  });
})();
