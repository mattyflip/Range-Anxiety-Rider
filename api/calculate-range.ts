import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'https://rangeanxietyrider.com',
  'https://www.rangeanxietyrider.com',
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return req.method === 'OPTIONS';
}

/**
 * Proprietary Range Calculation Engine
 * 
 * Logic protected by server-side execution.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { type, specs, batteryPercent, durationSeconds, speedMph, elevationChangeFt, windMph, windDirDeg, headingDeg } = req.body;

    if (!specs) {
      return res.status(400).json({ error: 'MISSING_SPECS' });
    }

    const { voltage = 48, capacityAh = 15, motorWatts = 750, bikeWeightLbs = 65, riderWeightLbs = 180 } = specs;
    const totalWh = voltage * capacityAh;
    const totalWeightKg = (parseFloat(bikeWeightLbs) + parseFloat(riderWeightLbs)) * 0.453592;

    // Physics Constants
    const gravity = 9.81;
    const rollingRes = 0.01; // Average for bike tires
    const airDensity = 1.225;
    const dragCoef = 0.9; // Average upright rider
    const frontalArea = 0.5; // m^2

    const calculateBurnRate = (speed: number, slope: number, headwind: number) => {
      const speedMs = speed * 0.44704;
      const windMs = headwind * 0.44704;
      const totalAirSpeedMs = Math.max(0, speedMs + windMs);

      // 1. Rolling Resistance Force (N)
      const Frr = rollingRes * totalWeightKg * gravity;
      
      // 2. Gravity Force (N) - Based on slope
      const Fg = totalWeightKg * gravity * Math.sin(Math.atan(slope));

      // 3. Aero Drag Force (N)
      const Fd = 0.5 * airDensity * dragCoef * frontalArea * Math.pow(totalAirSpeedMs, 2);

      const totalForceN = Frr + Fg + Fd;
      const mechanicalPowerW = totalForceN * speedMs;
      
      // Assume 80% efficiency for motor/controller
      const electricalPowerW = Math.max(50, mechanicalPowerW / 0.8); 
      return Math.min(electricalPowerW, motorWatts); 
    };

    if (type === 'telemetry') {
      const currentWh = totalWh * ((batteryPercent || 100) / 100);
      
      // Calculate headwind component
      let headwind = 0;
      if (windMph && windDirDeg !== undefined && headingDeg !== undefined) {
        const relativeAngle = (windDirDeg - headingDeg) * (Math.PI / 180);
        headwind = windMph * Math.cos(relativeAngle);
      }

      const currentSpeed = speedMph || 15;
      const burnRateW = calculateBurnRate(currentSpeed, 0, headwind);
      const remainingHours = currentWh / burnRateW;
      const remainingMiles = remainingHours * currentSpeed;

      return res.status(200).json({
        remainingMiles: Number(remainingMiles.toFixed(2)),
        burnRate: Number(burnRateW.toFixed(2))
      });
    }

    if (type === 'route') {
      if (durationSeconds === undefined) {
        return res.status(400).json({ error: 'MISSING_DURATION' });
      }

      const energyWh = motorWatts * (durationSeconds / 3600);
      const batteryPercentUsed = (energyWh / totalWh) * 100;
      const batteryPercentRemaining = Math.max(0, Math.round(100 - batteryPercentUsed));

      return res.status(200).json({
        batteryPercentRemaining,
        energyWh: Number(energyWh.toFixed(2))
      });
    }

    return res.status(400).json({ error: 'INVALID_TYPE' });

  } catch (error: any) {
    return res.status(500).json({ error: 'CALCULATION_ERROR', message: error.message });
  }
}
