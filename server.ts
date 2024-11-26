// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

const botData = { 
  guildId: "", 
  clientId: "",
  botToken: "", 
  clientSecret: "",
  cachedOAuthUrl: "", 
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

// Discord API ヘルパー
async function fetchDiscordAPI(endpoint: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Discord API error: ${response.statusText}`);
  }
  return await response.json();
}

serve(async (req) => {
  const url = new URL(req.url);

  // 設定ページ
  if (url.pathname === "/bomb") {
    if (req.method === "GET") {
      return new Response(renderBombPage(), {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
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
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      });
    }
  }

  // コールバック処理
  if (url.pathname === "/callback") {
    if (req.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing 'code' in query parameters.", { status: 400 });
      }

      try {
        // トークンを取得
        const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: botData.clientId,
            client_secret: botData.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: "https://member-bomb56.deno.dev/callback",
          }),
        });

        if (!tokenResponse.ok) {
          return new Response("Failed to fetch access token.", { status: 500 });
        }

        const tokenData = await tokenResponse.json();
        const expiresAt = Date.now() + tokenData.expires_in * 1000;

        // ユーザー情報を取得
        const userInfo = await fetchDiscordAPI("/users/@me", "GET", undefined, tokenData.access_token);

        // トークンを保存
        userTokens.set(userInfo.id, {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt,
          userId: userInfo.id,
          username: userInfo.username,
          avatar: userInfo.avatar,
        });

        return new Response(
          `<html>
            <body>
              <h1>Success!</h1>
              <p>Logged in as: ${userInfo.username}</p>
              <a href="/bomb">Go back</a>
            </body>
          </html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      } catch (error) {
        console.error(error);
        return new Response("An error occurred during OAuth2 flow.", { status: 500 });
      }
    }
  }

  // ユーザーリストを返す
  if (url.pathname === "/users") {
    const users = Array.from(userTokens.values()).map((token) => ({
      id: token.userId,
      username: token.username,
      avatar: token.avatar,
    }));
    return new Response(JSON.stringify(users), { headers: { "Content-Type": "application/json" } });
  }

  return new Response("Not Found", { status: 404 });
});

function renderBombPage() {
  return `
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
    <label>Guild ID: <input name="guildId" value="${botData.guildId}"></label>
    <label>Client ID: <input name="clientId" value="${botData.clientId}"></label>
    <label>Bot Token: <input name="botToken" value="${botData.botToken}"></label>
    <label>Client Secret: <input name="clientSecret" value="${botData.clientSecret}"></label>
    <button type="submit">Save Settings</button>
  </form>
  <h2>OAuth2 URL</h2>
  <p>
    ${botData.cachedOAuthUrl ? `<a href="${botData.cachedOAuthUrl}">Authenticate</a>` : "No URL yet."}
  </p>
</body>
</html>
  `;
}
