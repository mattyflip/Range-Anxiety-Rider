import React, { useEffect, useRef } from 'react';

interface ModernAutocompleteProps {
  placeholder?: string;
  onPlaceSelected: (address: string, lat?: number, lng?: number) => void;
  value?: string;
  style?: React.CSSProperties;
}

const ModernAutocomplete: React.FC<ModernAutocompleteProps> = ({ 
  onPlaceSelected,
  value,
  style 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      if (!containerRef.current || !window.google) return;

      try {
        const { PlaceAutocompleteElement } = await google.maps.importLibrary("places") as any;
        
        const autocomplete = new PlaceAutocompleteElement();
        autocompleteRef.current = autocomplete;
        
        // Style the inner input to match our app's look
        // The PlaceAutocompleteElement is a web component, so we might need to inject styles or use parts
        autocomplete.style.width = '100%';
        
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(autocomplete);

        autocomplete.addEventListener('gmp-placeselect', async (event: any) => {
          const place = event.place;
          if (!place) return;

          await place.fetchFields({ fields: ['formattedAddress', 'location'] });
          
          if (place.formattedAddress) {
            onPlaceSelected(
              place.formattedAddress, 
              place.location?.lat(), 
              place.location?.lng()
            );
          }
        });

        // Set initial value if provided
        if (value) {
           autocomplete.value = value;
        }

      } catch (err) {
        console.error("Failed to load PlaceAutocompleteElement:", err);
      }
    };

    init();
  }, []);

  // Sync value prop changes
  useEffect(() => {
    if (autocompleteRef.current && value !== undefined) {
      autocompleteRef.current.value = value;
    }
  }, [value]);

  return (
    <div 
      ref={containerRef}
      style={{
        width: '100%',
        background: '#111',
        border: '1px solid #333',
        color: 'white',
        borderRadius: '8px',
        fontSize: '0.85rem',
        overflow: 'hidden',
        ...style
      }}
    />
  );
};

export default ModernAutocomplete;
