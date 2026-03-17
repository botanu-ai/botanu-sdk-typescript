# Botanu SDK Documentation

Botanu SDK provides OpenTelemetry-native event-level cost attribution for AI
workflows.

## Overview

Traditional observability tools trace individual requests. But AI workflows are
different -- a single business event (resolving a support ticket, processing an
order) might involve multiple runs spanning LLM calls, retries, tool executions,
and data operations across different services and vendors.

Botanu introduces **event-level attribution**: a stable `event_id` that follows
your entire business transaction, enabling you to answer "How much did this
event cost?" and "What was the outcome?"

## Documentation

### Getting Started

- [Installation](getting-started/installation.md) -- Install and configure the SDK
- [Quick Start](getting-started/quickstart.md) -- Get up and running in 5 minutes
- [Configuration](getting-started/configuration.md) -- Environment variables and options

### Core Concepts

- [Run Context](concepts/run-context.md) -- Events, runs, and context propagation
- [Context Propagation](concepts/context-propagation.md) -- How context flows across services
- [Architecture](concepts/architecture.md) -- SDK design and component overview

### Tracking

- [LLM Tracking](tracking/llm-tracking.md) -- Track AI model calls and token usage
- [Data Tracking](tracking/data-tracking.md) -- Track database, storage, and messaging operations
- [Outcomes](tracking/outcomes.md) -- Record business outcomes for ROI calculation

### Integration

- [Auto-Instrumentation](integration/auto-instrumentation.md) -- Supported libraries and frameworks
- [Kubernetes Deployment](integration/kubernetes.md) -- Zero-code instrumentation at scale
- [Existing OTel Setup](integration/existing-otel.md) -- Integrate with existing OpenTelemetry deployments
- [Collector Configuration](integration/collector.md) -- Configure the OpenTelemetry Collector

### Patterns

- [Best Practices](patterns/best-practices.md) -- Recommended patterns for production use
- [Anti-Patterns](patterns/anti-patterns.md) -- Common mistakes to avoid

### API Reference

- [Wrappers](api/decorators.md) -- `botanuWorkflow` and related wrapper functions
- [Tracking API](api/tracking.md) -- Manual tracking helpers
- [Configuration API](api/configuration.md) -- `BotanuConfig` and initialization

## Quick Example

```typescript
import { enable, botanuWorkflow, emitOutcome } from '@botanu/sdk';

enable();

const result = await botanuWorkflow(
  { name: 'my-workflow', eventId: 'evt-001', customerId: 'cust-42' },
  async () => {
    const result = await doSomething();
    emitOutcome('success');
    return result;
  }
);
```

## License

[Apache License 2.0](https://github.com/botanu-ai/botanu-sdk-typescript/blob/main/LICENSE)
