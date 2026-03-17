# Context Propagation

Context propagation ensures that the `run_id` and other metadata flow through your entire application -- across function calls, HTTP requests, message queues, and async workers.

## How It Works

Botanu uses **W3C Baggage** for context propagation, the same standard used by OpenTelemetry for distributed tracing.

```
+-----------------------------------------------------------------+
|  HTTP Request Headers                                           |
+-----------------------------------------------------------------+
|  traceparent: 00-{trace_id}-{span_id}-01                       |
|  baggage: botanu.run_id=019abc12...,botanu.workflow=process     |
+-----------------------------------------------------------------+
```

When you make an outbound HTTP request, the `botanu.run_id` travels in the `baggage` header alongside the trace context.

## Propagation Modes

### Lean Mode (Default)

Only propagates essential fields to minimize header size:
- `botanu.run_id`
- `botanu.workflow`
- `botanu.event_id`
- `botanu.customer_id`

```
baggage: botanu.run_id=019abc12-def3-7890-abcd-1234567890ab,botanu.workflow=process,botanu.event_id=evt-001,botanu.customer_id=cust-456
```

### Full Mode

Propagates all context fields. In addition to the lean fields, full mode adds:
- `botanu.environment`
- `botanu.tenant_id`
- `botanu.parent_run_id`
- `botanu.root_run_id`
- `botanu.attempt`
- `botanu.retry_of_run_id`
- `botanu.deadline`
- `botanu.cancelled`

```bash
# Enable full mode
export BOTANU_PROPAGATION_MODE=full
```

## In-Process Propagation

Within a single process, context is propagated via Node.js `AsyncLocalStorage`:

```typescript
import { botanuWorkflow } from '@botanu/sdk';

await botanuWorkflow(
  { name: 'process', eventId: 'evt-001', customerId: 'cust-456' },
  async () => {
    // Context is set here

    await doSomething();    // Inherits context
    await doMoreWork();     // Inherits context
    await saveResult();     // Inherits context
  }
);
```

The `RunContextEnricher` span processor automatically reads baggage and writes to span attributes:

```typescript
class RunContextEnricher implements SpanProcessor {
  onStart(span: Span, parentContext: Context): void {
    for (const key of ['botanu.run_id', 'botanu.workflow']) {
      const value = propagation.getBaggage(parentContext)?.getEntry(key)?.value;
      if (value) {
        span.setAttribute(key, value);
      }
    }
  }
}
```

This ensures **every span** -- including auto-instrumented ones -- gets the `run_id`.

## HTTP Propagation

### Outbound Requests

When using instrumented HTTP clients (`http`, `undici`, `fetch`), baggage is automatically propagated:

```typescript
import { botanuWorkflow } from '@botanu/sdk';

await botanuWorkflow(
  { name: 'process', eventId: 'evt-001', customerId: 'cust-456' },
  async () => {
    // Baggage is automatically added to headers
    const response = await fetch('https://api.example.com/data');
  }
);
```

### Inbound Requests (Frameworks)

For web frameworks (`Express`, `Fastify`, `Koa`), use the middleware to extract context:

```typescript
// Express
import express from 'express';
import { botanuExpressMiddleware } from '@botanu/sdk';

const app = express();
app.use(botanuExpressMiddleware({ workflow: 'api-handler' }));

app.post('/tasks', (req, res) => {
  // RunContext is extracted from incoming baggage
  // or created if not present
});
```

## Message Queue Propagation

For async messaging systems, you need to manually inject and extract context.

### Injecting Context (Producer)

```typescript
import { injectBotanuContext } from '@botanu/sdk';

function publishMessage(queue: Queue, payload: any) {
  const carrier = injectBotanuContext();

  const message = {
    payload,
    metadata: carrier,
  };
  queue.publish(message);
}
```

### Extracting Context (Consumer)

```typescript
import { extractBotanuCarrier, runBotanu } from '@botanu/sdk';

function processMessage(message: any) {
  const carrier = message.metadata || {};
  const ctx = extractBotanuCarrier(carrier);

  if (ctx) {
    // Continue with existing context
    runBotanu(
      { name: ctx.workflow, eventId: ctx.eventId, customerId: ctx.customerId },
      async () => {
        await doWork(message.payload);
      }
    );
  } else {
    // Create new context
    runBotanu(
      { name: 'process_message', eventId: 'evt-fallback', customerId: 'unknown' },
      async () => {
        await doWork(message.payload);
      }
    );
  }
}
```

## Cross-Service Propagation

```
+--------------+     HTTP      +--------------+     Kafka     +--------------+
|   Service A  | ------------> |   Service B  | ------------> |   Service C  |
|              |   baggage:    |              |   message     |              |
|  run_id=X    |   run_id=X    |  run_id=X    |   run_id=X    |  run_id=X    |
+--------------+               +--------------+               +--------------+
```

The same `run_id` flows through all services, enabling:
- End-to-end cost attribution
- Cross-service trace correlation
- Distributed debugging

## Baggage Size Limits

W3C Baggage has practical size limits. The SDK uses lean mode by default to stay well under these limits:

| Mode | Typical Size | Recommendation |
|------|--------------|----------------|
| Lean | ~120 bytes | Use for most cases |
| Full | ~350 bytes | Use when you need all context downstream |

## Propagation and Auto-Instrumentation

The SDK works seamlessly with OTel auto-instrumentation:

```typescript
import { enable } from '@botanu/sdk';

enable({
  serviceName: 'my-service',
  autoInstrumentation: true,  // Enable auto-instrumentation
});
```

Auto-instrumented libraries will automatically propagate baggage:
- `http`, `undici` (HTTP clients)
- `express`, `fastify`, `koa` (Web frameworks)
- `amqplib`, `kafkajs` (Messaging)
- `grpc` (gRPC)

## Debugging Propagation

### Check Current Context

```typescript
import { getRunId, getBaggage } from '@botanu/sdk';

const runId = getRunId();
console.log(`Current run_id: ${runId}`);

const workflow = getBaggage('botanu.workflow');
console.log(`Current workflow: ${workflow}`);
```

### Verify Header Propagation

```typescript
// In your HTTP client
async function debugRequest() {
  const response = await fetch('https://httpbin.org/headers');
  const data = await response.json();
  console.log(data);
  // Check for 'baggage' header in response
}
```

## Common Issues

### Context Not Propagating

1. **Missing initialization**: Ensure `enable()` is called at startup
2. **Missing middleware**: Add `botanuExpressMiddleware` (or equivalent) to your web framework
3. **Async context loss**: Use `AsyncLocalStorage`-aware async patterns

### Duplicate run_ids

1. **Multiple wrappers**: Only use `botanuWorkflow` at the entry point
2. **Middleware + wrapper**: Choose one, not both

## See Also

- [Run Context](run-context.md) - Understanding the RunContext model
- [Architecture](architecture.md) - Overall SDK architecture
