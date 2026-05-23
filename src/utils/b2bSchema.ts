/**
 * RANGE ANXIETY RIDER - RENTAL FLEET SCHEMA DESIGN (v2)
 * 
 * Optimized for E-Bike Rental Shops.
 * Focuses on asset (Bike) management rather than just rider tracking.
 */

/*
  /organizations/{orgId}
    - name: string (e.g., "Main Street E-Bikes")
    - ownerId: string
    - location: { lat: number, lng: number, address: string }
    - settings: {
        rentalZoneRadius: number (in miles, for geofencing)
        lowBatteryAlertThreshold: number (default 20%)
      }

  /organizations/{orgId}/bikes/{bikeId} (Physical Assets)
    - unitId: string (e.g., "BIKE-001")
    - model: string (e.g., "Surron Light Bee X")
    - specs: {
        voltage: number
        capacityAh: number
        motorWatts: number
      }
    - status: 'available' | 'rented' | 'maintenance' | 'lost' | 'charging'
    - currentRentalId: string | null
    - totalOdometer: number
    - lastMaintenanceDate: timestamp

  /organizations/{orgId}/live_units/{bikeId} (Live Telemetry)
    - position: { lat: number, lng: number }
    - batteryPercent: number
    - estRemainingRange: number
    - currentSpeedMph: number
    - lastUpdatedAt: timestamp
    - bmsData: {
        voltage: number
        temp: number
      } | null

  /organizations/{orgId}/rentals/{rentalId} (Rental Sessions)
    - bikeId: string
    - customerId: string (UID if they have an account, or "Guest")
    - customerName: string
    - startTime: timestamp
    - endTime: timestamp | null (scheduled return)
    - actualReturnTime: timestamp | null
    - startBattery: number
    - endBattery: number
    - status: 'active' | 'completed' | 'overdue' | 'cancelled'
*/

export interface RentalShop {
  id: string;
  name: string;
  ownerId: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
}

export interface BikeUnit {
  id: string;
  unitId: string; // Shop-facing label like "B12"
  model: string;
  specs: {
    voltage: number;
    capacityAh: number;
    motorWatts: number;
  };
  status: 'available' | 'rented' | 'maintenance' | 'lost' | 'charging';
  currentRentalId: string | null;
}

export interface RentalSession {
  id: string;
  bikeId: string;
  customerName: string;
  startTime: any;
  endTime: any;
  status: 'active' | 'completed' | 'overdue' | 'cancelled';
  startBattery: number;
}

export interface LiveUnitData {
  bikeId: string;
  position: {
    lat: number;
    lng: number;
  };
  batteryPercent: number;
  estRemainingRange: number;
  lastUpdatedAt: number;
}
