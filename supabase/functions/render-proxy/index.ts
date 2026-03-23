/**
 * render-proxy — Edge function that proxies calls to the OVH RenderJobsAPI.
 * Keeps the API key server-side.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const baseUrl = Deno.env.get("VIDEO_PIPELINE_BASE_URL");
    const apiKey = Deno.env.get("VIDEO_PIPELINE_API_KEY");

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "VIDEO_PIPELINE_BASE_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    let url: string;
    let method: string;
    let fetchBody: string | undefined;

    switch (action) {
      case "create": {
        url = `${baseUrl}/render-jobs`;
        method = "POST";
        fetchBody = JSON.stringify({
          projectId: params.projectId,
          videoPromptIds: params.videoPromptIds,
          payload: params.payload,
        });
        break;
      }
      case "status": {
        url = `${baseUrl}/render-jobs/${params.jobId}`;
        method = "GET";
        break;
      }
      case "list": {
        const qs = params.projectId ? `?projectId=${encodeURIComponent(params.projectId)}` : "";
        url = `${baseUrl}/render-jobs${qs}`;
        method = "GET";
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? fetchBody : undefined,
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
