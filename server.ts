import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

// 認証後のユーザー情報を保存するための配列
const authenticatedUsers: {
  username: string;
  discriminator: string;
  userId: string;
  avatar: string;
  guilds: { name: string; id: string }[];
}[] = [];

// OAuth2認証のURL生成関数
function generateOAuth2Url(clientId: string, redirectUri: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=identify%20guilds`;
}

// HTMLテンプレート生成関数
function htmlTemplate(body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>認証ページ</title>
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

  // /callback エンドポイント
  if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");

    if (!code || !clientId || !redirectUri) {
      return new Response("必要な情報が不足しています。", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      // Discordのトークンを取得
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: "YOUR_CLIENT_SECRET", // 必要に応じてこちらを使用
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error("認証に失敗しました: " + tokenData.error_description);
      }

      // ユーザー情報を取得
      const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();

      // ユーザーが参加しているサーバーを取得
      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const guildsData = await guildsRes.json();

      // ユーザー情報とサーバー情報を保存
      authenticatedUsers.push({
        username: userData.username,
        discriminator: userData.discriminator,
        userId: userData.id,
        avatar: userData.avatar,
        guilds: guildsData.map((guild: any) => ({ name: guild.name, id: guild.id })),
      });

      // 認証成功のメッセージ
      const body = `
        <h1>認証に成功しました！</h1>
        <p>${userData.username}#${userData.discriminator} さん、ようこそ！</p>
        <p><a href="/joinserver" class="button">サーバー一覧を表示</a></p>
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
  }

  // /joinserver エンドポイント
  else if (url.pathname === "/joinserver" && req.method === "GET") {
    if (authenticatedUsers.length === 0) {
      return new Response("認証されたユーザーがいません。", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // すべての認証済みユーザーのサーバー情報を表示
    let body = "<h1>認証したユーザーのサーバー一覧</h1>";

    authenticatedUsers.forEach((user) => {
      body += `
        <h2>${user.username}#${user.discriminator}</h2>
        <ul>
          ${user.guilds.map((guild) => `<li>${guild.name}</li>`).join("")}
        </ul>
      `;
    });

    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // その他のリクエスト
  else {
    return new Response("Not Found", { status: 404 });
  }
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
