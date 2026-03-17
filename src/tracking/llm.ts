// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * LLM/Model Tracking — Track AI model usage for cost attribution.
 *
 * Aligned with OpenTelemetry GenAI Semantic Conventions.
 *
 * @example
 * ```ts
 * const response = await trackLlmCall(
 *   { vendor: 'openai', model: 'gpt-4' },
 *   async (tracker) => {
 *     const res = await openai.chat.completions.create({ ... });
 *     tracker.setTokens(res.usage.prompt_tokens, res.usage.completion_tokens);
 *     tracker.setRequestId(res.id);
 *     return res;
 *   },
 * );
 * ```
 */

import {
  type Span,
  SpanKind,
  SpanStatusCode,
  context,
  trace,
} from '@opentelemetry/api';
import type { Counter, Histogram, Meter } from '@opentelemetry/api';
import { getRetryAttempt } from '../integrations/retry.js';

// =========================================================================
// OTel GenAI Semantic Convention Attribute Names
// =========================================================================

export const GenAIAttributes = {
  OPERATION_NAME: 'gen_ai.operation.name',
  PROVIDER_NAME: 'gen_ai.provider.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  RESPONSE_MODEL: 'gen_ai.response.model',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_TOP_P: 'gen_ai.request.top_p',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
  REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
  REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_CALL_ID: 'gen_ai.tool.call.id',
  ERROR_TYPE: 'error.type',
} as const;

export const BotanuAttributes = {
  VENDOR_REQUEST_ID: 'botanu.vendor.request_id',
  VENDOR_CLIENT_REQUEST_ID: 'botanu.vendor.client_request_id',
  TOKENS_CACHED: 'botanu.usage.cached_tokens',
  TOKENS_CACHED_READ: 'botanu.usage.cache_read_tokens',
  TOKENS_CACHED_WRITE: 'botanu.usage.cache_write_tokens',
  STREAMING: 'botanu.request.streaming',
  CACHE_HIT: 'botanu.request.cache_hit',
  ATTEMPT_NUMBER: 'botanu.request.attempt',
  TOOL_SUCCESS: 'botanu.tool.success',
  TOOL_ITEMS_RETURNED: 'botanu.tool.items_returned',
  TOOL_BYTES_PROCESSED: 'botanu.tool.bytes_processed',
  TOOL_DURATION_MS: 'botanu.tool.duration_ms',
  VENDOR: 'botanu.vendor',
} as const;

// =========================================================================
// Vendor name normalization
// =========================================================================

export const LLM_VENDORS: Record<string, string> = {
  openai: 'openai',
  azure_openai: 'azure.openai',
  'azure-openai': 'azure.openai',
  azureopenai: 'azure.openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  bedrock: 'aws.bedrock',
  aws_bedrock: 'aws.bedrock',
  amazon_bedrock: 'aws.bedrock',
  vertex: 'gcp.vertex_ai',
  vertexai: 'gcp.vertex_ai',
  vertex_ai: 'gcp.vertex_ai',
  gcp_vertex: 'gcp.vertex_ai',
  gemini: 'gcp.vertex_ai',
  google: 'gcp.vertex_ai',
  cohere: 'cohere',
  mistral: 'mistral',
  mistralai: 'mistral',
  together: 'together',
  togetherai: 'together',
  groq: 'groq',
  replicate: 'replicate',
  ollama: 'ollama',
  huggingface: 'huggingface',
  hf: 'huggingface',
  fireworks: 'fireworks',
  perplexity: 'perplexity',
};

export const ModelOperation = {
  CHAT: 'chat',
  TEXT_COMPLETION: 'text_completion',
  EMBEDDINGS: 'embeddings',
  GENERATE_CONTENT: 'generate_content',
  EXECUTE_TOOL: 'execute_tool',
  CREATE_AGENT: 'create_agent',
  INVOKE_AGENT: 'invoke_agent',
  RERANK: 'rerank',
  IMAGE_GENERATION: 'image_generation',
  IMAGE_EDIT: 'image_edit',
  SPEECH_TO_TEXT: 'speech_to_text',
  TEXT_TO_SPEECH: 'text_to_speech',
  MODERATION: 'moderation',
  // Aliases
  COMPLETION: 'text_completion',
  EMBEDDING: 'embeddings',
  FUNCTION_CALL: 'execute_tool',
  TOOL_USE: 'execute_tool',
} as const;

