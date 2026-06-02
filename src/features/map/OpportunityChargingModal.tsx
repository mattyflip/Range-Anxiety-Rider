import React, { useState, useEffect } from 'react';

interface ChargingStop {
  id: string;
  name: string;
  address: string;
  position: { lat: number; lng: number };
  chargerClass: string;
  details: string;
}

interface OpportunityChargingModalProps {
  bikeSpecs: any;
  currentBatteryWh: number;
  neededWh: number;
  chargingStops: ChargingStop[];
  onSelectStop: (stop: ChargingStop, chargeTimeMin: number) => void;
  onClose: () => void;
}

const OpportunityChargingModal: React.FC<OpportunityChargingModalProps> = ({
  bikeSpecs,
  currentBatteryWh,
  neededWh,
  chargingStops,
  onSelectStop,
  onClose
}) => {
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(chargingStops[0] || null);
  const [chargerType, setChargerType] = useState<'standard' | 'fast'>('standard');

  const deficitWh = neededWh - currentBatteryWh;
  // Safety margin: add 10% extra
  const targetRechargeWh = deficitWh * 1.1;

  const calculateChargeTime = () => {
    const voltage = Number(bikeSpecs.voltage) || 48;
    // Standard charger is usually 2A, Fast is 5A+
    const amps = chargerType === 'fast' ? 5 : 2;
    const watts = voltage * amps;
    
    const hours = targetRechargeWh / watts;
    return Math.ceil(hours * 60);
  };

  const chargeTime = calculateChargeTime();

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #ff6600', borderRadius: '24px', padding: '2rem', maxWidth: '450px', width: '90%', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚡</div>
        <h2 style={{ color: '#ff6600', fontSize: '1.4rem', marginBottom: '0.5rem' }}>Range Rescue</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1.5rem' }}>You'll run out of battery before your destination. We found a pit-stop to get you home.</p>
        
        <div style={{ background: '#222', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', textAlign: 'left' }}>
          <div style={{ color: '#ff6600', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Suggested Stop</div>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedStop?.name || 'Searching...'}</div>
          <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.2rem' }}>{selectedStop?.address}</div>
          
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Required Charge</div>
              <div style={{ color: 'white', fontSize: '1.5rem', fontWeight: 900 }}>{chargeTime} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>mins</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Charger Type</div>
              <div className="mode-toggle" style={{ marginTop: '0.4rem', scale: '0.8', transformOrigin: 'right' }}>
                <button className={chargerType === 'standard' ? 'active' : ''} onClick={() => setChargerType('standard')}>2A</button>
                <button className={chargerType === 'fast' ? 'active' : ''} onClick={() => setChargerType('fast')}>5A</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <button 
            onClick={() => selectedStop && onSelectStop(selectedStop, chargeTime)}
            style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(45deg, #ff6600, #ff9900)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}
          >
            Add Stop to Route
          </button>
          <button 
            onClick={onClose}
            style={{ width: '100%', padding: '0.8rem', background: 'none', color: '#888', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            I'll risk it
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpportunityChargingModal;
