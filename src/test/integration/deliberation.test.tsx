import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { DeliberationService } from '@/services/domain/implementations/deliberation.service';
import { mockDeliberation } from '@/test/utils';

// Mock deliberation repository
const mockDeliberationRepository = {
  findAll: vi.fn(),
  findPublic: vi.fn(),
  findByFacilitator: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findById: vi.fn(),
};

describe('Deliberation Service Integration', () => {
  let deliberationService: DeliberationService;

  beforeEach(() => {
    vi.clearAllMocks();
    deliberationService = new DeliberationService(mockDeliberationRepository as any);
  });

  it('gets all deliberations', async () => {
    const mockDeliberations = [mockDeliberation];
    mockDeliberationRepository.findAll.mockResolvedValue(mockDeliberations);

    const result = await deliberationService.getDeliberations();

    expect(result).toEqual(mockDeliberations);
    expect(mockDeliberationRepository.findAll).toHaveBeenCalledWith(undefined);
  });

  it('gets public deliberations', async () => {
    const mockPublicDeliberations = [{ ...mockDeliberation, is_public: true }];
    mockDeliberationRepository.findPublic.mockResolvedValue(mockPublicDeliberations);

    const result = await deliberationService.getPublicDeliberations();

    expect(result).toEqual(mockPublicDeliberations);
    expect(mockDeliberationRepository.findPublic).toHaveBeenCalled();
  });

  it('creates a deliberation', async () => {
    const newDeliberation = {
      title: 'New Deliberation',
      description: 'Test description',
      facilitator_id: 'user-123',
      status: 'active' as const,
      is_public: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    
    mockDeliberationRepository.create.mockResolvedValue({
      ...newDeliberation,
      id: 'deliberation-123',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    });

    const result = await deliberationService.createDeliberation(newDeliberation);

    expect(result.id).toBeDefined();
    expect(result.title).toBe(newDeliberation.title);
    expect(mockDeliberationRepository.create).toHaveBeenCalledWith(newDeliberation);
  });

  it('handles deliberation creation errors', async () => {
    const newDeliberation = {
      title: 'New Deliberation',
      description: 'Test description',
      facilitator_id: 'user-123',
      status: 'active' as const,
      is_public: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    
    const error = new Error('Database error');
    mockDeliberationRepository.create.mockRejectedValue(error);

    await expect(deliberationService.createDeliberation(newDeliberation)).rejects.toThrow('Database error');
  });
});