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
  motorType?: 'Geared Hub Motor' | 'Direct Drive Hub Motor' | 'Mid Drive Motor';
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
  
  // Human Contribution (Refactored for dramatic impact on range)
  let humanPowerW = 0;
  let isAssistLimited = false;

  if (driveMode === 'pas') {
    const isTorque = specs.pasSensorType === 'torque';
    const level = Number(pedalAssistLevel) || 0;

    // 1. Speed-Based Assist Limit (Common on Lectric/Aventon/etc.)
    // If you pedal faster than the assist level, the motor stops helping.
    const pasSpeedCaps = [0, 8, 12, 16, 20, 28]; // MPH caps for levels 0-5
    const speedCap = pasSpeedCaps[level] || 28;

    if (speedMph > speedCap) {
       isAssistLimited = true;
       humanPowerW = 180; // Rider is working hard to go faster than the motor helps
    } else if (isTorque) {
       // Torque sensors: Higher human input required.
       // Level 1: 180W -> Level 5: 60W
       humanPowerW = 210 - (level * 30); 
    } else {
       // Cadence sensors: Level 1: 150W -> Level 5: 10W (Ghost pedaling)
       humanPowerW = 185 - (level * 35);
    }
  }

  // If we are above the PAS speed cap, the motor contributes 0W
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

  // Sensor Efficiency Bonus: Torque sensors often modulate power better
  if (specs.pasSensorType === 'torque') controllerEfficiency += 0.05;

  // Aggressiveness/Heat waste penalty
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
 * Estimates the theoretical maximum range in miles based on current capacity and conditions.
 * Assumes average cruise speed of 15mph on flat ground if not provided.
 */
export function estimateMaxRange(params: BurnRateParams): number {
  const { voltage = 48, capacityAh = 15 } = params.specs;
  const totalWh = Number(voltage) * Number(capacityAh);
  const currentWh = totalWh * ((params.specs.currentBatteryPercent || 100) / 100);

  // Calculate burn rate at cruise speed (e.g. 15mph) on flat ground (0 slope, 0 wind)
  const cruiseSpeed = 15;
  const burnRateW = calculateBurnRate({
    ...params,
    speedMph: cruiseSpeed,
    slope: 0,
    headwindMph: 0
  });

  const hoursOfRuntime = currentWh / burnRateW;
  return hoursOfRuntime * cruiseSpeed;
}

/**
 * Generates a set of 16 Lat/Lng points forming a "Wind-Aware" range polygon.
 * Stretches the polygon in tailwind directions and compresses in headwind directions.
 */
export function calculateRangePolygon(
  center: { lat: number; lng: number },
  wind: { speed: number; direction: number }, // direction wind is FROM
  params: BurnRateParams,
  isRoundTrip: boolean
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const numBearings = 16;
  const cruiseSpeed = 15;

  const { voltage = 48, capacityAh = 15 } = params.specs;
  const totalWh = Number(voltage) * Number(capacityAh);
  const currentWh = totalWh * ((params.specs.currentBatteryPercent || 100) / 100);

  for (let i = 0; i < numBearings; i++) {
    const bearing = (i * 360) / numBearings;
    
    // Calculate headwind component for THIS specific bearing
    const headwindMph = calculateHeadwind(wind.speed, wind.direction, bearing);
    
    // Calculate burn rate for this specific vector
    const burnRateW = calculateBurnRate({
      ...params,
      speedMph: cruiseSpeed,
      slope: 0, // Assume average flat for radius
      headwindMph
    });

    const hours = currentWh / burnRateW;
    let distanceMiles = hours * cruiseSpeed;

    if (isRoundTrip) distanceMiles /= 2;

    points.push(computeDestinationPoint(center, distanceMiles, bearing));
  }

  return points;
}

/**
 * Calculates a new Lat/Lng given a starting point, distance (miles), and bearing (degrees).
 */
export function computeDestinationPoint(
  start: { lat: number; lng: number },
  distanceMiles: number,
  bearingDeg: number
): { lat: number; lng: number } {
  const R = 3958.8; // Earth's radius in miles
  const brng = (bearingDeg * Math.PI) / 180;
  const dR = distanceMiles / R;

  const lat1 = (start.lat * Math.PI) / 180;
  const lon1 = (start.lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) +
    Math.cos(lat1) * Math.sin(dR) * Math.cos(brng)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lon2 * 180) / Math.PI
  };
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
