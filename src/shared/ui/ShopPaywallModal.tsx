import React from 'react';

interface ShopPaywallModalProps {
  userEmail?: string;
}

const FEATURES = [
  { icon: '🚲', title: 'Unlimited Fleet Management', desc: 'Register and manage all your e-bikes in one place.' },
  { icon: '🛰️', title: 'Real-Time Rider Tracking', desc: 'Live GPS location, battery, and range for every active rental.' },
  { icon: '📅', title: 'Booking & Approval System', desc: 'Accept or decline rental requests directly from your dashboard.' },
  { icon: '📧', title: 'Automated Notifications', desc: 'Riders receive instant email & push confirmations with QR codes and PINs.' },
  { icon: '⚡', title: 'Physics-Based Range Engine', desc: 'Each bike gets an accurate range prediction powered by real physics.' },
  { icon: '🔔', title: 'Low Battery & Perimeter Alerts', desc: 'Get alerted when bikes stray or batteries run low.' },
  { icon: '📞', title: 'Free Onboarding Consultation', desc: 'We\'ll help you set up your fleet from day one.' },
];

const ShopPaywallModal: React.FC<ShopPaywallModalProps> = ({ userEmail }) => {
  const subject = encodeURIComponent('Range Anxiety Rider — Shop Tier Inquiry');
  const body = encodeURIComponent(
    `Hi,\n\nI'm interested in setting up a shop account for the Range Anxiety Rider platform.\n\nMy account email is: ${userEmail || '(not provided)'}\n\nI'd love to learn more about the $39.99/month plan and schedule an onboarding consultation.\n\nThanks!`
  );
  const mailtoLink = `mailto:mattyfliptv@gmail.com?subject=${subject}&body=${body}`;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a00 50%, #0a0a0a 100%)',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      overflowY: 'auto',
      padding: '2rem 1rem 4rem',
    }}>
      {/* Glow */}
      <div style={{
        position: 'fixed', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(255,102,0,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '640px', position: 'relative' }}>

        {/* Header Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{
            display: 'inline-block',
            background: 'rgba(255,102,0,0.15)',
            color: '#ff6600',
            border: '1px solid rgba(255,102,0,0.4)',
            padding: '0.35rem 1rem',
            borderRadius: '100px',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            🏬 Shop Tier Required
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          textAlign: 'center', margin: '0 0 0.75rem 0',
          fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
          fontWeight: 900, color: 'white', lineHeight: 1.1,
        }}>
          Unlock Your<br />
          <span style={{ color: '#ff6600' }}>Fleet Hub</span>
        </h1>
        <p style={{ textAlign: 'center', color: '#888', margin: '0 0 2.5rem 0', fontSize: '1rem', lineHeight: 1.6 }}>
          Everything you need to run a professional e-bike rental operation —<br />
          tracking, bookings, alerts, and more.
        </p>

        {/* Price Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a1a, #221000)',
          border: '2px solid rgba(255,102,0,0.5)',
          borderRadius: '28px',
          padding: '2rem',
          marginBottom: '2rem',
          boxShadow: '0 0 60px rgba(255,102,0,0.1)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#ff6600', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Shop Tier Plan
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '0.25rem' }}>
            <span style={{ color: '#ff6600', fontSize: '1.5rem', fontWeight: 900, marginTop: '0.4rem' }}>$</span>
            <span style={{ color: 'white', fontSize: '4rem', fontWeight: 900, lineHeight: 1 }}>39</span>
            <span style={{ color: '#ff6600', fontSize: '1.5rem', fontWeight: 900, marginTop: '0.4rem' }}>.99</span>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.5rem' }}>per month</div>

          {/* CTA Buttons */}
          <a
            href={mailtoLink}
            style={{
              display: 'block', width: '100%', padding: '1rem',
              background: 'linear-gradient(135deg, #ff8800, #ff5500)',
              color: 'white', textDecoration: 'none',
              borderRadius: '14px', fontWeight: 900, fontSize: '1rem',
              boxShadow: '0 4px 20px rgba(255,102,0,0.4)',
              transition: 'opacity 0.2s',
              marginBottom: '0.75rem',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            ✉️ Get Started — $39.99/mo
          </a>
          <a
            href={mailtoLink}
            style={{
              display: 'block', width: '100%', padding: '0.9rem',
              background: 'transparent',
              color: '#ff6600', textDecoration: 'none',
              border: '1px solid rgba(255,102,0,0.4)',
              borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem',
              transition: 'background 0.2s',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,102,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            📞 Book a Free Consultation
          </a>
        </div>

        {/* Features List */}
        <div style={{
          background: '#141414',
          border: '1px solid #222',
          borderRadius: '24px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.2rem' }}>
            Everything Included
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0, marginTop: '0.1rem' }}>{f.icon}</span>
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.1rem' }}>{f.title}</div>
                  <div style={{ color: '#666', fontSize: '0.78rem', lineHeight: 1.4 }}>{f.desc}</div>
                </div>
                <span style={{ color: '#34a853', flexShrink: 0, marginLeft: 'auto', marginTop: '0.15rem', fontSize: '0.9rem' }}>✓</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fine Print */}
        <p style={{ textAlign: 'center', color: '#444', fontSize: '0.72rem', lineHeight: 1.6, margin: 0 }}>
          Once your account is activated you'll gain immediate access to all shop features.<br />
          Contact us at <a href="mailto:mattyfliptv@gmail.com" style={{ color: '#ff6600', textDecoration: 'none' }}>mattyfliptv@gmail.com</a>
        </p>
      </div>
    </div>
  );
};

export default ShopPaywallModal;
