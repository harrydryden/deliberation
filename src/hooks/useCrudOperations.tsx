import { useState, useCallback, useEffect } from 'react';
import { useAsyncAction } from './useAsyncAction';

interface CrudService<T, CreateData = Partial<T>, UpdateData = Partial<T>> {
  getAll: () => Promise<T[]>;
  create: (data: CreateData) => Promise<T>;
  update: (id: string, data: UpdateData) => Promise<T>;
  delete?: (id: string) => Promise<void>;
}

interface UseCrudOperationsOptions {
  autoLoad?: boolean;
  entityName?: string;
}

export const useCrudOperations = <
  T extends { id: string },
  CreateData = Partial<T>,
  UpdateData = Partial<T>
>(
  service: CrudService<T, CreateData, UpdateData>,
  options: UseCrudOperationsOptions = {}
) => {
  const { autoLoad = true, entityName = 'item' } = options;
  
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  // Load all items
  const { execute: load, loading: loadingItems } = useAsyncAction(
    async () => {
      const data = await service.getAll();
      setItems(data);
      return data;
    },
    { errorMessage: `Failed to load ${entityName}s` }
  );

  // Create item
  const { execute: create, loading: creating } = useAsyncAction(
    async (data: CreateData) => {
      const newItem = await service.create(data);
      setItems(prev => [...prev, newItem]);
      return newItem;
    },
    { 
      successMessage: `${entityName} created successfully`,
      errorMessage: `Failed to create ${entityName}`
    }
  );

  // Update item
  const { execute: update, loading: updating } = useAsyncAction(
    async (id: string, data: UpdateData) => {
      const updatedItem = await service.update(id, data);
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, ...updatedItem } : item
      ));
      return updatedItem;
    },
    { 
      successMessage: `${entityName} updated successfully`,
      errorMessage: `Failed to update ${entityName}`
    }
  );

  // Delete item (if service supports it)
  const { execute: deleteItem, loading: deleting } = useAsyncAction(
    async (id: string) => {
      if (service.delete) {
        await service.delete(id);
        setItems(prev => prev.filter(item => item.id !== id));
      }
    },
    { 
      successMessage: `${entityName} deleted successfully`,
      errorMessage: `Failed to delete ${entityName}`
    }
  );

  // Load items on mount if autoLoad is enabled
  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [autoLoad, load]);

  return {
    items,
    loading: loading || loadingItems,
    creating,
    updating,
    deleting,
    load,
    create,
    update,
    delete: service.delete ? deleteItem : undefined,
    setItems
  };
};