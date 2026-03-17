// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * HTTP middleware for span enrichment.
 *
 * Works alongside OpenTelemetry's auto-instrumentation to enrich
 * spans with Botanu-specific context.
 */

import {
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import { randomUUID } from 'crypto';

export interface MiddlewareOptions {
  workflow: string;
  autoGenerateRunId?: boolean;
}

type NextFunction = (err?: unknown) => void;

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}

interface OutgoingResponse {
  setHeader?: (name: string, value: string) => void;
  set?: (name: string, value: string) => void;
}

function getHeader(req: IncomingRequest, name: string): string | undefined {
  const val = req.headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return val;
}

/**
 * Express middleware to enrich spans with Botanu context.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { botanuExpressMiddleware } from '@botanu/sdk/middleware';
 *
 * const app = express();
 * app.use(botanuExpressMiddleware({ workflow: 'customer_support' }));
 * ```
 */
export function botanuExpressMiddleware(options: MiddlewareOptions) {
  const { workflow, autoGenerateRunId = true } = options;

  return function middleware(req: IncomingRequest, res: OutgoingResponse, next: NextFunction): void {
    const span = trace.getSpan(context.active());
    if (!span) {
      next();
      return;
    }

    // Extract Botanu context from baggage or headers
    const bag = propagation.getBaggage(context.active());

    let runId = bag?.getEntry('botanu.run_id')?.value ?? getHeader(req, 'x-botanu-run-id');
    if (!runId && autoGenerateRunId) {
      runId = randomUUID();
    }

    const wf = bag?.getEntry('botanu.workflow')?.value ?? getHeader(req, 'x-botanu-workflow') ?? workflow;
    const customerId = bag?.getEntry('botanu.customer_id')?.value ?? getHeader(req, 'x-botanu-customer-id');

    // Enrich span
    if (runId) span.setAttribute('botanu.run_id', runId);
    span.setAttribute('botanu.workflow', wf);
    if (customerId) span.setAttribute('botanu.customer_id', customerId);
    if (req.url) span.setAttribute('http.route', req.url);
    if (req.method) span.setAttribute('http.method', req.method);

    // Propagate baggage
    let newBaggage = bag ?? propagation.createBaggage();
    if (runId) newBaggage = newBaggage.setEntry('botanu.run_id', { value: runId });
    newBaggage = newBaggage.setEntry('botanu.workflow', { value: wf });
    if (customerId) newBaggage = newBaggage.setEntry('botanu.customer_id', { value: customerId });

    const ctx = propagation.setBaggage(context.active(), newBaggage);

    context.with(ctx, () => {
      // Set response headers
      const setHeaderFn = res.setHeader ?? res.set;
      if (setHeaderFn) {
        if (runId) setHeaderFn.call(res, 'x-botanu-run-id', runId);
        setHeaderFn.call(res, 'x-botanu-workflow', wf);
      }

      next();
    });
  };
}

/**
 * Fastify plugin to enrich spans with Botanu context.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { botanuFastifyPlugin } from '@botanu/sdk/middleware';
 *
 * const app = Fastify();
 * app.register(botanuFastifyPlugin, { workflow: 'customer_support' });
 * ```
 */
export function botanuFastifyPlugin(
  fastify: { addHook: (hook: string, handler: Function) => void },
  options: MiddlewareOptions,
  done: (err?: Error) => void,
): void {
  const { workflow, autoGenerateRunId = true } = options;

  fastify.addHook('onRequest', (request: { headers: Record<string, string | string[] | undefined> }, reply: { header: (name: string, value: string) => void }, hookDone: () => void) => {
    const span = trace.getSpan(context.active());
    if (!span) {
      hookDone();
      return;
    }

    const bag = propagation.getBaggage(context.active());

    let runId = bag?.getEntry('botanu.run_id')?.value ?? getHeader(request, 'x-botanu-run-id');
    if (!runId && autoGenerateRunId) {
      runId = randomUUID();
    }

    const wf = bag?.getEntry('botanu.workflow')?.value ?? getHeader(request, 'x-botanu-workflow') ?? workflow;
    const customerId = bag?.getEntry('botanu.customer_id')?.value ?? getHeader(request, 'x-botanu-customer-id');

    if (runId) span.setAttribute('botanu.run_id', runId);
    span.setAttribute('botanu.workflow', wf);
    if (customerId) span.setAttribute('botanu.customer_id', customerId);

    // Propagate baggage so downstream spans inherit botanu context
    let newBaggage = bag ?? propagation.createBaggage();
    if (runId) newBaggage = newBaggage.setEntry('botanu.run_id', { value: runId });
    newBaggage = newBaggage.setEntry('botanu.workflow', { value: wf });
    if (customerId) newBaggage = newBaggage.setEntry('botanu.customer_id', { value: customerId });

    const ctx = propagation.setBaggage(context.active(), newBaggage);

    context.with(ctx, () => {
      if (runId) reply.header('x-botanu-run-id', runId!);
      reply.header('x-botanu-workflow', wf);

      hookDone();
    });
  });

  done();
}

/**
 * Koa middleware to enrich spans with Botanu context.
 */
export function botanuKoaMiddleware(options: MiddlewareOptions) {
  const { workflow, autoGenerateRunId = true } = options;

  return async function middleware(
    koaCtx: {
      request: { headers: Record<string, string | string[] | undefined> };
      set: (name: string, value: string) => void;
    },
    next: () => Promise<void>,
  ): Promise<void> {
    const span = trace.getSpan(context.active());
    if (!span) {
      await next();
      return;
    }

    const bag = propagation.getBaggage(context.active());

    let runId = bag?.getEntry('botanu.run_id')?.value ?? getHeader(koaCtx.request, 'x-botanu-run-id');
    if (!runId && autoGenerateRunId) {
      runId = randomUUID();
    }

    const wf = bag?.getEntry('botanu.workflow')?.value ?? getHeader(koaCtx.request, 'x-botanu-workflow') ?? workflow;
    const customerId = bag?.getEntry('botanu.customer_id')?.value ?? getHeader(koaCtx.request, 'x-botanu-customer-id');

    if (runId) span.setAttribute('botanu.run_id', runId);
    span.setAttribute('botanu.workflow', wf);
    if (customerId) span.setAttribute('botanu.customer_id', customerId);

    if (runId) koaCtx.set('x-botanu-run-id', runId);
    koaCtx.set('x-botanu-workflow', wf);

    // Propagate baggage so downstream spans inherit botanu context
    let newBaggage = bag ?? propagation.createBaggage();
    if (runId) newBaggage = newBaggage.setEntry('botanu.run_id', { value: runId });
    newBaggage = newBaggage.setEntry('botanu.workflow', { value: wf });
    if (customerId) newBaggage = newBaggage.setEntry('botanu.customer_id', { value: customerId });

    const otelCtx = propagation.setBaggage(context.active(), newBaggage);

    await context.with(otelCtx, () => next());
  };
}

/**
 * Generic helper to extract Botanu context from HTTP headers.
 */
export function extractBotanuContext(headers: Record<string, string | string[] | undefined>): {
  runId?: string;
  workflow?: string;
  customerId?: string;
} {
  return {
    runId: getHeader({ headers }, 'x-botanu-run-id'),
    workflow: getHeader({ headers }, 'x-botanu-workflow'),
    customerId: getHeader({ headers }, 'x-botanu-customer-id'),
  };
}
