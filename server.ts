import { serve } from "https://deno.land/std@0.194.0/http/server.ts";

const tokens = new Map();

serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code) {
      return new Response("Missing code parameter", { status: 400 });
    }

    // Discordトークン取得
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("CLIENT_ID")!,
        client_secret: Deno.env.get("CLIENT_SECRET")!,
        grant_type: "authorization_code",
        code,
        redirect_uri: Deno.env.get("REDIRECT_URI")!,
      }),
    });

    if (!tokenResponse.ok) {
      return new Response("Failed to fetch tokens", { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    tokens.set(state, tokenData);

    return new Response("Authentication successful!");
  }

  return new Response("Not Found", { status: 404 });
});
