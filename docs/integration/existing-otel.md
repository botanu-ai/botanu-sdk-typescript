# Existing OpenTelemetry Setup

Integrate Botanu with your existing OpenTelemetry configuration.

## Overview

If you already have OpenTelemetry configured (via Datadog, Splunk, New Relic, or custom setup), Botanu integrates seamlessly. You only need to add the `RunContextEnricher` span processor.

## Minimal Integration

Add just the span processor to your existing provider:

```typescript
import { trace } from '@opentelemetry/api';
import { RunContextEnricher } from '@botanu/sdk';

// Your existing TracerProvider
const provider = trace.getTracerProvider() as NodeTracerProvider;

// Add Botanu's enricher
provider.addSpanProcessor(new RunContextEnricher());
```

That's it. All spans will now receive `run_id` from baggage.

## With Existing Instrumentation

Botanu works alongside any existing instrumentation:

```typescript
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import { RunContextEnricher } from '@botanu/sdk';

// Your existing setup
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter()));
trace.setTracerProvider(provider);

// Your existing instrumentation
new HttpInstrumentation().enable();

// Add Botanu enricher (order doesn't matter)
provider.addSpanProcessor(new RunContextEnricher());
```

## With Datadog

```typescript
import { TracerProvider } from 'dd-trace';
import { trace } from '@opentelemetry/api';

import { RunContextEnricher } from '@botanu/sdk';

// Datadog's TracerProvider
const provider = new TracerProvider();
trace.setTracerProvider(provider);

// Add Botanu enricher
provider.addSpanProcessor(new RunContextEnricher());
```

## With Splunk

```typescript
import { start } from '@splunk/otel';
import { trace } from '@opentelemetry/api';

import { RunContextEnricher } from '@botanu/sdk';

// Start Splunk tracing
start();

// Add Botanu enricher
const provider = trace.getTracerProvider() as NodeTracerProvider;
provider.addSpanProcessor(new RunContextEnricher());
```

## With New Relic

```typescript
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

import { RunContextEnricher } from '@botanu/sdk';

// New Relic OTLP endpoint
const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: 'https://otlp.nr-data.net/v1/traces',
      headers: { 'api-key': 'YOUR_LICENSE_KEY' },
    })
  )
);
trace.setTracerProvider(provider);

// Add Botanu enricher
provider.addSpanProcessor(new RunContextEnricher());
```

## With Jaeger

```typescript
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

import { RunContextEnricher } from '@botanu/sdk';

// Jaeger setup (via OTLP)
const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces',
    })
  )
);
trace.setTracerProvider(provider);

// Add Botanu enricher
provider.addSpanProcessor(new RunContextEnricher());
```

## Multiple Exporters

Send to both your APM and a cost-attribution backend:

```typescript
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

import { RunContextEnricher } from '@botanu/sdk';

const provider = new NodeTracerProvider();

// Your APM (e.g., Datadog)
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({ url: 'https://your-apm.example.com/v1/traces' })
  )
);

// Botanu collector for cost attribution
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({ url: 'http://botanu-collector:4318/v1/traces' })
  )
);

// Botanu enricher (adds run_id to all spans)
provider.addSpanProcessor(new RunContextEnricher());

trace.setTracerProvider(provider);
```

## How RunContextEnricher Works

The enricher reads baggage and writes to span attributes:

```typescript
class RunContextEnricher implements SpanProcessor {
  onStart(span: Span, parentContext: Context): void {
    // Read run_id from baggage
    const baggage = propagation.getBaggage(parentContext);
    const runId = baggage?.getEntry('botanu.run_id')?.value;
    if (runId) {
      span.setAttribute('botanu.run_id', runId);
    }

    // Read workflow from baggage
    const workflow = baggage?.getEntry('botanu.workflow')?.value;
    if (workflow) {
      span.setAttribute('botanu.workflow', workflow);
    }
  }
}
```

This means:
- Every span gets `run_id` if it exists in baggage
- Auto-instrumented spans are enriched automatically
- No code changes needed in your existing instrumentation

## Using Botanu Wrappers

With the enricher in place, use Botanu wrappers:

```typescript
import { botanuWorkflow, emitOutcome } from '@botanu/sdk';

async function doWork(eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'do_work', eventId, customerId },
    async () => {
      // All spans created here (by any instrumentation) get run_id
      const data = await doSomething();
      const result = await process(data);

      emitOutcome('success');
      return result;
    }
  );
}
```

## Without Botanu Bootstrap

If you don't want to use `enable()`, manually set up propagation:

```typescript
import { propagation } from '@opentelemetry/api';
import { CompositePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { W3CBaggagePropagator } from '@opentelemetry/core';

// Ensure baggage propagation is enabled
propagation.setGlobalPropagator(
  new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  })
);
```

## Verifying Integration

Check that run_id appears on spans:

```typescript
import { trace, propagation, context, ROOT_CONTEXT } from '@opentelemetry/api';

// Set baggage (normally done by botanuWorkflow)
const baggage = propagation.createBaggage({
  'botanu.run_id': { value: 'test-123' },
});
const ctx = propagation.setBaggage(ROOT_CONTEXT, baggage);

context.with(ctx, () => {
  const tracer = trace.getTracer('test');
  const span = tracer.startSpan('test-span');
  // Check attribute was set
  console.log(span.attributes?.['botanu.run_id']); // Should print "test-123"
  span.end();
});
```

## Processor Order

Span processors are called in order. The enricher should be added after your span exporters:

```typescript
// 1. Exporters (send spans to backends)
provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter()));

// 2. Enrichers (modify spans before export)
provider.addSpanProcessor(new RunContextEnricher());
```

However, `RunContextEnricher` uses `onStart()`, so it runs before export regardless.

## Troubleshooting

### run_id Not Appearing

1. Check enricher is added:
   ```typescript
   const provider = trace.getTracerProvider();
   // Verify RunContextEnricher is in the processor list
   ```

2. Check baggage is set:
   ```typescript
   const baggage = propagation.getBaggage(context.active());
   console.log(baggage?.getEntry('botanu.run_id')?.value);
   ```

3. Ensure `botanuWorkflow` is used at entry points

### Baggage Not Propagating

Check propagators are configured:
```typescript
console.log(propagation.fields()); // Should include baggage fields
```

Should include `W3CBaggagePropagator`.

## See Also

- [Auto-Instrumentation](auto-instrumentation.md) - Library instrumentation
- [Collector Configuration](collector.md) - Collector setup
- [Architecture](../concepts/architecture.md) - SDK design
