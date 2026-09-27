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
    box.innerHTML =
      '<div class="today-day">DAY ' + p.day + " · " + p.date + " · 권장 " + esc(p.time) + "</div>" +
      '<div class="today-title">' + esc(p.title) + "</div>" +
      '<ul class="today-todo">' + p.todo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      (note ? '<p class="today-note">' + esc(note) + "</p>" : "") +
      '<div class="today-actions">' +
      '<button class="mini' + (isDone ? " active" : "") + '" id="today-done">' + (isDone ? "완료함" : "완료 표시") + "</button>" +
      (p.concepts.length ? '<button class="mini" id="today-concept">개념 보기</button>' : "") +
      (p.concepts.length ? '<button class="mini" id="today-quiz">오늘 범위 문제 ' + nDay + "</button>" : "") +
      '<button class="mini" id="today-learned">배운 범위 누적 ' + nAll + "</button>" +
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
        html +=
          '<div class="topic' + (open ? " open" : "") + '" id="topic-' + t.id + '">' +
          '<div class="topic-head"><span class="topic-arrow">▶</span><h3>' + esc(t.title) + "</h3></div>" +
          '<div class="topic-body"><ul>' +
          t.points.map(function (p) { return "<li>" + fmt(p) + "</li>"; }).join("") +
          '</ul><div class="kw-row">' +
          t.keywords.map(function (k) { return '<span class="kw">' + esc(k) + "</span>"; }).join("") +
          '</div><div class="tip">' + fmt(t.tip) + "</div></div></div>";
      });
      html += "</div>";
    });

    host.innerHTML = hit ? html : '<p class="empty">검색 결과가 없습니다.</p>';
    $$(".topic-head", host).forEach(function (h) {
      h.addEventListener("click", function () { h.parentNode.classList.toggle("open"); });
    });
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
    pool = shuffle(pool);
    return n > 0 ? pool.slice(0, n) : pool;
  }

  function startQuizFor(filter, n, mode) {
    var list = pickQuestions(filter, n);
    if (!list.length) { alert("해당 범위의 문제가 없습니다."); return; }
    run = { list: list, i: 0, answers: [], mode: mode || "study", filter: filter, n: n };
    showView("quiz");
    $("#quiz-setup").classList.add("hidden");
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
      '<span class="q-tag">' + esc(q.topic) + "</span>" +
      '<span class="q-tag diff">난이도 ' + q.diff + "/5</span></div>" +
      '<div class="q-stem">' + esc(q.stem) + "</div>" +
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
        esc(q.explain) + '<div class="ex-kw">핵심어 · ' + esc(q.keyword) + "</div></div>";
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
          return '<div class="wrong-item"><div class="wrong-stem">' + esc(w.q.stem) + "</div>" +
            '<div class="wrong-ans">정답 ' + (w.q.answer + 1) + "번 · " + esc(w.q.choices[w.q.answer]) + "</div>" +
            (w.mine !== undefined ? '<div class="wrong-mine">내 답 ' + (w.mine + 1) + "번 · " + esc(w.q.choices[w.mine]) + "</div>" : '<div class="wrong-mine">무응답</div>') +
            '<div class="wrong-ex">' + esc(w.q.explain) + "</div></div>";
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
      $("#quiz-setup").classList.remove("hidden");
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
    if (!S.wrong.length) {
      host.innerHTML = '<p class="empty">아직 오답이 없습니다. 문제를 풀면 틀린 문항이 여기 쌓입니다.</p>';
      return;
    }
    host.innerHTML = S.wrong.map(function (w) {
      var q = qById(w.id);
      if (!q) return "";
      return '<div class="wrong-item">' +
        '<div class="q-meta"><span class="q-tag">' + esc(ERA_NAMES[q.era] || q.era) + "</span>" +
        '<span class="q-tag">' + esc(q.topic) + '</span><span class="q-tag">' + w.at + "</span></div>" +
        '<div class="wrong-stem">' + esc(q.stem) + "</div>" +
        '<div class="wrong-ans">정답 ' + (q.answer + 1) + "번 · " + esc(q.choices[q.answer]) + "</div>" +
        '<div class="wrong-mine">내 답 ' + (w.mine + 1) + "번 · " + esc(q.choices[w.mine]) + "</div>" +
        '<div class="wrong-ex">' + esc(q.explain) + '<div class="ex-kw" style="margin-top:6px;font-size:12px">핵심어 · ' + esc(q.keyword) + "</div></div></div>";
    }).join("");
  }

  function initWrong() {
    $("#wrong-retry").addEventListener("click", function () {
      var list = S.wrong.map(function (w) { return qById(w.id); }).filter(Boolean);
      if (!list.length) { alert("오답 노트가 비어 있습니다."); return; }
      run = { list: shuffle(list), i: 0, answers: [], mode: "study", retryWrong: true, n: 0 };
      showView("quiz");
      $("#quiz-setup").classList.add("hidden");
      $("#quiz-result").classList.add("hidden");
      $("#quiz-run").classList.remove("hidden");
      renderQuestion();
    });
    $("#wrong-clear").addEventListener("click", function () {
      if (!confirm("오답 노트를 모두 비울까요?")) return;
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
  function initTheme() {
    paintThemeButton();
    $("#theme-toggle").addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("hanneung_theme", next); } catch (e) {}
      paintThemeButton();
    });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", paintThemeButton);
    }
  }

  // ---------- 시작 ----------
  initTheme();
  initTabs();
  initConcept();
  initQuiz();
  initWrong();
  initTimeline();
  initReset();
  initPlanCourse();
  renderPlan();
  renderDash();
})();
