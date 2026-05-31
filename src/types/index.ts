import { Timestamp } from 'firebase/firestore';

export interface BikeSpecs {
  voltage: number | '';
  capacityAh: number | '';
  motorWatts: number | '';
  bikeWeightLbs: number | '';
  tirePSI?: number | '';
  tireType?: 'road' | 'knobby';
  driveMode?: 'throttle_only' | 'pas_only' | 'both';
  currentBatteryPercent?: number;
  controllerType?: string;
}

export interface SavedBike {
  id?: string;
  name: string;
  specs: BikeSpecs;
}

/**
 * User Profile model stored in /users/{uid}
 */
export interface UserProfile {
  uid: string;
  email?: string;
  username: string;
  usernameLowercase: string;
  profilePic?: string;
  role: 'rider' | 'fleet';
  isAdmin: boolean;
  isPro: boolean;
  isExploreTier?: boolean;
  isShopTier?: boolean;
  shopTierExpiresAt?: Timestamp;
  canHostGroupRide?: boolean;
  groupRideExpiresAt?: Timestamp;
  orgId?: string;
  orgName?: string;
  orgAddress?: string;
  orgLocation?: { lat: number; lng: number };
  ageAtSignup?: number;
  homeRegion?: string;
  birthday?: string;
  riderWeight?: number;
  phone?: string;
  bikes?: SavedBike[]; 
  activeRental?: {
    shopId: string;
    bikeId: string;
    unitId: string;
    rentedAt: string;
  } | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Social Post model stored in /posts/{postId}
 */
export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  authorIsAdmin?: boolean;
  imageUrl: string;
  caption: string;
  likes: string[];
  commentCount?: number;
  commentsEnabled?: boolean;
  createdAt: Timestamp;
  tripData?: any;
}

/**
 * Community model stored in /communities/{commId}
 */
export interface Community {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  creatorUsername?: string;
  memberCount: number;
  createdAt: Timestamp;
}

/**
 * Forum Thread model stored in /communities/{commId}/threads/{threadId}
 */
export interface Thread {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  authorIsAdmin?: boolean;
  title: string;
  body: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  score: number;
  commentCount: number;
  upvotedBy: string[];
  downvotedBy: string[];
  createdAt: Timestamp;
}

/**
 * Forum Comment model stored in /communities/{commId}/threads/{threadId}/comments/{commentId}
 */
export interface ForumComment {
  id: string;
  authorId: string;
  authorUsername: string;
  authorProfilePic?: string;
  authorIsAdmin?: boolean;
  text: string;
  parentId?: string | null;
  score: number;
  upvotedBy: string[];
  downvotedBy: string[];
  createdAt: Timestamp;
}

/**
 * Notification model stored in /users/{uid}/notifications/{notifId}
 */
export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'moderation' | 'fleet_alert' | 'rental_request' | 'upvote' | 'review' | 'rental_approved';
  fromId: string;
  fromName: string;
  senderUsername?: string;
  content?: string;
  text: string;
  linkId?: string;
  read: boolean;
  createdAt: Timestamp;
}

/**
 * Organization model stored in /organizations/{orgId}
 */
export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  bio?: string;
  address?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  phone?: string;
  email?: string;
  settings?: {
    rentalZoneRadius: number;
    lowBatteryAlertThreshold: number;
  };
  updatedAt?: string | Timestamp;
}

/**
 * Physical Bike Asset model stored in /organizations/{orgId}/bikes/{bikeId}
 */
export interface Bike {
  id: string;
  unitId: string;
  model?: string;
  specs: {
    voltage: number;
    capacityAh: number;
    motorWatts: number;
    bikeWeightLbs?: number;
    tirePSI?: number;
    tireType?: string;
    controllerType?: string;
    currentBatteryPercent: number;
    capacityUnit?: string;
    originalCapacityInput?: number;
    driveMode?: string;
    targetSpeedMph?: number;
    controllerAmps?: number | null;
    cycleCount?: number;
  };
  status: 'available' | 'rented' | 'maintenance' | 'lost' | 'charging';
  currentRentalId?: string | null;
  currentRiderId?: string | null;
  totalOdometer?: number;
  lastMaintenanceDate?: Timestamp;
  imageUrl?: string;
  rentedAt?: string;
}

/**
 * Live Telemetry model stored in /organizations/{orgId}/live_units/{riderUid}
 */
export interface LiveUnit {
  id: string;
  unitName: string;
  bikeId: string;
  riderName?: string;
  position: {
    lat: number;
    lng: number;
  };
  battery: number;
  batteryPercent?: number; // Legacy/Compat
  estRemainingRange?: number;
  milesRemaining?: number;
  currentSpeedMph?: number;
  speed?: number;
  elevationFt?: number;
  windMph?: number;
  status: string;
  lastSeen: number;
  lastUpdatedAt?: Timestamp;
  bmsData?: {
    voltage: number;
    temp: number;
  } | null;
}
