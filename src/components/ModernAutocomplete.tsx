import React, { useEffect, useRef } from 'react';

interface ModernAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (address: string) => void;
  value?: string;
  style?: React.CSSProperties;
}

const ModernAutocomplete: React.FC<ModernAutocompleteProps> = ({ 
  placeholder, 
  onPlaceSelected,
  value,
  style 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current || !window.google) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry'],
      types: ['address']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.formatted_address) {
        onPlaceSelected(place.formatted_address);
      }
    });

    return () => {
      if (window.google) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current!);
      }
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '0.8rem',
        background: '#111',
        border: '1px solid #333',
        color: 'white',
        borderRadius: '8px',
        fontSize: '0.85rem',
        ...style
      }}
    />
  );
};

export default ModernAutocomplete;
