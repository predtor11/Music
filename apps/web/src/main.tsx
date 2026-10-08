import '@music/ui/styles.css';
import { ThemeProvider } from '@music/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <div className="ui-app-bg">
        <App />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
