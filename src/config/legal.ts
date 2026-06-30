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

export const LEGAL_SECTIONS = {
  account: [
    'Sign-in is required to use Almahy AI.',
    'Your email, display name, and chat history are stored securely.',
    'Change your password, sign out, or delete your account anytime from this Profile page.',
    'Deleting your account permanently removes your chats and profile data.',
  ],
  privacy: [
    'Uploaded files (PDF, Excel, images) are processed only to complete your request.',
    'Your chats are private to your account.',
    'Do not upload passwords, payment card numbers, or highly sensitive data unless necessary.',
  ],
  terms: [
    'Almahy AI is an assistant — verify important legal, medical, or financial information independently.',
    'You are responsible for how you use generated documents and images.',
    'Abusive, illegal, or harmful use is not allowed.',
  ],
  company: [
    `${COMPANY_NAME} is a UAE holding company in retail, e-commerce, lifestyle, and technology.`,
    'Brands include Store1920, Nexso, Velore Paris, Armed, and Gharaam.',
    `Website: ${COMPANY_WEBSITE}`,
    `Internal or partnership questions: contact ${INTERNAL_CONTACT} only.`,
  ],
};
