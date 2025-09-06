import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Remove performance provider to reduce overhead
createRoot(document.getElementById("root")!).render(<App />);
