import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { PersonalizationProvider } from './context/PersonalizationContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersonalizationProvider>
      <App />
    </PersonalizationProvider>
  </React.StrictMode>
);
