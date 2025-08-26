import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PerformanceProvider } from "@/components/layout/PerformanceProvider";

createRoot(document.getElementById("root")!).render(
  <PerformanceProvider>
    <App />
  </PerformanceProvider>
);
