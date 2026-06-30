import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_CHAT_MODEL } from './config';

type EngineKeys = { openaiKey: string | null; geminiKey: string | null };

export const PHONE_SELFIE_RULES = `
CRITICAL — phones & selfies:
- Smartphone screen shows the camera app viewfinder, dark glass, or a mirror reflection of the SAME person — never an unrelated photo or group of people on the screen.
- Hands hold the phone naturally: exactly five fingers on each hand, correct thumb placement, no melted, fused, or extra fingers.
- One person only unless the user asked for multiple people.`;

export const ORGANIC_IMAGE_STYLE = `
Ultra-photorealistic photograph shot on iPhone or DSLR — not CGI, not stock-photo cliché.
Natural ambient light, real skin texture, believable hair and clothing, shallow depth of field.
No watermark, no text overlay, no distorted anatomy.`;

const REFINER_SYSTEM = `You are an expert DALL-E 3 prompt engineer for photorealistic images.
Rewrite the user's request into ONE detailed image prompt (max 700 characters).
Output ONLY the prompt text — no quotes, no explanation.

Must include:
- Exact subject, pose, clothing, setting, lighting
- "photorealistic" or "shot on iPhone" when the user wants realism
- For phones/selfies: screen shows camera UI or same-person mirror reflection — NOT a random photo on the screen
- Anatomically correct hands with five fingers each
- Single coherent scene matching the user's intent`;

export function wantsPhotorealisticImage(prompt: string): boolean {
  return /\b(realistic|photo|photograph|photorealistic|lifelike|real life|camera|iphone|selfie|portrait|natural|dslr|mirror)\b/i.test(
    prompt
  );
}

export function mentionsPhoneOrSelfie(prompt: string): boolean {
  return /\b(phone|selfie|iphone|smartphone|mobile|mirror|holding)\b/i.test(prompt);
}

export function pickDalleImageSize(prompt: string): '1024x1024' | '1792x1024' | '1024x1792' {
  if (/\b(portrait|selfie|standing|full body|person|girl|woman|man|boy|holding phone|mirror)\b/i.test(prompt)) {
    return '1024x1792';
  }
  if (/\b(landscape|panorama|wide|sunset|mountains|cityscape|beach horizon)\b/i.test(prompt)) {
    return '1792x1024';
  }
  return '1024x1024';
}

export function enhanceImagePrompt(userPrompt: string): string {
  const text = userPrompt.trim();
  const wantsStylized =
    /\b(cartoon|anime|illustration|drawing|painting|logo|icon|pixel|3d render|fantasy|sci-?fi|futuristic|neon|abstract|artistic)\b/i.test(
      text
    );

  if (wantsStylized) {
    return `${text}\n\nHigh quality polished artwork. Clear composition.`;
  }

  let out = `${text}\n\n${ORGANIC_IMAGE_STYLE}`;
  if (mentionsPhoneOrSelfie(text)) {
    out += PHONE_SELFIE_RULES;
  }
  return out;
}

export async function refineImagePromptWithLLM(keys: EngineKeys, userPrompt: string): Promise<string> {
  if (keys.openaiKey) {
    try {
      const client = new OpenAI({ apiKey: keys.openaiKey });
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 350,
        messages: [
          { role: 'system', content: REFINER_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
      });
      const refined = response.choices[0]?.message?.content?.trim();
      if (refined && refined.length >= 24) return refined.slice(0, 900);
    } catch {
      // fall through
    }
  }

  if (keys.geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: keys.geminiKey });
      const response = await ai.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: `${REFINER_SYSTEM}\n\nUser request: ${userPrompt}`,
      });
      const refined = response.text?.trim();
      if (refined && refined.length >= 24) return refined.slice(0, 900);
    } catch {
      // fall through
    }
  }

  return userPrompt;
}

export function naturalImageCaption(userPrompt: string): string {
  const topic = userPrompt
    .replace(/\b(generate|create|draw|make|design|render|produce|an?)\b/gi, ' ')
    .replace(/\b(image|picture|photo|illustration|of)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (topic.length > 3 && topic.length < 100) {
    return `Here is your image — ${topic}.`;
  }
  return 'Here is your generated image.';
}
