import type { VercelRequest, VercelResponse } from '@vercel/node';

import { setCorsHeaders } from './_cors';
import { calculateBurnRate, calculateHeadwind, estimateVoltage, getRollingResCoefficient, PHYSICS_CONSTANTS } from './_physics';

/**
 * Proprietary Range Calculation Engine
 * 
 * Logic protected by server-side execution.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setCorsHeaders(req, res)) return;

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
      pedalAssistLevel = 0,
      driveMode = 'throttle',
      throttleMode = 'normal'
    } = req.body;

    if (!specs) {
      return res.status(400).json({ error: 'MISSING_SPECS' });
    }

    const { 
      voltage = 48, 
      capacityAh = 15, 
      bikeWeightLbs = 65,
      tirePSI = 30,
      tireType = 'all-terrain'
    } = specs;

    const totalWh = voltage * capacityAh;
    const totalWeightKg = (parseFloat(bikeWeightLbs) + parseFloat(riderWeightLbs)) * PHYSICS_CONSTANTS.LBS_TO_KG;
    const rollingRes = getRollingResCoefficient(tireType, tirePSI);

    if (type === 'telemetry') {
      const currentWh = totalWh * ((batteryPercent || 100) / 100);
      
      let headwind = 0;
      if (windMph && windDirDeg !== undefined && headingDeg !== undefined) {
        headwind = calculateHeadwind(windMph, windDirDeg, headingDeg);
      }

      const currentSpeed = speedMph || 15;
      const slope = elevationChangeFt ? (elevationChangeFt / 5280) : 0;
      
      const burnRateW = calculateBurnRate({
        speedMph: currentSpeed,
        slope,
        headwindMph: headwind,
        riderWeightLbs,
        pedalAssistLevel,
        driveMode,
        throttleMode,
        specs
      });
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
        headwind = calculateHeadwind(windMph, windDirDeg, headingDeg);
      }

      const burnRateW = calculateBurnRate({
        speedMph: avgSpeed,
        slope: Math.max(0, totalSlope),
        headwindMph: headwind,
        riderWeightLbs,
        pedalAssistLevel,
        driveMode,
        throttleMode,
        specs
      });
      const energyWh = burnRateW * (durationSeconds / 3600);
      const batteryPercentUsed = (energyWh / totalWh) * 100;
      const batteryPercentRemaining = Math.max(0, Math.round((batteryPercent || 100) - batteryPercentUsed));

      // Voltage estimation
      const endingVoltage = estimateVoltage(voltage, batteryPercentRemaining);

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
