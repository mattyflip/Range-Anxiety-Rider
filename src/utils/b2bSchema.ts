/**
 * RANGE ANXIETY BUSINESS - B2B SCHEMA DESIGN (v1)
 * 
 * This file serves as a reference for the Firestore structure required 
 * to support multi-tenant fleet management.
 */

/*
  /organizations/{orgId}
    - name: string
    - ownerId: string (UID of the person who created it)
    - createdAt: timestamp
    - plan: 'fleet_basic' | 'fleet_pro' | 'enterprise'
    - settings: {
        highFrequencyTracking: boolean (for 10s updates)
        allowRiderPrivacyMode: boolean
      }

  /organizations/{orgId}/members/{userId}
    - role: 'admin' | 'manager' | 'rider'
    - joinedAt: timestamp
    - status: 'active' | 'suspended'

  /organizations/{orgId}/fleets/{fleetId} (Logical groupings, e.g., "NJ North", "NYC Delivery")
    - name: string
    - managerIds: string[] (UIDs of managers overseeing this fleet)
    - riderIds: string[] (UIDs of riders assigned)

  /organizations/{orgId}/active_tracking/{userId} (High-frequency live data)
    - lat: number
    - lng: number
    - batteryPercent: number
    - voltage: number (if BMS connected)
    - currentAmps: number (if BMS connected)
    - estRemainingRange: number (Calculated by our Physics Engine)
    - lastUpdatedAt: timestamp
    - currentJobId: string | null

  /organizations/{orgId}/jobs/{jobId}
    - status: 'pending' | 'active' | 'completed' | 'failed'
    - assignedRiderId: string
    - pickupLoc: geopoint
    - deliveryLoc: geopoint
    - estWhRequired: number (The Physics Engine result)
    - batteryAtStart: number
    - batteryAtEnd: number
    - pathTaken: geopoint[]
*/

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  plan: 'fleet_basic' | 'fleet_pro' | 'enterprise';
}

export interface FleetMember {
  userId: string;
  role: 'admin' | 'manager' | 'rider';
  status: 'active' | 'suspended';
}

export interface LiveTrackingData {
  userId: string;
  lat: number;
  lng: number;
  batteryPercent: number;
  estRemainingRange: number;
  lastUpdatedAt: number;
  voltage?: number;
  currentAmps?: number;
}
