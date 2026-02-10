const cache = require('./cache');

// Extract metadata from URL for rich embeds
async function fetchUrlMeta(url) {
  // Check cache first (1 hour TTL)
  const cacheKey = `embed:${url}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Discord2Bot/1.0 (compatible; embed preview)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';

    // Handle direct images
    if (contentType.startsWith('image/')) {
      const meta = { type: 'image', url, image: url };
      await cache.set(cacheKey, meta, 3600);
      return meta;
    }

    // Handle direct video
    if (contentType.startsWith('video/')) {
      const meta = { type: 'video', url, video: url };
      await cache.set(cacheKey, meta, 3600);
      return meta;
    }

    // Only parse HTML
    if (!contentType.includes('text/html')) return null;

    const html = await res.text();
    const meta = parseHtmlMeta(html, url);

    if (meta && (meta.title || meta.description || meta.image)) {
      await cache.set(cacheKey, meta, 3600);
      return meta;
    }
    return null;
  } catch {
    return null;
  }
}

function parseHtmlMeta(html, sourceUrl) {
  const meta = { type: 'link', url: sourceUrl };

  // Helper to extract content from meta tags
  const getMetaContent = (nameOrProp) => {
    // Try property attribute
    const propRegex = new RegExp(`<meta[^>]*property=["']${nameOrProp}["'][^>]*content=["']([^"']*?)["']`, 'i');
    let match = html.match(propRegex);
    if (match) return match[1];
    // Try name attribute
    const nameRegex = new RegExp(`<meta[^>]*name=["']${nameOrProp}["'][^>]*content=["']([^"']*?)["']`, 'i');
    match = html.match(nameRegex);
    if (match) return match[1];
    // Try reversed order (content before property)
    const revRegex = new RegExp(`<meta[^>]*content=["']([^"']*?)["'][^>]*(?:property|name)=["']${nameOrProp}["']`, 'i');
    match = html.match(revRegex);
    if (match) return match[1];
    return null;
  };

  // Open Graph
  meta.title = getMetaContent('og:title');
  meta.description = getMetaContent('og:description');
  meta.image = getMetaContent('og:image');
  meta.siteName = getMetaContent('og:site_name');
  meta.color = getMetaContent('theme-color');

  // Twitter card fallbacks
  if (!meta.title) meta.title = getMetaContent('twitter:title');
  if (!meta.description) meta.description = getMetaContent('twitter:description');
  if (!meta.image) meta.image = getMetaContent('twitter:image');

  // Standard HTML fallbacks
  if (!meta.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) meta.title = titleMatch[1].trim();
  }
  if (!meta.description) {
    meta.description = getMetaContent('description');
  }

  // Resolve relative image URLs
  if (meta.image && !meta.image.startsWith('http')) {
    try {
      meta.image = new URL(meta.image, sourceUrl).href;
    } catch {
      meta.image = null;
    }
  }

  // Get favicon
  const iconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i);
  if (iconMatch) {
    try {
      meta.favicon = new URL(iconMatch[1], sourceUrl).href;
    } catch {
      meta.favicon = null;
    }
  }
  if (!meta.favicon) {
    try {
      meta.favicon = new URL('/favicon.ico', sourceUrl).href;
    } catch {}
  }

  // Truncate long descriptions
  if (meta.description && meta.description.length > 300) {
    meta.description = meta.description.slice(0, 297) + '...';
  }

  // Get domain
  try {
    meta.domain = new URL(sourceUrl).hostname;
  } catch {}

  return meta;
}

// Extract URLs from message content
function extractUrls(content) {
  if (!content) return [];
  const urlRegex = /https?:\/\/[^\s<>]+/g;
  const matches = content.match(urlRegex);
  return matches ? [...new Set(matches)].slice(0, 5) : []; // Max 5 embeds per message
}

module.exports = { fetchUrlMeta, extractUrls };
