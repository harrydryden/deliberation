import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, MessageSquare, Eye } from 'lucide-react';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { Deliberation } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useNavigate } from 'react-router-dom';

interface DeliberationOverviewProps {
  deliberations: Deliberation[];
  loading: boolean;
  onLoad: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export const DeliberationOverview = ({ deliberations, loading, onLoad, onUpdateStatus }: DeliberationOverviewProps) => {
  const [updating, setUpdating] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (deliberations.length === 0 && !loading) {
      onLoad();
    }
  }, [deliberations.length, loading, onLoad]);

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await onUpdateStatus(id, status);
    } finally {
      setUpdating(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'draft': 'secondary',
      'active': 'default',
      'completed': 'destructive',
      'archived': 'secondary'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return formatToUKDateTime(dateString, 'dd MMM yyyy HH:mm');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Deliberation Overview
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && deliberations.length === 0 ? (
          <LoadingSpinner />
        ) : deliberations.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No deliberations found</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{deliberations.length}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {deliberations.filter(d => d.status === 'active').length}
                </div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {deliberations.filter(d => d.status === 'draft').length}
                </div>
                <div className="text-sm text-muted-foreground">Draft</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {deliberations.filter(d => d.status === 'completed').length}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliberations.map((deliberation) => (
                  <TableRow key={deliberation.id}>
                    <TableCell className="font-medium">
                      {deliberation.title}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={deliberation.status}
                        onValueChange={(value) => handleStatusUpdate(deliberation.id, value)}
                        disabled={updating === deliberation.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {deliberation.description || 'No description'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(deliberation.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(deliberation.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/deliberations/${deliberation.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};