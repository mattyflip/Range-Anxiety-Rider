import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/send-email.js';

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ data: { id: 'email-123' } }),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockSend,
    };
  },
}));

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn().mockReturnValue([]),
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn().mockReturnValue({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user-123', email: 'test@example.com' }),
  }),
}));

describe('api/send-email', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    res.end = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 405 if method is not POST', async () => {
    const req: any = { method: 'GET', headers: { origin: 'http://localhost:3000' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('should return 401 if authorization header is missing', async () => {
    const req: any = { method: 'POST', headers: {} };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 400 if email is invalid', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { to: 'invalid-email', subject: 'test', text: 'hello' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  it('should return 400 if subject is missing', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { to: 'test@example.com', subject: '', text: 'hello' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  it('should return 400 if both text and html are missing', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { to: 'test@example.com', subject: 'test' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  it('should return 200 on successful email send', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { to: 'test@example.com', subject: 'test', text: 'hello' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, id: 'email-123' });
    expect(mockSend).toHaveBeenCalled();
  });
});
