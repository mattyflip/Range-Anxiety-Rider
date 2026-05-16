import React, { useState, useEffect } from 'react'
import { auth } from '../firebase'
import NavBar from '../components/NavBar'
import AuthModal from '../components/AuthModal'
import SEO from '../components/SEO'

const FAQ: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);

  const faqs = [
    {
      question: "How accurate is the e-bike range estimator?",
      answer: "Our model is based on real-world physics, not just manufacturer estimates. We account for elevation gain, rider weight, and even current wind speeds to provide the most accurate range possible."
    },
    {
      question: "Why did my battery die before the estimator said it would?",
      answer: "Factors like tire pressure, motor efficiency at high speeds, and temperature (lithium batteries lose capacity in the cold) can impact range. Our calculator allows you to adjust rider weight, riding style, power modes, outside temperature, tire pressure and tire type to get closer to reality."
    },
    {
      question: "Do I need a license to ride a Sur-Ron or Talaria?",
      answer: "This depends heavily on your state and whether you are riding on-road or off-road. We advise riders to look up local E-Bike Laws for speed limitations, age restrictions and helmet requirements. RIDE SAFE!"
    },
    {
      question: "How do I see my friends on the map?",
      answer: "You will need to upgrade your account to Pro or Host. PRO tier accounts can join public or private group rides. Host tier accounts can host group rides. Once active, all participants will appear as real-time icons on your map and you can all follow the same planned route."
    },
    {
      question: "What is the difference between PAS (Pedal Assist) and '3 Speed Switch' modes?",
      answer: "Our calculator needs to know how you ride. PAS (1-5) assumes you are pedaling, which reduces the load on the motor and significantly extends your range. The 3 Speed Switch (Eco/Normal/Sport) is for higher powered, throttle-only bikes like Sur-Rons or high-power scooters, calculating range based purely on motor output without human assistance."
    },
    {
      question: "Can I add my custom DIY battery build to the app?",
      answer: "Yes! If you don't see your bike in our pre-loaded library (like the Talaria Sting or Onyx RCR), you can manually enter your custom Voltage and Capacity (Ah). Once entered, you can save your custom build to your profile so it's always ready for your next trip."
    },
    {
      question: "How do I share a route I discovered with the rest of the community?",
      answer: "After calculating a trip, you can generate a 'Route Card'—a sleek, shareable image containing your battery metrics and map snapshot. By tapping Post to Feed, your route will be shared to the Community Feed where other riders can view your stats and load your exact route directly into their own map with one tap."
    },
    {
      question: "What is the Rider Rating system and how does it work?",
      answer: "The Rider Rating is our community’s way of rewarding safe and helpful riders. You earn points for sharing accurate routes, helping others in the forum, and participating in Group Rides. Highly-rated riders will be rewarded with new features, profile badges and more! Conversely, riders who consistently disrupt group rides or post misleading data may see their rating drop, ensuring our community remains a trusted space for all riders."
    }
  ];

  const toggleFaq = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div className="container" style={{ minHeight: '100vh', background: '#121212', color: 'white' }}>
      <SEO 
        title="FAQ" 
        description="Frequently asked questions about e-bike range estimation, legal requirements, group rides, and the Range Anxiety community."
        url="https://rangeanxiety.app/faq"
      />
      <NavBar 
        user={user} 
        onShowInstall={() => {}} 
        onShowAuth={() => setShowAuthModal(true)} 
      />

      <main style={{ padding: '4rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 900, color: '#ff6600', margin: 0, lineHeight: '1.1', textTransform: 'uppercase' }}>Frequently Asked Questions</h1>
        </header>

        <section style={{ textAlign: 'center', marginBottom: '5rem' }}>
          <p style={{ fontSize: '1.1rem', color: '#666', maxWidth: '600px', margin: '0 auto' }}>
            Everything you need to know about the Range Anxiety platform.
          </p>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              style={{ 
                background: '#1a1a1a', 
                borderRadius: '16px', 
                border: '1px solid #333', 
                overflow: 'hidden',
                transition: 'border-color 0.2s'
              }}
            >
              <button 
                onClick={() => toggleFaq(index)}
                style={{ 
                  width: '100%', 
                  padding: '1.5rem', 
                  background: 'none', 
                  border: 'none', 
                  color: 'white', 
                  textAlign: 'left', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{faq.question}</span>
                <span style={{ color: '#ff6600', fontSize: '1.5rem', transition: 'transform 0.3s', transform: activeIndex === index ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
              </button>
              
              <div 
                style={{ 
                  maxHeight: activeIndex === index ? '300px' : '0', 
                  overflow: 'hidden', 
                  transition: 'max-height 0.3s ease-out, padding 0.3s',
                  padding: activeIndex === index ? '0 1.5rem 1.5rem 1.5rem' : '0 1.5rem'
                }}
              >
                <p style={{ color: '#aaa', lineHeight: 1.6, margin: 0 }}>
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>

        <footer style={{ textAlign: 'center', marginTop: '6rem', padding: '4rem 0', borderTop: '1px solid #222' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Still have questions?</h3>
          <p style={{ color: '#666', marginBottom: '2rem' }}>Join our forum and ask the community directly!</p>
          <button 
            onClick={() => window.location.href = '/forum'}
            style={{ padding: '0.8rem 2rem', background: '#333', color: 'white', border: '1px solid #444', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Visit the Forum
          </button>
        </footer>
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default FAQ;
