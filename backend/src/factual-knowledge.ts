import { isExternalBusinessLookup } from './web-search';

export interface VerifiedProfile {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  website: string;
  mapsUrl: string;
  services: string[];
  match: RegExp;
  notToConfuseWith: string;
}

/** Verified public facts — used to ground answers and block hallucinations. */
export const VERIFIED_PROFILES: VerifiedProfile[] = [
  {
    id: 'almahy-legal-services',
    name: 'Almahy Legal Services',
    type: 'UAE law firm',
    address:
      'Al Saqr Business Tower, 2nd Floor, Sheikh Zayed Road, Trade Center Second, DIFC, Dubai, United Arab Emirates',
    city: 'Dubai',
    country: 'United Arab Emirates',
    phone: '+971 50 409 6028',
    website: 'https://almahy.com',
    mapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Almahy+Legal+Services+Al+Saqr+Business+Tower+DIFC+Dubai',
    services: [
      'Corporate & Commercial Law',
      'Business Setup',
      'Notary Services',
      'Debt Collection',
      'Employment & Labour Law',
      'Real Estate',
      'Litigation & Dispute Resolution',
      'Intellectual Property',
      'Banking & Finance',
      'Tax & Regulatory Compliance',
    ],
    match: /\balmahy\b.*\b(legal|law firm|lawyer|attorney|notary)\b|\b(legal service|legal services)\b.*\balmahy\b/i,
    notToConfuseWith: 'Almahy AI (the chat assistant app by Al Thakeel) — a different product',
  },
];

export function findVerifiedProfile(message: string): VerifiedProfile | undefined {
  const text = message.trim();
  return VERIFIED_PROFILES.find((p) => p.match.test(text));
}

export function isLinkFollowUp(message: string, recentText: string): boolean {
  const text = message.trim().toLowerCase();
  if (!/\b(show|give|send|share|provide|open)\b/.test(text)) return false;
  if (!/\b(link|url|map|maps|website|directions)\b/.test(text)) return false;
  const combined = `${text} ${recentText.toLowerCase()}`;
  return isExternalBusinessLookup(combined) || !!findVerifiedProfile(combined);
}

export function formatVerifiedProfileContext(profile: VerifiedProfile): string {
  return (
    `VERIFIED PUBLIC FACTS (authoritative — use these exactly; do not contradict):\n` +
    `Entity: ${profile.name} (${profile.type})\n` +
    `NOT the same as: ${profile.notToConfuseWith}\n` +
    `Address: ${profile.address}\n` +
    `City: ${profile.city}, ${profile.country}\n` +
    `Phone: ${profile.phone}\n` +
    `Website: ${profile.website}\n` +
    `Google Maps: ${profile.mapsUrl}\n` +
    `Services: ${profile.services.join(', ')}\n` +
    `Use the full Google Maps URL above for map links — never invent goo.gl or maps.app.goo.gl short links.`
  );
}

export function getVerifiedKnowledgeContext(message: string, recentHistory = ''): string {
  const combined = `${message}\n${recentHistory}`;
  const profile = findVerifiedProfile(combined);
  if (!profile) return '';
  return formatVerifiedProfileContext(profile);
}

function buildCanonicalAnswer(profile: VerifiedProfile, wantsLinkOnly: boolean): string {
  if (wantsLinkOnly) {
    return (
      `Here are the official links for **${profile.name}**:\n\n` +
      `- **Website:** [${profile.website.replace(/^https?:\/\//, '')}](${profile.website})\n` +
      `- **Google Maps:** [View on Google Maps](${profile.mapsUrl})\n\n` +
      `## Sources\n` +
      `1. [${profile.name}](${profile.website})`
    );
  }

  return (
    `The main office of **${profile.name}** is:\n\n` +
    `### Address\n` +
    `${profile.name}\n` +
    `${profile.address}\n\n` +
    `### Phone\n` +
    `${profile.phone}\n\n` +
    `The firm provides legal services across the UAE, including:\n` +
    profile.services.map((s) => `- ${s}`).join('\n') +
    `\n\n` +
    `**Website:** [${profile.website.replace(/^https?:\/\//, '')}](${profile.website})\n` +
    `**Google Maps:** [View on Google Maps](${profile.mapsUrl})\n\n` +
    `## Sources\n` +
    `1. [${profile.name}](${profile.website})`
  );
}

function responseLooksWrongForProfile(response: string, profile: VerifiedProfile): boolean {
  const lower = response.toLowerCase();
  const hasCorrect =
    lower.includes('dubai') ||
    lower.includes('difc') ||
    lower.includes('sheikh zayed') ||
    lower.includes('almahy.com') ||
    lower.includes('+971');
  const hasWrong =
    /\briyadh\b/.test(lower) ||
    /\bsaudi\b/.test(lower) ||
    /\bking fahad\b/.test(lower) ||
    /\bking fahd\b/.test(lower) ||
    /\bolaya\b/.test(lower) ||
    /maps\.app\.goo\.gl/i.test(response) ||
    /goo\.gl\//i.test(response);

  if (hasWrong) return true;
  if (isExternalBusinessLookup(response) && !hasCorrect) return true;
  return false;
}

export function enforceVerifiedFacts(
  message: string,
  response: string,
  recentHistory = ''
): string {
  const combined = `${message}\n${recentHistory}`;
  const profile = findVerifiedProfile(combined);
  if (!profile) return sanitizeBadMapLinks(response, profile);

  const wantsLinkOnly = isLinkFollowUp(message, recentHistory);
  if (responseLooksWrongForProfile(response, profile) || (wantsLinkOnly && /maps\.app\.goo\.gl|goo\.gl\//i.test(response))) {
    return buildCanonicalAnswer(profile, wantsLinkOnly);
  }

  return sanitizeBadMapLinks(response, profile);
}

function sanitizeBadMapLinks(response: string, profile?: VerifiedProfile): string {
  if (!profile) {
    return response.replace(
      /\[([^\]]+)\]\((https?:\/\/(?:maps\.app\.)?goo\.gl\/[^)]+)\)/gi,
      '[$1](https://www.google.com/maps)'
    );
  }

  let out = response;
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:maps\.app\.)?goo\.gl\/[^)]+)\)/gi,
    `[$1](${profile.mapsUrl})`
  );
  out = out.replace(/https?:\/\/(?:maps\.app\.)?goo\.gl\/\S+/gi, profile.mapsUrl);
  return out;
}
