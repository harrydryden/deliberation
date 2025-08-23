import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MoreHorizontal } from 'lucide-react';

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  placeholder?: string;
  title?: string;
}

export const ExpandableText = ({ 
  text, 
  maxLength = 50, 
  placeholder = 'No content',
  title = 'Content'
}: ExpandableTextProps) => {
  const displayText = text || placeholder;
  const isLong = displayText.length > maxLength;
  const previewText = isLong ? `${displayText.slice(0, maxLength)}...` : displayText;
  
  if (!isLong) {
    return (
      <span className={`text-sm ${!text ? 'text-muted-foreground italic' : ''}`}>
        {displayText}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${!text ? 'text-muted-foreground italic' : ''}`}>
        {previewText}
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap break-words">
              {text || placeholder}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};