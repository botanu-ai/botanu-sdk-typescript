# Architecture

Botanu SDK follows a "thin SDK, smart collector" architecture. The SDK does minimal work in your application's hot path, delegating heavy processing to the OpenTelemetry Collector.

## Design Principles

### 1. Minimal Hot-Path Overhead

The SDK only performs lightweight operations during request processing:
- Generate UUIDv7 `run_id`
- Read/write W3C Baggage
- Record token counts as span attributes

**Target overhead**: < 0.5ms per request

### 2. OTel-Native

Built on OpenTelemetry primitives, not alongside them:
- Uses standard `TracerProvider`
- Standard `SpanProcessor` for enrichment
- Standard OTLP export
- W3C Baggage for propagation

### 3. Collector-Side Processing

Heavy operations happen in the OTel Collector:
- PII redaction
- Cost calculation from token counts
- Vendor normalization
- Cardinality management
- Aggregation and sampling


## SDK Components

### BotanuConfig

Central configuration for the SDK:

```typescript
interface BotanuConfig {
  serviceName: string;
  deploymentEnvironment: string;
  otlpEndpoint: string;
  propagationMode: string;  // "lean" or "full"
  autoInstrumentPackages: string[];
}
```

### RunContext

Holds run metadata and provides serialization:

```typescript
interface RunContext {
  runId: string;
  rootRunId: string;
  workflow: string;
  eventId: string;
  customerId: string;
  attempt: number;
  // ...
}
```

### RunContextEnricher

The only span processor in the SDK. Reads baggage, writes to spans:

```typescript
class RunContextEnricher implements SpanProcessor {
  onStart(span: Span, parentContext: Context): void {
    for (const key of this.baggageKeys) {
      const value = propagation.getBaggage(parentContext)?.getEntry(key)?.value;
      if (value) {
        span.setAttribute(key, value);
      }
    }
  }
}
```

### Tracking Helpers

Wrapper functions for manual instrumentation:

- `trackLlmCall()` - LLM/model operations
- `trackDbOperation()` - Database operations
- `trackStorageOperation()` - Object storage operations
- `trackMessagingOperation()` - Message queue operations

## Data Flow

### 1. Run Initiation

```typescript
await botanuWorkflow(
  { name: 'process', eventId: 'evt-001', customerId: 'cust-42' },
  async () => { /* ... */ }
);
```

1. Generate UUIDv7 `run_id`
2. Create `RunContext`
3. Set baggage in current context
4. Start root span with run attributes

### 2. Context Propagation

```typescript
// Within the run
const response = await fetch('https://api.example.com');
```

1. HTTP instrumentation reads current context
2. Baggage is injected into request headers
3. Downstream service extracts baggage
4. Context continues propagating

### 3. Span Enrichment

Every span (including auto-instrumented):

1. `RunContextEnricher.onStart()` is called
2. Reads `botanu.run_id` from baggage
3. Writes to span attributes
4. Span is exported with run context

### 4. Export and Processing

1. `BatchSpanProcessor` batches spans
2. `OTLPSpanExporter` sends to collector
3. Collector processes (cost calc, PII redaction)
4. Spans written to backend

## Why This Architecture?

### SDK Stays Thin

| Operation | Location | Reason |
|-----------|----------|--------|
| run_id generation | SDK | Must be synchronous |
| Baggage propagation | SDK | Process-local |
| Token counting | SDK | Available at call site |
| Cost calculation | Collector | Pricing tables change |
| PII redaction | Collector | Consistent policy |
| Aggregation | Collector | Reduces data volume |

### No Vendor Lock-in

- Standard OTel export format
- Any OTel-compatible backend works
- Collector processors are configurable

### Minimal Dependencies

Core SDK only requires `@opentelemetry/api`:

```json
{
  "peerDependencies": {
    "@opentelemetry/api": ">= 1.7.0"
  }
}
```

Full SDK adds export capabilities:

```json
{
  "dependencies": {
    "@opentelemetry/sdk-trace-node": ">= 1.20.0",
    "@opentelemetry/exporter-trace-otlp-http": ">= 0.48.0"
  }
}
```

## Integration Points

### Existing TracerProvider

If you already have OTel configured:

```typescript
import { trace } from '@opentelemetry/api';
import { RunContextEnricher } from '@botanu/sdk';

// Add our processor to your existing provider
const provider = trace.getTracerProvider() as NodeTracerProvider;
provider.addSpanProcessor(new RunContextEnricher());
```

### Existing Instrumentation

Botanu works alongside existing instrumentation:

```typescript
// Your existing setup
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
new HttpInstrumentation().enable();

// Add Botanu
import { enable } from '@botanu/sdk';
enable({ serviceName: 'my-service' });

// Both work together - HTTP calls are instrumented AND get run_id
```

## Performance Characteristics

| Operation | Typical Latency |
|-----------|-----------------|
| `generateRunId()` | < 0.01ms |
| `RunContextEnricher.onStart()` | < 0.05ms |
| `trackLlmCall()` overhead | < 0.1ms |
| Baggage injection | < 0.01ms |

Total SDK overhead per request: **< 0.5ms**

## See Also

- [Run Context](run-context.md) - RunContext model details
- [Context Propagation](context-propagation.md) - How context flows
- [Collector Configuration](../integration/collector.md) - Collector setup
