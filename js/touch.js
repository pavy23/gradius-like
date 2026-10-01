'use strict';
/* =============================================================
 * On-screen touch controls (only built on touch devices).
 *
 *   drag anywhere : move the ship. It is a relative "touchpad" drag: the ship moves by what your finger moves, it never
 *                   jumps to the touch point and the thumb never covers the action (the black bars work too).
 *   AUTO          : auto-fire on/off (default ON everywhere). With AUTO off a SHOT button appears (hold to fire).
 *   POWER         : activates the lit power-meter slot            II : pause
 *   menus         : tap = start / continue / resume; swipe on the title = level (left/right) and stage (up/down)
 *   title / pause : SOUND (mute), L<>R (mirror the buttons for left-handed play) and, when paused / game over, QUIT
 *
 * The finger only produces *requests* (Input.addDrag / virtual buttons); Player.update() decides how far the ship
 * really moves, so speed-ups, borders and death behave exactly like with the keyboard.
 * ============================================================= */
const TouchUI = {
  active: false, // the player is on the touch screen right now (menus then show touch wording)
  root: null,
  gain: null, // game pixels per CSS pixel of finger movement
};

(function touchControls() {
  let built = false;

  // How far the ship travels for a given finger movement, as a multiple of the *visual* distance (1 = the ship moves
  // exactly as far on screen as the finger), limited so tablets do not need huge swipes and phones stay precise.
  const FEEL = Math.max(0.5, Math.min(3, parseFloat(new URLSearchParams(location.search).get('sens')) || 1.3));
  const SWIPE = 36; // CSS px: title-screen swipe threshold

  function build() {
    if (built) return;
    built = true;
    const canvas = document.getElementById('screen');

    const css = document.createElement('style');
    css.textContent = `
      #touch { position: fixed; inset: 0; z-index: 5; pointer-events: none; user-select: none; -webkit-user-select: none;
        -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none; }
      #touch .drag { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
      #touch .ring { position: absolute; left: 0; top: 0; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.30); background: rgba(140,180,255,.10); display: none; pointer-events: none; }
      #touch .btn { position: absolute; pointer-events: auto; touch-action: none; display: none; align-items: center; justify-content: center;
        box-sizing: border-box; border-radius: 50%; color: #fff; text-align: center; font: bold 12px/1 monospace; letter-spacing: 1px;
        border: 2px solid rgba(255,255,255,.55); background: rgba(255,255,255,.12); }
      #touch .btn.on { background: rgba(255,255,255,.5); }

      /* right-handed layout (default): action buttons bottom-right, pause top-right */
      #touch .power { right: 14px; bottom: 22px; width: 88px; height: 88px; font-size: 13px; background: rgba(255,190,40,.30); }
      #touch .fire  { right: 116px; bottom: 30px; width: 76px; height: 76px; background: rgba(255,90,60,.30); }
      #touch .auto  { right: 28px; bottom: 122px; width: 58px; height: 58px; font-size: 11px; }
      #touch .pause { right: 10px; top: 10px; width: 40px; height: 40px; font-size: 14px; }
      #touch .sound, #touch .hand, #touch .quit { bottom: 30px; width: 58px; height: 58px; font-size: 10px; }
      #touch .sound { right: 96px; } #touch .hand { right: 164px; } #touch .quit { right: 232px; }
      /* mirrored (left-handed) */
      #touch.lefty .power { right: auto; left: 14px; }   #touch.lefty .fire  { right: auto; left: 116px; }
      #touch.lefty .auto  { right: auto; left: 28px; }   #touch.lefty .pause { right: auto; left: 10px; }
      #touch.lefty .sound { right: auto; left: 96px; }   #touch.lefty .hand  { right: auto; left: 164px; }
      #touch.lefty .quit  { right: auto; left: 232px; }

      /* which buttons exist in which mode (data-mode / data-auto / data-mute are kept in sync with the game) */
      #touch[data-mode="play"] .power, #touch[data-mode="play"] .auto, #touch[data-mode="play"] .pause,
      #touch[data-mode="title"] .auto, #touch[data-mode="title"] .sound, #touch[data-mode="title"] .hand,
      #touch[data-mode="paused"] .auto, #touch[data-mode="paused"] .sound, #touch[data-mode="paused"] .hand,
      #touch[data-mode="paused"] .quit, #touch[data-mode="gameover"] .quit, #touch[data-mode="ending"] .quit { display: flex; }
      #touch[data-mode="play"][data-auto="0"] .fire { display: flex; }
      /* menus: one row along the bottom edge, clear of the text in the middle of the screen */
      #touch[data-mode="title"] .auto, #touch[data-mode="paused"] .auto { bottom: 30px; }
      #touch[data-mode="gameover"] .quit, #touch[data-mode="ending"] .quit { right: 28px; }
      #touch.lefty[data-mode="gameover"] .quit, #touch.lefty[data-mode="ending"] .quit { right: auto; left: 28px; }
      #touch[data-auto="1"] .auto { background: rgba(80,220,140,.42); border-color: rgba(170,255,205,.85); }
      #touch[data-mute="1"] .sound { opacity: .55; text-decoration: line-through; }
    `;
    document.head.appendChild(css);

    const root = document.createElement('div');
    root.id = 'touch';
    root.dataset.mode = 'title';
    root.dataset.auto = '0';
    root.innerHTML =
      '<div class="drag"></div><div class="ring"></div>' +
      '<div class="btn power">POWER</div><div class="btn fire">SHOT</div><div class="btn auto">AUTO</div>' +
      '<div class="btn pause">II</div>' +
      '<div class="btn sound">SOUND</div><div class="btn hand">L&lt;&gt;R</div><div class="btn quit">QUIT</div>';
    document.body.appendChild(root);
    TouchUI.root = root;
    const $ = (sel) => root.querySelector(sel);

    const focusGame = () => {
      try {
        window.focus();
        canvas.focus();
      } catch (err) { /* ignore */ }
    };
    const pulse = (action) => {
      Input.setVirtual(action, true);
      setTimeout(() => Input.setVirtual(action, false), 90);
    };
    const isMenu = (mode) => mode !== 'play' && mode !== 'intro';
    /** every touch on the controls: remember we are on the touch screen (menus then use touch wording) */
    const touched = (e) => {
      TouchUI.active = e.pointerType !== 'mouse';
      focusGame();
    };
    window.addEventListener('keydown', () => { TouchUI.active = false; }, true);
    TouchUI.active = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    // ----- finger movement -> game pixels -----
    TouchUI.gain = () => {
      const w = canvas.getBoundingClientRect().width || W;
      return clamp(FEEL / (w / W), 0.55, 1.15);
    };

    // ----- the touchpad (whole screen) -----
    const pad = $('.drag');
    const ring = $('.ring');
    let pid = null, lx = 0, ly = 0, sx = 0, sy = 0, downMode = 'title';
    const showRing = (x, y) => {
      ring.style.display = 'block';
      ring.style.transform = `translate(${x}px,${y}px)`;
    };
    pad.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      touched(e);
      downMode = G.mode;
      // a mouse click on the bare page = start on menus (touch waits for the finger to lift, see below)
      if (e.pointerType === 'mouse' && isMenu(G.mode)) pulse('start');
      if (pid !== null) return; // one finger steers
      pid = e.pointerId;
      lx = sx = e.clientX;
      ly = sy = e.clientY;
      try { pad.setPointerCapture(pid); } catch (err) { /* ignore */ }
      showRing(lx, ly);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      showRing(lx, ly);
      if (G.mode === 'play') {
        const k = TouchUI.gain();
        Input.addDrag(dx * k, dy * k);
      }
      e.preventDefault();
    });
    const release = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      ring.style.display = 'none';
      // menus: a tap starts / continues / resumes; on the title a swipe changes level (left/right) or stage (up/down).
      // Only if the finger also went down in that menu, so lifting a steering finger after dying or pausing does nothing.
      if (e.type !== 'pointerup' || e.pointerType === 'mouse' || downMode !== G.mode || !isMenu(G.mode)) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (G.mode === 'title' && Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE) {
        if (Math.abs(dx) > Math.abs(dy)) pulse(dx < 0 ? 'left' : 'right');
        else pulse(dy < 0 ? 'up' : 'down');
      } else {
        pulse('start');
      }
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom

    // ----- buttons -----
    const hold = (el, actions) => {
      const on = (e) => {
        touched(e);
        el.classList.add('on');
        for (const a of actions) Input.setVirtual(a, true);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        e.stopPropagation();
      };
      const off = () => {
        el.classList.remove('on');
        for (const a of actions) Input.setVirtual(a, false);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    const tap = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        touched(e);
        el.classList.add('on');
        fn();
        e.preventDefault();
        e.stopPropagation();
      });
      const off = () => el.classList.remove('on');
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold($('.power'), ['power']);
    hold($('.fire'), ['fire']);
    hold($('.pause'), ['pause']);
    tap($('.auto'), () => G.toggleAuto());
    tap($('.sound'), () => {
      try {
        if (typeof Sound !== 'undefined') G.toast(Sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
      } catch (err) { /* ignore */ }
    });
    tap($('.quit'), () => {
      pulse('quit'); // paused -> title
      pulse('back'); // game over / ending -> title
    });
    let lefty = Store.get('nova.hand', 'r') === 'l';
    root.classList.toggle('lefty', lefty);
    tap($('.hand'), () => {
      lefty = !lefty;
      Store.set('nova.hand', lefty ? 'l' : 'r');
      root.classList.toggle('lefty', lefty);
      G.toast(lefty ? 'BUTTONS: LEFT SIDE' : 'BUTTONS: RIGHT SIDE');
    });

    // keep the button set in step with the game (cheap: 3 attribute checks every 50 ms)
    const set = (k, v) => { if (root.dataset[k] !== v) root.dataset[k] = v; };
    setInterval(() => {
      set('mode', G.mode);
      set('auto', G.autoShot ? '1' : '0');
      set('mute', typeof Sound !== 'undefined' && Sound.muted ? '1' : '0');
    }, 50);

    // never leave a finger "stuck" when the page loses focus
    const letGo = () => {
      pid = null;
      ring.style.display = 'none';
      Input.clearVirtual();
      for (const b of root.querySelectorAll('.btn.on')) b.classList.remove('on');
    };
    window.addEventListener('blur', letGo);
    document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
  }

  const isTouchDevice = () =>
    ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  window.addEventListener('load', () => {
    const q = new URLSearchParams(location.search);
    if (q.get('touch') === '1' || isTouchDevice()) build();
    else {
      // a touch screen we could not detect up front (e.g. a laptop): build on the first touch
      window.addEventListener('touchstart', () => {
        build();
        TouchUI.active = true;
      }, { once: true, passive: true });
    }
  });
})();
