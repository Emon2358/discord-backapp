import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

let CLIENT_ID = ""; // 動的に設定される
let CLIENT_SECRET = ""; // 動的に設定される
let REDIRECT_URI = ""; // 動的に設定される

const authenticatedUsers: {
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
      <title>Discord サーバー管理</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          margin: 0;
        }
        h1, h2 {
          margin: 10px 0;
        }
        a, button {
          color: white;
          text-decoration: none;
          background: #4CAF50;
          padding: 10px 20px;
          border-radius: 5px;
          transition: background 0.3s;
          border: none;
          cursor: pointer;
        }
        a:hover, button:hover {
          background: #45a049;
        }
        table {
          width: 80%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #4CAF50;
          color: white;
        }
        form {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        input {
          padding: 10px;
          width: 300px;
          border: none;
          border-radius: 5px;
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

  // `/kanri`で設定値を入力するフォーム
  if (url.pathname === "/kanri" && req.method === "GET") {
    const body = `
      <h1>クライアント情報の設定</h1>
      <form method="POST" action="/kanri">
        <input type="text" name="client_id" placeholder="Client ID" required value="${CLIENT_ID}">
        <input type="text" name="client_secret" placeholder="Client Secret" required value="${CLIENT_SECRET}">
        <input type="text" name="redirect_uri" placeholder="Redirect URI" required value="${REDIRECT_URI}">
        <button type="submit">保存</button>
      </form>
      <p><a href="/joinserver">認証済みユーザーのサーバー情報を見る</a></p>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // `/kanri`フォーム送信で設定値を保存
  if (url.pathname === "/kanri" && req.method === "POST") {
    const formData = await req.formData();
    CLIENT_ID = formData.get("client_id") as string;
    CLIENT_SECRET = formData.get("client_secret") as string;
    REDIRECT_URI = formData.get("redirect_uri") as string;

    return new Response(htmlTemplate("<h1>設定が保存されました！</h1><p><a href='/kanri'>戻る</a></p>"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // `/joinserver`: 認証済みユーザーの全ギルド情報表示
  if (url.pathname === "/joinserver" && req.method === "GET") {
    const guildTableRows = authenticatedUsers
      .flatMap((user) =>
        user.guilds.map(
          (guild) => `
          <tr>
            <td>${user.username}#${user.discriminator}</td>
            <td>${guild.name}</td>
            <td>${guild.id}</td>
          </tr>`
        )
      )
      .join("");

    const body = `
      <h1>認証済みユーザーのサーバー情報</h1>
      <table>
        <thead>
          <tr>
            <th>ユーザー名</th>
            <th>サーバー名</th>
            <th>サーバーID</th>
          </tr>
        </thead>
        <tbody>
          ${guildTableRows || "<tr><td colspan='3'>まだ認証されたユーザーはいません。</td></tr>"}
        </tbody>
      </table>
      <p><a href="/kanri">クライアント情報を変更する</a></p>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // `/callback`: 認証後の処理
  if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("コードがありません", { status: 400 });
    }

    try {
      // Discord APIにトークンをリクエスト
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // ユーザー情報取得
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userData = await userResponse.json();

      // ユーザーが参加しているギルドを取得
      const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const guildData = await guildResponse.json();

      // 認証済みユーザーリストに追加
      authenticatedUsers.push({
        username: userData.username,
        discriminator: userData.discriminator,
        userId: userData.id,
        avatar: userData.avatar,
        guilds: guildData.map((g: any) => ({ name: g.name, id: g.id })),
      });

      return new Response(
        htmlTemplate("<h1>認証に成功しました！</h1><p></p>"),
        { headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    } catch (error) {
      console.error(error);
      return new Response("認証エラーが発生しました", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
