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
      tireType = 'all-terrain'
    } = specs;

    const totalWh = voltage * capacityAh;
    const totalWeightKg = (parseFloat(bikeWeightLbs) + parseFloat(riderWeightLbs)) * 0.453592;

    // Physics Constants & Adjustments
    const gravity = 9.81;
    const airDensity = 1.225;
    
    // Categorized Drag (Area * Coef)
    let CdA = 0.55; // Default
    if (motorWatts > 5000) CdA = 1.0; // Dirt bike style (Surron/Talaria) has much more drag (upright + wide)
    else if (motorWatts > 2000) CdA = 0.75; // Heavy commuter/moped
    else if (motorWatts < 500) CdA = 0.4; // Sleek road e-bike

    // Rolling Resistance Adjustment
    let baseCrr = 0.015; // Realistic for off-road/heavy e-bike tires
    if (tireType === 'slick') baseCrr = 0.009;
    if (tireType === 'knobby') baseCrr = 0.025;
    
    const psiDiff = Math.max(0, 40 - tirePSI);
    const rollingRes = baseCrr * (1 + (psiDiff / 5) * 0.2); // Aggressive penalty for low PSI

    const calculateBurnRate = (speed: number, slope: number, headwind: number) => {
      const speedMs = speed * 0.44704;
      if (speedMs <= 0) return 40; // Idle draw (lights, controller, cooling)

      const windMs = headwind * 0.44704;
      const totalAirSpeedMs = Math.max(0, speedMs + windMs);

      // 1. Rolling Resistance Force (N)
      const Frr = rollingRes * totalWeightKg * gravity;
      
      // 2. Gravity Force (N)
      const Fg = totalWeightKg * gravity * Math.sin(Math.atan(slope));

      // 3. Aero Drag Force (N)
      const Fd = 0.5 * airDensity * CdA * Math.pow(totalAirSpeedMs, 2);

      const totalMechanicalPowerW = (Frr + Fg + Fd) * speedMs;
      
      // Human Contribution
      let humanPowerW = 0;
      if (driveMode === 'pas') {
        humanPowerW = 40 + (pedalAssistLevel * 20); 
      }

      const motorMechanicalPowerW = Math.max(0, totalMechanicalPowerW - humanPowerW);
      
      // Efficiency & Drivetrain Losses
      // Surrons/Talarias have significant drivetrain loss (belt + chain)
      let drivetrainEfficiency = 0.85; 
      if (motorWatts > 5000) drivetrainEfficiency = 0.78; // Higher friction at high torque

      // Controller Efficiency based on type
      let controllerEfficiency = 0.85; // Baseline
      const cType = (specs.controllerType || '').toLowerCase();
      if (cType.includes('foc')) controllerEfficiency = 0.94;
      else if (cType.includes('sine')) controllerEfficiency = 0.90;
      else if (cType.includes('kelly') || cType.includes('bac')) controllerEfficiency = 0.92;
      else if (cType.includes('standard')) controllerEfficiency = 0.82;

      // Aggressiveness/Heat waste penalty
      if (driveMode === 'throttle') {
        if (throttleMode === 'eco') controllerEfficiency *= 1.05; // Peak efficiency
        else if (throttleMode === 'sport') controllerEfficiency *= 0.85; // High heat waste
      }

      const totalEfficiency = drivetrainEfficiency * controllerEfficiency;
      const electricalPowerW = Math.max(40, motorMechanicalPowerW / totalEfficiency); 
      
      // Acceleration Penalty (Stop-and-go)
      // Real riding involves constant speed changes. We add a 25% "Inertial Penalty"
      const stopAndGoPenalty = 1.25;

      return Math.min(electricalPowerW * stopAndGoPenalty, motorWatts * 1.5); 
    };

    if (type === 'telemetry') {
      const currentWh = totalWh * ((batteryPercent || 100) / 100);
      
      let headwind = 0;
      if (windMph && windDirDeg !== undefined && headingDeg !== undefined) {
        const relativeAngle = (windDirDeg - headingDeg) * (Math.PI / 180);
        headwind = windMph * Math.cos(relativeAngle);
      }

      const currentSpeed = speedMph || 15;
      const slope = elevationChangeFt ? (elevationChangeFt / 5280) : 0;
      
      const burnRateW = calculateBurnRate(currentSpeed, slope, headwind);
      const remainingHours = currentWh / burnRateW;
      const remainingMiles = remainingHours * currentSpeed;

      return res.status(200).json({
        remainingMiles: Number(remainingMiles.toFixed(2)),
        burnRate: Number(burnRateW.toFixed(2)),
        efficiencyWhMi: Number((burnRateW / currentSpeed).toFixed(1)),
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

      const avgSpeed = speedMph || 15;
      const totalSlope = (elevationChangeFt || 0) / (avgSpeed * (durationSeconds / 3600) * 5280);
      
      let headwind = 0;
      if (windMph && windDirDeg !== undefined && headingDeg !== undefined) {
        const relativeAngle = (windDirDeg - headingDeg) * (Math.PI / 180);
        headwind = windMph * Math.cos(relativeAngle);
      }

      const burnRateW = calculateBurnRate(avgSpeed, Math.max(0, totalSlope), headwind);
      const energyWh = burnRateW * (durationSeconds / 3600);
      const batteryPercentUsed = (energyWh / totalWh) * 100;
      const batteryPercentRemaining = Math.max(0, Math.round((batteryPercent || 100) - batteryPercentUsed));

      // Voltage estimation
      const nominalVoltage = specs.voltage || 48;
      const fullVoltage = nominalVoltage * 1.16; 
      const emptyVoltage = nominalVoltage * 0.83; 
      const endingVoltage = emptyVoltage + (batteryPercentRemaining / 100) * (fullVoltage - emptyVoltage);

      return res.status(200).json({
        batteryPercentRemaining,
        energyWh: Number(energyWh.toFixed(2)),
        burnRate: Number(burnRateW.toFixed(2)),
        efficiencyWhMi: Number((energyWh / (avgSpeed * (durationSeconds / 3600))).toFixed(1)),
        endingVoltage: Number(endingVoltage.toFixed(1)),
        elevationGainFt: elevationChangeFt
      });
    }

    return res.status(400).json({ error: 'INVALID_TYPE' });

  } catch (error: any) {
    return res.status(500).json({ error: 'CALCULATION_ERROR', message: error.message });      
  }
}
