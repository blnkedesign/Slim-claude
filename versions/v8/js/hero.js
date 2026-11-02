/* Slimnote hero: the app window shows one note after another, each written in order.
 *
 *  - Every note is a .screen inside .app-scale (a 1440 × 900 Mac screen, scaled to fit the window).
 *  - One timeline per note: the title types, then each block arrives in turn. Blocks with pieces
 *    ([data-seq]: dynamic words, process steps, board columns) reveal them one by one; the next
 *    block starts while the last pieces are still landing, so the note keeps flowing.
 *  - Then a small scene, if the note has one: Chloe places a sticker, Jake drags a task to Done
 *    (the board rearranges like the real app), Sam clicks Publish.
 *  - Cursors move like a hand: quick start, soft landing, slightly curved paths.
 *  - Pauses while the hero is off screen or the tab is hidden; the dots jump to a note.
 *  - With "reduce motion" on, everything appears with plain fades and cursors stay hidden.
 */
(function () {
  var root = document.querySelector('[data-hero]');
  if (!root) return;

  var win = root.querySelector('.app-window');
  var scaleBox = root.querySelector('.app-scale');
  var screens = Array.prototype.slice.call(root.querySelectorAll('.screen'));
  var dots = Array.prototype.slice.call(root.querySelectorAll('.note-dots button'));
  var video = root.querySelector('video.hero-video'); // only when the background is a video
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Timing (ms) */
  var TYPE = 26;          // average per letter of a title
  var TYPE_WORD = 30;     // per letter in dynamic text
  var GAP = 150;          // between plain blocks
  var PIECE = 0.6;        // [data-seq] steps are scaled by this (attribute values are the design pace)
  var OVERLAP = 0.35;     // the next block starts this share of a piece run before it ends
  var AFTER = 1600;       // how long a finished note stays
  var MIN_HOLD = 4200;

  /* Curves come from the stylesheet, so CSS and JS move alike. */
  var css = getComputedStyle(document.documentElement);
  var EASE_OUT = css.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_IN_OUT = css.getPropertyValue('--ease-in-out').trim() || 'cubic-bezier(0.77, 0, 0.175, 1)';
  // For cursors, y leads x slightly: the path bends like a hand's.
  var EASE_Y = 'cubic-bezier(0.55, 0, 0.12, 1)';

  var current = -1;
  var timer = null;
  var typing = null;
  var pending = [];
  var visible = true;

  function later(fn, ms) { pending.push(setTimeout(fn, ms)); }
  function clearPending() { pending.forEach(clearTimeout); pending = []; clearTimeout(typing); }

  // The scale lives on the hero, so the window and the cursor layer above it share it.
  function fit() { root.style.setProperty('--app-scale', (win.clientWidth / 1440).toFixed(4)); }
  fit();
  // Version 5: scale the whole inside of the card to Figma's 1408 × 871 proportions.
  var card = root.querySelector('.hero-card');
  function fitHero() {
    if (!root.classList.contains('hero--fit') || window.matchMedia('(max-width: 760px)').matches) {
      root.style.removeProperty('--hero-k');
      return;
    }
    var k = Math.min(card.clientWidth / 1408, card.clientHeight / 871);
    root.style.setProperty('--hero-k', k.toFixed(4));
  }
  fitHero();
  if ('ResizeObserver' in window) new ResizeObserver(fitHero).observe(card);
  else window.addEventListener('resize', fitHero);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(win);
  else window.addEventListener('resize', fit);

  /* Where an element sits inside its screen, in the screen's own 1440 × 900 pixels. */
  function rectIn(screen, el) {
    var s = screen.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var k = s.width / 1440 || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  /* Cursors live in a layer above the window, so a name tag near the edge is never cut off. */
  var cursorLayer = root.querySelector('.cursor-scale');
  screens.forEach(function (s) {
    var el = s.querySelector('.cursor');
    if (el && cursorLayer) { cursorLayer.appendChild(el); s._cursorEl = el; }
  });

  function cancelAnims(el) { el.getAnimations().forEach(function (a) { a.cancel(); }); }

  /* ---------- blocks ---------- */
  function setup(screen) {
    if (screen._blocks) return;
    var list = [];
    var card = screen.querySelector('[data-card]');
    if (card) {
      Array.prototype.forEach.call(card.children, function (el) {
        if (el.hasAttribute('data-late')) return;
        if (el.children.length > 2 && el.style.width) {
          Array.prototype.forEach.call(el.children, function (c) { if (!c.hasAttribute('data-place')) list.push(c); });
        } else list.push(el);
      });
    }
    list.forEach(function (el) { el.classList.add('b-item'); });
    screen._blocks = list;
    screen._panel = screen.querySelector('[data-panel]');
    if (screen._panel) screen._panel.classList.add('b-item');
    screen.querySelectorAll('[data-late]').forEach(function (el) { el.classList.add('b-late'); });
    screen.querySelectorAll('[data-seq], [data-typewords]').forEach(function (box) {
      Array.prototype.forEach.call(box.children, function (c) { c.classList.add('seq-item'); });
    });
    screen.querySelectorAll('[data-typewords] > *').forEach(function (w) { w.setAttribute('data-text', w.textContent); });
    var h = screen.querySelector('[data-card] h1');
    if (h && !h.children.length) { screen._title = h; h.setAttribute('data-full', h.textContent); }
  }

  function resetScreen(screen) {
    screen._blocks.concat(screen._panel ? [screen._panel] : []).forEach(function (el) { el.classList.remove('b-in'); });
    screen.querySelectorAll('.seq-item, .b-late').forEach(function (el) { el.classList.remove('seq-in', 'b-in'); });
    if (screen._title) screen._title.textContent = screen._title.getAttribute('data-full');
    screen.querySelectorAll('[data-typewords] > *').forEach(function (w) { w.textContent = w.getAttribute('data-text'); w.classList.remove('is-typing'); });
  }

  /* Dynamic text: each word appears and its letters type in, one word after another. */
  function typeWords(box, at) {
    var t = at;
    Array.prototype.forEach.call(box.children, function (w) {
      var word = w.getAttribute('data-text');
      var start = t;
      later(function () { w.textContent = ''; w.classList.add('seq-in', 'is-typing'); }, start);
      for (var i = 1; i <= word.length; i++) {
        (function (i) { later(function () { w.textContent = word.slice(0, i); }, start + i * TYPE_WORD); })(i);
      }
      later(function () { w.classList.remove('is-typing'); }, start + word.length * TYPE_WORD + 40);
      t = start + word.length * TYPE_WORD + 70;
    });
    return t - at;
  }

  /* Type a title with a slight human rhythm. Returns how long it takes. */
  function typeTitle(h, at) {
    var full = h.getAttribute('data-full');
    if (reduce) { h.textContent = full; return 0; }
    h.textContent = '';
    var text = document.createTextNode('');
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    h.appendChild(text);
    h.appendChild(caret);
    // A fixed rhythm per title (same every loop): quicker inside words, a beat at spaces.
    var gaps = [], total = 0, seed = full.length * 7;
    for (var i = 0; i < full.length; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      var g = TYPE * (0.65 + (seed / 233280) * 0.6) + (full[i] === ' ' ? TYPE * 1.4 : 0);
      gaps.push(g); total += g;
    }
    var n = 0;
    function step() {
      n += 1;
      text.nodeValue = full.slice(0, n);
      if (n < full.length) typing = setTimeout(step, gaps[n]);
      else later(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 600);
    }
    later(function () { typing = setTimeout(step, gaps[0]); }, at);
    return total;
  }

  /* Lay the note out on one timeline. Returns when everything is written. */
  function writeNote(screen) {
    var t = reduce ? 0 : 180;
    if (screen._panel) later(function () { screen._panel.classList.add('b-in'); }, reduce ? 0 : 60);

    screen._blocks.forEach(function (el) {
      var at = t;
      later(function () { el.classList.add('b-in'); }, at);
      if (reduce) return;

      if (screen._title && el.contains(screen._title)) {
        t += 140 + typeTitle(screen._title, at + 140) + 120;
        return;
      }
      var typed = el.matches('[data-typewords]') ? [el] : Array.prototype.slice.call(el.querySelectorAll('[data-typewords]'));
      if (typed.length) {
        var s2 = at + 160;
        typed.forEach(function (box) { s2 += typeWords(box, s2); });
        t = s2 + 80;
        return;
      }
      var boxes = el.matches('[data-seq]') ? [el] : Array.prototype.slice.call(el.querySelectorAll('[data-seq]'));
      if (boxes.length) {
        var s = at + 200, run = 0;
        boxes.forEach(function (box) {
          var step = (parseInt(box.getAttribute('data-seq'), 10) || 200) * PIECE;
          Array.prototype.forEach.call(box.children, function (c, i) {
            later(function () { c.classList.add('seq-in'); }, s + i * step);
          });
          run = box.children.length * step;
          s += run;
        });
        t = s - run * OVERLAP;
        return;
      }
      t += GAP;
    });

    if (reduce) screen.querySelectorAll('.seq-item').forEach(function (c) { c.classList.add('seq-in'); });
    return t + 250;
  }

  /* ---------- cursors ---------- */
  function Cursor(el) {
    this.el = el;
    this.x = 0; this.y = 0;
    this.ax = el.querySelector('.cursor-x');
    this.ay = el.querySelector('.cursor-y');
  }
  Cursor.prototype.place = function (x, y) {
    cancelAnims(this.ax); cancelAnims(this.ay);
    this.x = x; this.y = y;
    this.ax.style.transform = 'translateX(' + x + 'px)';
    this.ay.style.transform = 'translateY(' + y + 'px)';
    this.el.classList.remove('is-on', 'is-pressing');
  };
  Cursor.prototype.moveTo = function (x, y, ms, sameCurve) {
    var d = Math.hypot(x - this.x, y - this.y);
    ms = ms || Math.round(Math.min(760, 420 + d * 0.32));
    this.ax.animate([{ transform: 'translateX(' + this.x + 'px)' }, { transform: 'translateX(' + x + 'px)' }], { duration: ms, easing: EASE_IN_OUT, fill: 'forwards' });
    this.ay.animate([{ transform: 'translateY(' + this.y + 'px)' }, { transform: 'translateY(' + y + 'px)' }], { duration: ms, easing: sameCurve ? EASE_IN_OUT : EASE_Y, fill: 'forwards' });
    this.x = x; this.y = y;
    return ms;
  };
  Cursor.prototype.press = function (on) { this.el.classList.toggle('is-pressing', on); };
  function cursorOf(screen) {
    var el = screen._cursorEl;
    if (!el) return null;
    if (!el._c) el._c = new Cursor(el);
    return el._c;
  }

  /* Chloe places a sticker in the scrapbook. */
  function placeScene(screen, at) {
    var sticker = screen.querySelector('[data-place]');
    var c = cursorOf(screen);
    if (!sticker || !c) return 0;
    cancelAnims(sticker);
    sticker.style.opacity = '0';
    c.place(1120, 640);
    if (reduce) { later(function () { sticker.style.opacity = '1'; }, at); return 600; }

    var DX = 330, DY = 120, ms = 720;
    later(function () {
      var r = rectIn(screen, sticker);
      var tx = r.x + r.w * 0.45, ty = r.y + r.h * 0.4;
      c.place(tx + DX, ty + DY);
      c.el.classList.add('is-on');
      c.press(true);
      sticker.style.opacity = '1';
      sticker.animate([{ translate: DX + 'px ' + DY + 'px', scale: 1.12 }, { translate: '0px 0px', scale: 1.12 }], { duration: ms, easing: EASE_IN_OUT, fill: 'forwards' });
      c.moveTo(tx, ty, ms, true);
      later(function () {
        c.press(false);
        sticker.animate([{ translate: '0px 0px', scale: 1.12 }, { translate: '0px 0px', scale: 1 }], { duration: 320, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'forwards' });
      }, ms + 40);
      later(function () { c.moveTo(tx - 170, ty - 150); }, ms + 380);
    }, at);
    return ms + 1100;
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
    c.place(760, 640);

    function goLive() {
      btn.classList.remove('is-busy');
      btn.innerHTML = CHECK + 'Updated';
      if (label) label.style.opacity = '1';
      late.forEach(function (el, i) { later(function () { el.classList.add('b-in'); }, i * 260); });
    }
    if (reduce) { later(goLive, at); return 1200; }

    var tx = 0, ty = 0, travel = 0;
    later(function () {
      c.el.classList.add('is-on');
      var b = rectIn(screen, btn);
      tx = b.x + b.w * 0.4; ty = b.y + b.h * 0.55;
      travel = c.moveTo(tx, ty);
      later(function () { c.press(true); btn.classList.add('is-pressed'); }, travel + 60);
      later(function () { c.press(false); btn.classList.remove('is-pressed'); btn.classList.add('is-busy'); btn.textContent = 'Publishing…'; }, travel + 170);
      later(goLive, travel + 820);
      later(function () { c.moveTo(tx - 160, ty + 300); }, travel + 1150);
    }, at);
    return 760 + 2100;
  }

  /* Jake drags a task from Doing to Done; the board rearranges around it, like the real app:
   *  1. lift: a floating copy follows the cursor; the card's own spot stays reserved (invisible)
   *  2. once the copy has clearly left Doing, the spot moves to the end of Done:
   *     the cards below in Doing glide up, Done grows, the canvas eases down
   *  3. drop: the copy lands on the spot and the real card shows again
   *  Every move is a plain transform, which every browser animates the same way. */
  function dragScene(screen, at) {
    var card = screen.querySelector('[data-drag]');
    var c = cursorOf(screen);
    if (!card || !c) return 0;
    var board = card.closest('[data-seq]');
    var doingList = board && board.children[1].children[1];
    var doneList = board && board.children[2].children[1];
    if (!doneList) return 0;
    var count = function (col) { return board.children[col].children[0].querySelector('span[style*="font-weight: 400"]'); };
    var below = board.parentElement.nextElementSibling; // the canvas under the board

    // Back to the start.
    if (screen._ghost) { screen._ghost.remove(); screen._ghost = null; }
    card.style.opacity = '';
    if (card.parentElement !== doingList) doingList.insertBefore(card, doingList.firstChild);
    [card, below].concat(Array.prototype.slice.call(doingList.children), Array.prototype.slice.call(doneList.children)).forEach(function (el) { if (el) { cancelAnims(el); el.style.transition = ''; el.style.transform = ''; } });
    if (count(1)) count(1).textContent = '2';
    if (count(2)) count(2).textContent = '4';
    c.place(1010, 640);
    if (reduce) return 0;

    // FLIP: remember where things are, change the layout, then glide from old to new.
    function flip(els, change, ms) {
      var before = els.map(function (el) { return el ? el.getBoundingClientRect().top : 0; });
      change();
      var k = screen.getBoundingClientRect().width / 1440 || 1;
      els.forEach(function (el, i) {
        if (!el) return;
        var d = (before[i] - el.getBoundingClientRect().top) / k;
        if (Math.abs(d) <= 0.5) return;
        // A plain style transition (not el.animate): Chrome can keep a stale "hidden"
        // on an animated element after its note has been off screen and back.
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + d + 'px)';
        void el.offsetWidth;
        el.style.transition = 'transform ' + ms + 'ms ' + EASE_OUT;
        el.style.transform = '';
        later(function () { el.style.transition = ''; }, ms + 50);
      });
    }

    var DRAG = 700;
    later(function () {
      c.el.classList.add('is-on');
      var from = rectIn(screen, card);
      var grab = { x: from.x + from.w * 0.3, y: from.y + from.h * 0.5 };
      var travel = c.moveTo(grab.x, grab.y);

      // 1. Lift: a copy floats above, the card's spot stays.
      later(function () {
        c.press(true);
        var ghost = card.cloneNode(true);
        ghost.removeAttribute('data-drag');
        ghost.style.cssText += ';position: absolute; margin: 0; z-index: 30; pointer-events: none; left: ' + from.x + 'px; top: ' + from.y + 'px; width: ' + from.w + 'px; box-sizing: border-box;';
        screen.appendChild(ghost);
        screen._ghost = ghost;
        card.style.opacity = '0';
        ghost.animate([{ transform: 'rotate(0deg)', boxShadow: '0 0 0 1px rgba(0,0,0,0.07)' }, { transform: 'rotate(-2.5deg)', boxShadow: '0 0 0 1px rgba(0,0,0,0.07), 0 16px 32px rgba(0,0,0,0.16)' }], { duration: 160, easing: EASE_OUT, fill: 'forwards' });
      }, travel + 60);

      // Where the card will land: just below the last card in Done.
      var dx, dy;
      later(function () {
        var last = rectIn(screen, doneList.lastElementChild);
        dx = last.x - from.x;
        dy = last.y + last.h + 6 - from.y;
        var g = screen._ghost;
        if (g) g.animate([{ transform: 'translate(0px, 0px) rotate(-2.5deg)' }, { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(-2.5deg)' }], { duration: DRAG, easing: EASE_IN_OUT, fill: 'forwards' });
        c.moveTo(grab.x + dx, grab.y + dy, DRAG, true);
      }, travel + 220);

      // 2. The copy has left Doing: the spot moves to Done and the board rearranges.
      later(function () {
        var sibs = Array.prototype.slice.call(doingList.children).filter(function (el) { return el !== card; });
        flip(sibs.concat([below]), function () {
          doneList.appendChild(card);
          if (count(1)) count(1).textContent = '1';
          if (count(2)) count(2).textContent = '5';
        }, 380);
      }, travel + 220 + DRAG * 0.55);

      // 3. Drop: the copy settles, the real card shows.
      later(function () {
        c.press(false);
        var g = screen._ghost;
        if (g) {
          g.animate([{ transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(-2.5deg)' }, { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(0deg)' }], { duration: 160, easing: EASE_OUT, fill: 'forwards' })
            .onfinish = function () { card.style.opacity = ''; g.remove(); if (screen._ghost === g) screen._ghost = null; };
        }
        later(function () { c.moveTo(c.x + 120, c.y + 140); }, 220);
      }, travel + 220 + DRAG + 40);
    }, at);
    return 760 + 1800;
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

    screens.forEach(function (s) {
      if (s !== next && s._cursorEl) { s._cursorEl.classList.remove('is-on', 'is-pressing'); }
    });
    setup(next);
    resetScreen(next);
    void next.offsetWidth;

    if (prev) {
      prev.classList.remove('is-on');
      prev.classList.add('is-leaving');
      later(function () { prev.classList.remove('is-leaving'); }, 450);
    }
    next.classList.add('is-on');

    var written = writeNote(next);
    var scene = publishScene(next, written) || dragScene(next, written) || placeScene(next, written);
    if (!scene) {
      next.querySelectorAll('.b-late').forEach(function (el, i) { later(function () { el.classList.add('b-in'); }, written + i * 300); });
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
