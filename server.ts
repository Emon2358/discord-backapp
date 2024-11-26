import { serve } from "https://deno.land/std@0.197.0/http/server.ts";

// 設定ファイルのパス
const CONFIG_FILE = "./config.json";

// 設定情報
let config: Record<string, string> = {};

// 設定の読み込み・保存関数
async function loadConfig() {
  try {
    const data = await Deno.readTextFile(CONFIG_FILE);
    config = JSON.parse(data);
  } catch (error) {
    console.error("設定ファイルの読み込みエラー:", error);
    config = {};
  }
}

async function saveConfig() {
  try {
    await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("設定ファイルの保存エラー:", error);
  }
}

// DiscordのAPIを使ってアクセストークンを取得する関数
async function getAccessToken(code: string): Promise<string | null> {
  const url = "https://discord.com/api/oauth2/token";
  const params = new URLSearchParams();
  params.append("client_id", config.CLIENT_ID);
  params.append("client_secret", config.CLIENT_SECRET);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", config.REDIRECT_URI);

  const response = await fetch(url, {
    method: "POST",
    body: params,
  });

  if (!response.ok) {
    console.error("アクセストークンの取得に失敗しました");
    return null;
  }

  const data = await response.json();
  return data.access_token;
}

// DiscordのAPIを使ってユーザーが参加しているサーバーを取得する関数
async function getUserServers(accessToken: string) {
  const url = "https://discord.com/api/v10/users/@me/guilds";
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error("ユーザーサーバーの取得に失敗しました");
    return [];
  }

  return await response.json();
}

// DiscordのAPIを使ってサーバーのメンバーリストを取得する関数
async function getServerMembers(serverId: string, botToken: string) {
  const url = `https://discord.com/api/v10/guilds/${serverId}/members?limit=1000`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!response.ok) {
    console.error("サーバーメンバーの取得に失敗しました");
    return [];
  }

  return await response.json();
}

// メインハンドラー
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 設定情報ページ
  if (url.pathname === "/kanri") {
    const body = `
      <h1>設定情報を入力</h1>
      <form action="/save-config" method="POST">
        <label for="CLIENT_ID">Discord Client ID</label>
        <input type="text" name="CLIENT_ID" value="${config.CLIENT_ID || ''}" required><br>

        <label for="CLIENT_SECRET">Discord Client Secret</label>
        <input type="text" name="CLIENT_SECRET" value="${config.CLIENT_SECRET || ''}" required><br>

        <label for="REDIRECT_URI">Redirect URI</label>
        <input type="text" name="REDIRECT_URI" value="${config.REDIRECT_URI || ''}" required><br>

        <button type="submit">設定を保存</button>
      </form>
    `;

    const authUrl = config.CLIENT_ID && config.REDIRECT_URI
      ? `https://discord.com/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(config.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`
      : null;

    return new Response(`
      ${body}
      ${authUrl ? `<p><a href="${authUrl}" target="_blank">Discord認証を開始</a></p>` : ''}
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 設定保存処理
  else if (url.pathname === "/save-config" && req.method === "POST") {
    try {
      const formData = await req.formData();
      config.CLIENT_ID = formData.get("CLIENT_ID") as string || "";
      config.CLIENT_SECRET = formData.get("CLIENT_SECRET") as string || "";
      config.REDIRECT_URI = formData.get("REDIRECT_URI") as string || "";

      await saveConfig();

      return new Response("<p>設定が保存されました。</p><p><a href='/kanri'>設定ページに戻る</a></p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      console.error("設定保存エラー:", error);
      return new Response(`<p>エラー: ${error.message}</p>`, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // joinserver ページ（サーバー検索機能）
  else if (url.pathname === "/joinserver") {
    const queryParams = url.searchParams;
    const code = queryParams.get("code");

    if (!code) {
      return new Response("<p>認証コードが見つかりません。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const accessToken = await getAccessToken(code);
    if (!accessToken) {
      return new Response("<p>アクセストークンの取得に失敗しました。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const servers = await getUserServers(accessToken);
    if (servers.length === 0) {
      return new Response("<p>参加しているサーバーが見つかりませんでした。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const serverList = servers.map((server: any) => `
      <form action="/joinserver/${server.id}" method="GET">
        <button type="submit">${server.name}</button>
      </form>
    `).join("");

    return new Response(`
      <h1>参加しているサーバー</h1>
      ${serverList}
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 特定のサーバーのメンバーリスト
  else if (url.pathname.startsWith("/joinserver/")) {
    const serverId = url.pathname.split("/").pop();
    if (!serverId) {
      return new Response("<p>サーバーIDが不正です。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const queryParams = url.searchParams;
    const code = queryParams.get("code");

    if (!code) {
      return new Response("<p>認証コードが見つかりません。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const accessToken = await getAccessToken(code);
    if (!accessToken) {
      return new Response("<p>アクセストークンの取得に失敗しました。</p>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 必要なBotのトークンを使ってメンバーリストを取得
    const botToken =
