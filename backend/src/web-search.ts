export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'google' | 'yahoo' | 'bing' | 'duckduckgo';
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 5000;

function normalizeUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSearchUrl(url: string): string {
  const decoded = decodeHtml(url);

  if (decoded.includes('bing.com/ck/a')) {
    const match = decoded.match(/[?&]u=a1([A-Za-z0-9+/=_-]+)/);
    if (match) {
      try {
        const target = Buffer.from(match[1], 'base64').toString('utf8');
        if (target.startsWith('http')) return target;
      } catch {
        // fall through
      }
    }
  }

  return decoded;
}

function parseYahooResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.match(/class="algo[^"]*"[\s\S]*?<\/li>/gi) ?? [];

  for (const block of blocks) {
    const titleMatch = block.match(/class="[^"]*title[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class="[^"]*compText[^"]*"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!titleMatch) continue;

    const url = cleanSearchUrl(normalizeUrl(titleMatch[1], 'https://search.yahoo.com'));
    const title = decodeHtml(titleMatch[2].replace(/<[^>]+>/g, ''));
    const snippet = decodeHtml((snippetMatch?.[1] ?? '').replace(/<[^>]+>/g, ''));

    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet, source: 'yahoo' });
    }
    if (results.length >= 5) break;
  }

  return results;
}

function parseBingResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.match(/class="b_algo"[\s\S]*?(?=class="b_algo"|$)/gi) ?? [];

  for (const block of blocks) {
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!titleMatch) continue;

    const url = cleanSearchUrl(normalizeUrl(titleMatch[1], 'https://www.bing.com'));
    const title = decodeHtml(titleMatch[2].replace(/<[^>]+>/g, ''));
    const snippet = decodeHtml((snippetMatch?.[1] ?? '').replace(/<[^>]+>/g, ''));

    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet, source: 'bing' });
    }
    if (results.length >= 5) break;
  }

  return results;
}

function parseDuckDuckGoResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blocks = html.match(/class="result[^"]*"[\s\S]*?(?=class="result[^"]*"|$)/gi) ?? [];

  for (const block of blocks) {
    const titleMatch = block.match(/class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = cleanSearchUrl(normalizeUrl(titleMatch[1], 'https://duckduckgo.com'));
    const title = decodeHtml(titleMatch[2].replace(/<[^>]+>/g, ''));
    const snippet = decodeHtml((snippetMatch?.[1] ?? '').replace(/<[^>]+>/g, ''));

    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet, source: 'duckduckgo' });
    }
    if (results.length >= 5) break;
  }

  return results;
}

async function searchYahoo(query: string): Promise<WebSearchResult[]> {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  return parseYahooResults(html);
}

async function searchBing(query: string): Promise<WebSearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  return parseBingResults(html);
}

async function searchDuckDuckGo(query: string): Promise<WebSearchResult[]> {
  const html = await fetchHtml('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `q=${encodeURIComponent(query)}`,
  });
  return parseDuckDuckGoResults(html);
}

async function searchGoogleCse(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cx) return [];

  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}` +
    `&cx=${encodeURIComponent(cx)}&num=5&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (data.items ?? []).map((item) => ({
    title: item.title ?? 'Result',
    url: item.link ?? '',
    snippet: item.snippet ?? '',
    source: 'google' as const,
  }));
}

export function isExternalBusinessLookup(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (/\balmahy\s+legal\b/.test(text)) return true;
  if (/\balmahy\b/.test(text) && /\b(legal service|legal services|law firm|lawyer|attorney|notary)\b/.test(text)) {
    return true;
  }
  if (
    /\balmahy\b/.test(text) &&
    /\b(location|address|office|phone|located|where is|maps?|directions)\b/.test(text) &&
    !/\balmahy\s+ai\b/.test(text)
  ) {
    return true;
  }
  return false;
}

