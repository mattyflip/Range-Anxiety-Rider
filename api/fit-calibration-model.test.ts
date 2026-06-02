import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './fit-calibration-model.js';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-user-123' }),
  docs: [] as any[],
  update: vi.fn(),
  set: vi.fn(),
  add: vi.fn(),
  get: vi.fn().mockImplementation(() => ({
    docs: mocks.docs.map(d => ({ data: () => d })),
    exists: true,
    data: () => ({ bikes: [{ id: 'bike-123', name: 'Test Bike', specs: {} }] })
  }))
}));

// Mock dependencies
vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn().mockReturnValue([]),
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn().mockReturnValue({
    verifyIdToken: mocks.verifyIdToken,
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: mocks.get,
    update: mocks.update,
    set: mocks.set,
    add: mocks.add
  }),
}));

vi.mock('ml-regression-multivariate-linear', () => {
  return {
    default: class MockMLR {
      weights = [[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]];
      intercept = [0.05];
      predict(x: any[][]) {
        return x.map(() => [0.1]);
      }
    }
  };
});

describe('api/fit-calibration-model', () => {
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
    mocks.docs.length = 0;
  });

  it('should return 401 if authorization header is missing', async () => {
    const req: any = { method: 'POST', headers: {}, body: { bikeId: 'bike-123' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 200 with NOT_ENOUGH_DATA if logs count < 5', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bikeId: 'bike-123' }
    };
    const res = mockRes();
    
    // 3 logs
    mocks.docs.push({}, {}, {});
    
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'NOT_ENOUGH_DATA' }));
  });

  it('should calculate calibration factors when enough logs exist', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bikeId: 'bike-123' }
    };
    const res = mockRes();
    
    // 6 logs
    for (let i = 0; i < 6; i++) {
      mocks.docs.push({
        prediction_error_pct: 10,
        motor_model: 'Bosch_CX',
        assist_level: 'sport',
        elevation_gain_m: 100,
        distance_km: 10,
        temperature_c: 20,
        avg_speed_kmh: 25,
        actual_stops_per_km: 1,
        speed_variance: 5
      });
    }
    
    await handler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.trained_on_n_rides).toBe(6);
    expect(body.global_correction).toBeLessThan(1.0); 
    expect(body.multidim_model).not.toBeNull();
    expect(body.multidim_model.weights).toHaveLength(6);
    expect(body.confidence_interval_pct).toBe(15);
  });

  it('should update the bike profile in Firestore', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bikeId: 'bike-123' }
    };
    const res = mockRes();
    
    for (let i = 0; i < 5; i++) mocks.docs.push({ prediction_error_pct: 0 });
    
    await handler(req, res);
    
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      bikes: expect.arrayContaining([
        expect.objectContaining({
          id: 'bike-123',
          specs: expect.objectContaining({
            correctionFactors: expect.any(Object)
          })
        })
      ])
    }));
  });

  it('should contribute to global_models if fit quality is high', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bikeId: 'bike-123' }
    };
    const res = mockRes();
    
    // 11 logs for global aggregation threshold
    for (let i = 0; i < 11; i++) {
      mocks.docs.push({
        prediction_error_pct: 0,
        motor_model: 'Test_Motor'
      });
    }
    
    // Mock get for global_models contributions count
    mocks.get.mockReturnValueOnce({ docs: mocks.docs.map(d => ({ data: () => d })) }) // logs
           .mockReturnValueOnce({ exists: true, data: () => ({ bikes: [{ id: 'bike-123', specs: {} }] }) }) // user
           .mockReturnValueOnce({ data: () => ({ contributions: 5 }) }); // global_model fetch

    await handler(req, res);
    
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      motor_model: 'Test_Motor',
      contributions: 6
    }), expect.anything());
  });
});
