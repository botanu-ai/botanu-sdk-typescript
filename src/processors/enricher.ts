// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * RunContextEnricher — the only span processor needed in the SDK.
 *
 * Why this MUST be in SDK (not collector):
 * - Baggage is process-local (not sent over the wire).
 * - Only the SDK can read baggage and write it to span attributes.
 * - The collector only sees spans after they're exported.
 */

import {
  type Context,
  propagation,
  type Span,
} from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

const BAGGAGE_KEYS_FULL = [
  'botanu.run_id',
  'botanu.workflow',
  'botanu.event_id',
  'botanu.customer_id',
  'botanu.environment',
  'botanu.tenant_id',
  'botanu.parent_run_id',
];

const BAGGAGE_KEYS_LEAN = [
  'botanu.run_id',
  'botanu.workflow',
  'botanu.event_id',
  'botanu.customer_id',
];

export class RunContextEnricher implements SpanProcessor {
  private readonly _baggageKeys: readonly string[];

  constructor(leanMode: boolean = true) {
    this._baggageKeys = leanMode ? BAGGAGE_KEYS_LEAN : BAGGAGE_KEYS_FULL;
  }

  onStart(span: Span, parentContext: Context): void {
    const bag = propagation.getBaggage(parentContext);
    if (!bag) return;

    for (const key of this._baggageKeys) {
      const entry = bag.getEntry(key);
      if (entry) {
        const readable = span as unknown as ReadableSpan;
        if (!readable.attributes?.[key]) {
          span.setAttribute(key, entry.value);
        }
      }
    }
  }

  onEnd(_span: ReadableSpan): void {
    // No-op
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
