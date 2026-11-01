/* Slimnote hero: the app window shows one note after another, each building itself in.
 *
 *  - Every note is a .screen inside .app-scale (a 1440 × 900 Mac screen, scaled to fit the window).
 *  - On its turn, the note's blocks rise in one after another and the title types itself.
 *  - [data-seq] blocks then reveal their pieces one by one (dynamic words, process steps, board columns).
 *  - The publishing note plays a little scene: Sam's cursor clicks Publish, the page goes live.
 *  - Pauses while the hero is off screen or the tab is hidden; the dots jump to a note.
 *  - With "reduce motion" on, notes still change, but with plain fades.
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

  var HOLD = 5600;      // how long each note stays, unless it sets data-hold
  var STAGGER = 90;     // between blocks
  var current = -1;
  var timer = null;
  var typing = null;
  var pending = [];     // timeouts of the note on screen, cleared when it changes
  var visible = true;

  function later(fn, ms) { pending.push(setTimeout(fn, ms)); }
  function clearPending() { pending.forEach(clearTimeout); pending = []; clearInterval(typing); }

  /* Fit the 1440 px screen into the window. */
  function fit() {
    scaleBox.style.setProperty('--app-scale', (win.clientWidth / 1440).toFixed(4));
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
        if (el.children.length > 2 && el.style.width) {
          Array.prototype.forEach.call(el.children, function (c) { list.push(c); });
        } else list.push(el);
      });
    }
    var panel = screen.querySelector('[data-panel]');
    if (panel) list.push(panel);
    list.forEach(function (el) { el.classList.add('b-item'); });
    screen.querySelectorAll('[data-late]').forEach(function (el) { el.classList.add('b-late'); });
    screen.querySelectorAll('[data-seq]').forEach(function (box) {
      Array.prototype.forEach.call(box.children, function (c) { c.classList.add('seq-item'); });
    });
    screen._blocks = list;
    return list;
  }

  function typeTitle(screen, startAt) {
    var h = screen.querySelector('[data-card] h1');
    if (!h || h.children.length && !h.hasAttribute('data-full')) return; // only plain-text titles type themselves
    var full = h.getAttribute('data-full') || h.textContent;
    h.setAttribute('data-full', full);
    if (reduce) { h.textContent = full; return; }
    h.textContent = '';
    var text = document.createTextNode('');
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    h.appendChild(text);
    h.appendChild(caret);
    var i = 0;
    later(function () {
      typing = setInterval(function () {
        i += 1;
        text.nodeValue = full.slice(0, i);
        if (i >= full.length) {
          clearInterval(typing);
          later(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 900);
        }
      }, 38);
    }, startAt);
  }

  /* Pieces inside [data-seq] blocks appear one by one, after their block has arrived. */
  function revealPieces(screen, blocks) {
    screen.querySelectorAll('[data-seq]').forEach(function (box) {
      var step = reduce ? 0 : parseInt(box.getAttribute('data-seq'), 10) || 200;
      var idx = blocks.findIndex(function (b) { return b === box || b.contains(box); });
      var base = reduce ? 0 : 120 + Math.max(0, idx) * STAGGER + 350;
      Array.prototype.forEach.call(box.children, function (c, i) {
        c.classList.remove('seq-in');
        later(function () { c.classList.add('seq-in'); }, base + i * step);
      });
    });
  }

  /* The publishing scene: Sam's cursor moves to Publish and clicks; the page goes live. */
  var CHECK = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  function publishScene(screen, startAt) {
    var cur = screen.querySelector('[data-cursor]');
    var btn = screen.querySelector('[data-pub]');
    var label = screen.querySelector('[data-livelabel]');
    var late = screen.querySelectorAll('.b-late');
    if (!cur || !btn) return false;

    // Back to "not published yet".
    btn.classList.remove('is-busy', 'is-pressed');
    btn.textContent = 'Publish';
    if (label) label.style.opacity = '0';
    late.forEach(function (el) { el.classList.remove('b-in'); });
    cur.classList.remove('is-on', 'is-pressing');
    cur.style.transition = 'none';
    cur.style.transform = 'translate(760px, 640px)';
    void cur.offsetWidth;
    cur.style.transition = '';

    function target() {
      var s = screen.getBoundingClientRect();
      var r = btn.getBoundingClientRect();
      var k = s.width / 1440 || 1;
      return { x: (r.left - s.left) / k + (r.width / k) * 0.42, y: (r.top - s.top) / k + (r.height / k) * 0.5 };
    }
    function goLive() {
      btn.classList.remove('is-busy');
      btn.innerHTML = CHECK + 'Updated';
      if (label) label.style.opacity = '1';
      late.forEach(function (el, i) { later(function () { el.classList.add('b-in'); }, i * 350); });
    }

    if (reduce) { later(goLive, startAt); return true; }

    later(function () { cur.classList.add('is-on'); }, startAt);
    later(function () { var t = target(); cur.style.transform = 'translate(' + t.x + 'px, ' + t.y + 'px)'; }, startAt + 250);
    later(function () { cur.classList.add('is-pressing'); btn.classList.add('is-pressed'); }, startAt + 1450);
    later(function () {
      cur.classList.remove('is-pressing');
      btn.classList.remove('is-pressed');
      btn.classList.add('is-busy');
      btn.textContent = 'Publishing…';
    }, startAt + 1620);
    later(goLive, startAt + 2500);
    later(function () {
      var t = target();
      cur.style.transform = 'translate(' + (t.x - 150) + 'px, ' + (t.y + 300) + 'px)';
    }, startAt + 3100);
    return true;
  }

  function show(n) {
    var next = screens[(n + screens.length) % screens.length];
    if (next === screens[current]) return;
    clearPending();
    var prev = screens[current];
    current = screens.indexOf(next);

    screens.forEach(function (s) { s.setAttribute('aria-hidden', s === next ? 'false' : 'true'); });
    dots.forEach(function (d, i) { d.setAttribute('aria-current', i === current ? 'true' : 'false'); });

    var blocks = blocksOf(next);
    blocks.forEach(function (el) { el.classList.remove('b-in'); el.style.transitionDelay = ''; });
    void next.offsetWidth;

    if (prev) prev.classList.remove('is-on');
    next.classList.add('is-on');

    blocks.forEach(function (el, i) {
      el.style.transitionDelay = (reduce ? 0 : 120 + i * STAGGER) + 'ms';
      el.classList.add('b-in');
    });
    var builtAt = reduce ? 0 : 120 + blocks.length * STAGGER + 500;

    revealPieces(next, blocks);
    if (!publishScene(next, builtAt)) {
      next.querySelectorAll('.b-late').forEach(function (el, i) {
        el.classList.remove('b-in');
        later(function () { el.classList.add('b-in'); }, builtAt + i * 450);
      });
    }
    typeTitle(next, 160);
  }

  function holdOf(screen) {
    return parseInt(screen && screen.getAttribute('data-hold'), 10) || HOLD;
  }

  function schedule() {
    clearTimeout(timer);
    if (!visible || document.hidden) return;
    timer = setTimeout(function () { show(current + 1); schedule(); }, holdOf(screens[current]));
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
      if (video) { if (visible) video.play().catch(function () {}); else video.pause(); }
      schedule();
    }, { threshold: 0.15 }).observe(root);
  }
  document.addEventListener('visibilitychange', schedule);
})();
