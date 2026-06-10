import type { VercelRequest, VercelResponse } from '@vercel/node';

import { setCorsHeaders } from './_cors.js';
import { calculateBurnRate, calculateHeadwind, estimateVoltage, getRollingResCoefficient, PHYSICS_CONSTANTS } from './_physics.js';
import { z } from 'zod';

const CalculateRangeRequestSchema = z.object({
  type: z.enum(['telemetry', 'route']),
  specs: z.object({
    voltage: z.number().default(48),
    capacityAh: z.number().default(15),
    bikeWeightLbs: z.number().default(65),
    tirePSI: z.number().default(30),
    tireType: z.string().default('all-terrain')
  }),
  batteryPercent: z.number().optional(),
  durationSeconds: z.number().optional(),
  speedMph: z.number().optional(),
  elevationChangeFt: z.number().optional(),
  windMph: z.number().optional(),
  windDirDeg: z.number().optional(),
  headingDeg: z.number().optional(),
  riderWeightLbs: z.number().default(180),
  pedalAssistLevel: z.number().default(0),
  driveMode: z.string().default('throttle'),
  throttleMode: z.string().default('normal')
});

/**
 * Proprietary Range Calculation Engine
 * 
 * Logic protected by server-side execution.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeaders(req, res)) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const parsed = CalculateRangeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.issues });
    }

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
      riderWeightLbs,
      pedalAssistLevel,
      driveMode,
      throttleMode
    } = parsed.data;

    const { 
      voltage, 
      capacityAh, 
      bikeWeightLbs,
      tirePSI,
      tireType
    } = specs;

    const totalWh = voltage * capacityAh;
    const totalWeightKg = (Number(bikeWeightLbs) + Number(riderWeightLbs)) * PHYSICS_CONSTANTS.LBS_TO_KG;
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
        driveMode: driveMode as 'throttle' | 'pas',
        throttleMode: throttleMode as 'eco' | 'normal' | 'sport',
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
        driveMode: driveMode as 'throttle' | 'pas',
        throttleMode: throttleMode as 'eco' | 'normal' | 'sport',
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
    console.error('Calculation API Error:', error.message);
    return res.status(500).json({ error: 'CALCULATION_ERROR', message: error.message });      
  }
}
