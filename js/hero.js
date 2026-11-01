/* Slimnote hero: the app window shows one note after another, each building itself in.
 *
 *  - Every note is a .screen inside .app-scale (a 1440 × 900 Mac screen, scaled to fit the window).
 *  - On its turn, the note's blocks rise in one after another; the title types itself.
 *  - Pauses while the hero is off screen or the tab is hidden; the dots jump to a note.
 *  - With "reduce motion" on, notes still change, but with a plain fade.
 */
(function () {
  var root = document.querySelector('[data-hero]');
  if (!root) return;

  var win = root.querySelector('.app-window');
  var scaleBox = root.querySelector('.app-scale');
  var screens = Array.prototype.slice.call(root.querySelectorAll('.screen'));
  var dots = Array.prototype.slice.call(root.querySelectorAll('.note-dots button'));
  var video = root.querySelector('.hero-video');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var HOLD = 5600;      // how long each note stays
  var STAGGER = 90;     // between blocks
  var current = -1;
  var timer = null;
  var typing = null;
  var visible = true;

  /* Fit the 1440 px screen into the window. */
  function fit() {
    var s = win.clientWidth / 1440;
    scaleBox.style.setProperty('--app-scale', s.toFixed(4));
  }
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(win);
  else window.addEventListener('resize', fit);

  /* Which elements build in: the note's blocks (the column's children), then the side panel. */
  function blocksOf(screen) {
    if (screen._blocks) return screen._blocks;
    var list = [];
    var card = screen.querySelector('[data-card]');
    if (card) {
      Array.prototype.forEach.call(card.children, function (el) {
        if (el.hasAttribute('data-late')) return;
        // A centred column holds the blocks; take them one by one.
        if (el.children.length > 2 && el.style.width && !el.hasAttribute('data-whole')) {
          Array.prototype.forEach.call(el.children, function (c) { list.push(c); });
        } else list.push(el);
      });
    }
    var panel = screen.querySelector('[data-panel]');
    if (panel) list.push(panel);
    list.forEach(function (el) { el.classList.add('b-item'); });
    screen.querySelectorAll('[data-late]').forEach(function (el) { el.classList.add('b-late'); });
    screen._blocks = list;
    return list;
  }

  function typeTitle(screen, startAt) {
    var h = screen.querySelector('[data-card] h1');
    if (!h || h.children.length) return; // only plain-text titles type themselves
    var full = h.getAttribute('data-full') || h.textContent;
    h.setAttribute('data-full', full);
    if (reduce) { h.textContent = full; return; }
    h.textContent = '';
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    h.appendChild(caret);
    var i = 0;
    clearInterval(typing);
    setTimeout(function () {
      typing = setInterval(function () {
        i += 1;
        h.firstChild && h.firstChild.nodeType === 3 ? (h.firstChild.nodeValue = full.slice(0, i)) : h.insertBefore(document.createTextNode(full.slice(0, i)), caret);
        if (i >= full.length) {
          clearInterval(typing);
          setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 900);
        }
      }, 38);
    }, startAt);
  }

  function show(n) {
    if (n === current) return;
    var prev = screens[current];
    current = (n + screens.length) % screens.length;
    var next = screens[current];

    screens.forEach(function (s) { s.setAttribute('aria-hidden', s === next ? 'false' : 'true'); });
    dots.forEach(function (d, i) { d.setAttribute('aria-current', i === current ? 'true' : 'false'); });

    var blocks = blocksOf(next);
    var late = next.querySelectorAll('.b-late');
    // Reset, then let them build in.
    blocks.forEach(function (el) { el.classList.remove('b-in'); el.style.transitionDelay = ''; });
    late.forEach(function (el) { el.classList.remove('b-in'); });
    void next.offsetWidth;

    if (prev) prev.classList.remove('is-on');
    next.classList.add('is-on');

    blocks.forEach(function (el, i) {
      el.style.transitionDelay = (reduce ? 0 : 120 + i * STAGGER) + 'ms';
      el.classList.add('b-in');
    });
    var lateAt = reduce ? 0 : 120 + blocks.length * STAGGER + 500;
    late.forEach(function (el, i) {
      setTimeout(function () { el.classList.add('b-in'); }, lateAt + i * 450);
    });
    typeTitle(next, 160);
  }

  function schedule() {
    clearTimeout(timer);
    if (!visible || document.hidden) return;
    timer = setTimeout(function () { show(current + 1); schedule(); }, HOLD);
  }

  dots.forEach(function (d, i) {
    d.addEventListener('click', function () { show(i); schedule(); });
  });

  root.classList.add('anim');
  show(0);
  schedule();

  // Pause when the hero leaves the screen or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (video) { visible ? video.play().catch(function () {}) : video.pause(); }
      schedule();
    }, { threshold: 0.15 }).observe(root);
  }
  document.addEventListener('visibilitychange', schedule);
})();
