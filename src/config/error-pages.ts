export const errorPages = {
  400: ['Invalid request', 'Check the address for missing or unexpected characters, then open the page again.'],
  403: ['Access denied', 'This address is restricted. You can browse the public tools from the homepage.'],
  404: ['Page not found', 'The link may be outdated or the address may be misspelled. Browse the tool directory to find the page you need.'],
  429: ['Too many requests', 'Please wait a little before trying this page again.'],
  500: ['Internal server error', 'The server encountered a problem while opening this page. Try again in a few minutes.'],
  502: ['Bad gateway', 'The gateway received an invalid response from another server. Please try again shortly.'],
  503: ['Service unavailable', 'ApplyKit is temporarily unavailable. Please try again in a few minutes.'],
  504: ['Gateway timeout', 'The gateway waited too long for a response. Please try again shortly.'],
} as const;
export type ErrorCode = keyof typeof errorPages;

export function renderErrorDocument(template: string, code: ErrorCode) {
  const [title, message] = errorPages[code];
  return template.replaceAll('{{code}}', String(code))
    .replaceAll('{{title}}', title).replaceAll('{{message}}', message);
}
