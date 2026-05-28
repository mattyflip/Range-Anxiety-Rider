import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/stripe-webhook';

// Use vi.hoisted to ensure these variables are available when vi.mock is hoisted
const { 
  mockSet, 
  mockUpdate, 
  mockDoc, 
  mockCollection, 
  mockConstructEvent, 
  mockRetrieveSubscription 
} = vi.hoisted(() => ({
  mockSet: vi.fn().mockResolvedValue(undefined),
  mockUpdate: vi.fn().mockResolvedValue(undefined),
  mockDoc: vi.fn().mockReturnThis(), // Return 'this' to allow chaining if needed, but we'll override for specific calls
  mockCollection: vi.fn().mockReturnThis(),
  mockConstructEvent: vi.fn(),
  mockRetrieveSubscription: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn().mockReturnValue([]),
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: mockCollection,
  }),
  FieldValue: {
    serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  },
  Timestamp: {
    fromDate: vi.fn((date) => `timestamp-${date.getTime()}`),
  },
}));

vi.mock('stripe', () => {
  class MockStripe {
    webhooks = {
      constructEvent: mockConstructEvent,
    };
    subscriptions = {
      retrieve: mockRetrieveSubscription,
    };
  }
  return {
    default: MockStripe,
  };
});

describe('api/stripe-webhook', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockReq = (headers = {}, body = Buffer.from('')) => {
    const req: any = {
      method: 'POST',
      headers: {
        'stripe-signature': 'test-sig',
        ...headers,
      },
      on: vi.fn((event, cb) => {
        if (event === 'data') cb(body);
        if (event === 'end') cb();
      }),
    };
    return req;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'test-secret';
    
    // Setup chaining for Firestore mocks
    mockCollection.mockReturnValue({ doc: mockDoc });
    mockDoc.mockReturnValue({ set: mockSet, update: mockUpdate });
  });

  it('should return 405 if method is not POST', async () => {
    const req = mockReq();
    req.method = 'GET';
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('should return 400 if signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Webhook Error'));
  });

  it('should upgrade user on checkout.session.completed', async () => {
    const userId = 'user-123';
    const tier = 'shop';
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId, tier },
        },
      },
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockDoc).toHaveBeenCalledWith(userId);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        isShopTier: true,
        updatedAt: 'server-timestamp',
      }),
      { merge: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should update user on invoice.payment_succeeded', async () => {
    const userId = 'user-123';
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub-456',
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue({
      metadata: { userId },
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockRetrieveSubscription).toHaveBeenCalledWith('sub-456');
    expect(mockDoc).toHaveBeenCalledWith(userId);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        isShopTier: true,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should deactivate user on customer.subscription.deleted', async () => {
    const userId = 'user-123';
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub-456',
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue({
      metadata: { userId },
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith({
      isShopTier: false,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
