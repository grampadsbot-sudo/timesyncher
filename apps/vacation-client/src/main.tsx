import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}
