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
}

export interface BurnRateParams {
  speedMph: number;
  slope: number;
  headwindMph: number;
  riderWeightLbs?: number | string;
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
  if (driveMode === 'pas') {
    humanPowerW = 40 + (pedalAssistLevel * 20); 
  }

  const motorMechanicalPowerW = Math.max(0, totalMechanicalPowerW - humanPowerW);
  
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

  // Aggressiveness/Heat waste penalty
  if (driveMode === 'throttle') {
    if (throttleMode === 'eco') controllerEfficiency *= 1.05;
    else if (throttleMode === 'sport') controllerEfficiency *= 0.85;
  }

  const totalEfficiency = drivetrainEfficiency * controllerEfficiency;
  const electricalPowerW = Math.max(40, motorMechanicalPowerW / totalEfficiency); 
  
  // Acceleration Penalty (Stop-and-go)
  const stopAndGoPenalty = 1.25;

  return Math.min(electricalPowerW * stopAndGoPenalty, motorWatts * 1.5); 
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