// =========================================================================
// GenAI Metrics
// =========================================================================

let _meter: Meter | undefined;
let _tokenUsageHistogram: Histogram | undefined;
let _operationDurationHistogram: Histogram | undefined;
let _attemptCounter: Counter | undefined;
let _toolDurationHistogram: Histogram | undefined;
let _toolCounter: Counter | undefined;

try {
  const { metrics } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
  _meter = metrics.getMeter('botanu.gen_ai');

  _tokenUsageHistogram = _meter.createHistogram('gen_ai.client.token.usage', {
    description: 'Number of input and output tokens used',
    unit: '{token}',
  });

  _operationDurationHistogram = _meter.createHistogram('gen_ai.client.operation.duration', {
    description: 'GenAI operation duration',
    unit: 's',
  });

  _attemptCounter = _meter.createCounter('botanu.gen_ai.attempts', {
    description: 'Number of request attempts (including retries)',
    unit: '{attempt}',
  });

  _toolDurationHistogram = _meter.createHistogram('botanu.tool.duration', {
    description: 'Tool execution duration',
    unit: 's',
  });

  _toolCounter = _meter.createCounter('botanu.tool.executions', {
    description: 'Number of tool executions',
    unit: '{execution}',
  });
} catch {
  // Metrics API not available — silently skip
}

function recordTokenMetrics(
  vendor: string,
  model: string,
  operation: string,
  inputTokens: number,
  outputTokens: number,
  errorType?: string,
): void {
  if (!_tokenUsageHistogram) return;

  const baseAttrs: Record<string, string> = {
    [GenAIAttributes.OPERATION_NAME]: operation,
    [GenAIAttributes.PROVIDER_NAME]: vendor,
    [GenAIAttributes.REQUEST_MODEL]: model,
  };
  if (errorType) baseAttrs[GenAIAttributes.ERROR_TYPE] = errorType;

  if (inputTokens > 0) {
    _tokenUsageHistogram.record(inputTokens, { ...baseAttrs, 'gen_ai.token.type': 'input' });
  }
  if (outputTokens > 0) {
    _tokenUsageHistogram.record(outputTokens, { ...baseAttrs, 'gen_ai.token.type': 'output' });
  }
}

function recordDurationMetric(
  vendor: string,
  model: string,
  operation: string,
  durationSeconds: number,
  errorType?: string,
): void {
  if (!_operationDurationHistogram) return;

  const attrs: Record<string, string> = {
    [GenAIAttributes.OPERATION_NAME]: operation,
    [GenAIAttributes.PROVIDER_NAME]: vendor,
    [GenAIAttributes.REQUEST_MODEL]: model,
  };
  if (errorType) attrs[GenAIAttributes.ERROR_TYPE] = errorType;

  _operationDurationHistogram.record(durationSeconds, attrs);
}

// =========================================================================
// LLM Tracker
// =========================================================================

export class LLMTracker {
  readonly vendor: string;
  readonly model: string;
  readonly operation: string;
  readonly span: Span | undefined;
  readonly startTime: number;

  inputTokens: number = 0;
  outputTokens: number = 0;
  cachedTokens: number = 0;
  cacheReadTokens: number = 0;
  cacheWriteTokens: number = 0;
  vendorRequestId?: string;
  clientRequestId?: string;
  responseModel?: string;
  finishReason?: string;
  isStreaming: boolean = false;
  cacheHit: boolean = false;
  attemptNumber: number = 1;
  errorType?: string;

  constructor(vendor: string, model: string, operation: string, span?: Span) {
    this.vendor = vendor;
    this.model = model;
    this.operation = operation;
    this.span = span;
    this.startTime = Date.now();
  }

