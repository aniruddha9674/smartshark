const UA = "SmartShark/1.0 (educational; contact@example.com)";
const TIMEOUT_MS = 8000;

/**
 * Fetch the best logo URL for a domain.
 * Extraction order (highest quality first):
 *   1. JSON-LD Organization.logo
 *   2. <link rel="apple-touch-icon">
 *   3. Largest <link rel="icon"> by sizes attr
 *   4. og:image
 *   5. Google favicon (128px) as last resort
 * Returns { url, source } or null.
 */
export async function extractLogoFromDomain(domain) {
  const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  const baseUrl = `https://${cleanDomain}`;

  let html = null;
  try {
    const res = await fetch(baseUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    if (res.ok) html = await res.text();
  } catch {
    // site may be down — fall through to favicon fallback
  }

  if (html) {
    // 1. JSON-LD Organization.logo
    const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          const t = item["@type"];
          const isOrg = t === "Organization" || t === "Corporation" || t === "LocalBusiness"
            || (Array.isArray(t) && (t.includes("Organization") || t.includes("Corporation")));
          if (isOrg && item.logo) {
            const logoUrl = typeof item.logo === "string" ? item.logo : item.logo.url;
            if (logoUrl) {
              const resolved = new URL(logoUrl, baseUrl).href;
              return { url: resolved, source: "json-ld" };
            }
          }
        }
      } catch {}
    }

    // 2. apple-touch-icon
    const apple = html.match(/<link[^>]*rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon[^"']*["']/i);
    if (apple) {
      return { url: new URL(apple[1], baseUrl).href, source: "apple-touch-icon" };
    }

    // 3. Largest favicon by sizes
    const iconLinks = [...html.matchAll(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/gi)];
    let bestIcon = null;
    let bestSize = 0;
    for (const linkTag of iconLinks) {
      const tag = linkTag[0];
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      const sizeMatch = tag.match(/sizes=["'](\d+)x\d+["']/i);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      if (hrefMatch && size > bestSize) {
        bestSize = size;
        bestIcon = hrefMatch[1];
      }
    }
    if (bestIcon) {
      return { url: new URL(bestIcon, baseUrl).href, source: `favicon-${bestSize}px` };
    }

    // 4. og:image
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImage) {
      return { url: new URL(ogImage[1], baseUrl).href, source: "og:image" };
    }
  }

  // 5. Favicon service fallback — always returns something
  return {
    url: `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`,
    source: "google-favicon",
  };
}