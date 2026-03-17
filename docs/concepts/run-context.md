# Run Context

The Run Context is the core concept in Botanu SDK. It represents a single execution attempt of a business event that you want to track for cost attribution.

## Events and Runs

An **event** is one business transaction -- a logical unit of work that produces a business outcome. Examples:

- Processing an incoming request
- Handling a scheduled job
- Executing a pipeline step
- Responding to a webhook

A **run** is one execution attempt within an event. Each retry of the same event gets a new `run_id` but shares the same `event_id`. A single run may involve:

- Multiple LLM calls (possibly to different providers)
- Database queries
- Storage operations
- External API calls
- Message queue operations

An event will have an **outcome** -- the business result of the work (success, failure, partial, etc.).

## The run_id

Every run is identified by a unique `run_id` -- a UUIDv7 that is:

- **Time-sortable**: IDs generated later sort after earlier ones
- **Globally unique**: No collisions across services
- **Propagated automatically**: Flows through your entire application via W3C Baggage

```typescript
import { generateRunId } from '@botanu/sdk';

const runId = generateRunId();
// "019abc12-def3-7890-abcd-1234567890ab"
```

## RunContext Model

The `RunContext` interface holds all metadata for a run:

```typescript
import { RunContext } from '@botanu/sdk';

const ctx = RunContext.create({
  workflow: 'process',
  eventId: 'evt-001',
  customerId: 'cust-456',
  environment: 'production',
  tenantId: 'tenant-123',
});

console.log(ctx.runId);       // "019abc12-def3-7890-..."
console.log(ctx.rootRunId);   // Same as runId for top-level runs
console.log(ctx.attempt);     // 1 (first attempt)
```

### Key Fields

| Field | Description |
|-------|-------------|
| `runId` | Unique identifier for this run (UUIDv7) |
| `rootRunId` | ID of the original run (for retries, same as `runId` for first attempt) |
| `eventId` | Identifier for the business event (same across retries) |
| `customerId` | Identifier for the customer this event belongs to |
| `workflow` | Workflow/function name |
| `environment` | Deployment environment (production, staging, etc.) |
| `attempt` | Attempt number (1 for first, 2+ for retries) |
| `tenantId` | Optional tenant identifier for multi-tenant systems |

## Creating Runs

### Using the Wrapper Function (Recommended)

```typescript
import { botanuWorkflow } from '@botanu/sdk';

await botanuWorkflow(
  { name: 'process', eventId: 'evt-001', customerId: 'cust-456' },
  async () => {
    // RunContext is automatically created and propagated
    // All operations inside inherit the same run_id
  }
);
```

### Using runBotanu

```typescript
import { runBotanu } from '@botanu/sdk';

await runBotanu(
  { name: 'process', eventId: 'evt-001', customerId: 'cust-456' },
  async () => {
    // RunContext is active within this callback
  }
);
```

### Manual Creation

```typescript
import { RunContext } from '@botanu/sdk';

const ctx = RunContext.create({
  workflow: 'process',
  eventId: 'evt-001',
  customerId: 'cust-456',
  tenantId: 'acme-corp',
});

// Use ctx.toBaggageDict() to propagate via HTTP headers
// Use ctx.toSpanAttributes() to add to spans
```

## Retry Handling

When a run fails and is retried, use `createRetry()` to maintain lineage:

```typescript
const previous = RunContext.create({
  workflow: 'process',
  eventId: 'evt-001',
  customerId: 'cust-456',
});

// First attempt fails...

const retry = RunContext.createRetry(previous);
console.log(retry.attempt);        // 2
console.log(retry.retryOfRunId);   // Previous run_id
console.log(retry.rootRunId);      // Same as previous.runId
console.log(retry.runId);          // New unique ID
```

This enables:
- Tracking total attempts for a business event
- Correlating retries back to the previous request
- Calculating aggregate cost across all attempts

## Deadlines and Cancellation

RunContext supports deadline and cancellation tracking:

```typescript
const ctx = RunContext.create({
  workflow: 'process',
  eventId: 'evt-001',
  customerId: 'cust-456',
  deadlineSeconds: 30.0,  // 30 second deadline
});

// Check deadline
if (ctx.isPastDeadline()) {
  throw new Error('Deadline exceeded');
}

// Check remaining time
const remaining = ctx.remainingTimeSeconds();

// Request cancellation
ctx.requestCancellation('user');
if (ctx.isCancelled()) {
  // Clean up and exit
}
```

## Outcomes

Record the business outcome of a run using `emitOutcome`:

```typescript
import { emitOutcome, RunStatus } from '@botanu/sdk';

emitOutcome(RunStatus.SUCCESS, {
  valueType: 'task_completed',
  valueAmount: 1.0,
  confidence: 0.95,
  reason: 'Completed successfully',
});
```

`RunStatus` values: `SUCCESS`, `FAILURE`, `PARTIAL`, `TIMEOUT`, `CANCELED`.

`emitOutcome` accepts these options: `valueType`, `valueAmount`, `confidence`, `reason`, `errorType`, `metadata`.

## Serialization

### To Baggage (for HTTP propagation)

```typescript
// Lean mode (default): essential fields
const baggage = ctx.toBaggageDict();
// {"botanu.run_id": "...", "botanu.workflow": "...", "botanu.event_id": "...", "botanu.customer_id": "..."}

// Full mode: all fields
const baggage = ctx.toBaggageDict({ leanMode: false });
// Adds: botanu.environment, botanu.tenant_id, botanu.parent_run_id, botanu.root_run_id,
//        botanu.attempt, botanu.retry_of_run_id, botanu.deadline, botanu.cancelled
```

### To Span Attributes

```typescript
const attrs = ctx.toSpanAttributes();
// {"botanu.run_id": "...", "botanu.workflow": "...", ...}
```

### From Baggage (receiving side)

```typescript
const ctx = RunContext.fromBaggage(baggageDict);
if (!ctx) {
  // Required fields missing, create new context
  const ctx = RunContext.create({
    workflow: 'unknown',
    eventId: 'evt-fallback',
    customerId: 'unknown',
  });
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOTANU_ENVIRONMENT` | Default environment | `"production"` |
| `BOTANU_PROPAGATION_MODE` | `"lean"` or `"full"` | `"lean"` |

## Best Practices

1. **One event per business outcome**: Don't create events for internal operations
2. **Use descriptive workflow names**: They appear in dashboards and queries
3. **Leverage tenant_id**: Essential for multi-tenant cost attribution
4. **Handle retries properly**: Always use `createRetry()` for retry attempts
5. **Always provide event_id and customer_id**: They are required for proper cost attribution

## See Also

- [Context Propagation](context-propagation.md) - How context flows through your application
- [Outcomes](../tracking/outcomes.md) - Recording business outcomes
