import { createContext, useContext, useState, useEffect } from 'react';

interface BackendContextType {
  useNodeBackend: boolean;
  toggleBackend: () => void;
}

const BackendContext = createContext<BackendContextType | undefined>(undefined);

export const BackendProvider = ({ children }: { children: React.ReactNode }) => {
  const [useNodeBackend, setUseNodeBackend] = useState(() => {
    const saved = localStorage.getItem('use-node-backend');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('use-node-backend', JSON.stringify(useNodeBackend));
  }, [useNodeBackend]);

  const toggleBackend = () => {
    setUseNodeBackend(prev => !prev);
    // Clear any stored auth tokens when switching
    localStorage.removeItem('auth_token');
  };

  return (
    <BackendContext.Provider value={{ useNodeBackend, toggleBackend }}>
      {children}
    </BackendContext.Provider>
  );
};

export const useBackend = () => {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error('useBackend must be used within a BackendProvider');
  }
  return context;
};