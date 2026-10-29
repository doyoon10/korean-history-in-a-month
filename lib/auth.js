// 입장 확인에 함께 쓰는 것들 (middleware.js, api/login.js).
// 비밀번호는 저장소에 없고 Vercel 환경 변수 SITE_PASSWORD에만 둔다. 그 값이 비어 있으면 사이트를 잠그지 않는다.
// 로그인하면 쿠키에 "만료 시각(초).서명"을 넣는다. 서명은 비밀번호에서 만든 열쇠로 한 HMAC-SHA256이라,
// 비밀번호를 바꾸면 그전에 받은 쿠키는 모두 쓸 수 없게 된다.
// 잠금 스위치. false면 SITE_PASSWORD가 있어도 잠그지 않는다(비밀번호 값은 Vercel에 그대로 둔다). 다시 잠그려면 true로 바꿔 배포한다
export const LOCK = false;
// 지금 쓰는 비밀번호. 잠금을 껐거나 비밀번호를 정하지 않았으면 빈 값이고, 그러면 사이트를 잠그지 않는다
export function sitePassword() { return LOCK ? process.env.SITE_PASSWORD || "" : ""; }

export const COOKIE = "kh_auth";   // 서버만 읽는 입장 확인 쿠키
export const MARK = "kh_in";       // 화면에 '잠그기'를 보여 줄지 알려 주는 표시 (권한은 없다)
export const DAYS = 30;

const enc = new TextEncoder();

function hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

// 글자 수가 같으면 어디서 달라도 걸리는 시간이 같게 비교한다
export function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sign(password, exp) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("kh-auth:" + password));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(String(exp))));
}

export async function makeToken(password, now) {
  const exp = Math.floor(now / 1000) + DAYS * 86400;
  return exp + "." + (await sign(password, exp));
}

export async function validToken(password, token, now) {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token || "");
  if (!m || +m[1] * 1000 < now) return false;
  return same(m[2], await sign(password, m[1]));
}

export function readCookie(header, name) {
  const parts = (header || "").split(";");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + "=") === 0) return p.slice(name.length + 1);
  }
  return "";
}
