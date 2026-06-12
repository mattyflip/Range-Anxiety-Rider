import React, { type RefObject } from 'react';
import type { RouteMetrics } from '../pages/MapHome';

interface ShareCardProps {
  metrics: RouteMetrics;
  shareCardRef: RefObject<HTMLDivElement | null>;
  setShowRouteReplay: (show: boolean) => void;
  setShowSharePreview: (show: boolean) => void;
  downloadShareCard: () => void;
  shareToCommunity: () => void;
}

export const ShareCard: React.FC<ShareCardProps> = ({
  metrics,
  shareCardRef,
  setShowRouteReplay,
  setShowSharePreview,
  downloadShareCard,
  shareToCommunity
}) => {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', padding: '10px', overflow: 'auto' }}>
      <div ref={shareCardRef} style={{ width: '400px', background: '#0a0a0a', padding: '2rem', borderRadius: '40px', border: '1px solid #333' }}>
         <h2 style={{ color: '#ff6600', margin: 0 }}>RANGE ANXIETY</h2>
         <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', margin: '1rem 0' }}>{metrics.batteryPercentRemaining.toFixed(0)}% Left</div>
         <p style={{ color: '#888' }}>Rode {metrics.distanceMiles.toFixed(1)} miles!</p>
      </div>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => setShowRouteReplay(true)} style={{ padding: '1rem 2rem', background: '#333', color: '#ff6600', border: '1px solid #ff6600', borderRadius: '12px', fontWeight: 900 }}>3D VIEW</button>
        <button onClick={() => setShowSharePreview(false)} style={{ padding: '1rem 2rem', background: '#333', color: 'white', border: 'none', borderRadius: '12px' }}>Cancel</button>
        <button onClick={downloadShareCard} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px' }}>Download</button>
        <button onClick={shareToCommunity} style={{ padding: '1rem 2rem', background: '#ff6600', color: 'white', border: 'none', borderRadius: '12px' }}>Post</button>
      </div>
    </div>
  );
};
