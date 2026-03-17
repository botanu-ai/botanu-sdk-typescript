import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractBotanuContext } from '../../src/sdk/middleware.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const { botanuExpressMiddleware } = await import('../../src/sdk/middleware.js');
const { trace } = await import('@opentelemetry/api');

function spans() { return exporter.getFinishedSpans(); }
async function flush() { await provider.forceFlush(); }

describe('extractBotanuContext', () => {
  it('should extract run_id from headers', () => {
    const result = extractBotanuContext({
      'x-botanu-run-id': 'run-123',
    });
    expect(result.runId).toBe('run-123');
  });

  it('should extract workflow from headers', () => {
    const result = extractBotanuContext({
      'x-botanu-workflow': 'Support',
    });
    expect(result.workflow).toBe('Support');
  });

  it('should extract customer_id from headers', () => {
    const result = extractBotanuContext({
      'x-botanu-customer-id': 'cust-456',
    });
    expect(result.customerId).toBe('cust-456');
  });

  it('should extract all context together', () => {
    const result = extractBotanuContext({
      'x-botanu-run-id': 'run-123',
      'x-botanu-workflow': 'Support',
      'x-botanu-customer-id': 'cust-456',
    });

    expect(result.runId).toBe('run-123');
    expect(result.workflow).toBe('Support');
    expect(result.customerId).toBe('cust-456');
  });

  it('should handle missing headers', () => {
    const result = extractBotanuContext({});

    expect(result.runId).toBeUndefined();
    expect(result.workflow).toBeUndefined();
    expect(result.customerId).toBeUndefined();
  });

  it('should handle array header values', () => {
    const result = extractBotanuContext({
      'x-botanu-run-id': ['run-123', 'run-456'],
    });
    expect(result.runId).toBe('run-123');
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — botanuExpressMiddleware
// ---------------------------------------------------------------------------

describe('botanuExpressMiddleware (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('sets x-botanu-run-id response header', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'Support' });
    const resHeaders: Record<string, string> = {};

    const tracer = trace.getTracer('test-mw');
    await tracer.startActiveSpan('request', async (span) => {
      await new Promise<void>((resolve) => {
        mw(
          { headers: { 'x-botanu-run-id': 'run-abc' } },
          { setHeader: (n: string, v: string) => { resHeaders[n] = v; } },
          () => resolve(),
        );
      });
      span.end();
    });
    await flush();

    expect(resHeaders['x-botanu-run-id']).toBe('run-abc');
    expect(spans()[0].attributes['botanu.run_id']).toBe('run-abc');
  });

  it('auto-generates run_id when not in baggage or headers', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'Support' });
    const resHeaders: Record<string, string> = {};

    const tracer = trace.getTracer('test-mw');
    await tracer.startActiveSpan('request', async (span) => {
      await new Promise<void>((resolve) => {
        mw(
          { headers: {} },
          { setHeader: (n: string, v: string) => { resHeaders[n] = v; } },
          () => resolve(),
        );
      });
      span.end();
    });
    await flush();

    // Should have auto-generated a UUID
    expect(resHeaders['x-botanu-run-id']).toBeTruthy();
    expect(resHeaders['x-botanu-run-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(spans()[0].attributes['botanu.run_id']).toBe(resHeaders['x-botanu-run-id']);
  });

  it('propagates customer_id from header', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'Support' });

    const tracer = trace.getTracer('test-mw');
    await tracer.startActiveSpan('request', async (span) => {
      await new Promise<void>((resolve) => {
        mw(
          { headers: { 'x-botanu-customer-id': 'acme-corp' } },
          { setHeader: () => {} },
          () => resolve(),
        );
      });
      span.end();
    });
    await flush();

    expect(spans()[0].attributes['botanu.customer_id']).toBe('acme-corp');
  });

  it('does NOT auto-generate run_id when autoGenerateRunId=false', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'Support', autoGenerateRunId: false });
    const resHeaders: Record<string, string> = {};

    const tracer = trace.getTracer('test-mw');
    await tracer.startActiveSpan('request', async (span) => {
      await new Promise<void>((resolve) => {
        mw(
          { headers: {} },
          { setHeader: (n: string, v: string) => { resHeaders[n] = v; } },
          () => resolve(),
        );
      });
      span.end();
    });
    await flush();

    expect(resHeaders['x-botanu-run-id']).toBeUndefined();
    expect(spans()[0].attributes['botanu.run_id']).toBeUndefined();
  });

  it('each request gets unique auto-generated run_id', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'Support' });
    const runIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const resHeaders: Record<string, string> = {};
      const tracer = trace.getTracer('test-mw');
      await tracer.startActiveSpan(`request-${i}`, async (span) => {
        await new Promise<void>((resolve) => {
          mw(
            { headers: {} },
            { setHeader: (n: string, v: string) => { resHeaders[n] = v; } },
            () => resolve(),
          );
        });
        span.end();
      });
      runIds.push(resHeaders['x-botanu-run-id']);
    }
    await flush();

    // All three should be unique UUIDs
    expect(new Set(runIds).size).toBe(3);
    for (const id of runIds) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('sets workflow attribute from options', async () => {
    const mw = botanuExpressMiddleware({ workflow: 'CustomerSupport' });

    const tracer = trace.getTracer('test-mw');
    await tracer.startActiveSpan('request', async (span) => {
      await new Promise<void>((resolve) => {
        mw(
          { headers: {} },
          { setHeader: () => {} },
          () => resolve(),
        );
      });
      span.end();
    });
    await flush();

    expect(spans()[0].attributes['botanu.workflow']).toBe('CustomerSupport');
  });
});
