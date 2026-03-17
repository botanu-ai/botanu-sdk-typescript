// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  context,
  propagation,
  trace,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import {
  setBaggage,
  setBaggageOn,
  getBaggage,
  getRunId,
  getWorkflow,
  getCurrentSpan,
} from '../../src/sdk/context.js';

// ---------------------------------------------------------------------------
// Test OTel setup
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
});

afterEach(() => {
  exporter.reset();
  provider.shutdown();
});

// ---------------------------------------------------------------------------
// setBaggage
// ---------------------------------------------------------------------------

describe('setBaggage', () => {
  it('returns a Context object', () => {
    const ctx = setBaggage('test.key', 'test-value');
    expect(ctx).toBeDefined();
    // Verify value is in the returned context
    const bag = propagation.getBaggage(ctx);
    expect(bag?.getEntry('test.key')?.value).toBe('test-value');
  });

  it('returned context works with context.with', async () => {
    const ctx = setBaggage('botanu.test', 'hello');

    let capturedValue: string | undefined;
    await context.with(ctx, () => {
      capturedValue = getBaggage('botanu.test');
    });

    expect(capturedValue).toBe('hello');
  });

  it('does not pollute the active context', () => {
    setBaggage('botanu.leaky', 'should-not-leak');
    // Without context.with(), the active context should not have the value
    const value = getBaggage('botanu.leaky');
    expect(value).toBeUndefined();
  });

  it('preserves existing baggage entries', () => {
    // Set first value
    const ctx1 = setBaggage('key1', 'val1');
    // Set second value on same context
    const ctx2 = setBaggageOn(ctx1, 'key2', 'val2');

    const bag = propagation.getBaggage(ctx2);
    expect(bag?.getEntry('key1')?.value).toBe('val1');
    expect(bag?.getEntry('key2')?.value).toBe('val2');
  });
});

// ---------------------------------------------------------------------------
// setBaggageOn
// ---------------------------------------------------------------------------

describe('setBaggageOn', () => {
  it('chains multiple values on one context', () => {
    let ctx = setBaggage('a', '1');
    ctx = setBaggageOn(ctx, 'b', '2');
    ctx = setBaggageOn(ctx, 'c', '3');

    const bag = propagation.getBaggage(ctx);
    expect(bag?.getEntry('a')?.value).toBe('1');
    expect(bag?.getEntry('b')?.value).toBe('2');
    expect(bag?.getEntry('c')?.value).toBe('3');
  });

  it('overwrites same key', () => {
    let ctx = setBaggage('key', 'first');
    ctx = setBaggageOn(ctx, 'key', 'second');

    const bag = propagation.getBaggage(ctx);
    expect(bag?.getEntry('key')?.value).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// getBaggage
// ---------------------------------------------------------------------------

describe('getBaggage', () => {
  it('returns undefined for missing key', () => {
    expect(getBaggage('nonexistent.key')).toBeUndefined();
  });

  it('reads value from active context', async () => {
    const ctx = setBaggage('botanu.test_read', 'readable');

    let capturedValue: string | undefined;
    await context.with(ctx, () => {
      capturedValue = getBaggage('botanu.test_read');
    });

    expect(capturedValue).toBe('readable');
  });
});

// ---------------------------------------------------------------------------
// getRunId / getWorkflow
// ---------------------------------------------------------------------------

describe('getRunId', () => {
  it('returns undefined when not set', () => {
    const result = getRunId();
    expect(result).toBeUndefined();
  });

  it('reads botanu.run_id from baggage', async () => {
    const ctx = setBaggage('botanu.run_id', 'run-12345');

    let capturedRunId: string | undefined;
    await context.with(ctx, () => {
      capturedRunId = getRunId();
    });

    expect(capturedRunId).toBe('run-12345');
  });
});

describe('getWorkflow', () => {
  it('returns undefined when not set', () => {
    const result = getWorkflow();
    expect(result).toBeUndefined();
  });

  it('reads botanu.workflow from baggage', async () => {
    const ctx = setBaggage('botanu.workflow', 'ticket_handler');

    let capturedWorkflow: string | undefined;
    await context.with(ctx, () => {
      capturedWorkflow = getWorkflow();
    });

    expect(capturedWorkflow).toBe('ticket_handler');
  });
});

// ---------------------------------------------------------------------------
// getCurrentSpan
// ---------------------------------------------------------------------------

describe('getCurrentSpan', () => {
  it('returns span when one is active', async () => {
    const tracer = trace.getTracer('test');

    await tracer.startActiveSpan('test-span', async (expectedSpan) => {
      const current = getCurrentSpan();
      expect(current).toBe(expectedSpan);
      expectedSpan.end();
    });
  });

  it('returns undefined or non-recording span when none active', () => {
    const span = getCurrentSpan();
    // OTel returns a non-recording span, not undefined
    if (span) {
      expect(span.isRecording()).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Context isolation
// ---------------------------------------------------------------------------

describe('Context isolation', () => {
  it('nested context.with scopes do not leak', async () => {
    const ctx1 = setBaggage('scope', 'outer');
    const ctx2 = setBaggage('scope', 'inner');

    let outerValue: string | undefined;
    let innerValue: string | undefined;

    await context.with(ctx1, async () => {
      outerValue = getBaggage('scope');

      await context.with(ctx2, () => {
        innerValue = getBaggage('scope');
      });

      // After inner scope ends, outer should still be active
      expect(getBaggage('scope')).toBe('outer');
    });

    expect(outerValue).toBe('outer');
    expect(innerValue).toBe('inner');
  });

  it('concurrent context.with calls are isolated', async () => {
    const results: string[] = [];

    const task = async (id: string) => {
      const ctx = setBaggage('task', id);
      await context.with(ctx, async () => {
        // Simulate async work
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        results.push(getBaggage('task') ?? 'missing');
      });
    };

    await Promise.all([task('A'), task('B'), task('C')]);

    // Each task should have captured its own value
    expect(results.sort()).toEqual(['A', 'B', 'C']);
  });
});
