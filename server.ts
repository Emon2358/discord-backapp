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

  return new Response("Not Found", { status: 404 });
});

// 認証成功ページのレンダリング
function renderCallbackPage(username: string, avatar: string) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証成功</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f9;
      text-align: center;
      margin-top: 50px;
    }
    img {
      border-radius: 50%;
      margin: 20px 0;
    }
    h1 {
      color: #333;
    }
  </style>
</head>
<body>
  <h1>認証に成功しました！！</h1>
  <img src="https://cdn.discordapp.com/avatars/${username}/${avatar}.png" alt="Avatar" width="100">
  <p><strong>${username}</strong> さんようこそ！！</p>
</body>
</html>`;
}
