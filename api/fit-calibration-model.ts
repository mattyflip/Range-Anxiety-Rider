import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import MLR from 'ml-regression-multivariate-linear';
import { setCorsHeaders } from './_cors.js';

interface MLRInstance {
  weights: number[][];
  intercept: number[];
  predict(x: number[][]): number[][];
}

const serviceAccount: ServiceAccount = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1'),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const auth = getAuth();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (setCorsHeaders(req, res)) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const { bikeId, orgId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!bikeId) {
      return res.status(400).json({ error: 'MISSING_BIKE_ID' });
    }

    // 1. Fetch Logs
    // Fetch ALL logs in the subcollection for this user
    const allLogsSnap = await db.collection(`users/${uid}/calibration_logs`).get();
    const logs = allLogsSnap.docs.map(doc => doc.data());
    
    if (logs.length < 5) {
      return res.status(200).json({ message: 'NOT_ENOUGH_DATA', count: logs.length });
    }

    // 2. Prepare Data
    const X: number[][] = [];
    const y: number[][] = [];
    const errors: number[] = [];
    const motorErrors: Record<string, number[]> = {};

    const assistMap: Record<string, number> = {
      'eco': 1, 'normal': 2, 'sport': 3, 'turbo': 4,
      'pas_1': 1, 'pas_2': 2, 'pas_3': 3, 'pas_4': 4, 'pas_5': 5,
      'standard': 2
    };

    for (const log of logs) {
      const err = log.prediction_error_pct / 100;
      errors.push(err);

      // Group by motor
      if (log.motor_model) {
        if (!motorErrors[log.motor_model]) motorErrors[log.motor_model] = [];
        motorErrors[log.motor_model].push(err);
      }

      // Regression features
      const assistNum = assistMap[log.assist_level] || 2;
      const hilliness = log.distance_km > 0 ? (log.elevation_gain_m / (log.distance_km * 1000)) : 0;
      
      X.push([
        assistNum,
        hilliness,
        log.temperature_c || 20,
        log.avg_speed_kmh || 20,
        log.actual_stops_per_km || 0,
        log.speed_variance || 0
      ]);
      y.push([err]);
    }

    // 3. Calculations
    const global_correction = 1 - (errors.reduce((a, b) => a + b, 0) / errors.length);
    
    const motor_corrections: Record<string, number> = {};
    for (const [motor, errs] of Object.entries(motorErrors)) {
      motor_corrections[motor] = 1 - (errs.reduce((a, b) => a + b, 0) / errs.length);
    }

    let multidim_model = null;
    let r_squared = 0;
    let confidence_interval_pct = 25; // Default high uncertainty

    if (logs.length >= 5) {
      confidence_interval_pct = 15; // Moderate confidence
      try {
        const regression = new MLR(X, y) as unknown as MLRInstance;
        
        multidim_model = {
          weights: regression.weights.map((w: number[]) => w[0]),
          intercept: regression.intercept[0]
        };
        
        const yPred = regression.predict(X);
        const yMean = y.reduce((a, b) => a + b[0], 0) / y.length;
        const ssRes = y.reduce((acc, val, i) => acc + Math.pow(val[0] - yPred[i][0], 2), 0);
        const ssTot = y.reduce((acc, val) => acc + Math.pow(val[0] - yMean, 2), 0);
        r_squared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
        
        // Dynamic Confidence Interval based on R2 and N
        if (logs.length >= 20) {
          // If R2 is 0.8, uncertainty is roughly 10%
          confidence_interval_pct = Math.max(8, Math.round((1 - r_squared) * 50));
        }
      } catch (e) {
        console.error('Regression error:', e);
      }
    }

    const correctionFactors = {
      global_correction,
      motor_corrections,
      multidim_model,
      r_squared,
      trained_on_n_rides: logs.length,
      model_version: 'v1.2.0',
      confidence_interval_pct
    };

    // 4. Update Bike Profile
    const userSnap = await db.doc(`users/${uid}`).get();
    if (userSnap.exists) {
      const userData = userSnap.data();
      const updatedBikes = (userData?.bikes || []).map((b: any) => {
        if (b.id === bikeId || b.name === bikeId) {
          return {
            ...b,
            specs: {
              ...b.specs,
              correctionFactors
            }
          };
        }
        return b;
      });
      await db.doc(`users/${uid}`).update({ bikes: updatedBikes });
    }

    // --- FLEET SYNC (B2B Requirement) ---
    if (orgId && bikeId) {
      try {
        const orgBikeRef = db.doc(`organizations/${orgId}/bikes/${bikeId}`);
        const orgBikeSnap = await orgBikeRef.get();
        if (orgBikeSnap.exists) {
          await orgBikeRef.update({
            'specs.correctionFactors': correctionFactors,
            'lastModelFitAt': new Date().toISOString()
          });
        }
      } catch (e) {
        console.error('Fleet model sync failed:', e);
      }
    }

    // --- GLOBAL AGGREGATION (Hybrid Strategy) ---
    // If the model is high quality (R2 > 0.7) and we have enough data, 
    // contribute an anonymized version to the global motor profile.
    if (multidim_model && r_squared > 0.7 && logs.length >= 10 && logs[0].motor_model) {
      try {
        const motorId = logs[0].motor_model.replace(/\s+/g, '_');
        await db.collection('global_models').doc(motorId).set({
          motor_model: logs[0].motor_model,
          weights: multidim_model.weights,
          intercept: multidim_model.intercept,
          avg_r_squared: r_squared,
          contributions: (await db.doc(`global_models/${motorId}`).get()).data()?.contributions + 1 || 1,
          updated_at: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.error('Global model update failed:', e);
      }
    }

    return res.status(200).json(correctionFactors);

  } catch (error: any) {
    console.error('Fit Model Error:', error);
    return res.status(500).json({ error: 'FIT_ERROR', message: error.message });
  }
}
