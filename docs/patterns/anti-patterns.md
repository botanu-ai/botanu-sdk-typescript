# Anti-Patterns

Common mistakes to avoid when using Botanu SDK.

## Run Design Anti-Patterns

### Creating Runs for Internal Operations

**Don't** create runs for internal functions:

```typescript
// BAD - Too many runs
async function fetchData(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'fetch_data', eventId, customerId },  // Don't do this
    async () => await db.query(/* ... */)
  );
}

async function doWork(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'do_work', eventId, customerId },  // Or this
    async () => await llm.complete(/* ... */)
  );
}

async function handleRequest(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'handle_request', eventId, customerId },
    async () => {
      const data = await fetchData(eventId, customerId);
      const result = await doWork(eventId, customerId);
      return result;
    }
  );
}
```

**Do** use a single run at the entry point:

```typescript
// GOOD - One run for the business outcome
async function handleRequest(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'handle_request', eventId, customerId },
    async () => {
      const data = await fetchData(eventId);   // Not wrapped
      const result = await doWork(data);        // Not wrapped
      emitOutcome('success', { valueType: 'requests_processed', valueAmount: 1 });
      return result;
    }
  );
}
```

### Nesting botanuWorkflow Calls

**Don't** nest workflow wrappers:

```typescript
// BAD - Nested runs create confusion
async function outer() {
  return botanuWorkflow(
    { name: 'outer', eventId, customerId },
    async () => {
      await inner(); // Creates a second run
    }
  );
}

async function inner() {
  return botanuWorkflow(
    { name: 'inner', eventId, customerId },  // Don't do this
    async () => { /* ... */ }
  );
}
```

**Do** use `botanuWorkflow` only at entry points:

```typescript
// GOOD - Only entry point is wrapped
async function mainFlow() {
  return botanuWorkflow(
    { name: 'main_flow', eventId, customerId },
    async () => {
      await stepOne();  // No wrapper
      await stepTwo();  // No wrapper
    }
  );
}
```

### Generic Workflow Names

**Don't** use vague names:

```typescript
// BAD - Meaningless in dashboards
botanuWorkflow({ name: 'process', eventId, customerId }, fn);
botanuWorkflow({ name: 'handle', eventId, customerId }, fn);
botanuWorkflow({ name: 'main', eventId, customerId }, fn);
botanuWorkflow({ name: 'do_work', eventId, customerId }, fn);
```

**Do** use descriptive business names:

```typescript
// GOOD - Clear in reports
botanuWorkflow({ name: 'support_resolution', eventId, customerId }, fn);
botanuWorkflow({ name: 'invoice_processing', eventId, customerId }, fn);
botanuWorkflow({ name: 'lead_scoring', eventId, customerId }, fn);
botanuWorkflow({ name: 'document_analysis', eventId, customerId }, fn);
```

## Outcome Anti-Patterns

### Forgetting to Emit Outcomes

**Don't** leave runs without outcomes:

```typescript
// BAD - No outcome recorded
await botanuWorkflow(
  { name: 'process_order', eventId: orderId, customerId },
  async () => {
    const result = await process(orderId);
    return result; // Where's the outcome?
  }
);
```

**Do** always emit an outcome:

```typescript
// GOOD - Explicit outcome
await botanuWorkflow(
  { name: 'process_order', eventId: orderId, customerId },
  async () => {
    try {
      const result = await process(orderId);
      emitOutcome('success', { valueType: 'orders_processed', valueAmount: 1 });
      return result;
    } catch (e) {
      emitOutcome('failed', { reason: (e as Error).constructor.name });
      throw e;
    }
  }
);
```

### Multiple Outcomes Per Run

**Don't** emit multiple outcomes:

```typescript
// BAD - Multiple outcomes are confusing
await botanuWorkflow(
  { name: 'batch_processing', eventId: batchId, customerId },
  async () => {
    for (const item of items) {
      await process(item);
      emitOutcome('success', { valueType: 'item_processed' }); // Don't do this
    }
  }
);
```

**Do** emit one summary outcome:

```typescript
// GOOD - One outcome at the end
await botanuWorkflow(
  { name: 'batch_processing', eventId: batchId, customerId },
  async () => {
    let processed = 0;
    for (const item of items) {
      await process(item);
      processed++;
    }
    emitOutcome('success', { valueType: 'items_processed', valueAmount: processed });
  }
);
```

### Missing Failure Reasons

