export interface RetryOptions {
  attempts?: number;
  delaysMs?: number[];
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const withRetry = async <T>(
  operation: () => Promise<T>,
  {
    attempts = 3,
    delaysMs = [0, 900, 2200],
    shouldRetry = () => true,
    onRetry,
  }: RetryOptions = {}
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldContinue = attempt < attempts && shouldRetry(error, attempt);
      if (!shouldContinue) {
        break;
      }

      const delayMs = delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? delaysMs[delaysMs.length - 1] ?? 0;
      onRetry?.(error, attempt, delayMs);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
};
