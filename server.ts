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
  userId?: string;
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

// 全トークンをリフレッシュ
async function refreshAllTokens(): Promise<void> {
  const refreshPromises = Array.from(userTokens.entries()).map(async ([state, tokenData]) => {
    if (isTokenExpired(tokenData)) {
      try {
        const newTokenData = await refreshToken(tokenData.refresh_token);
        userTokens.set(state, { 
          ...newTokenData, 
          userId: tokenData.userId 
        });
      } catch (error) {
        console.error(`Failed to refresh token for state ${state}:`, error);
        userTokens.delete(state);
      }
    }
  });
  await Promise.allSettled(refreshPromises);
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
      userTokens.set(state, {
        ...newTokenData,
        userId: tokenData.userId
      });
      return newTokenData.access_token;
    } catch (error) {
      userTokens.delete(state);
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

// 全ユーザーをサーバーに追加
async function addAllUsersToGuild(): Promise<{ success: number; failed: number; errors: string[] }> {
  await refreshAllTokens();
  
  const results = await Promise.allSettled(
    Array.from(userTokens.entries()).map(async ([state]) => {
      let retryCount = 0;
      while (retryCount < 3) {
        try {
          await addUserToGuild(state);
          return true;
        } catch (error) {
          if (retryCount === 2) throw error;
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    })
  );

  const successful = results.filter(r => r.status === "fulfilled" && r.value === true).length;
  const failed = results.length - successful;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map(r => r.reason?.message || "Unknown error");

  return { success: successful, failed, errors };
}

// サーバー起動
serve(async (req) => {
  const url = new URL(req.url);

  // 設定画面
  if (url.pathname === "/bomb" && req.method === "GET") {
    return new Response(bombPage, { 
      headers: { 
        "Content-Type": "text/html",
        "Cache-Control": "no-store"
      } 
    });
  }

  // 設定保存
  if (url.pathname === "/bomb" && req.method === "POST") {
    try {
      const body = new TextDecoder().decode(await req.arrayBuffer());
      const params = new URLSearchParams(body);
      
      const requiredParams = ['guildId', 'clientId', 'botToken', 'clientSecret'];
      for (const param of requiredParams) {
        const value = params.get(param);
        if (!value) {
          throw new Error(`Missing required parameter: ${param}`);
        }
      }

      botData.guildId = params.get("guildId")!;
      botData.clientId = params.get("clientId")!;
      botData.botToken = params.get("botToken")!;
      botData.clientSecret = params.get("clientSecret")!;

      return new Response("Settings saved successfully! Return to the bomb page to generate your OAuth2 URL.", {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (error) {
      console.error("Save settings error:", error);
      return new Response("Failed to save settings: " + error.message, { status: 500 });
    }
  }

  // OAuth2 URL生成
  if (url.pathname === "/auth-url") {
    if (!botData.guildId || !botData.clientId || !botData.botToken || !botData.clientSecret) {
      return new Response("Settings not configured yet.", { status: 400 });
    }

    try {
      const state = crypto.randomUUID();
      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${botData.clientId}&redirect_uri=${
        encodeURIComponent("https://member-bomb56.deno.dev/callback")
      }&response_type=code&scope=identify%20guilds.join&state=${state}`;
      
      return new Response(authUrl);
    } catch (error) {
      console.error("Generate auth URL error:", error);
      return new Response("Failed to generate auth URL: " + error.message, { status: 500 });
    }
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
      const result = await addAllUsersToGuild();
      
      return new Response(
        `Operation completed: ${result.success} successful, ${result.failed} failed. ` +
        `Errors: ${result.errors.join("; ")}`,
        { headers: { "Content-Type": "text/plain" } }
      );
    } catch (error) {
      console.error("Join all error:", error);
      return new Response("Failed to join users: " + error.message, { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
