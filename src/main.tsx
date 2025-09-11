import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { validateStartup } from "@/config/environment";

// Validate environment configuration before starting the app
validateStartup();

createRoot(document.getElementById("root")!).render(<App />);
