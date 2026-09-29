/* 개념 불릿을 손필기 모양으로 나눈다.
   "**최충헌**: **교정도감**(최고 권력 기구) / **최우**: **정방**(인사)"
   → 주체마다 한 불릿, 본문에서 괄호 설명을 빼서 아래 'ㄴ→' 풀이로 단다.
   연도처럼 짧은 괄호는 본문에 그대로 둔다. */
(function () {
  "use strict";

  function stripStars(s) { return s.replace(/\*\*/g, "").trim(); }

  // 괄호 밖의 sep 기준으로 나눈다
  function splitTop(s, sep) {
    var out = [], depth = 0, start = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (depth === 0 && s.substr(i, sep.length) === sep) {
        out.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1;
      }
    }
    out.push(s.slice(start));
    return out;
  }

  // "주체: 내용"이면 주체를 떼어 낸다 (괄호 밖, 앞쪽 40자 안의 첫 콜론)
  function splitSubject(seg) {
    var depth = 0;
    for (var i = 0; i < seg.length && i < 40; i++) {
      var c = seg.charAt(i);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (depth === 0 && (c === "," || c === "→")) return null;
      else if (depth === 0 && c === ":" && /\s/.test(seg.charAt(i + 1) || " ")) {
        var subj = seg.slice(0, i).trim();
        if (!subj || subj.split(" ").length > 6) return null;
        return { subject: subj, body: seg.slice(i + 1).trim() };
      }
    }
    return null;
  }

  // 본문에 남길 짧은 괄호: 연도·날짜이거나 6자 이하
  function isInline(content) {
    var t = stripStars(content);
    return t.length <= 6 || /^[0-9\s.~·,\-]+(년|월|일|경|년경|세기)?$/.test(t) ||
      /^(BC|AD)?\s?[0-9][0-9\s.~·,\-]*$/.test(t);
  }

  // 괄호 설명을 본문에서 빼서 notes로 옮긴다
  function extract(body) {
    var main = "", notes = [], depth = 0, start = -1, lastDelim = 0, copyFrom = 0;
    for (var i = 0; i < body.length; i++) {
      var c = body.charAt(i);
      if (c === "(") {
        if (depth === 0) start = i;
        depth++;
      } else if (c === ")") {
        depth--;
        if (depth === 0 && start >= 0) {
          var content = body.slice(start + 1, i);
          if (!isInline(content)) {
            var label = body.slice(lastDelim, start);
            // 라벨이 길면 마지막 굵은 글씨나 괄호 뒤의 말만 쓴다
            var clean = stripStars(label);
            if (clean.length > 14) {
              var parts = label.split(/\*\*|\)/);
              var tail = stripStars(parts[parts.length - 1]);
              if (!tail && parts.length > 1) tail = stripStars(parts[parts.length - 2]);
              clean = tail || clean;
            }
            main += body.slice(copyFrom, start).replace(/\s+$/, "");
            copyFrom = i + 1;
            notes.push({ label: clean, text: content.trim(), at: main.length });
          }
          start = -1;
        }
      } else if (depth === 0 && (c === "," || c === "→" || c === ";" || c === ":")) {
        lastDelim = i + 1;
      } else if (depth === 0 && body.substr(i, 4) === " vs ") {
        lastDelim = i + 4;
      }
    }
    main += body.slice(copyFrom);
    return { main: main.replace(/\s{2,}/g, " ").trim(), notes: notes };
  }

  // 불릿 하나(원문)를 필기용 불릿 여러 개로
  function parseNote(raw) {
    var bullets = [];
    splitTop(raw, " / ").forEach(function (seg) {
      seg = seg.trim();
      if (!seg) return;
      var sb = splitSubject(seg);
      if (sb || !bullets.length) {
        bullets.push({ subject: sb ? sb.subject : "", lines: [], notes: [] });
      }
      var b = bullets[bullets.length - 1];
      var ex = extract(sb ? sb.body : seg);
      var offset = b.lines.join("\n").length + (b.lines.length ? 1 : 0);
      ex.notes.forEach(function (n) { n.at += offset; b.notes.push(n); });
      b.lines.push(ex.main);
    });
    return bullets;
  }

  window.parseNote = parseNote;
  window.noteStripStars = stripStars;
})();
