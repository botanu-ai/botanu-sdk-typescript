// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Decorators and wrappers for automatic run span creation and context propagation.
 *
 * botanuWorkflow() is the primary integration point. It creates a "run span" that:
 * - Generates a UUIDv7 run_id
 * - Emits run.started and run.completed events
 * - Propagates run context via W3C Baggage
 * - Records outcome at completion
 */

import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { createHash } from 'crypto';
import { RunContext, RunStatus } from '../models/run-context.js';
import { getBaggage } from './context.js';
import { emitOutcome } from './span-helpers.js';

const tracer = trace.getTracer('botanu_sdk');

function computeWorkflowVersion(fn: Function): string {
  try {
    const source = fn.toString();
    const hash = createHash('sha256').update(source).digest('hex');
    return `v:${hash.slice(0, 12)}`;
  } catch {
    return 'v:unknown';
  }
}

function getParentRunId(): string | undefined {
  return getBaggage('botanu.run_id');
}

export interface WorkflowOptions {
  name: string;
  eventId: string | ((...args: unknown[]) => string);
  customerId: string | ((...args: unknown[]) => string);
  environment?: string;
  tenantId?: string;
  autoOutcomeOnSuccess?: boolean;
  spanKind?: SpanKind;
}

type AsyncFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

/**
 * Wrap a function as a Botanu workflow with automatic run span creation.
 *
 * Creates a UUIDv7 run_id, creates a botanu.run span as the root of the run,
 * emits run.started event, propagates run context via W3C Baggage, and on
 * completion emits run.completed event with outcome.
 *
 * @example
 * ```ts
 * const handleTicket = botanuWorkflow(
 *   { name: "Customer Support", eventId: (ctx) => ctx.ticketId, customerId: (ctx) => ctx.orgId },
 *   async (ctx: TicketContext) => {
 *     // ... your workflow logic
 *   }
 * );
 * ```
 */
export function botanuWorkflow<TArgs extends unknown[], TResult>(
  options: WorkflowOptions,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const {
    name,
    eventId,
    customerId,
    environment,
    tenantId,
    autoOutcomeOnSuccess = true,
    spanKind = SpanKind.SERVER,
  } = options;

  // Validate
  if (typeof eventId === 'string' && !eventId) {
    throw new Error('eventId is required and must be a non-empty string');
  }
  if (typeof customerId === 'string' && !customerId) {
    throw new Error('customerId is required and must be a non-empty string');
  }

  const workflowVersion = computeWorkflowVersion(fn);

  return async function botanuWrapped(...args: TArgs): Promise<TResult> {
    const resolvedEventId =
      typeof eventId === 'function' ? eventId(...args) : eventId;
    const resolvedCustomerId =
      typeof customerId === 'function' ? customerId(...args) : customerId;

    if (!resolvedEventId) {
      console.warn(
        `Botanu: eventId resolved to empty value in workflow '${name}'. ` +
          'Cost attribution will be broken. Check your eventId function.',
      );
    }
    if (!resolvedCustomerId) {
      console.warn(
        `Botanu: customerId resolved to empty value in workflow '${name}'. ` +
          'Cost attribution will be broken. Check your customerId function.',
      );
    }

    const parentRunId = getParentRunId();

    const runCtx = RunContext.create({
      workflow: name,
      eventId: resolvedEventId,
      customerId: resolvedCustomerId,
      workflowVersion,
      environment,
      tenantId,
      parentRunId,
    });

    return tracer.startActiveSpan(
      `botanu.run/${name}`,
      { kind: spanKind },
      async (span) => {
        // Set all run context attributes
        for (const [key, value] of Object.entries(runCtx.toSpanAttributes())) {
          span.setAttribute(key, value);
        }

        span.addEvent('botanu.run.started', {
          run_id: runCtx.runId,
          workflow: runCtx.workflow,
        });

        // Propagate baggage
        let ctx = context.active();
        let baggage = propagation.getBaggage(ctx) ?? propagation.createBaggage();
        for (const [key, value] of Object.entries(runCtx.toBaggageDict())) {
          baggage = baggage.setEntry(key, { value });
        }
        ctx = propagation.setBaggage(ctx, baggage);

        try {
          const result = await context.with(ctx, () => fn(...args));

          // Only auto-complete if user hasn't already emitted an outcome
          const existingOutcome = (span as unknown as { attributes?: Record<string, unknown> })
            ?.attributes?.['botanu.outcome.status'];
          if (existingOutcome == null && autoOutcomeOnSuccess) {
            runCtx.complete(RunStatus.SUCCESS);
          }

          span.setStatus({ code: SpanStatusCode.OK });
          emitRunCompleted(span, runCtx, RunStatus.SUCCESS);

          return result as TResult;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          span.recordException(error);

          runCtx.complete(RunStatus.FAILURE, { errorClass: error.constructor.name });
          emitRunCompleted(span, runCtx, RunStatus.FAILURE, error.constructor.name);

          throw err;
        } finally {
          span.end();
        }
      },
    );
  };
}

