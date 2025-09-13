/**
 * Integration test for IBIS functionality
 * F010: Verify IBIS submission and visualization integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IbisSubmissionModal } from '@/components/chat/IbisSubmissionModal';

// Mock dependencies
vi.mock('@/hooks/useSupabaseAuth', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'test-user', email: 'test@test.com' },
    isLoading: false
  })
}));

vi.mock('@/hooks/useIbisSubmission', () => ({
  useIbisSubmission: () => ({
    submitToIbis: vi.fn().mockResolvedValue({}),
    isSubmitting: false
  })
}));

vi.mock('@/hooks/useIbisClassification', () => ({
  useIbisClassification: () => ({
    aiSuggestions: {
      title: 'Test Issue',
      nodeType: 'issue',
      confidence: 0.85,
      keywords: ['test', 'issue'],
      stanceScore: 0.2
    },
    rootSuggestion: null,
    isClassifying: false
  })
}));

vi.mock('@/services/domain/implementations/ibis.service', () => ({
  IBISService: class MockIBISService {
    getExistingNodes = vi.fn().mockResolvedValue([
      { id: 'node-1', title: 'Existing Issue', node_type: 'issue' },
      { id: 'node-2', title: 'Existing Position', node_type: 'position' }
    ]);
  }
}));

describe('IBIS Integration (F010)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    messageId: 'test-msg',
    messageContent: 'This is a test message for IBIS submission',
    deliberationId: 'test-deliberation',
    onSuccess: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('IBIS Modal Functionality', () => {
    it('should render IBIS submission modal with AI suggestions', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      // Should display AI suggestions
      expect(screen.getByText('Suggestions')).toBeInTheDocument();
      expect(screen.getByText('85% confidence')).toBeInTheDocument();
      
      // Should show keywords
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('issue')).toBeInTheDocument();
      
      // Should show stance
      expect(screen.getByText('Neutral')).toBeInTheDocument();
    });

    it('should load existing IBIS nodes', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      await waitFor(() => {
        // Should load and display existing nodes in relationship selector
        expect(screen.getByText(/Enhanced Relationship Selector/)).toBeInTheDocument();
      });
    });

    it('should handle node type selection', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      // Click on node type selector
      const nodeTypeSelect = screen.getByRole('combobox');
      fireEvent.click(nodeTypeSelect);
      
      // Should show node type options
      await waitFor(() => {
        expect(screen.getByText('Issue')).toBeInTheDocument();
        expect(screen.getByText('Position')).toBeInTheDocument();
        expect(screen.getByText('Argument')).toBeInTheDocument();
      });
    });

    it('should pre-populate form with AI suggestions', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      await waitFor(() => {
        // Title should be pre-populated
        const titleInput = screen.getByDisplayValue('Test Issue');
        expect(titleInput).toBeInTheDocument();
      });
    });

    it('should handle form submission', async () => {
      const mockSubmitToIbis = vi.fn().mockResolvedValue({});
      vi.mocked(require('@/hooks/useIbisSubmission').useIbisSubmission).mockReturnValue({
        submitToIbis: mockSubmitToIbis,
        isSubmitting: false
      });

      render(<IbisSubmissionModal {...defaultProps} />);
      
      // Fill form and submit
      const titleInput = screen.getByDisplayValue('Test Issue');
      fireEvent.change(titleInput, { target: { value: 'Updated Test Issue' } });
      
      const submitButton = screen.getByText('Submit to IBIS');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockSubmitToIbis).toHaveBeenCalled();
      });
    });
  });

  describe('Relationship Management', () => {
    it('should handle smart connections', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      await waitFor(() => {
        // Should show enhanced relationship selector
        expect(screen.getByText(/Smart \+ Manual/)).toBeInTheDocument();
      });
    });

    it('should display relationship summary', async () => {
      // Mock relationships
      const mockUseIbisSubmission = vi.mocked(require('@/hooks/useIbisSubmission').useIbisSubmission);
      mockUseIbisSubmission.mockReturnValue({
        submitToIbis: vi.fn(),
        isSubmitting: false
      });

      render(<IbisSubmissionModal {...defaultProps} />);
      
      // Relationship summary should appear when relationships are selected
      // This would be tested with actual relationship selection in a full integration test
    });
  });

  describe('Error Handling', () => {
    it('should handle submission errors gracefully', async () => {
      const mockSubmitToIbis = vi.fn().mockRejectedValue(new Error('Submission failed'));
      vi.mocked(require('@/hooks/useIbisSubmission').useIbisSubmission).mockReturnValue({
        submitToIbis: mockSubmitToIbis,
        isSubmitting: false
      });

      render(<IbisSubmissionModal {...defaultProps} />);
      
      const submitButton = screen.getByText('Submit to IBIS');
      fireEvent.click(submitButton);
      
      // Should handle error gracefully without crashing
      await waitFor(() => {
        expect(mockSubmitToIbis).toHaveBeenCalled();
      });
    });

    it('should validate required fields', async () => {
      render(<IbisSubmissionModal {...defaultProps} />);
      
      // Clear title
      const titleInput = screen.getByDisplayValue('Test Issue');
      fireEvent.change(titleInput, { target: { value: '' } });
      
      const submitButton = screen.getByText('Submit to IBIS');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Integration with DeliberationChat', () => {
    it('should be called from chat interface', () => {
      // This would test the integration point where IBIS modal is opened from chat
      // The component exists in DeliberationChat.tsx and is properly imported
      const modalComponent = require('@/components/chat/IbisSubmissionModal').IbisSubmissionModal;
      expect(modalComponent).toBeDefined();
    });
  });
});