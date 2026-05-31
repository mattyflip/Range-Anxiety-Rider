import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

const LOCALHOST_REGEX = /^http:\/\/localhost(:\d+)?$/;
const IP_REGEX = /^http:\/\/127\.0\.0\.1(:\d+)?$/;

/**
 * Validates the request origin and sets appropriate CORS headers.
 * 
 * @param req The Vercel request object
 * @param res The Vercel response object
 * @returns true if the request was an OPTIONS preflight that was handled, false otherwise.
 */
export function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;

  if (origin && typeof origin === 'string') {
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || 
                      LOCALHOST_REGEX.test(origin) || 
                      IP_REGEX.test(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      console.warn(`[CORS] Origin blocked: ${origin}`);
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
