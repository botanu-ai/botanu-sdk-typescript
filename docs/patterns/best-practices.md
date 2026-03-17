# Best Practices

Patterns for effective cost attribution with Botanu SDK.

## Run Design

### One Run Per Business Outcome

A run should represent a complete business transaction:

```typescript
// GOOD - One run for one business outcome
async function processOrder(orderId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'process_order', eventId: orderId, customerId },
    async () => {
      const data = await fetchData(orderId);
      const result = await doWork(data);
      emitOutcome('success', { valueType: 'orders_processed', valueAmount: 1 });
      return result;
    }
  );
}
```

```typescript
// BAD - Multiple runs for one outcome
async function fetchData(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'fetch_data', eventId, customerId },
    async () => { /* ... */ }
  );
}

async function doWork(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'do_work', eventId, customerId },  // Don't do this
    async () => { /* ... */ }
  );
}
```

### Use Descriptive Workflow Names

Workflow names appear in dashboards and queries. Choose names carefully:

```typescript
// GOOD - Clear, descriptive names
botanuWorkflow({ name: 'support_resolution', eventId, customerId }, fn);
botanuWorkflow({ name: 'document_analysis', eventId, customerId }, fn);
botanuWorkflow({ name: 'lead_scoring', eventId, customerId }, fn);

// BAD - Generic or technical names
botanuWorkflow({ name: 'handle', eventId, customerId }, fn);
botanuWorkflow({ name: 'process', eventId, customerId }, fn);
botanuWorkflow({ name: 'main', eventId, customerId }, fn);
```

## Outcome Recording

### Always Record Outcomes

Every run should have an explicit outcome:

```typescript
await botanuWorkflow(
  { name: 'process_data', eventId: dataId, customerId },
  async () => {
    try {
      const result = await process(dataId);
      emitOutcome('success', { valueType: 'records_processed', valueAmount: result.count });
      return result;
    } catch (e) {
      if (e instanceof ValidationError) {
        emitOutcome('failed', { reason: 'validation_error' });
      } else if (e instanceof TimeoutError) {
        emitOutcome('failed', { reason: 'timeout' });
      }
      throw e;
    }
  }
);
```

### Quantify Value When Possible

Include value amounts for better ROI analysis:

```typescript
// GOOD - Quantified outcomes
emitOutcome('success', { valueType: 'items_sent', valueAmount: 50 });
emitOutcome('success', { valueType: 'revenue_generated', valueAmount: 1299.99 });
emitOutcome('success', { valueType: 'documents_processed', valueAmount: 10 });

// LESS USEFUL - No quantity
emitOutcome('success');
```

### Use Consistent Value Types

Standardize your value types across the organization:

```typescript
// Define standard value types
const ValueTypes = {
  ITEMS_PROCESSED: 'items_processed',
  DOCUMENTS_ANALYZED: 'documents_analyzed',
  LEADS_SCORED: 'leads_scored',
  MESSAGES_SENT: 'messages_sent',
  REVENUE_GENERATED: 'revenue_generated',
} as const;

// Use consistently
emitOutcome('success', { valueType: ValueTypes.ITEMS_PROCESSED, valueAmount: 1 });
```

### Include Reasons for Failures

Always explain why something failed:

```typescript
emitOutcome('failed', { reason: 'rate_limit_exceeded' });
emitOutcome('failed', { reason: 'invalid_input' });
emitOutcome('failed', { reason: 'model_unavailable' });
emitOutcome('failed', { reason: 'context_too_long' });
```

## LLM Tracking

### Always Record Token Usage

Tokens are the primary cost driver for LLMs:

```typescript
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    const response = await client.chat.completions.create(/* ... */);
    // Always set tokens
    tracker.setTokens({
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    });
  }
);
```

### Record Provider Request IDs

Request IDs enable reconciliation with provider invoices:

```typescript
tracker.setRequestId(response.id, crypto.randomUUID());
```

### Track Retries

Record attempt numbers for accurate cost per success:

```typescript
import pRetry from 'p-retry';

await pRetry(
  async (attemptCount) => {
    await trackLlmCall(
      { vendor: 'openai', model: 'gpt-4' },
      async (tracker) => {
        tracker.setAttempt(attemptCount);
        const response = await client.chat.completions.create(/* ... */);
        tracker.setTokens({
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        });
      }
    );
  },
  { retries: 3 }
);
```

### Use Correct Operation Types

Specify the operation type for accurate categorization:

```typescript
import { trackLlmCall, ModelOperation } from '@botanu/sdk';

// Chat completion
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4', operation: ModelOperation.CHAT },
  async (tracker) => { /* ... */ }
);

// Embeddings
await trackLlmCall(
  { vendor: 'openai', model: 'text-embedding-3-small', operation: ModelOperation.EMBEDDINGS },
  async (tracker) => { /* ... */ }
);
```

## Data Tracking

### Track All Cost-Generating Operations

Include databases, storage, and messaging:

```typescript
await botanuWorkflow(
  { name: 'run_pipeline', eventId: pipelineId, customerId },
  async () => {
    // Track warehouse query (billed by bytes scanned)
    await trackDbOperation(
      { system: 'snowflake', operation: 'SELECT' },
      async (db) => {
        const result = await snowflake.execute(sql);
        db.setBytesScanned(result.bytesScanned);
        db.setQueryId(result.queryId);
      }
    );

    // Track storage operations (billed by requests + data)
    await trackStorageOperation(
      { system: 's3', operation: 'PUT' },
      async (storage) => {
        await s3.putObject(params);
        storage.setResult({ bytesWritten: data.length });
      }
    );

    // Track messaging (billed by message count)
    await trackMessagingOperation(
      { system: 'sqs', operation: 'publish', destination: 'queue' },
      async (msg) => {
        await sqs.sendMessage(params);
        msg.setResult({ messageCount: batchSize });
      }
    );
  }
);
```

