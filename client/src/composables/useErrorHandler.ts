import { ref } from 'vue';

export interface ErrorHandlerOptions {
  autoClearTimeout?: number;
  logErrors?: boolean;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export interface APIError extends Error {
  status?: number;
  response?: {
    data?: {
      error?: string;
      message?: string;
    };
  };
}

export interface NetworkError extends Error {
  code?: string;
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  // State
  const lastError = ref<Error | null>(null);
  const errorListeners = ref<Array<(error: Error) => void>>([]);

  // Auto-clear timeout
  let autoClearTimer: NodeJS.Timeout | null = null;

  // Actions
  const handleError = (error: any) => {
    let normalizedError: Error;

    if (error instanceof Error) {
      normalizedError = error;
    } else if (typeof error === 'object' && error !== null) {
      // Handle error-like objects (API errors, network errors, etc.)
      normalizedError = Object.assign(new Error(error.message || 'Unknown error'), error);
    } else {
      normalizedError = new Error(String(error));
    }

    lastError.value = normalizedError;

    // Log error if enabled
    if (options.logErrors !== false) {
      console.error('Error occurred:', normalizedError);
    }

    // Notify listeners
    errorListeners.value.forEach(listener => {
      try {
        listener(normalizedError);
      } catch (listenerError) {
        console.warn('Error in error listener:', listenerError);
      }
    });

    // Auto-clear timer
    if (options.autoClearTimeout) {
      if (autoClearTimer) {
        clearTimeout(autoClearTimer);
      }
      autoClearTimer = setTimeout(() => {
        if (lastError.value === normalizedError) {
          lastError.value = null;
        }
      }, options.autoClearTimeout);
    }
  };

  const getUserFriendlyMessage = (error?: Error): string => {
    const targetError = error || lastError.value;

    if (!targetError) {
      return 'An unexpected error occurred';
    }

    // Handle API errors
    if ('status' in targetError) {
      const apiError = targetError as APIError;
      switch (apiError.status) {
        case 400:
          return 'Invalid request. Please check your input and try again.';
        case 401:
          return 'Authentication required. Please log in and try again.';
        case 403:
          return 'You do not have permission to perform this action.';
        case 404:
          return 'The requested resource was not found.';
        case 429:
          return 'Too many requests. Please wait a moment and try again.';
        case 500:
          return 'A server error occurred. Please try again later.';
        case 503:
          return 'Service temporarily unavailable. Please try again later.';
        default:
          return 'A server error occurred. Please try again later.';
      }
    }

    // Handle network errors
    if ('code' in targetError) {
      const networkError = targetError as NetworkError;
      if (networkError.code === 'NETWORK_ERROR' || targetError.message.includes('fetch')) {
        return 'Connection problem. Please check your network connection and try again.';
      }
    }

    // Handle specific error messages
    if (targetError.message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    if (targetError.message.includes('abort')) {
      return 'Request was cancelled. Please try again.';
    }

    // Fallback message
    return 'An unexpected error occurred. Please try again.';
  };

  const retry = async <T>(
    operation: () => Promise<T>,
    retryOptions: RetryOptions = {},
  ): Promise<T> => {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
    } = retryOptions;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  };

  const onError = (callback: (error: Error) => void) => {
    errorListeners.value.push(callback);

    // Return unsubscribe function
    return () => {
      const index = errorListeners.value.indexOf(callback);
      if (index > -1) {
        errorListeners.value.splice(index, 1);
      }
    };
  };

  const clearError = () => {
    lastError.value = null;
    if (autoClearTimer) {
      clearTimeout(autoClearTimer);
      autoClearTimer = null;
    }
  };

  return {
    // State
    lastError,

    // Actions
    handleError,
    getUserFriendlyMessage,
    retry,
    onError,
    clearError,
  };
}
