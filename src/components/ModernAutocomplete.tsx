import React, { useEffect, useRef } from 'react';

interface ModernAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (address: string) => void;
  value?: string;
  onChange?: (val: string) => void;
  style?: React.CSSProperties;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-autocomplete': any;
    }
  }
}

const ModernAutocomplete: React.FC<ModernAutocompleteProps> = ({ 
  placeholder, 
  onPlaceSelected, 
  style 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    const el = document.createElement('gmp-place-autocomplete');
    if (placeholder) el.setAttribute('placeholder', placeholder);
    
    // Styling the internal input is tricky, so we apply base styles to container
    el.style.width = '100%';
    
    const handleSelect = (e: any) => {
      const place = e.target.value; // In the new element, .value contains the place result
      if (place && place.formattedAddress) {
        onPlaceSelected(place.formattedAddress);
      }
    };

    el.addEventListener('gmp-placeselect', handleSelect);
    
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(el);
    }

    autocompleteRef.current = el;

    return () => {
      el.removeEventListener('gmp-placeselect', handleSelect);
    };
  }, [onPlaceSelected, placeholder]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%',
        ...style 
      }} 
    />
  );
};

export default ModernAutocomplete;
