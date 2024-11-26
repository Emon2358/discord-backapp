// deno-lint-ignore-file no-explicit-any
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

// メインハンドラー
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 設定情報ページ
  if (url.pathname === "/kanri") {
    // 設定フォームを表示
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
    
    // 保存された設定があればOAuth2認証URLを表示
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

      // 保存
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
    const body = `
      <h1>サーバー検索</h1>
      <form action="/search-server" method="GET">
        <label for="server_name">サーバー名で検索</label>
        <input type="text" name="server_name" required><br>
        <button type="submit">検索</button>
      </form>
    `;
    
    return new Response(body, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // サーバー検索処理
  else if (url.pathname === "/search-server" && req.method === "GET") {
    const searchParams = url.searchParams;
    const serverName = searchParams.get("server_name") || "";

    // 実際にはサーバー名を使って検索処理を行う
    // 仮に検索結果があると仮定
    const mockResults = serverName ? [`サーバー: ${serverName}（サンプル結果）`] : [];
    
    const resultHtml = mockResults.length
      ? mockResults.map(result => `<p>${result}</p>`).join("")
      : "<p>サーバーが見つかりませんでした。</p>";
    
    return new Response(`
      <h1>検索結果</h1>
      ${resultHtml}
      <p><a href='/joinserver'>検索ページに戻る</a></p>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // その他のパス
  else {
    return new Response("404 Not Found", { status: 404 });
  }
}

// 初期設定を読み込み
await loadConfig();

// サーバー起動
serve(handler);
