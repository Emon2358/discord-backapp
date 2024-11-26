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

  if (url.pathname === "/joinserver" && req.method === "GET") {
    // 認証済みユーザー一覧のHTML生成
    const userListHtml = authenticatedUsers
      .map((user) => {
        return `
          <li>
            <strong>${user.username}#${user.discriminator}</strong><br>
            <img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" alt="Avatar" width="50"><br>
            <ul>
              ${user.guilds
                .map(
                  (guild) => `
                  <li>${guild.name} (ID: ${guild.id})</li>
                `
                )
                .join("")}
            </ul>
          </li>
        `;
      })
      .join("");

    const body = `
      <h1>認証済みユーザー一覧</h1>
      <ul>
        ${userListHtml || "<p>まだ認証されたユーザーはいません。</p>"}
      </ul>
      <p><a></a></p>
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else if (url.pathname === "/kanri" && req.method === "GET") {
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
      ${authUrl ? `<p><a href="${authUrl}">Discord認証を開始</a></p>` : ""}
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
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

      config.CLIENT_ID = String(clientId);
      config.CLIENT_SECRET = String(clientSecret);
      config.REDIRECT_URI = String(redirectUri);

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
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
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

      // ユーザー情報を保存
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

      // `/joinserver` にリダイレクト
      return new Response("", {
        status: 303,
        headers: { Location: "/joinserver" },
      });
    } catch (error) {
      console.error("OAuth2認証エラー:", error);
      return new Response(`<h1>エラー</h1><p>${error.message}</p>`, {
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
