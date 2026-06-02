/**
 * Shared Physics Engine for Range Calculations
 * 
 * This module contains the pure physics logic used to calculate energy consumption (burn rate)
 * and remaining range for e-bikes. Extracted from the API to allow for client-side use
 * and independent testing.
 */

export interface BikeSpecs {
  voltage?: number;
  capacityAh?: number;
  motorWatts?: number;
  bikeWeightLbs?: number | string;
  tirePSI?: number | string;
  tireType?: string;
  controllerType?: string;
  controllerAmps?: number;
  currentBatteryPercent?: number;
  pasSensorType?: 'cadence' | 'torque';
  calibrationFactor?: number;
  motorModel?: string;
  correctionFactors?: {
    global_correction: number;
    motor_corrections: Record<string, number>;
    multidim_model: {
      weights: number[];
      intercept: number;
    } | null;
    r_squared: number;
    trained_on_n_rides: number;
  };
}

export interface BurnRateParams {
  speedMph: number;
  slope: number;
  headwindMph: number;
  temperatureC?: number;
  riderWeightLbs?: number | string;
  actualStopsPerKm?: number;
  speedVariance?: number;
  pedalAssistLevel?: number;
  driveMode?: 'throttle' | 'pas';
  throttleMode?: 'eco' | 'normal' | 'sport';
  specs: BikeSpecs;
}

export const PHYSICS_CONSTANTS = {
  GRAVITY: 9.81,
  AIR_DENSITY: 1.225,
  LBS_TO_KG: 0.453592,
  MPH_TO_MS: 0.44704,
};

/**
 * Calculates the electrical power draw (Watts) based on riding conditions.
 */
