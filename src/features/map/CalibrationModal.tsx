import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import type { SavedBike, CalibrationLog, UserProfile } from '../../types';

interface CalibrationModalProps {
  user: any; // Firebase Auth User (has .uid and .getIdToken)
  userData: UserProfile | null;
  bike: SavedBike;
  predictedWh: number;
  distanceMiles: number;
  avgSpeedMph: number;
  startBattery: number;
  elevationGainFt: number;
  temperatureC: number;
  windSpeedMs: number;
  riderWeightLbs: number;
  stopCount: number;
  speedHistory: number[];
  orgId?: string;
  onClose: () => void;
  onComplete: (newFactor: number) => void;
}

const CalibrationModal: React.FC<CalibrationModalProps> = ({
  user,
  userData,
  bike,
  predictedWh,
  distanceMiles,
  avgSpeedMph,
  startBattery,
  elevationGainFt,
  temperatureC,
  windSpeedMs,
  riderWeightLbs,
  stopCount,
  speedHistory,
  orgId,
  onClose,
  onComplete
}) => {
  const [endBattery, setEndBattery] = useState<number>(Math.max(0, startBattery - 10));
  const [isSaving, setIsSaving] = useState(false);

  const calculateVariance = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  };

  const handleCalibrate = async () => {
    if (!user || !bike) return;
    setIsSaving(true);

    try {
      const voltage = Number(bike.specs.voltage) || 48;
      const capacityAh = Number(bike.specs.capacityAh) || 15;
      const totalWh = voltage * capacityAh;

      const batteryUsedPct = startBattery - endBattery;
      const actualWh = (batteryUsedPct / 100) * totalWh;

      const safePredictedWh = Math.max(1, predictedWh);
      const tripMultiplier = actualWh / safePredictedWh;

      const currentFactor = bike.specs.calibrationFactor || 1.0;
      const newFactor = (currentFactor * 0.8) + (tripMultiplier * 0.2);

      // (Predicted - Actual) / Actual * 100
      const errorPct = ((safePredictedWh - actualWh) / Math.max(1, actualWh)) * 100;

      // 1. Update the Bike in the user's bikes array (Personal Garage)
      const userRef = doc(db, 'users', user.uid);
      const updatedBikes = (userData?.bikes || []).map((b: SavedBike) => {
        if (b.id === bike.id || b.name === bike.name) {
          return {
            ...b,
            specs: { ...b.specs, calibrationFactor: newFactor }
          };
        }
        return b;
      });

      await updateDoc(userRef, { bikes: updatedBikes });

      // --- FLEET SYNC (B2B Requirement) ---
      if (orgId && bike.id) {
        try {
          const orgBikeRef = doc(db, `organizations/${orgId}/bikes`, bike.id);
          await updateDoc(orgBikeRef, {
            'specs.calibrationFactor': newFactor,
            'lastCalibrationError': errorPct,
            'lastCalibrationAt': new Date().toISOString()
          });

          // Maintenance Alert: If error is > 20%, suggest service
          if (Math.abs(errorPct) > 20) {
            await addDoc(collection(db, `organizations/${orgId}/alerts`), {
              type: 'maintenance_suggestion',
              bikeId: bike.id,
              unitId: (bike as any).unitId || bike.name,
              message: `Abnormal energy consumption detected (${errorPct.toFixed(1)}% error). Suggest mechanical inspection.`,
              severity: 'medium',
              createdAt: new Date().toISOString(),
              status: 'new'
            });
          }
        } catch (err) {
          console.error('Fleet sync failed:', err);
        }
      }

      // 2. Log the calibration event strictly following requested schema
      const logEntry: CalibrationLog = {
        ride_id: crypto.randomUUID(),
        bikeId: bike.id || bike.name,
        orgId: orgId || null,
        timestamp: new Date().toISOString(),
        prediction_error_pct: Number(errorPct.toFixed(2)),
        model_version: 'v1.2.0',
        motor_model: bike.specs.motorModel || 'Generic_Hub',
        assist_level: bike.specs.pasSensorType || 'pas_3',
        terrain: elevationGainFt > 100 ? 'hilly' : 'flat',
        temperature_c: temperatureC,
        avg_speed_kmh: Number((avgSpeedMph * 1.60934).toFixed(1)),
        elevation_gain_m: Number((elevationGainFt * 0.3048).toFixed(0)),
        distance_km: Number((distanceMiles * 1.60934).toFixed(1)),
        battery_soc_before: startBattery,
        battery_soc_after: endBattery,
        tire_pressure_psi: Number(bike.specs.tirePSI) || 40,
        rider_weight_kg: Number((riderWeightLbs / 2.20462).toFixed(0)),
        wind_speed_ms: windSpeedMs,
        actual_stops_per_km: Number((stopCount / Math.max(0.1, distanceMiles * 1.60934)).toFixed(2)),
        speed_variance: Number(calculateVariance(speedHistory).toFixed(2))
      };

      await addDoc(collection(db, `users/${user.uid}/calibration_logs`), logEntry);

      // --- ON-DEVICE PERSISTENCE BACKUP ---
      try {
        const localHistory = JSON.parse(localStorage.getItem('ebike-ride-history') || '[]');
        localHistory.push(logEntry);
        localStorage.setItem('ebike-ride-history', JSON.stringify(localHistory.slice(-50)));
      } catch (e) {
        console.error('Failed to save local ride history backup:', e);
      }

      // 3. Trigger Layer 3 Multi-Dimensional Fit
      try {
        const idToken = await user.getIdToken();
        const fitRes = await fetch('/api/fit-calibration-model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ 
            bikeId: bike.id || bike.name,
            orgId: orgId || null
          })
        });
        
        if (fitRes.ok) {
          const factors = await fitRes.json();
          if (factors.trained_on_n_rides >= 5) {
            onComplete(newFactor);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to trigger Layer 3 model fit:', err);
      }

      onComplete(newFactor);
    } catch (error) {
      console.error('Calibration failed:', error);
      alert('Failed to save calibration data.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 15000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #ff6600', borderRadius: '24px', padding: '2rem', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎓</div>
        <h2 style={{ color: '#ff6600', fontSize: '1.4rem', marginBottom: '0.5rem' }}>Ride Complete!</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Help Watt-Son learn your bike's actual efficiency.</p>
        
        <div style={{ background: '#222', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', textAlign: 'left' }}>
          <label style={{ color: '#888', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 900 }}>Ending Battery %</label>
          <input 
            type="number" 
            value={endBattery} 
            onChange={(e) => setEndBattery(Math.min(startBattery, Math.max(0, parseFloat(e.target.value) || 0)))}
            style={{ width: '100%', padding: '1rem', background: '#111', border: '1px solid #333', borderRadius: '12px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem', textAlign: 'center' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.7rem' }}>
            <span style={{ color: '#666' }}>Started at: {startBattery}%</span>
            <span style={{ color: '#ff6600' }}>Used: {startBattery - endBattery}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <button 
            onClick={handleCalibrate} 
            disabled={isSaving}
            style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', opacity: isSaving ? 0.5 : 1 }}
          >
            {isSaving ? 'Calibrating...' : 'Update Engine'}
          </button>
          <button 
            onClick={onClose} 
            disabled={isSaving}
            style={{ width: '100%', padding: '0.8rem', background: 'none', color: '#888', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Skip Calibration
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationModal;
