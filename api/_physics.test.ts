import { describe, it, expect } from 'vitest';
import { calculateBurnRate } from './_physics';

describe('Layer 3 Physics Engine Corrections', () => {
  const baseSpecs = {
    voltage: 48,
    capacityAh: 15,
    motorWatts: 750,
    bikeWeightLbs: 65,
    tirePSI: 30,
    tireType: 'road',
    motorModel: 'Bosch_CX_85'
  };

  const baseParams = {
    speedMph: 20,
    slope: 0,
    headwindMph: 0,
    riderWeightLbs: 180,
    specs: baseSpecs
  };

  it('should apply Layer 1 (Global Correction) correctly', () => {
    const specsWithLayer1 = {
      ...baseSpecs,
      correctionFactors: {
        global_correction: 0.9, // 10% more efficient than baseline
        motor_corrections: {},
        multidim_model: null,
        r_squared: 0.5,
        trained_on_n_rides: 5,
        model_version: 'v1',
        confidence_interval_pct: 20
      }
    };

    const baseline = calculateBurnRate(baseParams);
    const corrected = calculateBurnRate({ ...baseParams, specs: specsWithLayer1 });

    expect(corrected).toBeCloseTo(baseline * 0.9, 1);
  });

  it('should apply Layer 2 (Per-Motor Correction) after 20 rides', () => {
    const specsWithLayer2 = {
      ...baseSpecs,
      correctionFactors: {
        global_correction: 1.0,
        motor_corrections: {
          'Bosch_CX_85': 1.2 // This motor is 20% less efficient than baseline
        },
        multidim_model: null,
        r_squared: 0.6,
        trained_on_n_rides: 25,
        model_version: 'v1',
        confidence_interval_pct: 15
      }
    };

    const baseline = calculateBurnRate(baseParams);
    const corrected = calculateBurnRate({ ...baseParams, specs: specsWithLayer2 });

    expect(corrected).toBeCloseTo(baseline * 1.2, 1);
  });

  it('should apply Layer 3 (Multi-Dimensional Regression) after 30 rides', () => {
    const specsWithLayer3 = {
      ...baseSpecs,
      correctionFactors: {
        global_correction: 1.0,
        motor_corrections: {},
        multidim_model: {
          // intercept + (w1 * assist) + (w2 * slope) + (w3 * temp) + (w4 * speed) + (w5 * stops) + (w6 * variance)
          // For this test, let's make it simple: 10% adjustment at baseline
          weights: [0, 0, 0, 0, 0, 0],
          intercept: 0.1 // Predicts 10% error (Predicted > Actual, so Actual is 90% of Predicted)
        },
        r_squared: 0.85,
        trained_on_n_rides: 35,
        model_version: 'v1',
        confidence_interval_pct: 8
      }
    };

    const baseline = calculateBurnRate(baseParams);
    const corrected = calculateBurnRate({ ...baseParams, specs: specsWithLayer3 });

    // Formula: totalPowerW *= (1 - errorAdjustment)
    // 1 - 0.1 = 0.9
    expect(corrected).toBeCloseTo(baseline * 0.9, 1);
  });

  it('should fallback to global correction if motor model does not match in Layer 2', () => {
    const specsWithMismatch = {
      ...baseSpecs,
      motorModel: 'Different_Motor',
      correctionFactors: {
        global_correction: 0.8,
        motor_corrections: { 'Bosch_CX_85': 1.2 },
        multidim_model: null,
        r_squared: 0.6,
        trained_on_n_rides: 25,
        model_version: 'v1',
        confidence_interval_pct: 15
      }
    };

    const baseline = calculateBurnRate(baseParams);
    const corrected = calculateBurnRate({ ...baseParams, specs: specsWithMismatch });

    expect(corrected).toBeCloseTo(baseline * 0.8, 1);
  });

  it('should ignore Layer 3 if weights array is malformed', () => {
    const specsWithBadWeights = {
      ...baseSpecs,
      correctionFactors: {
        global_correction: 1.0,
        motor_corrections: {},
        multidim_model: {
          weights: [0.1], // Too short, requires 6
          intercept: 0.1
        },
        r_squared: 0.9,
        trained_on_n_rides: 40,
        model_version: 'v1',
        confidence_interval_pct: 5
      }
    };

    const baseline = calculateBurnRate(baseParams);
    const corrected = calculateBurnRate({ ...baseParams, specs: specsWithBadWeights });

    // Should fallback to global_correction (1.0)
    expect(corrected).toBe(baseline);
  });
});