export function isFactualLookupQuery(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (isExternalBusinessLookup(message)) return true;
  return (
    /\b(where is|where are|location of|address of|office of|phone number|contact number|google maps|show (?:me )?(?:the )?link|official website|website link)\b/.test(
      text
    ) ||
    /\b(what is .+ (?:location|address|phone))\b/.test(text) ||
    /\b(located|headquarters|branch office|opening hours)\b/.test(text)
  );
}

export function shouldUseWebSearch(message: string, mode?: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (isImageGenerationRequest(text)) return false;

  if (mode === 'research') return true;
  if (isFactualLookupQuery(message)) return true;

  if (
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|yo|good morning|good night|good afternoon|how are you)[!.?\s]*$/i.test(
      text
    )
  ) {
    return false;
  }

  if (
    /\b(202[3-9]|today|latest|current|news|who is|what is|where is|when did|how much|price|weather|stock|score|review|compare|versus|vs\b|althakeel|al[\s-]?thakeel|almahy|store1920|nexso|velore|armed|gharaam)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (/\b(company|brand|website|official|headquarters|founder|ceo|product launch)\b/i.test(text)) {
    return true;
  }

  return text.split(/\s+/).length >= 14;
}

function isImageGenerationRequest(text: string): boolean {
  const hasAction = /\b(generate|create|draw|make|design|paint|render|produce)\b/.test(text);
  const hasSubject = /\b(image|picture|photo|illustration|logo|artwork|drawing|portrait|poster|icon|banner)\b/.test(text);
  return (hasAction && hasSubject) || /^draw\b/.test(text) || /\b(image|picture|photo) of\b/.test(text);
}

export function enhanceSearchQuery(message: string): string {
  const text = message.trim().toLowerCase();
  if (/\balmahy\s+legal\b/.test(text) || (/\balmahy\b/.test(text) && /\blegal\b/.test(text))) {
    return 'Almahy Legal Services Dubai UAE address phone site:almahy.com';
  }
  if (/^althakeel$|^al[\s-]?thakeel$/.test(text)) {
    return 'Al Thakeel UAE holding company retail ecommerce brands';
  }
  if (/\balthakeel\b/.test(text) && text.split(/\s+/).length <= 3) {
    return `${message.trim()} Al Thakeel UAE company`;
  }
  return message.trim();
}

export async function multiEngineSearch(
  query: string,
  limit = 8,
  options?: { fast?: boolean }
): Promise<WebSearchResult[]> {
  const searchQuery = enhanceSearchQuery(query);
  const engines = options?.fast
    ? await Promise.allSettled([searchDuckDuckGo(searchQuery), searchBing(searchQuery)])
    : await Promise.allSettled([
        searchGoogleCse(searchQuery),
        searchYahoo(searchQuery),
        searchBing(searchQuery),
        searchDuckDuckGo(searchQuery),
      ]);

  const merged: WebSearchResult[] = [];
  const seen = new Set<string>();

  for (const result of engines) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const key = item.url.replace(/\/$/, '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= limit) return merged;
    }
  }

  return merged;
}

export function formatSearchContext(results: WebSearchResult[]): string {
  if (results.length === 0) return '';

  const lines = results.map(
    (r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet || 'No snippet available.'}`
  );

  return (
    'Live web search results:\n\n' +
    lines.join('\n\n') +
    '\n\nUse ONLY these results for facts (address, phone, location, links). Never invent or guess addresses. ' +
    'If results mention a business, use that exact information. Format with headings, bullet lists, and markdown links [title](url). ' +
    'Cite sources in a ## Sources section at the end. Do not name search engines in your reply.'
  );
}

export function researchFormatHint(): string {
  return (
    ' Structure your answer clearly: intro paragraph, ## headings, bullet points, and markdown links [Site name](https://url). ' +
    'End with ## Sources listing the main links.'
  );
}

export function appendSourceLinks(answer: string, results: WebSearchResult[]): string {
  if (results.length === 0) return answer;

  const links = results.slice(0, 5).map((r, i) => `${i + 1}. [${r.title}](${r.url})`);
  const hasSources = /##\s*sources/i.test(answer);
  if (hasSources) return answer.trim();
  return `${answer.trim()}\n\n## Sources\n${links.join('\n')}`;
}
