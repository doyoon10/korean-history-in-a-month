/* 한능검 심화 31일 완성 — 앱 로직 */
(function () {
  "use strict";

  // ---------- 저장소 ----------
  var KEY = "hanneung_v1";
  var S = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { done: {}, stats: {}, wrong: [], seen: {} };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  // ---------- 유틸 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // **굵게** 만 마크업 허용
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  // ---------- 용어 풀이 ----------
  var GLOSS = window.GLOSSARY || {};
  var glossRe = (function () {
    var keys = Object.keys(GLOSS).filter(function (k) { return k.length >= 2; });
    if (!keys.length) return null;
    keys.sort(function (a, b) { return b.length - a.length; });
    return new RegExp(keys.map(function (k) { return esc(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g");
  })();

  // 시대별 풀이가 따로 있으면 그 시대 것만 쓴다
  function glossFor(term, era) {
    var v = GLOSS[term];
    if (!v) return null;
    if (typeof v === "string") return v;
    return v[era] || v["*"] || null;
  }
  // "종류|쉬운 뜻" → {type, desc}
  function splitDef(s) {
    var i = s.indexOf("|");
    return i < 0 ? { type: "", desc: s } : { type: s.slice(0, i), desc: s.slice(i + 1) };
  }
  // 라벨에 들어 있는 풀이 용어 중 가장 긴 것 (라벨 자체가 용어면 그것)
  function glossInLabel(label, era) {
    if (glossFor(label, era)) return label;
    var best = null;
    if (glossRe) label.replace(glossRe, function (m, at, str) {
      if (!/[가-힣0-9]/.test(str.charAt(at - 1)) && glossFor(m, era) && (!best || m.length > best.length)) best = m;
      return m;
    });
    return best;
  }
  // 괄호 속 시험용 조각을 읽기 쉽게: 1398 → 1398년, 4C → 4세기, BC 2333 → 기원전 2333년
  function readable(t) {
    return t.replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?!\d)/g, "$1년 $2월 $3일")
      .replace(/(\d{4})\.(\d{1,2})(?![\d.])/g, "$1년 $2월")
      .replace(/\bBC\s?(\d+)C\b/g, "기원전 $1세기")
      .replace(/\bBC\s?(\d+)/g, "기원전 $1년")
      .replace(/(\d+)C(?![a-zA-Z])/g, "$1세기")
      .replace(/(^|[^\d.~년])(\d{3,4})(?=$|[\s,·)~\-])/g, "$1$2년")
      .replace(/(\d+)s(?![a-zA-Z])/g, "$1년대");
  }

  // fmt()를 거친 HTML에서 용어를 찾아 풀이 표시를 붙인다. seen에 있는 용어는 건너뛴다(주제당 한 번)
  function linkTerms(html, era, seen) {
    if (!glossRe) return html;
    return html.split(/(<[^>]+>)/).map(function (seg) {
      if (seg.charAt(0) === "<") return seg;
      return seg.replace(glossRe, function (m, at, str) {
        // '불국사'의 '국사'처럼 단어 중간에서 걸린 경우는 제외
        if (/[가-힣0-9]/.test(str.charAt(at - 1))) return m;
        if (seen[m] || !glossFor(m, era)) return m;
        seen[m] = 1;
        return '<span class="term" tabindex="0" data-term="' + m + '" data-era="' + era + '">' + m + "</span>";
      });
    }).join("");
  }

  // ---------- 사진 ----------
  // named=false면 문제용: 이름을 숨기고 출처만 보여 준다
  function figureHtml(id, named) {
    var im = (window.IMAGES || {})[id];
    if (!im) return "";
    var img = '<img src="' + esc(im.src) + '" width="' + im.w + '" height="' + im.h + '" alt="' +
      (named ? esc(im.name) : "문제 자료 사진") + '" loading="lazy" referrerpolicy="no-referrer"' +
      " onerror=\"this.closest('figure').hidden=true\">";
    return '<figure class="photo">' +
      (named ? '<a class="photo-img" href="' + esc(im.src) + '" target="_blank" rel="noopener">' + img + "</a>" : '<div class="photo-img">' + img + "</div>") +
      "<figcaption>" + (named ? '<span class="photo-name">' + esc(im.name) + "</span>" : "") +
      '<a class="photo-credit" href="' + esc(im.page) + '" target="_blank" rel="noopener">' + esc(im.credit) + "</a>" +
      "</figcaption></figure>";
  }
  var IMAGES_BY_TOPIC = (function () {
    var m = {};
    Object.keys(window.IMAGES || {}).forEach(function (id) {
      var t = window.IMAGES[id].topic;
      (m[t] = m[t] || []).push(id);
    });
    return m;
  })();

  function initGlossary() {
    var pop = document.createElement("div");
    pop.id = "gloss-pop";
    pop.setAttribute("role", "tooltip");
    pop.hidden = true;
    document.body.appendChild(pop);
    var cur = null;

    // 용어(.term) 또는 개념 정리의 파란 풀이 단어(.nt-note, 펼치기 모드가 아닐 때)
    function target(node) {
      if (!node || !node.closest) return null;
      var t = node.closest(".term");
      if (t) return isMasked(t) ? null : t;
      var n = node.closest(".nt-note, .nt-mark");
      return n && !n.closest(".notes-open") && !isMasked(n) ? n : null;
    }
    // 본문 밑줄 단어는 같은 불릿의 짝 풀이를 보여 준다
    function noteOf(el) {
      if (el.classList.contains("nt-note")) return el;
      var li = el.closest("li.nt");
      return li && li.querySelector('.nt-note[data-k="' + el.dataset.k + '"]');
    }
    function show(el) {
      var title, type = "", desc = "", detail = "";
      var note = (el.classList.contains("nt-note") || el.classList.contains("nt-mark")) && noteOf(el);
      if (note) {
        title = note.dataset.label;
        type = note.querySelector(".nt-type").textContent;
        desc = note.querySelector(".nt-desc").textContent;
        detail = note.querySelector(".nt-detail").textContent;
      } else {
        var d = glossFor(el.dataset.term, el.dataset.era);
        if (!d) return;
        d = splitDef(d);
        title = el.dataset.term; type = d.type; desc = d.desc;
      }
      if (!desc && !detail) return;
      cur = el;
      // 첫 줄은 필기에 그대로 옮겨 적는 모양: 단어(괄호 내용). 괄호가 없던 단어는 쉬운 뜻을 괄호에 넣는다
      var pen = detail || desc;
      pop.innerHTML = '<div class="gp-head">' + (type ? '<span class="gp-type">' + esc(type) + "</span>" : "") +
        '<span class="gp-title">' + esc(title) + '<span class="gp-paren">(' + esc(pen) + ")</span></span></div>" +
        (detail && desc ? '<div class="gp-desc">' + esc(desc) + "</div>" : "");
      pop.style.left = "0px";
      pop.style.top = "0px";
      pop.hidden = false;
      var r = el.getBoundingClientRect();
      var w = pop.offsetWidth, h = pop.offsetHeight;
      var vw = document.documentElement.clientWidth;
      var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
      var top = r.bottom + 8;
      if (top + h > window.innerHeight - 8 && r.top - h - 8 > 0) top = r.top - h - 8;
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
    function hide() { cur = null; pop.hidden = true; }

    document.addEventListener("mouseover", function (e) {
      var t = target(e.target);
      if (t && t !== cur) show(t);
      else if (!t && cur) hide();
    });
    document.addEventListener("focusin", function (e) {
      var t = target(e.target);
      if (t === e.target) show(t);
    });
    document.addEventListener("focusout", function (e) {
      if (e.target === cur) hide();
    });
    // 터치 기기: 탭으로 열고 다른 곳을 탭하면 닫기
    document.addEventListener("click", function (e) {
      var t = target(e.target);
      if (t) show(t);
      else if (cur) hide();
    }, true);
    window.addEventListener("scroll", hide, { passive: true });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function daysBetween(a, b) {
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  }

  var ERA_NAMES = {};
  (window.CONCEPTS || []).forEach(function (e) { ERA_NAMES[e.id] = e.name; });

  // ---------- D-day / 통계 ----------
  function renderDday() {
    var left = daysBetween(todayStr(), window.EXAM_DATE);
    var el = $("#dday .dday-num");
    el.textContent = left > 0 ? "D-" + left : (left === 0 ? "D-DAY" : "종료");
    $("#stat-days").textContent = left > 0 ? left + "일" : "0일";

    var topics = 0;
    (window.CONCEPTS || []).forEach(function (e) { topics += e.topics.length; });
    $("#stat-topics").textContent = topics + "개";
    $("#stat-quiz").textContent = (window.QUIZ || []).length + "문항";
    $("#stat-solved").textContent = Object.keys(S.seen).length + "문항";
  }

  // ---------- 탭 ----------
  // 휴대폰에서는 머리줄이 화면 위에 붙어 있어 그만큼 비켜 둔다. 넓은 화면은 메뉴가 왼쪽이라 0
  function topbarH() {
    var side = $(".side");
    return side && getComputedStyle(side).display === "contents" ? $(".topbar").offsetHeight : 0;
  }
  function setTopbarH() {
    document.documentElement.style.setProperty("--topbar-h", topbarH() + "px");
  }
  function initTabs() {
    setTopbarH();
    var rt = null;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(setTopbarH, 100); });
    $$("#tabs .tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showView(btn.dataset.view);
      });
    });
  }
  function showView(name) {
    $$("#tabs .tab").forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
    $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + name); });
    window.scrollTo(0, 0);
    if (name === "dash") renderDash();
    if (name === "wrong") renderWrong();
    if (name === "analysis") renderAnalysis();
    if (name === "quiz") renderAdaptiveCard();
    if (name === "concept") { if (wrongOn) renderConcept(); else paintModes(); }
    if (name !== "mock") { pauseMock(); return stopMockTimer(); }
    // 푸는 중이면 멈춘 상태 그대로 보여 주고(시작은 직접 누른다), 결과 화면은 그대로 두고, 나머지는 회차 목록을 새로 그린다
    if (!$("#mock-run").classList.contains("hidden") && mockState().cur) {
      paintMockGate(); stopMockTimer(); mockTimer = setInterval(tickMock, 1000);
    } else if ($("#mock-result").classList.contains("hidden")) renderMockPick();
  }

  // ---------- 대시보드 ----------
  function renderDash() {
    renderDday();
    renderToday();
    renderProgress();
    renderAccuracy();
  }

  // 진도 기준: 현재 코스에서 아직 체크하지 않은 가장 이른 날
  function courseDays() {
    return window.PLAN.filter(function (p) { return S.course !== "core" || p.core; });
  }
  function currentPlan() {
    var days = courseDays();
    for (var i = 0; i < days.length; i++) if (!S.done[days[i].day]) return days[i];
    return days[days.length - 1];
  }
  function calendarDay() {
    var d = daysBetween(window.PLAN_START, todayStr()) + 1;
    return Math.max(1, Math.min(window.PLAN.length, d));
  }
  function scheduleNote(p) {
    var cal = calendarDay();
    var behind = courseDays().filter(function (d) { return d.day < cal && !S.done[d.day]; }).length;
    if (behind > 0) return "달력으로는 DAY " + cal + " 차례입니다. " + behind + "일 밀려 있어요.";
    if (p.day > cal) return "일정보다 앞서 있습니다.";
    return "";
  }

  // 출제 범위: 그날 주제만 / 1일차부터 그날까지 누적
  function conceptsUpTo(day) {
    var out = [];
    window.PLAN.forEach(function (p) { if (p.day <= day) out = out.concat(p.concepts); });
    return out;
  }
  function dayFilter(p) {
    return { concepts: p.concepts.length ? p.concepts : conceptsUpTo(p.day) };
  }
  function learnedFilter(p) {
    return { concepts: conceptsUpTo(p.day) };
  }
  function countFor(filter) { return pickQuestions(filter, 0).length; }

  // ---------- 진도 몰아치기: 정한 날까지 진도 끝내기 ----------
  // 남은 진도(새 개념이 있는 날)를 오늘부터 마감일까지 날짜별로 고르게 나눈 일정표를 만든다.
  // S.sprint = { end, startSet, from: 나누기 시작한 날, course, on: 마지막으로 정리한 날, late: [밀린 날 번호], plan: { 날짜: [날 번호] } }
  // 시작하는 날(S.sprintStart)을 정하면 그날부터, 안 정하면 오늘부터 나눈다
  // 날이 바뀌면 지난 날짜에 못 끝낸 것을 late로 옮겨 "밀림"으로 보여 준다
  function sprintEnd() { return S.sprintEnd || ""; }
  function sprintStart() { return S.sprintStart || ""; }
  function sprintOn() { return !!sprintEnd(); }
  function studyLeft() {
    return courseDays().filter(function (p) { return p.concepts.length && !S.done[p.day]; });
  }
  // useStart: 정해 둔 시작하는 날이 이미 지났어도 그날부터 나눈다 (그 사이 몫은 밀린 것이 된다).
  // 다시 나누기나 마감 늦추기처럼 오늘 기준으로 새로 짤 때는 지난 시작일을 쓰지 않는다
  function buildSprint(late, useStart) {
    var t = todayStr(), st = sprintStart();
    var from = st && (useStart || st > t) ? st : t;
    var end = sprintEnd() < from ? from : sprintEnd();
    late = late || [];
    var left = studyLeft().map(function (p) { return p.day; }).filter(function (d) { return late.indexOf(d) === -1; });
    var n = daysBetween(from, end) + 1, plan = {}, at = 0;
    for (var i = 0; i < n; i++) {
      var size = Math.ceil((left.length - at) / (n - i));
      if (size > 0) plan[addDays(from, i)] = left.slice(at, at + size);
      at += size;
    }
    S.sprint = { end: sprintEnd(), startSet: st, from: from, course: S.course || "all", on: t, late: late, plan: plan };
    save();
  }
  function sprintState() {
    var t = todayStr(), sp = S.sprint, course = S.course || "all";
    if (!sp || !sp.plan || sp.end !== sprintEnd() || sp.course !== course || (sp.startSet || "") !== sprintStart()) {
      // 예전 형식(그날 몫만 저장)에서 넘어올 때: 지난 날짜의 몫 중 못 끝낸 것은 밀린 것으로 본다
      var old = [];
      if (sp && !sp.plan && sp.days && sp.date < t && sp.end === sprintEnd() && sp.course === course) {
        old = sp.days.filter(function (d) { return !S.done[d]; });
      }
      buildSprint(old, false);
      sp = S.sprint;
    }
    // 날이 바뀌면 어제까지 밀렸다가 끝낸 것은 목록에서 내린다
    var late = sp.late || [], changed = false;
    if (sp.on !== t) {
      late = late.filter(function (d) { return !S.done[d]; });
      sp.on = t; changed = true;
    }
    // 지난 날짜에 못 끝낸 몫은 밀린 것으로 옮긴다
    Object.keys(sp.plan).forEach(function (d) {
      if (d >= t) return;
      sp.plan[d].forEach(function (x) { if (!S.done[x] && late.indexOf(x) === -1) late.push(x); });
      delete sp.plan[d];
      changed = true;
    });
    if (changed) { sp.late = late.sort(function (a, b) { return a - b; }); save(); }
    // 일정표에 없는 남은 진도(완료를 다시 푼 날 등)는 오늘 몫에 넣는다
    var have = {};
    (sp.late || []).forEach(function (d) { have[d] = true; });
    Object.keys(sp.plan).forEach(function (k) { sp.plan[k].forEach(function (d) { have[d] = true; }); });
    var missing = studyLeft().map(function (p) { return p.day; }).filter(function (d) { return !have[d]; });
    if (missing.length) {
      sp.plan[t] = (sp.plan[t] || []).concat(missing).sort(function (a, b) { return a - b; });
      save();
    }
    return sp;
  }
  function sprintLate() { return (sprintState().late || []).map(planByDay).filter(Boolean); }
  // 오늘 할 것 전부: 밀린 것 + 오늘 몫
  function sprintBatch() {
    var sp = sprintState();
    return (sp.late || []).concat(sp.plan[todayStr()] || []).map(planByDay).filter(Boolean);
  }
  // 오늘 다음으로 잡혀 있는 몫 (보통 내일)
  function sprintNext() {
    var sp = sprintState(), t = todayStr();
    var dates = Object.keys(sp.plan).filter(function (d) { return d > t && sp.plan[d].length; }).sort();
    return dates.length ? { date: dates[0], days: sp.plan[dates[0]].map(planByDay).filter(Boolean) } : null;
  }
  // 다음 몫을 오늘로 당겨 온다
  function sprintMore() {
    var sp = sprintState(), t = todayStr(), nx = sprintNext();
    if (!nx) return;
    sp.plan[t] = (sp.plan[t] || []).concat(sp.plan[nx.date]);
    delete sp.plan[nx.date];
    save();
  }
  // 마감일을 하루 늦추고 남은 진도를 다시 나눈다
  function sprintExtend() {
    var t = todayStr(), end = sprintEnd();
    S.sprintEnd = addDays(end < t ? t : end, 1);
    buildSprint([], false);
  }
  // 오늘 볼 범위를 하루치처럼 묶은 것 (몰아치기 중이면 여러 날이 한 묶음)
  function todayPlan() {
    if (!sprintOn()) return currentPlan();
    var b = sprintBatch();
    if (!b.length) return currentPlan();
    if (b.length === 1) return b[0];
    var ids = [];
    b.forEach(function (p) { ids = ids.concat(p.concepts); });
    return { day: b[0].day + "~" + b[b.length - 1].day, batch: b, first: b[0].day, last: b[b.length - 1].day,
      title: "오늘 몫 · " + b.length + "일 치", date: todayStr().slice(5), concepts: ids, todo: [], time: "" };
  }
  function todayDays() { var p = todayPlan(); return p.batch || [p]; }
  function todayLastDay() { var p = todayPlan(); return p.last || p.day; }
  function dateLabel(d) {
    return (+d.slice(5, 7)) + "." + d.slice(8) + "(" + "일월화수목금토".charAt(new Date(d + "T00:00:00").getDay()) + ")";
  }
  function initSprint() {
    // 기본 마감일이 아직 안 지났으면 켜 둔다. 기본 마감일이 바뀌면 따라가되, 직접 고른 날짜는 건드리지 않는다
    var def = window.SPRINT_END || "", prev = S.sprintDefault || "2026-10-05";
    if (S.sprintEnd === undefined || (def !== prev && S.sprintEnd === prev)) {
      S.sprintEnd = def && todayStr() <= def ? def : "";
      S.sprint = null;
    }
    S.sprintDefault = def;
    save();
  }

  var sprintPeek = false;
  function sprintRow(p, late) {
    var done = !!S.done[p.day];
    return '<li class="sp-item' + (done ? " done" : "") + '">' +
      '<button class="plan-check' + (done ? " on" : "") + '" data-sp-check="' + p.day + '" aria-label="DAY ' + p.day + ' 완료 표시">' + (done ? "✓" : "") + "</button>" +
      '<span class="sp-day">DAY ' + p.day + "</span>" +
      '<span class="sp-title">' + (late ? '<span class="badge-late">밀림</span>' : "") + esc(p.title) + " <small>주제 " + p.concepts.length + "</small></span>" +
      '<button class="mini" data-sp-concept="' + p.day + '">개념</button>' +
      '<button class="mini" data-sp-quiz="' + p.day + '">문제</button></li>';
  }

  function renderSprintToday() {
    var box = $("#today-box"), t = todayStr(), end = sprintEnd(), left = studyLeft();
    var lateList = sprintLate(), batch = sprintBatch(), nx = sprintNext();
    var lateIds = lateList.map(function (p) { return p.day; });
    var lateLeft = lateList.filter(function (p) { return !S.done[p.day]; }).length;
    var dleft = daysBetween(t, end), examLeft = Math.max(0, daysBetween(t, window.EXAM_DATE));
    var total = courseDays().filter(function (p) { return p.concepts.length; }).length;
    var allDone = batch.every(function (p) { return S.done[p.day]; });

    if (!left.length) {
      box.innerHTML =
        '<div class="today-day">진도 끝 · 시험까지 ' + examLeft + "일</div>" +
        '<div class="today-title">이제 실전과 약점만 돌립니다</div>' +
        '<ul class="today-todo"><li>실전 기출 한 회(80분)를 이틀에 한 번</li><li>맞춤 10문제는 매일</li>' +
        "<li>약점 분석 1순위 시대 개념을 다시 읽기</li><li>시험 전날은 오답 노트와 연표만</li></ul>" +
        '<div class="today-actions"><button class="mini adapt-btn" id="sp-adapt">맞춤 10문제</button>' +
        '<button class="mini" data-sp-view="mock">실전 기출</button><button class="mini" data-sp-view="analysis">약점 분석</button></div>';
    } else {
      var topics = 0, ids = [], remainTopics = 0;
      batch.forEach(function (p) {
        topics += p.concepts.length; ids = ids.concat(p.concepts);
        if (!S.done[p.day]) remainTopics += p.concepts.length;
      });
      var doneDays = total - left.length, pct = Math.round(doneDays / total * 100);
      var st = sprintStart(), notYet = st > t;
      var when = notYet ? dateLabel(st) + "에 시작 · " + dateLabel(end) + "까지"
        : dleft > 0 ? "마감 " + dateLabel(end) + "까지 오늘 포함 " + (dleft + 1) + "일" : dleft === 0 ? "오늘 " + dateLabel(end) + "이 마감" : "마감 " + dateLabel(end) + "이 " + (-dleft) + "일 지남";
      var lateNote = "";
      if (lateLeft) {
        lateNote = '<div class="late-note"><b>진도가 ' + lateLeft + "일 치 밀렸습니다.</b> 지난 날짜에 못 끝낸 몫이라 아래 목록 맨 위에 '밀림'으로 올려 두었습니다." +
          '<div class="late-acts">' +
          (dleft > 0 ? '<button class="mini" id="sp-redo">남은 날에 다시 나누기</button>' : "") +
          '<button class="mini" id="sp-extend">마감 하루 늦추기</button></div></div>';
      }
      var peek = "";
      if (sprintPeek) {
        peek = '<div class="sp-peek">' + (nx
          ? '<div class="sp-peek-head"><b>' + (nx.date === addDays(t, 1) ? "내일" : "다음") + " 몫 · " + dateLabel(nx.date) + "</b><small>" + nx.days.length + "일 치 · 주제 " +
            nx.days.reduce(function (n, p) { return n + p.concepts.length; }, 0) + '개</small><button class="mini" id="sp-more">오늘로 당겨 오기</button></div>' +
            '<ul class="sprint-list">' + nx.days.map(function (p) {
              return '<li class="sp-item"><span class="sp-day">DAY ' + p.day + '</span><span class="sp-title">' + esc(p.title) + " <small>주제 " + p.concepts.length + "</small></span>" +
                '<button class="mini" data-sp-concept="' + p.day + '">개념</button></li>';
            }).join("") + "</ul>"
          : '<p class="sp-peek-empty">' + (dleft > 0 ? "내일로 잡힌 몫이 없습니다. 남은 진도는 모두 오늘 몫에 들어 있습니다."
            : "오늘이 마감이라 내일 몫이 없습니다. 오늘 다 못 하면 내일 '밀림'으로 넘어갑니다. 여유를 두려면 마감을 늦추세요.") +
            (dleft <= 0 ? ' <button class="mini" id="sp-extend2">마감 하루 늦추기</button>' : "") + "</p>") + "</div>";
      }
      box.innerHTML =
        '<div class="today-day">진도 몰아치기 · ' + when + "</div>" +
        '<div class="today-title">오늘 할 몫 ' + batch.length + "일 치 <small>" +
        (lateList.length ? "밀린 " + lateList.length + " + 오늘 " + (batch.length - lateList.length) + " · " : "") + "주제 " + topics + "개</small></div>" +
        '<div class="prog-row"><div class="prog-label"><span>전체 진도</span><small>' + doneDays + " / " + total + "일 치 · 남은 " + left.length + '일 치</small></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        lateNote +
        (batch.length ? '<ul class="sprint-list">' + batch.map(function (p) { return sprintRow(p, lateIds.indexOf(p.day) !== -1); }).join("") + "</ul>"
          : '<p class="sp-peek-empty">' + (notYet ? "아직 시작 전입니다. " + dateLabel(st) + "부터 하루 몫이 뜹니다. 미리 하려면 아래 '내일 진도 보기'에서 당겨 오세요."
            : "오늘로 잡힌 몫이 없습니다. 아래에서 다음 몫을 당겨 올 수 있습니다.") + "</p>") +
        (batch.length ? '<p class="today-note">' + (allDone ? "오늘 몫을 다 끝냈습니다. 더 할 수 있으면 내일 몫을 당겨 오세요."
          : "한 줄씩: 개념 → 문제 10개 → 체크. 남은 주제 " + remainTopics + "개, 읽기만 약 " + (remainTopics * 8) + "분입니다.") + "</p>" : "") +
        '<div class="today-actions">' +
        (batch.length ? '<button class="mini" id="sp-read">오늘 몫 개념 이어 보기</button>' +
          '<button class="mini" id="sp-quiz">오늘 몫 문제 20개 <small>새 ' + countUnseen({ concepts: ids }) + "</small></button>" : "") +
        '<button class="mini adapt-btn" id="sp-adapt">맞춤 10문제' + (dueIds().length ? " <small>복습 " + dueIds().length + "</small>" : "") + "</button>" +
        '<button class="mini' + (sprintPeek ? " active" : "") + '" id="sp-peek">' + (sprintPeek ? "내일 진도 접기" : "내일 진도 보기") + "</button></div>" + peek;
      if (batch.length) {
        $("#sp-read").addEventListener("click", function () { showView("concept"); showRange("today"); });
        $("#sp-quiz").addEventListener("click", function () { startQuizFor({ concepts: ids }, 20, "study"); });
      }
      $("#sp-peek").addEventListener("click", function () { sprintPeek = !sprintPeek; renderToday(); });
      var again = function () { renderToday(); renderPlan(); renderConcept(); };
      var more = $("#sp-more");
      if (more) more.addEventListener("click", function () { sprintMore(); again(); });
      var redo = $("#sp-redo");
      if (redo) redo.addEventListener("click", function () { buildSprint([], false); again(); });
      ["#sp-extend", "#sp-extend2"].forEach(function (id) {
        var b = $(id);
        if (b) b.addEventListener("click", function () { sprintExtend(); again(); });
      });
    }
    $("#sp-adapt").addEventListener("click", function () { startAdaptive(10); });
    $$("[data-sp-view]", box).forEach(function (b) { b.addEventListener("click", function () { showView(b.dataset.spView); }); });
    $$("[data-sp-check]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.dataset.spCheck;
        S.done[d] = !S.done[d]; save(); renderToday(); renderProgress(); renderPlan();
      });
    });
    $$("[data-sp-concept]", box).forEach(function (b) {
      b.addEventListener("click", function () { openConceptFor(planByDay(b.dataset.spConcept)); });
    });
    $$("[data-sp-quiz]", box).forEach(function (b) {
      b.addEventListener("click", function () { startQuizFor(dayFilter(planByDay(b.dataset.spQuiz)), 10, "study"); });
    });
  }

  function renderToday() {
    if (sprintOn()) return renderSprintToday();
    var p = currentPlan();
    var box = $("#today-box");
    if (!p) { box.innerHTML = '<p class="empty">플랜 기간이 아닙니다.</p>'; return; }
    var isDone = !!S.done[p.day];
    var note = scheduleNote(p);
    var nDay = countFor(dayFilter(p)), nAll = countFor(learnedFilter(p));
    var uDay = countUnseen(dayFilter(p)), uAll = countUnseen(learnedFilter(p));
    box.innerHTML =
      '<div class="today-day">DAY ' + p.day + " · " + p.date + " · 권장 " + esc(p.time) + "</div>" +
      '<div class="today-title">' + esc(p.title) + "</div>" +
      '<ul class="today-todo">' + p.todo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      (note ? '<p class="today-note">' + esc(note) + "</p>" : "") +
      '<div class="today-actions">' +
      '<button class="mini' + (isDone ? " active" : "") + '" id="today-done">' + (isDone ? "완료함" : "완료 표시") + "</button>" +
      (p.concepts.length ? '<button class="mini" id="today-concept">개념 보기</button>' : "") +
      (p.concepts.length ? '<button class="mini" id="today-quiz">오늘 범위 문제 ' + nDay + " <small>새 " + uDay + "</small></button>" : "") +
      '<button class="mini" id="today-learned">배운 범위 누적 ' + nAll + " <small>새 " + uAll + "</small></button>" +
      '<button class="mini adapt-btn" id="today-adapt">맞춤 10문제' + (dueIds().length ? " <small>복습 " + dueIds().length + "</small>" : "") + "</button>" +
      "</div>";

    $("#today-done").addEventListener("click", function () {
      S.done[p.day] = !S.done[p.day]; save(); renderToday(); renderProgress(); renderPlan();
    });
    var cbtn = $("#today-concept");
    if (cbtn) cbtn.addEventListener("click", function () { openConceptFor(p); });
    var qbtn = $("#today-quiz");
    if (qbtn) qbtn.addEventListener("click", function () { startQuizFor(dayFilter(p), 10, "study"); });
    $("#today-learned").addEventListener("click", function () { startQuizFor(learnedFilter(p), 10, "study"); });
    $("#today-adapt").addEventListener("click", function () { startAdaptive(10); });
  }

  function renderProgress() {
    var planDone = Object.keys(S.done).filter(function (k) { return S.done[k]; }).length;
    var planPct = Math.round(planDone / window.PLAN.length * 100);

    var total = (window.QUIZ || []).length;
    var seen = Object.keys(S.seen).length;
    var quizPct = total ? Math.round(seen / total * 100) : 0;

    var ok = 0, all = 0;
    Object.keys(S.stats).forEach(function (k) { ok += S.stats[k].ok; all += S.stats[k].n; });
    var accPct = all ? Math.round(ok / all * 100) : 0;

    $("#progress-box").innerHTML =
      row("학습 플랜", planDone + " / " + window.PLAN.length + "일", planPct) +
      row("문제 진도", seen + " / " + total + "문항", quizPct) +
      row("전체 정답률", ok + " / " + all + "문항", accPct) +
      '<p style="font-size:13px;color:var(--ink-soft);margin:14px 0 0">' +
      (accPct >= 80 ? "1급 안정권입니다. 이 페이스를 유지하세요."
        : accPct >= 70 ? "2급 안정권. 근현대 정답률을 끌어올리면 1급이 보입니다."
        : accPct >= 60 ? "3급 안정권. 오답 노트를 두 번씩 도세요."
        : all === 0 ? "아직 푼 문제가 없습니다. 오늘 범위부터 10문항 풀어보세요."
        : "개념을 한 번 더 보고 같은 범위를 반복하세요.") + "</p>";

    function row(label, sub, pct) {
      return '<div class="prog-row"><div class="prog-label"><span>' + label +
        "</span><small>" + sub + " · " + pct + '%</small></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }
  }

  function renderAccuracy() {
    var box = $("#accuracy-box");
    var eras = (window.CONCEPTS || []).map(function (e) { return e; });
    var html = eras.map(function (e) {
      var st = S.stats[e.id] || { ok: 0, n: 0 };
      var pct = st.n ? Math.round(st.ok / st.n * 100) : 0;
      var color = st.n === 0 ? "var(--ink-soft)" : pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--orange)" : "var(--bad)";
      return '<div class="acc-item"><span class="acc-name">' + esc(e.short) + "</span>" +
        '<div class="bar"><i style="width:' + pct + "%;background:" + color + '"></i></div>' +
        '<span class="acc-num" style="color:' + color + '">' + (st.n ? pct + "%" : "-") +
        " <small>" + st.ok + "/" + st.n + "</small></span>" +
        (st.n ? '<button class="acc-reset" data-reset="' + e.id + '" title="' + esc(e.short) + ' 기록 지우기" aria-label="' + esc(e.short) + ' 기록 지우기">×</button>' : "<span></span>") +
        "</div>";
    }).join("");
    box.innerHTML = html;

    $$("[data-reset]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var era = b.dataset.reset;
        if (!confirm(ERA_NAMES[era] + " 기록을 지울까요?\n정답률, 푼 문항, 이 시대의 오답 노트가 함께 지워집니다.")) return;
        resetEra(era);
        renderDash(); renderWrong();
      });
    });
  }

  // 한 시대의 학습 기록만 삭제
  function resetEra(era) {
    var ids = (window.QUIZ || []).filter(function (q) { return q.era === era; })
      .map(function (q) { return q.id; });
    delete S.stats[era];
    ids.forEach(function (id) { delete S.seen[id]; delete S.review[id]; });
    Object.keys(S.mastery).forEach(function (t) { if (TOPIC_ERA[t] === era) delete S.mastery[t]; });
    S.wrong = S.wrong.filter(function (w) { return ids.indexOf(w.id) === -1; });
    save();
  }

  function initReset() {
    $("#acc-reset-all").addEventListener("click", function () {
      if (!confirm("모든 학습 기록을 지울까요?\n플랜 체크, 정답률, 오답 노트가 전부 사라집니다.")) return;
      S = { done: {}, stats: {}, wrong: [], seen: {}, course: S.course, mastery: {}, review: {}, adaptV: 1 };
      save();
      renderDash(); renderPlan(); renderWrong();
    });
  }

  // ---------- 학습 플랜 ----------
  function initPlanCourse() {
    $$("#plan-course button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.course === (S.course || "all"));
      b.addEventListener("click", function () {
        $$("#plan-course button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        S.course = b.dataset.course; save();
        renderPlan(); renderToday();
      });
    });
  }

  function renderPlan() {
    var host = $("#plan-list");
    var todaySet = (sprintOn() ? sprintBatch() : todayDays()).map(function (d) { return d.day; });
    var planCourse = S.course || "all";
    var lastPhase = null;
    var left = studyLeft();
    // 몰아치기 중이면 날마다 어느 날짜 몫인지 꼬리표를 단다
    var tag = {};
    if (sprintOn()) {
      var sp = sprintState();
      (sp.late || []).forEach(function (d) { tag[d] = '<span class="badge-late">밀림</span>'; });
      Object.keys(sp.plan).forEach(function (k) {
        sp.plan[k].forEach(function (d) { if (!tag[d]) tag[d] = '<span class="badge-date">' + (k === todayStr() ? "오늘" : dateLabel(k)) + " 몫</span>"; });
      });
    }
    var stShown = sprintStart() || todayStr();
    var html = '<div class="card sprint-ctl"><div class="sprint-ctl-row"><b>진도 일정</b>' +
      '<label>시작하는 날 <input type="date" id="sprint-start" value="' + esc(stShown) + '" max="' + window.EXAM_DATE + '"></label>' +
      '<span class="sprint-tilde">~</span>' +
      '<label>끝나는 날 <input type="date" id="sprint-end" value="' + esc(sprintEnd()) + '" max="' + window.EXAM_DATE + '"></label>' +
      (sprintOn() ? '<button class="mini" id="sprint-off" type="button">끄기</button>' : "") + "</div>" +
      '<p class="sprint-ctl-note">' + (sprintOn()
        ? (left.length ? "남은 진도 <b>" + left.length + "일 치</b>를 " +
            (sprintStart() > todayStr() ? dateLabel(sprintStart()) + "부터 " : "") + dateLabel(sprintEnd()) + "까지 나눴습니다. 오늘 할 몫은 <b>" + todaySet.filter(function (d) { return !S.done[d]; }).length + "일 치</b>" +
            (sprintLate().length ? "(밀린 " + sprintLate().length + "일 치 포함)" : "") + "이고, 아래 목록에 날짜별 몫이 표시됩니다. 시작하는 날을 지난 날짜로 고르면 그 사이 몫은 밀린 것으로 표시됩니다."
          : "진도를 모두 끝냈습니다. 이제 실전 기출과 약점 분석만 돌리세요.")
        : "시작하는 날과 끝나는 날을 고르면 남은 진도를 그 사이에 고르게 나눠 하루 몫을 정해 줍니다.") + "</p></div>";
    if (planCourse === "core") {
      html += '<div class="card" style="padding:14px 16px;font-size:13.5px;color:var(--ink-soft)">' +
        "3급(60점) 목표 최소 코스입니다. 배점이 크고 출제 빈도가 높은 " +
        window.PLAN.filter(function (p) { return p.core; }).length +
        "일만 남겼습니다. 시간이 남으면 1급 코스로 전환하세요.</div>";
    }
    window.PLAN.forEach(function (p, i) {
      if (planCourse === "core" && !p.core) return;
      if (p.phase !== lastPhase) {
        lastPhase = p.phase;
        var ph = window.PHASES[p.phase];
        html += '<div class="phase-head"><h2>' + esc(ph.name) + "</h2><p>" + esc(ph.desc) + "</p></div>";
      }
      var done = !!S.done[p.day];
      var isToday = todaySet.indexOf(p.day) !== -1;
      html +=
        '<div class="plan-item' + (isToday ? " today" : "") + (done ? " done" : "") + '" data-day="' + p.day + '">' +
        '<button class="plan-check' + (done ? " on" : "") + '" data-check="' + p.day + '">' + (done ? "✓" : "") + "</button>" +
        '<div class="plan-body">' +
        '<div class="plan-meta"><span>DAY ' + p.day + "</span><span>" + p.date + "</span><span>" + esc(p.time) + "</span>" +
        (p.core ? '<span class="badge-core" title="3급 목표라면 이 날만 해도 됩니다">★ 핵심</span>' : "") +
        (sprintOn() ? (!done && tag[p.day] ? tag[p.day] : "") : (isToday ? '<span class="badge-today">오늘</span>' : "")) + "</div>" +
        '<div class="plan-title">' + esc(p.title) + "</div>" +
        '<ul class="plan-todo">' + p.todo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        '<div class="plan-links">' +
        (p.concepts.length ? '<button class="mini" data-concept="' + p.day + '">개념 보기</button>' : "") +
        (p.concepts.length ? '<button class="mini" data-quiz="' + p.day + '">그날 문제 ' + countFor(dayFilter(p)) + "</button>" : "") +
        '<button class="mini" data-learned="' + p.day + '">누적 ' + countFor(learnedFilter(p)) + "</button>" +
        "</div></div></div>";
    });
    host.innerHTML = html;

    // 날짜를 바꾸면 남은 진도를 새 기간에 다시 나눈다. 시작하는 날을 직접 고쳤을 때만 지난 날짜부터 나눈다
    function setRange(startChanged) {
      var st = $("#sprint-start").value || "", en = $("#sprint-end").value || "";
      // 두 날짜가 뒤바뀌면 방금 고친 쪽을 살리고 다른 쪽을 맞춘다
      if (st && en && en < st) { if (startChanged) en = st; else st = en < todayStr() ? en : ""; }
      S.sprintStart = st === todayStr() && !startChanged ? sprintStart() : st;
      S.sprintEnd = en;
      if (en) buildSprint([], startChanged); else S.sprint = null;
      save();
      renderPlan(); renderToday(); renderConcept();
    }
    $("#sprint-start").addEventListener("change", function () { setRange(true); });
    $("#sprint-end").addEventListener("change", function () { setRange(false); });
    var off = $("#sprint-off");
    if (off) off.addEventListener("click", function () {
      S.sprintEnd = ""; S.sprint = null; save();
      renderPlan(); renderToday(); renderConcept();
    });
    $$("[data-check]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.dataset.check;
        S.done[d] = !S.done[d]; save(); renderPlan(); renderProgress(); renderToday();
      });
    });
    $$("[data-concept]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        openConceptFor(planByDay(b.dataset.concept));
      });
    });
    $$("[data-quiz]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        startQuizFor(dayFilter(planByDay(b.dataset.quiz)), 10, "study");
      });
    });
    $$("[data-learned]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        startQuizFor(learnedFilter(planByDay(b.dataset.learned)), 10, "study");
      });
    });
  }
  function planByDay(d) {
    d = parseInt(d, 10);
    for (var i = 0; i < window.PLAN.length; i++) if (window.PLAN[i].day === d) return window.PLAN[i];
    return null;
  }

  // ---------- 개념 ----------
  // 두 가지로 본다. "오늘 범위"는 플랜 하루치 주제를 한 화면에 이어서, "전체 주제"는 목차에서 고른 한 주제씩.
  // 고른 방식과 마지막으로 본 주제를 기억한다. 오늘 범위는 들어올 때마다 대시보드의 오늘 학습 날로 맞춘다
  var CONCEPT_KEY = "hanneung_concept_cur", TOC_KEY = "hanneung_toc_hidden", MODE_KEY = "hanneung_concept_mode";
  var TOPICS = [];
  (window.CONCEPTS || []).forEach(function (era) {
    era.topics.forEach(function (t) { TOPICS.push({ t: t, era: era }); });
  });
  var conceptCur = null, rangeDay = null;
  // 기출 오답 보기: 실전 기출에서 틀린 문항과 이어진 줄만 모아 보여 준다
  var wrongOn = false, wrongRound = null, wrongFull = {};

  function topicIndex(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].t.id === id) return i;
    return -1;
  }
  // 새 개념이 있는 날만 (복습일 빼고)
  function studyDays() { return window.PLAN.filter(function (p) { return p.concepts.length; }); }
  function nearDay(day, dir) {
    var days = studyDays();
    if (dir < 0) { for (var i = days.length - 1; i >= 0; i--) if (days[i].day < day) return days[i]; }
    else { for (var j = 0; j < days.length; j++) if (days[j].day > day) return days[j]; }
    return null;
  }
  // rangeDay: 숫자면 그날 하루, "today"면 오늘 범위(몰아치기 중이면 오늘 몫 전체)
  function rangePlan() {
    if (rangeDay == null) return null;
    return rangeDay === "today" ? todayPlan() : planByDay(rangeDay);
  }
  function rangeIds() {
    if (wrongOn) return wrongGroups().order;
    var p = rangePlan();
    return p ? p.concepts.filter(function (id) { return topicIndex(id) >= 0; }) : [];
  }
  // 한 화면에 여러 주제를 이어 붙여 보는 중인가 (오늘 범위, 기출 오답)
  function stacked() { return wrongOn || rangeDay != null; }
  function rangeNeighbor(dir) {
    var p = rangePlan();
    return p ? nearDay(dir < 0 ? (p.first || p.day) : (p.last || p.day), dir) : null;
  }

  function initConcept() {
    try { conceptCur = localStorage.getItem(CONCEPT_KEY); } catch (e) {}
    if (topicIndex(conceptCur) < 0) conceptCur = TOPICS.length ? TOPICS[0].t.id : null;
    var mode = "range";
    try { mode = localStorage.getItem(MODE_KEY) || "range"; } catch (e) {}
    rangeDay = mode === "range" ? "today" : null;
    wrongOn = mode === "wrong";

    $("#concept-modes").addEventListener("click", function (e) {
      var b = e.target.closest("[data-mode]");
      if (!b) return;
      if (b.dataset.mode === "range") showRange("today");
      else if (b.dataset.mode === "wrong") showWrong(null);
      else pickTopic(conceptCur);
    });
    $("#concept-search").addEventListener("input", renderToc);
    $("#concept-toc").addEventListener("click", function (e) {
      var b = e.target.closest("[data-topic-id]");
      if (!b) return;
      // 오늘 범위를 보는 중에 범위 안 주제를 누르면 그 자리로 내려가고, 범위 밖이면 그 주제 하나를 연다
      if (stacked() && rangeIds().indexOf(b.dataset.topicId) !== -1) jumpTo(b.dataset.topicId);
      else pickTopic(b.dataset.topicId);
    });
    $("#concept-list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-jump-topic]");
      if (b) { jumpTo(b.dataset.jumpTopic); return; }
      var r = e.target.closest("[data-wround]");
      if (r) { wrongRound = r.dataset.wround ? +r.dataset.wround : null; renderConcept(); return; }
      var f = e.target.closest("[data-wfull]");
      if (f) { wrongFull[f.dataset.wfull] = !wrongFull[f.dataset.wfull]; renderConcept(); jumpTo(f.dataset.wfull); return; }
      var go = e.target.closest("[data-wgo]");
      if (go) showView(go.dataset.wgo);
    });
    $("#concept-nav").addEventListener("click", function (e) {
      var b = e.target.closest("[data-go], [data-go-day]");
      if (!b) return;
      if (b.dataset.goDay) showRange(+b.dataset.goDay);
      else pickTopic(b.dataset.go);
    });
    $("#toc-toggle").addEventListener("click", function () { setTocOpen(!$(".reader").classList.contains("toc-open")); });
    // 넓은 화면: 목차를 접으면 본문이 넓어진다. 접은 상태를 기억한다
    var hidden = false;
    try { hidden = localStorage.getItem(TOC_KEY) === "1"; } catch (e) {}
    $(".reader").classList.toggle("toc-hidden", hidden);
    $("#toc-hide").addEventListener("click", function () { setTocHidden(true); });
    $("#toc-show").addEventListener("click", function () { setTocHidden(false); renderToc(); });
    // 키보드 ← → : 오늘 범위에서는 앞뒤 날, 전체 주제에서는 앞뒤 주제
    document.addEventListener("keydown", function (e) {
      if (!$("#view-concept").classList.contains("active") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var dir = e.key === "ArrowRight" ? 1 : -1;
      if (wrongOn) return;
      if (rangeDay != null) {
        var d = rangeNeighbor(dir);
        if (d) showRange(d.day);
      } else {
        var x = TOPICS[topicIndex(conceptCur) + dir];
        if (x) pickTopic(x.t.id);
      }
      e.preventDefault();
    });
    renderConcept();
  }

  function setTocHidden(on) {
    $(".reader").classList.toggle("toc-hidden", on);
    try { localStorage.setItem(TOC_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function setTocOpen(on) {
    $(".reader").classList.toggle("toc-open", on);
    $("#toc-toggle").setAttribute("aria-expanded", on ? "true" : "false");
  }
  function setMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
  }

  function renderToc() {
    var q = $("#concept-search").value.trim().toLowerCase();
    var host = $("#concept-toc");
    var inRange = rangeIds(), today = todayPlan().concepts;
    var list = TOPICS.filter(function (x) {
      if (!q) return true;
      var t = x.t;
      var hay = (t.title + " " + t.points.join(" ") + " " + t.keywords.join(" ") + " " + t.tip).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    var html = q ? '<p class="toc-count">' + list.length + "개 주제에 있습니다</p>" : "";
    var lastEra = null;
    list.forEach(function (x) {
      if (x.era !== lastEra) {
        if (lastEra) html += "</div>";
        lastEra = x.era;
        html += '<div class="toc-era"><div class="toc-era-name">' + esc(x.era.name) + "<small>약 " + x.era.ratio + "문항</small></div>";
      }
      var id = x.t.id;
      var cls = stacked() ? (inRange.indexOf(id) !== -1 ? " in" : "") : (id === conceptCur ? " on" : "");
      var lv = masteryLevel(masteryOf(id));
      html += '<button type="button" class="toc-item' + cls +
        (today.indexOf(id) !== -1 ? " focus" : "") + '" data-topic-id="' + id + '">' +
        (lv ? '<i class="mdot m-' + lv + '" title="숙련도 ' + pctOf(S.mastery[id].s) + '%"></i>' : "") + esc(x.t.title) + "</button>";
    });
    if (lastEra) html += "</div>";
    host.innerHTML = list.length ? html : '<p class="empty">검색 결과가 없습니다.</p>';
    // 지금 주제가 목차 밖에 있으면 보이는 곳으로
    var on = $(".toc-item.on, .toc-item.in", host);
    if (on && host.scrollHeight > host.clientHeight) {
      var top = on.offsetTop - host.offsetTop;
      if (top < host.scrollTop || top + on.offsetHeight > host.scrollTop + host.clientHeight) host.scrollTop = top - host.clientHeight / 3;
    }
  }

  function masteryBadge(id) {
    var m = masteryOf(id);
    if (!m) return "";
    return '<span class="m-badge m-' + masteryLevel(m) + '">숙련도 ' + pctOf(m.s) + "%</span>";
  }
  // picks: { "줄 번호:불릿 번호": true } 를 주면 그 불릿만 그리고 사진·키워드·시험 포인트는 뺀다
  // photos: 고른 줄에 나오는 문화유산 사진 id (없으면 생략)
  function topicHtml(x, heading, picks, photos) {
    var t = x.t, era = x.era, seen = {};
    if (picks) {
      return '<section class="topic-page" id="topic-' + t.id + '">' + heading +
        '<div class="topic-body"><ul class="points">' +
        t.points.map(function (p, pi) {
          return noteBulletsHtml(p, era.id, seen, t.id, function (b, bi) { return picks[pi + ":" + bi]; });
        }).join("") + "</ul>" +
        (photos && photos.length ? '<div class="photo-row">' + photos.map(function (id) { return figureHtml(id, true); }).join("") + "</div>" : "") +
        "</div></section>";
    }
    return '<section class="topic-page" id="topic-' + t.id + '">' + heading +
      '<div class="topic-body"><ul class="points">' +
      t.points.map(function (p) { return noteBulletsHtml(p, era.id, seen, t.id); }).join("") + "</ul>" +
      (function () {
        // 주제 사진에, 틀린 문제에 해당하는 다른 주제의 사진을 앞에 더한다
        var ids = (photos || []).concat((IMAGES_BY_TOPIC[t.id] || []).filter(function (id) { return (photos || []).indexOf(id) === -1; }));
        return ids.length ? '<div class="photo-row">' + ids.map(function (id) { return figureHtml(id, true); }).join("") + "</div>" : "";
      })() +
      '<div class="kw-row">' +
      t.keywords.map(function (k) { return '<span class="kw">' + linkTerms(esc(k), era.id, {}) + "</span>"; }).join("") +
      '</div><div class="tip">' + linkTerms(fmt(t.tip), era.id, seen) + "</div></div></section>";
  }

  function paintModes() {
    $("#mode-range-day").textContent = "DAY " + todayPlan().day;
    var n = mockWrongItems(null).length;
    $("#mode-wrong-n").textContent = n ? n + "문항" : "";
    var cur = wrongOn ? "wrong" : rangeDay != null ? "range" : "all";
    $$("#concept-modes [data-mode]").forEach(function (b) { b.classList.toggle("active", b.dataset.mode === cur); });
  }

  // ----- 기출 오답: 틀린 문항 → 주제 → 그 문항과 이어진 줄 -----
  // 회차마다 가장 최근 응시에서 틀린 문항
  function mockWrongItems(round) {
    var M = mockState(), out = [];
    EXAMS.forEach(function (ex) {
      if (round && ex.round !== round) return;
      var hist = M.hist[ex.round];
      if (!hist || !hist.length) return;
      var ans = hist[hist.length - 1].ans.split("").map(Number);
      for (var i = 0; i < 50; i++) if (ans[i] !== +ex.ans[i]) out.push({ ex: ex, i: i, mine: ans[i], tag: ex.tags[i] });
    });
    return out;
  }
  // 문항 꼬리표("백제 웅진 시기(삼근왕)")에서 줄을 찾을 낱말만 남긴다. 어디에나 나오는 말은 뺀다
  var TAG_STOP = {};
  ("시기 사이 연표 이후 이전 시대 정부 사건 정책 문화 운동 인물 지역 활동 순서 과정 관련 역대 제도 모습 전개 배경 결과 영향 설명 " +
    "조선 고려 후기 전기 초기 말기 경제 사회 문화유산 일제 강점기 개화기 근현대 주요 대응 변천 성장 의식 대한 지역사 통치 체제 대외 관계 교류").split(" ")
    .forEach(function (w) { TAG_STOP[w] = true; });
  function tagTokens(label) {
    return label.replace(/[()~,\/]/g, " ").replace(/([가-힣])·(?=[가-힣])/g, "$1 ").split(/\s+/)
      .map(function (w) { return w.replace(/[^가-힣A-Za-z0-9·]/g, ""); })
      .filter(function (w) { return w.length >= 2 && !TAG_STOP[w]; });
  }
  function bulletPlain(b) {
    return (b.subject + " " + b.lines.join(" ") + " " + b.notes.concat(b.subjectNotes).map(function (n) { return n.text; }).join(" "))
      .replace(/\*\*/g, "").replace(/\s+/g, "");
  }
  var bulletCache = {};
  function topicBullets(id) {
    if (bulletCache[id]) return bulletCache[id];
    var out = [], t = TOPICS[topicIndex(id)].t;
    t.points.forEach(function (p, pi) {
      window.parseNote(p).forEach(function (b, bi) { out.push({ key: pi + ":" + bi, plain: bulletPlain(b) }); });
    });
    return (bulletCache[id] = out);
  }
  // 낱말이 겹치는 줄을 찾는다. 가장 많이 겹친 줄의 6할 이상만, 많아야 5줄
  function matchLines(id, toks) {
    var rows = topicBullets(id).map(function (r) {
      var sc = 0;
      toks.forEach(function (w) { if (r.plain.indexOf(w) !== -1) sc += w.length; });
      return { key: r.key, sc: sc };
    });
    var best = rows.reduce(function (m, r) { return Math.max(m, r.sc); }, 0);
    if (!best) return { best: 0, keys: [] };
    return { best: best, keys: rows.filter(function (r) { return r.sc >= best * 0.6; })
      .sort(function (a, b) { return b.sc - a.sc; }).slice(0, 5).map(function (r) { return r.key; }) };
  }
  // 꼬리표에 적힌 주제에서 먼저 찾고, 없으면 같은 시대의 다른 주제, 그래도 없으면 주제 전체를 보여 준다
  function linesForTag(tag) {
    var id = tag[0], toks = tagTokens(tag[1]);
    if (topicIndex(id) < 0) return null;
    var m = toks.length ? matchLines(id, toks) : { best: 0, keys: [] };
    if (m.best) return { id: id, keys: m.keys };
    if (toks.length) {
      var era = TOPIC_ERA[id], alt = null;
      TOPICS.forEach(function (x) {
        if (x.era.id !== era || x.t.id === id) return;
        var r = matchLines(x.t.id, toks);
        if (r.best >= 3 && (!alt || r.best > alt.best)) alt = { id: x.t.id, keys: r.keys, best: r.best };
      });
      if (alt) return { id: alt.id, keys: alt.keys };
    }
    return { id: id, keys: null };
  }
  // 고른 줄이나 문항 꼬리표에 이름이 나오는 사진을 찾는다 ("익산 미륵사지 석탑" → 미륵사지).
  // 석탑, 3층처럼 여러 사진에 두루 붙는 말로는 찾지 않는다
  var IMG_STOP = {};
  "석탑 3층 5층 9층 10층 8각 입상 좌상 삼존상 여래 마애 석조 금동 본존불 복원 사진 청사 서명문 태극기 항아리 매병".split(" ")
    .forEach(function (w) { IMG_STOP[w] = true; });
  function plainName(v) { return v.replace(/[\s·「」()\[\],.]/g, ""); }
  var IMG_KEYS = Object.keys(window.IMAGES || {}).map(function (id) {
    var toks = window.IMAGES[id].name.replace(/[「」()\[\]]/g, " ").split(/\s+/).filter(function (w) { return w && !IMG_STOP[w]; });
    return { id: id, full: plainName(window.IMAGES[id].name), toks: toks, long: toks.filter(function (w) { return w.length >= 3; }) };
  });
  // 줄 내용에서 찾기: 사진 이름 전체나 이름 속 긴 낱말이 나오는가.
  // 짧은 낱말뿐인 이름("종묘 정전")은 낱말이 모두 나와야 한다 ("정전 협정"에 걸리지 않게)
  function imagesFor(text) {
    var t = plainName(text);
    return IMG_KEYS.filter(function (k) {
      if (t.indexOf(k.full) !== -1) return true;
      if (k.long.length) return k.long.some(function (w) { return t.indexOf(w) !== -1; });
      return k.toks.length > 0 && k.toks.every(function (w) { return t.indexOf(w) !== -1; });
    }).map(function (k) { return k.id; });
  }
  // 문항 꼬리표에서 찾기: 꼬리표 낱말이 사진 이름의 낱말과 같거나 이름에 들어 있으면 맞는 것으로 본다
  // ("종묘" → 종묘 정전, "금관" → 금관총 금관, "광개토대왕" → 광개토대왕릉비)
  function imagesForTags(labels) {
    var t = plainName(labels.join(" ")), toks = [];
    labels.forEach(function (l) { toks = toks.concat(tagTokens(l)); });
    return IMG_KEYS.filter(function (k) {
      if (t.indexOf(k.full) !== -1 || k.long.some(function (w) { return t.indexOf(w) !== -1; })) return true;
      return toks.some(function (w) { return k.toks.indexOf(w) !== -1 || (w.length >= 3 && k.full.indexOf(plainName(w)) !== -1); });
    }).map(function (k) { return k.id; });
  }
  // 틀린 문제에 바로 해당하는 사진을 먼저, 그다음 고른 줄에 나오는 사진. 많아야 8장
  function wrongPhotos(id, grp) {
    var out = imagesForTags(grp.qs.map(function (q) { return q.tag[1]; })), text = "";
    topicBullets(id).forEach(function (r) { if (grp.picks[r.key]) text += " " + r.plain; });
    imagesFor(text).forEach(function (im) { if (out.indexOf(im) === -1) out.push(im); });
    return out.slice(0, 8);
  }
  function wrongGroups() {
    var by = {}, loose = [];
    mockWrongItems(wrongRound).forEach(function (q) {
      var r = linesForTag(q.tag);
      if (!r) { loose.push(q); return; }
      var g = by[r.id] || (by[r.id] = { qs: [], picks: {}, whole: false });
      g.qs.push(q);
      if (r.keys) r.keys.forEach(function (k) { g.picks[k] = true; }); else g.whole = true;
    });
    var order = TOPICS.map(function (x) { return x.t.id; }).filter(function (id) { return by[id]; });
    return { by: by, order: order, loose: loose };
  }
  function wrongRowHtml(q) {
    return '<div class="mock-wrong"><span class="mock-wq">' + q.ex.round + "회 " + (q.i + 1) + "번</span>" +
      '<span class="mock-wtag">' + esc(q.tag[1]) + "</span>" +
      '<span class="mock-wans">' + (q.mine ? "내 답 " + CIRCLED[q.mine - 1] : "무응답") + " → 정답 <b>" + CIRCLED[+q.ex.ans[q.i] - 1] + "</b> · " + q.ex.pts[q.i] + "점</span>" +
      '<button class="mini" data-crop="' + q.ex.round + ":" + q.i + '">문제 보기</button></div>';
  }
  function renderWrongConcepts() {
    var M = mockState(), g = wrongGroups();
    var rounds = EXAMS.filter(function (ex) { return (M.hist[ex.round] || []).length; });
    var nq = g.loose.length;
    g.order.forEach(function (id) { nq += g.by[id].qs.length; });
    $("#concept-crumb").innerHTML = "기출 오답" + " <span>" + (nq ? nq + "문항 · " + g.order.length + "개 주제" : "") + "</span>";
    $("#toc-current").textContent = "기출 오답 개념";
    var html = '<h2 class="topic-title range-title">실전 기출에서 틀린 개념</h2>';
    if (!rounds.length) {
      html += '<p class="range-empty">아직 채점한 실전 기출이 없습니다. 한 회를 풀고 제출하면, 틀린 문제와 이어진 개념만 여기에 모입니다.</p>' +
        '<button type="button" class="mini" data-wgo="mock">실전 기출 풀러 가기</button>';
    } else {
      if (rounds.length > 1) {
        html += '<div class="range-jump"><button type="button" class="mini' + (wrongRound ? "" : " active") + '" data-wround="">전체</button>' +
          rounds.map(function (ex) {
            var h = M.hist[ex.round];
            return '<button type="button" class="mini' + (wrongRound === ex.round ? " active" : "") + '" data-wround="' + ex.round + '">' +
              ex.round + "회 <small>" + h[h.length - 1].score + "점</small></button>";
          }).join("") + "</div>";
      }
      html += '<p class="range-empty">틀린 문제마다 관련된 줄만 골라 놓았습니다. 줄이 부족해 보이면 "주제 전체 보기"를 누르세요. "문제 보기"는 이 기기에 그 회차 문제지가 있을 때 나옵니다.</p>';
      if (!nq) html += '<p class="range-empty">틀린 문제가 없습니다.</p>';
      html += g.order.map(function (id, k) {
        var x = TOPICS[topicIndex(id)], grp = g.by[id], full = grp.whole || wrongFull[id];
        var head = '<div class="range-head"><span class="range-num">' + (k + 1) + "</span>" +
          '<div><div class="range-era">' + esc(x.era.name) + '</div><h3 class="range-topic">' + esc(x.t.title) + masteryBadge(id) + "</h3></div></div>" +
          '<div class="wq-rows">' + grp.qs.map(wrongRowHtml).join("") + "</div>";
        return topicHtml(x, head, full ? null : grp.picks,
          full ? imagesForTags(grp.qs.map(function (q) { return q.tag[1]; })) : wrongPhotos(id, grp)) +
          (grp.whole ? "" : '<div class="wq-more"><button type="button" class="mini" data-wfull="' + id + '">' + (wrongFull[id] ? "관련 줄만 보기" : "주제 전체 보기") + "</button></div>");
      }).join("");
      if (g.loose.length) {
        html += '<section class="topic-page"><div class="range-head"><span class="range-num">+</span><div><div class="range-era">여러 시대에 걸친 문제</div>' +
          '<h3 class="range-topic">한 주제로 묶이지 않는 문항</h3></div></div><div class="wq-rows">' + g.loose.map(wrongRowHtml).join("") + "</div></section>";
      }
    }
    var host = $("#concept-list");
    host.innerHTML = html;
    $("#concept-nav").innerHTML = "";
    bindCropButtons(host);
    renderToc();
  }
  function showWrong(round) {
    wrongOn = true;
    wrongRound = round || null;
    rangeDay = null;
    setMode("wrong");
    setTocOpen(false);
    renderConcept();
    scrollToReader();
  }

  function renderConcept() {
    paintModes();
    if (wrongOn) return renderWrongConcepts();
    if (rangeDay != null) return renderRange();
    var i = topicIndex(conceptCur);
    if (i < 0) return;
    var x = TOPICS[i], t = x.t;
    var prev = TOPICS[i - 1], next = TOPICS[i + 1];
    $("#concept-crumb").innerHTML = esc(x.era.name) + " <span>" + (i + 1) + " / " + TOPICS.length + "</span>";
    $("#toc-current").textContent = t.title;
    $("#concept-list").innerHTML = topicHtml(x, '<h2 class="topic-title">' + esc(t.title) + masteryBadge(t.id) + "</h2>");
    $("#concept-nav").innerHTML =
      (prev ? '<button type="button" class="nav-prev" data-go="' + prev.t.id + '"><small>← 이전</small>' + esc(prev.t.title) + "</button>" : "<span></span>") +
      (next ? '<button type="button" class="nav-next" data-go="' + next.t.id + '"><small>다음 →</small>' + esc(next.t.title) + "</button>" : "<span></span>");
    renderToc();
  }

  // 오늘 범위: 그날 주제를 순서대로 이어 붙이고, 맨 위에 바로가기, 맨 아래에 앞뒤 날
  function renderRange() {
    var p = rangePlan(), ids = rangeIds();
    var isToday = rangeDay === "today" || p.day === todayPlan().day;
    $("#concept-crumb").innerHTML = (isToday ? "오늘 범위 · " : "") + "DAY " + p.day +
      " <span>" + p.date + " · " + (ids.length ? ids.length + "개 주제" : "복습일") + "</span>";
    $("#toc-current").textContent = "DAY " + p.day + " · " + p.title;
    var html = '<h2 class="topic-title range-title">' + esc(p.title) + "</h2>";
    if (!ids.length) {
      html += '<p class="range-empty">이날은 새 개념 없이 복습하는 날입니다. 오답 노트와 연습 문제를 돌리고, 앞 범위는 아래 버튼으로 다시 볼 수 있습니다.</p>';
    } else {
      if (ids.length > 1) html += '<div class="range-jump">' + ids.map(function (id, k) {
        return '<button type="button" class="mini" data-jump-topic="' + id + '"><b>' + (k + 1) + "</b> " + esc(TOPICS[topicIndex(id)].t.title) + "</button>";
      }).join("") + "</div>";
      // 여러 날을 묶은 오늘 몫이면 날이 바뀌는 자리에 표시를 넣는다
      var dayOf = {};
      (p.batch || []).forEach(function (d) { d.concepts.forEach(function (id, j) { if (j === 0) dayOf[id] = d; }); });
      html += ids.map(function (id, k) {
        var x = TOPICS[topicIndex(id)], d = dayOf[id];
        return (d ? '<div class="range-day"><b>DAY ' + d.day + "</b> " + esc(d.title) + "</div>" : "") +
          topicHtml(x, '<div class="range-head"><span class="range-num">' + (k + 1) + "</span>" +
          '<div><div class="range-era">' + esc(x.era.name) + '</div><h3 class="range-topic">' + esc(x.t.title) + masteryBadge(x.t.id) + "</h3></div></div>");
      }).join("");
    }
    $("#concept-list").innerHTML = html;
    var prev = rangeNeighbor(-1), next = rangeNeighbor(1);
    $("#concept-nav").innerHTML =
      (prev ? '<button type="button" class="nav-prev" data-go-day="' + prev.day + '"><small>← DAY ' + prev.day + "</small>" + esc(prev.title) + "</button>" : "<span></span>") +
      (next ? '<button type="button" class="nav-next" data-go-day="' + next.day + '"><small>DAY ' + next.day + " →</small>" + esc(next.title) + "</button>" : "<span></span>");
    renderToc();
  }

  function scrollToReader() {
    var r = $(".reader-main").getBoundingClientRect(), th = topbarH();
    if (r.top < th) window.scrollBy({ top: r.top - th - 12, behavior: "smooth" });
  }
  function showRange(day) {
    if (day !== "today" && !planByDay(day)) return;
    wrongOn = false;
    rangeDay = day;
    setMode("range");
    setTocOpen(false);
    renderConcept();
    scrollToReader();
  }
  function pickTopic(id) {
    if (topicIndex(id) < 0) return;
    conceptCur = id;
    rangeDay = null;
    wrongOn = false;
    setMode("all");
    try { localStorage.setItem(CONCEPT_KEY, id); } catch (e) {}
    setTocOpen(false);
    renderConcept();
    scrollToReader();
  }
  // 오늘 범위 안에서 그 주제 머리로 내려간다
  function jumpTo(id) {
    setTocOpen(false);
    var el = document.getElementById("topic-" + id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - topbarH() - 14, behavior: "smooth" });
  }

  // 손필기 모양: "주체 : 핵심어들" 한 줄 + 아래에 'ㄴ→ 단어' (호버하면 종류·쉬운 뜻·괄호 속 참고)
  // ** 굵게와 줄바꿈(\n = ' / ')이 섞인 원문을 그리면서, 풀이가 달린 범위에 밑줄 span을 씌운다.
  // ranges: 굵게 표시를 뺀 글자 위치 기준 [{s, e, k}], 겹치지 않게 정렬된 상태
  // parens: 원래 괄호 [{pos, html}] (pos 순). 제자리에 숨겨 두고 "풀이 펼치기"일 때 파란 괄호로 보인다
  var YEAR_ONLY = /^[\d~.,\s년월일세기BC전후경초말중반C]+$/;
  function renderMarked(raw, ranges, parens) {
    var out = "", p = 0, bold = false, mark = null, ri = 0, pi = 0, boldEnd = -1;
    function flipB(on) { out += on ? "<b>" : "</b>"; }
    function closeMark() {
      if (bold) flipB(false);
      out += "</span>"; mark = null;
      if (bold) flipB(true);
    }
    // 괄호를 세 갈래로 나눈다.
    //   기본: 빨간 핵심어에 붙었거나 안에 굵은 글씨가 든 괄호 (늘 보인다)
    //   sub : 보통 글씨에 붙은 괄호 ('핵심'에서는 숨긴다)
    //   yr·skip : 보통 글씨에 붙은 연도, 걸러 낸 괄호 ('전부'에서만 회색으로 보인다)
    function putParens(all) {
      while (pi < parens.length && (all || parens[pi].pos <= p)) {
        var it = parens[pi++], h = it.html;
        var onKey = bold || boldEnd === p;
        var cls = it.skip ? " skip" : !onKey && YEAR_ONLY.test(h.replace(/<[^>]+>/g, "")) ? " yr"
          : !onKey && h.indexOf("<b>") === -1 ? " sub" : "";
        if (bold) flipB(false);
        out += '<span class="nt-inl' + cls + '">(' + h + ")</span>";
        if (bold) flipB(true);
      }
    }
    for (var i = 0; i < raw.length; ) {
      if (raw.substr(i, 2) === "**") { bold = !bold; if (!bold) boldEnd = p; flipB(bold); i += 2; continue; }
      if (mark && p === mark.e) closeMark();
      putParens(false);
      if (!mark && ri < ranges.length && p === ranges[ri].s) {
        mark = ranges[ri++];
        if (bold) flipB(false);
        out += '<span class="nt-mark" data-k="' + mark.k + '">';
        if (bold) flipB(true);
      }
      var c = raw.charAt(i);
      out += c === "\n" ? '<span class="nt-sep"> / </span>' : esc(c);
      p++; i++;
    }
    if (mark) closeMark();
    putParens(true);
    if (bold) flipB(false);
    return out;
  }
  // 라벨이 본문 어디에 있는지 찾는다 (at = 라벨이 끝나는 위치 추정값)
  function rangeFor(plain, label, at) {
    var guess = at - label.length;
    if (guess >= 0 && plain.substr(guess, label.length) === label) return guess;
    var i = plain.lastIndexOf(label, Math.max(0, at));
    return i >= 0 ? i : plain.indexOf(label);
  }
  function toRanges(plain, notes, base) {
    var out = [];
    notes.forEach(function (n, j) {
      var s = n.gloss ? n.at : rangeFor(plain, n.label, n.at);
      if (s >= 0) out.push({ s: s, e: s + n.label.length, k: base + j });
    });
    out.sort(function (a, b) { return a.s - b.s; });
    var last = -1;
    return out.filter(function (r) { if (r.s < last) return false; last = r.e; return true; });
  }

  function noteBulletsHtml(raw, era, seen, topicId, pick) {
    // 괄호에서 온 풀이: 라벨에 든 용어의 쉬운 뜻 + 괄호 속 내용(참고)
    // pos: 원래 괄호가 있던 자리 (굵게 표시를 뺀 글자 위치)
    function parenNote(n, at, pos) {
      var note = { label: n.label, at: at, pos: pos, detail: linkTerms(fmt(readable(n.text)), era, {}) };
      // 걸러 낸 괄호(뜻풀이·반복·곁가지)는 '괄호 전부'에서만 보인다
      note.skip = ((window.NOTE_SKIP || {})[topicId] || []).indexOf(n.label + "|" + n.text) !== -1;
      var easy = (window.NOTE_EASY || {})[topicId + "|" + n.label];
      var term = glossInLabel(n.label, era);
      if (easy) {
        // 이 라벨만을 위해 쓴 쉬운 설명이 있으면 그것을 쓴다
        var e = splitDef(easy);
        note.type = e.type;
        note.desc = e.desc;
        if (term) seen[term] = 1;
      } else if (term) {
        var d = splitDef(glossFor(term, era));
        note.type = d.type;
        note.desc = (term !== n.label ? term + " — " : "") + d.desc;
        seen[term] = 1;
      }
      return note;
    }
    function noteHtml(n, k, inline) {
      return '<span class="nt-note' + (inline ? " inl" : "") + '" tabindex="0" data-k="' + k + '" data-label="' + esc(n.label) + '">' +
        '<span class="nt-head"><span class="nt-arrow">ㄴ→</span>' + esc(n.label) + "</span>" +
        '<span class="nt-text"><span class="nt-type">' + esc(n.type || "") + "</span>" +
        '<span class="nt-desc">' + esc(n.desc || "") + "</span>" +
        '<span class="nt-detail">' + (n.detail || "") + "</span></span></span>";
    }

    return window.parseNote(raw).filter(function (b, bi) { return !pick || pick(b, bi); }).map(function (b) {
      var subjPlain = window.noteStripStars(b.subject);
      var subjNotes = b.subjectNotes.map(function (n) {
        return parenNote(n, -1, b.subject.slice(0, n.at).replace(/\*\*/g, "").length);
      });
      // 주체에 들어 있는 용어는 따로 풀지 않는다
      if (glossRe && subjPlain) subjPlain.replace(glossRe, function (m) { seen[m] = 1; return m; });

      var joined = b.lines.join("\n");
      var plain = joined.replace(/\*\*/g, "");
      var notes = b.notes.map(function (n) {
        var pos = joined.slice(0, n.at).replace(/\*\*/g, "").length;
        return parenNote(n, pos, pos);
      });
      if (glossRe) {
        plain.replace(glossRe, function (m, at, str) {
          if (/[가-힣0-9]/.test(str.charAt(at - 1)) || seen[m]) return m;
          var def = glossFor(m, era);
          if (!def) return m;
          seen[m] = 1;
          // 이미 괄호 풀이가 붙은 라벨 안의 용어면 건너뛴다
          if (notes.some(function (n) { return n.label.indexOf(m) !== -1; })) return m;
          var d = splitDef(def);
          notes.push({ label: m, type: d.type, desc: d.desc, at: at, gloss: true });
          return m;
        });
      }
      notes.sort(function (x, y) { return x.at - y.at; });
      var subjRanges = toRanges(subjPlain, subjNotes, 0);
      var bodyRanges = toRanges(plain, notes, subjNotes.length);
      notes = subjNotes.concat(notes);
      // 괄호 내용은 원래 자리에도 숨겨 둔다 (펼치기 모드에서 필기 모양 그대로 보이고, 아래 풀이에서는 뜻만 보임)
      var subjParens = [], bodyParens = [];
      notes.forEach(function (n, k) {
        if (n.detail) (k < subjNotes.length ? subjParens : bodyParens).push({ pos: n.pos, html: n.detail, skip: n.skip });
      });
      function byPos(x, y) { return x.pos - y.pos; }

      return '<li class="nt"><div class="nt-main">' +
        (b.subject ? '<span class="nt-subj">' + renderMarked(b.subject, subjRanges, subjParens.sort(byPos)) + '</span><span class="nt-colon"> : </span>' : "") +
        renderMarked(joined, bodyRanges, bodyParens.sort(byPos)) + "</div>" +
        (notes.length ? '<div class="nt-notes">' + notes.map(function (n, k) { return noteHtml(n, k, !!n.detail); }).join("") + "</div>" : "") +
        "</li>";
    }).join("");
  }

  // 빈칸 모드: 첫 줄의 빨간 핵심어(주체는 빼고)를 가려 두고, 누르면 보였다 가려졌다 한다
  var BLANK_KEY = "hanneung_blank", BLANK_SEL = ".nt-main > b, .nt-main > .nt-mark > b";
  function isMasked(el) {
    if (!el.closest(".blank-on")) return false;
    var b = el.closest("b") || el.querySelector("b");
    return !!(b && b.matches(BLANK_SEL) && b.textContent && !b.classList.contains("shown"));
  }
  function initBlank() {
    var btn = $("#blank-toggle"), main = $(".reader-main"), on = false;
    try { on = localStorage.getItem(BLANK_KEY) === "1"; } catch (e) {}
    function paint() {
      main.classList.toggle("blank-on", on);
      btn.classList.toggle("active", on);
      btn.textContent = on ? "빈칸 끄기" : "빈칸 모드";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (!on) $$("b.shown", main).forEach(function (b) { b.classList.remove("shown"); });
    }
    btn.addEventListener("click", function () {
      on = !on;
      try { localStorage.setItem(BLANK_KEY, on ? "1" : "0"); } catch (e) {}
      paint();
    });
    $("#concept-list").addEventListener("click", function (e) {
      if (!on) return;
      var b = e.target.closest && e.target.closest("b");
      if (!b || !b.matches(BLANK_SEL) || !b.textContent) return;
      b.classList.toggle("shown");
      // 다시 가릴 때 떠 있던 풀이 말풍선이 답을 보여 주지 않게 닫는다
      if (!b.classList.contains("shown")) { var pop = $("#gloss-pop"); if (pop) pop.hidden = true; }
    });
    paint();
  }

  // 파란 풀이는 평소엔 단어만 보이고 마우스를 올리면(탭하면) 뜬다. "풀이 펼치기"를 켜면 모두 펼쳐 보인다
  var NOTES_KEY = "hanneung_notes_open", PAREN_KEY = "hanneung_paren_mode";
  function initNoteToggle() {
    var btn = $("#note-toggle"), list = $("#concept-list");
    var open = false;
    try { open = localStorage.getItem(NOTES_KEY) === "1"; } catch (e) {}
    function paint() {
      list.classList.toggle("notes-open", open);
      btn.classList.toggle("active", open);
      btn.textContent = open ? "풀이 접기" : "풀이 펼치기";
      btn.setAttribute("aria-pressed", open ? "true" : "false");
    }
    // 괄호를 얼마나 보일지: 핵심(빨간 말에 붙은 것만) / 기본(걸러 낸 것 빼고) / 전부
    var pm = "std";
    try { pm = localStorage.getItem(PAREN_KEY) || "std"; } catch (e) {}
    function paintPm() {
      ["key", "std", "all"].forEach(function (m) { list.classList.toggle("pm-" + m, m === pm); });
      $$("#paren-mode [data-pm]").forEach(function (b) { b.classList.toggle("active", b.dataset.pm === pm); });
    }
    $("#paren-mode").addEventListener("click", function (e) {
      var b = e.target.closest("[data-pm]");
      if (!b) return;
      pm = b.dataset.pm;
      try { localStorage.setItem(PAREN_KEY, pm); } catch (er) {}
      paintPm();
    });
    paintPm();
    // 본문 밑줄 단어와 아래 풀이 단어 중 하나에 올리면 짝도 같이 강조
    function pair(el, on) {
      var li = el.closest("li.nt");
      if (!li) return;
      $$('[data-k="' + el.dataset.k + '"]', li).forEach(function (x) { x.classList.toggle("hl", on); });
    }
    list.addEventListener("mouseover", function (e) {
      var el = e.target.closest && e.target.closest(".nt-mark, .nt-note");
      if (el) pair(el, true);
    });
    list.addEventListener("mouseout", function (e) {
      var el = e.target.closest && e.target.closest(".nt-mark, .nt-note");
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) pair(el, false);
    });
    btn.addEventListener("click", function () {
      open = !open;
      try { localStorage.setItem(NOTES_KEY, open ? "1" : "0"); } catch (e) {}
      paint();
    });
    paint();
  }

  // 플랜·대시보드의 "개념 보기"는 그날 범위를 한 화면에, 실전 기출 결과의 "개념 보기"는 그 주제 하나를 연다
  function openConceptFor(p) {
    if (!p || !p.concepts.length) return;
    $("#concept-search").value = "";
    showView("concept");
    if (p.day != null) showRange(p.day);
    else pickTopic(p.concepts[0]);
  }

  // ---------- 맞춤 학습: 주제 숙련도 · 복습 일정 ----------
  // 주제마다 숙련도(0~1)를 두고 풀 때마다 최근 결과 쪽으로 당긴다. 최근에 맞히면 금방 오르고, 틀리면 바로 내려간다.
  // 틀린 문제는 1일 → 3일 → 6일 뒤에 다시 내고, 세 번 연달아 맞히면 복습에서 뺀다.
  // 문제를 고를 때는 복습 차례 → 안 푼 문제(약한 주제부터) → 틀렸던 문제 → 맞힌 문제(약한 주제부터) 순서다
  var ALPHA = 0.35, ALPHA_MOCK = 0.45, REVIEW_DAYS = [1, 3, 6];

  function addDays(d, n) {
    var t = new Date(d + "T00:00:00");
    t.setDate(t.getDate() + n);
    return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
  }
  function learn(topicId, ok, alpha) {
    if (!TOPIC_ERA[topicId]) return;
    var m = S.mastery[topicId] || (S.mastery[topicId] = { s: 0.5, n: 0 });
    m.s = m.s + alpha * ((ok ? 1 : 0) - m.s);
    m.n++;
    m.at = todayStr();
  }
  function schedule(qid, ok) {
    if (!ok) { S.review[qid] = { box: 0, due: addDays(todayStr(), REVIEW_DAYS[0]) }; return; }
    var r = S.review[qid];
    if (!r) return;
    r.box++;
    if (r.box >= REVIEW_DAYS.length) delete S.review[qid];
    else r.due = addDays(todayStr(), REVIEW_DAYS[r.box]);
  }
  function masteryOf(topicId) {
    var m = S.mastery[topicId];
    return m && m.n ? m : null;
  }
  function masteryLevel(m) {
    if (!m) return "";
    return m.s >= 0.8 ? "high" : m.s >= 0.6 ? "mid" : "low";
  }
  function pctOf(x) { return Math.round(x * 100); }
  function dueIds() {
    var t = todayStr();
    return Object.keys(S.review).filter(function (id) { return S.review[id].due <= t && qById(id); });
  }
  // 약한 주제: 두 번 이상 풀었고 숙련도 60% 미만, 약한 순
  function weakTopics() {
    return Object.keys(S.mastery).filter(function (id) {
      var m = S.mastery[id];
      return m.n >= 2 && m.s < 0.6 && topicIndex(id) >= 0;
    }).sort(function (a, b) { return S.mastery[a].s - S.mastery[b].s; });
  }

  // 처음 한 번: 이미 쌓인 기록(푼 문제, 오답 노트, 실전 기출)으로 숙련도와 복습 일정을 채운다
  function initAdapt() {
    if (!S.mastery) S.mastery = {};
    if (!S.review) S.review = {};
    if (S.adaptV) return;
    var wrongIds = {};
    S.wrong.forEach(function (w) { wrongIds[w.id] = true; });
    var seen = Object.keys(S.seen).map(qById).filter(Boolean);
    seen.filter(function (q) { return !wrongIds[q.id]; }).forEach(function (q) { learn(q.concept, true, ALPHA); });
    seen.filter(function (q) { return wrongIds[q.id]; }).forEach(function (q) { learn(q.concept, false, ALPHA); });
    S.wrong.forEach(function (w) { if (!S.review[w.id]) S.review[w.id] = { box: 0, due: todayStr() }; });
    var M = mockState();
    EXAMS.forEach(function (ex) {
      (M.hist[ex.round] || []).forEach(function (rec) { learnMock(ex, rec.ans.split("").map(Number)); });
    });
    S.adaptV = 1;
    save();
  }
  function learnMock(ex, ans) {
    for (var i = 0; i < 50; i++) learn(ex.tags[i][0], ans[i] === +ex.ans[i], ALPHA_MOCK);
  }

  // 약한 주제 문제가 앞으로 오되, 한 주제가 몰리지 않게 같은 주제 안에서 뒤로 갈수록 조금씩 밀어낸다
  function byNeed(list) {
    var groups = {};
    shuffle(list).forEach(function (q) { (groups[q.concept] = groups[q.concept] || []).push(q); });
    var keyed = [];
    Object.keys(groups).forEach(function (c) {
      var m = masteryOf(c), w = 1 - (m ? m.s : 0.5);
      groups[c].forEach(function (q, k) { keyed.push({ q: q, key: w - 0.15 * k + Math.random() * 0.2 }); });
    });
    keyed.sort(function (a, b) { return b.key - a.key; });
    return keyed.map(function (x) { return x.q; });
  }

  // 맞춤 문제: 복습 차례 문제를 먼저, 나머지는 배운 범위(오늘 포함)에서 약한 주제 위주로
  function adaptiveFilter() { return { concepts: conceptsUpTo(todayLastDay()) }; }
  function adaptiveList(n) {
    var due = shuffle(dueIds().map(qById));
    var have = {};
    due.forEach(function (q) { have[q.id] = true; });
    var rest = pickQuestions(adaptiveFilter(), 0).filter(function (q) { return !have[q.id]; });
    return due.concat(rest).slice(0, n);
  }
  function startAdaptive(n) {
    startQuizFor(adaptiveFilter(), n, "study", adaptiveList(n));
    run.adaptive = true;
  }
  function adaptiveSummary() {
    var due = dueIds().length, weak = weakTopics();
    var parts = [];
    if (due) parts.push("복습 차례 <b>" + due + "문제</b>");
    if (weak.length) parts.push("약한 주제 " + weak.slice(0, 3).map(function (id) { return esc(topicTitle(id)); }).join(", "));
    return parts.length ? parts.join(" · ") : "풀수록 약한 주제와 틀린 문제 위주로 바뀝니다.";
  }

  function renderAdaptiveCard() {
    var box = $("#quiz-adaptive-sum");
    if (box) box.innerHTML = adaptiveSummary();
  }

  // ---------- 문제 ----------
  var quizEras = ["all"], quizN = 10, quizMode = "study";
  var run = null;

  function initQuiz() {
    var host = $("#quiz-eras");
    var html = '<button class="mini active" data-era="all">전체</button>' +
      '<button class="mini" data-era="learned">배운 범위까지</button>';
    (window.CONCEPTS || []).forEach(function (e) {
      html += '<button class="mini" data-era="' + e.id + '">' + esc(e.short) + "</button>";
    });
    host.innerHTML = html;
    $$("button", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var era = b.dataset.era;
        if (era === "all" || era === "learned") {
          quizEras = [era];
        } else {
          quizEras = quizEras.filter(function (x) { return x !== "all" && x !== "learned"; });
          var i = quizEras.indexOf(era);
          if (i === -1) quizEras.push(era); else quizEras.splice(i, 1);
          if (!quizEras.length) quizEras = ["all"];
        }
        $$("button", host).forEach(function (x) {
          x.classList.toggle("active", quizEras.indexOf(x.dataset.era) !== -1);
        });
      });
    });

    $$("#quiz-count button").forEach(function (b) {
      b.addEventListener("click", function () {
        $$("#quiz-count button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        quizN = parseInt(b.dataset.n, 10);
      });
    });
    $$("#quiz-mode button").forEach(function (b) {
      b.addEventListener("click", function () {
        $$("#quiz-mode button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        quizMode = b.dataset.m;
      });
    });
    $("#quiz-start").addEventListener("click", function () {
      startQuizFor(setupFilter(), quizN, quizMode);
    });
    $("#quiz-adaptive-go").addEventListener("click", function () { startAdaptive(10); });
    renderAdaptiveCard();
  }

  function setupFilter() {
    if (quizEras[0] === "learned") return { concepts: conceptsUpTo(todayLastDay()) };
    return { eras: quizEras };
  }

  // filter: { concepts:[주제 id] } 또는 { eras:[시대 id | "all"] }
  function pickQuestions(filter, n) {
    filter = filter || { eras: ["all"] };
    var pool = (window.QUIZ || []).filter(function (q) {
      if (filter.concepts) return filter.concepts.indexOf(q.concept) !== -1;
      var eras = filter.eras || ["all"];
      if (eras.indexOf("all") !== -1) return true;
      return eras.indexOf(q.era) !== -1;
    });
    // 복습 차례 → 안 푼 문제(약한 주제부터) → 틀렸던 문제 → 이미 맞힌 문제(약한 주제부터)
    var wrongIds = {}, t = todayStr();
    S.wrong.forEach(function (w) { wrongIds[w.id] = true; });
    var due = [], fresh = [], wrong = [], done = [];
    pool.forEach(function (q) {
      var r = S.review[q.id];
      if (r && r.due <= t) due.push(q);
      else if (!S.seen[q.id]) fresh.push(q);
      else if (wrongIds[q.id]) wrong.push(q);
      else done.push(q);
    });
    pool = shuffle(due).concat(byNeed(fresh), shuffle(wrong), byNeed(done));
    return n > 0 ? pool.slice(0, n) : pool;
  }
  function countUnseen(filter) {
    return pickQuestions(filter, 0).filter(function (q) { return !S.seen[q.id]; }).length;
  }
  function questionStatus(q) {
    var r = S.review[q.id];
    if (r && r.due <= todayStr()) return "review";
    if (!S.seen[q.id]) return "fresh";
    return S.wrong.some(function (w) { return w.id === q.id; }) ? "wrong" : "again";
  }

  function startQuizFor(filter, n, mode, preset) {
    var list = preset || pickQuestions(filter, n);
    if (!list.length) { alert("해당 범위의 문제가 없습니다."); return; }
    run = { list: list, i: 0, answers: [], mode: mode || "study", filter: filter, n: n,
      status: list.map(questionStatus), fb: [] };
    showView("quiz");
    $("#quiz-setup").classList.add("hidden"); $("#quiz-official").classList.add("hidden"); $("#quiz-adaptive").classList.add("hidden");
    $("#quiz-result").classList.add("hidden");
    $("#quiz-run").classList.remove("hidden");
    renderQuestion();
  }

  var STATUS_LABEL = { fresh: "처음 푸는 문제", wrong: "틀렸던 문제", again: "다시 푸는 문제",
    review: "복습 차례", twin: "방금 틀린 주제 확인" };

  // 채점 뒤: 이 주제 숙련도가 어떻게 바뀌었는지, 다음에 무엇이 바뀌는지 보여 준다
  function adaptNote(q, f) {
    if (!f) return "";
    var title = topicTitle(q.concept), up = f.after >= f.before;
    var html = '<div class="ex-adapt"><div class="ex-mastery">「' + esc(title) + "」 숙련도 " +
      pctOf(f.before) + '% → <b class="' + (up ? "up" : "down") + '">' + pctOf(f.after) + "%</b> " + (up ? "▲" : "▼") + "</div>";
    if (!f.ok) {
      var notes = [];
      if (f.twinAt != null) notes.push(f.twinAt - run.list.indexOf(q) <= 1 ? "다음에 같은 주제 문제가 한 번 더 나옵니다." : (f.twinAt - run.list.indexOf(q) - 1) + "문제 뒤에 같은 주제 문제가 한 번 더 나옵니다.");
      notes.push("이 문제는 내일 복습 차례로 다시 냅니다.");
      html += '<div class="ex-next">' + notes.join(" ") + "</div>" +
        '<button type="button" class="mini" id="q-concept">개념 다시 보기</button>';
    }
    return html + "</div>";
  }

  function renderQuestion() {
    var q = run.list[run.i];
    var picked = run.answers[run.i];
    var revealed = picked !== undefined && run.mode === "study";
    var pct = Math.round(run.i / run.list.length * 100);

    var html =
      '<div class="q-progress"><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="q-count">' + (run.i + 1) + " / " + run.list.length + "</span></div>" +
      '<div class="q-card">' +
      '<div class="q-meta"><span class="q-tag">' + esc(ERA_NAMES[q.era] || q.era) + "</span>" +
      // 주제 태그는 답을 암시하므로 채점 뒤에만 보여 준다
      (revealed ? '<span class="q-tag">' + esc(q.topic) + "</span>" : "") +
      '<span class="q-tag diff">난이도 ' + q.diff + "/5</span>" +
      (run.status ? '<span class="q-tag st-' + run.status[run.i] + '">' +
        STATUS_LABEL[run.status[run.i]] + "</span>" : "") +
      "</div>" +
      '<div class="q-stem">' + esc(q.stem) + "</div>" +
      (q.img ? figureHtml(q.img, revealed) : "") +
      '<div class="q-choices">';

    q.choices.forEach(function (c, idx) {
      var cls = "choice";
      if (revealed) {
        if (idx === q.answer) cls += " correct";
        else if (idx === picked) cls += " wrong";
      } else if (picked === idx) cls += " picked";
      html += '<button class="' + cls + '" data-idx="' + idx + '"' + (revealed ? " disabled" : "") + ">" +
        '<span class="n">' + (idx + 1) + "</span><span>" + esc(c) + "</span></button>";
    });
    html += "</div>";

    if (revealed) {
      var ok = picked === q.answer;
      html += '<div class="explain"><div class="ex-head ' + (ok ? "ok" : "no") + '">' +
        (ok ? "정답입니다" : "오답입니다 · 정답 " + (q.answer + 1) + "번") + "</div>" +
        linkTerms(esc(q.explain), q.era, {}) + '<div class="ex-kw">핵심어 · ' + esc(q.keyword) + "</div>" +
        adaptNote(q, run.fb && run.fb[run.i]) + "</div>";
    }

    html += '<div class="q-nav">' +
      '<button class="mini" id="q-prev"' + (run.i === 0 ? " disabled" : "") + ">이전</button>" +
      '<button class="mini" id="q-next">' + (run.i === run.list.length - 1 ? "채점하기" : "다음") + "</button>" +
      "</div></div>";

    $("#quiz-run").innerHTML = html;

    $$("#quiz-run .choice").forEach(function (b) {
      b.addEventListener("click", function () {
        pick(parseInt(b.dataset.idx, 10));
      });
    });
    var cb = $("#q-concept");
    if (cb) cb.addEventListener("click", function () { openConceptFor({ concepts: [q.concept] }); });
    $("#q-prev").addEventListener("click", function () {
      if (run.i > 0) { run.i--; renderQuestion(); }
    });
    $("#q-next").addEventListener("click", function () {
      if (run.i === run.list.length - 1) finishQuiz();
      else { run.i++; renderQuestion(); }
    });
  }

  function pick(idx) {
    var q = run.list[run.i];
    if (run.mode === "study" && run.answers[run.i] !== undefined) return;
    run.answers[run.i] = idx;
    if (run.mode === "study") {
      var f = record(q, idx);
      if (!f.ok) f.twinAt = addTwin(q);
      if (!run.fb) run.fb = [];
      run.fb[run.i] = f;
      renderQuestion();
    } else {
      renderQuestion();
      if (run.i < run.list.length - 1) {
        setTimeout(function () { run.i++; renderQuestion(); }, 160);
      }
    }
  }

  // 방금 틀린 주제에서 아직 이 판에 없는 문제 하나를 2문제 뒤에 끼운다 (안 푼 문제 먼저).
  // 한 판에 최대 5개, 한 주제에 2개까지라 끝없이 늘어나지 않는다
  function addTwin(q) {
    run.twins = run.twins || 0;
    run.twinBy = run.twinBy || {};
    if (run.twins >= 5 || (run.twinBy[q.concept] || 0) >= 2) return null;
    var inRun = {};
    run.list.forEach(function (x) { inRun[x.id] = true; });
    var cands = (window.QUIZ || []).filter(function (x) { return x.concept === q.concept && !inRun[x.id]; });
    if (!cands.length) return null;
    var fresh = cands.filter(function (x) { return !S.seen[x.id]; });
    var twin = shuffle(fresh.length ? fresh : cands)[0];
    var at = Math.min(run.i + 3, run.list.length);
    run.list.splice(at, 0, twin);
    if (run.answers.length > at) run.answers.splice(at, 0, undefined);
    if (run.fb && run.fb.length > at) run.fb.splice(at, 0, undefined);
    run.status.splice(at, 0, "twin");
    run.twins++;
    run.twinBy[q.concept] = (run.twinBy[q.concept] || 0) + 1;
    return at;
  }

  function record(q, idx) {
    var ok = idx === q.answer;
    var before = masteryOf(q.concept) ? S.mastery[q.concept].s : 0.5;
    learn(q.concept, ok, ALPHA);
    schedule(q.id, ok);
    if (!S.stats[q.era]) S.stats[q.era] = { ok: 0, n: 0 };
    S.stats[q.era].n++;
    if (ok) S.stats[q.era].ok++;
    S.seen[q.id] = true;

    S.wrong = S.wrong.filter(function (w) { return w.id !== q.id; });
    if (!ok) S.wrong.unshift({ id: q.id, mine: idx, at: todayStr() });
    save();
    return { ok: ok, before: before, after: S.mastery[q.concept] ? S.mastery[q.concept].s : before };
  }

  function finishQuiz() {
    if (run.mode === "test") {
      run.list.forEach(function (q, i) {
        if (run.answers[i] !== undefined) record(q, run.answers[i]);
      });
    }
    var ok = 0;
    run.list.forEach(function (q, i) { if (run.answers[i] === q.answer) ok++; });
    var total = run.list.length;
    var score = Math.round(ok / total * 100);
    var grade = score >= 80 ? "심화 1급 수준" : score >= 70 ? "심화 2급 수준" : score >= 60 ? "심화 3급 수준" : "불합격 구간";
    var msg = score >= 80 ? "이 페이스면 1급 충분합니다. 남은 기간은 근현대와 오답 노트에 집중하세요."
      : score >= 70 ? "2급은 안정권입니다. 틀린 시대 개념을 한 번 더 보면 1급이 보입니다."
      : score >= 60 ? "3급 합격선입니다. 오답 노트를 두 번 돌면 확실해집니다."
      : "개념 탭에서 해당 시대를 다시 읽고 같은 범위를 한 번 더 푸세요.";

    if (run.filter) {
      var left = countUnseen(run.filter);
      msg += left ? " 이 범위에 아직 안 푼 문제가 " + left + "개 남았습니다. 같은 범위 다시를 누르면 그 문제부터 나옵니다."
                  : " 이 범위의 문제를 모두 한 번씩 풀었습니다. 이제 틀렸던 문제부터 다시 나옵니다.";
    }
    if (run.n > 0 && total < run.n) {
      msg += " 이 범위에 준비된 문제는 " + total + "개입니다. 대시보드의 배운 범위 누적으로 더 풀 수 있습니다.";
    }

    var wrongList = [];
    run.list.forEach(function (q, i) {
      if (run.answers[i] !== q.answer) wrongList.push({ q: q, mine: run.answers[i] });
    });

    var html = '<div class="card result-hero">' +
      '<div class="result-score">' + score + "점</div>" +
      '<div class="result-grade">' + grade + " · " + ok + " / " + total + "문항</div>" +
      '<p class="result-msg">' + msg + "</p>" +
      '<div class="result-actions">' +
      '<button class="primary" id="res-again">' + (run.adaptive ? "맞춤 10문제 더" : "같은 범위 다시") + "</button>" +
      (wrongList.length ? '<button class="mini" id="res-twins">틀린 주제만 더 풀기</button>' : "") +
      '<button class="mini" id="res-wrong">오답 노트 보기</button>' +
      '<button class="mini" id="res-home">설정으로</button>' +
      "</div></div>";

    if (wrongList.length) {
      html += '<div class="card"><h2>틀린 문제 ' + wrongList.length + "개</h2>" +
        wrongList.map(function (w) {
          return '<div class="wrong-item"><div class="wrong-stem">' + esc(w.q.stem) + "</div>" + (w.q.img ? figureHtml(w.q.img, true) : "") +
            '<div class="wrong-ans">정답 ' + (w.q.answer + 1) + "번 · " + esc(w.q.choices[w.q.answer]) + "</div>" +
            (w.mine !== undefined ? '<div class="wrong-mine">내 답 ' + (w.mine + 1) + "번 · " + esc(w.q.choices[w.mine]) + "</div>" : '<div class="wrong-mine">무응답</div>') +
            '<div class="wrong-ex">' + linkTerms(esc(w.q.explain), w.q.era, {}) + "</div></div>";
        }).join("") + "</div>";
    }

    $("#quiz-run").classList.add("hidden");
    $("#quiz-result").classList.remove("hidden");
    $("#quiz-result").innerHTML = html;

    var last = run;
    var wrongConcepts = [];
    wrongList.forEach(function (w) { if (wrongConcepts.indexOf(w.q.concept) === -1) wrongConcepts.push(w.q.concept); });
    var tw = $("#res-twins");
    if (tw) tw.addEventListener("click", function () {
      startQuizFor({ concepts: wrongConcepts }, Math.min(10, wrongConcepts.length * 3), "study");
    });
    $("#res-again").addEventListener("click", function () {
      if (last.retryWrong) { $("#wrong-retry").click(); return; }
      if (last.adaptive) { startAdaptive(10); return; }
      startQuizFor(last.filter, last.n, last.mode);
    });
    $("#res-wrong").addEventListener("click", function () { showView("wrong"); });
    $("#res-home").addEventListener("click", function () {
      $("#quiz-result").classList.add("hidden");
      $("#quiz-setup").classList.remove("hidden"); $("#quiz-official").classList.remove("hidden");
      $("#quiz-adaptive").classList.remove("hidden"); renderAdaptiveCard();
    });
  }

  // ---------- 실전 기출 (공식 문제지 + 답안지 채점) ----------
  // 문제지 PDF는 사용자가 고른 파일을 이 기기(IndexedDB)에만 보관한다. 서버로 올리지 않는다.
  var EXAMS = window.EXAMS || [];
  var EXAM_URL = "https://www.historyexam.go.kr/pst/list.do?bbs=dat";
  var EXAM_SECS = 80 * 60;
  var CIRCLED = ["①", "②", "③", "④", "⑤"];
  var TOPIC_ERA = {};
  (window.CONCEPTS || []).forEach(function (e) { e.topics.forEach(function (t) { TOPIC_ERA[t.id] = e.id; }); });
  var mockTimer = null, mockUrl = null;

  function mockState() {
    if (!S.mock) S.mock = { cur: null, hist: {} };
    return S.mock;
  }
  function examByRound(r) {
    for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].round === r) return EXAMS[i];
    return null;
  }
  function tagEra(tag) { return TOPIC_ERA[tag[0]] || tag[0]; }
  function gradeOf(score) {
    return score >= 80 ? "1급" : score >= 70 ? "2급" : score >= 60 ? "3급" : "불합격";
  }
  function clock(secs) {
    var s = Math.abs(Math.round(secs));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function score(ex, ans) {
    var pts = 0, right = 0;
    for (var i = 0; i < 50; i++) if (ans[i] === +ex.ans[i]) { pts += +ex.pts[i]; right++; }
    return { pts: pts, right: right };
  }

  // 문제지 PDF 보관 (브라우저 IndexedDB, 이 기기 안에서만)
  function pdfDb(cb) {
    try {
      var rq = indexedDB.open("hanneung_pdf", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("files"); };
      rq.onsuccess = function () { cb(rq.result); };
      rq.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function pdfGet(round, cb) {
    pdfDb(function (db) {
      if (!db) return cb(null);
      try {
        var g = db.transaction("files").objectStore("files").get(String(round));
        g.onsuccess = function () { cb(g.result || null); };
        g.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }
  function pdfPut(round, blob, done) {
    pdfDb(function (db) {
      if (!db) return done && done(false);
      try {
        var tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(blob, String(round));
        tx.oncomplete = function () { done && done(true); };
        tx.onerror = function () { done && done(false); };
      } catch (e) { done && done(false); }
    });
  }
  function pdfKeys(cb) {
    pdfDb(function (db) {
      if (!db) return cb([]);
      try {
        var g = db.transaction("files").objectStore("files").getAllKeys();
        g.onsuccess = function () { cb(g.result || []); };
        g.onerror = function () { cb([]); };
      } catch (e) { cb([]); }
    });
  }

  function showMockPart(part) {
    ["pick", "run", "result"].forEach(function (p) { $("#mock-" + p).classList.toggle("hidden", p !== part); });
    if (part !== "run") { pauseMock(); stopMockTimer(); }
  }

  // 시간은 '시작'을 누른 동안만 흐른다. elapsed = 지금까지 흐른 초, runSince = 흐르기 시작한 시각(멈춰 있으면 null)
  function mockElapsed(cur) {
    return (cur.elapsed || 0) + (cur.runSince ? (Date.now() - cur.runSince) / 1000 : 0);
  }
  function setMockRunning(on) {
    var cur = mockState().cur;
    if (!cur) return;
    if (on && !cur.runSince) cur.runSince = Date.now();
    if (!on && cur.runSince) { cur.elapsed = mockElapsed(cur); cur.runSince = null; }
    save();
    paintMockGate();
  }
  function pauseMock() {
    var cur = mockState().cur;
    if (cur && cur.runSince) setMockRunning(false);
  }
  // 멈춰 있으면 문제를 가리고 시작/계속하기 버튼을 보여 준다 (PDF 고르기와 보기 전환은 그대로 쓸 수 있다)
  function paintMockGate() {
    var cur = mockState().cur, run = $("#mock-run");
    if (!cur || !run) return;
    var on = !!cur.runSince, fresh = !on && !cur.elapsed;
    run.classList.toggle("paused", !on);
    var btn = $("#mock-go");
    if (btn) {
      btn.textContent = on ? "일시정지" : fresh ? "시작" : "계속하기";
      btn.className = on ? "mini" : "primary small";
    }
    var body = $("#mock-paper .paper-body");
    if (body) {
      var g = body.querySelector(".mock-gate");
      if (!g) { g = document.createElement("div"); g.className = "mock-gate"; body.appendChild(g); }
      g.classList.toggle("hidden", on);
      if (!on) {
        g.innerHTML = '<div class="gate-box"><b>' + (fresh ? "준비되면 시작을 누르세요" : "일시정지 중") + "</b><p>" +
          (fresh ? "누르는 순간부터 80분이 흐릅니다.<br>문제는 시작한 뒤에 보입니다."
            : "남은 시간 " + clock(Math.max(0, EXAM_SECS - mockElapsed(cur))) + "<br>나가 있는 동안에는 시간이 흐르지 않습니다.") +
          '</p><button class="primary">' + (fresh ? "시작" : "계속하기") + "</button></div>";
        g.querySelector("button").addEventListener("click", function () { setMockRunning(true); });
      }
    }
    tickMock();
  }
  function stopMockTimer() {
    if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
  }

  function renderMockPick() {
    showMockPart("pick");
    var M = mockState();
    var host = $("#mock-pick");
    var rows = EXAMS.map(function (ex) {
      var hist = M.hist[ex.round] || [];
      var best = hist.reduce(function (b, h) { return Math.max(b, h.score); }, -1);
      var going = M.cur && M.cur.round === ex.round;
      return '<div class="mock-row" data-round="' + ex.round + '">' +
        '<div class="mock-row-main"><b>제' + ex.round + '회</b><span class="mock-date">' + ex.date.replace(/-/g, ".") + "</span>" +
        '<span class="mock-pdf-badge hidden">PDF 있음</span></div>' +
        '<div class="mock-row-score">' + (going ? '<span class="mock-going">푸는 중 · 남은 시간 ' + clock(Math.max(0, EXAM_SECS - mockElapsed(M.cur))) + "</span><br>" : "") +
        (best >= 0 ? "최고 <b>" + best + "점</b> · " + gradeOf(best) + " · " + hist.length + "회 응시" : "아직 안 풀었음") + "</div>" +
        '<div class="mock-row-btns">' +
        (going ? '<button class="mini active" data-act="resume">이어 풀기</button>' : "") +
        '<button class="mini' + (going ? "" : " active") + '" data-act="start">' + (going ? "처음부터" : "풀기") + "</button>" +
        (hist.length ? '<button class="mini" data-act="last">지난 결과</button>' : "") +
        "</div></div>";
    }).join("");
    host.innerHTML =
      '<div class="card mock-guide"><h2>이렇게 푸세요</h2><ol>' +
      '<li><a href="' + EXAM_URL + '" target="_blank" rel="noopener">한국사능력검정시험 시험 자료실</a>에서 풀 회차의 <b>심화 문제지 PDF</b>를 받아 둡니다.</li>' +
      "<li>아래에서 회차를 고르고, 화면의 <b>문제지 PDF 열기</b>로 받은 파일을 고릅니다. 한 번 고르면 이 기기에 저장되어 다음부터는 바로 열립니다.</li>" +
      "<li><b>시작</b>을 눌러야 80분이 흐르기 시작합니다. 화면을 벗어나면 저절로 멈추고, 돌아와서 <b>계속하기</b>를 누르면 이어서 흐릅니다.</li>" +
      "<li>문제가 한 문제씩 크게 뜹니다. 아래 ①~⑤를 누르면 답이 찍히고 다음 문제로 넘어갑니다. 키보드는 <b>1~5</b>로 답, <b>← →</b>로 이동합니다.</li>" +
      "<li>다 풀면 <b>제출</b>을 누르세요. 공식 정답표로 채점하고, 틀린 문제는 그 자리에서 다시 볼 수 있습니다.</li></ol>" +
      '<p class="mock-note">문제지는 국사편찬위원회 저작물이라 이 사이트에는 올리지 않습니다. 고른 PDF는 서버로 가지 않고 이 브라우저 안에서만 열립니다. 정답·배점은 공식 정답표 기준입니다.</p></div>' +
      '<div class="card"><h2>회차 고르기 <small>심화</small></h2><div class="mock-rows">' + rows + "</div></div>";

    pdfKeys(function (keys) {
      keys.forEach(function (k) {
        var row = host.querySelector('.mock-row[data-round="' + k + '"] .mock-pdf-badge');
        if (row) row.classList.remove("hidden");
      });
    });
    $$(".mock-row button", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var r = +b.closest(".mock-row").dataset.round;
        var act = b.dataset.act;
        if (act === "resume") return startMock(r, false);
        if (act === "last") {
          var h = mockState().hist[r];
          return renderMockResult(r, h[h.length - 1]);
        }
        if (M.cur && M.cur.round === r && M.cur.ans.some(function (a) { return a; }) &&
            !confirm("찍어 둔 답을 지우고 처음부터 풀까요?")) return;
        startMock(r, true);
      });
    });
  }

  function startMock(round, fresh) {
    var M = mockState();
    if (fresh || !M.cur || M.cur.round !== round) {
      M.cur = { round: round, ans: [], q: 0, elapsed: 0, runSince: null };
      for (var i = 0; i < 50; i++) M.cur.ans.push(0);
      save();
    }
    renderMockRun();
  }

  function renderMockRun() {
    var M = mockState(), cur = M.cur, ex = examByRound(cur.round);
    if (cur.q == null) cur.q = 0;
    showMockPart("run");
    setTopbarH();
    var host = $("#mock-run");
    var omr = "";
    for (var i = 0; i < 50; i++) {
      omr += '<div class="omr-row" data-q="' + i + '"><button type="button" class="omr-n" title="' + (i + 1) + '번 문제 보기">' + (i + 1) + "</button>";
      for (var c = 1; c <= 5; c++) {
        omr += '<button type="button" class="omr-b' + (cur.ans[i] === c ? " on" : "") + '" data-c="' + c + '" aria-label="' +
          (i + 1) + "번 " + c + '번">' + c + "</button>";
      }
      omr += "</div>";
    }
    host.innerHTML =
      '<div class="mock-bar">' +
      '<div class="mock-title">제' + ex.round + "회 심화</div>" +
      '<div class="mock-clock" id="mock-clock">80:00</div>' +
      '<div class="mock-count" id="mock-count"></div>' +
      '<div class="mock-bar-btns"><button class="primary small" id="mock-go">시작</button><button class="mini" id="mock-quit">나가기</button>' +
      '<button class="primary small" id="mock-submit">제출하고 채점</button></div></div>' +
      '<div class="mock-grid">' +
      '<div class="mock-paper" id="mock-paper"></div>' +
      '<div class="mock-omr"><div class="omr-head">답안지 <small>번호를 누르면 그 문제로 갑니다 · 동그라미를 다시 누르면 지워짐</small></div>' +
      '<div class="omr-list" id="omr-list">' + omr + "</div></div></div>";

    $$(".omr-b", host).forEach(function (b) {
      b.addEventListener("click", function () { pickMock(+b.closest(".omr-row").dataset.q, +b.dataset.c, true); });
    });
    $$(".omr-n", host).forEach(function (b) {
      b.addEventListener("click", function () { goMock(+b.closest(".omr-row").dataset.q); });
    });
    $("#mock-quit").addEventListener("click", function () { renderMockPick(); });
    $("#mock-go").addEventListener("click", function () { setMockRunning(!mockState().cur.runSince); });
    $("#mock-submit").addEventListener("click", function () {
      var blank = cur.ans.filter(function (a) { return !a; }).length;
      if (!confirm(blank ? "아직 " + blank + "문항에 답이 없습니다. 이대로 제출할까요?" : "제출하고 채점할까요?")) return;
      submitMock();
    });

    paintMockCount();
    paintMockGate();
    stopMockTimer();
    mockTimer = setInterval(tickMock, 1000);
    loadMockPaper(cur.round);
  }

  function paintMockCount() {
    var cur = mockState().cur, el = $("#mock-count");
    if (!cur || !el) return;
    el.textContent = "답 " + cur.ans.filter(function (a) { return a; }).length + "/50";
  }
  function tickMock() {
    var cur = mockState().cur, el = $("#mock-clock");
    if (!cur || !el) return stopMockTimer();
    // 흐르는 중이면 5초마다 저장해 둔다 (창이 갑자기 닫혀도 몇 초만 잃게)
    if (cur.runSince && Date.now() - cur.runSince > 5000) { cur.elapsed = mockElapsed(cur); cur.runSince = Date.now(); save(); }
    var left = EXAM_SECS - mockElapsed(cur);
    el.textContent = left >= 0 ? clock(left) : "+" + clock(left) + " 초과";
    el.classList.toggle("warn", left < 10 * 60 && left >= 0);
    el.classList.toggle("over", left < 0);
    el.classList.toggle("paused", !cur.runSince);
  }

  // 답 고르기. fromOmr가 아니고 처음 고른 답이면 다음 문제로 넘어간다
  function pickMock(i, c, fromOmr) {
    var cur = mockState().cur;
    if (!cur || !cur.runSince) return;
    var first = !cur.ans[i];
    cur.ans[i] = cur.ans[i] === c ? 0 : c;
    save();
    var row = $('.omr-row[data-q="' + i + '"]');
    if (row) $$(".omr-b", row).forEach(function (x) { x.classList.toggle("on", +x.dataset.c === cur.ans[i]); });
    paintMockCount();
    paintQv();
    if (!fromOmr && first && cur.ans[i] && i < 49 && i === cur.q) {
      setTimeout(function () { if (mockState().cur === cur && cur.q === i) goMock(i + 1); }, 260);
    }
  }
  function goMock(i) {
    var cur = mockState().cur;
    if (!cur) return;
    i = Math.max(0, Math.min(49, i));
    if (i === cur.q && $("#qv-canvas") && $("#qv-canvas").width) return paintQv();
    cur.q = i; save();
    paintQv();
    drawQ();
    var paper = $("#mock-paper");
    if (paper && paper.getBoundingClientRect().top < 0) window.scrollTo(0, window.scrollY + paper.getBoundingClientRect().top - 120);
  }

  // ---- 문제지 그리기: 사용자가 고른 PDF에서 문항 영역만 잘라 보여 준다 (pdf.js) ----
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  var pdfLibWait = null, mockDoc = null, drawSeq = 0;
  function loadPdfLib(cb) {
    if (window.pdfjsLib) return cb(window.pdfjsLib);
    if (!pdfLibWait) {
      pdfLibWait = [];
      var s = document.createElement("script");
      s.src = PDFJS + "pdf.min.js";
      var done = function () {
        var lib = window.pdfjsLib || null;
        if (lib) try { lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; } catch (e) {}
        var w = pdfLibWait; pdfLibWait = null;
        w.forEach(function (f) { f(lib); });
      };
      s.onload = done; s.onerror = done;
      document.head.appendChild(s);
    }
    pdfLibWait.push(cb);
  }
  function openMockDoc(round, blob, cb) {
    var key = round + ":" + blob.size;
    if (mockDoc && mockDoc.key === key) return cb(mockDoc.doc);
    loadPdfLib(function (lib) {
      if (!lib) return cb(null);
      blob.arrayBuffer().then(function (buf) {
        return lib.getDocument({ data: buf }).promise;
      }).then(function (doc) {
        if (mockDoc && mockDoc.doc) try { mockDoc.doc.destroy(); } catch (e) {}
        pageCache = [];
        mockDoc = { key: key, doc: doc };
        cb(doc);
      }, function () { cb(null); });
    });
  }
  function boxOf(ex, i) { return ex.boxes.split(";")[i].split(",").map(Number); }
  // 쪽 전체를 한 번만 그려 두고(최근 4쪽) 문항은 거기서 잘라 쓴다. 쪽을 매번 새로 그리면 느리다
  var pageCache = [];
  function pageCanvas(doc, pg) {
    var hit = pageCache.filter(function (c) { return c.doc === doc && c.pg === pg; })[0];
    if (hit) return hit.promise;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var target = Math.min(2600, Math.max(1500, Math.round(Math.min(window.innerWidth, 900) * dpr / 0.46)));
    var entry = { doc: doc, pg: pg };
    entry.promise = doc.getPage(pg).then(function (page) {
      var base = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: target / base.width });
      var c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      // intent "print": 화면용 렌더는 requestAnimationFrame을 써서 탭이 가려지면 멈춘다
      return page.render({ canvasContext: c.getContext("2d"), viewport: vp, intent: "print" }).promise.then(function () { return c; });
    });
    entry.promise.catch(function () { pageCache = pageCache.filter(function (x) { return x !== entry; }); });
    pageCache.unshift(entry);
    if (pageCache.length > 4) pageCache.length = 4;
    return entry.promise;
  }
  // 문항 i를 canvas에 그린다. widthFor(원본 폭, 원본 높이) → 화면 폭(px)
  function renderCrop(doc, ex, i, canvas, widthFor, done) {
    var box = boxOf(ex, i);
    pageCanvas(doc, box[0]).then(function (src) {
      var sx = box[1] * src.width, sy = box[2] * src.height;
      var sw = (box[3] - box[1]) * src.width, sh = (box[4] - box[2]) * src.height;
      var cssW = Math.round(widthFor(sw, sh));
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var dw = Math.min(Math.round(cssW * dpr), Math.round(sw));
      canvas.width = dw; canvas.height = Math.round(dw * sh / sw);
      canvas.style.width = cssW + "px";
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      done && done(true);
      // 앞뒤 문항이 있는 쪽을 미리 그려 둔다
      [i - 1, i + 1].forEach(function (j) { if (j >= 0 && j < 50) pageCanvas(doc, boxOf(ex, j)[0]); });
    }, function () { done && done(false); });
  }

  function loadMockPaper(round) {
    var host = $("#mock-paper");
    if (mockUrl) { URL.revokeObjectURL(mockUrl); mockUrl = null; }
    pdfGet(round, function (blob) {
      if (!document.body.contains(host)) return;
      if (blob) showPaper(host, round, blob);
      else {
        host.className = "mock-paper is-empty";
        host.innerHTML = '<div class="paper-empty">' +
          "<p><b>제" + round + "회 심화 문제지 PDF</b>를 열어 주세요.</p>" + pickerHtml("문제지 PDF 열기") +
          '<p class="mock-note">아직 없다면 <a href="' + EXAM_URL + '" target="_blank" rel="noopener">시험 자료실</a>에서 받으세요. ' +
          "고른 파일은 이 기기에만 저장되고, 다음부터는 바로 열립니다.</p>" +
          '<p class="mock-note">종이에 인쇄해서 풀어도 됩니다. 답안지와 타이머는 그대로 쓰면 됩니다.</p></div>';
        bindPicker(host, round);
      }
    });
  }
  function pickerHtml(label) {
    return '<label class="mini mock-file">' + label + '<input type="file" accept="application/pdf,.pdf" hidden></label>';
  }
  function bindPicker(host, round) {
    var input = host.querySelector('input[type="file"]');
    if (!input) return;
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var m = f.name.match(/(\d{2,3})\s*회/) || f.name.match(/^(\d{2,3})[_\s-]/);
      if (m && +m[1] !== round && !confirm("파일 이름으로는 제" + m[1] + "회 같습니다. 제" + round + "회 문제지로 쓸까요?")) return;
      var pdf = f.type === "application/pdf" ? f : new Blob([f], { type: "application/pdf" });
      pdfPut(round, pdf, function (ok) {
        // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 이번에만 연다
        if (ok) loadMockPaper(round); else showPaper(host, round, pdf);
      });
    });
  }
  function showPaper(host, round, blob, forceFull, note) {
    var M = mockState();
    var view = forceFull ? "full" : (M.view || "q");
    host.className = "mock-paper is-" + view;
    host.innerHTML = '<div class="paper-tools"><div class="seg">' +
      '<button class="mini' + (view === "q" ? " active" : "") + '" data-v="q">한 문제씩 크게</button>' +
      '<button class="mini' + (view === "full" ? " active" : "") + '" data-v="full">전체 문제지</button></div>' +
      pickerHtml("다른 파일로 바꾸기") + "</div>" +
      (note ? '<p class="mock-note paper-note">' + note + "</p>" : "") +
      '<div class="paper-body"></div>';
    $$(".seg button", host).forEach(function (b) {
      b.addEventListener("click", function () { M.view = b.dataset.v; save(); showPaper(host, round, blob); });
    });
    bindPicker(host, round);
    var body = host.querySelector(".paper-body");
    if (view === "full") {
      if (mockUrl) URL.revokeObjectURL(mockUrl);
      mockUrl = URL.createObjectURL(blob);
      body.innerHTML = '<iframe class="paper-frame" src="' + mockUrl + '#navpanes=0&view=FitH" title="제' + round + '회 문제지"></iframe>' +
        '<a class="paper-open" href="' + mockUrl + '" target="_blank" rel="noopener">새 창에서 보기</a>';
      paintMockGate();
      return;
    }
    body.innerHTML = '<div class="qv">' +
      '<div class="qv-img loading" id="qv-img"><canvas id="qv-canvas"></canvas></div>' +
      '<div class="qv-dock"><div class="qv-choices">' +
      [1, 2, 3, 4, 5].map(function (c) { return '<button type="button" class="qv-c" data-c="' + c + '">' + CIRCLED[c - 1] + "</button>"; }).join("") +
      '</div><div class="qv-nav"><button class="mini" id="qv-prev">← 이전</button>' +
      '<span class="qv-num" id="qv-num"></span><button class="mini" id="qv-next">다음 →</button></div></div></div>';
    $$(".qv-c", body).forEach(function (b) {
      b.addEventListener("click", function () { pickMock(M.cur.q, +b.dataset.c, false); });
    });
    $("#qv-prev").addEventListener("click", function () { goMock(M.cur.q - 1); });
    $("#qv-next").addEventListener("click", function () { goMock(M.cur.q + 1); });
    paintQv();
    paintMockGate();
    openMockDoc(round, blob, function (doc) {
      if (!document.body.contains(body)) return;
      if (!doc) return showPaper(host, round, blob, true, "문제를 잘라 보여 주는 기능을 불러오지 못해 전체 문제지로 보여 줍니다. (인터넷 연결을 확인해 주세요)");
      drawQ();
    });
  }
  function paintQv() {
    var cur = mockState().cur;
    if (!cur) return;
    $$(".omr-row.cur").forEach(function (r) { r.classList.remove("cur"); });
    var row = $('.omr-row[data-q="' + cur.q + '"]'), list = $("#omr-list");
    if (row) {
      row.classList.add("cur");
      if (list && (row.offsetTop < list.scrollTop || row.offsetTop > list.scrollTop + list.clientHeight - 30) && list.scrollHeight > list.clientHeight) {
        list.scrollTop = row.offsetTop - list.clientHeight / 2;
      }
    }
    var num = $("#qv-num");
    if (!num) return;
    num.textContent = (cur.q + 1) + " / 50";
    $$(".qv-c").forEach(function (b) { b.classList.toggle("on", +b.dataset.c === cur.ans[cur.q]); });
    $("#qv-prev").disabled = cur.q === 0;
    $("#qv-next").disabled = cur.q === 49;
  }
  function drawQ() {
    var cur = mockState().cur, wrap = $("#qv-img"), canvas = $("#qv-canvas");
    if (!cur || !mockDoc || !wrap || !canvas) return;
    var i = cur.q, ex = examByRound(cur.round);
    wrap.classList.add("loading");
    var seq = ++drawSeq;
    var target = document.createElement("canvas");
    var done = function (ok) {
      if (!ok || seq !== drawSeq || cur.q !== i) return;
      canvas.width = target.width; canvas.height = target.height; canvas.style.width = target.style.width;
      canvas.getContext("2d").drawImage(target, 0, 0);
      wrap.classList.remove("loading");
    };
    renderCrop(mockDoc.doc, ex, i, target, function (pw, ph) {
      // 화면 높이에 맞추되 너무 작아지지 않게 (휴대폰은 화면 폭 전체)
      var full = wrap.parentNode.clientWidth - 4;
      var fitH = (window.innerHeight - (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"), 10) || 100) - 200) * pw / ph;
      return Math.min(full, Math.max(fitH, Math.min(full, 520)));
    }, done);
  }

  function submitMock() {
    var M = mockState(), cur = M.cur, ex = examByRound(cur.round);
    var sc = score(ex, cur.ans);
    var rec = { at: todayStr(), score: sc.pts, right: sc.right,
      secs: Math.round(mockElapsed(cur)), ans: cur.ans.join("") };
    (M.hist[cur.round] = M.hist[cur.round] || []).push(rec);
    learnMock(ex, cur.ans);
    M.cur = null;
    save();
    renderMockResult(ex.round, rec);
  }

  function renderMockResult(round, rec) {
    showMockPart("result");
    var ex = examByRound(round);
    var ans = rec.ans.split("").map(Number);
    var byEra = {}, wrong = [];
    for (var i = 0; i < 50; i++) {
      var tag = ex.tags[i], era = tagEra(tag), p = +ex.pts[i], ok = ans[i] === +ex.ans[i];
      var b = byEra[era] = byEra[era] || { got: 0, all: 0, n: 0, ok: 0 };
      b.all += p; b.n++;
      if (ok) { b.got += p; b.ok++; }
      else wrong.push(i);
    }
    var eraOrder = (window.CONCEPTS || []).map(function (e) { return e.id; });
    var eraRows = eraOrder.filter(function (e) { return byEra[e]; }).map(function (e) {
      var b = byEra[e], pct = Math.round(b.got / b.all * 100);
      return '<div class="mock-era"><span class="mock-era-name">' + esc(ERA_NAMES[e] || e) + "</span>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span class="mock-era-num">' + b.ok + "/" + b.n + "문항 · " + b.got + "/" + b.all + "점</span></div>";
    }).join("");
    var wrongRows = wrong.map(function (i) {
      var tag = ex.tags[i], era = tagEra(tag), hasTopic = !!TOPIC_ERA[tag[0]];
      return '<div class="mock-wrong">' +
        '<span class="mock-wq">' + (i + 1) + "번</span>" +
        '<span class="mock-wtag"><span class="q-tag">' + esc(ERA_NAMES[era] || era) + "</span> " + esc(tag[1]) + "</span>" +
        '<span class="mock-wans">' + (ans[i] ? "내 답 " + CIRCLED[ans[i] - 1] : "무응답") +
        " → 정답 <b>" + CIRCLED[+ex.ans[i] - 1] + "</b> · " + ex.pts[i] + "점</span>" +
        '<button class="mini" data-crop="' + round + ":" + i + '">문제 보기</button>' +
        (hasTopic ? '<button class="mini" data-topic="' + tag[0] + '">개념 보기</button>' : "") + "</div>";
    }).join("");
    var hist = mockState().hist[round] || [];
    var over = rec.secs > EXAM_SECS;
    $("#mock-result").innerHTML =
      '<div class="card mock-score"><div class="mock-score-top">' +
      '<div><div class="mock-score-num">' + rec.score + '<small>점</small></div>' +
      '<div class="mock-grade g-' + (rec.score >= 60 ? "pass" : "fail") + '">' + gradeOf(rec.score) + "</div></div>" +
      '<div class="mock-score-meta">제' + round + "회 심화 · " + rec.at + "<br>맞힌 문항 " + rec.right + "/50<br>걸린 시간 " +
      Math.floor(rec.secs / 60) + "분 " + (rec.secs % 60) + "초" + (over ? ' <span class="over">(80분 초과)</span>' : "") + "</div></div>" +
      (hist.length > 1 ? '<div class="mock-hist">이 회차 기록 · ' + hist.map(function (h) { return h.score + "점"; }).join(" → ") + "</div>" : "") +
      '<div class="btn-group" style="margin-top:14px"><button class="mini active" id="mock-again">다시 풀기</button>' +
      (wrong.length ? '<button class="mini adapt-btn" id="mock-concepts">틀린 개념만 모아 보기</button>' : "") +
      '<button class="mini" id="mock-back">회차 목록</button></div></div>' +
      '<div class="card"><h2>시대별 점수</h2>' + eraRows + "</div>" +
      '<div class="card"><h2>틀린 문제 <small>' + wrong.length + "문항</small></h2>" +
      (wrong.length ? '<p class="mock-note">문제지에서 번호를 찾아 다시 보고, 헷갈린 개념은 "개념 보기"로 바로 확인하세요. 오답 노트 탭에도 모아 둡니다.</p>' + wrongRows
        : '<p class="empty">다 맞혔습니다!</p>') + "</div>";
    $("#mock-again").addEventListener("click", function () { startMock(round, true); });
    var mc = $("#mock-concepts");
    if (mc) mc.addEventListener("click", function () { showView("concept"); showWrong(round); });
    $("#mock-back").addEventListener("click", renderMockPick);
    bindTopicButtons($("#mock-result"));
    bindCropButtons($("#mock-result"));
    window.scrollTo(0, 0);
  }

  function bindTopicButtons(root) {
    $$("button[data-topic]", root).forEach(function (b) {
      b.addEventListener("click", function () { openConceptFor({ concepts: [b.dataset.topic] }); });
    });
  }

  // 오답 노트에 붙일 실전 기출 오답 (회차마다 가장 최근 응시 기준)
  function mockWrongHtml() {
    var M = mockState(), out = "";
    EXAMS.forEach(function (ex) {
      var hist = M.hist[ex.round];
      if (!hist || !hist.length) return;
      var rec = hist[hist.length - 1], ans = rec.ans.split("").map(Number), rows = "";
      for (var i = 0; i < 50; i++) {
        if (ans[i] === +ex.ans[i]) continue;
        var tag = ex.tags[i], era = tagEra(tag);
        rows += '<div class="mock-wrong"><span class="mock-wq">' + (i + 1) + "번</span>" +
          '<span class="mock-wtag"><span class="q-tag">' + esc(ERA_NAMES[era] || era) + "</span> " + esc(tag[1]) + "</span>" +
          '<span class="mock-wans">' + (ans[i] ? "내 답 " + CIRCLED[ans[i] - 1] : "무응답") + " → 정답 <b>" + CIRCLED[+ex.ans[i] - 1] + "</b></span>" +
          '<button class="mini" data-crop="' + ex.round + ":" + i + '">문제 보기</button>' +
          (TOPIC_ERA[tag[0]] ? '<button class="mini" data-topic="' + tag[0] + '">개념 보기</button>' : "") + "</div>";
      }
      if (rows) out += '<div class="card mock-wrong-card"><h2>실전 기출 제' + ex.round + "회 <small>" + rec.at + " · " + rec.score + "점</small></h2>" + rows + "</div>";
    });
    return out;
  }

  function initMock() {
    // 예전 방식(시작 시각만 저장)으로 풀던 기록은 멈춘 상태로 바꾼다. 흐르던 채로 창이 닫혔어도 멈춤으로 연다
    var M = mockState();
    if (M.cur) {
      if (M.cur.start != null) { M.cur.elapsed = 0; delete M.cur.start; }
      M.cur.runSince = null;
      save();
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pauseMock(); });
    window.addEventListener("pagehide", pauseMock);
    $$("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.goto); });
    });
    // 키보드: ←/→ 이전·다음 문제, 1~5 답 고르기
    document.addEventListener("keydown", function (e) {
      if (!$("#view-mock").classList.contains("active") || $("#mock-run").classList.contains("hidden")) return;
      var cur = mockState().cur;
      if (!cur || !cur.runSince || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") { goMock(cur.q + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { goMock(cur.q - 1); e.preventDefault(); }
      else if (/^[1-5]$/.test(e.key)) { pickMock(cur.q, +e.key, false); e.preventDefault(); }
    });
    var t = null;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if ($("#qv-canvas") && !$("#mock-run").classList.contains("hidden")) drawQ(); }, 200);
    });
  }

  // 결과·오답 노트에서 "문제 보기": 저장된 문제지에서 그 문항만 잘라 펼친다
  function bindCropButtons(root) {
    $$("button[data-crop]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".mock-wrong"), open = row.nextElementSibling;
        if (open && open.classList.contains("crop-box")) { open.remove(); b.textContent = "문제 보기"; return; }
        var parts = b.dataset.crop.split(":"), round = +parts[0], i = +parts[1], ex = examByRound(round);
        var box = document.createElement("div");
        box.className = "crop-box loading";
        box.innerHTML = '<canvas></canvas>';
        row.parentNode.insertBefore(box, row.nextSibling);
        b.textContent = "접기";
        pdfGet(round, function (blob) {
          if (!blob) {
            box.classList.remove("loading");
            box.innerHTML = '<p class="mock-note">이 기기에 제' + round + "회 문제지가 없습니다. 실전 기출에서 이 회차를 열 때 문제지 PDF를 고르면 여기서도 보입니다.</p>";
            return;
          }
          openMockDoc(round, blob, function (doc) {
            if (!doc) { box.classList.remove("loading"); box.innerHTML = '<p class="mock-note">문제를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p>'; return; }
            renderCrop(doc, ex, i, box.querySelector("canvas"), function () { return Math.min(box.clientWidth - 2, 720); },
              function () { box.classList.remove("loading"); });
          });
        });
      });
    });
  }

  // ---------- 오답 노트 ----------
  function qById(id) {
    var list = window.QUIZ || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function renderWrong() {
    var host = $("#wrong-list");
    var mockHtml = mockWrongHtml();
    if (!S.wrong.length) {
      host.innerHTML = mockHtml + '<p class="empty">' + (mockHtml ? "연습 문제 오답은 아직 없습니다." :
        "아직 오답이 없습니다. 문제를 풀면 틀린 문항이 여기 쌓입니다.") + "</p>";
      bindTopicButtons(host); bindCropButtons(host);
      return;
    }
    host.innerHTML = mockHtml + (mockHtml ? '<h2 class="wrong-sub">연습 문제 오답</h2>' : "") + S.wrong.map(function (w) {
      var q = qById(w.id);
      if (!q) return "";
      return '<div class="wrong-item">' +
        '<div class="q-meta"><span class="q-tag">' + esc(ERA_NAMES[q.era] || q.era) + "</span>" +
        '<span class="q-tag">' + esc(q.topic) + '</span><span class="q-tag">' + w.at + "</span></div>" +
        '<div class="wrong-stem">' + esc(q.stem) + "</div>" + (q.img ? figureHtml(q.img, true) : "") +
        '<div class="wrong-ans">정답 ' + (q.answer + 1) + "번 · " + esc(q.choices[q.answer]) + "</div>" +
        '<div class="wrong-mine">내 답 ' + (w.mine + 1) + "번 · " + esc(q.choices[w.mine]) + "</div>" +
        '<div class="wrong-ex">' + linkTerms(esc(q.explain), q.era, {}) + '<div class="ex-kw" style="margin-top:6px;font-size:12px">핵심어 · ' + esc(q.keyword) + "</div></div></div>";
    }).join("");
    bindTopicButtons(host); bindCropButtons(host);
  }

  function initWrong() {
    $("#wrong-retry").addEventListener("click", function () {
      var list = S.wrong.map(function (w) { return qById(w.id); }).filter(Boolean);
      if (!list.length) { alert("오답 노트가 비어 있습니다."); return; }
      list = shuffle(list);
      run = { list: list, i: 0, answers: [], mode: "study", retryWrong: true, n: 0,
        status: list.map(function () { return "wrong"; }) };
      showView("quiz");
      $("#quiz-setup").classList.add("hidden"); $("#quiz-official").classList.add("hidden"); $("#quiz-adaptive").classList.add("hidden");
      $("#quiz-result").classList.add("hidden");
      $("#quiz-run").classList.remove("hidden");
      renderQuestion();
    });
    $("#wrong-clear").addEventListener("click", function () {
      if (!confirm("연습 문제 오답을 모두 비울까요? (실전 기출 점수 기록은 그대로 남습니다)")) return;
      S.wrong = []; save(); renderWrong();
    });
  }

  // ---------- 연표 (타임라인) ----------
  var TL_COLORS = { red: "var(--tl-red)", blue: "var(--tl-blue)", green: "var(--tl-green)", orange: "var(--tl-orange)", brown: "var(--tl-brown)", gray: "var(--tl-gray)" };
  function tlColor(c) { return TL_COLORS[c] || TL_COLORS.gray; }
  function yearText(y) { return y < 0 ? "BC " + (-y) : String(y); }

  // 기간을 행 구간으로 바꾸고, 겹치는 기간은 서로 다른 줄(lane)에 배치한다
  function layoutGroup(g) {
    var rows = g.rows.slice().sort(function (a, b) { return a.y - b.y; });
    var first = rows[0].y, last = rows[rows.length - 1].y;
    var bars = [];
    g.periods.forEach(function (p) {
      if (p.t < first || p.f > last) return;
      var s = rows.length - 1, e = 0, i;
      for (i = 0; i < rows.length; i++) if (rows[i].y >= p.f) { s = i; break; }
      for (i = rows.length - 1; i >= 0; i--) if (rows[i].y <= p.t) { e = i; break; }
      if (e < s) e = s;
      bars.push({ p: p, s: s, e: e, fromBefore: p.f < first, toAfter: p.t > last });
    });
    bars.sort(function (a, b) { return a.s - b.s || (b.e - b.s) - (a.e - a.s); });
    var laneEnd = [];
    bars.forEach(function (b) {
      var lane = 0;
      while (lane < laneEnd.length && laneEnd[lane] >= b.s) lane++;
      laneEnd[lane] = b.e;
      b.lane = lane;
    });
    var chips = rows.map(function () { return []; });
    bars.forEach(function (b) {
      if (!b.fromBefore) chips[b.s].push({ n: b.p.n, kind: "start", c: b.p.c, y: rows[b.s].y !== b.p.f ? b.p.f : null });
      if (!b.toAfter) chips[b.e].push({ n: b.p.n, kind: "end", c: b.p.c, y: rows[b.e].y !== b.p.t ? b.p.t : null });
    });
    return { rows: rows, bars: bars, lanes: Math.max(1, laneEnd.length), chips: chips };
  }

  function chipHtml(ch) {
    return '<span class="tl-chip ' + ch.kind + '" style="--c:' + tlColor(ch.c) + '">' +
      esc(ch.n) + (ch.kind === "start" ? " 시작" : " 끝") +
      (ch.y !== null ? " <small>" + yearText(ch.y) + "</small>" : "") + "</span>";
  }

  // "사건: 설명" 형식이면 제목과 설명을 나눠 보여준다
  function itemHtml(t) {
    var k = t.indexOf(": ");
    if (k === -1) return "<li><b>" + esc(t) + "</b></li>";
    return "<li><b>" + esc(t.slice(0, k)) + "</b><span>" + esc(t.slice(k + 2)) + "</span></li>";
  }

  function cardHtml(r, chips, withYear) {
    var pivot = chips.some(function (c) { return c.kind === "end"; }) && chips.some(function (c) { return c.kind === "start"; });
    var multi = r.items.length > 1;
    return '<div class="tl-card' + (multi ? " multi" : "") + (pivot ? " pivot" : "") + '">' +
      (withYear ? '<div class="tl-card-year">' + esc(r.label) + "</div>" : "") +
      (pivot ? '<div class="tl-tag pivot">전환점</div>' : multi ? '<div class="tl-tag">같은 해 ' + r.items.length + "건</div>" : "") +
      (chips.length ? '<div class="tl-chips">' + chips.map(chipHtml).join("") + "</div>" : "") +
      '<ul class="tl-items">' + r.items.map(itemHtml).join("") + "</ul>" +
      (r.note ? '<p class="tl-note">' + esc(r.note) + "</p>" : "") +
      "</div>";
  }

  // 모든 시대를 하나로 합친다. 같은 해의 사건은 한 칸으로 모으고, 시대 구간을 따로 기록한다
  function mergedTimeline() {
    var byY = {}, periods = [], eras = [];
    (window.TIMELINE || []).forEach(function (g) {
      g.rows.forEach(function (r) {
        var m = byY[r.y];
        if (!m) byY[r.y] = { y: r.y, label: r.label, items: r.items.slice(), note: r.note || "" };
        else {
          r.items.forEach(function (it) { if (m.items.indexOf(it) === -1) m.items.push(it); });
          if (r.note) m.note = m.note ? m.note + " · " + r.note : r.note;
        }
      });
      periods = periods.concat(g.periods);
    });
    var rows = Object.keys(byY).map(function (k) { return byY[k]; }).sort(function (x, y) { return x.y - y.y; });
    (window.TIMELINE || []).forEach(function (g, gi) {
      var ys = g.rows.map(function (r) { return r.y; });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), s = -1, en = -1;
      rows.forEach(function (r, i) { if (r.y >= lo && r.y <= hi) { if (s === -1) s = i; en = i; } });
      eras.push({ g: g.g, s: s, e: en, i: gi });
    });
    // 시대 구간이 서로 겹치지 않게 앞 시대가 뒤 시대 시작 전에 끝나도록 자른다
    eras.forEach(function (er, k) { if (k > 0 && er.s <= eras[k - 1].e) er.s = eras[k - 1].e + 1; });
    return { g: "전체", rows: rows, periods: periods, eras: eras };
  }

  function renderTimelineAll() {
    var M = mergedTimeline();
    var L = layoutGroup(M);
    var n = L.rows.length, ER = L.lanes + 1;
    var html = '<section class="tl-group tl-all">' +
      '<div class="tl-head"><div><h2>한국사 전체 타임라인</h2><span class="tl-range">' +
      yearText(L.rows[0].y) + " ~ " + yearText(L.rows[n - 1].y) + " · 사건 " + n + "칸 · 기간 " + L.bars.length + "개 · 옆으로 넘겨 보세요</span></div>" +
      '<div class="tl-nav"><button class="tl-arrow" data-dir="-1" aria-label="이전">&#8249;</button>' +
      '<button class="tl-arrow" data-dir="1" aria-label="다음">&#8250;</button></div></div>' +
      '<div class="tl-scroll" id="tl-scroll"><div class="tl-track" style="--cols:' + n + ";--lanes:" + L.lanes + '">';
    M.eras.forEach(function (er, k) {
      if (er.s < 0 || er.e < er.s) return;
      html += '<div class="tl-era' + (k % 2 ? " alt" : "") + '" style="grid-row:1;grid-column:' + (er.s + 1) + " / " + (er.e + 2) + '">' +
        '<span class="tl-era-label">' + esc(er.g) + "</span></div>";
    });
    L.bars.forEach(function (b) {
      html += '<div class="tl-bar' + (b.fromBefore ? " from-before" : "") + (b.toAfter ? " to-after" : "") +
        '" style="grid-row:' + (b.lane + 2) + ";grid-column:" + (b.s + 1) + " / " + (b.e + 2) + ";--c:" + tlColor(b.p.c) +
        '" title="' + esc(b.p.n + " " + yearText(b.p.f) + "~" + yearText(b.p.t)) + '">' +
        '<span class="tl-bar-label"><b>' + esc(b.p.n) + "</b><small>" + yearText(b.p.f) + "~" + yearText(b.p.t) + "</small></span></div>";
    });
    L.rows.forEach(function (r, i) {
      html += '<div class="tl-tick" data-col="' + i + '" style="grid-row:' + (ER + 1) + ";grid-column:" + (i + 1) + '"><span>' + esc(r.label) + "</span></div>" +
        '<div class="tl-cell" style="grid-row:' + (ER + 2) + ";grid-column:" + (i + 1) + '">' + cardHtml(r, L.chips[i], false) + "</div>";
    });
    tlEras = M.eras;
    return html + "</div></div></section>";
  }
  var tlEras = [];

  // 검색: 사건·설명에 걸리는 행 + 이름이 걸리는 기간 안의 모든 행 (시대별 목록)
  function renderTimelineSearch(q) {
    var html = "";
    (window.TIMELINE || []).forEach(function (g) {
      var L = layoutGroup(g);
      var hitPeriods = g.periods.filter(function (p) { return p.n.toLowerCase().indexOf(q) !== -1; });
      var idx = [];
      L.rows.forEach(function (r, i) {
        var hay = (r.label + " " + r.items.join(" ") + " " + (r.note || "")).toLowerCase();
        var inPeriod = hitPeriods.some(function (p) { return r.y >= p.f && r.y <= p.t; });
        if (hay.indexOf(q) !== -1 || inPeriod) idx.push(i);
      });
      if (!idx.length) return;
      html += '<section class="tl-group"><div class="tl-head"><div><h2>' + esc(g.g) + '</h2><span class="tl-range">' +
        idx.length + "칸 찾음" + (hitPeriods.length ? " · " + hitPeriods.map(function (p) {
          return esc(p.n) + " " + yearText(p.f) + "~" + yearText(p.t);
        }).join(", ") : "") + "</span></div></div>" +
        '<div class="tl-results">' + idx.map(function (i) { return cardHtml(L.rows[i], L.chips[i], true); }).join("") + "</div></section>";
    });
    return html;
  }

  function renderTimeline() {
    var q = $("#tl-search").value.trim().toLowerCase();
    var html = q ? renderTimelineSearch(q) : renderTimelineAll();
    $("#tl-jump").innerHTML = q ? "" : (window.TIMELINE || []).map(function (g, i) {
      return '<button class="mini" data-jump="' + i + '">' + esc(g.g) + "</button>";
    }).join("");
    $("#timeline-list").innerHTML = html || '<p class="empty">검색 결과가 없습니다.</p>';
    if (!q) markActiveEra();
  }

  function tlScroller() { return document.getElementById("tl-scroll"); }
  function colLeft(i) {
    var t = document.querySelector('.tl-tick[data-col="' + i + '"]');
    return t ? t.offsetLeft : 0;
  }
  // 지금 화면 왼쪽에 걸린 열이 속한 시대를 버튼에 표시
  function markActiveEra() {
    var sc = tlScroller(); if (!sc) return;
    var first = document.querySelector('.tl-tick[data-col="0"]');
    var w = first ? first.offsetWidth : 188;
    var col = Math.round(sc.scrollLeft / w);
    var cur = 0;
    tlEras.forEach(function (er) { if (er.s >= 0 && col >= er.s) cur = er.i; });
    var act = null;
    $$("#tl-jump [data-jump]").forEach(function (b) {
      var on = +b.dataset.jump === cur;
      b.classList.toggle("active", on);
      if (on) act = b;
    });
    // 현재 시대 버튼이 버튼 줄 밖에 있으면 보이는 곳으로 당겨온다
    var bar = $("#tl-jump");
    if (act && bar) {
      var l = act.offsetLeft, r = l + act.offsetWidth;
      if (l < bar.scrollLeft) bar.scrollLeft = l - 8;
      else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8;
    }
  }

  function initTimeline() {
    $("#tl-search").addEventListener("input", renderTimeline);
    $("#timeline-list").addEventListener("click", function (e) {
      var b = e.target.closest(".tl-arrow"), sc = tlScroller();
      if (b && sc) sc.scrollBy({ left: parseInt(b.dataset.dir, 10) * sc.clientWidth * 0.8, behavior: "smooth" });
    });
    // 스크롤 중에는 80ms마다, 멈추면 한 번 더 현재 시대를 갱신
    var lastMark = 0, trail = null;
    $("#timeline-list").addEventListener("scroll", function (e) {
      if (e.target.id !== "tl-scroll") return;
      var now = Date.now();
      if (now - lastMark > 80) { lastMark = now; markActiveEra(); }
      clearTimeout(trail);
      trail = setTimeout(markActiveEra, 120);
    }, true);
    $("#tl-jump").addEventListener("click", function (e) {
      var b = e.target.closest("[data-jump]"), sc = tlScroller();
      if (!b || !sc) return;
      var er = tlEras[+b.dataset.jump];
      if (er && er.s >= 0) sc.scrollTo({ left: colLeft(er.s), behavior: "smooth" });
    });
    renderTimeline();
  }


  // ---------- 약점 분석 ----------
  // 어디를 고치면 점수가 가장 많이 오르나: 시험 출제 비중(문항 수) × 틀리는 비율 × 2점.
  // 실전 기출은 연습 문제보다 실제 시험에 가까워 두 배로 쳐 준다. 푼 문항이 적은 시대는 순위에서 뺀다
  var ANA_MIN = 5;

  function analyze() {
    var eras = (window.CONCEPTS || []).map(function (e) {
      var st = S.stats[e.id] || { ok: 0, n: 0 };
      return { id: e.id, name: e.short, ratio: e.ratio, pOk: st.ok, pN: st.n, mOk: 0, mN: 0, topics: {} };
    });
    var byId = {};
    eras.forEach(function (e) { byId[e.id] = e; });
    function miss(topicId, w) {
      var e = byId[TOPIC_ERA[topicId]];
      if (e) e.topics[topicId] = (e.topics[topicId] || 0) + w;
    }
    // 연습 문제: 오답 노트에 남아 있는 문제 (다시 맞히면 빠진다)
    S.wrong.forEach(function (w) { var q = qById(w.id); if (q) miss(q.concept, 1); });
    // 실전 기출: 회차마다 가장 최근 응시
    var M = mockState(), mocks = [];
    EXAMS.forEach(function (ex) {
      var hist = M.hist[ex.round];
      if (!hist || !hist.length) return;
      var rec = hist[hist.length - 1], ans = rec.ans.split("").map(Number);
      mocks.push({ round: ex.round, at: rec.at, score: rec.score, ex: ex, ans: ans });
      for (var i = 0; i < 50; i++) {
        var tag = ex.tags[i], e = byId[tagEra(tag)], ok = ans[i] === +ex.ans[i];
        if (e) { e.mN++; if (ok) e.mOk++; }
        if (!ok) miss(tag[0], 2);
      }
    });
    mocks.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });

    // 배운 범위 = 완료 표시한 날까지 (오늘 범위는 아직 안 배운 것으로 본다)
    var learned = {};
    conceptsUpTo(currentPlan().day - 1).forEach(function (id) { learned[TOPIC_ERA[id]] = true; });
    eras.forEach(function (e) {
      var n = e.pN + 2 * e.mN, ok = e.pOk + 2 * e.mOk;
      e.n = e.pN + e.mN;
      e.acc = n ? ok / n : null;
      e.enough = e.n >= ANA_MIN;
      e.gain = e.enough ? (1 - e.acc) * e.ratio * 2 : 0;
      e.learned = !!learned[e.id];
      e.weak = Object.keys(e.topics).sort(function (a, b) { return e.topics[b] - e.topics[a]; });
    });
    var ranked = eras.filter(function (e) { return e.enough && e.gain >= 0.5; })
      .sort(function (a, b) { return b.gain - a.gain; });
    var thin = eras.filter(function (e) { return e.learned && !e.enough; });

    var pOk = 0, pN = 0;
    eras.forEach(function (e) { pOk += e.pOk; pN += e.pN; });
    var last = mocks[mocks.length - 1] || null;
    return { eras: eras, ranked: ranked, thin: thin, mocks: mocks, last: last, pOk: pOk, pN: pN,
      left: daysBetween(todayStr(), window.EXAM_DATE) };
  }

  function topicTitle(id) {
    var i = topicIndex(id);
    return i < 0 ? id : TOPICS[i].t.title;
  }

  function accColor(pct) { return pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--orange)" : "var(--bad)"; }
  function eraSrc(e) {
    var src = [];
    if (e.mN) src.push("실전 " + e.mOk + "/" + e.mN);
    if (e.pN) src.push("연습 " + e.pOk + "/" + e.pN);
    return src.join(" · ");
  }

  function renderAnalysis() {
    var box = $("#analysis-box");
    if (!box) return;
    var a = analyze(), left = Math.max(0, a.left), html = "";

    // 지금 점수와 목표까지 남은 점수
    var now = a.last ? a.last.score : (a.pN >= 20 ? Math.round(a.pOk / a.pN * 100) : null);
    html += '<div class="card"><h2>지금 점수</h2>';
    if (now != null) {
      var basis = a.last ? "최근 실전 " + a.last.round + "회 (" + a.last.at.slice(5).replace("-", ".") + ")" : "연습 문제 정답률로 어림";
      var goals = [[80, "1급"], [70, "2급"], [60, "3급"]].map(function (g) {
        var gap = g[0] - now;
        return '<span class="ana-gap' + (gap <= 0 ? " ok" : "") + '">' + g[1] + (gap <= 0 ? " 도달" : "까지 " + gap + "점") + "</span>";
      }).join("");
      html += '<div class="ana-goal"><div class="ana-now"><b>' + now + '</b><small>점</small></div>' +
        '<div class="ana-goal-r"><div class="ana-basis">' + basis + " · " + gradeOf(now) + " · 시험까지 " + left + "일</div>" +
        '<div class="ana-gaps">' + goals + "</div></div></div>";
      if (a.mocks.length > 1) html += '<p class="ana-hint">실전 기록 · ' + a.mocks.map(function (m) { return m.round + "회 " + m.score + "점"; }).join(" → ") + "</p>";
    } else {
      html += '<p class="ana-hint">실전 기출을 한 회 풀면 지금 점수와 등급까지 남은 점수가 여기에 뜹니다.</p>' +
        '<button type="button" class="mini" data-goto-view="mock">실전 기출 풀러 가기</button>';
    }
    html += "</div>";

    // 점수 올릴 여지가 큰 시대 TOP 3
    html += '<div class="card"><h2>먼저 고칠 곳 <small>점수 올릴 여지 순</small></h2>';
    if (a.ranked.length) {
      html += '<ol class="ana-list">' + a.ranked.slice(0, 3).map(function (e, k) {
        var pct = Math.round(e.acc * 100);
        var chips = e.weak.slice(0, 4).map(function (id) {
          return '<button type="button" class="kw ana-topic" data-ana-topic="' + id + '">' + esc(topicTitle(id)) + "</button>";
        }).join("");
        return '<li class="ana-item"><span class="ana-rank">' + (k + 1) + "</span>" +
          '<div class="ana-body"><div class="ana-line"><b class="ana-era">' + esc(e.name) + "</b>" +
          '<span class="ana-pct" style="color:' + accColor(pct) + '">정답률 ' + pct + "%</span>" +
          '<span class="ana-src">' + eraSrc(e) + " · 시험에 약 " + e.ratio + "문항</span>" +
          '<span class="ana-gain">최대 +' + (Math.round(e.gain * 10) / 10) + "점</span></div>" +
          (chips ? '<div class="ana-topics"><small>자주 틀린 주제</small>' + chips + "</div>" : "") +
          '<div class="ana-acts"><button type="button" class="mini" data-ana-quiz="' + e.id + '">이 시대 문제 10개</button></div></div></li>';
      }).join("") + "</ol>";
      var sum = a.ranked.slice(0, 3).reduce(function (t, e) { return t + e.gain; }, 0);
      html += '<p class="ana-hint">이 ' + Math.min(3, a.ranked.length) + "곳만 다 맞히게 되면 최대 <b>+" + Math.round(sum) +
        "점</b>입니다. 남은 " + left + "일 동안 플랜 진도와 함께 하루 한 곳씩 돌아가며 개념 → 문제 10개 순서로 도세요.</p>";
    } else {
      html += '<p class="ana-hint">아직 순위를 매길 만큼 푼 문제가 없습니다. 시대마다 ' + ANA_MIN + "문항 이상 풀면 약한 곳 순위가 나옵니다.</p>";
    }
    html += "</div>";

    // 주제 숙련도: 약한 주제와 복습 일정
    var weak = weakTopics(), t0 = todayStr(), t1 = addDays(t0, 1), rv = { today: 0, tomorrow: 0, later: 0 };
    Object.keys(S.review).forEach(function (id) {
      var d = S.review[id].due;
      if (d <= t0) rv.today++; else if (d === t1) rv.tomorrow++; else rv.later++;
    });
    html += '<div class="card"><h2>약한 주제 <small>풀 때마다 바뀝니다</small></h2>';
    if (weak.length) {
      html += '<div class="ana-weak">' + weak.slice(0, 6).map(function (id) {
        var m = S.mastery[id];
        return '<div class="ana-wk"><span class="ana-wk-name">' + esc(topicTitle(id)) + "</span>" +
          '<div class="bar"><i style="width:' + pctOf(m.s) + "%;background:" + accColor(pctOf(m.s)) + '"></i></div>' +
          '<span class="ana-wk-pct">' + pctOf(m.s) + "%</span>" +
          '<button type="button" class="mini" data-ana-topic="' + id + '">개념</button>' +
          '<button type="button" class="mini" data-ana-tquiz="' + id + '">문제 5개</button></div>';
      }).join("") + "</div>";
    } else {
      html += '<p class="ana-hint">아직 약한 주제가 없습니다. 같은 주제를 두 번 이상 풀었는데 숙련도가 60% 아래면 여기에 뜹니다.</p>';
    }
    html += '<div class="ana-review"><span>복습 일정</span><b>오늘 ' + rv.today + "</b><b>내일 " + rv.tomorrow + "</b><b>그 뒤 " + rv.later + "</b>" +
      '<button type="button" class="primary small" id="ana-adapt">맞춤 10문제 시작</button></div>' +
      '<p class="ana-hint">틀린 문제는 1일 → 3일 → 6일 뒤에 다시 나오고, 세 번 연달아 맞히면 복습에서 빠집니다.</p></div>';

    // 시대별 한눈에: 여지 큰 순, 데이터 부족은 아래로
    var rows = a.eras.filter(function (e) { return e.enough; }).sort(function (x, y) { return y.gain - x.gain; })
      .concat(a.eras.filter(function (e) { return !e.enough; }));
    html += '<div class="card"><h2>시대별 한눈에</h2><div class="ana-rows">' + rows.map(function (e) {
      var pct = e.acc == null ? 0 : Math.round(e.acc * 100);
      return '<div class="ana-row' + (e.enough ? "" : " dim") + '"><span class="ana-row-name">' + esc(e.name) + "</span>" +
        '<div class="bar"><i style="width:' + (e.enough ? pct : 0) + "%;background:" + accColor(pct) + '"></i></div>' +
        '<span class="ana-row-pct">' + (e.enough ? pct + "%" : "-") + "</span>" +
        '<span class="ana-row-src">' + (e.n ? eraSrc(e) : "안 풀었음") + "</span>" +
        '<span class="ana-row-gain">' + (e.enough ? (e.gain >= 0.05 ? "+" + (Math.round(e.gain * 10) / 10) + "점" : "충분") : "데이터 부족") + "</span></div>";
    }).join("") + "</div>";
    if (a.thin.length) {
      html += '<div class="ana-thin"><small>배웠는데 푼 문제가 적은 시대</small>' + a.thin.map(function (e) {
        return '<button type="button" class="mini" data-ana-quiz="' + e.id + '">' + esc(e.name) + " <small>" + e.n + "문항</small></button>";
      }).join("") + "</div>";
    }
    html += "</div>";
    box.innerHTML = html;

    $$("[data-ana-topic]", box).forEach(function (b) {
      b.addEventListener("click", function () { openConceptFor({ concepts: [b.dataset.anaTopic] }); });
    });
    $$("[data-ana-quiz]", box).forEach(function (b) {
      b.addEventListener("click", function () { startQuizFor({ eras: [b.dataset.anaQuiz] }, 10, "study"); });
    });
    $$("[data-ana-tquiz]", box).forEach(function (b) {
      b.addEventListener("click", function () { startQuizFor({ concepts: [b.dataset.anaTquiz] }, 5, "study"); });
    });
    var ad = $("#ana-adapt", box);
    if (ad) ad.addEventListener("click", function () { startAdaptive(10); });
    $$("[data-goto-view]", box).forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.gotoView); });
    });
  }

  // AI 상담용: 내 기록을 질문 글로 정리해 클립보드에 넣는다. 사이트는 아무 데도 보내지 않는다
  function analysisPrompt() {
    var a = analyze(), L = [];
    var p = currentPlan();
    L.push("한국사능력검정시험 심화를 준비하고 있습니다. 아래 내 학습 기록을 보고 도와주세요.");
    L.push("");
    L.push("- 시험일: " + window.EXAM_DATE + " (남은 " + Math.max(0, a.left) + "일)");
    L.push("- 목표: 1급(80점), 최소 3급(60점). 50문항 80분, 1·2·3점 배점");
    L.push("- 학습 플랜 진도: 31일 중 DAY " + p.day + " (" + p.title + ")");
    L.push("");
    L.push("[시대별 정답률] (시험 출제 비중은 대략적인 문항 수)");
    a.eras.forEach(function (e) {
      var parts = [];
      if (e.pN) parts.push("연습 " + e.pOk + "/" + e.pN);
      if (e.mN) parts.push("실전 " + e.mOk + "/" + e.mN);
      L.push("- " + e.name + " (약 " + e.ratio + "문항): " + (parts.length ? parts.join(", ") + " · " + Math.round(e.acc * 100) + "%" : "아직 안 풀었음"));
    });
    var weak = weakTopics();
    if (weak.length) {
      L.push("");
      L.push("[숙련도가 낮은 주제] (최근 결과에 무게를 둔 정답률)");
      weak.slice(0, 8).forEach(function (id) {
        L.push("- " + topicTitle(id) + ": " + pctOf(S.mastery[id].s) + "% (" + S.mastery[id].n + "번 풂)");
      });
    }
    if (a.mocks.length) {
      L.push("");
      L.push("[실전 기출 점수] (회차별 가장 최근 응시)");
      a.mocks.forEach(function (m) { L.push("- 제" + m.round + "회: " + m.score + "점 " + gradeOf(m.score) + " (" + m.at + ")"); });
      L.push("");
      L.push("[실전 기출에서 틀린 문항] (문제 원문은 저작권 때문에 주제만)");
      a.mocks.forEach(function (m) {
        var rows = [];
        for (var i = 0; i < 50; i++) {
          if (m.ans[i] === +m.ex.ans[i]) continue;
          rows.push((i + 1) + "번 " + m.ex.tags[i][1] + " (" + (m.ans[i] ? "내 답 " + m.ans[i] : "무응답") + ", 정답 " + m.ex.ans[i] + ", " + m.ex.pts[i] + "점)");
        }
        if (rows.length) L.push("- 제" + m.round + "회: " + rows.join(" / "));
      });
    }
    var wr = S.wrong.slice(0, 30).map(function (w) { return { w: w, q: qById(w.id) }; }).filter(function (x) { return x.q; });
    if (wr.length) {
      L.push("");
      L.push("[연습 문제 오답] (최근 " + wr.length + "개)");
      wr.forEach(function (x, k) {
        var q = x.q, stem = q.stem.replace(/\s+/g, " ").trim();
        if (stem.length > 140) stem = stem.slice(0, 140) + "…";
        L.push((k + 1) + ". [" + (ERA_NAMES[q.era] || q.era) + " · " + q.topic + "] " + stem);
        L.push("   내 답: " + (x.w.mine !== undefined ? q.choices[x.w.mine] : "무응답") + " / 정답: " + q.choices[q.answer]);
      });
    }
    L.push("");
    L.push("부탁할 것:");
    L.push("1. 내가 자주 틀리는 패턴을 찾아 주세요 (헷갈리는 짝, 약한 문제 유형, 시대).");
    L.push("2. 헷갈리는 개념은 구분법을 표로 정리해 주세요.");
    L.push("3. 남은 " + Math.max(0, a.left) + "일 동안 하루 단위 공부 순서를 짜 주세요. 점수가 많이 오를 곳부터.");
    return L.join("\n");
  }

  function initAnalysis() {
    var btn = $("#ana-copy");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var text = analysisPrompt();
      var done = function () {
        btn.textContent = "복사됨 ✓";
        setTimeout(function () { btn.textContent = "AI 상담용 복사"; }, 2200);
      };
      var fallback = function () {
        var ta = $("#ana-text");
        ta.value = text; ta.classList.remove("hidden");
        ta.focus(); ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        if (ok) done(); else btn.textContent = "아래 글을 직접 복사하세요";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  }

  // ---------- 테마 ----------
  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function paintThemeButton() {
    var dark = currentTheme() === "dark";
    var b = $("#theme-toggle");
    b.textContent = dark ? "\u2600" : "\u263E";
    b.title = dark ? "라이트 모드로" : "다크 모드로";
  }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 휴대폰 주소창 색도 테마에 맞춘다
  function paintMetaColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", currentTheme() === "dark" ? "#131416" : "#8b1e2d");
  }

  // 전환 효과: 최신 브라우저는 화면 전체를 부드럽게 겹쳐 바꾸고,
  // 지원하지 않으면 색만 서서히 바꾼다. 움직임 줄이기 설정이면 즉시 바꾼다.
  function withThemeTransition(change) {
    var html = document.documentElement;
    if (reduceMotion) { change(); return; }
    if (document.startViewTransition && !document.hidden) {
      html.classList.add("theme-vt");
      var t = document.startViewTransition(change);
      var done = function () { html.classList.remove("theme-vt"); };
      // 빠르게 연달아 누르면 앞 전환이 취소되며 거부되는데, 색 변경 자체는 이미 끝났으므로 조용히 넘긴다
      t.ready.catch(function () {});
      t.finished.then(done, done);
      return;
    }
    html.classList.add("theme-anim");
    change();
    setTimeout(function () { html.classList.remove("theme-anim"); }, 520);
  }

  function initTheme() {
    paintThemeButton();
    paintMetaColor();
    var btn = $("#theme-toggle");
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      btn.classList.remove("spin"); void btn.offsetWidth; btn.classList.add("spin");
      withThemeTransition(function () {
        document.documentElement.setAttribute("data-theme", next);
        paintThemeButton();
        paintMetaColor();
      });
      try { localStorage.setItem("hanneung_theme", next); } catch (e) {}
    });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onSystem = function () {
        if (document.documentElement.getAttribute("data-theme")) return; // 직접 고른 경우는 그대로
        withThemeTransition(function () { paintThemeButton(); paintMetaColor(); });
      };
      if (mq.addEventListener) mq.addEventListener("change", onSystem);
    }
  }

  // ---------- 시작 ----------
  initSprint();
  initAdapt();
  initTheme();
  initGlossary();
  initTabs();
  initConcept();
  initNoteToggle();
  initBlank();
  initQuiz();
  initWrong();
  initMock();
  initTimeline();
  initReset();
  initAnalysis();
  initPlanCourse();
  renderPlan();
  renderDash();
})();
