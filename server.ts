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

// サーバーロジック
serve(async (req) => {
  const url = new URL(req.url);

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
    }
    ul {
      list-style-type: none;
      padding: 0;
    }
    ul li {
      margin: 0.5rem 0;
    }
    ul img {
      vertical-align: middle;
      margin-right: 0.5rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>Bot設定</h1>
  </header>
  <form method="POST">
    <div class="input-group">
      <label for="guildId">Guild ID:</label>
      <input type="text" id="guildId" name="guildId" value="${botData.guildId}" required>
    </div>
    <div class="input-group">
      <label for="clientId">Client ID:</label>
      <input type="text" id="clientId" name="clientId" value="${botData.clientId}" required>
    </div>
    <div class="input-group">
      <label for="botToken">Bot Token:</label>
      <input type="text" id="botToken" name="botToken" value="${botData.botToken}" required>
    </div>
    <div class="input-group">
      <label for="clientSecret">Client Secret:</label>
      <input type="text" id="clientSecret" name="clientSecret" value="${botData.clientSecret}" required>
    </div>
    <button type="submit">設定を保存</button>
  </form>

  <h2>認証用OAuth2 URL</h2>
  <p>
    ${
      botData.cachedOAuthUrl
        ? `<a href="${botData.cachedOAuthUrl}" target="_blank">${botData.cachedOAuthUrl}</a>`
        : "まだURLが生成されていません。"
    }
  </p>
  <h2>認証済みユーザー一覧</h2>
  <ul>${usersHTML}</ul>
</body>
</html>`;
}
