import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { sanitizeMarkdown } from '@/utils/sanitize';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const MarkdownMessageComponent = ({ content, className }: MarkdownMessageProps) => {
  // Sanitize content to prevent XSS attacks
  const sanitizedContent = sanitizeMarkdown(content);
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={cn(
        'prose prose-xs max-w-none text-sm',
        'prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold',
        'prose-h1:text-base prose-h2:text-sm prose-h3:text-xs',
        'prose-p:my-1.5 prose-p:leading-normal',
        'prose-ul:my-1.5 prose-ol:my-1.5',
        'prose-li:my-0.5',
        'prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-muted prose-code:text-foreground',
        'prose-pre:bg-muted prose-pre:border prose-pre:rounded-md prose-pre:p-3',
        'prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:italic',
        'prose-strong:font-semibold prose-em:italic',
        'prose-a:text-primary prose-a:underline prose-a:decoration-1 prose-a:underline-offset-2',
        'prose-table:border-collapse prose-table:border prose-table:border-border',
        'prose-th:border prose-th:border-border prose-th:bg-muted prose-th:p-2 prose-th:font-medium',
        'prose-td:border prose-td:border-border prose-td:p-2',
        className
      )}
      components={{
        // Override default paragraph styling for better control
        p: ({ children, ...props }) => (
          <p {...props} className="my-1.5 leading-normal text-sm">
            {children}
          </p>
        ),
        // Style code blocks
        code: ({ children, ...props }: any) => {
          const isInline = typeof children === 'string' && !children.includes('\n');
          return isInline ? (
            <code 
              {...props} 
              className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-sm"
            >
              {children}
            </code>
          ) : (
            <code 
              {...props} 
              className="block bg-muted border rounded-md p-3 font-mono text-sm"
            >
              {children}
            </code>
          );
        },
        // Style headings
        h1: ({ children, ...props }) => (
          <h1 {...props} className="text-base font-semibold mt-3 mb-2 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 {...props} className="text-sm font-semibold mt-3 mb-2 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 {...props} className="text-xs font-semibold mt-2 mb-1 first:mt-0">
            {children}
          </h3>
        ),
        // Style lists
        ul: ({ children, ...props }) => (
          <ul {...props} className="my-1.5 pl-4 space-y-0.5 list-disc text-sm">
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol {...props} className="my-1.5 pl-4 space-y-0.5 list-decimal text-sm">
            {children}
          </ol>
        ),
        // Style blockquotes
        blockquote: ({ children, ...props }) => (
          <blockquote {...props} className="border-l-4 border-border pl-4 my-4 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        // Style strong/bold text
        strong: ({ children, ...props }) => (
          <strong {...props} className="font-semibold">
            {children}
          </strong>
        ),
        // Style emphasis/italic text
        em: ({ children, ...props }) => (
          <em {...props} className="italic">
            {children}
          </em>
        ),
      }}
    >
      {sanitizedContent}
    </ReactMarkdown>
  );
};

export const MarkdownMessage = memo(MarkdownMessageComponent, (prev, next) => prev.content === next.content && prev.className === next.className);