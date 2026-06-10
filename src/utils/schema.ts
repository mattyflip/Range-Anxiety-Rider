import { z } from 'zod';

export const BikeSpecsSchema = z.object({
  voltage: z.number(),
  capacityAh: z.number(),
  motorWatts: z.number(),
  bikeWeightLbs: z.number().optional(),
  tirePSI: z.number().optional(),
  tireType: z.enum(['road', 'knobby']).optional(),
  driveMode: z.enum(['both', 'pas_only', 'throttle_only']).optional(),
  targetSpeedMph: z.number().optional(),
});

export const BikeUnitSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  model: z.string(),
  specs: BikeSpecsSchema,
  status: z.enum(['available', 'rented', 'maintenance', 'lost', 'charging']),
  currentRentalId: z.string().nullable(),
});

export const LocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string(),
});

export const RentalShopSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  location: LocationSchema,
});

export const LiveUnitDataSchema = z.object({
  bikeId: z.string(),
  position: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  batteryPercent: z.number(),
  estRemainingRange: z.number(),
  lastUpdatedAt: z.number(),
});

export type BikeSpecs = z.infer<typeof BikeSpecsSchema>;
export type BikeUnit = z.infer<typeof BikeUnitSchema>;
export type RentalShop = z.infer<typeof RentalShopSchema>;
export type LiveUnitData = z.infer<typeof LiveUnitDataSchema>;
