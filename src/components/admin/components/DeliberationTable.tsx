import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Deliberation } from '@/types/index';
import { DeliberationTableRow } from './DeliberationTableRow';

interface DeliberationTableProps {
  deliberations: Deliberation[];
  updating: string | null;
  clearing: { [key: string]: 'messages' | 'ibis' | null };
  onStatusUpdate: (id: string, status: string) => void;
  onEditNodes: (deliberation: Deliberation) => void;
  onEditMap: (deliberation: Deliberation) => void;
  onNotionUpdated: (deliberationId: string, newNotion: string) => void;
  onClearMessages: (deliberationId: string, deliberationTitle: string) => void;
  onClearIbis: (deliberationId: string, deliberationTitle: string) => void;
  onCreateIssues: (deliberation: Deliberation) => void;
}

export const DeliberationTable = ({
  deliberations,
  updating,
  clearing,
  onStatusUpdate,
  onEditNodes,
  onEditMap,
  onNotionUpdated,
  onClearMessages,
  onClearIbis,
  onCreateIssues
}: DeliberationTableProps) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Title</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="min-w-[250px]">Notion</TableHead>
            <TableHead className="min-w-[200px]">Description</TableHead>
            <TableHead className="w-[120px]">Created</TableHead>
            <TableHead className="w-[120px]">Updated</TableHead>
            <TableHead className="min-w-[500px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliberations.map((deliberation) => (
            <DeliberationTableRow
              key={deliberation.id}
              deliberation={deliberation}
              updating={updating}
              clearing={clearing}
              onStatusUpdate={onStatusUpdate}
              onEditNodes={onEditNodes}
              onEditMap={onEditMap}
              onNotionUpdated={onNotionUpdated}
              onClearMessages={onClearMessages}
              onClearIbis={onClearIbis}
              onCreateIssues={onCreateIssues}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};