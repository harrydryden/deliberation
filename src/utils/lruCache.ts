/**
 * LRU Cache Implementation for Memory Management with Memory Pressure Detection
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private memoryThreshold: number;

  constructor(maxSize: number = 100, memoryThreshold: number = 150 * 1024 * 1024) { // 150MB default
    this.maxSize = maxSize;
    this.memoryThreshold = memoryThreshold;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Get all keys in LRU order (least recent first)
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  // Get statistics with memory pressure detection
  getStats() {
    const memoryUsage = this.getApproximateMemoryUsage();
    const memoryPressure = memoryUsage > this.memoryThreshold;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: (this.cache.size / this.maxSize * 100).toFixed(1) + '%',
      memoryUsage: `${(memoryUsage / 1024 / 1024).toFixed(1)}MB`,
      memoryPressure,
      memoryThreshold: `${(this.memoryThreshold / 1024 / 1024).toFixed(1)}MB`
    };
  }

  // Estimate memory usage (rough approximation)
  private getApproximateMemoryUsage(): number {
    let size = 0;
    for (const [key, value] of this.cache) {
      size += JSON.stringify([key, value]).length * 2; // Unicode characters = 2 bytes
    }
    return size;
  }

  // Force cleanup when memory pressure detected
  forceCleanup(targetSize?: number): void {
    const target = targetSize || Math.floor(this.maxSize * 0.5); // Clean to 50% capacity
    while (this.cache.size > target) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }
  }

  // Check if cleanup needed
  needsCleanup(): boolean {
    return this.cache.size >= this.maxSize || this.getApproximateMemoryUsage() > this.memoryThreshold;
  }
}