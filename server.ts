import { Application, Router } from "https://deno.land/x/oak@v17.1.3/mod.ts";

const app = new Application();
const router = new Router();

const tokens: Map<string, { accessToken: string; refreshToken: string }> = new Map();

router.get("/callback", (ctx) => {
  const code = ctx.request.url.searchParams.get("code");
  if (!code) {
    ctx.response.status = 400;
    ctx.response.body = "認証コードが見つかりません。";
    return;
  }

  // TODO: Discord APIを使用してトークン取得
  const accessToken = "mockAccessToken";
  const refreshToken = "mockRefreshToken";

  tokens.set(code, { accessToken, refreshToken });
  ctx.response.body = "認証に成功しました！";
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
