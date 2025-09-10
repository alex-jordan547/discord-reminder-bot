import { ref, computed } from 'vue';

export interface LoadingStateOptions {
  autoClearError?: boolean;
  errorTimeout?: number;
}

export interface AsyncOperationOptions {
  preventConcurrent?: boolean;
}

export function useLoadingState(options: LoadingStateOptions = {}) {
  // State
  const loadingStates = ref<Map<string, boolean>>(new Map());
  const error = ref<Error | null>(null);
  const isExecuting = ref(false);

  // Computed
  const isLoading = computed(() => {
    return Array.from(loadingStates.value.values()).some(loading => loading);
  });

  // Actions
  const setLoading = (loading: boolean, key = 'default') => {
    if (loading && error.value) {
      // Clear error when starting new loading operation
      error.value = null;
    }

    loadingStates.value.set(key, loading);

    // Trigger reactivity
    loadingStates.value = new Map(loadingStates.value);
  };

  const isLoadingKey = (key: string) => {
    return loadingStates.value.get(key) || false;
  };

  const setError = (err: Error) => {
    error.value = err;
    // Stop all loading states when error occurs
    loadingStates.value.clear();
    loadingStates.value = new Map(loadingStates.value);

    // Auto-clear error if configured
    if (options.autoClearError && options.errorTimeout) {
      setTimeout(() => {
        if (error.value === err) {
          error.value = null;
        }
      }, options.errorTimeout);
    }
  };

  const clearError = () => {
    error.value = null;
  };

  const executeAsync = async <T>(
    operation: () => Promise<T>,
    asyncOptions: AsyncOperationOptions = { preventConcurrent: true },
  ): Promise<T> => {
    if (asyncOptions.preventConcurrent && isExecuting.value) {
      throw new Error('Operation already in progress');
    }

    isExecuting.value = true;
    setLoading(true, 'async');

    try {
      const result = await operation();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false, 'async');
      isExecuting.value = false;
    }
  };

  return {
    // State
    isLoading,
    error,

    // Actions
    setLoading,
    isLoadingKey,
    setError,
    clearError,
    executeAsync,
  };
}