  setTokens(
    inputTokens: number = 0,
    outputTokens: number = 0,
    options?: {
      cachedTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    },
  ): this {
    this.inputTokens = Math.max(0, inputTokens);
    this.outputTokens = Math.max(0, outputTokens);
    this.cachedTokens = Math.max(0, options?.cachedTokens ?? options?.cacheReadTokens ?? 0);
    this.cacheReadTokens = Math.max(0, options?.cacheReadTokens ?? 0);
    this.cacheWriteTokens = Math.max(0, options?.cacheWriteTokens ?? 0);

    if (this.span) {
      this.span.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, inputTokens);
      this.span.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, outputTokens);
      if (this.cachedTokens > 0) this.span.setAttribute(BotanuAttributes.TOKENS_CACHED, this.cachedTokens);
      if (this.cacheReadTokens > 0) this.span.setAttribute(BotanuAttributes.TOKENS_CACHED_READ, this.cacheReadTokens);
      if (this.cacheWriteTokens > 0) this.span.setAttribute(BotanuAttributes.TOKENS_CACHED_WRITE, this.cacheWriteTokens);
    }
    return this;
  }

  setRequestId(vendorRequestId?: string, clientRequestId?: string): this {
    if (vendorRequestId) {
      this.vendorRequestId = vendorRequestId;
      if (this.span) {
        this.span.setAttribute(GenAIAttributes.RESPONSE_ID, vendorRequestId);
        this.span.setAttribute(BotanuAttributes.VENDOR_REQUEST_ID, vendorRequestId);
      }
    }
    if (clientRequestId) {
      this.clientRequestId = clientRequestId;
      if (this.span) {
        this.span.setAttribute(BotanuAttributes.VENDOR_CLIENT_REQUEST_ID, clientRequestId);
      }
    }
    return this;
  }

  setResponseModel(model: string): this {
    this.responseModel = model;
    this.span?.setAttribute(GenAIAttributes.RESPONSE_MODEL, model);
    return this;
  }

  setFinishReason(reason: string): this {
    this.finishReason = reason;
    this.span?.setAttribute(GenAIAttributes.RESPONSE_FINISH_REASONS, [reason]);
    return this;
  }

  setStreaming(isStreaming: boolean = true): this {
    this.isStreaming = isStreaming;
    this.span?.setAttribute(BotanuAttributes.STREAMING, isStreaming);
    return this;
  }

  setCacheHit(cacheHit: boolean = true): this {
    this.cacheHit = cacheHit;
    this.span?.setAttribute(BotanuAttributes.CACHE_HIT, cacheHit);
    return this;
  }

  setAttempt(attemptNumber: number): this {
    this.attemptNumber = attemptNumber;
    this.span?.setAttribute(BotanuAttributes.ATTEMPT_NUMBER, attemptNumber);
    return this;
  }

  setRequestParams(params: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stopSequences?: string[];
    frequencyPenalty?: number;
    presencePenalty?: number;
  }): this {
    if (this.span) {
      if (params.temperature != null) this.span.setAttribute(GenAIAttributes.REQUEST_TEMPERATURE, params.temperature);
      if (params.topP != null) this.span.setAttribute(GenAIAttributes.REQUEST_TOP_P, params.topP);
      if (params.maxTokens != null) this.span.setAttribute(GenAIAttributes.REQUEST_MAX_TOKENS, params.maxTokens);
      if (params.stopSequences) this.span.setAttribute(GenAIAttributes.REQUEST_STOP_SEQUENCES, params.stopSequences);
      if (params.frequencyPenalty != null) this.span.setAttribute(GenAIAttributes.REQUEST_FREQUENCY_PENALTY, params.frequencyPenalty);
      if (params.presencePenalty != null) this.span.setAttribute(GenAIAttributes.REQUEST_PRESENCE_PENALTY, params.presencePenalty);
    }
    return this;
  }

  setError(error: Error): this {
    this.errorType = error.constructor.name;
    if (this.span) {
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      this.span.setAttribute(GenAIAttributes.ERROR_TYPE, this.errorType);
      this.span.recordException(error);
    }
    return this;
  }

  addMetadata(attrs: Record<string, string | number | boolean>): this {
    if (this.span) {
      for (const [key, value] of Object.entries(attrs)) {
        const attrKey = key.startsWith('botanu.') || key.startsWith('gen_ai.') ? key : `botanu.${key}`;
        this.span.setAttribute(attrKey, value);
      }
    }
    return this;
  }

  /** @internal */
  _finalize(): void {
    if (!this.span) return;

    const durationSeconds = (Date.now() - this.startTime) / 1000;

    recordTokenMetrics(
      this.vendor,
      this.model,
      this.operation,
      this.inputTokens,
      this.outputTokens,
      this.errorType,
    );
    recordDurationMetric(
      this.vendor,
      this.model,
      this.operation,
      durationSeconds,
      this.errorType,
    );
    _attemptCounter?.add(1, {
      [GenAIAttributes.PROVIDER_NAME]: this.vendor,
      [GenAIAttributes.REQUEST_MODEL]: this.model,
      [GenAIAttributes.OPERATION_NAME]: this.operation,
      status: this.errorType ? 'error' : 'success',
    });
  }
}

