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

// OAuth2トークンリフレッシュ関数
async function refreshAccessToken(userId: string) {
  const tokenData = userTokens.get(userId);
  if (!tokenData || Date.now() < tokenData.expires_at) return tokenData?.access_token;

  const params = new URLSearchParams({
    client_id: botData.clientId,
    client_secret: botData.clientSecret,
    grant_type: "refresh_token",
    refresh_token: tokenData.refresh_token,
  });

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) throw new Error("Failed to refresh access token");

  const refreshedData = await response.json();
  tokenData.access_token = refreshedData.access_token;
  tokenData.expires_at = Date.now() + refreshedData.expires_in * 1000;
  userTokens.set(userId, tokenData);

  return tokenData.access_token;
}

// サーバーロジック
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
        const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

        const userInfo = await fetch("https://discord.com/api/v10/users/@me", {
          method: "GET",
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }).then((res) => res.json());

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
              <h1>認証に成功しました！！</h1>
              <p>
                <img src="https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png" width="50">
                ${userInfo.username}さんようこそ！！
              </p>
              <a></a>
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

  // リアルタイムユーザー表示
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

// ページレンダリング
function renderBombPage() {
  const usersHTML = Array.from(userTokens.values())
    .map(
      (user) =>
        `<li>
          <img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" width="30">
          ${user.username}
        </li>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Bot Configuration</title>
</head>
<body>
  <h1>Bot Configuration</h1>
  <form method="POST">
    <!-- Form -->
  </form>
  <h2>認証済みユーザー</h2>
  <ul>${usersHTML}</ul>
</body>
</html>`;
}
