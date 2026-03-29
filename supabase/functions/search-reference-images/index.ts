import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 3 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search Wikimedia Commons for images
    const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("generator", "search");
    searchUrl.searchParams.set("gsrnamespace", "6"); // File namespace
    searchUrl.searchParams.set("gsrsearch", query);
    searchUrl.searchParams.set("gsrlimit", String(Math.min(limit * 2, 20))); // fetch extra to filter
    searchUrl.searchParams.set("prop", "imageinfo");
    searchUrl.searchParams.set("iiprop", "url|size|mime");
    searchUrl.searchParams.set("iiurlwidth", "400");

    console.log("Searching Wikimedia Commons for:", query);

    const res = await fetch(searchUrl.toString(), {
      headers: { "User-Agent": "LovableDocTool/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Wikimedia API error: ${res.status}`);
    }

    const data = await res.json();
    const pages = data?.query?.pages;

    if (!pages) {
      return new Response(
        JSON.stringify({ images: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const images: { url: string; thumb: string; title: string; width: number; height: number }[] = [];

    for (const page of Object.values(pages) as any[]) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      // Only keep actual images
      if (!info.mime?.startsWith("image/")) continue;
      // Skip SVG, icons, logos that are too small
      if (info.width < 200 || info.height < 150) continue;

      images.push({
        url: info.url,
        thumb: info.thumburl || info.url,
        title: page.title?.replace("File:", "") || "",
        width: info.width,
        height: info.height,
      });

      if (images.length >= limit) break;
    }

    // If Wikimedia didn't return enough, also try Wikipedia
    if (images.length < limit) {
      const wikiUrl = new URL("https://en.wikipedia.org/w/api.php");
      wikiUrl.searchParams.set("action", "query");
      wikiUrl.searchParams.set("format", "json");
      wikiUrl.searchParams.set("titles", query);
      wikiUrl.searchParams.set("prop", "images|pageimages");
      wikiUrl.searchParams.set("piprop", "thumbnail");
      wikiUrl.searchParams.set("pithumbsize", "400");
      wikiUrl.searchParams.set("imlimit", "10");

      const wikiRes = await fetch(wikiUrl.toString(), {
        headers: { "User-Agent": "LovableDocTool/1.0" },
      });

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const wikiPages = wikiData?.query?.pages;
        if (wikiPages) {
          for (const page of Object.values(wikiPages) as any[]) {
            if (page.thumbnail?.source && images.length < limit) {
              images.push({
                url: page.thumbnail.source,
                thumb: page.thumbnail.source,
                title: page.title || "",
                width: page.thumbnail.width || 400,
                height: page.thumbnail.height || 300,
              });
            }
          }
        }
      }
    }

    console.log(`Found ${images.length} images for "${query}"`);

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error searching images:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to search images" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
