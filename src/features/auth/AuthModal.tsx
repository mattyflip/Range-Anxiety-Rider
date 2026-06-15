import React, { useState } from 'react'
import { auth, db } from '../../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import TermsOfService from '../legal/TermsOfService'
import PrivacyPolicy from '../legal/PrivacyPolicy'
import { US_STATES, OTHER_REGIONS, calculateAge, getEbikeSafetyInfo } from '../../utils/ebikeLaws'
import styles from './AuthModal.module.css'

interface AuthModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'login' | 'register';
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess, initialMode = 'login' }) => {
  const [isRegistering, setIsRegistering] = useState(initialMode === 'register');
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
  const [referralCode, setReferralCode] = useState('');
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
        }

        if (!agreedToToS) {
          setError("You must agree to the Terms of Service to create an account.");
          return;
        }

        let isValidReferralCode = false;
        let referralDocRef = null;
        let referralData = null;

        if (referralCode.trim()) {
          referralDocRef = doc(db, 'referral_codes', referralCode.trim());
          const referralSnap = await getDoc(referralDocRef);
          if (!referralSnap.exists()) {
            setError("Invalid referral code.");
            return;
          }
          referralData = referralSnap.data();
          if (referralData.expiresAt && referralData.expiresAt.toMillis() < Date.now()) {
            setError("This referral code has expired.");
            return;
          }
          if (referralData.currentUses >= referralData.maxUses) {
            setError("This referral code has reached its maximum number of uses.");
            return;
          }
          isValidReferralCode = true;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPass);
        const normalizedEmail = authEmail.trim().toLowerCase();
        
        const usernameQuery = query(collection(db, "users"), where("usernameLowercase", "==", username.toLowerCase().trim()));
        const usernameSnap = await getDocs(usernameQuery);
        
        let finalUsername = username.trim();
        let finalUsernameLowercase = finalUsername.toLowerCase();
        
        if (!usernameSnap.empty) {
          const suffix = Math.floor(1000 + Math.random() * 9000).toString();
          finalUsername = finalUsername + suffix;
          finalUsernameLowercase = finalUsername.toLowerCase();
          setMessage(`Requested username taken. Assigned: ${finalUsername}. You can change this in settings.`);
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
            isAdmin: false,
            isBetaTester: isValidReferralCode,
            createdAt: serverTimestamp(),
            uid: userCredential.user.uid
          });
          
          if (isValidReferralCode && referralDocRef && referralData) {
            try {
              await updateDoc(referralDocRef, {
                currentUses: referralData.currentUses + 1,
                usedBy: arrayUnion({ uid: userCredential.user.uid, email: normalizedEmail, usedAt: new Date().toISOString() })
              });
            } catch (e) {
              console.error("Failed to update referral code usage", e);
            }
          }
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
    <div className={styles.overlay}>
      <div className={`${styles.modal} noise-bg animate-fade-in`}>
        <h2 className={styles.title}>RANGE ANXIETY</h2>
        <div className={styles.subtitle}>{isRegistering ? 'SIGN UP' : 'SIGN IN'}</div>
        
        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.success}>{message}</div>}

        {isRegistering && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className={styles.label}>I am registering as a:</label>
              <div className={styles.roleToggle}>
                <button 
                  type="button"
                  onClick={() => setRole('rider')}
                  className={`${styles.roleBtn} ${role === 'rider' ? styles.roleBtnActive : ''}`}
                >
                  🚲 RIDER
                </button>
                <button 
                  type="button"
                  onClick={() => setRole('fleet')}
                  className={`${styles.roleBtn} ${role === 'fleet' ? styles.roleBtnActive : ''}`}
                >
                  🏬 SHOP OWNER
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Full Name</label>
              <input type="text" className={styles.input} value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Username</label>
              <input type="text" className={styles.input} value={username} onChange={e => setUsername(e.target.value.replace(/\s+/g, '_'))} placeholder="No spaces allowed" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Birthday</label>
              <input type="date" className={styles.input} value={birthday} onChange={e => setBirthday(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Home State / Region</label>
              <select className={styles.select} value={homeRegion} onChange={e => setHomeRegion(e.target.value)}>
                <optgroup label="US States">
                  {US_STATES.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </optgroup>
                <optgroup label="International">
                  {OTHER_REGIONS.map((r: string) => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>City (Optional)</label>
              <input type="text" className={styles.input} value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Beta Referral Code (Optional)</label>
              <input type="text" className={styles.input} value={referralCode} onChange={e => setReferralCode(e.target.value)} />
            </div>
          </>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>Email</label>
          <input type="email" className={styles.input} value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="user@domain.com" />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>Password</label>
          <input type="password" className={styles.input} value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••" />
        </div>
        
        {isRegistering && (
          <div className={styles.checkboxGroup}>
            <input 
              type="checkbox" 
              id="tos-check" 
              checked={agreedToToS} 
              onChange={e => setAgreedToToS(e.target.checked)} 
              className={styles.checkbox}
            />
            <label htmlFor="tos-check" className={styles.checkboxLabel}>
              I agree to the <button type="button" onClick={() => setShowToSPage(true)} className={styles.linkBtn}>Terms of Service</button>, <button type="button" onClick={() => setShowPrivacyPage(true)} className={styles.linkBtn}>Privacy Policy</button>, and to receive marketing updates.
            </label>
          </div>
        )}

        <button 
          className={styles.submitBtn} 
          onClick={handleAuth}
        >
          {isRegistering ? 'Register' : 'Login'}
        </button>
        
        <div className={styles.footerText}>
          {!isRegistering && (
            <button onClick={handleForgotPassword} className={styles.linkBtn} style={{ marginRight: '1rem' }}>
              forgot password?
            </button>
          )}
          {isRegistering ? 'already have an account? · ' : 'need an account? · '} 
          <button onClick={() => setIsRegistering(!isRegistering)} className={styles.linkBtn}>
            {isRegistering ? 'sign in' : 'create account'}
          </button>
        </div>
        
        <button onClick={onClose} className={styles.cancelBtn}>Cancel</button>
      </div>

      {showToSPage && <TermsOfService onClose={() => setShowToSPage(false)} />}
      {showPrivacyPage && <PrivacyPolicy onClose={() => setShowPrivacyPage(false)} />}
    </div>
  );
};

export default AuthModal;
