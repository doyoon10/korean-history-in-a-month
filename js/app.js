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
      if (t) return t;
      var n = node.closest(".nt-note, .nt-mark");
      return n && !n.closest(".notes-open") ? n : null;
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
  function initTabs() {
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
    if (name !== "mock") return stopMockTimer();
    // 푸는 중이면 타이머만 다시 돌리고, 결과 화면은 그대로 두고, 나머지는 회차 목록을 새로 그린다
    if (!$("#mock-run").classList.contains("hidden") && mockState().cur) {
      tickMock(); stopMockTimer(); mockTimer = setInterval(tickMock, 1000);
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

  function renderToday() {
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
      "</div>";

    $("#today-done").addEventListener("click", function () {
      S.done[p.day] = !S.done[p.day]; save(); renderToday(); renderProgress(); renderPlan();
    });
    var cbtn = $("#today-concept");
    if (cbtn) cbtn.addEventListener("click", function () { openConceptFor(p); });
    var qbtn = $("#today-quiz");
    if (qbtn) qbtn.addEventListener("click", function () { startQuizFor(dayFilter(p), 10, "study"); });
    $("#today-learned").addEventListener("click", function () { startQuizFor(learnedFilter(p), 10, "study"); });
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
      return '<div class="acc-item"><div class="acc-name">' + esc(e.short) + "</div>" +
        '<div class="acc-num" style="color:' + color + '">' + (st.n ? pct + "%" : "-") +
        " <small>" + st.ok + "/" + st.n + "</small></div>" +
        '<div class="bar" style="margin-top:8px"><i style="width:' + pct + "%;background:" + color + '"></i></div>' +
        (st.n ? '<button class="mini acc-reset" data-reset="' + e.id + '">기록 지우기</button>' : "") +
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
    ids.forEach(function (id) { delete S.seen[id]; });
    S.wrong = S.wrong.filter(function (w) { return ids.indexOf(w.id) === -1; });
    save();
  }

  function initReset() {
    $("#acc-reset-all").addEventListener("click", function () {
      if (!confirm("모든 학습 기록을 지울까요?\n플랜 체크, 정답률, 오답 노트가 전부 사라집니다.")) return;
      S = { done: {}, stats: {}, wrong: [], seen: {}, course: S.course };
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
    var today = currentPlan().day;
    var planCourse = S.course || "all";
    var lastPhase = null;
    var html = "";
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
      var isToday = p.day === today;
      html +=
        '<div class="plan-item' + (isToday ? " today" : "") + (done ? " done" : "") + '" data-day="' + p.day + '">' +
        '<button class="plan-check' + (done ? " on" : "") + '" data-check="' + p.day + '">' + (done ? "✓" : "") + "</button>" +
        '<div class="plan-body">' +
        '<div class="plan-meta"><span>DAY ' + p.day + "</span><span>" + p.date + "</span><span>" + esc(p.time) + "</span>" +
        (p.core ? '<span class="badge-core" title="3급 목표라면 이 날만 해도 됩니다">★ 핵심</span>' : "") +
        (isToday ? '<span class="badge-today">오늘</span>' : "") + "</div>" +
        '<div class="plan-title">' + esc(p.title) + "</div>" +
        '<ul class="plan-todo">' + p.todo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        '<div class="plan-links">' +
        (p.concepts.length ? '<button class="mini" data-concept="' + p.day + '">개념 보기</button>' : "") +
        (p.concepts.length ? '<button class="mini" data-quiz="' + p.day + '">그날 문제 ' + countFor(dayFilter(p)) + "</button>" : "") +
        '<button class="mini" data-learned="' + p.day + '">누적 ' + countFor(learnedFilter(p)) + "</button>" +
        "</div></div></div>";
    });
    host.innerHTML = html;

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
  var conceptEra = "all";

  function initConcept() {
    var host = $("#concept-eras");
    var html = '<button class="mini active" data-era="all">전체</button>';
    (window.CONCEPTS || []).forEach(function (e) {
      html += '<button class="mini" data-era="' + e.id + '">' + esc(e.short) + "</button>";
    });
    host.innerHTML = html;
    $$("button", host).forEach(function (b) {
      b.addEventListener("click", function () {
        $$("button", host).forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        conceptEra = b.dataset.era;
        renderConcept();
      });
    });
    $("#concept-search").addEventListener("input", renderConcept);
    renderConcept();
  }

  function renderConcept(openIds) {
    var q = $("#concept-search").value.trim().toLowerCase();
    var host = $("#concept-list");
    var html = "";
    var hit = 0;

    (window.CONCEPTS || []).forEach(function (era) {
      if (conceptEra !== "all" && conceptEra !== era.id) return;
      var topics = era.topics.filter(function (t) {
        if (!q) return true;
        var hay = (t.title + " " + t.points.join(" ") + " " + t.keywords.join(" ") + " " + t.tip).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      if (!topics.length) return;
      hit += topics.length;
      html += '<div class="era-block"><h3 class="era-title">' + esc(era.name) +
        '<span class="era-ratio">약 ' + era.ratio + "문항</span></h3>";
      topics.forEach(function (t) {
        var open = q || (openIds && openIds.indexOf(t.id) !== -1);
        var seen = {};
        html +=
          '<div class="topic' + (open ? " open" : "") + '" id="topic-' + t.id + '">' +
          '<div class="topic-head"><span class="topic-arrow">▶</span><h3>' + esc(t.title) + "</h3></div>" +
          '<div class="topic-body"><ul class="points">' +
          t.points.map(function (p) { return noteBulletsHtml(p, era.id, seen, t.id); }).join("") + "</ul>" +
          (IMAGES_BY_TOPIC[t.id] ? '<div class="photo-row">' +
            IMAGES_BY_TOPIC[t.id].map(function (id) { return figureHtml(id, true); }).join("") + "</div>" : "") +
          '<div class="kw-row">' +
          t.keywords.map(function (k) { return '<span class="kw">' + linkTerms(esc(k), era.id, {}) + "</span>"; }).join("") +
          '</div><div class="tip">' + linkTerms(fmt(t.tip), era.id, seen) + "</div></div></div>";
      });
      html += "</div>";
    });

    host.innerHTML = hit ? html : '<p class="empty">검색 결과가 없습니다.</p>';
    $$(".topic-head", host).forEach(function (h) {
      h.addEventListener("click", function () { h.parentNode.classList.toggle("open"); });
    });
  }

  // 손필기 모양: "주체 : 핵심어들" 한 줄 + 아래에 'ㄴ→ 단어' (호버하면 종류·쉬운 뜻·괄호 속 참고)
  // ** 굵게와 줄바꿈(\n = ' / ')이 섞인 원문을 그리면서, 풀이가 달린 범위에 밑줄 span을 씌운다.
  // ranges: 굵게 표시를 뺀 글자 위치 기준 [{s, e, k}], 겹치지 않게 정렬된 상태
  // parens: 원래 괄호 [{pos, html}] (pos 순). 제자리에 숨겨 두고 "풀이 펼치기"일 때 파란 괄호로 보인다
  function renderMarked(raw, ranges, parens) {
    var out = "", p = 0, bold = false, mark = null, ri = 0, pi = 0;
    function flipB(on) { out += on ? "<b>" : "</b>"; }
    function closeMark() {
      if (bold) flipB(false);
      out += "</span>"; mark = null;
      if (bold) flipB(true);
    }
    function putParens(all) {
      while (pi < parens.length && (all || parens[pi].pos <= p)) {
        if (bold) flipB(false);
        out += '<span class="nt-inl">(' + parens[pi++].html + ")</span>";
        if (bold) flipB(true);
      }
    }
    for (var i = 0; i < raw.length; ) {
      if (raw.substr(i, 2) === "**") { bold = !bold; flipB(bold); i += 2; continue; }
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

  function noteBulletsHtml(raw, era, seen, topicId) {
    // 괄호에서 온 풀이: 라벨에 든 용어의 쉬운 뜻 + 괄호 속 내용(참고)
    // pos: 원래 괄호가 있던 자리 (굵게 표시를 뺀 글자 위치)
    function parenNote(n, at, pos) {
      var note = { label: n.label, at: at, pos: pos, detail: linkTerms(fmt(readable(n.text)), era, {}) };
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

    return window.parseNote(raw).map(function (b) {
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
        if (n.detail) (k < subjNotes.length ? subjParens : bodyParens).push({ pos: n.pos, html: n.detail });
      });
      function byPos(x, y) { return x.pos - y.pos; }

      return '<li class="nt"><div class="nt-main">' +
        (b.subject ? '<span class="nt-subj">' + renderMarked(b.subject, subjRanges, subjParens.sort(byPos)) + '</span><span class="nt-colon"> : </span>' : "") +
        renderMarked(joined, bodyRanges, bodyParens.sort(byPos)) + "</div>" +
        (notes.length ? '<div class="nt-notes">' + notes.map(function (n, k) { return noteHtml(n, k, !!n.detail); }).join("") + "</div>" : "") +
        "</li>";
    }).join("");
  }

  // 파란 풀이는 평소엔 단어만 보이고 마우스를 올리면(탭하면) 뜬다. "풀이 펼치기"를 켜면 모두 펼쳐 보인다
  var NOTES_KEY = "hanneung_notes_open";
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

  function openConceptFor(p) {
    if (!p || !p.concepts.length) return;
    conceptEra = "all";
    $$("#concept-eras button").forEach(function (x) { x.classList.toggle("active", x.dataset.era === "all"); });
    $("#concept-search").value = "";
    showView("concept");
    renderConcept(p.concepts);
    var first = document.getElementById("topic-" + p.concepts[0]);
    if (first) setTimeout(function () { first.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
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
  }

  function setupFilter() {
    if (quizEras[0] === "learned") return learnedFilter(currentPlan());
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
    // 안 푼 문제를 먼저, 그다음 틀렸던 문제, 마지막으로 이미 맞힌 문제
    var wrongIds = {};
    S.wrong.forEach(function (w) { wrongIds[w.id] = true; });
    var fresh = [], wrong = [], done = [];
    pool.forEach(function (q) {
      if (!S.seen[q.id]) fresh.push(q);
      else if (wrongIds[q.id]) wrong.push(q);
      else done.push(q);
    });
    pool = shuffle(fresh).concat(shuffle(wrong), shuffle(done));
    return n > 0 ? pool.slice(0, n) : pool;
  }
  function countUnseen(filter) {
    return pickQuestions(filter, 0).filter(function (q) { return !S.seen[q.id]; }).length;
  }
  function questionStatus(q) {
    if (!S.seen[q.id]) return "fresh";
    return S.wrong.some(function (w) { return w.id === q.id; }) ? "wrong" : "again";
  }

  function startQuizFor(filter, n, mode) {
    var list = pickQuestions(filter, n);
    if (!list.length) { alert("해당 범위의 문제가 없습니다."); return; }
    run = { list: list, i: 0, answers: [], mode: mode || "study", filter: filter, n: n,
      status: list.map(questionStatus) };
    showView("quiz");
    $("#quiz-setup").classList.add("hidden"); $("#quiz-official").classList.add("hidden");
    $("#quiz-result").classList.add("hidden");
    $("#quiz-run").classList.remove("hidden");
    renderQuestion();
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
        { fresh: "처음 푸는 문제", wrong: "틀렸던 문제", again: "다시 푸는 문제" }[run.status[run.i]] + "</span>" : "") +
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
        linkTerms(esc(q.explain), q.era, {}) + '<div class="ex-kw">핵심어 · ' + esc(q.keyword) + "</div></div>";
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
      record(q, idx);
      renderQuestion();
    } else {
      renderQuestion();
      if (run.i < run.list.length - 1) {
        setTimeout(function () { run.i++; renderQuestion(); }, 160);
      }
    }
  }

  function record(q, idx) {
    var ok = idx === q.answer;
    if (!S.stats[q.era]) S.stats[q.era] = { ok: 0, n: 0 };
    S.stats[q.era].n++;
    if (ok) S.stats[q.era].ok++;
    S.seen[q.id] = true;

    S.wrong = S.wrong.filter(function (w) { return w.id !== q.id; });
    if (!ok) S.wrong.unshift({ id: q.id, mine: idx, at: todayStr() });
    save();
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
      '<button class="primary" id="res-again">같은 범위 다시</button>' +
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
    $("#res-again").addEventListener("click", function () {
      if (last.retryWrong) { $("#wrong-retry").click(); return; }
      startQuizFor(last.filter, last.n, last.mode);
    });
    $("#res-wrong").addEventListener("click", function () { showView("wrong"); });
    $("#res-home").addEventListener("click", function () {
      $("#quiz-result").classList.add("hidden");
      $("#quiz-setup").classList.remove("hidden"); $("#quiz-official").classList.remove("hidden");
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
    if (part !== "run") stopMockTimer();
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
        '<div class="mock-row-score">' + (best >= 0 ? "최고 <b>" + best + "점</b> · " + gradeOf(best) + " · " + hist.length + "회 응시" : "아직 안 풀었음") + "</div>" +
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
      "<li>문제지를 보면서 오른쪽 답안지에 번호를 찍고 <b>제출</b>하면 공식 정답표로 채점합니다.</li></ol>" +
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
      M.cur = { round: round, ans: [], start: Date.now() };
      for (var i = 0; i < 50; i++) M.cur.ans.push(0);
      save();
    }
    renderMockRun();
  }

  function renderMockRun() {
    var M = mockState(), cur = M.cur, ex = examByRound(cur.round);
    showMockPart("run");
    document.documentElement.style.setProperty("--topbar-h", ($(".topbar") || { offsetHeight: 0 }).offsetHeight + "px");
    var host = $("#mock-run");
    var omr = "";
    for (var i = 0; i < 50; i++) {
      omr += '<div class="omr-row" data-q="' + i + '"><span class="omr-n">' + (i + 1) + "</span>";
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
      '<div class="mock-bar-btns"><button class="mini" id="mock-quit">나가기</button>' +
      '<button class="primary small" id="mock-submit">제출하고 채점</button></div></div>' +
      '<div class="mock-grid">' +
      '<div class="mock-paper" id="mock-paper"></div>' +
      '<div class="mock-omr"><div class="omr-head">답안지 <small>번호를 누르세요 · 다시 누르면 지워짐</small></div>' +
      '<div class="omr-list">' + omr + "</div></div></div>";

    $$(".omr-b", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var q = +b.closest(".omr-row").dataset.q, c = +b.dataset.c;
        cur.ans[q] = cur.ans[q] === c ? 0 : c;
        $$(".omr-b", b.parentNode).forEach(function (x) { x.classList.toggle("on", +x.dataset.c === cur.ans[q]); });
        save(); paintMockCount();
      });
    });
    $("#mock-quit").addEventListener("click", function () { renderMockPick(); });
    $("#mock-submit").addEventListener("click", function () {
      var blank = cur.ans.filter(function (a) { return !a; }).length;
      if (!confirm(blank ? "아직 " + blank + "문항에 답이 없습니다. 이대로 제출할까요?" : "제출하고 채점할까요?")) return;
      submitMock();
    });

    paintMockCount();
    tickMock();
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
    var left = EXAM_SECS - (Date.now() - cur.start) / 1000;
    el.textContent = left >= 0 ? clock(left) : "+" + clock(left) + " 초과";
    el.classList.toggle("warn", left < 10 * 60 && left >= 0);
    el.classList.toggle("over", left < 0);
  }

  function loadMockPaper(round) {
    var host = $("#mock-paper");
    if (mockUrl) { URL.revokeObjectURL(mockUrl); mockUrl = null; }
    var picker = '<label class="mini mock-file">문제지 PDF 열기<input type="file" accept="application/pdf,.pdf" hidden></label>';
    pdfGet(round, function (blob) {
      if (!document.body.contains(host)) return;
      if (blob) {
        mockUrl = URL.createObjectURL(blob);
        host.innerHTML = '<div class="paper-tools">' +
          '<a class="mini" href="' + mockUrl + '" target="_blank" rel="noopener">새 창에서 보기</a>' +
          picker.replace("문제지 PDF 열기", "다른 파일로 바꾸기") + "</div>" +
          '<iframe class="paper-frame" src="' + mockUrl + '#navpanes=0&view=FitH" title="제' + round + '회 문제지"></iframe>';
      } else {
        host.innerHTML = '<div class="paper-empty">' +
          "<p><b>제" + round + "회 심화 문제지 PDF</b>를 열어 주세요.</p>" + picker +
          '<p class="mock-note">아직 없다면 <a href="' + EXAM_URL + '" target="_blank" rel="noopener">시험 자료실</a>에서 받으세요. ' +
          "고른 파일은 이 기기에만 저장되고, 다음부터는 바로 열립니다.</p>" +
          '<p class="mock-note">종이에 인쇄해서 풀어도 됩니다. 답안지와 타이머는 그대로 쓰면 됩니다.</p></div>';
      }
      var input = host.querySelector('input[type="file"]');
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var m = f.name.match(/(\d{2,3})\s*회/);
        if (m && +m[1] !== round && !confirm("파일 이름에는 제" + m[1] + "회라고 되어 있습니다. 제" + round + "회 문제지로 쓸까요?")) return;
        var pdf = f.type === "application/pdf" ? f : new Blob([f], { type: "application/pdf" });
        pdfPut(round, pdf, function (ok) {
          if (!ok) {
            // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 이번에만 연다
            mockUrl = URL.createObjectURL(pdf);
            host.innerHTML = '<div class="paper-tools"><a class="mini" href="' + mockUrl + '" target="_blank" rel="noopener">새 창에서 보기</a></div>' +
              '<iframe class="paper-frame" src="' + mockUrl + '#navpanes=0&view=FitH" title="문제지"></iframe>';
            return;
          }
          loadMockPaper(round);
        });
      });
    });
  }

  function submitMock() {
    var M = mockState(), cur = M.cur, ex = examByRound(cur.round);
    var sc = score(ex, cur.ans);
    var rec = { at: todayStr(), score: sc.pts, right: sc.right,
      secs: Math.round((Date.now() - cur.start) / 1000), ans: cur.ans.join("") };
    (M.hist[cur.round] = M.hist[cur.round] || []).push(rec);
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
      '<button class="mini" id="mock-back">회차 목록</button></div></div>' +
      '<div class="card"><h2>시대별 점수</h2>' + eraRows + "</div>" +
      '<div class="card"><h2>틀린 문제 <small>' + wrong.length + "문항</small></h2>" +
      (wrong.length ? '<p class="mock-note">문제지에서 번호를 찾아 다시 보고, 헷갈린 개념은 "개념 보기"로 바로 확인하세요. 오답 노트 탭에도 모아 둡니다.</p>' + wrongRows
        : '<p class="empty">다 맞혔습니다!</p>') + "</div>";
    $("#mock-again").addEventListener("click", function () { startMock(round, true); });
    $("#mock-back").addEventListener("click", renderMockPick);
    bindTopicButtons($("#mock-result"));
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
          (TOPIC_ERA[tag[0]] ? '<button class="mini" data-topic="' + tag[0] + '">개념 보기</button>' : "") + "</div>";
      }
      if (rows) out += '<div class="card mock-wrong-card"><h2>실전 기출 제' + ex.round + "회 <small>" + rec.at + " · " + rec.score + "점</small></h2>" + rows + "</div>";
    });
    return out;
  }

  function initMock() {
    $$("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.dataset.goto); });
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
      bindTopicButtons(host);
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
    bindTopicButtons(host);
  }

  function initWrong() {
    $("#wrong-retry").addEventListener("click", function () {
      var list = S.wrong.map(function (w) { return qById(w.id); }).filter(Boolean);
      if (!list.length) { alert("오답 노트가 비어 있습니다."); return; }
      list = shuffle(list);
      run = { list: list, i: 0, answers: [], mode: "study", retryWrong: true, n: 0,
        status: list.map(function () { return "wrong"; }) };
      showView("quiz");
      $("#quiz-setup").classList.add("hidden"); $("#quiz-official").classList.add("hidden");
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
  initTheme();
  initGlossary();
  initTabs();
  initConcept();
  initNoteToggle();
  initQuiz();
  initWrong();
  initMock();
  initTimeline();
  initReset();
  initPlanCourse();
  renderPlan();
  renderDash();
})();
