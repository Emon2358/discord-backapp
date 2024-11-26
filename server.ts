// deno-lint-ignore-file prefer-const no-unused-vars no-explicit-any
import {
  Application,
  Router,
  Context,
} from "https://deno.land/x/oak@v17.1.3/mod.ts";

// 永続的にユーザー情報とその参加サーバー情報を保存するオブジェクト
let usersData: Record<
  string,
  { username: string; avatar: string; guilds: any[] }
> = {};

// 設定情報を保存するためのオブジェクト
let config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
};

// アプリケーションとルーターを初期化
const app = new Application();
const router = new Router();

// Discord OAuth2 URL生成
function generateDiscordOAuth2URL() {
  const scope = encodeURIComponent("identify guilds");
  return `https://discord.com/api/oauth2/authorize?client_id=${
    config.CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    config.REDIRECT_URI
  )}&response_type=code&scope=${scope}`;
}

// トークン取得関数
async function getToken(code: string) {
  const body = new URLSearchParams({
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.REDIRECT_URI,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch token");
  }

  return await response.json();
}

// ユーザーの参加サーバー情報を取得
async function getUserGuilds(token: string) {
  const response = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guilds");
  }

  return await response.json();
}

// `/kanri`ページ - 設定フォームと情報表示
router.get("/kanri", (ctx) => {
  let usersListHtml = Object.keys(usersData)
    .map((userId) => {
      const user = usersData[userId];
      return `
      <div>
        <h3 onclick="showGuilds('${userId}')">
          <img src="https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png" alt="${user.username}'s Avatar" width="40" height="40"/>
          ${user.username}
        </h3>
      </div>
    `;
    })
    .join("");

  ctx.response.body = `
    <html>
      <head>
        <title>管理ページ</title>
        <script>
          function showGuilds(userId) {
            const user = ${JSON.stringify(usersData)};
            const guildNames = user[userId].guilds.map(guild => guild.name).join(", ");
            alert("参加しているサーバー: " + guildNames);
          }
        </script>
      </head>
      <body>
        <h1>設定情報を入力してください</h1>
        <form method="POST" action="/save-config">
          <label for="client_id">Client ID:</label><br />
          <input type="text" id="client_id" name="CLIENT_ID" value="${
            config.CLIENT_ID
          }" /><br /><br />
          
          <label for="client_secret">Client Secret:</label><br />
          <input type="text" id="client_secret" name="CLIENT_SECRET" value="${
            config.CLIENT_SECRET
          }" /><br /><br />
          
          <label for="redirect_uri">Redirect URI:</label><br />
          <input type="text" id="redirect_uri" name="REDIRECT_URI" value="${
            config.REDIRECT_URI
          }" /><br /><br />
          
          <button type="submit">保存</button>
        </form>

        <h2>現在の設定</h2>
        <p><strong>Client ID:</strong> ${config.CLIENT_ID}</p>
        <p><strong>Client Secret:</strong> ${
          config.CLIENT_SECRET ? "*****" : ""
        }</p>
        <p><strong>Redirect URI:</strong> ${config.REDIRECT_URI}</p>

        <h2>認証したユーザー</h2>
        ${usersListHtml}

        <h2>Discord OAuth2リンク</h2>
        <a href="${generateDiscordOAuth2URL()}">認証ページを開く</a>
      </body>
    </html>
  `;
});

// 設定情報を保存するPOSTハンドラー
router.post("/save-config", async (ctx) => {
  try {
    const body = ctx.request.body({ type: "form" });
    const values = await body.value;

    config.CLIENT_ID = values.get("CLIENT_ID") || "";
    config.CLIENT_SECRET = values.get("CLIENT_SECRET") || "";
    config.REDIRECT_URI = values.get("REDIRECT_URI") || "";

    // 設定保存後にリダイレクト
    ctx.response.redirect("/kanri");
  } catch (error) {
    console.error("設定保存時にエラーが発生しました: ", error);
    ctx.response.body = "設定保存時にエラーが発生しました。";
  }
});

// Discord認証後のコールバック処理
router.get("/callback", async (ctx) => {
  const code = ctx.request.url.searchParams.get("code");

  if (!code) {
    ctx.response.body = "認証コードが見つかりませんでした。";
    return;
  }

  try {
    const tokenData = await getToken(code);
    const guilds = await getUserGuilds(tokenData.access_token);

    // ユーザー情報とサーバー情報を保存
    usersData[tokenData.user.id] = {
      username: tokenData.user.username,
      avatar: tokenData.user.avatar,
      guilds: guilds,
    };

    ctx.response.body = `
      <html>
        <head><title>認証成功</title></head>
        <body>
          <h1>認証が成功しました！</h1>
          <p>ユーザー情報を確認するには、管理ページ（/kanri）に戻ってください。</p>
          <a href="/kanri">管理ページに戻る</a>
        </body>
      </html>
    `;
  } catch (error) {
    console.error("認証時にエラーが発生しました: ", error);
    ctx.response.body = "エラーが発生しました: " + error.message;
  }
});

// ルーターをアプリケーションに適用
app.use(router.routes());
app.use(router.allowedMethods());

// サーバーを起動
console.log("Listening on http://localhost:8000");
await app.listen({ port: 8000 });
