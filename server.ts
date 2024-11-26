// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

const botData = {
  guildId: "",
  clientId: "",
  botToken: "",
  clientSecret: "",
  cachedOAuthUrl: "", // OAuth2 URLを永続化
};

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  userId?: string;
  username?: string;
  avatar?: string;
}

const userTokens = new Map<string, TokenData>();

// トークン取得用のヘルパー関数
async function fetchToken(code: string): Promise<TokenData | null> {
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: botData.clientId,
        client_secret: botData.clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: "https://member-bomb56.deno.dev/callback",
      }).toString(),
    });

    if (!response.ok) {
      console.error("Failed to fetch token:", await response.text());
      return null;
    }

    const tokenData = await response.json();
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
  } catch (error) {
    console.error("Error fetching token:", error);
    return null;
  }
}

// ユーザー情報取得用のヘルパー関数
async function fetchUserInfo(accessToken: string): Promise<{ id: string; username: string; avatar: string } | null> {
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch user info:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching user info:", error);
    return null;
  }
}

// サーバーロジック
serve(async (req) => {
  const url = new URL(req.url);

  // Callback処理
  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Authorization code not found.", { status: 400 });
    }

    // トークン取得
    const token = await fetchToken(code);
    if (!token) {
      return new Response("Failed to retrieve token.", { status: 500 });
    }

    // ユーザー情報取得
    const userInfo = await fetchUserInfo(token.access_token);
    if (!userInfo) {
      return new Response("Failed to retrieve user info.", { status: 500 });
    }

    // トークンにユーザー情報を保存
    token.userId = userInfo.id;
    token.username = userInfo.username;
    token.avatar = userInfo.avatar;
    userTokens.set(userInfo.id, token);

    // 認証成功ページの表示
    return new Response(renderCallbackPage(userInfo.username, userInfo.avatar), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 設定ページ
  if (url.pathname === "/bomb") {
    if (req.method === "GET") {
      return new Response(renderBombPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    } else if (req.method === "POST") {
      const formData = await req.formData();
      botData.guildId = formData.get("guildId")?.toString() || "";
      botData.clientId = formData.get("clientId")?.toString() || "";
      botData.botToken = formData.get("botToken")?.toString() || "";
      botData.clientSecret = formData.get("clientSecret")?.toString() || "";

      botData.cachedOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${botData.clientId}&redirect_uri=${
        encodeURIComponent("https://member-bomb56.deno.dev/callback")
      }&response_type=code&scope=identify%20guilds.join`;

      // ボットがサーバーに参加
      if (botData.guildId && botData.botToken) {
        const joinResponse = await joinGuild(botData.guildId, botData.botToken);
        if (joinResponse.ok) {
          console.log(`Successfully added bot to guild ${botData.guildId}`);
        } else {
          console.error(`Failed to add bot to guild ${botData.guildId}: ${await joinResponse.text()}`);
        }
      }

      return new Response(renderBombPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  // リアルタイムユーザー表示
  if (url.pathname === "/users") {
    const users = Array.from(userTokens.values()).map((token) => ({
      id: token.userId,
      username: token.username,
      avatar: token.avatar,
    }));
    return new Response(JSON.stringify(users), { headers: { "Content-Type": "application/json; charset=utf-8" } });
  }

  return new Response("Not Found", { status: 404 });
});

// サーバー参加処理
async function joinGuild(guildId: string, botToken: string): Promise<Response> {
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botData.clientId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: botToken,
      }),
    });

    return response;
  } catch (error) {
    console.error("Error joining guild:", error);
    return new Response("Error joining guild.", { status: 500 });
  }
}

// ページレンダリング関数
function renderBombPage() {
  const usersHTML = Array.from(userTokens.values())
    .map(
      (user) =>
        `<li>
          <img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" width="30" alt="Avatar">
          ${user.username}
        </li>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bot設定ページ</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      background-color: #f4f4f9;
      color: #333;
      margin: 0;
      padding: 0;
    }
    header {
      background: #333;
      color: #fff;
      padding: 1rem 0;
      text-align: center;
    }
    form {
      margin: 1rem auto;
      padding: 1rem;
      max-width: 500px;
      background: #fff;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
    }
    .input-group {
      margin-bottom: 1rem;
    }
    .input-group label {
      display: block;
      margin-bottom: 0.5rem;
    }
    .input-group input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    button {
      display: block;
      width: 100%;
      padding: 0.7rem;
      background: #007bff;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0056b3;
    }
    h2 {
      margin: 1rem 0;
      text-align: center;
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    li {
      padding: 0.5rem;
      border-bottom: 1px solid #ddd;
    }
  </style>
</head>
<body>
<header>
  <h1>Bot設定</h1>
</header>
<main>
  <form action="/bomb" method="POST">
    <div class="input-group">
      <label for="guildId">Guild ID</label>
      <input type="text" id="guildId" name="guildId" required>
    </div>
    <div class="input-group">
      <label for="clientId">Client ID</label>
      <input type="text" id="clientId" name="clientId" required>
    </div>
    <div class="input-group">
      <label for="botToken">Bot Token</label>
      <input type="text" id="botToken" name="botToken" required>
    </div>
    <div class="input-group">
      <label for="clientSecret">Client Secret</label>
      <input type="text" id="clientSecret" name="clientSecret" required>
    </div>
    <button type="submit">設定を保存</button>
  </form>
  <h2>現在の参加ユーザー</h2>
  <ul>${usersHTML}</ul>
</main>
</body>
</html>`;
}

// 認証完了時のページ表示
function renderCallbackPage(username: string, avatar: string) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証完了</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      background-color: #f4f4f9;
      color: #333;
      margin: 0;
      padding: 0;
    }
    header {
      background: #333;
      color: #fff;
      padding: 1rem 0;
      text-align: center;
    }
    h2 {
      margin-top: 1rem;
      text-align: center;
    }
    img {
      display: block;
      margin: 1rem auto;
      border-radius: 50%;
    }
  </style>
</head>
<body>
<header>
  <h1>認証完了</h1>
</header>
<main>
  <h2>ようこそ、${username} さん！</h2>
  <img src="https://cdn.discordapp.com/avatars/${avatar}.png" alt="Your Avatar" width="100">
</main>
</body>
</html>`;
}