/**
 * Context-manager style alternative to botanuWorkflow — for when you can't wrap a function.
 *
 * @example
 * ```ts
 * const result = await runBotanu(
 *   { name: "My Workflow", eventId: "evt_123", customerId: "cust_456" },
 *   async () => {
 *     // traced code
 *   }
 * );
 * ```
 */
export async function runBotanu<T>(
  options: Omit<WorkflowOptions, 'eventId' | 'customerId'> & {
    eventId: string;
    customerId: string;
  },
  callback: (runCtx: RunContext) => T | Promise<T>,
): Promise<T> {
  const {
    name,
    eventId,
    customerId,
    environment,
    tenantId,
    autoOutcomeOnSuccess = true,
    spanKind = SpanKind.SERVER,
  } = options;

  const parentRunId = getParentRunId();

  const runCtx = RunContext.create({
    workflow: name,
    eventId,
    customerId,
    environment,
    tenantId,
    parentRunId,
  });

  return tracer.startActiveSpan(
    `botanu.run/${name}`,
    { kind: spanKind },
    async (span) => {
      for (const [key, value] of Object.entries(runCtx.toSpanAttributes())) {
        span.setAttribute(key, value);
      }

      span.addEvent('botanu.run.started', {
        run_id: runCtx.runId,
        workflow: runCtx.workflow,
      });

      let ctx = context.active();
      let baggage = propagation.getBaggage(ctx) ?? propagation.createBaggage();
      for (const [key, value] of Object.entries(runCtx.toBaggageDict())) {
        baggage = baggage.setEntry(key, { value });
      }
      ctx = propagation.setBaggage(ctx, baggage);

      try {
        const result = await context.with(ctx, () => callback(runCtx));

        // Only auto-complete if user hasn't already emitted an outcome
        const existingOutcome = (span as unknown as { attributes?: Record<string, unknown> })
          ?.attributes?.['botanu.outcome.status'];
        if (existingOutcome == null && autoOutcomeOnSuccess) {
          runCtx.complete(RunStatus.SUCCESS);
        }

        span.setStatus({ code: SpanStatusCode.OK });
        emitRunCompleted(span, runCtx, RunStatus.SUCCESS);

        return result as T;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);

        runCtx.complete(RunStatus.FAILURE, { errorClass: error.constructor.name });
        emitRunCompleted(span, runCtx, RunStatus.FAILURE, error.constructor.name);

        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Decorator to automatically emit outcomes based on function result.
 *
 * Does NOT create a new run — use botanuWorkflow for that.
 */
export function botanuOutcome<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async function outcomeWrapped(...args: TArgs): Promise<TResult> {
    try {
      const result = await fn(...args);
      const span = trace.getSpan(context.active());
      const attrs = (span as unknown as { attributes?: Record<string, unknown> })?.attributes;
      if (!attrs?.['botanu.outcome.status']) {
        emitOutcome('success');
      }
      return result as TResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      emitOutcome('failed', { reason: error.constructor.name });
      throw err;
    }
  };
}

// TC39 Stage 3 class method decorator
export function BotanuWorkflow(options: WorkflowOptions) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const wrapped = botanuWorkflow(options, originalMethod);
    descriptor.value = wrapped;
    return descriptor;
  };
}

function emitRunCompleted(
  span: import('@opentelemetry/api').Span,
  runCtx: RunContext,
  status: RunStatus,
  errorClass?: string,
): void {
  const durationMs = Date.now() - runCtx.startTime.getTime();

  const eventAttrs: Record<string, string | number> = {
    run_id: runCtx.runId,
    workflow: runCtx.workflow,
    status: status,
    duration_ms: durationMs,
  };

  if (errorClass) eventAttrs.error_class = errorClass;
  if (runCtx.outcome?.valueType) eventAttrs.value_type = runCtx.outcome.valueType;
  if (runCtx.outcome?.valueAmount != null) eventAttrs.value_amount = runCtx.outcome.valueAmount;

  span.addEvent('botanu.run.completed', eventAttrs);

  // Only set outcome status if user hasn't already emitted one via emitOutcome()
  const existing = (span as unknown as { attributes?: Record<string, unknown> })
    ?.attributes?.['botanu.outcome.status'];
  if (existing == null) {
    span.setAttribute('botanu.outcome.status', status);
  }

  span.setAttribute('botanu.run.duration_ms', durationMs);
}
