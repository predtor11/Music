import '@music/ui/styles.css';
import { ThemeProvider } from '@music/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthProvider } from './auth/AuthProvider.js';
import { startSync } from './offline/runtime.js';
import { registerServiceWorker } from './offline/serviceWorker.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <div className="ui-app-bg">
        <AuthProvider>
          <App />
        </AuthProvider>
      </div>
    </ThemeProvider>
  </StrictMode>,
);

startSync();
registerServiceWorker();
