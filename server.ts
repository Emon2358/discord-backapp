import { serve } from "https://deno.land/std@0.197.0/http/server.ts";
import { readJson, writeJson } from "https://deno.land/std/fs/mod.ts";

const config = {
  CLIENT_ID: "",
  CLIENT_SECRET: "",
  REDIRECT_URI: "",
};

// 認証済みユーザーを保存するリスト（永続化用）
let authenticatedUsers: {
  username: string;
  discriminator: string;
  userId: string;
  avatar: string;
  guilds: { name: string; id: string }[];
}[] = [];

// データ保存/読み込みファイル名
const DATA_FILE = "./authenticated_users.json";

// データを保存する関数
async function saveAuthenticatedUsers() {
  await writeJson(DATA_FILE, authenticatedUsers, { spaces: 2 });
}

// データを読み込む関数
async function loadAuthenticatedUsers() {
  try {
    authenticatedUsers = await readJson(DATA_FILE) as typeof authenticatedUsers;
  } catch {
    authenticatedUsers = [];
  }
}

// サーバー起動時にデータを読み込む
await loadAuthenticatedUsers();

// HTMLテンプレート生成関数 (開発者ツール検知スクリプトを追加)
function htmlTemplate(body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>管理ページ</title>
      <script>
        // 開発者ツール検知スクリプト
        const devToolsChecker = () => {
          const element = new Image();
          let isOpen = false;
          element.__defineGetter__("id", function() {
            isOpen = true; // 開発者ツールが開いている場合
          });
          console.log(element);
          if (isOpen) {
            document.body.innerHTML = "<h1>このページは表示できません</h1>";
          }
        };

        // ページロード時にチェック
        window.onload = devToolsChecker;
        // 定期的にチェック
        setInterval(devToolsChecker, 1000);
      </script>
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

  if (url.pathname === "/joinserver" && req.method === "GET") {
    const selectedGuildId = url.searchParams.get("guildId");

    // サーバー選択前のページ
    if (!selectedGuildId) {
      const guildListHtml = authenticatedUsers
        .flatMap((user) => user.guilds)
        .map(
          (guild) => `
            <li>
              ${guild.name} (ID: ${guild.id})
              <a href="/joinserver?guildId=${guild.id}">このサーバーを見る</a>
            </li>
          `
        )
        .join("");

      const body = `
        <h1>認証済みユーザー一覧</h1>
        <ul>
          ${guildListHtml || "<p>まだ認証されたユーザーはいません。</p>"}
        </ul>
      `;
      return new Response(htmlTemplate(body), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } else {
      // 特定のサーバーのメンバーリストを表示
      const selectedGuildMembers = authenticatedUsers
        .filter((user) => user.guilds.some((guild) => guild.id === selectedGuildId))
        .map((user) => {
          return `
            <li>
              <strong>${user.username}#${user.discriminator}</strong><br>
              <img src="https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png" alt="Avatar" width="50">
            </li>
          `;
        })
        .join("");

      const body = `
        <h1>サーバーのメンバー一覧</h1>
        <ul>
          ${selectedGuildMembers || "<p>メンバー情報がありません。</p>"}
        </ul>
        <p><a href="/joinserver">サーバー一覧に戻る</a></p>
      `;
      return new Response(htmlTemplate(body), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else if (url.pathname === "/kanri" && req.method === "GET") {
    // 設定ページ
    const authUrl =
      config.CLIENT_ID && config.REDIRECT_URI
        ? `https://discord.com/oauth2/authorize?client_id=${config.CLIENT_ID}&redirect_uri=${encodeURIComponent(
            config.REDIRECT_URI
          )}&response_type=code&scope=identify%20guilds`
        : null;

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
  } else {
    return new Response("Not Found", { status: 404 });
  }
}

// サーバー起動
console.log("サーバーがポート8000で起動しました");
await serve(handler, { port: 8000 });