**Don't** emit failures without reasons:

```typescript
// BAD - No context for debugging
catch (e) {
  emitOutcome('failed'); // Why did it fail?
  throw e;
}
```

**Do** include the failure reason:

```typescript
// GOOD - Reason helps debugging
catch (e) {
  if (e instanceof ValidationError) {
    emitOutcome('failed', { reason: 'validation_error' });
  } else if (e instanceof RateLimitError) {
    emitOutcome('failed', { reason: 'rate_limit_exceeded' });
  } else {
    emitOutcome('failed', { reason: (e as Error).constructor.name });
  }
  throw e;
}
```

## LLM Tracking Anti-Patterns

### Not Recording Tokens

**Don't** skip token recording:

```typescript
// BAD - No cost data
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async () => {
    const response = await client.chat.completions.create(/* ... */);
    // Token usage not recorded
  }
);
```

**Do** always record tokens:

```typescript
// GOOD - Tokens enable cost calculation
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    const response = await client.chat.completions.create(/* ... */);
    tracker.setTokens({
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    });
  }
);
```

### Ignoring Cached Tokens

**Don't** forget cache tokens (they have different pricing):

```typescript
// BAD - Missing cache data
tracker.setTokens({
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
});
```

**Do** include cache breakdown:

```typescript
// GOOD - Full token breakdown
tracker.setTokens({
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
  cacheReadTokens: response.usage.cache_read_tokens,
  cacheWriteTokens: response.usage.cache_write_tokens,
});
```

### Wrong Provider Names

**Don't** use inconsistent provider names:

```typescript
// BAD - Inconsistent naming
trackLlmCall({ vendor: 'OpenAI', model: 'gpt-4' }, fn);     // Mixed case
trackLlmCall({ vendor: 'open-ai', model: 'gpt-4' }, fn);    // Wrong format
trackLlmCall({ vendor: 'gpt', model: 'gpt-4' }, fn);        // Model as provider
```

**Do** use standard provider names (auto-normalized):

```typescript
// GOOD - Standard names (or let SDK normalize)
trackLlmCall({ vendor: 'openai', model: 'gpt-4' }, fn);
trackLlmCall({ vendor: 'anthropic', model: 'claude-3-opus' }, fn);
trackLlmCall({ vendor: 'azure_openai', model: 'gpt-4' }, fn);
```

## Configuration Anti-Patterns

### Hardcoding Configuration

**Don't** hardcode production values:

```typescript
// BAD - Hardcoded
enable({
  serviceName: 'my-service',
  otlpEndpoint: 'http://prod-collector.internal:4318',
});
```

**Do** use environment variables:

```typescript
// GOOD - Environment-based
enable({ serviceName: process.env.OTEL_SERVICE_NAME });

// Or use YAML with interpolation
// botanu.yaml
// otlp:
//   endpoint: ${COLLECTOR_ENDPOINT}
```

### Disabling Auto-Instrumentation Unnecessarily

**Don't** disable auto-instrumentation without reason:

```typescript
// BAD - Missing automatic tracing
enable({
  serviceName: 'my-service',
  autoInstrumentation: false, // Why?
});
```

**Do** keep defaults or be selective:

```typescript
// GOOD - Default instrumentation (autoInstrumentation=true by default)
enable({ serviceName: 'my-service' });
```

## Context Propagation Anti-Patterns

### Losing Context in Async Code

**Don't** spawn tasks without context:

```typescript
// BAD - Context lost with manual setTimeout/setInterval
await botanuWorkflow(
  { name: 'parallel_work', eventId, customerId },
  async () => {
    setTimeout(() => {
      doSomething(); // Context may be lost
    }, 0);
  }
);
```

**Do** ensure context propagates:

```typescript
// GOOD - Context flows through Promise.all
await botanuWorkflow(
  { name: 'parallel_work', eventId, customerId },
  async () => {
    await Promise.all([
      doSomething(),       // Inherits context
      doSomethingElse(),   // Inherits context
    ]);
  }
);
```

### Not Extracting Context in Consumers

**Don't** ignore incoming context:

```typescript
// BAD - Context not extracted
function processMessage(message: any) {
  // run_id from producer is lost
  doWork(message.payload);
}
```

**Do** extract and use context:

```typescript
// GOOD - Context continues
import { extractBotanuCarrier } from '@botanu/sdk';

function processMessage(message: any) {
  const carrier = message.baggage || {};
  const ctx = extractBotanuCarrier(carrier);
  // Continue processing with restored context
  doWork(message.payload);
}
```

