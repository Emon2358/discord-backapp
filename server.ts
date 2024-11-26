import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

const config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
};

// 認証済みユーザーを保存するリスト
let authenticatedUsers: {
  username: string;
  discriminator: string;
  userId: string;
  avatar: string;
  guilds: { name: string; id: string }[];
}[] = [];

// HTMLテンプレート生成関数
function htmlTemplate(body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>管理ページ</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: #f4f4f4;
          color: #333;
        }
        h1 {
          color: #555;
        }
        .success-animation {
          font-size: 1.5em;
          text-align: center;
          animation: fadeIn 2s ease-in-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .button {
          margin-top: 20px;
          padding: 10px 20px;
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 5px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.3s;
        }
        .button:hover {
          background: #0056b3;
        }
      </style>
    </head>
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
    // 認証用のURLを生成
    const authUrl =
      config.CLIENT_ID && config.REDIRECT_URI
        ? `https://discord.com/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(
            config.REDIRECT_URI
          )}&response_type=code&scope=identify%20guilds`
        : null;

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
      ${authUrl ? `<p><a href="${authUrl}" class="button">Discord認証を開始</a></p>` : ""}
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = config;

    if (!code || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return new Response("必要な情報が不足しています。", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();

      authenticatedUsers.push({
        username: userData.username,
        discriminator: userData.discriminator,
        userId: userData.id,
        avatar: userData.avatar,
        guilds: [],
      });

      const body = `
        <div class="success-animation">
          <h1>認証に成功しました！</h1>
          <p>ようこそ、${userData.username}#${userData.discriminator} さん！</p>
          <a></a>
        </div>
      `;
      return new Response(htmlTemplate(body), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      console.error("OAuth2認証エラー:", error);
      return new Response(htmlTemplate(`<h1>エラー</h1><p>${error.message}</p>`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else {
    return new Response("Not Found", { status: 404 });
  }
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
