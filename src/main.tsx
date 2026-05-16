import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReactGA from "react-ga4"
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'

// Initialize GA4
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
if (GA_ID) {
  ReactGA.initialize(GA_ID);
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)
