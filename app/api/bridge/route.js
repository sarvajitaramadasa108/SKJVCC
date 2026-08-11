const APPS_SCRIPT_URL =
  process.env.GOOGLE_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbwG8SYratBMCagMfokDFOtqEawb1dTc8u61GRHjHCGErCKc6JFbPfAz-r8jypFJ45ukSg/exec";

async function forwardToAppsScript(request) {
  if (!APPS_SCRIPT_URL) {
    return Response.json(
      {
        ok: false,
        error: "GOOGLE_APPS_SCRIPT_URL is not configured"
      },
      { status: 500 }
    );
  }

  const upstreamUrl = new URL(APPS_SCRIPT_URL);
  const method = request.method.toUpperCase();

  if (method === "GET" || method === "HEAD") {
    const incoming = new URL(request.url);
    incoming.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value);
    });
  }

  const init = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  if (method !== "GET" && method !== "HEAD") {
    const text = await request.text();
    init.body = text || "{}";
  }

  const upstreamResponse = await fetch(upstreamUrl, init);
  const rawText = await upstreamResponse.text();
  let payload = null;

  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { ok: false, error: rawText || "Apps Script returned an invalid response" };
  }

  const status = payload && payload.ok === false ? 500 : upstreamResponse.ok ? 200 : upstreamResponse.status;

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request) {
  return forwardToAppsScript(request);
}

export async function POST(request) {
  return forwardToAppsScript(request);
}
