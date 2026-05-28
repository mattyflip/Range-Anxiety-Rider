import React, { useState } from 'react';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  color?: string;
  fontSize?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ title, text, url, color = 'white', fontSize = '1.2rem' }) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard failed:', err);
      }
    }
  };

  return (
    <button 
      onClick={handleShare}
      style={{ 
        background: 'none', 
        border: 'none', 
        color: copied ? '#4ade80' : color, 
        fontSize, 
        cursor: 'pointer', 
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        transition: 'color 0.2s'
      }}
      title={copied ? "Link Copied!" : "Share"}
    >
      <span>{copied ? '✅' : '🔗'}</span>
      {copied && <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>COPIED</span>}
    </button>
  );
};

export default ShareButton;
