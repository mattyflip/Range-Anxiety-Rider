import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, where, updateDoc, doc, setDoc, deleteDoc, Timestamp, serverTimestamp, collectionGroup } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import NavBar from '../shared/ui/NavBar';
import SEO from '../shared/ui/SEO';
import AuthModal from '../features/auth/AuthModal';
import { useUserData } from '../hooks/useUserData';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

// Data types based on firestore rules

interface LiveUnitData {
  id: string;
  speed: number;
  battery: number;
}

interface ActiveGroupRide {
  id: string;
  name: string;
  leaderId: string;
  status: string;
  [key: string]: any;
}

interface ReferralCodeData {
  id: string;
  maxUses: number;
  currentUses: number;
  expiresAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  usedBy: Array<{ uid: string; email: string; usedAt: string }>;
}

const COLORS = ['#ff6600', '#ff9900', '#00C49F', '#FFBB28', '#FF8042'];

const AdminAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, loading: authLoading } = useUserData();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const handleShowAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('7D');
  const [rawUsers, setRawUsers] = useState<any[]>([]);

  // Metrics state
  const [totalUsers, setTotalUsers] = useState(0);
  const [proUsers, setProUsers] = useState(0);
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [activeRentals, setActiveRentals] = useState(0);
  const [liveUnits, setLiveUnits] = useState<LiveUnitData[]>([]);
  const [activeGroupRides, setActiveGroupRides] = useState<ActiveGroupRide[]>([]);
  const [endingRides, setEndingRides] = useState<Set<string>>(new Set());
  
  const [referralCodes, setReferralCodes] = useState<ReferralCodeData[]>([]);
  const [newCodeMaxUses, setNewCodeMaxUses] = useState(10);
  const [newCodeExpiresInDays, setNewCodeExpiresInDays] = useState(7);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const userGrowthData = React.useMemo(() => {
    if (!rawUsers.length) return [];
    
    const sorted = rawUsers
      .map(u => {
        let d = new Date();
        if (u.createdAt?.toDate) d = u.createdAt.toDate();
        else if (typeof u.createdAt === 'string' || typeof u.createdAt === 'number') d = new Date(u.createdAt);
        return { date: d };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    let startDate = new Date(0);
    
    if (timeframe === 'Today') startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (timeframe === '7D') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeframe === '30D') startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let baseCount = sorted.filter(u => u.date < startDate).length;
    const filtered = sorted.filter(u => u.date >= startDate);

    const grouped = new Map<string, number>();
    
    filtered.forEach(u => {
      let key = '';
      if (timeframe === 'Today') {
        key = u.date.toLocaleTimeString([], { hour: '2-digit', hour12: true });
      } else if (timeframe === 'All Time') {
        key = u.date.toLocaleDateString([], { month: 'short', year: 'numeric' });
      } else {
        key = u.date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    const result = [];
    let currentTotal = baseCount;
    
    const keys = Array.from(new Set(filtered.map(u => {
      if (timeframe === 'Today') return u.date.toLocaleTimeString([], { hour: '2-digit', hour12: true });
      if (timeframe === 'All Time') return u.date.toLocaleDateString([], { month: 'short', year: 'numeric' });
      return u.date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    })));

    if (keys.length === 0) {
        result.push({ name: 'Now', users: baseCount });
    }

    for (const key of keys) {
      currentTotal += grouped.get(key) || 0;
      result.push({ name: key, users: currentTotal });
    }

    return result;
  }, [rawUsers, timeframe]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !userData?.isAdmin) {
      navigate('/map');
      return;
    }

    // Fetch live users
    const usersUnsub = onSnapshot(query(collection(db, 'users')), (snap) => {
      setTotalUsers(snap.size);
      let proCount = 0;
      const users: any[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.isPro || data.isExploreTier) proCount++;
        users.push(data);
      });
      setProUsers(proCount);
      setRawUsers(users);
    });

    // Fetch live orgs
    const orgsUnsub = onSnapshot(query(collection(db, 'organizations')), (snap) => {
      setTotalOrgs(snap.size);
    });

    // Fetch live units via collectionGroup
    const liveUnitsUnsub = onSnapshot(collectionGroup(db, 'live_units'), (snap) => {
      const units: LiveUnitData[] = [];
      snap.forEach(d => {
        units.push({ id: d.id, ...d.data() } as LiveUnitData);
      });
      setLiveUnits(units);
      setActiveRentals(units.length);
      setLoading(false);
    }, (err) => {
      console.error("Live units collectionGroup failed. Ensure index is created.", err);
      // Fallback if index missing
      setLoading(false);
    });

    // Fetch active group rides
    const groupRidesUnsub = onSnapshot(query(collection(db, 'group_rides'), where('status', '==', 'active')), (snap) => {
      const rides: ActiveGroupRide[] = [];
      snap.forEach(d => {
        const data = d.data();
        rides.push({ id: d.id, name: data.name, leaderId: data.leaderId, status: data.status, ...data });
      });
      setActiveGroupRides(rides);
    });

    // Fetch referral codes
    const codesUnsub = onSnapshot(query(collection(db, 'referral_codes')), (snap) => {
      const codes: ReferralCodeData[] = [];
      snap.forEach(d => {
        codes.push({ id: d.id, ...d.data() } as ReferralCodeData);
      });
      setReferralCodes(codes);
    });

    return () => {
      usersUnsub();
      orgsUnsub();
      groupRidesUnsub();
      codesUnsub();
      liveUnitsUnsub();
    };
  }, [user, userData, authLoading, navigate]);


  if (authLoading || loading) return <div style={{ minHeight: '100vh', background: '#121212', color: '#ff6600', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Initializing Command Center...</div>;

  const batteryDistribution = [
    { name: 'High (>70%)', value: liveUnits.filter(u => u.battery >= 70).length },
    { name: 'Medium (30-70%)', value: liveUnits.filter(u => u.battery >= 30 && u.battery < 70).length },
    { name: 'Low (<30%)', value: liveUnits.filter(u => u.battery < 30).length },
  ];

  const handleEndGroupRide = async (rideId: string) => {
    if (window.confirm('Are you sure you want to force end this active group ride?')) {
      setEndingRides(prev => new Set(prev).add(rideId));
      try {
        await updateDoc(doc(db, 'group_rides', rideId), { status: 'completed' });
      } catch (err) {
        console.error('Failed to end group ride', err);
        alert('Failed to end group ride. Please try again.');
      } finally {
        setEndingRides(prev => {
          const newSet = new Set(prev);
          newSet.delete(rideId);
          return newSet;
        });
      }
    }
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const codeStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + newCodeExpiresInDays);

      await setDoc(doc(db, 'referral_codes', codeStr), {
        maxUses: newCodeMaxUses,
        currentUses: 0,
        expiresAt: Timestamp.fromDate(expirationDate),
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        usedBy: []
      });
    } catch (e: any) {
      console.error("Failed to generate code:", e);
      alert("Failed to generate code: " + e.message);
    } finally {
      setIsGeneratingCode(false);
    }
  };
  
  const handleDeleteCode = async (codeId: string) => {
    if (window.confirm(`Are you sure you want to delete referral code ${codeId}?`)) {
      try {
        await deleteDoc(doc(db, 'referral_codes', codeId));
      } catch (e) {
        console.error("Failed to delete code:", e);
      }
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO title="Command Center | Admin" />
      <NavBar user={user} onShowInstall={() => {}} onShowAuth={handleShowAuth} />

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#ff6600', textTransform: 'uppercase' }}>Command Center</h1>
            <p style={{ color: '#888', fontWeight: 'bold' }}>Global Analytics & System Health Overview</p>
          </div>
          <div style={{ background: '#1a1a1a', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>Timeframe:</span>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              style={{ background: '#222', color: 'white', border: '1px solid #444', borderRadius: '8px', padding: '0.5rem', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              <option value="Today">Today</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
              <option value="All Time">All Time</option>
            </select>
          </div>
        </header>

        {/* Top KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <div style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Total Users</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white' }}>{totalUsers}</div>
            <div style={{ color: '#00C49F', fontSize: '0.8rem', fontWeight: 'bold' }}>↑ 12% this week</div>
          </div>
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <div style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Pro Conversions</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#ff9900' }}>{proUsers}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>{totalUsers > 0 ? ((proUsers/totalUsers)*100).toFixed(1) : 0}% of userbase</div>
          </div>
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <div style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Active Fleets</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white' }}>{totalOrgs}</div>
          </div>
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <div style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Live Rentals Global</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00C49F' }}>{activeRentals}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Currently on the road</div>
          </div>
        </div>

        {/* Active Group Rides */}
        {activeGroupRides.length > 0 && (
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333', marginBottom: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#ff6600' }}>Active Group Rides</h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {activeGroupRides.map(ride => (
                <div key={ride.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '1rem', borderRadius: '12px', border: '1px solid #444' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 900, fontSize: '1.1rem' }}>{ride.name || 'Unnamed Ride'}</div>
                    <div style={{ color: '#888', fontSize: '0.8rem' }}>Host ID: {ride.leaderId}</div>
                  </div>
                  <button 
                    onClick={() => handleEndGroupRide(ride.id)}
                    disabled={endingRides.has(ride.id)}
                    style={{ 
                      background: endingRides.has(ride.id) ? '#888' : '#ff4444', 
                      color: 'white', 
                      border: 'none', 
                      padding: '0.6rem 1.2rem', 
                      borderRadius: '8px', 
                      fontWeight: 'bold', 
                      cursor: endingRides.has(ride.id) ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    {endingRides.has(ride.id) ? 'Ending...' : 'Force End Ride'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Beta Referral Codes */}
        <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#ff6600' }}>Beta Referral Codes</h3>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Max Uses</label>
              <input type="number" min="1" value={newCodeMaxUses} onChange={e => setNewCodeMaxUses(Number(e.target.value))} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Expires In (Days)</label>
              <input type="number" min="1" value={newCodeExpiresInDays} onChange={e => setNewCodeExpiresInDays(Number(e.target.value))} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: 'white' }} />
            </div>
            <button 
              onClick={handleGenerateCode} 
              disabled={isGeneratingCode}
              style={{ background: '#ff6600', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: isGeneratingCode ? 'not-allowed' : 'pointer', height: '40px' }}
            >
              {isGeneratingCode ? 'Generating...' : 'Generate New Code'}
            </button>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {referralCodes.length === 0 ? (
              <div style={{ color: '#888', fontSize: '0.9rem' }}>No referral codes generated yet.</div>
            ) : (
              referralCodes.map(code => (
                <div key={code.id} style={{ background: '#222', padding: '1rem', borderRadius: '12px', border: '1px solid #444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'white', fontWeight: 900, fontSize: '1.2rem', letterSpacing: '2px' }}>{code.id}</div>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                        Uses: <span style={{ color: code.currentUses >= code.maxUses ? '#ff4444' : '#00C49F' }}>{code.currentUses}</span> / {code.maxUses}
                        <span style={{ margin: '0 0.5rem' }}>|</span>
                        Expires: {code.expiresAt ? new Date(code.expiresAt.toMillis()).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => setExpandedCode(expandedCode === code.id ? null : code.id)}
                        style={{ background: '#333', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        {expandedCode === code.id ? 'Hide Users' : `View Users (${code.usedBy?.length || 0})`}
                      </button>
                      <button 
                        onClick={() => handleDeleteCode(code.id)}
                        style={{ background: 'rgba(255,68,68,0.2)', color: '#ff4444', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {expandedCode === code.id && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #333' }}>
                      {(!code.usedBy || code.usedBy.length === 0) ? (
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>No users have used this code yet.</div>
                      ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {code.usedBy.map((u, i) => (
                            <li key={i} style={{ color: '#ccc', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{u.email}</span>
                              <span style={{ color: '#888' }}>{new Date(u.usedAt).toLocaleDateString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Charts Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
          
          {/* User Growth Line Chart */}
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#ff6600' }}>Weekly User Growth</h3>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#222', border: '1px solid #444', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="users" stroke="#ff6600" strokeWidth={3} dot={{ fill: '#ff6600', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Live Fleet Battery Distribution Pie Chart */}
          <div style={{ background: '#1a1a1a', padding: '1.5rem', borderRadius: '16px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: '#ff6600' }}>Global Fleet Battery Status (Live)</h3>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={batteryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {batteryDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#222', border: '1px solid #444', borderRadius: '8px' }} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} initialMode={authMode} />}
    </div>
  );
};

export default AdminAnalytics;
