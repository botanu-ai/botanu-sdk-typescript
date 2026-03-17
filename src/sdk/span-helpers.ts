// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Helper functions for working with OpenTelemetry spans.
 *
 * These functions add Botanu-specific attributes to the current span.
 */

import { context, trace } from '@opentelemetry/api';
import { getBaggage } from './context.js';

let _logWarningEmitted = false;

export const VALID_OUTCOME_STATUSES = new Set([
  'success',
  'partial',
  'failed',
  'timeout',
  'canceled',
  'abandoned',
]);

export interface EmitOutcomeOptions {
  status: string;
  valueType?: string;
  valueAmount?: number;
  confidence?: number;
  reason?: string;
  errorType?: string;
  metadata?: Record<string, string>;
}

export function emitOutcome(options: EmitOutcomeOptions): void;
export function emitOutcome(status: string, extra?: Omit<EmitOutcomeOptions, 'status'>): void;
export function emitOutcome(
  statusOrOptions: string | EmitOutcomeOptions,
  extra?: Omit<EmitOutcomeOptions, 'status'>,
): void {
  const opts: EmitOutcomeOptions =
    typeof statusOrOptions === 'string'
      ? { status: statusOrOptions, ...extra }
      : statusOrOptions;

  if (!VALID_OUTCOME_STATUSES.has(opts.status)) {
    throw new Error(
      `Invalid outcome status '${opts.status}'. ` +
        `Must be one of: ${[...VALID_OUTCOME_STATUSES].sort().join(', ')}`,
    );
  }

  const span = trace.getSpan(context.active());
  if (!span || !span.isRecording()) {
    console.warn(
      'Botanu: emitOutcome() called with no active span. ' +
        'Ensure this is called inside a botanuWorkflow() or runBotanu() context.',
    );
    return;
  }

  span.setAttribute('botanu.outcome.status', opts.status);

  if (opts.valueType) span.setAttribute('botanu.outcome.value_type', opts.valueType);
  if (opts.valueAmount != null) span.setAttribute('botanu.outcome.value_amount', opts.valueAmount);
  if (opts.confidence != null) span.setAttribute('botanu.outcome.confidence', opts.confidence);
  if (opts.reason) span.setAttribute('botanu.outcome.reason', opts.reason);
  if (opts.errorType) span.setAttribute('botanu.outcome.error_type', opts.errorType);

  if (opts.metadata) {
    for (const [key, value] of Object.entries(opts.metadata)) {
      span.setAttribute(`botanu.outcome.metadata.${key}`, value);
    }
  }

  const eventAttrs: Record<string, string | number> = { status: opts.status };
  if (opts.valueType) eventAttrs.value_type = opts.valueType;
  if (opts.valueAmount != null) eventAttrs.value_amount = opts.valueAmount;
  if (opts.errorType) eventAttrs.error_type = opts.errorType;

  span.addEvent('botanu.outcome_emitted', eventAttrs);

  // Emit OTel log record for collector flush trigger
  const eventId = getBaggage('botanu.event_id');
  if (eventId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const apiLogs = require('@opentelemetry/api-logs');
      const logger = apiLogs.logs.getLogger('botanu.outcome');
      logger.emit({
        body: `outcome:${opts.status}`,
        attributes: {
          'botanu.event_id': eventId,
          'botanu.outcome.status': opts.status,
        },
      });
    } catch {
      if (!_logWarningEmitted) {
        console.warn(
          'Botanu: outcome log record emission failed. Install @opentelemetry/api-logs for collector flush triggers.',
        );
        _logWarningEmitted = true;
      }
    }
  }
}

export interface BusinessContextOptions {
  customerId?: string;
  team?: string;
  costCenter?: string;
  region?: string;
}

export function setBusinessContext(options: BusinessContextOptions): void {
  const span = trace.getSpan(context.active());
  if (!span || !span.isRecording()) {
    console.warn(
      'Botanu: setBusinessContext() called with no active span. ' +
        'Ensure this is called inside a botanuWorkflow() or runBotanu() context.',
    );
    return;
  }

  if (options.customerId) span.setAttribute('botanu.customer_id', options.customerId);
  if (options.team) span.setAttribute('botanu.team', options.team);
  if (options.costCenter) span.setAttribute('botanu.cost_center', options.costCenter);
  if (options.region) span.setAttribute('botanu.region', options.region);
}
