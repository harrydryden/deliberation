import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface GeneratedUser {
  accessCode1: string;
  accessCode2: string;
  role: string;
}

export function AccessCodeGeneration() {
  const [count, setCount] = useState(5);
  const [roleType, setRoleType] = useState<'admin' | 'user'>('user');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUsers, setGeneratedUsers] = useState<GeneratedUser[]>([]);
  
  const { createAccessCodeUsers } = useSupabaseAuth();
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await createAccessCodeUsers(count, roleType);
      
      if (result.error) {
        toast({
          title: 'Error generating access codes',
          description: result.error.message || 'Failed to generate access codes',
          variant: 'destructive'
        });
      } else {
        setGeneratedUsers(result.users);
        toast({
          title: 'Access codes generated successfully',
          description: `Generated ${result.users.length} access code pairs`
        });
      }
    } catch (error) {
      toast({
        title: 'Error generating access codes',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: 'Access code copied successfully'
    });
  };

  const exportToCsv = () => {
    const headers = ['Access Code 1', 'Access Code 2', 'Role'];
    const csvContent = [
      headers.join(','),
      ...generatedUsers.map(user => [user.accessCode1, user.accessCode2, user.role].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-codes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Access Codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="count">Number of Users</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Role Type</Label>
              <Select value={roleType} onValueChange={(value: 'admin' | 'user') => setRoleType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <LoadingSpinner className="w-4 h-4 mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {generatedUsers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Generated Access Codes</CardTitle>
            <Button onClick={exportToCsv} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Access Code 1</TableHead>
                    <TableHead>Access Code 2</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedUsers.map((user, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{user.accessCode1}</TableCell>
                      <TableCell className="font-mono">{user.accessCode2}</TableCell>
                      <TableCell className="capitalize">{user.role}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(`${user.accessCode1} / ${user.accessCode2}`)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}