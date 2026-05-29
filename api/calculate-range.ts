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
    const { 
      type, 
      specs, 
      batteryPercent, 
      durationSeconds, 
      speedMph, 
      elevationChangeFt, 
      windMph, 
      windDirDeg, 
      headingDeg,
      riderWeightLbs = 180,
      pedalAssistLevel = 0, // 0-5
      driveMode = 'throttle', // 'throttle' or 'pas'
      throttleMode = 'normal' // 'eco' | 'normal' | 'sport'
    } = req.body;

    if (!specs) {
      return res.status(400).json({ error: 'MISSING_SPECS' });
    }

    const { 
      voltage = 48, 
      capacityAh = 15, 
      motorWatts = 750, 
      bikeWeightLbs = 65,
      tirePSI = 30,
      tireType = 'all-terrain' // 'slick' | 'knobby' | 'all-terrain'
    } = specs;

    const totalWh = voltage * capacityAh;
    const totalWeightKg = (parseFloat(bikeWeightLbs) + parseFloat(riderWeightLbs)) * 0.453592;

    // Physics Constants & Adjustments
    const gravity = 9.81;
    const airDensity = 1.225;
    const dragCoef = 0.9; 
    const frontalArea = 0.5;

    // Rolling Resistance Adjustment
    let baseCrr = 0.01;
    if (tireType === 'slick') baseCrr = 0.006;
    if (tireType === 'knobby') baseCrr = 0.015;
    
    // PSI Adjustment: Lower PSI = Higher Resistance (+10% resistance for every 5 PSI below 40)
    const psiDiff = Math.max(0, 40 - tirePSI);
    const rollingRes = baseCrr * (1 + (psiDiff / 5) * 0.1);

    const calculateBurnRate = (speed: number, slope: number, headwind: number) => {
      const speedMs = speed * 0.44704;
      const windMs = headwind * 0.44704;
      const totalAirSpeedMs = Math.max(0, speedMs + windMs);

      // 1. Rolling Resistance Force (N)
      const Frr = rollingRes * totalWeightKg * gravity;
      
      // 2. Gravity Force (N)
      const Fg = totalWeightKg * gravity * Math.sin(Math.atan(slope));

      // 3. Aero Drag Force (N)
      const Fd = 0.5 * airDensity * dragCoef * frontalArea * Math.pow(totalAirSpeedMs, 2);

      const totalMechanicalPowerW = (Frr + Fg + Fd) * speedMs;
      
      // Human Contribution
      let humanPowerW = 0;
      if (driveMode === 'pas' && speed > 0) {
        // Average human output is ~75-150W. Scale by PAS level.
        humanPowerW = 50 + (pedalAssistLevel * 20); 
      }

      const motorMechanicalPowerW = Math.max(0, totalMechanicalPowerW - humanPowerW);
      
      // Efficiency adjustments based on drive mode and throttle style
      let efficiency = 0.8; // Baseline 80%
      if (driveMode === 'throttle') {
        if (throttleMode === 'eco') efficiency = 0.85; // Less heat waste, limited amp spikes
        else if (throttleMode === 'sport') efficiency = 0.70; // High heat waste from aggressive acceleration
      }

      const electricalPowerW = Math.max(50, motorMechanicalPowerW / efficiency); 
      return Math.min(electricalPowerW, motorWatts); 
    };

    if (type === 'telemetry') {
      const currentWh = totalWh * ((batteryPercent || 100) / 100);
      
      let headwind = 0;
      if (windMph && windDirDeg !== undefined && headingDeg !== undefined) {
        const relativeAngle = (windDirDeg - headingDeg) * (Math.PI / 180);
        headwind = windMph * Math.cos(relativeAngle);
      }

      const currentSpeed = speedMph || 15;
      const slope = elevationChangeFt ? (elevationChangeFt / 5280) : 0; // Rough slope over 1 mile
      
      const burnRateW = calculateBurnRate(currentSpeed, slope, headwind);
      const remainingHours = currentWh / burnRateW;
      const remainingMiles = remainingHours * currentSpeed;

      return res.status(200).json({
        remainingMiles: Number(remainingMiles.toFixed(2)),
        burnRate: Number(burnRateW.toFixed(2)),
        factors: {
          rollingRes: Number(rollingRes.toFixed(4)),
          headwind: Number(headwind.toFixed(1)),
          totalWeightKg: Number(totalWeightKg.toFixed(1))
        }
      });
    }

    if (type === 'route') {
      if (durationSeconds === undefined) {
        return res.status(400).json({ error: 'MISSING_DURATION' });
      }

      // Route calc based on avg speed and total elevation gain
      const avgSpeed = speedMph || 15;
      const totalSlope = (elevationChangeFt || 0) / (avgSpeed * (durationSeconds / 3600) * 5280);
      
      const burnRateW = calculateBurnRate(avgSpeed, Math.max(0, totalSlope), 0);
      const energyWh = burnRateW * (durationSeconds / 3600);
      const batteryPercentUsed = (energyWh / totalWh) * 100;
      const batteryPercentRemaining = Math.max(0, Math.round(100 - batteryPercentUsed));

      return res.status(200).json({
        batteryPercentRemaining,
        energyWh: Number(energyWh.toFixed(2)),
        burnRate: Number(burnRateW.toFixed(2))
      });
    }

    return res.status(400).json({ error: 'INVALID_TYPE' });

  } catch (error: any) {
    return res.status(500).json({ error: 'CALCULATION_ERROR', message: error.message });      
  }
}
