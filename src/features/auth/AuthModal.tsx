import React, { useState } from 'react'
import { auth, db } from '../../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore'
import TermsOfService from '../legal/TermsOfService'
import PrivacyPolicy from '../legal/PrivacyPolicy'
import { US_STATES, OTHER_REGIONS, calculateAge, getEbikeSafetyInfo } from '../../utils/ebikeLaws'

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthday, setBirthday] = useState('');
  const [homeRegion, setHomeRegion] = useState('New Jersey');
  const [city, setCity] = useState('');
  const [role, setRole] = useState<'rider' | 'fleet'>('rider');
  const [agreedToToS, setAgreedToToS] = useState(false);
  const [showToSPage, setShowToSPage] = useState(false);
  const [showPrivacyPage, setShowPrivacyPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!authEmail) {
      setError("Please enter your email address first.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setMessage("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      console.error("Reset password error:", err);
      setError(err.message);
    }
  };

  const handleAuth = async () => {
    setError(null);
    try {
      if (isRegistering) {
        if (!fullName.trim() || !username.trim() || !birthday || !homeRegion) {
          setError("Name, Username, Birthday, and Home State/Region are required.");
          return;
        }



        const age = calculateAge(birthday);
        const safetyInfo = getEbikeSafetyInfo(homeRegion, age);

        if (safetyInfo && !safetyInfo.isLegal) {
          setError(`Warning: Based on your age (${age}) and location (${homeRegion}), you do not meet the minimum age requirement (${safetyInfo.minAge}) for electric bike operation in this region.`);
          // We'll allow registration but show a stern warning. If you want to BLOCK them, uncomment the return.
          // return;
        }

        if (!agreedToToS) {
          setError("You must agree to the Terms of Service to create an account.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPass);
        const normalizedEmail = authEmail.trim().toLowerCase();
        
        // Now that the user is authenticated, we can securely check if the username is taken
        const usernameQuery = query(collection(db, "users"), where("usernameLowercase", "==", username.toLowerCase().trim()));
        const usernameSnap = await getDocs(usernameQuery);
        
        let finalUsername = username.trim();
        let finalUsernameLowercase = finalUsername.toLowerCase();
        
        if (!usernameSnap.empty) {
          const suffix = Math.floor(1000 + Math.random() * 9000).toString();
          finalUsername = finalUsername + suffix;
          finalUsernameLowercase = finalUsername.toLowerCase();
          alert(`Your requested username was taken. You have been assigned: ${finalUsername}. You can change this in settings later.`);
        }
        
        try {
          await setDoc(doc(db, "users", userCredential.user.uid), { 
            email: normalizedEmail, 
            fullName,
            username: finalUsername,
            usernameLowercase: finalUsernameLowercase,
            birthday,
            homeRegion,
            city,
            role,
            ageAtSignup: age,
            isPro: false, 
            createdAt: serverTimestamp(),
            uid: userCredential.user.uid
          });
        } catch (e: any) { 
          console.error("User profile creation failed:", e);
          throw new Error("Failed to create user profile: " + e.message);
        }

        try {
          await setDoc(doc(db, "marketing_emails", userCredential.user.uid), {
            email: normalizedEmail,
            subscribedAt: serverTimestamp(),
            source: "account_creation"
          });
        } catch (e) { 
          console.error("Marketing email log failed (non-critical):", e); 
        }
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPass);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) { 
      console.error("Auth error:", err); 
      setError(err.message); 
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '1rem', overflowY: 'auto' }}>
      <div className="card" style={{ width: '400px', background: '#1e1e1e', padding: '2rem', borderRadius: '12px', border: '1px solid #333', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ color: '#ff6600', marginBottom: '1.5rem', textAlign: 'center' }}>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
        
        {error && <div style={{ color: '#ff4444', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', background: 'rgba(255,68,68,0.1)', padding: '0.5rem', borderRadius: '4px' }}>{error}</div>}
        {message && <div style={{ color: '#34a853', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', background: 'rgba(52,168,83,0.1)', padding: '0.5rem', borderRadius: '4px' }}>{message}</div>}

        {isRegistering && (
          <>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#ff6600', fontSize: '0.75rem', marginBottom: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase' }}>I am registering as a:</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button"
                  onClick={() => setRole('rider')}
                  style={{ 
                    flex: 1, padding: '0.8rem', borderRadius: '8px', border: `1px solid ${role === 'rider' ? '#ff6600' : '#333'}`,
                    background: role === 'rider' ? 'rgba(255,102,0,0.1)' : '#222', color: role === 'rider' ? '#ff6600' : '#888',
                    fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  🚲 RIDER
                </button>
                <button 
                  type="button"
                  onClick={() => setRole('fleet')}
                  style={{ 
                    flex: 1, padding: '0.8rem', borderRadius: '8px', border: `1px solid ${role === 'fleet' ? '#ff6600' : '#333'}`,
                    background: role === 'fleet' ? 'rgba(255,102,0,0.1)' : '#222', color: role === 'fleet' ? '#ff6600' : '#888',
                    fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  🏬 SHOP OWNER
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value.replace(/\s+/g, '_'))} placeholder="No spaces allowed" style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Birthday</label>
              <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Home State / Region</label>
              <select value={homeRegion} onChange={e => setHomeRegion(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }}>
                <optgroup label="US States">
                  {US_STATES.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </optgroup>
                <optgroup label="International">
                  {OTHER_REGIONS.map((r: string) => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>City (Optional)</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
            </div>
          </>
        )}

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Email</label>
          <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
        </div>
        
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Password</label>
          <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white' }} />
        </div>
        
        {isRegistering && (
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '1rem', marginBottom: '1rem' }}>
            <input 
              type="checkbox" 
              id="tos-check" 
              checked={agreedToToS} 
              onChange={e => setAgreedToToS(e.target.checked)} 
              style={{ width: 'auto', marginTop: '4px' }}
            />
            <label htmlFor="tos-check" style={{ fontSize: '0.75rem', textTransform: 'none', lineHeight: '1.4', color: '#ccc' }}>
              I agree to the <button type="button" onClick={() => setShowToSPage(true)} style={{ background: 'none', border: 'none', color: '#ff6600', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}>Terms of Service</button>, <button type="button" onClick={() => setShowPrivacyPage(true)} style={{ background: 'none', border: 'none', color: '#ff6600', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}>Privacy Policy</button>, and to receive marketing updates.
            </label>
          </div>
        )}

        <button 
          className="calculate-btn" 
          style={{ width: '100%', padding: '0.8rem', marginTop: '1rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }} 
          onClick={handleAuth}
        >
          {isRegistering ? 'Register' : 'Login'}
        </button>
        
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
          {!isRegistering && (
            <button onClick={handleForgotPassword} style={{ background: 'none', border: 'none', color: '#ff6600', cursor: 'pointer', textDecoration: 'underline', marginRight: '1rem' }}>
              Forgot Password?
            </button>
          )}
          {isRegistering ? 'Already have an account?' : 'Need an account?'} 
          <button onClick={() => setIsRegistering(!isRegistering)} style={{ background: 'none', border: 'none', color: '#ff6600', cursor: 'pointer', textDecoration: 'underline', marginLeft: '0.3rem' }}>
            {isRegistering ? 'Sign In' : 'Register Now'}
          </button>
        </p>
        
        <button onClick={onClose} style={{ width: '100%', marginTop: '1.5rem', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
      </div>

      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
      {showPrivacyPage && <PrivacyPolicy onClose={() => setShowPrivacyPage(false)} />}
    </div>
  );
};

export default AuthModal;

