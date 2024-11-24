import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

// メモリ内ストレージ
const botData: { guildId: string; botToken: string; clientSecret: string } = { guildId: "", botToken: "", clientSecret: "" };
// deno-lint-ignore no-explicit-any
const userTokens = new Map<string, any>();

// HTMLテンプレート
const bombPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bomb Settings</title>
</head>
<body>
  <h1>Configure Bot</h1>
  <form action="/bomb" method="POST">
    <label for="guildId">Guild ID:</label><br>
    <input type="text" id="guildId" name="guildId" required><br><br>
    <label for="botToken">Bot clientid:</label><br>
    <input type="text" id="botToken" name="botToken" required><br><br>
    <label for="clientSecret">Client Secret:</label><br>
    <input type="text" id="clientSecret" name="clientSecret" required><br><br>
    <button type="submit">Save Settings</button>
  </form>
  <h2>Generated OAuth2 URL</h2>
  <p id="authUrl">Please save your settings first!</p>

  <h2>Join All Users</h2>
  <button id="joinAllBtn" onclick="joinAll()">Join All Users to the Guild</button>

  <script>
    document.addEventListener("DOMContentLoaded", () => {
      fetch("/auth-url")
        .then((res) => res.text())
        .then((url) => {
          document.getElementById("authUrl").innerHTML = \`<a href="\${url}" target="_blank">Click to Authenticate</a>\`;
        })
        .catch(() => {
          document.getElementById("authUrl").textContent = "Unable to fetch OAuth2 URL.";
        });
    });

    function joinAll() {
      fetch('/join-all', { method: 'POST' })
        .then(response => response.text())
        .then(result => {
          alert(result);
        })
        .catch(error => {
          alert('Failed to join all users.');
        });
    }
  </script>
</body>
</html>
`;

// トークンを交換
// deno-lint-ignore no-explicit-any
async function exchangeToken(code: string): Promise<any> {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: botData.botToken.split(".")[0], // ボットトークンからクライアントIDを抽出
      client_secret: botData.clientSecret, // 追加されたClient Secretを使用
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://member-bomb56.deno.dev/callback",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange token: ${await response.text()}`);
  }

  return await response.json();
}

// サーバーに参加させる
async function addUserToGuild(accessToken: string, guildId: string) {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!response.ok) {
    throw new Error(`Failed to join guild: ${await response.text()}`);
  }
}

// サーバー起動
serve(async (req) => {
  const url = new URL(req.url);

  // 設定画面
  if (url.pathname === "/bomb" && req.method === "GET") {
    return new Response(bombPage, { headers: { "Content-Type": "text/html" } });
  }

  // 設定保存
  if (url.pathname === "/bomb" && req.method === "POST") {
    const body = new TextDecoder().decode(await req.arrayBuffer());
    const params = new URLSearchParams(body);
    botData.guildId = params.get("guildId")!;
    botData.botToken = params.get("botToken")!;
    botData.clientSecret = params.get("clientSecret")!; // Client Secretを保存

    return new Response("Settings saved successfully! Return to the bomb page to generate your OAuth2 URL.", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // OAuth2 URL生成
  if (url.pathname === "/auth-url") {
    if (!botData.guildId || !botData.botToken || !botData.clientSecret) {
      return new Response("Settings not configured yet.", { status: 400 });
    }

    const state = crypto.randomUUID();
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${
      botData.botToken.split(".")[0]
    }&redirect_uri=${encodeURIComponent("https://member-bomb56.deno.dev/callback")}&response_type=code&scope=identify%20guilds.join&state=${state}`;
    return new Response(authUrl);
  }

  // OAuth2 コールバック
  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state parameter", { status: 400 });
    }

    try {
      const tokenData = await exchangeToken(code);
      userTokens.set(state, tokenData);
      return new Response("Authentication successful! Return to /bomb and proceed with joining the server.", {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (err) {
      console.error("Error in callback:", err);
      return new Response("Internal server error", { status: 500 });
    }
  }

  // サーバーに一斉参加
  if (url.pathname === "/join-all" && req.method === "POST") {
    try {
      const promises = [...userTokens.values()].map((token) =>
        addUserToGuild(token.access_token, botData.guildId)
      );
      await Promise.all(promises);
      return new Response("All users successfully joined the server!", { headers: { "Content-Type": "text/plain" } });
    } catch (err) {
      console.error("Error in join-all:", err);
      return new Response("Failed to join all users.", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
