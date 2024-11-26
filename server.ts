import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

const config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
};

// HTMLテンプレート生成関数
function htmlTemplate(body: string): string {
  return `
    <html>
      <body>
        ${body}
      </body>
    </html>
  `;
}

// リクエストハンドラ
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/kanri" && req.method === "GET") {
    // 管理ページ
    const body = `
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
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html" },
    });
  } else if (url.pathname === "/save-config" && req.method === "POST") {
    try {
      const formData = await req.formData();
      const clientId = formData.get("CLIENT_ID") || "";
      const clientSecret = formData.get("CLIENT_SECRET") || "";
      const redirectUri = formData.get("REDIRECT_URI") || "";

      if (!clientId || !clientSecret || !redirectUri) {
        throw new Error("設定情報が不完全です。すべてのフィールドを入力してください。");
      }

      // 設定を保存
      config.CLIENT_ID = String(clientId);
      config.CLIENT_SECRET = String(clientSecret);
      config.REDIRECT_URI = String(redirectUri);

      // リダイレクト
      return new Response("", {
        status: 303,
        headers: { Location: "/kanri" },
      });
    } catch (error) {
      console.error("設定保存時にエラーが発生しました:", error);
      const body = `
        <h1>エラー</h1>
        <p>設定保存時にエラーが発生しました: ${error.message}</p>
        <p><a href="/kanri">管理ページに戻る</a></p>
      `;
      return new Response(htmlTemplate(body), {
        headers: { "Content-Type": "text/html" },
      });
    }
  } else if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = config;

    if (!code || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return new Response("必要な情報が不足しています。", {
        headers: { "Content-Type": "text/plain" },
      });
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
          code,
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

      const guildsRes = await fetch(
        "https://discord.com/api/v10/users/@me/guilds",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      const guildsData = await guildsRes.json();

      const body = `
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
      `;
      return new Response(htmlTemplate(body), {
        headers: { "Content-Type": "text/html" },
      });
    } catch (error) {
      console.error("OAuth2認証エラー:", error);
      return new Response(`<h1>エラー</h1><p>${error.message}</p>`, {
        headers: { "Content-Type": "text/html" },
      });
    }
  } else {
    return new Response("Not Found", { status: 404 });
  }
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
