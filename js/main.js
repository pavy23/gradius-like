'use strict';
/* boot */
window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  G.init(canvas);
  // ?manual=1 lets automated tests drive G.step()/G.render() themselves
  if (!(G.q && G.q.get('manual') === '1')) G.run();
  window.__G = G; // handy for debugging / automated tests
  canvas.focus();

  // click / tap on the screen = START on menus (also gives the page keyboard focus, e.g. inside an iframe)
  canvas.addEventListener('pointerdown', () => {
    try { window.focus(); canvas.focus(); } catch (err) { /* ignore */ }
    Input.setVirtual('start', true);
    setTimeout(() => Input.setVirtual('start', false), 90);
  });

  // F = fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } catch (err) { /* ignore */ }
  });
});
