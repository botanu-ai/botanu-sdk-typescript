# Wrappers API Reference

## botanuWorkflow

The primary wrapper function for creating workflow runs with automatic context propagation.

```typescript
import { botanuWorkflow } from '@botanu/sdk';

botanuWorkflow<T>(
  options: {
    name: string;
    eventId: string | ((...args: any[]) => string);
    customerId: string | ((...args: any[]) => string);
    environment?: string;
    tenantId?: string;
    autoOutcomeOnSuccess?: boolean;
    spanKind?: SpanKind;
  },
  fn: () => Promise<T>
): Promise<T>
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | Required | Workflow name (low cardinality, e.g. `"Customer Support"`) |
| `eventId` | `string \| Function` | Required | Business transaction identifier (e.g. ticket ID). Can be a static string or a function. |
| `customerId` | `string \| Function` | Required | End-customer being served (e.g. org ID). Same static/function rules as `eventId`. |
| `environment` | `string` | From env | Deployment environment |
| `tenantId` | `string` | `undefined` | Tenant identifier for multi-tenant systems |
| `autoOutcomeOnSuccess` | `boolean` | `true` | Emit `"success"` outcome if no exception |
| `spanKind` | `SpanKind` | `SERVER` | OpenTelemetry span kind |

### Example

```typescript
import { botanuWorkflow } from '@botanu/sdk';

// Static values:
const result = await botanuWorkflow(
  { name: 'my-workflow', eventId: 'evt-001', customerId: 'cust-42' },
  async () => {
    const result = await doSomething();
    return result;
  }
);

// Dynamic values:
async function handleRequest(request: Request) {
  return botanuWorkflow(
    {
      name: 'my-workflow',
      eventId: request.eventId,
      customerId: request.customerId,
    },
    async () => {
      // ...
    }
  );
}
```

### Span Attributes

| Attribute | Description |
|-----------|-------------|
| `botanu.run_id` | Generated UUIDv7 |
| `botanu.workflow` | `name` parameter |
| `botanu.event_id` | Resolved `eventId` |
| `botanu.customer_id` | Resolved `customerId` |
| `botanu.environment` | Deployment environment |
| `botanu.tenant_id` | Tenant identifier (if provided) |

---

## runBotanu

Alias for `botanuWorkflow` for cases where the name reads better in context
(e.g., dynamic workflows, scripts, runtime-determined names).

```typescript
import { runBotanu } from '@botanu/sdk';

runBotanu<T>(
  options: {
    name: string;
    eventId: string;
    customerId: string;
    environment?: string;
    tenantId?: string;
    autoOutcomeOnSuccess?: boolean;
    spanKind?: SpanKind;
  },
  fn: () => Promise<T>
): Promise<T>
```

### Example

```typescript
import { runBotanu, emitOutcome } from '@botanu/sdk';

const result = await runBotanu(
  { name: 'my-workflow', eventId: 'evt-001', customerId: 'cust-42' },
  async () => {
    const result = await doSomething();
    emitOutcome('success');
    return result;
  }
);
```

The returned value is whatever `fn` returns. Parameters are identical to `botanuWorkflow`.

---

## Framework Middleware

### botanuExpressMiddleware

Express middleware that extracts or creates run context for incoming requests.

```typescript
import { botanuExpressMiddleware } from '@botanu/sdk';

botanuExpressMiddleware(options?: {
  workflow?: string;
  eventIdHeader?: string;
  customerIdHeader?: string;
}): express.RequestHandler
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `workflow` | `string` | `undefined` | Default workflow name for requests |
| `eventIdHeader` | `string` | `"x-botanu-event-id"` | Header to extract event ID from |
| `customerIdHeader` | `string` | `"x-botanu-customer-id"` | Header to extract customer ID from |

#### Example

```typescript
import express from 'express';
import { botanuExpressMiddleware } from '@botanu/sdk';

const app = express();
app.use(botanuExpressMiddleware({ workflow: 'api-handler' }));
```

### botanuFastifyPlugin

Fastify plugin for run context extraction.

```typescript
import { botanuFastifyPlugin } from '@botanu/sdk';

fastify.register(botanuFastifyPlugin, { workflow: 'api-handler' });
```

### botanuKoaMiddleware

Koa middleware for run context extraction.

```typescript
import { botanuKoaMiddleware } from '@botanu/sdk';

app.use(botanuKoaMiddleware({ workflow: 'api-handler' }));
```

---

## Retry Helpers

### botanuRetryOptions

Create retry options compatible with `p-retry` that track retry attempts.

```typescript
import { botanuRetryOptions } from '@botanu/sdk';

botanuRetryOptions(options: {
  retries: number;
  minTimeout?: number;
  maxTimeout?: number;
}): pRetry.Options
```

#### Example

```typescript
import pRetry from 'p-retry';
import { botanuRetryOptions } from '@botanu/sdk';

const result = await pRetry(
  async () => {
    return await doWork();
  },
  botanuRetryOptions({ retries: 3 })
);
```

### withRetryTracking

Wrapper that ensures proper retry scoping for the inner function.

```typescript
import { withRetryTracking } from '@botanu/sdk';

withRetryTracking<T>(fn: (attempt: number) => Promise<T>): (attempt: number) => Promise<T>
```

#### Example

```typescript
import { withRetryTracking } from '@botanu/sdk';

const tracked = withRetryTracking(async (attempt) => {
  console.log(`Attempt ${attempt}`);
  return await doWork();
});
```

## See Also

- [Quick Start](../getting-started/quickstart.md)
- [Run Context](../concepts/run-context.md)
