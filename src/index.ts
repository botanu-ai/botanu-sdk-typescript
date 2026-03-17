// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Botanu SDK — OpenTelemetry-native cost attribution for AI workflows.
 *
 * @example
 * ```ts
 * import { enable, botanuWorkflow, emitOutcome } from '@botanu/sdk';
 *
 * enable(); // reads config from env vars
 *
 * const handleRequest = botanuWorkflow(
 *   { name: 'Customer Support', eventId: 'ticket-123', customerId: 'acme-corp' },
 *   async (data) => {
 *     const result = await process(data);
 *     emitOutcome({ status: 'success', valueType: 'tickets_resolved', valueAmount: 1 });
 *     return result;
 *   },
 * );
 * ```
 */

// Bootstrap
export { enable, disable, isEnabled, getConfig } from './sdk/bootstrap.js';
export type { EnableOptions } from './sdk/bootstrap.js';

// Configuration
export { loadConfig, configToDict } from './sdk/config.js';
export type { BotanuConfig } from './sdk/config.js';

// Workflow tracing
export { botanuWorkflow, runBotanu, botanuOutcome, BotanuWorkflow } from './sdk/decorators.js';
export type { WorkflowOptions } from './sdk/decorators.js';

// Context helpers
export {
  getRunId,
  getWorkflow,
  getCurrentSpan,
  getBaggage,
  setBaggage,
  setBaggageOn,
  injectBotanuContext,
  extractBotanuCarrier,
} from './sdk/context.js';
export type { BotanuCarrier } from './sdk/context.js';

// Span helpers
export { emitOutcome, setBusinessContext, VALID_OUTCOME_STATUSES } from './sdk/span-helpers.js';
export type { EmitOutcomeOptions, BusinessContextOptions } from './sdk/span-helpers.js';

// Models
export { RunContext, RunStatus, generateRunId } from './models/run-context.js';
export type { RunOutcome, RunOutcomeStatus, RunContextOptions } from './models/run-context.js';

// Processors
export { RunContextEnricher } from './processors/enricher.js';

// Tracking — LLM
export {
  trackLlmCall,
  trackToolCall,
  setLlmAttributes,
  setTokenUsage,
  llmInstrumented,
  LLMTracker,
  ToolTracker,
  GenAIAttributes,
  BotanuAttributes,
  LLM_VENDORS,
  ModelOperation,
} from './tracking/llm.js';
export type { TrackLlmCallOptions, TrackToolCallOptions, LlmInstrumentedOptions } from './tracking/llm.js';

// Tracking — Data
export {
  trackDbOperation,
  trackStorageOperation,
  trackMessagingOperation,
  setDataMetrics,
  setWarehouseMetrics,
  DBTracker,
  StorageTracker,
  MessagingTracker,
  DB_SYSTEMS,
  STORAGE_SYSTEMS,
  MESSAGING_SYSTEMS,
  DBOperation,
  StorageOperation,
  MessagingOperation,
} from './tracking/data.js';
export type {
  TrackDbOptions,
  TrackStorageOptions,
  TrackMessagingOptions,
} from './tracking/data.js';

// Middleware
export {
  botanuExpressMiddleware,
  botanuFastifyPlugin,
  botanuKoaMiddleware,
  extractBotanuContext,
} from './sdk/middleware.js';
export type { MiddlewareOptions } from './sdk/middleware.js';

// Integrations
export {
  botanuRetryOptions,
  botanuBefore,
  botanuAfterAll,
  getRetryAttempt,
  setRetryAttempt,
  resetRetryAttempt,
  withRetryTracking,
} from './integrations/retry.js';