// =========================================================================
// Track LLM Call
// =========================================================================

export interface TrackLlmCallOptions {
  vendor: string;
  model: string;
  operation?: string;
  clientRequestId?: string;
  extraAttrs?: Record<string, string | number | boolean>;
}

/**
 * Track an LLM/model call with OTel GenAI semantic conventions.
 *
 * Creates a child span (SpanKind.CLIENT) with standard attributes.
 */
export async function trackLlmCall<T>(
  options: TrackLlmCallOptions,
  fn: (tracker: LLMTracker) => T | Promise<T>,
): Promise<T> {
  const llmTracer = trace.getTracer('botanu.gen_ai');
  const operation = options.operation ?? ModelOperation.CHAT;
  const normalizedVendor = LLM_VENDORS[options.vendor.toLowerCase()] ?? options.vendor.toLowerCase();
  const spanName = `${operation} ${options.model}`;

  return llmTracer.startActiveSpan(
    spanName,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute(GenAIAttributes.OPERATION_NAME, operation);
      span.setAttribute(GenAIAttributes.PROVIDER_NAME, normalizedVendor);
      span.setAttribute(GenAIAttributes.REQUEST_MODEL, options.model);
      span.setAttribute(BotanuAttributes.VENDOR, normalizedVendor);

      if (options.extraAttrs) {
        for (const [key, value] of Object.entries(options.extraAttrs)) {
          const attrKey = key.startsWith('botanu.') || key.startsWith('gen_ai.') ? key : `botanu.${key}`;
          span.setAttribute(attrKey, value);
        }
      }

      const tracker = new LLMTracker(normalizedVendor, options.model, operation, span);
      if (options.clientRequestId) {
        tracker.setRequestId(undefined, options.clientRequestId);
      }

      // Auto-detect retry attempt from retry integration
      const ctxAttempt = getRetryAttempt();
      if (ctxAttempt > 0) {
        tracker.setAttempt(ctxAttempt);
      }

      try {
        const result = await fn(tracker);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tracker.setError(error);
        throw err;
      } finally {
        tracker._finalize();
        span.end();
      }
    },
  );
}

// =========================================================================
// Tool/Function Call Tracker
// =========================================================================

export class ToolTracker {
  readonly toolName: string;
  toolCallId?: string;
  vendor?: string;
  readonly span: Span | undefined;
  readonly startTime: number;

  success: boolean = true;
  itemsReturned: number = 0;
  bytesProcessed: number = 0;
  errorType?: string;

  constructor(toolName: string, span?: Span, toolCallId?: string, vendor?: string) {
    this.toolName = toolName;
    this.span = span;
    this.toolCallId = toolCallId;
    this.vendor = vendor;
    this.startTime = Date.now();
  }

