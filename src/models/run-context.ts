// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Run Context - The core data model for Botanu runs.
 *
 * A "Run" is orthogonal to tracing:
 * - Trace context (W3C): ties distributed spans together (trace_id, span_id)
 * - Run context (Botanu): ties business execution together (run_id, workflow, outcome)
 *
 * Invariant: A run can span multiple traces (retries, async fanout).
 * The run_id must remain stable across those boundaries.
 */

import { randomBytes } from 'crypto';

/**
 * Generate a UUIDv7-style sortable run ID.
 *
 * UUIDv7 provides:
 * - Sortable by time (first 48 bits are millisecond timestamp)
 * - Globally unique
 * - Compatible with UUID format
 */
export function generateRunId(): string {
  const timestampMs = Date.now();

  const uuidBytes = Buffer.alloc(16);
  uuidBytes[0] = (timestampMs / 2 ** 40) & 0xff;
  uuidBytes[1] = (timestampMs / 2 ** 32) & 0xff;
  uuidBytes[2] = (timestampMs / 2 ** 24) & 0xff;
  uuidBytes[3] = (timestampMs / 2 ** 16) & 0xff;
  uuidBytes[4] = (timestampMs / 2 ** 8) & 0xff;
  uuidBytes[5] = timestampMs & 0xff;

  const rand = randomBytes(10);
  uuidBytes[6] = 0x70 | (rand[0] & 0x0f);
  uuidBytes[7] = rand[1];
  uuidBytes[8] = 0x80 | (rand[2] & 0x3f);
  rand.copy(uuidBytes, 9, 3, 10);

  const hex = uuidBytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export enum RunStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  TIMEOUT = 'timeout',
  CANCELED = 'canceled',
}

export type RunOutcomeStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'timeout'
  | 'canceled'
  | 'abandoned';

export interface RunOutcome {
  status: RunStatus;
  reasonCode?: string;
  errorClass?: string;
  valueType?: string;
  valueAmount?: number;
  confidence?: number;
}

export interface RunContextOptions {
  workflow: string;
  eventId: string;
  customerId: string;
  workflowVersion?: string;
  environment?: string;
  tenantId?: string;
  parentRunId?: string;
  rootRunId?: string;
  attempt?: number;
  retryOfRunId?: string;
  deadlineSeconds?: number;
}

export class RunContext {
  readonly runId: string;
  readonly workflow: string;
  readonly eventId: string;
  readonly customerId: string;
  readonly environment: string;
  readonly workflowVersion?: string;
  readonly tenantId?: string;
  readonly parentRunId?: string;
  readonly rootRunId: string;
  readonly attempt: number;
  readonly retryOfRunId?: string;
  readonly startTime: Date;
  readonly deadline?: number;
  cancelled: boolean = false;
  cancelledAt?: number;
  outcome?: RunOutcome;

  constructor(params: {
    runId: string;
    workflow: string;
    eventId: string;
    customerId: string;
    environment: string;
    workflowVersion?: string;
    tenantId?: string;
    parentRunId?: string;
    rootRunId?: string;
    attempt?: number;
    retryOfRunId?: string;
    startTime?: Date;
    deadline?: number;
    cancelled?: boolean;
  }) {
    this.runId = params.runId;
    this.workflow = params.workflow;
    this.eventId = params.eventId;
    this.customerId = params.customerId;
    this.environment = params.environment;
    this.workflowVersion = params.workflowVersion;
    this.tenantId = params.tenantId;
    this.parentRunId = params.parentRunId;
    this.rootRunId = params.rootRunId ?? params.runId;
    this.attempt = params.attempt ?? 1;
    this.retryOfRunId = params.retryOfRunId;
    this.startTime = params.startTime ?? new Date();
    this.deadline = params.deadline;
    this.cancelled = params.cancelled ?? false;
  }

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  static create(options: RunContextOptions): RunContext {
    const env =
      options.environment ??
      process.env.BOTANU_ENVIRONMENT ??
      process.env.DEPLOYMENT_ENVIRONMENT ??
      'production';

    const runId = generateRunId();
    let deadline: number | undefined;
    if (options.deadlineSeconds != null) {
      deadline = Date.now() / 1000 + options.deadlineSeconds;
    }

    return new RunContext({
      runId,
      workflow: options.workflow,
      eventId: options.eventId,
      customerId: options.customerId,
      environment: env,
      workflowVersion: options.workflowVersion,
      tenantId: options.tenantId,
      parentRunId: options.parentRunId,
      rootRunId: options.rootRunId ?? runId,
      attempt: options.attempt ?? 1,
      retryOfRunId: options.retryOfRunId,
      deadline,
    });
  }

