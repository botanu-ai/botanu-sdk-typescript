import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VALID_OUTCOME_STATUSES } from '../../src/sdk/span-helpers.js';

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
