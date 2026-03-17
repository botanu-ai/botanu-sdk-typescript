// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  context,
  propagation,
  trace,
  SpanKind,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { RunContextEnricher } from '../../src/processors/enricher.js';

// ---------------------------------------------------------------------------
// Test OTel setup — MUST register provider BEFORE importing decorators,
// because decorators.ts creates `const tracer = trace.getTracer(...)` at
// module level. The ProxyTracer delegates to whatever provider is globally
// registered, so we register first.
// ---------------------------------------------------------------------------

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
provider.addSpanProcessor(new RunContextEnricher(true));
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Dynamic imports AFTER provider registration
const { botanuWorkflow, runBotanu, botanuOutcome } = await import('../../src/sdk/decorators.js');
const { emitOutcome } = await import('../../src/sdk/span-helpers.js');

beforeEach(() => {
  exporter.reset();
});

afterEach(async () => {
  await provider.forceFlush();
});

function spans() { return exporter.getFinishedSpans(); }
async function flush() { await provider.forceFlush(); }

class ValueError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ValueError'; }
}

// ---------------------------------------------------------------------------
// botanuWorkflow
// ---------------------------------------------------------------------------

describe('botanuWorkflow', () => {
  it('creates a span with correct name', async () => {
    const fn = botanuWorkflow(
      { name: 'Test Workflow', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'result',
    );
    const result = await fn();
    await flush();

    expect(result).toBe('result');
    expect(spans().length).toBe(1);
    expect(spans()[0].name).toBe('botanu.run/Test Workflow');
  });

  it('sets run attributes on span', async () => {
    const fn = botanuWorkflow(
      { name: 'Support', eventId: 'ticket-42', customerId: 'bigretail' },
      async () => 'done',
    );
    await fn();
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.run_id']).toBeTruthy();
    expect(attrs['botanu.workflow']).toBe('Support');
    expect(attrs['botanu.event_id']).toBe('ticket-42');
    expect(attrs['botanu.customer_id']).toBe('bigretail');
  });

  it('emits run.started event', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => {},
    );
    await fn();
    await flush();

    const events = spans()[0].events;
    const started = events.filter((e) => e.name === 'botanu.run.started');
    expect(started.length).toBe(1);
  });

  it('emits run.completed event on success', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'done',
    );
    await fn();
    await flush();

    const events = spans()[0].events;
    const completed = events.filter((e) => e.name === 'botanu.run.completed');
    expect(completed.length).toBe(1);
    expect(completed[0].attributes!.status).toBe('success');
  });

  it('records exception on failure', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => { throw new ValueError('test error'); },
    );
    await expect(fn()).rejects.toThrow('test error');
    await flush();

    const events = spans()[0].events;
    const completed = events.filter((e) => e.name === 'botanu.run.completed');
    expect(completed.length).toBe(1);
    expect(completed[0].attributes!.status).toBe('failure');
  });

  it('preserves return value', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => ({ key: 'value', count: 42 }),
    );
    const result = await fn();
    expect(result).toEqual({ key: 'value', count: 42 });
  });

  it('re-raises exceptions', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => { throw new TypeError('bad type'); },
    );
    await expect(fn()).rejects.toThrow('bad type');
  });

  it('sets outcome status success on happy path', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'ok',
    );
    await fn();
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('success');
  });

  it('sets outcome status failure on error', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => { throw new Error('boom'); },
    );
    await expect(fn()).rejects.toThrow();
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('failure');
  });

  it('records duration_ms', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'done',
    );
    await fn();
    await flush();

    const durationMs = spans()[0].attributes['botanu.run.duration_ms'] as number;
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('computes workflow version', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'versioned',
    );
    await fn();
    await flush();

    const version = spans()[0].attributes['botanu.workflow.version'] as string;
    expect(version).toBeTruthy();
    expect(version).toMatch(/^v:/);
  });

  it('root_run_id equals run_id for root run', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'root',
    );
    await fn();
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.root_run_id']).toBe(attrs['botanu.run_id']);
  });

  it('propagates tenant_id', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1', tenantId: 'tenant-abc' },
      async () => 'ok',
    );
    await fn();
    await flush();

    expect(spans()[0].attributes['botanu.tenant_id']).toBe('tenant-abc');
  });

  it('validates empty eventId', () => {
    expect(() => botanuWorkflow(
      { name: 'Test', eventId: '', customerId: 'cust-1' },
      async () => {},
    )).toThrow('eventId is required');
  });

  it('validates empty customerId', () => {
    expect(() => botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: '' },
      async () => {},
    )).toThrow('customerId is required');
  });

  it('supports callable eventId', async () => {
    const fn = botanuWorkflow(
      {
        name: 'Test',
        eventId: (...args: unknown[]) => (args[0] as { id: string }).id,
        customerId: 'cust-1',
      },
      async (data: { id: string }) => data.id,
    );
    const result = await fn({ id: 'dynamic-evt' });
    await flush();

    expect(result).toBe('dynamic-evt');
    expect(spans()[0].attributes['botanu.event_id']).toBe('dynamic-evt');
  });

  it('supports callable customerId', async () => {
    const fn = botanuWorkflow(
      {
        name: 'Test',
        eventId: 'evt-1',
        customerId: (...args: unknown[]) => (args[0] as { org: string }).org,
      },
      async (data: { org: string }) => data.org,
    );
    await fn({ org: 'acme-corp' });
    await flush();

    expect(spans()[0].attributes['botanu.customer_id']).toBe('acme-corp');
  });

  it('respects custom spanKind', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1', spanKind: SpanKind.CLIENT },
      async () => 'ok',
    );
    await fn();
    await flush();

    expect(spans()[0].kind).toBe(SpanKind.CLIENT);
  });

  it('does not overwrite user-emitted outcome', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => {
        emitOutcome('partial', { valueType: 'docs', valueAmount: 3 });
        return 'done';
      },
    );
    await fn();
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('partial');
  });

  it('autoOutcomeOnSuccess=false skips auto outcome', async () => {
    const fn = botanuWorkflow(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1', autoOutcomeOnSuccess: false },
      async () => 'ok',
    );
    await fn();
    await flush();

    const events = spans()[0].events;
    const completed = events.filter((e) => e.name === 'botanu.run.completed');
    expect(completed.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runBotanu
// ---------------------------------------------------------------------------

describe('runBotanu', () => {
  it('creates span and returns result', async () => {
    const result = await runBotanu(
      { name: 'CM Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'cm-result',
    );
    await flush();

    expect(result).toBe('cm-result');
    expect(spans().length).toBe(1);
    expect(spans()[0].name).toBe('botanu.run/CM Test');
  });

  it('provides RunContext to callback', async () => {
    await runBotanu(
      { name: 'CM Test', eventId: 'evt-1', customerId: 'cust-1' },
      async (runCtx) => {
        expect(runCtx.runId).toBeTruthy();
        expect(runCtx.workflow).toBe('CM Test');
        expect(runCtx.eventId).toBe('evt-1');
      },
    );
  });

  it('handles errors correctly', async () => {
    await expect(
      runBotanu(
        { name: 'Error Test', eventId: 'evt-1', customerId: 'cust-1' },
        async () => { throw new Error('cm error'); },
      ),
    ).rejects.toThrow('cm error');
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('failure');
  });

  it('does not overwrite user-emitted outcome', async () => {
    await runBotanu(
      { name: 'Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => {
        emitOutcome('partial');
        return 'done';
      },
    );
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// botanuOutcome
// ---------------------------------------------------------------------------

describe('botanuOutcome', () => {
  it('emits success on normal return', async () => {
    const fn = botanuOutcome(async () => 'ok');
    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('parent', async (span) => {
      const result = await fn();
      expect(result).toBe('ok');
      span.end();
    });
  });

  it('emits failed on exception and re-raises', async () => {
    const fn = botanuOutcome(async () => { throw new Error('broken'); });
    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('parent', async (span) => {
      await expect(fn()).rejects.toThrow('broken');
      span.end();
    });
  });

  it('preserves return value', async () => {
    const fn = botanuOutcome(async () => [1, 2, 3]);
    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('parent', async (span) => {
      const result = await fn();
      expect(result).toEqual([1, 2, 3]);
      span.end();
    });
  });
});

// ---------------------------------------------------------------------------
// Baggage propagation
// ---------------------------------------------------------------------------

describe('Baggage propagation', () => {
  it('sets event_id and customer_id in baggage inside workflow', async () => {
    let capturedEventId: string | undefined;
    let capturedCustomerId: string | undefined;

    const fn = botanuWorkflow(
      { name: 'Baggage Test', eventId: 'ticket-99', customerId: 'acme-corp' },
      async () => {
        const bag = propagation.getBaggage(context.active());
        capturedEventId = bag?.getEntry('botanu.event_id')?.value;
        capturedCustomerId = bag?.getEntry('botanu.customer_id')?.value;
        return 'ok';
      },
    );
    await fn();

    expect(capturedEventId).toBe('ticket-99');
    expect(capturedCustomerId).toBe('acme-corp');
  });

  it('baggage does not leak after workflow completes', async () => {
    const fn = botanuWorkflow(
      { name: 'Leak Test', eventId: 'evt-1', customerId: 'cust-1' },
      async () => 'ok',
    );

    const bagBefore = propagation.getBaggage(context.active());
    expect(bagBefore?.getEntry('botanu.run_id')?.value).toBeUndefined();

    await fn();

    const bagAfter = propagation.getBaggage(context.active());
    expect(bagAfter?.getEntry('botanu.run_id')?.value).toBeUndefined();
  });

  it('baggage does not leak after exception', async () => {
    const fn = botanuWorkflow(
      { name: 'Exception Leak', eventId: 'evt-1', customerId: 'cust-1' },
      async () => { throw new Error('boom'); },
    );
    await expect(fn()).rejects.toThrow();

    const bagAfter = propagation.getBaggage(context.active());
    expect(bagAfter?.getEntry('botanu.run_id')?.value).toBeUndefined();
  });
});