  setResult(options: {
    success?: boolean;
    itemsReturned?: number;
    bytesProcessed?: number;
  }): this {
    this.success = options.success ?? true;
    this.itemsReturned = options.itemsReturned ?? 0;
    this.bytesProcessed = options.bytesProcessed ?? 0;
    if (this.span) {
      this.span.setAttribute(BotanuAttributes.TOOL_SUCCESS, this.success);
      if (this.itemsReturned > 0) this.span.setAttribute(BotanuAttributes.TOOL_ITEMS_RETURNED, this.itemsReturned);
      if (this.bytesProcessed > 0) this.span.setAttribute(BotanuAttributes.TOOL_BYTES_PROCESSED, this.bytesProcessed);
    }
    return this;
  }

  setToolCallId(toolCallId: string): this {
    this.toolCallId = toolCallId;
    this.span?.setAttribute(GenAIAttributes.TOOL_CALL_ID, toolCallId);
    return this;
  }

  setError(error: Error): this {
    this.success = false;
    this.errorType = error.constructor.name;
    if (this.span) {
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      this.span.setAttribute(GenAIAttributes.ERROR_TYPE, this.errorType);
      this.span.recordException(error);
    }
    return this;
  }

  addMetadata(attrs: Record<string, string | number | boolean>): this {
    if (this.span) {
      for (const [key, value] of Object.entries(attrs)) {
        const attrKey = key.startsWith('botanu.') || key.startsWith('gen_ai.') ? key : `botanu.tool.${key}`;
        this.span.setAttribute(attrKey, value);
      }
    }
    return this;
  }

  /** @internal */
  _finalize(): void {
    if (!this.span) return;
    const durationSeconds = (Date.now() - this.startTime) / 1000;
    this.span.setAttribute(BotanuAttributes.TOOL_DURATION_MS, durationSeconds * 1000);

    const attrs: Record<string, string> = {
      [GenAIAttributes.TOOL_NAME]: this.toolName,
      status: this.errorType ? 'error' : 'success',
    };
    if (this.vendor) {
      attrs[GenAIAttributes.PROVIDER_NAME] = this.vendor;
    }

    _toolDurationHistogram?.record(durationSeconds, attrs);
    _toolCounter?.add(1, attrs);
  }
}

export interface TrackToolCallOptions {
  toolName: string;
  toolCallId?: string;
  vendor?: string;
  extraAttrs?: Record<string, string | number | boolean>;
}

/**
 * Track a tool/function call execution.
 */
export async function trackToolCall<T>(
  options: TrackToolCallOptions,
  fn: (tracker: ToolTracker) => T | Promise<T>,
): Promise<T> {
  const toolTracer = trace.getTracer('botanu.gen_ai');
  const spanName = `execute_tool ${options.toolName}`;

  return toolTracer.startActiveSpan(
    spanName,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute(GenAIAttributes.OPERATION_NAME, ModelOperation.EXECUTE_TOOL);
      span.setAttribute(GenAIAttributes.TOOL_NAME, options.toolName);

      if (options.toolCallId) span.setAttribute(GenAIAttributes.TOOL_CALL_ID, options.toolCallId);
      if (options.vendor) {
        const normalized = LLM_VENDORS[options.vendor.toLowerCase()] ?? options.vendor.toLowerCase();
        span.setAttribute(GenAIAttributes.PROVIDER_NAME, normalized);
        span.setAttribute(BotanuAttributes.VENDOR, normalized);
      }

      if (options.extraAttrs) {
        for (const [key, value] of Object.entries(options.extraAttrs)) {
          const attrKey = key.startsWith('botanu.') || key.startsWith('gen_ai.') ? key : `botanu.tool.${key}`;
          span.setAttribute(attrKey, value);
        }
      }

      const tracker = new ToolTracker(options.toolName, span, options.toolCallId, options.vendor);

      try {
        const result = await fn(tracker);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tracker.setError(error);
        throw err;
      } finally {
        tracker._finalize();
        span.end();
      }
    },
  );
}

// =========================================================================
// Standalone Helpers
// =========================================================================

