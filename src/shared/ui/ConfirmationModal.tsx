import React from 'react';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 20000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        color: 'white',
        padding: '2rem',
        borderRadius: '20px',
        maxWidth: '400px',
        width: '100%',
        border: '1px solid #333',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: isDestructive ? '#ff4444' : '#ff6600' }}>{title}</h3>
        <p style={{ color: '#ccc', lineHeight: '1.5', fontSize: '0.95rem', marginBottom: '2rem' }}>{message}</p>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '0.8rem',
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '0.8rem',
              backgroundColor: isDestructive ? '#ff4444' : '#ff6600',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
