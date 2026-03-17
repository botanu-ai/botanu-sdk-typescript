# Outcomes

Record business outcomes to enable cost-per-outcome analysis.

## Overview

Outcomes connect infrastructure costs to business value. By recording what each event achieved, you can calculate the true ROI of your AI workflows.

**Terminology:**
- An **event** is one business transaction (e.g., a customer request, a pipeline trigger).
- A **run** is one execution attempt within an event.
- An event will have an **outcome** describing what was achieved.

## Basic Usage

```typescript
import { botanuWorkflow, emitOutcome } from '@botanu/sdk';

await botanuWorkflow(
  { name: 'process-items', eventId: request.id, customerId: customer.id },
  async () => {
    const result = await doWork();

    // Record the business outcome
    emitOutcome('success', { valueType: 'items_processed', valueAmount: result.count });
  }
);
```

## emitOutcome() Parameters

```typescript
emitOutcome(
  status: string,                    // Required: "success", "partial", "failed", "timeout", "canceled", "abandoned"
  options?: {
    valueType?: string,              // What was achieved
    valueAmount?: number,            // How much
    confidence?: number,             // Confidence score (0.0-1.0)
    reason?: string,                 // Why (especially for failures)
    errorType?: string,              // Error classification
    metadata?: Record<string, string>, // Additional key-value pairs
  }
)
```

### status

The outcome status:

| Status | Description | Example |
|--------|-------------|---------|
| `success` | Fully achieved goal | All items processed |
| `partial` | Partially achieved | 3 of 5 items processed |
| `failed` | Did not achieve goal | Error during processing |
| `timeout` | Timed out before completing | Deadline exceeded |
| `canceled` | Canceled by user or system | User aborted the request |
| `abandoned` | Abandoned without completion | No response from upstream |

### valueType

A descriptive label for what was achieved:

```typescript
emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
emitOutcome('success', { valueType: 'documents_generated', valueAmount: 5 });
emitOutcome('success', { valueType: 'tasks_completed', valueAmount: 1 });
emitOutcome('success', { valueType: 'revenue_generated', valueAmount: 499.99 });
```

### valueAmount

The quantified value:

```typescript
// Count
emitOutcome('success', { valueType: 'records_written', valueAmount: 100 });

// Revenue
emitOutcome('success', { valueType: 'order_value', valueAmount: 1299.99 });

// Score
emitOutcome('success', { valueType: 'quality_score', valueAmount: 4.5 });
```

### confidence

For probabilistic outcomes:

```typescript
emitOutcome('success', {
  valueType: 'classifications_completed',
  valueAmount: 1,
  confidence: 0.92,
});
```

### reason

Explain the outcome (especially for failures):

```typescript
emitOutcome('failed', { reason: 'rate_limit_exceeded' });
emitOutcome('failed', { reason: 'invalid_input' });
emitOutcome('partial', { reason: 'timeout_partial_results', valueAmount: 3 });
```

### errorType

Classify the error for aggregation:

```typescript
emitOutcome('failed', { reason: 'upstream service unavailable', errorType: 'ServiceUnavailable' });
emitOutcome('timeout', { reason: 'model took too long', errorType: 'DeadlineExceeded' });
```

### metadata

Attach arbitrary key-value pairs:

```typescript
emitOutcome('success', {
  valueType: 'items_processed',
  valueAmount: 10,
  metadata: { batchId: 'abc-123', retryCount: '2' },
});
```

## Outcome Patterns

### Success with Value

```typescript
await botanuWorkflow(
  { name: 'fulfill-order', eventId: order.id, customerId: customer.id },
  async () => {
    const result = await doWork();

    emitOutcome('success', {
      valueType: 'orders_fulfilled',
      valueAmount: 1,
    });
  }
);
```

### Success with Revenue

```typescript
await botanuWorkflow(
  { name: 'handle-inquiry', eventId: inquiry.id, customerId: customer.id },
  async () => {
    const result = await process();

    if (result.completed) {
      emitOutcome('success', {
        valueType: 'revenue_generated',
        valueAmount: result.total,
      });
    } else {
      emitOutcome('partial', {
        valueType: 'leads_qualified',
        valueAmount: 1,
      });
    }
  }
);
```

### Partial Success

```typescript
await botanuWorkflow(
  { name: 'batch-process', eventId: batch.id, customerId: customer.id },
  async () => {
    let processed = 0;
    for (const item of items) {
      try {
        await doSomething(item);
        processed++;
      } catch {
        continue;
      }
    }

    if (processed === items.length) {
      emitOutcome('success', { valueType: 'items_processed', valueAmount: processed });
    } else if (processed > 0) {
      emitOutcome('partial', {
        valueType: 'items_processed',
        valueAmount: processed,
        reason: `processed_${processed}_of_${items.length}`,
      });
    } else {
      emitOutcome('failed', { reason: 'no_items_processed' });
    }
  }
);
```

### Failure with Reason

