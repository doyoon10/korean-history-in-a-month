// 새 문제 원고(src_*.js)를 사이트 형식(js/data/quiz_N.js)으로 만든다.
// 원고: Q(주제id, 짧은 주제, 난이도, 지문, 정답 보기, [오답 "보기|왜 틀렸나" ×4], 해설, 핵심어)
// 사용: node build.js <원고 파일> <파일 번호> <머리말>
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const [src, num, title] = process.argv.slice(2);
global.window = {};
["concepts_1", "concepts_2", "concepts_3"].forEach(f => require(path.join(ROOT, "js/data", f + ".js")));
const TOPIC_ERA = {};
window.CONCEPTS.forEach(e => e.topics.forEach(t => TOPIC_ERA[t.id] = e.id));
// 이미 있는 문제 (이 파일 번호보다 앞 번호만)
window.QUIZ = [];
for (let i = 1; i < +num; i++) require(path.join(ROOT, "js/data", "quiz_" + i + ".js"));
const existing = window.QUIZ.slice();
let nextId = Math.max(...existing.map(q => +q.id.slice(1))) + 1;
const stems = new Set(existing.map(q => q.stem));

const items = [];
global.Q = (concept, topic, diff, stem, correct, wrongs, explain, keyword) =>
  items.push({ concept, topic, diff, stem, correct, wrongs, explain, keyword });
require(path.resolve(src));

// 번호가 같으면 늘 같은 순서가 나오는 난수
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const CIRC = ["①", "②", "③", "④", "⑤"];
const errs = [], out = [], posCount = [0, 0, 0, 0, 0];
let block = [];
items.forEach((it, k) => {
  const id = "q" + (nextId + k), r = rng(nextId + k);
  const where = id + " (" + it.concept + " " + it.topic + ")";
  if (!TOPIC_ERA[it.concept]) errs.push(where + ": 없는 주제");
  if (!Array.isArray(it.wrongs) || it.wrongs.length !== 4) errs.push(where + ": 오답이 4개가 아님");
  if (stems.has(it.stem)) errs.push(where + ": 같은 지문이 이미 있음");
  stems.add(it.stem);
  if (!it.stem || !it.correct || !it.explain || !it.keyword) errs.push(where + ": 빈 칸");
  if (/"/.test(it.stem + it.correct + it.explain)) errs.push(where + ": 큰따옴표");
  const wrongs = (it.wrongs || []).map(w => { const i = w.indexOf("|"); return i < 0 ? { t: w, n: "" } : { t: w.slice(0, i), n: w.slice(i + 1) }; });
  const texts = [it.correct].concat(wrongs.map(w => w.t));
  if (new Set(texts).size !== 5) errs.push(where + ": 보기가 겹침");
  // 정답 자리는 5문제마다 ①~⑤가 한 번씩 나오게
  if (!block.length) block = shuffle([0, 1, 2, 3, 4], r);
  const pos = block.pop();
  posCount[pos]++;
  const rest = shuffle(wrongs, r), choices = [], notes = [];
  for (let i = 0, j = 0; i < 5; i++) {
    if (i === pos) choices.push(it.correct);
    else { const w = rest[j++]; choices.push(w.t); if (w.n) notes.push(CIRC[i] + " " + w.n); }
  }
  const explain = it.explain + (notes.length ? " 오답 풀이: " + notes.join(" / ") : "");
  out.push({ id, era: TOPIC_ERA[it.concept], concept: it.concept, topic: it.topic, diff: it.diff, stem: it.stem, choices, answer: pos, explain, keyword: it.keyword });
});
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
const j = JSON.stringify;
const body = out.map(q =>
  "{ id:" + j(q.id) + ", era:" + j(q.era) + ", concept:" + j(q.concept) + ", topic:" + j(q.topic) + ", diff:" + q.diff + ",\n" +
  "  stem:" + j(q.stem) + ",\n  choices:" + j(q.choices) + ",\n" +
  "  answer:" + q.answer + ", explain:" + j(q.explain) + ", keyword:" + j(q.keyword) + " }").join(",\n\n");
fs.writeFileSync(path.join(ROOT, "js/data", "quiz_" + num + ".js"),
  "// 추가 문제 (" + num + "): " + title + "\nwindow.QUIZ = window.QUIZ || [];\n\nwindow.QUIZ.push(\n" + body + "\n);\n");
const per = {};
out.forEach(q => per[q.concept] = (per[q.concept] || 0) + 1);
console.log("quiz_" + num + ".js: " + out.length + "문제 (" + out[0].id + "~" + out[out.length - 1].id + ")");
console.log("정답 자리 ①~⑤:", posCount.join(" "), "| 주제별:", Object.entries(per).map(e => e.join(" ")).join(", "));
