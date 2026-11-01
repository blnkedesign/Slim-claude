/* Slimnote hero: the app window shows one note after another, each written in order.
 *
 *  - Every note is a .screen inside .app-scale (a 1440 × 900 Mac screen, scaled to fit the window).
 *  - One timeline per note: the title types, then each block arrives in turn; blocks with pieces
 *    ([data-seq]: dynamic words, process steps, board columns) show their pieces one by one before
 *    the next block starts.
 *  - Then a small scene, if the note has one: Jake drags a task to Done; Sam clicks Publish.
 *  - Cursors move like a hand: quick start, long soft landing, and a slightly curved path.
 *  - Pauses while the hero is off screen or the tab is hidden; the dots jump to a note.
 *  - With "reduce motion" on, everything appears with plain fades and the cursors stay still.
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

  // Timing (ms)
  var TYPE = 38;          // per letter of a title
  var GAP = 260;          // between plain blocks
  var AFTER = 2600;       // how long a finished note stays before the next
  var MIN_HOLD = 5200;

  // Easing
  var EASE_X = 'cubic-bezier(0.7, 0, 0.18, 1)';   // sharp in, long settle
  var EASE_Y = 'cubic-bezier(0.38, 0, 0.12, 1)';  // a touch earlier: bends the path
  var EASE_DRAG = 'cubic-bezier(0.65, 0, 0.2, 1)';

  var current = -1;
  var timer = null;
  var typing = null;
  var pending = [];
  var visible = true;

  function later(fn, ms) { pending.push(setTimeout(fn, ms)); }
  function clearPending() { pending.forEach(clearTimeout); pending = []; clearInterval(typing); }

  /* Fit the 1440 px screen into the window. */
  function fit() { scaleBox.style.setProperty('--app-scale', (win.clientWidth / 1440).toFixed(4)); }
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(win);
  else window.addEventListener('resize', fit);

  /* Where an element sits inside its screen, in the screen's own 1440 × 900 pixels. */
  function rectIn(screen, el) {
    var s = screen.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var k = s.width / 1440 || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  /* ---------- blocks ---------- */
  function setup(screen) {
    if (screen._blocks) return;
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
    list.forEach(function (el) { el.classList.add('b-item'); });
    screen._blocks = list;
    screen._panel = screen.querySelector('[data-panel]');
    if (screen._panel) screen._panel.classList.add('b-item');
    screen.querySelectorAll('[data-late]').forEach(function (el) { el.classList.add('b-late'); });
    screen.querySelectorAll('[data-seq]').forEach(function (box) {
      Array.prototype.forEach.call(box.children, function (c) { c.classList.add('seq-item'); });
    });
    var h = screen.querySelector('[data-card] h1');
    if (h && !h.children.length) { screen._title = h; h.setAttribute('data-full', h.textContent); }
  }

  function resetScreen(screen) {
    screen._blocks.concat(screen._panel ? [screen._panel] : []).forEach(function (el) { el.classList.remove('b-in'); });
    screen.querySelectorAll('.seq-item, .b-late').forEach(function (el) { el.classList.remove('seq-in', 'b-in'); });
    if (screen._title) screen._title.textContent = screen._title.getAttribute('data-full');
  }

  function typeTitle(h, at) {
    var full = h.getAttribute('data-full');
    if (reduce) { h.textContent = full; return 0; }
    h.textContent = '';
    var text = document.createTextNode('');
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    h.appendChild(text);
    h.appendChild(caret);
    var i = 0;
    later(function () {
      clearInterval(typing);
      typing = setInterval(function () {
        i += 1;
        text.nodeValue = full.slice(0, i);
        if (i >= full.length) {
          clearInterval(typing);
          later(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 700);
        }
      }, TYPE);
    }, at);
    return full.length * TYPE;
  }

  /* Lay the note out on one timeline. Returns when everything is written. */
  function writeNote(screen) {
    var t = reduce ? 0 : 260;
    if (screen._panel) later(function () { screen._panel.classList.add('b-in'); }, reduce ? 0 : 120);

    screen._blocks.forEach(function (el) {
      var at = t;
      later(function () { el.classList.add('b-in'); }, at);
      if (reduce) return;

      if (screen._title && el.contains(screen._title)) {
        t += 220 + typeTitle(screen._title, at + 220) + 260;
        return;
      }
      var boxes = el.matches('[data-seq]') ? [el] : Array.prototype.slice.call(el.querySelectorAll('[data-seq]'));
      if (boxes.length) {
        var s = at + 320;
        boxes.forEach(function (box) {
          var step = parseInt(box.getAttribute('data-seq'), 10) || 200;
          Array.prototype.forEach.call(box.children, function (c, i) {
            later(function () { c.classList.add('seq-in'); }, s + i * step);
          });
          s += box.children.length * step;
        });
        t = s + 200;
        return;
      }
      t += GAP;
    });

    if (reduce) {
      screen.querySelectorAll('.seq-item').forEach(function (c) { later(function () { c.classList.add('seq-in'); }, 0); });
    }
    return t + 300;
  }

  /* ---------- cursors ---------- */
  function Cursor(el) {
    this.el = el;
    this.x = 0; this.y = 0;
    this.ax = el.querySelector('.cursor-x');
    this.ay = el.querySelector('.cursor-y');
  }
  Cursor.prototype.place = function (x, y) {
    this.ax.getAnimations().forEach(function (a) { a.cancel(); });
    this.ay.getAnimations().forEach(function (a) { a.cancel(); });
    this.x = x; this.y = y;
    this.ax.style.transform = 'translateX(' + x + 'px)';
    this.ay.style.transform = 'translateY(' + y + 'px)';
    this.el.classList.remove('is-on', 'is-pressing');
    this.flipNear(x);
  };
  Cursor.prototype.moveTo = function (x, y, ms, ex, ey) {
    var d = Math.hypot(x - this.x, y - this.y);
    ms = ms || Math.min(1300, 520 + d * 0.55);
    this.ax.animate([{ transform: 'translateX(' + this.x + 'px)' }, { transform: 'translateX(' + x + 'px)' }], { duration: ms, easing: ex || EASE_X, fill: 'forwards' });
    this.ay.animate([{ transform: 'translateY(' + this.y + 'px)' }, { transform: 'translateY(' + y + 'px)' }], { duration: ms, easing: ey || EASE_Y, fill: 'forwards' });
    this.x = x; this.y = y;
    this.flipNear(x);
    return ms;
  };
  Cursor.prototype.flipNear = function (x) { this.el.classList.toggle('is-flipped', x > 1240); };
  Cursor.prototype.press = function (on) { this.el.classList.toggle('is-pressing', on); };
  function cursorOf(screen) {
    var el = screen.querySelector('.cursor');
    if (!el) return null;
    if (!el._c) el._c = new Cursor(el);
    return el._c;
  }

  /* Sam clicks Publish; the page goes live. */
  var CHECK = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  function publishScene(screen, at) {
    var btn = screen.querySelector('[data-pub]');
    var c = cursorOf(screen);
    if (!btn || !c || screen.getAttribute('data-note') !== 'publish') return 0;
    var label = screen.querySelector('[data-livelabel]');
    var late = screen.querySelectorAll('.b-late');

    btn.classList.remove('is-busy', 'is-pressed');
    btn.textContent = 'Publish';
    if (label) label.style.opacity = '0';
    c.place(720, 660);

    function goLive() {
      btn.classList.remove('is-busy');
      btn.innerHTML = CHECK + 'Updated';
      if (label) label.style.opacity = '1';
      late.forEach(function (el, i) { later(function () { el.classList.add('b-in'); }, i * 380); });
    }
    if (reduce) { later(goLive, at); return 1500; }

    var tx = 0, ty = 0;
    later(function () { c.el.classList.add('is-on'); }, at);
    var travel = 1100;
    later(function () {
      var b = rectIn(screen, btn); // measured now, once the note has settled
      tx = b.x + b.w * 0.4; ty = b.y + b.h * 0.55;
      c.moveTo(tx, ty, travel);
    }, at + 200);
    var click = at + 200 + travel + 140;
    later(function () { c.press(true); btn.classList.add('is-pressed'); }, click);
    later(function () { c.press(false); btn.classList.remove('is-pressed'); btn.classList.add('is-busy'); btn.textContent = 'Publishing…'; }, click + 150);
    later(goLive, click + 1050);
    later(function () { c.moveTo(tx - 170, ty + 330, 1150); }, click + 1500);
    return click + 2900 - at;
  }

  /* Jake drags a task from Doing to Done. */
  function dragScene(screen, at) {
    var card = screen.querySelector('[data-drag]');
    var c = cursorOf(screen);
    if (!card || !c) return 0;
    card.getAnimations().forEach(function (a) { a.cancel(); });
    card.classList.remove('is-lifted');
    c.place(1010, 640);
    if (reduce) return 0;

    var board = card.closest('[data-seq]');
    var done = board && board.children[2];
    var list = done && done.children[1];
    if (!list) return 0;

    var from, grab;
    later(function () { c.el.classList.add('is-on'); }, at);
    var travel = 1000;
    later(function () {
      from = rectIn(screen, card); // measured now, once the note has settled
      grab = { x: from.x + from.w * 0.3, y: from.y + from.h * 0.5 };
      c.moveTo(grab.x, grab.y, travel);
    }, at + 200);
    var lift = at + 200 + travel + 120;
    later(function () { c.press(true); card.classList.add('is-lifted'); }, lift);

    var drag = 1050;
    later(function () {
      var last = rectIn(screen, list.lastElementChild);
      var dx = last.x - from.x;
      var dy = last.y + last.h + 6 - from.y;
      card.animate([{ translate: '0px 0px' }, { translate: dx + 'px ' + dy + 'px' }], { duration: drag, easing: EASE_DRAG, fill: 'forwards' });
      c.moveTo(grab.x + dx, grab.y + dy, drag, EASE_DRAG, EASE_DRAG);
    }, lift + 180);
    later(function () { c.press(false); card.classList.remove('is-lifted'); }, lift + 180 + drag + 60);
    later(function () { c.moveTo(c.x + 120, c.y + 150, 1000); }, lift + 180 + drag + 500);
    return lift + 180 + drag + 1600 - at;
  }

  /* ---------- switching notes ---------- */
  function show(n) {
    var next = screens[(n + screens.length) % screens.length];
    if (next === screens[current]) return;
    clearPending();
    var prev = screens[current];
    current = screens.indexOf(next);

    screens.forEach(function (s) { s.setAttribute('aria-hidden', s === next ? 'false' : 'true'); });
    dots.forEach(function (d, i) { d.setAttribute('aria-current', i === current ? 'true' : 'false'); });

    setup(next);
    resetScreen(next);
    void next.offsetWidth;

    if (prev) {
      prev.classList.remove('is-on');
      prev.classList.add('is-leaving');
      later(function () { prev.classList.remove('is-leaving'); }, 800);
    }
    next.classList.add('is-on');

    var written = writeNote(next);
    var scene = publishScene(next, written) || dragScene(next, written);
    if (!scene) {
      next.querySelectorAll('.b-late').forEach(function (el, i) { later(function () { el.classList.add('b-in'); }, written + i * 450); });
    }
    next._hold = Math.max(MIN_HOLD, written + scene + AFTER);
  }

  function schedule() {
    clearTimeout(timer);
    if (!visible || document.hidden) return;
    var s = screens[current];
    timer = setTimeout(function () { show(current + 1); schedule(); }, (s && s._hold) || MIN_HOLD);
  }

  dots.forEach(function (d, i) { d.addEventListener('click', function () { show(i); schedule(); }); });

  root.classList.add('anim');
  show(0);
  schedule();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (video) { if (visible) video.play().catch(function () {}); else video.pause(); }
      schedule();
    }, { threshold: 0.15 }).observe(root);
  }
  document.addEventListener('visibilitychange', schedule);
})();
