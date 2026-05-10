export interface EbikeLaw {
  minAge: number;
  helmetRequired: boolean;
  licenseRequired: boolean;
  notes?: string;
}

// Data for US States and some international regions
// Defaulting to most common laws (16+ for Class 3 is common in the US)
export const EBIKE_LAWS: Record<string, EbikeLaw> = {
  "Alabama": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Alaska": { minAge: 14, helmetRequired: true, licenseRequired: false },
  "Arizona": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Arkansas": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "California": { minAge: 16, helmetRequired: true, licenseRequired: false }, // Class 3
  "Colorado": { minAge: 16, helmetRequired: true, licenseRequired: false }, // Class 3
  "Connecticut": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Delaware": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Florida": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Georgia": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Hawaii": { minAge: 15, helmetRequired: true, licenseRequired: false },
  "Idaho": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Illinois": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Indiana": { minAge: 15, helmetRequired: true, licenseRequired: false },
  "Iowa": { minAge: 14, helmetRequired: false, licenseRequired: false },
  "Kansas": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Kentucky": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Louisiana": { minAge: 15, helmetRequired: true, licenseRequired: false },
  "Maine": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Maryland": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Massachusetts": { minAge: 16, helmetRequired: true, licenseRequired: true },
  "Michigan": { minAge: 14, helmetRequired: true, licenseRequired: false },
  "Minnesota": { minAge: 15, helmetRequired: true, licenseRequired: false },
  "Mississippi": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Missouri": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Montana": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Nebraska": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Nevada": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "New Hampshire": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "New Jersey": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "New Mexico": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "New York": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "North Carolina": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "North Dakota": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Ohio": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Oklahoma": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Oregon": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Pennsylvania": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Rhode Island": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "South Carolina": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "South Dakota": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Tennessee": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Texas": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Utah": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Vermont": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Virginia": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Washington": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "West Virginia": { minAge: 16, helmetRequired: true, licenseRequired: false },
  "Wisconsin": { minAge: 16, helmetRequired: false, licenseRequired: false },
  "Wyoming": { minAge: 16, helmetRequired: false, licenseRequired: false },
  // International
  "United Kingdom": { minAge: 14, helmetRequired: false, licenseRequired: false },
  "European Union": { minAge: 14, helmetRequired: false, licenseRequired: false },
};

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", 
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", 
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", 
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", 
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

export const OTHER_REGIONS = [
  "United Kingdom", "European Union", "Canada", "Australia", "Other"
];

export const STATE_COORDINATES: Record<string, { lat: number, lng: number }> = {
  "Alabama": { lat: 32.3182, lng: -86.9023 },
  "Alaska": { lat: 63.5888, lng: -154.4931 },
  "Arizona": { lat: 34.0489, lng: -111.0937 },
  "Arkansas": { lat: 35.2010, lng: -91.8318 },
  "California": { lat: 36.7783, lng: -119.4179 },
  "Colorado": { lat: 39.5501, lng: -105.7821 },
  "Connecticut": { lat: 41.6032, lng: -73.0877 },
  "Delaware": { lat: 38.9108, lng: -75.5277 },
  "Florida": { lat: 27.6648, lng: -81.5158 },
  "Georgia": { lat: 32.1656, lng: -82.9001 },
  "Hawaii": { lat: 19.8968, lng: -155.5828 },
  "Idaho": { lat: 44.0682, lng: -114.7420 },
  "Illinois": { lat: 40.6331, lng: -89.3985 },
  "Indiana": { lat: 40.2672, lng: -86.1349 },
  "Iowa": { lat: 41.8780, lng: -93.0977 },
  "Kansas": { lat: 38.5266, lng: -96.7265 },
  "Kentucky": { lat: 37.8393, lng: -84.2700 },
  "Louisiana": { lat: 30.9843, lng: -91.9623 },
  "Maine": { lat: 45.2538, lng: -69.4455 },
  "Maryland": { lat: 39.0458, lng: -76.6413 },
  "Massachusetts": { lat: 42.4072, lng: -71.3824 },
  "Michigan": { lat: 44.3148, lng: -85.6024 },
  "Minnesota": { lat: 46.7296, lng: -94.6859 },
  "Mississippi": { lat: 32.7416, lng: -89.6787 },
  "Missouri": { lat: 38.5739, lng: -92.2280 },
  "Montana": { lat: 46.8797, lng: -110.3626 },
  "Nebraska": { lat: 41.4925, lng: -99.9018 },
  "Nevada": { lat: 38.8026, lng: -116.4194 },
  "New Hampshire": { lat: 43.1939, lng: -71.5724 },
  "New Jersey": { lat: 40.0583, lng: -74.4057 },
  "New Mexico": { lat: 34.5199, lng: -105.8701 },
  "New York": { lat: 40.7128, lng: -74.0060 },
  "North Carolina": { lat: 35.7596, lng: -79.0193 },
  "North Dakota": { lat: 47.5515, lng: -101.0020 },
  "Ohio": { lat: 40.4173, lng: -82.9071 },
  "Oklahoma": { lat: 35.0078, lng: -97.0929 },
  "Oregon": { lat: 43.8041, lng: -120.5542 },
  "Pennsylvania": { lat: 41.2033, lng: -77.1945 },
  "Rhode Island": { lat: 41.5801, lng: -71.4774 },
  "South Carolina": { lat: 33.8361, lng: -81.1637 },
  "South Dakota": { lat: 44.2998, lng: -99.4388 },
  "Tennessee": { lat: 35.5175, lng: -86.5804 },
  "Texas": { lat: 31.9686, lng: -99.9018 },
  "Utah": { lat: 39.3210, lng: -111.0937 },
  "Vermont": { lat: 44.5588, lng: -72.5778 },
  "Virginia": { lat: 37.4316, lng: -78.6569 },
  "Washington": { lat: 47.7511, lng: -120.7401 },
  "West Virginia": { lat: 38.5976, lng: -80.4549 },
  "Wisconsin": { lat: 43.7844, lng: -88.7879 },
  "Wyoming": { lat: 42.7560, lng: -107.3025 },
};

export function calculateAge(birthday: string): number {
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function getEbikeSafetyInfo(region: string, age: number) {
  const law = EBIKE_LAWS[region];
  if (!law) return null;

  const isLegal = age >= law.minAge;
  return {
    ...law,
    isLegal,
    ageDiff: law.minAge - age
  };
}