### Include Bytes for Pay-Per-Scan Services

For data warehouses billed by data scanned:

```typescript
await trackDbOperation(
  { system: 'bigquery', operation: 'SELECT' },
  async (db) => {
    const result = await bqClient.query(sql);
    db.setBytesScanned(result.totalBytesProcessed);
    db.setResult({ rowsReturned: result.rows.length });
  }
);
```

## Context Propagation

### Use Middleware for Web Services

Extract context from incoming requests:

```typescript
import express from 'express';
import { botanuExpressMiddleware } from '@botanu/sdk';

const app = express();
app.use(botanuExpressMiddleware({ workflow: 'api-handler' }));
```

### Propagate Context in Message Queues

Inject and extract context manually for async messaging:

```typescript
import { injectBotanuContext, extractBotanuCarrier, setBaggage, getBaggage } from '@botanu/sdk';

// Producer
function publishMessage(payload: any) {
  const carrier = injectBotanuContext();
  const message = {
    payload,
    baggage: carrier,
  };
  queue.publish(message);
}

// Consumer
function processMessage(message: any) {
  const carrier = message.baggage || {};
  const ctx = extractBotanuCarrier(carrier);
  // Continue processing with restored context
}
```

### Use Lean Mode for High-Traffic Systems

Default lean mode minimizes header overhead:

```typescript
// Lean mode: ~100 bytes of baggage
// Propagates: run_id, workflow, event_id, customer_id

// Full mode: ~300 bytes of baggage
// Propagates: run_id, workflow, event_id, customer_id,
//             environment, tenant_id, parent_run_id
```

## Configuration

### Use Environment Variables in Production

Keep configuration out of code:

```bash
export OTEL_SERVICE_NAME=my-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
export BOTANU_ENVIRONMENT=production
```

### Use YAML for Complex Configuration

For multi-environment setups:

```yaml
# config/production.yaml
service:
  name: ${OTEL_SERVICE_NAME}
  environment: production

otlp:
  endpoint: ${COLLECTOR_ENDPOINT}

propagation:
  mode: lean
```

## Multi-Tenant Systems

### Always Include Tenant ID

For accurate per-tenant cost attribution:

```typescript
await botanuWorkflow(
  { name: 'handle_request', eventId: requestId, customerId: custId, tenantId: request.tenantId },
  async () => { /* ... */ }
);
```

### Use Business Context

Add additional attribution dimensions via baggage:

```typescript
import { setBusinessContext } from '@botanu/sdk';

setBusinessContext({
  team: 'engineering',
  costCenter: 'R&D',
  region: 'us-west-2',
});
```

## Error Handling

### Record Errors Explicitly

Don't lose error context:

```typescript
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    try {
      const response = await client.chat.completions.create(/* ... */);
    } catch (e) {
      tracker.setError(e as Error); // Records error type and message
      throw e;
    }
  }
);
```

### Emit Outcomes for Errors

Even failed runs should have outcomes:

```typescript
await botanuWorkflow(
  { name: 'process_data', eventId: dataId, customerId },
  async () => {
    try {
      await doWork(dataId);
      emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
    } catch (e) {
      if (e instanceof ValidationError) {
        emitOutcome('failed', { reason: 'validation_error' });
      } else {
        emitOutcome('failed', { reason: (e as Error).constructor.name });
      }
      throw e;
    }
  }
);
```

## Performance

### Use Async Tracking

For async applications, ensure tracking is non-blocking:

```typescript
// The SDK uses span events, not separate API calls
// This is already non-blocking
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    const response = await doSomething();
    tracker.setTokens(/* ... */); // Immediate, non-blocking
  }
);
```

### Batch Database Tracking

For batch operations, track at batch level:

```typescript
// GOOD - Batch tracking
await trackDbOperation(
  { system: 'postgresql', operation: 'INSERT' },
  async (db) => {
    await client.query(insertSql, batchOf1000Rows);
    db.setResult({ rowsAffected: 1000 });
  }
);

// LESS EFFICIENT - Per-row tracking
for (const row of batchOf1000Rows) {
  await trackDbOperation(
    { system: 'postgresql', operation: 'INSERT' },
    async (db) => {
      await client.query(insertSql, [row]);
      db.setResult({ rowsAffected: 1 });
    }
  );
}
```

## Testing

### Mock Tracing in Tests

Use the NoOp tracer for unit tests:

```typescript
import { trace } from '@opentelemetry/api';

function setupTestTracing() {
  // Default provider is NoOp -- no setup needed in tests
  // Or explicitly:
  trace.disable();
}
```

### Test Outcome Recording

Verify outcomes are emitted correctly:

```typescript
import { jest } from '@jest/globals';
import * as botanu from '@botanu/sdk';

test('successful outcome', async () => {
  const spy = jest.spyOn(botanu, 'emitOutcome');
  await doWork('123');
  expect(spy).toHaveBeenCalledWith('success', {
    valueType: 'items_processed',
    valueAmount: 1,
  });
});
```

## See Also

- [Anti-Patterns](anti-patterns.md) - What to avoid
- [Architecture](../concepts/architecture.md) - SDK design principles
- [Configuration](../getting-started/configuration.md) - Configuration options
