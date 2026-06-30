export const COMPANY_NAME = 'Al Thakeel';
export const PRODUCT_NAME = 'Almahy AI';
export const COMPANY_COUNTRY = 'United Arab Emirates';
export const COMPANY_WEBSITE = 'https://althakeel.com';
export const INTERNAL_CONTACT = 'Rohith';

export const SUPPORTED_FILE_CONVERSIONS = [
  'Excel (.xlsx, .xls) → PDF',
  'CSV → PDF',
  'PDF → Excel (.xlsx)',
  'PDF → CSV',
  'Excel → CSV',
  'Text (.txt) → PDF',
] as const;

export function getPublicLegalSummary(): string {
  return (
    `${PRODUCT_NAME} is provided by ${COMPANY_NAME} (${COMPANY_COUNTRY}).\n\n` +
    'ACCOUNT & DATA\n' +
    '- Sign-in is required. Your email, display name, and chat history are stored securely.\n' +
    '- You can change your password, sign out, or delete your account anytime from Profile.\n' +
    '- Deleting your account permanently removes your chats and profile data.\n\n' +
    'PRIVACY\n' +
    '- Uploaded files (PDF, Excel, images) are processed to answer your request and are not shared publicly.\n' +
    '- Do not upload passwords, bank cards, or highly sensitive personal data unless necessary.\n\n' +
    'TERMS OF USE\n' +
    '- Almahy AI is an assistant tool — verify important legal, medical, or financial information independently.\n' +
    '- Generated images and documents are for your use; you are responsible for how you use them.\n' +
    '- Abusive, illegal, or harmful use is not allowed.\n\n' +
    'COMPANY\n' +
    `${COMPANY_NAME} is a UAE holding company in retail, e-commerce, lifestyle, and technology. ` +
    'Brands include Store1920, Nexso, Velore Paris, Armed, and Gharaam. ' +
    `Website: ${COMPANY_WEBSITE}\n\n` +
    `For internal or partnership questions, contact ${INTERNAL_CONTACT} only.`
  );
}

export function getSupportedConversionsText(): string {
  return (
    'Almahy AI can convert files directly in chat — attach a file and ask to convert:\n\n' +
    SUPPORTED_FILE_CONVERSIONS.map((c) => `• ${c}`).join('\n') +
    '\n\nExample: attach an Excel file and say "convert this to PDF". A download button will appear on the reply.'
  );
}
