import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './design/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