## Data Tracking Anti-Patterns

### Not Tracking Data Operations

**Don't** ignore database/storage costs:

```typescript
// BAD - Only LLM tracked
await botanuWorkflow(
  { name: 'analyze_data', eventId, customerId },
  async () => {
    const data = await snowflake.query(expensiveQuery); // Not tracked!
    await trackLlmCall(
      { vendor: 'openai', model: 'gpt-4' },
      async (tracker) => {
        const result = await llm.complete(data);
        tracker.setTokens(/* ... */);
      }
    );
  }
);
```

**Do** track all cost-generating operations:

```typescript
// GOOD - Complete cost picture
await botanuWorkflow(
  { name: 'analyze_data', eventId, customerId },
  async () => {
    const data = await trackDbOperation(
      { system: 'snowflake', operation: 'SELECT' },
      async (db) => {
        const data = await snowflake.query(expensiveQuery);
        db.setBytesScanned(data.bytesScanned);
        return data;
      }
    );

    await trackLlmCall(
      { vendor: 'openai', model: 'gpt-4' },
      async (tracker) => {
        const result = await llm.complete(data);
        tracker.setTokens(/* ... */);
      }
    );
  }
);
```

### Missing Bytes for Pay-Per-Scan

**Don't** forget bytes for warehouses:

```typescript
// BAD - Missing cost driver
await trackDbOperation(
  { system: 'bigquery', operation: 'SELECT' },
  async (db) => {
    const result = await bq.query(sql);
    db.setResult({ rowsReturned: result.rows.length }); // Rows don't determine cost!
  }
);
```

**Do** include bytes scanned:

```typescript
// GOOD - Bytes scanned is the cost driver
await trackDbOperation(
  { system: 'bigquery', operation: 'SELECT' },
  async (db) => {
    const result = await bq.query(sql);
    db.setBytesScanned(result.totalBytesProcessed);
    db.setResult({ rowsReturned: result.rows.length });
  }
);
```

## Error Handling Anti-Patterns

### Swallowing Errors

**Don't** hide errors:

```typescript
// BAD - Error hidden
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async () => {
    try {
      const response = await llm.complete(/* ... */);
    } catch {
      // Silently fails - no error recorded
    }
  }
);
```

**Do** record and propagate errors:

```typescript
// GOOD - Error tracked and raised
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    try {
      const response = await llm.complete(/* ... */);
    } catch (e) {
      tracker.setError(e as Error);
      emitOutcome('failed', { reason: (e as Error).constructor.name });
      throw e;
    }
  }
);
```

### Ignoring Partial Successes

**Don't** mark all-or-nothing:

```typescript
// BAD - All items fail if one fails
await botanuWorkflow(
  { name: 'batch_work', eventId: batchId, customerId },
  async () => {
    for (const item of items) {
      await process(item); // If one fails, no outcome
    }
    emitOutcome('success', { valueAmount: items.length });
  }
);
```

**Do** track partial success:

```typescript
// GOOD - Partial success recorded
await botanuWorkflow(
  { name: 'batch_work', eventId: batchId, customerId },
  async () => {
    let processed = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await process(item);
        processed++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      emitOutcome('success', { valueType: 'items_processed', valueAmount: processed });
    } else if (processed > 0) {
      emitOutcome('partial', {
        valueType: 'items_processed',
        valueAmount: processed,
        reason: `failed_${failed}_of_${items.length}`,
      });
    } else {
      emitOutcome('failed', { reason: 'all_items_failed' });
    }
  }
);
```

## Testing Anti-Patterns

### Testing with Real Exporters

**Don't** send telemetry during tests:

```typescript
// BAD - Tests hit real collector
test('workflow', async () => {
  enable({ serviceName: 'test' }); // Sends to real endpoint!
  await doWork();
});
```

**Do** use NoOp or in-memory exporters:

```typescript
// GOOD - Tests are isolated
import { trace } from '@opentelemetry/api';

beforeAll(() => {
  trace.disable(); // No external calls
});

test('workflow', async () => {
  await doWork();
});
```

## See Also

- [Best Practices](best-practices.md) - What to do
- [Quickstart](../getting-started/quickstart.md) - Getting started guide
- [Outcomes](../tracking/outcomes.md) - Outcome recording details
