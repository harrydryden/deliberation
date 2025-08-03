import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackendAuth } from '@/hooks/useBackendAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BACKEND_CONFIG } from '@/config/backend';
import { Database, Server, Zap, Shield } from 'lucide-react';

export const BackendSelector = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  const [currentBackend] = useState(BACKEND_CONFIG.type);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    } else if (!isLoading && user && user.role !== 'admin') {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (user.role !== 'admin') return null;

  const backends = [
    {
      type: 'supabase' as const,
      name: 'Supabase',
      description: 'PostgreSQL with real-time features, authentication, and edge functions',
      icon: Database,
      features: ['Real-time subscriptions', 'Built-in auth', 'PostgreSQL', 'Edge functions'],
      status: currentBackend === 'supabase' ? 'active' : 'available',
    },
    {
      type: 'nodejs' as const,
      name: 'Node.js Backend',
      description: 'Custom Fastify server with Redis, Prisma, and WebSocket support',
      icon: Server,
      features: ['Custom API', 'Redis caching', 'Prisma ORM', 'WebSocket/SSE'],
      status: currentBackend === 'nodejs' ? 'active' : 'available',
    },
  ];

  const handleBackendSwitch = (backendType: 'supabase' | 'nodejs') => {
    const message = `To switch to ${backendType === 'supabase' ? 'Supabase' : 'Node.js'} backend, set the environment variable:\n\nVITE_BACKEND_TYPE=${backendType}\n\nThen restart the development server.`;
    alert(message);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Backend Configuration</h2>
        <p className="text-muted-foreground">
          This application supports multiple backend options. You can switch between them using environment variables.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {backends.map((backend) => {
          const IconComponent = backend.icon;
          const isActive = backend.status === 'active';

          return (
            <Card key={backend.type} className={`relative ${isActive ? 'ring-2 ring-primary' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <IconComponent className="h-6 w-6" />
                    <CardTitle>{backend.name}</CardTitle>
                  </div>
                  <Badge variant={isActive ? 'default' : 'secondary'}>
                    {isActive ? 'Active' : 'Available'}
                  </Badge>
                </div>
                <CardDescription>{backend.description}</CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Features</h4>
                    <ul className="space-y-1">
                      {backend.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {!isActive && (
                    <Button
                      onClick={() => handleBackendSwitch(backend.type)}
                      variant="outline"
                      className="w-full"
                    >
                      Switch to {backend.name}
                    </Button>
                  )}

                  {isActive && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Shield className="h-4 w-4" />
                      Currently in use
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="font-medium mb-2">Environment Configuration</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Current backend: <code className="bg-background px-2 py-1 rounded">{currentBackend}</code>
        </p>
        <p className="text-sm text-muted-foreground">
          To switch backends, set <code className="bg-background px-2 py-1 rounded">VITE_BACKEND_TYPE</code> to either "supabase" or "nodejs" in your environment variables.
        </p>
      </div>
    </div>
  );
};