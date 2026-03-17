import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VALID_OUTCOME_STATUSES } from '../../src/sdk/span-helpers.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const { emitOutcome, setBusinessContext } = await import('../../src/sdk/span-helpers.js');
const { trace } = await import('@opentelemetry/api');

function spans() { return exporter.getFinishedSpans(); }
async function flush() { await provider.forceFlush(); }

describe('VALID_OUTCOME_STATUSES', () => {
  it('should contain all valid statuses', () => {
    expect(VALID_OUTCOME_STATUSES.has('success')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.has('partial')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.has('failed')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.has('timeout')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.has('canceled')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.has('abandoned')).toBe(true);
    expect(VALID_OUTCOME_STATUSES.size).toBe(6);
  });

  it('should not contain invalid statuses', () => {
    expect(VALID_OUTCOME_STATUSES.has('error')).toBe(false);
    expect(VALID_OUTCOME_STATUSES.has('pending')).toBe(false);
  });
});

// Note: Full emitOutcome tests require OTel SDK setup with InMemorySpanExporter.
// These are integration-level tests. The basic validation is tested here.
describe('emitOutcome validation', () => {
  it('should validate status values', async () => {
    const { emitOutcome } = await import('../../src/sdk/span-helpers.js');

    expect(() => emitOutcome({ status: 'invalid' })).toThrow(
      "Invalid outcome status 'invalid'",
    );
    expect(() => emitOutcome({ status: 'error' })).toThrow(
      "Invalid outcome status 'error'",
    );
  });

  it('should accept valid status values without active span', async () => {
    const { emitOutcome } = await import('../../src/sdk/span-helpers.js');

    // Should not throw even without active span — just no-ops
    expect(() => emitOutcome({ status: 'success' })).not.toThrow();
    expect(() => emitOutcome({ status: 'failed' })).not.toThrow();
    expect(() => emitOutcome({ status: 'partial' })).not.toThrow();
    expect(() => emitOutcome({ status: 'timeout' })).not.toThrow();
    expect(() => emitOutcome({ status: 'canceled' })).not.toThrow();
    expect(() => emitOutcome({ status: 'abandoned' })).not.toThrow();
  });

  it('should accept string overload', async () => {
    const { emitOutcome } = await import('../../src/sdk/span-helpers.js');

    // String overload
    expect(() => emitOutcome('success')).not.toThrow();
    expect(() => emitOutcome('failed', { reason: 'timeout' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — emitOutcome
// ---------------------------------------------------------------------------

describe('emitOutcome (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('sets botanu.outcome.status attribute on span', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome('success');
      span.end();
    });
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('success');
  });

  it('sets value_type and value_amount attributes', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome('success', { valueType: 'tickets_resolved', valueAmount: 5 });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.outcome.value_type']).toBe('tickets_resolved');
    expect(attrs['botanu.outcome.value_amount']).toBe(5);
  });

  it('adds botanu.outcome_emitted span event', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome('partial', { valueType: 'docs', valueAmount: 3 });
      span.end();
    });
    await flush();

    const events = spans()[0].events;
    const outcomeEvents = events.filter((e) => e.name === 'botanu.outcome_emitted');
    expect(outcomeEvents.length).toBe(1);
    expect(outcomeEvents[0].attributes!.status).toBe('partial');
    expect(outcomeEvents[0].attributes!.value_type).toBe('docs');
    expect(outcomeEvents[0].attributes!.value_amount).toBe(3);
  });

  it('with metadata sets botanu.outcome.metadata.* attributes', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome({
        status: 'success',
        metadata: { source: 'api', version: '2.1' },
      });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.outcome.metadata.source']).toBe('api');
    expect(attrs['botanu.outcome.metadata.version']).toBe('2.1');
  });

  it('sets confidence and reason attributes', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome({
        status: 'partial',
        confidence: 0.85,
        reason: 'partial match',
      });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.outcome.confidence']).toBe(0.85);
    expect(attrs['botanu.outcome.reason']).toBe('partial match');
  });

  it('sets error_type attribute on failed outcome', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome({
        status: 'failed',
        errorType: 'ValidationError',
      });
      span.end();
    });
    await flush();

    expect(spans()[0].attributes['botanu.outcome.error_type']).toBe('ValidationError');
  });

  it('object overload works same as string overload', async () => {
    const tracer = trace.getTracer('test-outcome');
    await tracer.startActiveSpan('test-span', async (span) => {
      emitOutcome({ status: 'timeout' });
      span.end();
    });
    await flush();

    expect(spans()[0].attributes['botanu.outcome.status']).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — setBusinessContext
// ---------------------------------------------------------------------------

describe('setBusinessContext (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('sets customer_id, team, cost_center, region on span', async () => {
    const tracer = trace.getTracer('test-biz-ctx');
    await tracer.startActiveSpan('test-span', async (span) => {
      setBusinessContext({
        customerId: 'acme-corp',
        team: 'platform',
        costCenter: 'cc-1234',
        region: 'us-east-1',
      });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.customer_id']).toBe('acme-corp');
    expect(attrs['botanu.team']).toBe('platform');
    expect(attrs['botanu.cost_center']).toBe('cc-1234');
    expect(attrs['botanu.region']).toBe('us-east-1');
  });

  it('only sets provided fields', async () => {
    const tracer = trace.getTracer('test-biz-ctx');
    await tracer.startActiveSpan('test-span', async (span) => {
      setBusinessContext({ customerId: 'bigretail' });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.customer_id']).toBe('bigretail');
    expect(attrs['botanu.team']).toBeUndefined();
    expect(attrs['botanu.cost_center']).toBeUndefined();
    expect(attrs['botanu.region']).toBeUndefined();
  });
});
