import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
        
        // Check for updates on visibility change (more efficient than polling)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        });
        
        // Also check periodically, but less frequently (5 minutes)
        setInterval(() => {
          registration.update();
        }, 300000); // 5 minutes instead of 1 minute
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}
