// 로그인 처리. GET: 잠금이 켜져 있는지 알려 주거나(?out=1이면 잠그고 로그인 화면으로), POST: 비밀번호를 확인하고 쿠키를 준다.
import { COOKIE, MARK, DAYS, makeToken, same, sha } from "../lib/auth.js";

export const config = { runtime: "edge" };

function json(body, status, cookies) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  (cookies || []).forEach((c) => headers.append("set-cookie", c));
  return new Response(JSON.stringify(body), { status: status || 200, headers });
}

export default async function handler(request) {
  const password = process.env.SITE_PASSWORD;
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.searchParams.get("out")) {
      const headers = new Headers({ location: password ? "/login.html" : "/", "cache-control": "no-store" });
      headers.append("set-cookie", COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
      headers.append("set-cookie", MARK + "=; Path=/; Max-Age=0; Secure; SameSite=Lax");
      return new Response(null, { status: 303, headers });
    }
    return json({ locked: !!password });
  }
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!password) return json({ ok: true, open: true });

  let given = "";
  try {
    const body = await request.json();
    if (body && typeof body.password === "string") given = body.password;
  } catch (e) {}

  if (!given || !same(await sha(given), await sha(password))) {
    await new Promise((r) => setTimeout(r, 600));   // 마구 넣어 보는 것을 조금 늦춘다
    return json({ ok: false }, 401);
  }
  const age = DAYS * 86400;
  return json({ ok: true }, 200, [
    COOKIE + "=" + (await makeToken(password, Date.now())) + "; Path=/; Max-Age=" + age + "; HttpOnly; Secure; SameSite=Lax",
    MARK + "=1; Path=/; Max-Age=" + age + "; Secure; SameSite=Lax",
  ]);
}
