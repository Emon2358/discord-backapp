// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// HTMLコンテンツを直接埋め込む
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

// トークン保存用データ構造
const tokens: Record<string, any> = {};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

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

      console.log(`Saved token for user ${user.id}`);
      return new Response("Token saved");
    } catch (err) {
      console.error(err);
      return new Response("Failed to save token", { status: 500 });
    }
  }

  // 認証後ページの表示
  if (url.pathname === "/authenticated") {
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // その他のリクエストに対応
  return new Response("404 Not Found", { status: 404 });
};

// サーバー起動
console.log("Server is running!");
serve(handler);
