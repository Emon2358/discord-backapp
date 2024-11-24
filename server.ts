import { serve } from "https://deno.land/std@0.194.0/http/server.ts";

const tokens = new Map();

serve(async (req) => {
  const url = new URL(req.url);

  // /callbackパスへのGETリクエストを処理
  if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // codeパラメータがない場合、エラーを返す
    if (!code) {
      return new Response("Missing code parameter", { status: 400 });
    }

    // 環境変数のデバッグ
    console.log("CLIENT_ID:", Deno.env.get("CLIENT_ID"));
    console.log("CLIENT_SECRET:", Deno.env.get("CLIENT_SECRET"));
    console.log("REDIRECT_URI:", Deno.env.get("REDIRECT_URI"));

    // Discordトークン取得
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("CLIENT_ID")!,  // 必須環境変数
        client_secret: Deno.env.get("CLIENT_SECRET")!,  // 必須環境変数
        grant_type: "authorization_code",
        code,
        redirect_uri: Deno.env.get("REDIRECT_URI")!,  // 必須環境変数
      }),
    });

    // トークンリクエストが失敗した場合
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Error fetching token:", errorData);
      return new Response("Failed to fetch tokens", { status: 400 });
    }

    // トークンデータを取得
    const tokenData = await tokenResponse.json();

    // stateとトークンデータをMapに保存
    tokens.set(state, tokenData);

    // トークン取得成功メッセージ
    console.log("Token Data:", tokenData);

    return new Response("Authentication successful!", {
      headers: { "Access-Control-Allow-Origin": "*" },  // CORS設定
    });
  }

  // その他のリクエストには404エラーを返す
  return new Response("Not Found", { status: 404 });
});

