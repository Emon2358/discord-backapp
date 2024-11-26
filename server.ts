// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Application, Router, Context } from "https://deno.land/x/oak@v17.1.3/mod.ts";

const config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
};

const app = new Application();
const router = new Router();

// 管理ページのフォーム
router.get("/kanri", (ctx) => {
  ctx.response.body = `
    <html>
      <body>
        <h1>設定情報を入力</h1>
        <form action="/save-config" method="POST">
          <label for="CLIENT_ID">Discord Client ID</label>
          <input type="text" name="CLIENT_ID" value="${config.CLIENT_ID}" required><br>

          <label for="CLIENT_SECRET">Discord Client Secret</label>
          <input type="text" name="CLIENT_SECRET" value="${config.CLIENT_SECRET}" required><br>

          <label for="REDIRECT_URI">Redirect URI</label>
          <input type="text" name="REDIRECT_URI" value="${config.REDIRECT_URI}" required><br>

          <button type="submit">設定を保存</button>
        </form>
      </body>
    </html>
  `;
});

// 設定保存処理
router.post("/save-config", async (ctx) => {
  try {
    // ここでフォームデータを取得します
    const body = await ctx.request.body({ type: "form" });
    const formData = await body.value;

    const clientId = formData.get("CLIENT_ID") || "";
    const clientSecret = formData.get("CLIENT_SECRET") || "";
    const redirectUri = formData.get("REDIRECT_URI") || "";

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "設定情報が不完全です。すべてのフィールドを入力してください。"
      );
    }

    // 設定を保存
    config.CLIENT_ID = clientId;
    config.CLIENT_SECRET = clientSecret;
    config.REDIRECT_URI = redirectUri;

    // リダイレクト
    ctx.response.redirect("/kanri");
  } catch (error) {
    console.error("設定保存時にエラーが発生しました:", error);
    ctx.response.body = `
      <html>
        <body>
          <h1>エラー</h1>
          <p>設定保存時にエラーが発生しました: ${error.message}</p>
          <p><a href="/kanri">管理ページに戻る</a></p>
        </body>
      </html>
    `;
  }
});

// Discord OAuth2認証処理
router.get("/callback", async (ctx) => {
  const code = ctx.request.url.searchParams.get("code");
  const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = config;

  if (!code || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    ctx.response.body = "必要な情報が不足しています。";
    return;
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error("認証に失敗しました: " + tokenData.error_description);
    }

    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userRes.json();

    // サーバー情報取得
    const guildsRes = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const guildsData = await guildsRes.json();

    ctx.response.body = `
      <html>
        <body>
          <h1>認証成功</h1>
          <p>ユーザー名: ${userData.username}#${userData.discriminator}</p>
          <img src="https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png" alt="User Avatar"><br><br>

          <h2>参加しているサーバー:</h2>
          <ul>
            ${guildsData
              .map(
                (guild: any) => `
              <li>
                <strong>${guild.name}</strong> (ID: ${guild.id})
              </li>
            `
              )
              .join("")}
          </ul>

          <p><a href="/kanri">管理ページに戻る</a></p>
        </body>
      </html>
    `;
  } catch (error) {
    console.error("OAuth2認証エラー:", error);
    ctx.response.body = `<h1>エラー</h1><p>${error.message}</p>`;
  }
});

// Denoサーバー起動
app.use(router.routes());
app.use(router.allowedMethods());
console.log("サーバーがポート8000で起動しました");
await app.listen({ port: 8000 });
