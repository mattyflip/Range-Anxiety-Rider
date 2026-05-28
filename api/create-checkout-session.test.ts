import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/create-checkout-session';

// Mock dependencies
vi.mock('stripe', () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
      },
    };
  }
  return {
    default: MockStripe,
  };
});

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

describe('api/create-checkout-session', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('should return 405 if method is not POST', async () => {
    const req: any = { method: 'GET' };
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

  it('should return 400 if userId is missing or invalid', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { tier: 'shop' } // Missing userId
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid User ID' }));
  });

  it('should return 403 if token UID does not match body userId', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { userId: 'different-user', tier: 'shop' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 400 if invalid tier is provided', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { userId: 'test-user-123', tier: 'hacker-tier' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid tier selected' }));
  });

  it('should return 200 and a URL on successful validation', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { userId: 'test-user-123', tier: 'shop' }
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/test' });
  });
});