export function setLlmAttributes(options: {
  vendor: string;
  model: string;
  operation?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  streaming?: boolean;
  vendorRequestId?: string;
  span?: Span;
}): void {
  const targetSpan = options.span ?? trace.getSpan(context.active());
  if (!targetSpan?.isRecording()) return;

  const normalizedVendor = LLM_VENDORS[options.vendor.toLowerCase()] ?? options.vendor.toLowerCase();
  const operation = options.operation ?? ModelOperation.CHAT;

  targetSpan.setAttribute(GenAIAttributes.OPERATION_NAME, operation);
  targetSpan.setAttribute(GenAIAttributes.PROVIDER_NAME, normalizedVendor);
  targetSpan.setAttribute(GenAIAttributes.REQUEST_MODEL, options.model);
  targetSpan.setAttribute(BotanuAttributes.VENDOR, normalizedVendor);

  if (options.inputTokens && options.inputTokens > 0) {
    targetSpan.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, options.inputTokens);
  }
  if (options.outputTokens && options.outputTokens > 0) {
    targetSpan.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, options.outputTokens);
  }
  if (options.cachedTokens && options.cachedTokens > 0) {
    targetSpan.setAttribute(BotanuAttributes.TOKENS_CACHED, options.cachedTokens);
  }
  if (options.streaming) {
    targetSpan.setAttribute(BotanuAttributes.STREAMING, true);
  }
  if (options.vendorRequestId) {
    targetSpan.setAttribute(GenAIAttributes.RESPONSE_ID, options.vendorRequestId);
    targetSpan.setAttribute(BotanuAttributes.VENDOR_REQUEST_ID, options.vendorRequestId);
  }

  recordTokenMetrics(
    normalizedVendor,
    options.model,
    operation,
    options.inputTokens ?? 0,
    options.outputTokens ?? 0,
  );
}

export function setTokenUsage(
  inputTokens: number,
  outputTokens: number,
  cachedTokens?: number,
  span?: Span,
): void {
  const targetSpan = span ?? trace.getSpan(context.active());
  if (!targetSpan?.isRecording()) return;

  targetSpan.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, inputTokens);
  targetSpan.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, outputTokens);

  if (cachedTokens && cachedTokens > 0) {
    targetSpan.setAttribute(BotanuAttributes.TOKENS_CACHED, cachedTokens);
  }
}

// =========================================================================
// LLM Instrumented Decorator
// =========================================================================

export interface LlmInstrumentedOptions {
  /** LLM vendor name (e.g., "openai", "anthropic"). */
  vendor: string;
  /** Name of the parameter containing the model name (default: "model"). */
  modelParam?: string;
  /** Whether to extract tokens from response.usage (default: true). */
  tokensFromResponse?: boolean;
}

/**
 * Decorator to auto-instrument LLM client methods.
 *
 * Wraps a function so every call is tracked via {@link trackLlmCall},
 * automatically extracting tokens from `response.usage` if present.
 *
 * @example
 * ```ts
 * const chat = llmInstrumented({ vendor: 'openai' }, async (params) => {
 *   return openai.chat.completions.create(params);
 * });
 * const response = await chat({ model: 'gpt-4', messages: [...] });
 * ```
 */
export function llmInstrumented<TArgs extends Record<string, unknown>, TResult>(
  options: LlmInstrumentedOptions,
  fn: (args: TArgs) => TResult | Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  const modelParam = options.modelParam ?? 'model';
  const tokensFromResponse = options.tokensFromResponse ?? true;

  return async (args: TArgs): Promise<TResult> => {
    const model = (args[modelParam] as string) ?? 'unknown';

    return trackLlmCall(
      { vendor: options.vendor, model },
      async (tracker) => {
        if (args.stream) {
          tracker.setStreaming(true);
        }

        const response = await fn(args);

        if (tokensFromResponse && response && typeof response === 'object') {
          const res = response as Record<string, unknown>;
          if (res.usage && typeof res.usage === 'object') {
            const usage = res.usage as Record<string, number>;
            tracker.setTokens(
              usage.prompt_tokens ?? usage.input_tokens ?? 0,
              usage.completion_tokens ?? usage.output_tokens ?? 0,
            );
          }
        }

        return response;
      },
    );
  };
}
