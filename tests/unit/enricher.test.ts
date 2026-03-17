import { describe, it, expect, vi, beforeEach } from 'vitest';
import { propagation, context, ROOT_CONTEXT } from '@opentelemetry/api';
import { RunContextEnricher } from '../../src/processors/enricher.js';

// Mock span
function createMockSpan(existingAttrs: Record<string, string> = {}) {
  const attrs: Record<string, string> = { ...existingAttrs };
  return {
    setAttribute: vi.fn((key: string, value: string) => {
      attrs[key] = value;
    }),
    attributes: attrs,
    _attrs: attrs,
  };
}

describe('RunContextEnricher', () => {
  it('should create in lean mode by default', () => {
    const enricher = new RunContextEnricher();
    expect(enricher).toBeDefined();
  });

  it('should enrich span with baggage values in lean mode', () => {
    const enricher = new RunContextEnricher(true);
    const span = createMockSpan();

    // Create context with baggage
    let baggage = propagation.createBaggage();
    baggage = baggage.setEntry('botanu.run_id', { value: 'run-123' });
    baggage = baggage.setEntry('botanu.workflow', { value: 'Support' });
    baggage = baggage.setEntry('botanu.event_id', { value: 'evt-456' });
    baggage = baggage.setEntry('botanu.customer_id', { value: 'cust-789' });
    baggage = baggage.setEntry('botanu.environment', { value: 'production' }); // should be skipped in lean
    baggage = baggage.setEntry('botanu.tenant_id', { value: 'tenant-1' }); // should be skipped in lean
    const ctx = propagation.setBaggage(ROOT_CONTEXT, baggage);

    enricher.onStart(span as never, ctx);

    expect(span.setAttribute).toHaveBeenCalledWith('botanu.run_id', 'run-123');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.workflow', 'Support');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.event_id', 'evt-456');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.customer_id', 'cust-789');
    // These should NOT be set in lean mode
    expect(span.setAttribute).not.toHaveBeenCalledWith('botanu.environment', 'production');
    expect(span.setAttribute).not.toHaveBeenCalledWith('botanu.tenant_id', 'tenant-1');
  });

  it('should enrich span with all baggage values in full mode', () => {
    const enricher = new RunContextEnricher(false);
    const span = createMockSpan();

    let baggage = propagation.createBaggage();
    baggage = baggage.setEntry('botanu.run_id', { value: 'run-123' });
    baggage = baggage.setEntry('botanu.workflow', { value: 'Support' });
    baggage = baggage.setEntry('botanu.event_id', { value: 'evt-456' });
    baggage = baggage.setEntry('botanu.customer_id', { value: 'cust-789' });
    baggage = baggage.setEntry('botanu.environment', { value: 'production' });
    baggage = baggage.setEntry('botanu.tenant_id', { value: 'tenant-1' });
    baggage = baggage.setEntry('botanu.parent_run_id', { value: 'parent-1' });
    const ctx = propagation.setBaggage(ROOT_CONTEXT, baggage);

    enricher.onStart(span as never, ctx);

    expect(span.setAttribute).toHaveBeenCalledWith('botanu.run_id', 'run-123');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.workflow', 'Support');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.event_id', 'evt-456');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.customer_id', 'cust-789');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.environment', 'production');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.tenant_id', 'tenant-1');
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.parent_run_id', 'parent-1');
  });

  it('should not overwrite existing span attributes', () => {
    const enricher = new RunContextEnricher(true);
    const span = createMockSpan({ 'botanu.run_id': 'existing-run' });

    let baggage = propagation.createBaggage();
    baggage = baggage.setEntry('botanu.run_id', { value: 'new-run' });
    baggage = baggage.setEntry('botanu.workflow', { value: 'Support' });
    const ctx = propagation.setBaggage(ROOT_CONTEXT, baggage);

    enricher.onStart(span as never, ctx);

    // Should not overwrite existing attribute
    expect(span.setAttribute).not.toHaveBeenCalledWith('botanu.run_id', 'new-run');
    // But should set missing ones
    expect(span.setAttribute).toHaveBeenCalledWith('botanu.workflow', 'Support');
  });

  it('should handle missing baggage gracefully', () => {
    const enricher = new RunContextEnricher(true);
    const span = createMockSpan();

    // Context without baggage
    enricher.onStart(span as never, ROOT_CONTEXT);

    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('should handle empty baggage entries', () => {
    const enricher = new RunContextEnricher(true);
    const span = createMockSpan();

    const baggage = propagation.createBaggage();
    const ctx = propagation.setBaggage(ROOT_CONTEXT, baggage);

    enricher.onStart(span as never, ctx);

    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('shutdown should resolve', async () => {
    const enricher = new RunContextEnricher();
    await expect(enricher.shutdown()).resolves.toBeUndefined();
  });

  it('forceFlush should resolve', async () => {
    const enricher = new RunContextEnricher();
    await expect(enricher.forceFlush()).resolves.toBeUndefined();
  });
});
