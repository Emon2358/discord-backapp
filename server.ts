import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

// 初期設定 (デフォルトは空)
const config: {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  REDIRECT_URI: string;
} = {
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord 管理ページ</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #ffe259, #ffa751);
          color: #333;
        }
        h1, h2 {
          color: #fff;
        }
        a, button {
          color: #fff;
          text-decoration: none;
          background-color: #007bff;
          padding: 10px 20px;
          border-radius: 5px;
          transition: background-color 0.3s ease;
          cursor: pointer;
        }
        a:hover, button:hover {
          background-color: #0056b3;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        input {
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
        }
        .button-group {
          display: flex;
          gap: 10px;
        }
        ul {
          list-style-type: none;
          padding: 0;
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

  // /kanri: 管理者専用ページ
  if (url.pathname === "/kanri" && req.method === "GET") {
    const body = `
      <h1>管理者専用ページ</h1>
      <h2>現在の設定</h2>
      <ul>
        <li><strong>Client ID:</strong> ${config.CLIENT_ID || "未設定"}</li>
        <li><strong>Client Secret:</strong> ${config.CLIENT_SECRET || "未設定"}</li>
        <li><strong>Redirect URI:</strong> ${config.REDIRECT_URI || "未設定"}</li>
      </ul>
      <h2>設定を更新</h2>
      <form method="POST" action="/kanri">
        <input type="text" name="client_id" placeholder="Client ID" value="${config.CLIENT_ID}" required>
        <input type="text" name="client_secret" placeholder="Client Secret" value="${config.CLIENT_SECRET}" required>
        <input type="text" name="redirect_uri" placeholder="Redirect URI" value="${config.REDIRECT_URI}" required>
        <div class="button-group">
          <button type="submit">保存</button>
          <a href="/reset">設定をリセット</a>
        </div>
      </form>
      <p><a href="/joinserver">認証済みユーザー一覧に戻る</a></p>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  // /kanri: 設定保存 (POST)
  } else if (url.pathname === "/kanri" && req.method === "POST") {
    const formData = await req.formData();
    const clientId = formData.get("client_id")?.toString() || "";
    const clientSecret = formData.get("client_secret")?.toString() || "";
    const redirectUri = formData.get("redirect_uri")?.toString() || "";

    config.CLIENT_ID = clientId;
    config.CLIENT_SECRET = clientSecret;
    config.REDIRECT_URI = redirectUri;

    return new Response(
      htmlTemplate("<h1>設定が保存されました！</h1><p><a href='/kanri'>戻る</a></p>"),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );

  // /reset: 設定リセット
  } else if (url.pathname === "/reset" && req.method === "GET") {
    config.CLIENT_ID = "";
    config.CLIENT_SECRET = "";
    config.REDIRECT_URI = "";

    return new Response(
      htmlTemplate("<h1>設定がリセットされました！</h1><p><a href='/kanri'>戻る</a></p>"),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );

  // /joinserver: 認証済みユーザー一覧 (そのまま)
  } else if (url.pathname === "/joinserver" && req.method === "GET") {
    const userListHtml = authenticatedUsers
      .map((user) => `
        <li>
          <strong>${user.username}#${user.discriminator}</strong><br>
          <img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" alt="Avatar" width="50"><br>
          <ul>
            ${user.guilds
              .map(
                (guild) => `<li>${guild.name} (ID: ${guild.id})</li>`
              )
              .join("")}
          </ul>
        </li>
      `)
      .join("");

    const body = `
      <h1>認証済みユーザー一覧</h1>
      <ul>
        ${userListHtml || "<p>まだ認証されたユーザーはいません。</p>"}
      </ul>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
