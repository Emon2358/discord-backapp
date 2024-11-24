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

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

const userTokens = new Map<string, TokenData>();

// トークンの有効性をチェック
function isTokenExpired(tokenData: TokenData): boolean {
  return Date.now() >= tokenData.expires_at;
}

// トークンをリフレッシュ
async function refreshToken(refreshToken: string): Promise<TokenData> {
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: botData.clientId,
        client_secret: botData.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };
  } catch (error) {
    console.error("Refresh token error:", error);
    throw error;
  }
}

// トークンを取得（必要な場合はリフレッシュ）
async function getValidToken(state: string): Promise<string> {
  const tokenData = userTokens.get(state);
  if (!tokenData) {
    throw new Error("No token data found");
  }

  if (isTokenExpired(tokenData)) {
    try {
      const newTokenData = await refreshToken(tokenData.refresh_token);
      userTokens.set(state, newTokenData);
      return newTokenData.access_token;
    } catch (error) {
      userTokens.delete(state); // リフレッシュに失敗した場合はトークンを削除
      throw error;
    }
  }

  return tokenData.access_token;
}

// トークンを交換
async function exchangeToken(code: string): Promise<TokenData> {
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };
  } catch (error) {
    console.error("Exchange token error:", error);
    throw error;
  }
}

// サーバーに参加させる
async function addUserToGuild(state: string, retryCount = 0): Promise<Response> {
  try {
    const accessToken = await getValidToken(state);
    console.log("Adding user to guild with access token:", accessToken.substring(0, 10) + "...");
    
    // ユーザー情報を取得
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to get user info: ${await userResponse.text()}`);
    }

    const userData = await userResponse.json();
    const userId = userData.id;

    // ユーザーを追加
    const response = await fetch(`https://discord.com/api/v10/guilds/${botData.guildId}/members/${userId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bot ${botData.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        roles: []
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // トークンエラーの場合、リトライを試みる
      if (response.status === 401 && retryCount < 3) {
        console.log(`Retrying after token error (attempt ${retryCount + 1})`);
        return addUserToGuild(state, retryCount + 1);
      }
      
      throw new Error(`Failed to join guild: ${response.status} ${errorText}`);
    }

    return response;
  } catch (error) {
    console.error("Add to guild error:", error);
    throw error;
  }
}

// サーバー起動
serve(async (req) => {
  const url = new URL(req.url);

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
      return new Response(
        "Authentication successful! Return to /bomb and proceed with joining the server.",
        { headers: { "Content-Type": "text/plain" } }
      );
    } catch (error) {
      console.error("Callback error:", error);
      return new Response("Authentication failed: " + error.message, { status: 500 });
    }
  }

  // サーバーに一斉参加
  if (url.pathname === "/join-all" && req.method === "POST") {
    if (userTokens.size === 0) {
      return new Response("No authenticated users found.", { status: 400 });
    }

    try {
      console.log("Starting join operation for", userTokens.size, "users");
      
      const results = await Promise.allSettled(
        [...userTokens.keys()].map(state =>
          addUserToGuild(state)
        )
      );

      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;

      console.log("Join operation results:", { successful, failed });

      // 詳細なエラー情報を含める
      const failedDetails = results
        .filter(r => r.status === "rejected")
        .map(r => (r as PromiseRejectedResult).reason.message)
        .join("; ");

      return new Response(
        `Join operation completed: ${successful} successful, ${failed} failed. ${failedDetails}`,
        { headers: { "Content-Type": "text/plain" } }
      );
    } catch (error) {
      console.error("Join all error:", error);
      return new Response("Failed to join users: " + error.message, { status: 500 });
    }
  }

  // 他のルートハンドラーは省略...
  return new Response("Not Found", { status: 404 });
});
