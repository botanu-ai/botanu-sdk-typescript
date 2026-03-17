// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Retry integration — automatic attempt tracking for LLM calls.
 *
 * Compatible with p-retry, async-retry, and similar retry libraries.
 *
 * @example
 * ```ts
 * import pRetry from 'p-retry';
 * import { botanuRetryOptions } from '@botanu/sdk/integrations/retry';
 *
 * const result = await pRetry(
 *   async (attemptNumber) => {
 *     return await trackLlmCall(
 *       { vendor: 'openai', model: 'gpt-4' },
 *       async (tracker) => {
 *         tracker.setAttempt(attemptNumber);
 *         const res = await openai.chat.completions.create({ ... });
 *         tracker.setTokens(res.usage.prompt_tokens, res.usage.completion_tokens);
 *         return res;
 *       },
 *     );
 *   },
 *   botanuRetryOptions({ retries: 3 }),
 * );
 * ```
 */

// AsyncLocalStorage for context-safe retry tracking (equivalent to Python's contextvars).
// Prevents concurrent async retry operations from interfering with each other's attempt numbers.
import { AsyncLocalStorage } from 'async_hooks';

const _retryStore = new AsyncLocalStorage<{ attempt: number }>();

/**
 * Get the current retry attempt number.
 * Returns 0 if not in a retry context.
 */
export function getRetryAttempt(): number {
  return _retryStore.getStore()?.attempt ?? 0;
}

/**
 * Set the current retry attempt number.
 * Called by retry hooks before each attempt.
 */
export function setRetryAttempt(attempt: number): void {
  const store = _retryStore.getStore();
  if (store) {
    store.attempt = attempt;
  } else {
    // If no store exists yet, enter one (first call in a retry chain)
    _retryStore.enterWith({ attempt });
  }
}

/**
 * Reset the retry attempt counter.
 * Called after all retries complete.
 */
export function resetRetryAttempt(): void {
  const store = _retryStore.getStore();
  if (store) {
    store.attempt = 0;
  }
}

/**
 * Run a function within a retry-tracking context.
 * Use this to wrap your entire retry loop so attempt numbers are
 * properly scoped and cleaned up.
 *
 * @example
 * ```ts
 * const result = await withRetryTracking(async () => {
 *   return pRetry(myFn, botanuRetryOptions({ retries: 3 }));
 * });
 * ```
 */
export function withRetryTracking<T>(fn: () => T | Promise<T>): Promise<T> {
  return _retryStore.run({ attempt: 0 }, async () => fn());
}

/**
 * Returns p-retry compatible options that track attempt numbers.
 */
export function botanuRetryOptions(baseOptions?: {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
}): Record<string, unknown> & {
  onFailedAttempt: (error: { attemptNumber: number }) => void;
} {
  return {
    ...baseOptions,
    onFailedAttempt: (error: { attemptNumber: number }) => {
      setRetryAttempt(error.attemptNumber + 1);
    },
  };
}

/**
 * Callback for use with retry libraries that support before/after hooks.
 * Sets the attempt number before each try.
 */
export function botanuBefore(retryState: { attemptNumber?: number; attempt?: number }): void {
  const attempt = retryState.attemptNumber ?? retryState.attempt ?? 1;
  setRetryAttempt(attempt);
}

/**
 * Callback to reset attempt counter after all retries complete.
 */
export function botanuAfterAll(): void {
  resetRetryAttempt();
}
