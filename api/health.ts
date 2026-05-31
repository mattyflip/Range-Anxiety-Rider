import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './_cors.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeaders(req, res)) return;
    res.status(200).json({ 
      status: 'ok', 
      time: new Date().toISOString(),
      origin: req.headers.origin || 'none'
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
}
