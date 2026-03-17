import { describe, it, expect, beforeEach } from 'vitest';
import { RunContext, RunStatus, generateRunId } from '../../src/models/run-context.js';

describe('generateRunId', () => {
  it('should return a valid UUID format', () => {
    const id = generateRunId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRunId()));
    expect(ids.size).toBe(100);
  });

  it('should be sortable by time', async () => {
    const id1 = generateRunId();
    // Wait 2ms to guarantee different timestamp
    await new Promise((r) => setTimeout(r, 2));
    const id2 = generateRunId();
    // id1 timestamp prefix < id2 timestamp prefix
    expect(id1.replace(/-/g, '').slice(0, 12) <= id2.replace(/-/g, '').slice(0, 12)).toBe(true);
  });
});

describe('RunStatus', () => {
  it('should have all expected values', () => {
    expect(RunStatus.SUCCESS).toBe('success');
    expect(RunStatus.FAILURE).toBe('failure');
    expect(RunStatus.PARTIAL).toBe('partial');
    expect(RunStatus.TIMEOUT).toBe('timeout');
    expect(RunStatus.CANCELED).toBe('canceled');
  });
});

describe('RunContext', () => {
  describe('create', () => {
    it('should create with required fields', () => {
      const ctx = RunContext.create({
        workflow: 'Support',
        eventId: 'evt-123',
        customerId: 'cust-456',
      });

      expect(ctx.runId).toBeTruthy();
      expect(ctx.workflow).toBe('Support');
      expect(ctx.eventId).toBe('evt-123');
      expect(ctx.customerId).toBe('cust-456');
      expect(ctx.environment).toBe('production');
      expect(ctx.attempt).toBe(1);
      expect(ctx.rootRunId).toBe(ctx.runId);
      expect(ctx.cancelled).toBe(false);
    });

    it('should use environment from env var', () => {
      const oldEnv = process.env.BOTANU_ENVIRONMENT;
      process.env.BOTANU_ENVIRONMENT = 'staging';
      try {
        const ctx = RunContext.create({
          workflow: 'Test',
          eventId: 'e1',
          customerId: 'c1',
        });
        expect(ctx.environment).toBe('staging');
      } finally {
        if (oldEnv) process.env.BOTANU_ENVIRONMENT = oldEnv;
        else delete process.env.BOTANU_ENVIRONMENT;
      }
    });

    it('should set deadline from seconds', () => {
      const before = Date.now() / 1000;
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        deadlineSeconds: 60,
      });
      const after = Date.now() / 1000;
      expect(ctx.deadline).toBeGreaterThanOrEqual(before + 60);
      expect(ctx.deadline).toBeLessThanOrEqual(after + 60);
    });

    it('should accept optional fields', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        workflowVersion: 'v:abc123',
        tenantId: 'tenant-1',
        parentRunId: 'parent-run',
        rootRunId: 'root-run',
        attempt: 3,
        retryOfRunId: 'prev-run',
      });

      expect(ctx.workflowVersion).toBe('v:abc123');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.parentRunId).toBe('parent-run');
      expect(ctx.rootRunId).toBe('root-run');
      expect(ctx.attempt).toBe(3);
      expect(ctx.retryOfRunId).toBe('prev-run');
    });
  });

  describe('createRetry', () => {
    it('should create retry with incremented attempt', () => {
      const original = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      const retry = RunContext.createRetry(original);

      expect(retry.runId).not.toBe(original.runId);
      expect(retry.workflow).toBe(original.workflow);
      expect(retry.eventId).toBe(original.eventId);
      expect(retry.customerId).toBe(original.customerId);
      expect(retry.rootRunId).toBe(original.rootRunId);
      expect(retry.attempt).toBe(2);
      expect(retry.retryOfRunId).toBe(original.runId);
    });

    it('should preserve rootRunId across multiple retries', () => {
      const original = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      const retry1 = RunContext.createRetry(original);
      const retry2 = RunContext.createRetry(retry1);

      expect(retry2.rootRunId).toBe(original.runId);
      expect(retry2.attempt).toBe(3);
      expect(retry2.retryOfRunId).toBe(retry1.runId);
    });
  });

  describe('lifecycle', () => {
    it('should detect past deadline', () => {
      const ctx = new RunContext({
        runId: 'test',
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        environment: 'test',
        deadline: Date.now() / 1000 - 10,
      });
      expect(ctx.isPastDeadline()).toBe(true);
    });

    it('should not be past deadline when no deadline set', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });
      expect(ctx.isPastDeadline()).toBe(false);
    });

    it('should handle cancellation', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      expect(ctx.isCancelled()).toBe(false);
      ctx.requestCancellation('user');
      expect(ctx.isCancelled()).toBe(true);
      expect(ctx.cancelled).toBe(true);
      expect(ctx.cancelledAt).toBeDefined();
    });

    it('should compute remaining time', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        deadlineSeconds: 300,
      });

      const remaining = ctx.remainingTimeSeconds();
      expect(remaining).toBeDefined();
      expect(remaining!).toBeGreaterThan(299);
      expect(remaining!).toBeLessThanOrEqual(300);
    });

    it('should return undefined remaining time when no deadline', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });
      expect(ctx.remainingTimeSeconds()).toBeUndefined();
    });

    it('should complete with outcome', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      ctx.complete(RunStatus.SUCCESS, {
        valueType: 'tickets_resolved',
        valueAmount: 1,
      });

      expect(ctx.outcome).toBeDefined();
      expect(ctx.outcome!.status).toBe(RunStatus.SUCCESS);
      expect(ctx.outcome!.valueType).toBe('tickets_resolved');
      expect(ctx.outcome!.valueAmount).toBe(1);
    });

    it('should compute duration after completion', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      expect(ctx.durationMs).toBeUndefined();

      ctx.complete(RunStatus.SUCCESS);
      const dur = ctx.durationMs;
      expect(dur).toBeDefined();
      expect(dur!).toBeGreaterThanOrEqual(0);
    });
  });

  describe('serialization', () => {
    it('should serialize to baggage dict in lean mode', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        tenantId: 'tenant-1',
      });

      const baggage = ctx.toBaggageDict(true);

      expect(baggage['botanu.run_id']).toBe(ctx.runId);
      expect(baggage['botanu.workflow']).toBe('Test');
      expect(baggage['botanu.event_id']).toBe('e1');
      expect(baggage['botanu.customer_id']).toBe('c1');
      expect(baggage['botanu.tenant_id']).toBeUndefined();
      expect(Object.keys(baggage)).toHaveLength(4);
    });

    it('should serialize to baggage dict in full mode', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        tenantId: 'tenant-1',
        parentRunId: 'parent-1',
      });

      const baggage = ctx.toBaggageDict(false);

      expect(baggage['botanu.run_id']).toBe(ctx.runId);
      expect(baggage['botanu.workflow']).toBe('Test');
      expect(baggage['botanu.event_id']).toBe('e1');
      expect(baggage['botanu.customer_id']).toBe('c1');
      expect(baggage['botanu.environment']).toBeDefined();
      expect(baggage['botanu.tenant_id']).toBe('tenant-1');
      expect(baggage['botanu.parent_run_id']).toBe('parent-1');
    });

    it('should include attempt and retry in full mode', () => {
      const original = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });
      const retry = RunContext.createRetry(original);
      const baggage = retry.toBaggageDict(false);

      expect(baggage['botanu.attempt']).toBe('2');
      expect(baggage['botanu.retry_of_run_id']).toBe(original.runId);
      expect(baggage['botanu.root_run_id']).toBe(original.runId);
    });

    it('should serialize to span attributes', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        workflowVersion: 'v:abc',
        tenantId: 'tenant-1',
      });

      const attrs = ctx.toSpanAttributes();

      expect(attrs['botanu.run_id']).toBe(ctx.runId);
      expect(attrs['botanu.workflow']).toBe('Test');
      expect(attrs['botanu.event_id']).toBe('e1');
      expect(attrs['botanu.customer_id']).toBe('c1');
      expect(attrs['botanu.environment']).toBeDefined();
      expect(attrs['botanu.workflow.version']).toBe('v:abc');
      expect(attrs['botanu.tenant_id']).toBe('tenant-1');
      expect(attrs['botanu.root_run_id']).toBe(ctx.runId);
      expect(attrs['botanu.attempt']).toBe(1);
      expect(attrs['botanu.run.start_time']).toBeDefined();
    });

    it('should include outcome in span attributes', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      ctx.complete(RunStatus.FAILURE, {
        errorClass: 'TimeoutError',
        reasonCode: 'llm_timeout',
      });

      const attrs = ctx.toSpanAttributes();

      expect(attrs['botanu.outcome.status']).toBe('failure');
      expect(attrs['botanu.outcome.error_class']).toBe('TimeoutError');
      expect(attrs['botanu.outcome.reason_code']).toBe('llm_timeout');
      expect(attrs['botanu.run.duration_ms']).toBeDefined();
    });

    it('should include cancelled state in span attributes', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      ctx.requestCancellation('user');
      const attrs = ctx.toSpanAttributes();

      expect(attrs['botanu.run.cancelled']).toBe(true);
      expect(attrs['botanu.run.cancelled_at']).toBeDefined();
    });

    it('should include deadline in span attributes and full baggage', () => {
      const ctx = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        deadlineSeconds: 60,
      });

      const attrs = ctx.toSpanAttributes();
      expect(attrs['botanu.run.deadline_ts']).toBeDefined();

      const baggage = ctx.toBaggageDict(false);
      expect(baggage['botanu.deadline']).toBeDefined();
    });
  });

  describe('fromBaggage', () => {
    it('should reconstruct from lean baggage', () => {
      const original = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
      });

      const baggage = original.toBaggageDict(true);
      const restored = RunContext.fromBaggage(baggage);

      expect(restored).toBeDefined();
      expect(restored!.runId).toBe(original.runId);
      expect(restored!.workflow).toBe('Test');
      expect(restored!.eventId).toBe('e1');
      expect(restored!.customerId).toBe('c1');
    });

    it('should reconstruct from full baggage', () => {
      const original = RunContext.create({
        workflow: 'Test',
        eventId: 'e1',
        customerId: 'c1',
        tenantId: 'tenant-1',
        parentRunId: 'parent-1',
      });

      const retry = RunContext.createRetry(original);
      const baggage = retry.toBaggageDict(false);
      const restored = RunContext.fromBaggage(baggage);

      expect(restored).toBeDefined();
      expect(restored!.runId).toBe(retry.runId);
      expect(restored!.tenantId).toBe('tenant-1');
      expect(restored!.parentRunId).toBe('parent-1');
      expect(restored!.rootRunId).toBe(original.runId);
      expect(restored!.attempt).toBe(2);
      expect(restored!.retryOfRunId).toBe(original.runId);
    });

    it('should return undefined for missing required fields', () => {
      expect(RunContext.fromBaggage({})).toBeUndefined();
      expect(RunContext.fromBaggage({ 'botanu.run_id': 'r1' })).toBeUndefined();
      expect(RunContext.fromBaggage({ 'botanu.workflow': 'w1' })).toBeUndefined();
    });

    it('should handle invalid attempt number', () => {
      const restored = RunContext.fromBaggage({
        'botanu.run_id': 'r1',
        'botanu.workflow': 'w1',
        'botanu.attempt': 'not-a-number',
      });
      expect(restored!.attempt).toBe(1);
    });

    it('should handle deadline from baggage', () => {
      const deadlineMs = (Date.now() / 1000 + 300) * 1000;
      const restored = RunContext.fromBaggage({
        'botanu.run_id': 'r1',
        'botanu.workflow': 'w1',
        'botanu.deadline': String(deadlineMs),
      });
      expect(restored!.deadline).toBeCloseTo(deadlineMs / 1000, 0);
    });

    it('should handle cancelled from baggage', () => {
      const restored = RunContext.fromBaggage({
        'botanu.run_id': 'r1',
        'botanu.workflow': 'w1',
        'botanu.cancelled': 'true',
      });
      expect(restored!.cancelled).toBe(true);
    });
  });
});
