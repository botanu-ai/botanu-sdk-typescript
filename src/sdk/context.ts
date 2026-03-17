// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Context and baggage helpers for Botanu SDK.
 *
 * Uses OpenTelemetry Context and Baggage for propagation.
 */

import {
  type Context,
  context,
  propagation,
  trace,
  type Span,
} from '@opentelemetry/api';

/**
 * Set a baggage value and return the new Context.
 *
 * In Node.js OTel there is no imperative `attach/detach` like Python.
 * Context is always scoped via `context.with()`. Use the returned Context
 * to run code with the baggage active:
 *
 * @example
 * ```ts
 * const ctx = setBaggage('botanu.custom', 'value');
 * await context.with(ctx, async () => {
 *   // baggage is available to all child spans here
 * });
 * ```
 *
 * For setting multiple keys, chain calls:
 * ```ts
 * let ctx = setBaggage('botanu.custom1', 'a');
 * ctx = setBaggageOn(ctx, 'botanu.custom2', 'b');
 * await context.with(ctx, async () => { ... });
 * ```
 */
export function setBaggage(key: string, value: string): Context {
  const active = context.active();
  const currentBaggage = propagation.getBaggage(active) ?? propagation.createBaggage();
  const newBaggage = currentBaggage.setEntry(key, { value });
  return propagation.setBaggage(active, newBaggage);
}

/**
 * Set a baggage value on an existing Context (for chaining multiple keys).
 */
export function setBaggageOn(ctx: Context, key: string, value: string): Context {
  const currentBaggage = propagation.getBaggage(ctx) ?? propagation.createBaggage();
  const newBaggage = currentBaggage.setEntry(key, { value });
  return propagation.setBaggage(ctx, newBaggage);
}

export function getBaggage(key: string): string | undefined {
  const bag = propagation.getBaggage(context.active());
  return bag?.getEntry(key)?.value;
}

export function getCurrentSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

export function getRunId(): string | undefined {
  return getBaggage('botanu.run_id');
}

export function getWorkflow(): string | undefined {
  return getBaggage('botanu.workflow');
}

// =========================================================================
// Message Queue / Async Context Helpers
// =========================================================================

/** Botanu context keys for serialization into message payloads. */
const BOTANU_CONTEXT_KEYS = [
  'botanu.run_id',
  'botanu.workflow',
  'botanu.event_id',
  'botanu.customer_id',
  'botanu.environment',
  'botanu.tenant_id',
  'botanu.parent_run_id',
] as const;

/**
 * Serialized Botanu context for transport over message queues, webhooks, etc.
 */
export interface BotanuCarrier {
  'botanu.run_id'?: string;
  'botanu.workflow'?: string;
  'botanu.event_id'?: string;
  'botanu.customer_id'?: string;
  'botanu.environment'?: string;
  'botanu.tenant_id'?: string;
  'botanu.parent_run_id'?: string;
  [key: string]: string | undefined;
}

/**
 * Extract current Botanu context into a plain object for injection into
 * message payloads, queue headers, or any non-HTTP transport.
 *
 * Use on the **producer** side of a message queue.
 *
 * @example
 * ```ts
 * // Kafka producer
 * const carrier = injectBotanuContext();
 * await producer.send({
 *   topic: 'tasks',
 *   messages: [{
 *     value: JSON.stringify(payload),
 *     headers: carrier,  // or embed in message body
 *   }],
 * });
 * ```
 */
export function injectBotanuContext(): BotanuCarrier {
  const carrier: BotanuCarrier = {};
  for (const key of BOTANU_CONTEXT_KEYS) {
    const value = getBaggage(key);
    if (value) carrier[key] = value;
  }

  // Also inject W3C traceparent for trace correlation
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  if (headers.traceparent) carrier.traceparent = headers.traceparent;
  if (headers.tracestate) carrier.tracestate = headers.tracestate;

  return carrier;
}

/**
 * Restore Botanu context from a carrier object received via message queue
 * or any non-HTTP transport. Returns a Context for use with `context.with()`.
 *
 * Use on the **consumer** side of a message queue.
 *
 * @example
 * ```ts
 * // Kafka consumer
 * consumer.eachMessage(async ({ message }) => {
 *   const carrier = message.headers as BotanuCarrier;
 *   const ctx = extractBotanuContext(carrier);
 *
 *   await context.with(ctx, async () => {
 *     // All spans created here will have botanu.run_id, botanu.workflow, etc.
 *     await processMessage(message.value);
 *     emitOutcome('success');
 *   });
 * });
 * ```
 */
export function extractBotanuCarrier(carrier: Record<string, unknown>): Context {
  // Normalize carrier values — MQ systems may use Buffers (Kafka), objects (SQS),
  // or other types instead of plain strings.
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(carrier)) {
    if (raw == null) continue;
    // Handle Buffer (Kafka headers), objects with toString, and plain strings
    normalized[key] = Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw);
  }

  // Extract W3C trace context (traceparent/tracestate) if present
  let ctx = propagation.extract(context.active(), normalized);

  // Restore botanu baggage
  let bag = propagation.getBaggage(ctx) ?? propagation.createBaggage();
  for (const key of BOTANU_CONTEXT_KEYS) {
    const value = normalized[key];
    if (value) {
      bag = bag.setEntry(key, { value });
    }
  }
  ctx = propagation.setBaggage(ctx, bag);

  return ctx;
}
