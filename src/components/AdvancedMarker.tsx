import React, { useEffect, useRef } from 'react';
import { useGoogleMap } from '@react-google-maps/api';

interface AdvancedMarkerProps {
  position: google.maps.LatLngLiteral;
  title?: string;
  label?: string | { text: string; color?: string; fontSize?: string; fontWeight?: string };
  icon?: {
    path?: any;
    fillColor?: string;
    fillOpacity?: number;
    scale?: number;
    strokeColor?: string;
    strokeWeight?: number;
    url?: string;
    scaledSize?: any;
  };
  onClick?: () => void;
}

const AdvancedMarker: React.FC<AdvancedMarkerProps> = ({ 
  position, 
  title, 
  label, 
  icon,
  onClick 
}) => {
  const map = useGoogleMap();
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    // Load the library for Advanced Markers
    const initMarker = async () => {
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

      let content: HTMLElement | undefined = undefined;

      // Handle custom Pin styling if icon (CIRCLE) is provided
      if (icon && icon.fillColor) {
        const pinElement = new PinElement({
          background: icon.fillColor,
          borderColor: icon.strokeColor || 'white',
          glyphText: typeof label === 'string' ? label : label?.text || '',
          glyphColor: (typeof label !== 'string' && label?.color) ? label.color : 'white',
          scale: (icon.scale ? icon.scale / 8 : 1) // Scaled down to match PinElement expectations
        });
        content = pinElement as any;
      } else if (icon && icon.url) {
        // Handle image icons
        const img = document.createElement('img');
        img.src = icon.url;
        if (icon.scaledSize) {
          img.style.width = `${icon.scaledSize.width}px`;
          img.style.height = `${icon.scaledSize.height}px`;
        }
        content = img;
      }

      const marker = new AdvancedMarkerElement({
        map,
        position,
        title,
        content
      });

      if (onClick) {
        marker.addListener('click', onClick);
      }

      markerRef.current = marker;
    };

    initMarker();

    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
      }
    };
  }, [map, position, title, icon, label, onClick]);

  return null; // This component doesn't render anything in the React DOM
};

export default AdvancedMarker;
