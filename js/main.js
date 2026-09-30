'use strict';
/* boot */
window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  G.init(canvas);
  // ?manual=1 lets automated tests drive G.step()/G.render() themselves
  if (!(G.q && G.q.get('manual') === '1')) G.run();
  window.__G = G; // handy for debugging / automated tests
  canvas.focus();
});
