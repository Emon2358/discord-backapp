import { serve } from "https://deno.land/std@0.197.0/http/server.ts";
import { readFileStr, writeFileStr, exists } from "https://deno.land/std@0.197.0/fs/mod.ts";

const CONFIG_FILE = "./config.json";
const USERS_FILE = "./authenticated_users.json";

let config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
  AUTH_URL: "",
};

let authenticatedUsers: {
  username: string;
  discriminator: string;
  userId: string;
  avatar: string;
  guilds: { name: string; id: string }[];
}[] = [];

// ファイルの読み込みと保存
async function saveConfig() {
  await writeFileStr(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function loadConfig() {
  if (await exists(CONFIG_FILE)) {
    config = JSON.parse(await readFileStr(CONFIG_FILE));
  }
}

async function saveUsers() {
  await writeFileStr(USERS_FILE, JSON.stringify(authenticatedUsers, null, 2));
}

async function loadUsers() {
  if (await exists(USERS_FILE)) {
    authenticatedUsers = JSON.parse(await readFileStr(USERS_FILE));
  }
}

// HTMLテンプレート生成
function htmlTemplate(body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>管理ページ</title>
    </head>
    <body>
      ${body}
    </body>
    </html>
  `;
}

// リクエストハンドラ
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/kanri" && req.method === "GET") {
    const authUrl =
      config.AUTH_URL ||
      (config.CLIENT_ID && config.REDIRECT_URI
        ? `https://discord.com/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(
            config.REDIRECT_URI
          )}&response_type=code&scope=identify%20guilds`
        : null);

    if (authUrl && !config.AUTH_URL) {
      config.AUTH_URL = authUrl;
      await saveConfig();
    }

    const body = `
      <h1>設定情報を入力</h1>
      <form action="/save-config" method="POST">
        <label for="CLIENT_ID">Discord Client ID</label>
        <input type="text" name="CLIENT_ID" value="${config.CLIENT_ID}" required><br>

        <label for="CLIENT_SECRET">Discord Client Secret</label>
        <input type="text" name="CLIENT_SECRET" value="${config.CLIENT_SECRET}" required><br>

        <label for="REDIRECT_URI">Redirect URI</label>
        <input type="text" name="REDIRECT_URI" value="${config.REDIRECT_URI}" required><br>

        <button type="submit">設定を保存</button>
      </form>
      ${authUrl ? `<p><a href="${authUrl}">Discord認証を開始</a></p>` : ""}
    `;
    return new Response(htmlTemplate(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else if (url.pathname === "/save-config" && req.method === "POST") {
    try {
      const formData = await req.formData();
      config.CLIENT_ID = formData.get("CLIENT_ID") as string || "";
      config.CLIENT_SECRET = formData.get("CLIENT_SECRET") as string || "";
      config.REDIRECT_URI = formData.get("REDIRECT_URI") as string || "";

      if (config.CLIENT_ID && config.REDIRECT_URI) {
        config.AUTH_URL = `https://discord.com/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(
          config.REDIRECT_URI
        )}&response_type=code&scope=identify%20guilds`;
      }

      await saveConfig();

      return new Response("", { status: 303, headers: { Location: "/kanri" } });
    } catch (error) {
      console.error("設定保存エラー:", error);
      return new Response(htmlTemplate(`<p>エラー: ${error.message}</p>`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");

    if (!code || !config.CLIENT_ID || !config.CLIENT_SECRET || !config.REDIRECT_URI) {
      return new Response("認証に必要な情報が不足しています。", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.CLIENT_ID,
          client_secret: config.CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: config.REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json();
      const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const userData = await userRes.json();

      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const guildsData = await guildsRes.json();

      authenticatedUsers.push({
        username: userData.username,
        discriminator: userData.discriminator,
        userId: userData.id,
        avatar: userData.avatar,
        guilds: guildsData.map((g: any) => ({ name: g.name, id: g.id })),
      });

      await saveUsers();

      return new Response("", { status: 303, headers: { Location: "/kanri" } });
    } catch (error) {
      console.error("認証エラー:", error);
      return new Response(htmlTemplate(`<p>エラー: ${error.message}</p>`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else if (url.pathname === "/authenticated-users" && req.method === "GET") {
    const userListHtml = authenticatedUsers
      .map(
        (user) => `
          <li>
            <strong>${user.username}#${user.discriminator}</strong><br>
            <ul>${user.guilds
              .map((g) => `<li>${g.name} (ID: ${g.id})</li>`)
              .join("")}</ul>
          </li>`
      )
      .join("");

    return new Response(htmlTemplate(`<ul>${userListHtml}</ul>`), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else {
    return new Response("404 Not Found", { status: 404 });
  }
}

// 初期設定を読み込み
await loadConfig();
await loadUsers();

serve(handler);
