import { useEffect } from 'react';

interface AdBannerProps {
  isPro: boolean;
}

const AdBanner = ({ isPro }: AdBannerProps) => {
  useEffect(() => {
    if (!isPro) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense error:", e);
      }
    }
  }, [isPro]);

  if (isPro) return null;

  return (
    <div style={{ marginTop: '2rem', textAlign: 'center', overflow: 'hidden' }}>
      <p style={{ fontSize: '0.65rem', color: '#666', marginBottom: '0.5rem' }}>SPONSORED</p>
      <ins className="adsbygoogle"
           style={{ display: 'block' }}
           data-ad-client="ca-pub-7537427403075018"
           data-ad-slot="6978209606"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  );
};

export default AdBanner;
