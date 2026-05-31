import { describe, it, expect } from 'vitest';
import { calculateBurnRate, calculateHeadwind, estimateVoltage, getRollingResCoefficient } from './physics';

describe('Physics Utility', () => {
  const defaultSpecs = {
    voltage: 48,
    capacityAh: 15,
    motorWatts: 750,
    bikeWeightLbs: 65,
    tirePSI: 30,
    tireType: 'all-terrain'
  };

  describe('calculateBurnRate', () => {
    it('should return idle draw when speed is 0', () => {
      const burnRate = calculateBurnRate({
        speedMph: 0,
        slope: 0,
        headwindMph: 0,
        specs: defaultSpecs
      });
      expect(burnRate).toBe(40);
    });

    it('should calculate a reasonable burn rate for a standard e-bike', () => {
      const burnRate = calculateBurnRate({
        speedMph: 15,
        slope: 0,
        headwindMph: 0,
        specs: defaultSpecs
      });
      // Standard 750W bike at 15mph usually draws ~150-350W mechanical.
      // With efficiency losses and 25% stop-and-go penalty, ~400-500W is reasonable.
      expect(burnRate).toBeGreaterThan(100);
      expect(burnRate).toBeLessThan(600);
    });

    it('should increase burn rate when climbing', () => {
      const flatRate = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 0, specs: defaultSpecs });
      const climbingRate = calculateBurnRate({ speedMph: 15, slope: 0.05, headwindMph: 0, specs: defaultSpecs });
      expect(climbingRate).toBeGreaterThan(flatRate);
    });

    it('should increase burn rate with headwind', () => {
      const noWind = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 0, specs: defaultSpecs });
      const headwind = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 10, specs: defaultSpecs });
      expect(headwind).toBeGreaterThan(noWind);
    });

    it('should decrease burn rate on negative slopes (descents)', () => {
      const flatRate = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 0, specs: defaultSpecs });
      const descentRate = calculateBurnRate({ speedMph: 15, slope: -0.05, headwindMph: 0, specs: defaultSpecs });
      // On a steep enough descent, mechanical power becomes negative, electrical should hit its floor (40W idle)
      expect(descentRate).toBeLessThan(flatRate);
      expect(descentRate).toBeGreaterThanOrEqual(40);
    });

    it('should apply severe penalty for extremely low tire PSI', () => {
      const normalRate = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 0, specs: { ...defaultSpecs, tirePSI: 30 } });
      const flatTireRate = calculateBurnRate({ speedMph: 15, slope: 0, headwindMph: 0, specs: { ...defaultSpecs, tirePSI: 5 } });
      expect(flatTireRate).toBeGreaterThan(normalRate * 1.4); // Significant penalty for low PSI
    });
  });

  describe('calculateHeadwind', () => {
    it('should calculate full headwind when heading directly into wind', () => {
      const headwind = calculateHeadwind(10, 0, 0); // 10mph wind from North, heading North
      expect(headwind).toBeCloseTo(10);
    });

    it('should calculate tailwind as negative headwind', () => {
      const headwind = calculateHeadwind(10, 0, 180); // 10mph wind from North, heading South
      expect(headwind).toBeCloseTo(-10);
    });

    it('should calculate zero headwind for crosswinds', () => {
      const headwind = calculateHeadwind(10, 0, 90); // 10mph wind from North, heading East
      expect(Math.abs(headwind)).toBeLessThan(0.0001);
    });
  });

  describe('estimateVoltage', () => {
    it('should estimate full voltage correctly', () => {
      const voltage = estimateVoltage(48, 100);
      expect(voltage).toBeCloseTo(48 * 1.16);
    });

    it('should estimate empty voltage correctly', () => {
      const voltage = estimateVoltage(48, 0);
      expect(voltage).toBeCloseTo(48 * 0.83);
    });
  });

  describe('getRollingResCoefficient', () => {
    it('should increase resistance for low PSI', () => {
      const highPSI = getRollingResCoefficient('all-terrain', 40);
      const lowPSI = getRollingResCoefficient('all-terrain', 20);
      expect(lowPSI).toBeGreaterThan(highPSI);
    });

    it('should return higher base resistance for knobby tires', () => {
      const slick = getRollingResCoefficient('slick', 40);
      const knobby = getRollingResCoefficient('knobby', 40);
      expect(knobby).toBeGreaterThan(slick);
    });
  });
});
