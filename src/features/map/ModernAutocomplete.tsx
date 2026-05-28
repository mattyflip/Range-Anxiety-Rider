import React, { useEffect, useRef } from 'react';

interface ModernAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (address: string, lat?: number, lng?: number) => void;
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
    if (!inputRef.current || !window.google || !window.google.maps || !window.google.maps.places) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry'],
      types: ['address']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.formatted_address) {
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        onPlaceSelected(place.formatted_address, lat, lng);
      }
    });

    return () => {
      if (window.google) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current!);
      }
    };
  }, []);

  // Sync internal input value with the 'value' prop
  useEffect(() => {
    if (inputRef.current && value !== undefined && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      onChange={(e) => onPlaceSelected(e.target.value)}
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
