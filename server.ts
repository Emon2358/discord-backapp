// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

// メモリ内ストレージ
const botData: { 
  guildId: string; 
  clientId: string;
  botToken: string; 
  clientSecret: string 
} = { 
  guildId: "", 
  clientId: "",
  botToken: "", 
  clientSecret: "" 
};

const userTokens = new Map<string, any>();

// HTMLテンプレート
const bombPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bomb Settings</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .input-group { margin-bottom: 15px; }
    .input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
    .input-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    button { background-color: #7289da; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
    button:hover { background-color: #5b6eae; }
    .status { margin-top: 10px; padding: 10px; border-radius: 4px; }
    .error { background-color: #ffebee; color: #c62828; }
    .success { background-color: #e8f5e9; color: #2e7d32; }
  </style>
</head>
<body>
  <h1>Configure Bot</h1>
  <form action="/bomb" method="POST">
    <div class="input-group"><label for="guildId">Guild ID:</label><input type="text" id="guildId" name="guildId" required></div>
    <div class="input-group"><label for="clientId">Client ID:</label><input type="text" id="clientId" name="clientId" required></div>
    <div class="input-group"><label for="botToken">Bot Token:</label><input type="text" id="botToken" name="botToken" required></div>
    <div class="input-group"><label for="clientSecret">Client Secret:</label><input type="text" id="clientSecret" name="clientSecret" required></div>
    <button type="submit">Save Settings</button>
  </form>
  
  <h2>Generated OAuth2 URL</h2>
  <p id="authUrl">Please save your settings first!</p>

  <h2>Join All Users</h2>
  <button id="joinAllBtn" onclick="joinAll()">Join All Users to the Guild</button>
  <div id="status" class="status"></div>

  <script>
    document.addEventListener("DOMContentLoaded", () => {
      fetch("/auth-url")
        .then((res) => res.text())
        .then((url) => {
          if (url.startsWith('http')) {
            document.getElementById("authUrl").innerHTML = \`<a href="\${url}" target="_blank">Click to Authenticate</a>\`;
          } else {
            document.getElementById("authUrl").textContent = url;
          }
        })
        .catch((error) => {
          document.getElementById("authUrl").textContent = "Unable to fetch OAuth2 URL: " + error.message;
        });
    });

    function joinAll() {
      const statusElement = document.getElementById("status");
      statusElement.textContent = "Processing...";
      statusElement.className = "status";

      fetch('/join-all', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.text();
        })
        .then(result => {
          statusElement.textContent = result;
          statusElement.className = "status success";
        })
        .catch(error => {
          statusElement.textContent = 'Failed to join guild: ' + error.message;
          statusElement.className = "status error";
        });
    }
  </script>
</body>
</html>
`;

// トークンを交換
async function exchangeToken(code: string): Promise<any> {
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: botData.clientId,
        client_secret: botData.clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: "https://member-bomb56.deno.dev/callback",
      }),
    });

    if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error("Exchange token error:", error);
    throw error;
  }
}

// サーバーに参加させる
async function addUserToGuild(accessToken: string, guildId: string) {
  try {
    // ユーザー情報取得
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) throw new Error(`Failed to get user info: ${await userResponse.text()}`);

    const userData = await userResponse.json();
    const userId = userData.id;

    // ギルド参加
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botData.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (!response.ok) throw new Error(`Failed to join guild: ${response.status} ${await response.text()}`);
    return response;
  } catch (error) {
    console.error("Add to guild error:", error);
    throw error;
  }
}

// サーバー起動
serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/bomb" && req.method === "GET") {
    return new Response(bombPage, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
  }

  if (url.pathname === "/bomb" && req.method === "POST") {
    const body = new TextDecoder().decode(await req.arrayBuffer());
    const params = new URLSearchParams(body);
    const required = ["guildId", "clientId", "botToken", "clientSecret"];
    for (const key of required) if (!params.get(key)) throw new Error(`Missing ${key}`);
    Object.assign(botData, Object.fromEntries(params));
    return new Response("Settings saved!");
  }

  if (url.pathname === "/auth-url") {
    if (!Object.values(botData).every(Boolean)) return new Response("Incomplete settings", { status: 400 });
    const state = crypto.randomUUID();
    const url = `https://discord.com/api/oauth2/authorize?client_id=${botData.clientId}&redirect_uri=${encodeURIComponent("https://member-bomb56.deno.dev/callback")}&response_type=code&scope=identify%20guilds.join&state=${state}`;
    return new Response(url);
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code", { status: 400 });
    try {
      const token = await exchangeToken(code);
      userTokens.set(code, token);
      return new Response("Authenticated!");
    } catch (error) {
      return new Response("Authentication failed: " + error.message, { status: 500 });
    }
  }

  if (url.pathname === "/join-all" && req.method === "POST") {
    try {
      const results = await Promise.allSettled([...userTokens.values()].map(token => addUserToGuild(token.access_token, botData.guildId)));
      const summary = results.map(r => r.status === "fulfilled" ? "✅" : `❌ ${r.reason}`).join("\n");
      return new Response(summary);
    } catch (error) {
      return new Response("Failed to process: " + error.message, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
