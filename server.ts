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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord 認証システム</title>
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
          background: linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%);
          color: #333;
        }
        h1 {
          color: #fff;
        }
        a {
          color: #fff;
          text-decoration: none;
          background-color: #007bff;
          padding: 10px 20px;
          border-radius: 5px;
          transition: background-color 0.3s ease;
        }
        a:hover {
          background-color: #0056b3;
        }
        ul {
          list-style-type: none;
          padding: 0;
        }
        li {
          margin-bottom: 10px;
        }
        img {
          border-radius: 50%;
        }
        .success {
          animation: fadeIn 2s ease-in-out;
          text-align: center;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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

  // /joinserver: 認証済みユーザー一覧を表示
  if (url.pathname === "/joinserver" && req.method === "GET") {
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

  // /auth: 認証成功後の美しいUI表示
  } else if (url.pathname === "/auth" && req.method === "GET") {
    const body = `
      <div class="success">
        <h1>認証に成功しました！！</h1>
        <p>ようこそ！認証が完了しました。</p>
        <p><a href="/joinserver">認証済みユーザー一覧を見る</a></p>
      </div>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  // /kanri: 管理者専用ページ
  } else if (url.pathname === "/kanri" && req.method === "GET") {
    const adminHtml = authenticatedUsers
      .map((user) => `
        <li>
          ${user.username}#${user.discriminator} (ID: ${user.userId})<br>
          <a href="/remove?id=${user.userId}">ユーザーを削除</a>
        </li>
      `)
      .join("");

    const body = `
      <h1>管理者専用ページ</h1>
      <ul>
        ${adminHtml || "<p>認証されたユーザーがいません。</p>"}
      </ul>
      <p><a href="/joinserver">戻る</a></p>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  // /callback: Discord OAuth2認証
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

      authenticatedUsers.push({
        username: userData.username,
        discriminator: userData.discriminator,
        userId: userData.id,
        avatar: userData.avatar,
        guilds: guildsData.map((guild: any) => ({
          name: guild.name,
          id: guild.id,
        })),
      });

      // 認証成功ページへリダイレクト
      return new Response("", {
        status: 303,
        headers: { Location: "/auth" },
      });
    } catch (error) {
      console.error("OAuth2認証エラー:", error);
      return new Response(
        htmlTemplate(`<h1>エラー</h1><p>${error.message}</p>`),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

  // /remove: ユーザー削除
  } else if (url.pathname.startsWith("/remove") && req.method === "GET") {
    const userId = url.searchParams.get("id");
    if (userId) {
      authenticatedUsers = authenticatedUsers.filter(
        (user) => user.userId !== userId
      );
    }
    return new Response("", {
      status: 303,
      headers: { Location: "/kanri" },
    });
  } else {
    return new Response("Not Found", { status: 404 });
  }
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
