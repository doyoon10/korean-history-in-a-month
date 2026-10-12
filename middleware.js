// 모든 요청이 여기를 먼저 지난다. 비밀번호(SITE_PASSWORD)를 정해 두었으면, 로그인 쿠키가 없는 요청은
// 페이지는 로그인 화면으로 보내고 나머지 파일(스크립트, 문제 데이터)은 내주지 않는다.
import { COOKIE, validToken, readCookie } from "./lib/auth.js";

// 로그인 화면과 그 화면이 쓰는 것만 그냥 통과시킨다
const OPEN = ["/login.html", "/api/login", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/icon-512.png"];

function pass() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}

export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return pass();   // 비밀번호를 정하지 않았으면 잠그지 않는다

  const url = new URL(request.url);
  if (OPEN.indexOf(url.pathname) !== -1) return pass();

  const token = readCookie(request.headers.get("cookie"), COOKIE);
  if (await validToken(password, token, Date.now())) return pass();

  const wantsPage = request.method === "GET" && (request.headers.get("accept") || "").indexOf("text/html") !== -1;
  if (wantsPage) {
    const next = url.pathname + url.search;
    const to = new URL("/login.html" + (next && next !== "/" ? "?next=" + encodeURIComponent(next) : ""), url);
    return new Response(null, { status: 307, headers: { location: to.toString(), "cache-control": "no-store" } });
  }
  return new Response("로그인이 필요합니다.", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
