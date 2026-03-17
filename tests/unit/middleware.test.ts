import { describe, it, expect } from 'vitest';
import { extractBotanuContext } from '../../src/sdk/middleware.js';

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