```typescript
await botanuWorkflow(
  { name: 'analyze', eventId: job.id, customerId: customer.id },
  async () => {
    try {
      const data = await doWork(docId);
      if (!data) {
        emitOutcome('failed', { reason: 'not_found', errorType: 'NotFound' });
        return null;
      }

      const result = await process(data);
      emitOutcome('success', { valueType: 'items_analyzed', valueAmount: 1 });
      return result;
    } catch (e) {
      if (e instanceof RateLimitError) {
        emitOutcome('failed', { reason: 'rate_limit_exceeded', errorType: 'RateLimitError' });
      } else if (e instanceof TimeoutError) {
        emitOutcome('timeout', { reason: 'analysis_timeout', errorType: 'TimeoutError' });
      }
      throw e;
    }
  }
);
```

### Classification with Confidence

```typescript
await botanuWorkflow(
  { name: 'classify', eventId: request.id, customerId: customer.id },
  async () => {
    const result = await doWork(message);

    emitOutcome('success', {
      valueType: 'classifications_completed',
      valueAmount: 1,
      confidence: result.confidence,
    });

    return result.label;
  }
);
```

## Automatic Outcomes

The `botanuWorkflow` wrapper automatically emits outcomes:

```typescript
await botanuWorkflow(
  { name: 'my-workflow', eventId, customerId, autoOutcomeOnSuccess: true }, // Default
  async () => {
    // If no exception and no explicit emitOutcome, emits "success"
    return result;
  }
);
```

If an exception is thrown, it automatically emits `"failed"` with the exception class as the reason.

To disable:

```typescript
await botanuWorkflow(
  { name: 'my-workflow', eventId, customerId, autoOutcomeOnSuccess: false },
  async () => {
    // Must call emitOutcome explicitly
    emitOutcome('success');
  }
);
```

## runBotanu Alternative

Use `runBotanu` as an alias when the name reads better:

```typescript
import { runBotanu, emitOutcome } from '@botanu/sdk';

await runBotanu(
  { name: 'my-workflow', eventId, customerId },
  async () => {
    const result = await doWork();
    emitOutcome('success', { valueType: 'items_processed', valueAmount: result.count });
    return result;
  }
);
```

## Span Attributes

Outcomes are recorded as span attributes:

| Attribute | Description |
|-----------|-------------|
| `botanu.outcome.status` | Status (success/partial/failed/timeout/canceled/abandoned) |
| `botanu.outcome.value_type` | What was achieved |
| `botanu.outcome.value_amount` | Quantified value |
| `botanu.outcome.confidence` | Confidence score |
| `botanu.outcome.reason` | Reason for outcome |
| `botanu.outcome.error_type` | Error classification |

## Span Events

An event is also emitted for timeline visibility:

```
Event: botanu.outcome_emitted
Attributes:
  status: "success"
  value_type: "items_processed"
  value_amount: 1
```

## Cost-Per-Outcome Analysis

With outcomes recorded, you can calculate:

```sql
-- Cost per successful outcome
SELECT
    AVG(total_cost) as avg_cost_per_success
FROM runs
WHERE workflow = 'fulfill-order'
  AND outcome_status = 'success'
  AND outcome_value_type = 'orders_fulfilled';

-- ROI by workflow
SELECT
    workflow,
    SUM(outcome_value_amount * value_per_unit) as total_value,
    SUM(total_cost) as total_cost,
    (SUM(outcome_value_amount * value_per_unit) - SUM(total_cost)) / SUM(total_cost) as roi
FROM runs
GROUP BY workflow;
```

## Best Practices

### 1. Always Record Outcomes

Every workflow should emit an outcome:

```typescript
await botanuWorkflow(
  { name: 'my-workflow', eventId, customerId },
  async () => {
    try {
      const result = await doWork();
      emitOutcome('success', { valueType: 'items_processed', valueAmount: result.count });
      return result;
    } catch (e) {
      emitOutcome('failed', { reason: (e as Error).constructor.name, errorType: (e as Error).constructor.name });
      throw e;
    }
  }
);
```

### 2. Use Consistent Value Types

Define standard value types for your organization:

```typescript
// Good - consistent naming
emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
emitOutcome('success', { valueType: 'documents_generated', valueAmount: 1 });

// Bad - inconsistent
emitOutcome('success', { valueType: 'item_done', valueAmount: 1 });
emitOutcome('success', { valueType: 'doc processed', valueAmount: 1 });
```

### 3. Quantify When Possible

Include amounts for better analysis:

```typescript
// Good - quantified
emitOutcome('success', { valueType: 'records_written', valueAmount: 50 });

// Less useful - no amount
emitOutcome('success');
```

### 4. Include Reasons for Failures

Always explain why something failed:

```typescript
emitOutcome('failed', { reason: 'api_rate_limit', errorType: 'RateLimitError' });
emitOutcome('failed', { reason: 'invalid_input_format', errorType: 'ValidationError' });
emitOutcome('timeout', { reason: 'model_unavailable', errorType: 'TimeoutError' });
```

### 5. One Outcome Per Run

Emit only one outcome per workflow execution:

```typescript
await botanuWorkflow(
  { name: 'process-items', eventId, customerId },
  async () => {
    let successful = 0;
    for (const item of items) {
      if (await process(item)) {
        successful++;
      }
    }

    // One outcome at the end
    emitOutcome('success', { valueType: 'items_processed', valueAmount: successful });
  }
);
```

## See Also

- [Run Context](../concepts/run-context.md) - Understanding runs
- [LLM Tracking](llm-tracking.md) - Tracking LLM costs
- [Best Practices](../patterns/best-practices.md) - More patterns
