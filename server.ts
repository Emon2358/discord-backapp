// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// トークン保存用データ構造
const tokens: Record<string, any> = {};

// CORS ヘッダー
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// トークン保存用ファイルパス
const tokenFilePath = "./tokens.json";

// トークン保存用ファイルをロード
const loadTokensFromFile = async () => {
  try {
    const data = await Deno.readTextFile(tokenFilePath);
    Object.assign(tokens, JSON.parse(data));
  } catch (err) {
    console.error("Failed to load tokens:", err);
  }
};

// トークン保存用ファイルに保存
const saveTokensToFile = async () => {
  try {
    await Deno.writeTextFile(tokenFilePath, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error("Failed to save tokens:", err);
  }
};

// 初期ロード
await loadTokensFromFile();

// HTMLコンテンツを直接埋め込む
// deno-lint-ignore no-unused-vars
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authenticated</title>
</head>
<body>
  <h1>認証が成功しました！</h1>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // CORS対応
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // トークン保存のエンドポイント
  if (url.pathname === "/save-token" && req.method === "POST") {
    try {
      const body = await req.json();
      const { access_token, refresh_token, expires_in, user } = body;

      if (!user?.id || !access_token) {
        return new Response("Invalid data", { status: 400 });
      }

      tokens[user.id] = {
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in * 1000,
      };

      // トークンをファイルに保存
      await saveTokensToFile();

      console.log(`Saved token for user ${user.id}`);
      return new Response("Token saved");
    } catch (err) {
      console.error("Error saving token:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  // 認証後ページの表示（動的にユーザー情報を表示）
  if (url.pathname === "/authenticated") {
    const userId = url.searchParams.get("user_id");
    if (!userId || !tokens[userId]) {
      return new Response("User not found or not authenticated", {
        status: 400,
      });
    }

    // deno-lint-ignore no-unused-vars
    const userToken = tokens[userId];
    const htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authenticated</title>
      </head>
      <body>
        <h1>${userId}さん、認証が成功しました！</h1>
      </body>
      </html>
    `;
    return new Response(htmlResponse, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // その他のリクエストに対応
  return new Response("404 Not Found", { status: 404 });
};

// サーバー起動
console.log("Server is running on http://localhost:8080");
serve(handler, { port: 8080 });
