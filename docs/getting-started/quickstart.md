# Quickstart

Get event-level cost attribution working in 5 minutes.

## Prerequisites

- Node.js 18+
- OpenTelemetry Collector running (see [Collector Configuration](../integration/collector.md))

## Step 1: Install

```bash
npm install @botanu/sdk @opentelemetry/api
```

## Step 2: Set Environment Variables

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-service
```

Or in Docker / Kubernetes:

```yaml
environment:
  - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
  - OTEL_SERVICE_NAME=my-service
```

## Step 3: Enable SDK

```typescript
import { enable } from '@botanu/sdk';

enable();
```

Call `enable()` once at application startup. It reads configuration from environment variables -- no hardcoded values needed.

## Step 4: Define Entry Point

```typescript
import { botanuWorkflow } from '@botanu/sdk';

const result = await botanuWorkflow(
  { name: 'my-workflow', eventId: 'evt-001', customerId: 'cust-42' },
  async () => {
    const data = await db.query(/* ... */);
    const result = await llm.complete(data);
    return result;
  }
);
```

All LLM calls, database queries, and HTTP requests inside the function are automatically tracked with the same `run_id` tied to the `event_id`.

## Complete Example

**Entry service** (`entry/app.ts`):

```typescript
import { enable, botanuWorkflow, emitOutcome } from '@botanu/sdk';

enable();

async function handleRequest(req: Request) {
  return botanuWorkflow(
    {
      name: 'my-workflow',
      eventId: req.eventId,
      customerId: req.customerId,
    },
    async () => {
      const data = await fetchData(req);
      const result = await process(data);
      emitOutcome('success');
      return result;
    }
  );
}
```

**Downstream service** (`intermediate/app.ts`):

```typescript
import { enable } from '@botanu/sdk';

enable(); // propagates run_id from incoming request -- no wrapper needed
```

## What Gets Tracked

| Attribute | Example | Description |
|-----------|---------|-------------|
| `botanu.run_id` | `019abc12-...` | Unique run identifier (UUIDv7) |
| `botanu.workflow` | `my-workflow` | Workflow name |
| `botanu.event_id` | `evt-001` | Business event identifier |
| `botanu.customer_id` | `cust-42` | Customer identifier |
| `gen_ai.usage.input_tokens` | `150` | LLM input tokens |
| `gen_ai.usage.output_tokens` | `200` | LLM output tokens |
| `db.system` | `postgresql` | Database system |

All spans across all services share the same `run_id`, enabling cost-per-event analytics.

## Next Steps

- [Configuration](configuration.md) - Environment variables and YAML config
- [Kubernetes Deployment](../integration/kubernetes.md) - Zero-code instrumentation at scale
- [Context Propagation](../concepts/context-propagation.md) - How run_id flows across services
