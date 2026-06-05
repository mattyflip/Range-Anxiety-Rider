import React, { useEffect, useRef, useState } from 'react';

interface ModernAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (address: string, lat?: number, lng?: number) => void;
  value?: string;
  style?: React.CSSProperties;
}

const ModernAutocomplete: React.FC<ModernAutocompleteProps> = ({ 
  placeholder = "Enter a location",
  onPlaceSelected,
  value,
  style 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(value || "");

  useEffect(() => {
    if (!inputRef.current || !window.google) return;

    try {
      // Initialize classic Autocomplete
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry', 'name'],
      });
      autocompleteRef.current = autocomplete;

      // Listen for place selection
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place || !place.geometry) return;

        const address = place.formatted_address || place.name || "";
        setInputValue(address);
        onPlaceSelected(
          address, 
          place.geometry.location?.lat(), 
          place.geometry.location?.lng()
        );
      });
    } catch (err) {
      console.error("Failed to load Autocomplete:", err);
    }
    
    // Cleanup event listeners if component unmounts
    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onPlaceSelected]);

  // Sync external value changes if necessary
  useEffect(() => {
    if (value !== undefined && value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  return (
    <div style={{ width: '100%', ...style }}>
      <input 
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #333',
          color: 'white',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '0.95rem',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
    </div>
  );
};

export default ModernAutocomplete;
