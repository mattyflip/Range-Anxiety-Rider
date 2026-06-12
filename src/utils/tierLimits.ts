import type { UserProfile } from '../types';

/**
 * Feature Tiers Definition
 * 
 * RIDER_FREE: 1 bike, basic maps, standard physics.
 * RIDER_PRO: Unlimited bikes, 3D Flyover, Early Access physics, Unlimited routes.
 * FLEET_STARTER: Up to 5 bikes, basic fleet tracking, team access.
 * FLEET_PRO: Up to 25 bikes, advanced analytics, custom branding.
 * FLEET_ENTERPRISE: Unlimited bikes, API access.
 */

export type SubscriptionTier = 'free' | 'rider_pro' | 'fleet_starter' | 'fleet_pro' | 'fleet_enterprise';

export interface TierLimits {
  maxBikes: number;
  has3DFlyover: boolean;
  hasEarlyAccessPhysics: boolean;
  unlimitedRoutes: boolean;
  hasFleetTools: boolean;
  maxFleetSize: number;
}

export const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  'free': {
    maxBikes: 1,
    has3DFlyover: false,
    hasEarlyAccessPhysics: false,
    unlimitedRoutes: false,
    hasFleetTools: false,
    maxFleetSize: 0
  },
  'rider_pro': {
    maxBikes: 1000, // Effectively unlimited
    has3DFlyover: true,
    hasEarlyAccessPhysics: true,
    unlimitedRoutes: true,
    hasFleetTools: false,
    maxFleetSize: 0
  },
  'fleet_starter': {
    maxBikes: 1, // Personal garage
    has3DFlyover: true,
    hasEarlyAccessPhysics: true,
    unlimitedRoutes: true,
    hasFleetTools: true,
    maxFleetSize: 5
  },
  'fleet_pro': {
    maxBikes: 1,
    has3DFlyover: true,
    hasEarlyAccessPhysics: true,
    unlimitedRoutes: true,
    hasFleetTools: true,
    maxFleetSize: 25
  },
  'fleet_enterprise': {
    maxBikes: 1,
    has3DFlyover: true,
    hasEarlyAccessPhysics: true,
    unlimitedRoutes: true,
    hasFleetTools: true,
    maxFleetSize: 1000
  }
};

/**
 * Helper to check if a user has access to a specific limit or feature
 */
export const getUserTier = (userData: UserProfile | null): SubscriptionTier => {
  if (!userData) return 'free';
  if (userData.isAdmin) return 'fleet_enterprise'; // Admins get everything
  
  // Priority: Fleet tiers > Rider Pro > Free
  if (userData.role === 'fleet' || userData.isShopTier) {
    const fleetSize = userData.maxFleetSize || 0;
    if (fleetSize > 25) return 'fleet_enterprise';
    if (fleetSize > 5) return 'fleet_pro';
    return 'fleet_starter';
  }
  
  if (userData.isPro) return 'rider_pro';
  
  return 'free';
};

export const getTierLimits = (userData: UserProfile | null): TierLimits => {
  const tier = getUserTier(userData);
  return TIER_CONFIG[tier];
};
