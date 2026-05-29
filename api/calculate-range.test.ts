import { describe, it, expect } from 'vitest';
// @ts-ignore
import handler from './calculate-range';

const mockRes = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = () => res;
  return res;
};

const baseSpecs = {
  voltage: 48,
  capacityAh: 15,
  motorWatts: 750,
  bikeWeightLbs: 65,
  tirePSI: 40,
  tireType: 'all-terrain'
};

describe('Range Calculation Physics Engine', () => {
  it('should calculate telemetry-based range correctly', async () => {
    const req: any = {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: {
        type: 'telemetry',
        specs: baseSpecs,
        batteryPercent: 100,
        speedMph: 20,
        riderWeightLbs: 180,
        driveMode: 'throttle',
        throttleMode: 'normal'
      }
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.remainingMiles).toBeGreaterThan(0);
    expect(res.body.burnRate).toBeGreaterThan(50); // Minimum idle/base draw
  });

  it('should reduce range as rider weight increases', async () => {
    const getRange = async (weight: number) => {
      const res = mockRes();
      await handler({
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: { type: 'telemetry', specs: baseSpecs, batteryPercent: 100, speedMph: 20, riderWeightLbs: weight }
      } as any, res);
      return res.body.remainingMiles;
    };

    const lightRange = await getRange(150);
    const heavyRange = await getRange(250);

    expect(heavyRange).toBeLessThan(lightRange);
  });

  it('should increase range in Eco mode vs Sport mode', async () => {
    const getStats = async (mode: string) => {
      const res = mockRes();
      await handler({
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: { type: 'telemetry', specs: baseSpecs, batteryPercent: 100, speedMph: 20, driveMode: 'throttle', throttleMode: mode }
      } as any, res);
      return res.body;
    };

    const eco = await getStats('eco');
    const sport = await getStats('sport');

    expect(eco.remainingMiles).toBeGreaterThan(sport.remainingMiles);
    expect(eco.burnRate).toBeLessThan(sport.burnRate);
  });

  it('should penalize range for low tire PSI', async () => {
    const getRange = async (psi: number) => {
      const res = mockRes();
      await handler({
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: { type: 'telemetry', specs: { ...baseSpecs, tirePSI: psi }, batteryPercent: 100, speedMph: 20 }
      } as any, res);
      return res.body.remainingMiles;
    };

    const highPSI = await getRange(45);
    const lowPSI = await getRange(15);

    expect(lowPSI).toBeLessThan(highPSI);
  });

  it('should calculate route-based battery consumption', async () => {
    const req: any = {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: {
        type: 'route',
        specs: baseSpecs,
        batteryPercent: 100,
        speedMph: 15,
        durationSeconds: 3600, // 1 hour ride
        elevationChangeFt: 500, // Climbing
        riderWeightLbs: 180
      }
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.batteryPercentRemaining).toBeLessThan(100);
    expect(res.body.energyWh).toBeGreaterThan(0);
  });
});