  static createRetry(previous: RunContext): RunContext {
    return RunContext.create({
      workflow: previous.workflow,
      eventId: previous.eventId,
      customerId: previous.customerId,
      workflowVersion: previous.workflowVersion,
      environment: previous.environment,
      tenantId: previous.tenantId,
      parentRunId: previous.parentRunId,
      rootRunId: previous.rootRunId,
      attempt: previous.attempt + 1,
      retryOfRunId: previous.runId,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  isPastDeadline(): boolean {
    if (this.deadline == null) return false;
    return Date.now() / 1000 > this.deadline;
  }

  isCancelled(): boolean {
    return this.cancelled || this.isPastDeadline();
  }

  requestCancellation(_reason: string = 'user'): void {
    this.cancelled = true;
    this.cancelledAt = Date.now() / 1000;
  }

  remainingTimeSeconds(): number | undefined {
    if (this.deadline == null) return undefined;
    return Math.max(0, this.deadline - Date.now() / 1000);
  }

  complete(
    status: RunStatus,
    options?: {
      reasonCode?: string;
      errorClass?: string;
      valueType?: string;
      valueAmount?: number;
      confidence?: number;
    },
  ): void {
    this.outcome = {
      status,
      reasonCode: options?.reasonCode,
      errorClass: options?.errorClass,
      valueType: options?.valueType,
      valueAmount: options?.valueAmount,
      confidence: options?.confidence,
    };
  }

  get durationMs(): number | undefined {
    if (!this.outcome) return undefined;
    return Date.now() - this.startTime.getTime();
  }

  // ------------------------------------------------------------------
  // Serialisation
  // ------------------------------------------------------------------

  toBaggageDict(leanMode?: boolean): Record<string, string> {
    if (leanMode == null) {
      const envMode = process.env.BOTANU_PROPAGATION_MODE ?? 'lean';
      leanMode = envMode !== 'full';
    }

    const baggage: Record<string, string> = {
      'botanu.run_id': this.runId,
      'botanu.workflow': this.workflow,
      'botanu.event_id': this.eventId,
      'botanu.customer_id': this.customerId,
    };

    if (leanMode) return baggage;

    baggage['botanu.environment'] = this.environment;
    if (this.tenantId) baggage['botanu.tenant_id'] = this.tenantId;
    if (this.parentRunId) baggage['botanu.parent_run_id'] = this.parentRunId;
    if (this.rootRunId && this.rootRunId !== this.runId) {
      baggage['botanu.root_run_id'] = this.rootRunId;
    }
    if (this.attempt > 1) baggage['botanu.attempt'] = String(this.attempt);
    if (this.retryOfRunId) baggage['botanu.retry_of_run_id'] = this.retryOfRunId;
    if (this.deadline != null) {
      baggage['botanu.deadline'] = String(Math.floor(this.deadline * 1000));
    }
    if (this.cancelled) baggage['botanu.cancelled'] = 'true';

    return baggage;
  }

  toSpanAttributes(): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {
      'botanu.run_id': this.runId,
      'botanu.workflow': this.workflow,
      'botanu.event_id': this.eventId,
      'botanu.customer_id': this.customerId,
      'botanu.environment': this.environment,
      'botanu.run.start_time': this.startTime.toISOString(),
    };

    if (this.workflowVersion) attrs['botanu.workflow.version'] = this.workflowVersion;
    if (this.tenantId) attrs['botanu.tenant_id'] = this.tenantId;
    if (this.parentRunId) attrs['botanu.parent_run_id'] = this.parentRunId;
    attrs['botanu.root_run_id'] = this.rootRunId;
    attrs['botanu.attempt'] = this.attempt;
    if (this.retryOfRunId) attrs['botanu.retry_of_run_id'] = this.retryOfRunId;
    if (this.deadline != null) attrs['botanu.run.deadline_ts'] = this.deadline;
    if (this.cancelled) {
      attrs['botanu.run.cancelled'] = true;
      if (this.cancelledAt) attrs['botanu.run.cancelled_at'] = this.cancelledAt;
    }
    if (this.outcome) {
      attrs['botanu.outcome.status'] = this.outcome.status;
      if (this.outcome.reasonCode) attrs['botanu.outcome.reason_code'] = this.outcome.reasonCode;
      if (this.outcome.errorClass) attrs['botanu.outcome.error_class'] = this.outcome.errorClass;
      if (this.outcome.valueType) attrs['botanu.outcome.value_type'] = this.outcome.valueType;
      if (this.outcome.valueAmount != null) attrs['botanu.outcome.value_amount'] = this.outcome.valueAmount;
      if (this.outcome.confidence != null) attrs['botanu.outcome.confidence'] = this.outcome.confidence;
      const dur = this.durationMs;
      if (dur != null) attrs['botanu.run.duration_ms'] = dur;
    }

    return attrs;
  }

  static fromBaggage(baggage: Record<string, string>): RunContext | undefined {
    const runId = baggage['botanu.run_id'];
    const workflow = baggage['botanu.workflow'];
    if (!runId || !workflow) return undefined;

    let attempt = 1;
    const attemptStr = baggage['botanu.attempt'];
    if (attemptStr) {
      const parsed = parseInt(attemptStr, 10);
      if (!isNaN(parsed)) attempt = parsed;
    }

    let deadline: number | undefined;
    const deadlineStr = baggage['botanu.deadline'];
    if (deadlineStr) {
      const parsed = parseFloat(deadlineStr);
      if (!isNaN(parsed)) deadline = parsed / 1000;
    }

    const cancelled = (baggage['botanu.cancelled'] ?? '').toLowerCase() === 'true';

    return new RunContext({
      runId,
      workflow,
      eventId: baggage['botanu.event_id'] ?? '',
      customerId: baggage['botanu.customer_id'] ?? '',
      environment: baggage['botanu.environment'] ?? 'unknown',
      tenantId: baggage['botanu.tenant_id'],
      parentRunId: baggage['botanu.parent_run_id'],
      rootRunId: baggage['botanu.root_run_id'] ?? runId,
      attempt,
      retryOfRunId: baggage['botanu.retry_of_run_id'],
      deadline,
      cancelled,
    });
  }
}