export function calculateBurnRate(params: BurnRateParams): number {
  const {
    speedMph,
    slope,
    headwindMph,
    riderWeightLbs = 180,
    pedalAssistLevel = 0,
    driveMode = 'throttle',
    throttleMode = 'normal',
    specs
  } = params;

  const {
    motorWatts = 750,
    bikeWeightLbs = 65,
    tirePSI = 30,
    tireType = 'all-terrain'
  } = specs;

  const speedMs = speedMph * PHYSICS_CONSTANTS.MPH_TO_MS;
  if (speedMs <= 0) return 40; // Idle draw (lights, controller, cooling)

  const totalWeightKg = (Number(bikeWeightLbs) + Number(riderWeightLbs)) * PHYSICS_CONSTANTS.LBS_TO_KG;

  // 1. Categorized Drag (Area * Coef)
  let CdA = 0.55; // Default
  if (motorWatts > 5000) CdA = 1.0; // Dirt bike style (Surron/Talaria)
  else if (motorWatts > 2000) CdA = 0.75; // Heavy commuter/moped
  else if (motorWatts < 500) CdA = 0.4; // Sleek road e-bike

  // 2. Rolling Resistance Adjustment
  let baseCrr = 0.015; // Realistic for off-road/heavy e-bike tires
  if (tireType === 'slick') baseCrr = 0.009;
  if (tireType === 'knobby') baseCrr = 0.025;
  
  const psiDiff = Math.max(0, 40 - Number(tirePSI));
  const rollingRes = baseCrr * (1 + (psiDiff / 5) * 0.2); // Aggressive penalty for low PSI

  const windMs = headwindMph * PHYSICS_CONSTANTS.MPH_TO_MS;
  const totalAirSpeedMs = Math.max(0, speedMs + windMs);

  // --- Force Calculations ---
  
  // Rolling Resistance Force (N)
  const Frr = rollingRes * totalWeightKg * PHYSICS_CONSTANTS.GRAVITY;
  
  // Gravity Force (N)
  const Fg = totalWeightKg * PHYSICS_CONSTANTS.GRAVITY * Math.sin(Math.atan(slope));

  // Aero Drag Force (N)
  const Fd = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY * CdA * Math.pow(totalAirSpeedMs, 2);

  const totalMechanicalPowerW = (Frr + Fg + Fd) * speedMs;
  
  // Human Contribution
  let humanPowerW = 0;
  let isAssistLimited = false;

  if (driveMode === 'pas') {
    const isTorque = specs.pasSensorType === 'torque';
    const level = Number(pedalAssistLevel) || 0;

    const pasSpeedCaps = [0, 8, 12, 16, 20, 28]; 
    const speedCap = pasSpeedCaps[level] || 28;

    if (speedMph > speedCap) {
       isAssistLimited = true;
       humanPowerW = 180; 
    } else if (isTorque) {
       humanPowerW = 210 - (level * 30); 
    } else {
       humanPowerW = 185 - (level * 35);
    }
  }

  const motorMechanicalPowerW = isAssistLimited ? 0 : Math.max(0, totalMechanicalPowerW - humanPowerW);
  
  // Efficiency & Drivetrain Losses
  let drivetrainEfficiency = 0.85; 
  if (motorWatts > 5000) drivetrainEfficiency = 0.78;

  // Controller Efficiency
  let controllerEfficiency = 0.85; 
  const cType = (specs.controllerType || '').toLowerCase();
  if (cType.includes('foc')) controllerEfficiency = 0.94;
  else if (cType.includes('sine')) controllerEfficiency = 0.90;
  else if (cType.includes('kelly') || cType.includes('bac')) controllerEfficiency = 0.92;
  else if (cType.includes('standard')) controllerEfficiency = 0.82;

  if (specs.pasSensorType === 'torque') controllerEfficiency += 0.05;

  if (driveMode === 'throttle') {
    if (throttleMode === 'eco') controllerEfficiency *= 1.05;
    else if (throttleMode === 'sport') controllerEfficiency *= 0.85;
  }

  const totalEfficiency = drivetrainEfficiency * controllerEfficiency;
  const electricalPowerW = Math.max(40, motorMechanicalPowerW / totalEfficiency); 
  
  // Acceleration Penalty (Stop-and-go)
  const stopAndGoPenalty = 1.25;
  const calibrationFactor = specs.calibrationFactor || 1.0;
  let totalPowerW = electricalPowerW * stopAndGoPenalty * calibrationFactor;

  // --- Layer 3: Adaptive Corrections (Learned from Ride History) ---
  if (specs.correctionFactors) {
    const cf = specs.correctionFactors;
    const nRides = cf.trained_on_n_rides || 0;
    
    if (nRides >= 30 && cf.multidim_model && cf.multidim_model.weights?.length >= 6) {
      // Option C: Multi-Dimensional Regression
      const { weights, intercept } = cf.multidim_model;
      const assistNum = pedalAssistLevel || 2;
      const avgSpeedKmh = speedMph * 1.60934;
      const tempC = params.temperatureC || 20;
      
      const errorAdjustment = intercept + 
        (weights[0] * assistNum) + 
        (weights[1] * slope) + 
        (weights[2] * tempC) + 
        (weights[3] * avgSpeedKmh) +
        (weights[4] * (params.actualStopsPerKm || 0)) +
        (weights[5] * (params.speedVariance || 0));
        
      totalPowerW *= (1 - errorAdjustment);
    } else if (nRides >= 20 && specs.motorModel && cf.motor_corrections?.[specs.motorModel]) {
      // Option B: Per-Motor Correction
      totalPowerW *= cf.motor_corrections[specs.motorModel];
    } else if (nRides > 0) {
      // Option A: Global Correction
      totalPowerW *= cf.global_correction;
    }
  }

  // Use controllerAmps if available for a real physical ceiling, else fallback
  const voltage = specs.voltage || 48;
  const peakPowerCeiling = specs.controllerAmps 
    ? (Number(specs.controllerAmps) * Number(voltage))
    : (motorWatts * 1.5);

  return Math.min(totalPowerW, peakPowerCeiling); 
}

/**
 * Calculates headwind based on wind speed, wind direction, and travel heading.
 */
export function calculateHeadwind(windMph: number, windDirDeg: number, headingDeg: number): number {
  const relativeAngle = (windDirDeg - headingDeg) * (Math.PI / 180);
  return windMph * Math.cos(relativeAngle);
}

/**
 * Estimates battery voltage based on nominal voltage and charge percentage.
 */
export function estimateVoltage(nominalVoltage: number, batteryPercent: number): number {
  const fullVoltage = nominalVoltage * 1.16; 
  const emptyVoltage = nominalVoltage * 0.83; 
  return emptyVoltage + (batteryPercent / 100) * (fullVoltage - emptyVoltage);
}

/**
 * Helper to get the rolling resistance coefficient including PSI penalties.
 */
export function getRollingResCoefficient(tireType: string, tirePSI: number | string): number {
  let baseCrr = 0.015;
  if (tireType === 'slick') baseCrr = 0.009;
  if (tireType === 'knobby') baseCrr = 0.025;
  
  const psiDiff = Math.max(0, 40 - Number(tirePSI));
  return baseCrr * (1 + (psiDiff / 5) * 0.2);
}
