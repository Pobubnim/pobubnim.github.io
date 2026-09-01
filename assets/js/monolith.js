/* monolith.js — движение приборов МОНОЛИТА на сайте.

   Канон движения — MOTION_CHARTER.md приложения, перенесённый один в один:
   вход через signature-кривую, выход короче входа, стаггер 45 мс, бюджет
   стаггер-последовательности ≤500 мс, анимируются ТОЛЬКО transform и opacity,
   системный «убрать анимацию» уважается на уровне хелперов, а не в каждом месте.

   Четыре механизма, больше на странице не нужно:
     1) rise      — вход блоков по стаггеру, когда доехали до экрана;
     2) ring      — отрисовка дуг кольца (reveal 950 мс, единственное медленное);
     3) count     — счётчик денег от 0 к значению (CountUpMoney приложения);
     4) feed      — приезд новой строки в ленту радара: показывает, ЧТО делает
                    продукт, вместо того чтобы это описывать словами.

   Ленты и счётчики живут только пока видны: ушли из вьюпорта или вкладка
   спрятана — таймеры гасим (иначе фоновая вкладка греет процессор впустую). */

(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nbsp = ' ';

  /* ── 1. ВХОД БЛОКОВ ────────────────────────────────────────────────────
     Стаггер 45 мс ведёт первый элемент группы; больше 10 шагов не копим,
     иначе хвост списка ждёт дольше бюджета. */
  function initRise() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-rise]'));
    if (!items.length) return;
    if (reduced) { items.forEach(function (el) { el.classList.add('in'); }); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var step = parseInt(el.getAttribute('data-rise'), 10);
        if (isNaN(step)) step = 0;
        el.style.transitionDelay = Math.min(step, 10) * 45 + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ── 2. КОЛЬЦО ─────────────────────────────────────────────────────────
     Дуга задаётся долей от полного круга. Длина окружности считается из
     радиуса самого элемента: правка радиуса в разметке не требует правки
     кода. Три дуги различаются цветом, толщиной и радиусом — это требование
     приёмки, а не украшение (урок №196: две одинаковые дуги в 4 px друг от
     друга читаются одной толстой). */
  function initRings() {
    var arcs = Array.prototype.slice.call(document.querySelectorAll('.mo-arc'));
    if (!arcs.length) return;

    arcs.forEach(function (arc) {
      var r = parseFloat(arc.getAttribute('r'));
      var len = 2 * Math.PI * r;
      var part = parseFloat(arc.getAttribute('data-part'));   /* 0..1 от круга */
      if (isNaN(part)) part = 0;
      part = Math.max(0, Math.min(1, part));
      arc.style.setProperty('--len', len.toFixed(2));
      arc.style.setProperty('--off', (len * (1 - part)).toFixed(2));
      arc.setAttribute('stroke-dasharray', len.toFixed(2));
      arc.setAttribute('stroke-dashoffset', len.toFixed(2));
    });

    if (reduced) { arcs.forEach(function (a) { a.classList.add('in'); }); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var arc = entry.target;
        var delay = parseInt(arc.getAttribute('data-delay'), 10) || 0;
        setTimeout(function () { arc.classList.add('in'); }, delay);
        io.unobserve(arc);
      });
    }, { threshold: 0.3 });

    arcs.forEach(function (a) { io.observe(a); });
  }

  /* ── 3. СЧЁТЧИК ────────────────────────────────────────────────────────
     Число едет от нуля к значению за 950 мс. Разряды отбиваются неразрывным
     пробелом, цифры табличные — строка не дёргается по ширине. */
  function formatMoney(v) {
    return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, nbsp);
  }

  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    if (reduced) { el.textContent = formatMoney(target); return; }

    var dur = parseInt(el.getAttribute('data-dur'), 10) || 950;
    var start = null;

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      /* та же signature-кривая, что у входов: быстрый разгон, мягкая посадка */
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatMoney(target * eased);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = formatMoney(target);
    }
    requestAnimationFrame(frame);
  }

  function initCounts() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!els.length) return;
    els.forEach(function (el) { el.textContent = reduced ? formatMoney(parseFloat(el.getAttribute('data-count')) || 0) : '0'; });
    if (reduced) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── 4. ЛЕНТА РАДАРА ───────────────────────────────────────────────────
     Живая демонстрация: раз в несколько секунд сверху приезжает новая
     заявка, нижняя уходит. Показывает работу продукта без единого слова.
     Данные — образцы формулировок из живых лент (Telegram, hh.ru, FL.ru,
     Авито), суммы округлены: это витрина, а не выгрузка чужих объявлений. */
  var FEED = [
    { g: 'TG', c: '', t: 'Ищу оператора на смену, Москва, 3 сентября', m: 'Telegram · смены', v: '18 000' },
    { g: 'HH', c: 'hh', t: 'Видеооператор в медиацентр, проектная занятость', m: 'hh.ru · вакансия', v: '170 000' },
    { g: 'TG', c: '', t: 'Нужен монтажёр вертикалок, 4 ролика в неделю', m: 'Telegram · монтаж', v: '40 000' },
    { g: 'FL', c: 'fl', t: 'Цветокоррекция короткометражки, DaVinci', m: 'FL.ru · цветокор', v: '25 000' },
    { g: 'AV', c: 'av', t: 'Съёмка конференции, два дня, свой свет', m: 'Авито · событийка', v: '60 000' },
    { g: 'TG', c: '', t: 'Второй оператор на свадьбу, Наро-Фоминск', m: 'Telegram · смены', v: '22 000' },
    { g: 'HH', c: 'hh', t: 'Моушен-дизайнер на серию роликов, удалённо', m: 'hh.ru · вакансия', v: '90 000' },
    { g: 'TG', c: '', t: 'Ищем гаффера на съёмку рекламы, 2 смены', m: 'Telegram · смены', v: '35 000' }
  ];

  function feedRow(item, fresh) {
    var row = document.createElement('div');
    row.className = 'mo-feed-row' + (fresh ? ' fresh arriving' : '');
    row.innerHTML =
      '<span class="mo-glyph ' + item.c + '">' + item.g + '</span>' +
      '<span class="txt"><b></b><span></span></span>' +
      '<span class="when">' + (fresh ? 'сейчас' : 'сегодня') + '</span>' +
      '<span class="money num"></span>';
    /* текст ставим через textContent: строки ленты — данные, не разметка */
    row.querySelector('.txt b').textContent = item.t;
    row.querySelector('.txt span').textContent = item.m;
    row.querySelector('.money').textContent = item.v + nbsp + '₽';
    return row;
  }

  function initFeed() {
    var box = document.querySelector('[data-feed]');
    if (!box) return;

    var max = parseInt(box.getAttribute('data-feed'), 10) || 5;
    var counter = document.querySelector('[data-feed-count]');
    var total = counter ? parseInt(counter.getAttribute('data-feed-count'), 10) || 0 : 0;
    var i = 0;

    /* стартовая лента: заполняем сразу, пустой блок на экране — дефект */
    for (; i < max; i++) box.appendChild(feedRow(FEED[i % FEED.length], false));
    if (counter) counter.textContent = formatMoney(total);
    if (reduced) return;

    var timer = null;
    var visible = false;

    function tick() {
      var item = FEED[i % FEED.length];
      i++;
      var row = feedRow(item, true);
      box.insertBefore(row, box.firstChild);
      while (box.children.length > max) box.removeChild(box.lastChild);
      /* «сейчас» держится один такт: следующая строка отбирает свежесть */
      setTimeout(function () {
        row.classList.remove('fresh');
        var when = row.querySelector('.when');
        if (when) when.textContent = 'сегодня';
      }, 3600);
      if (counter) {
        total++;
        counter.textContent = formatMoney(total);
      }
    }

    function start() {
      if (timer || !visible || document.hidden) return;
      timer = setInterval(tick, 4200);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }

    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.25 });
    io.observe(box);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  function boot() {
    initRise();
    initRings();
    initCounts();
    initFeed();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
