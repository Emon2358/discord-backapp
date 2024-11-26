// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

// メモリ内ストレージ
const botData = { 
  guildId: "", 
  clientId: "",
  botToken: "", 
  clientSecret: "",
  cachedOAuthUrl: "", // キャッシュされたOAuth2 URL
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

// /bombページのHTML
const bombPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bomb Settings</title>
  <style>
    /* Styles omitted for brevity */
  </style>
</head>
<body>
  <h1>Configure Bot</h1>
  <form action="/bomb" method="POST">
    <div class="input-group">
      <label for="guildId">Guild ID:</label>
      <input type="text" id="guildId" name="guildId" required>
    </div>
    <div class="input-group">
      <label for="clientId">Client ID:</label>
      <input type="text" id="clientId" name="clientId" required>
    </div>
    <div class="input-group">
      <label for="botToken">Bot Token:</label>
      <input type="text" id="botToken" name="botToken" required>
    </div>
    <div class="input-group">
      <label for="clientSecret">Client Secret:</label>
      <input type="text" id="clientSecret" name="clientSecret" required>
    </div>
    <button type="submit">Save Settings</button>
  </form>
  
  <h2>Generated OAuth2 URL</h2>
  <p id="authUrl">
    ${botData.cachedOAuthUrl 
      ? `<a href="${botData.cachedOAuthUrl}" target="_blank">Click to Authenticate</a>` 
      : "No URL generated yet."}
  </p>
  <button id="resetOauth2" onclick="resetOauth2()">Reset OAuth2</button>

  <h2>Authenticated Users</h2>
  <ul id="userList"></ul>

  <h2>Join All Users</h2>
  <button id="joinAllBtn" onclick="joinAll()">Join All Users to the Guild</button>
  <div id="status" class="status"></div>

  <script>
    document.addEventListener("DOMContentLoaded", fetchUsers);

    async function fetchUsers() {
      try {
        const response = await fetch('/users');
        const users = await response.json();
        const userList = document.getElementById("userList");
        userList.innerHTML = users.map(u => 
          \`<li><img src="https://cdn.discordapp.com/avatars/\${u.id}/\${u.avatar}.png" 
            alt="avatar" width="30"> \${u.username} さん</li>\`).join("");
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    }

    function resetOauth2() {
      fetch('/reset-oauth2', { method: 'POST' })
        .then(() => location.reload())
        .catch(err => console.error('Failed to reset OAuth2:', err));
    }

    async function joinAll() {
      const statusElement = document.getElementById("status");
      statusElement.textContent = "処理中...";
      try {
        const response = await fetch('/join-all', { method: 'POST' });
        const result = await response.text();
        statusElement.textContent = result;
      } catch (error) {
        statusElement.textContent = 'Failed to join guild: ' + error.message;
      }
    }
  </script>
</body>
</html>
`;

// サーバーロジック
serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/bomb" && req.method === "GET") {
    return new Response(bombPage, {
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
    });
  }

  if (url.pathname === "/reset-oauth2" && req.method === "POST") {
    botData.cachedOAuthUrl = "";
    return new Response("OAuth2 URL reset successfully.");
  }

  if (url.pathname === "/users") {
    const users = Array.from(userTokens.values()).map(token => ({
      id: token.userId,
      username: token.username,
      avatar: token.avatar,
    }));
    return new Response(JSON.stringify(users), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname === "/auth-url") {
    if (!botData.cachedOAuthUrl) {
      const state = crypto.randomUUID();
      botData.cachedOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${botData.clientId}&redirect_uri=${
        encodeURIComponent("https://your-callback-url.com/callback")
      }&response_type=code&scope=identify%20guilds.join&state=${state}`;
    }
    return new Response(botData.cachedOAuthUrl);
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state parameter", { status: 400 });
    }

    try {
      const tokenData = await exchangeToken(code);
      const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json();

      userTokens.set(state, {
        ...tokenData,
        userId: userData.id,
        username: userData.username,
        avatar: userData.avatar,
      });

      const successPage = `
        <h1>認証に成功しました！！</h1>
        <p>
          <img src="https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png" 
          alt="avatar" width="50"> ${userData.username} さんようこそ！！
        </p>
      `;
      return new Response(successPage, { headers: { "Content-Type": "text/html" } });
    } catch (error) {
      return new Response("Authentication failed: " + error.message, { status: 500 });
    }
  }

  if (url.pathname === "/join-all" && req.method === "POST") {
    await refreshAllTokens();
    // Join logic...
    return new Response("Joined successfully.");
  }

  return new Response("Not Found", { status: 404 });
});
