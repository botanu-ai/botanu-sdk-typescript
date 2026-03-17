# Botanu SDK for TypeScript

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)


Event-level cost attribution for AI workflows, built on [OpenTelemetry](https://opentelemetry.io/).



An **event** is one business transaction — resolving a support ticket, processing
an order, generating a report. Each event may involve multiple **runs** (LLM calls,
retries, sub-workflows) across multiple services. By correlating every run to a
stable `event_id`, Botanu gives you per-event cost attribution and outcome
tracking without sampling artifacts.

## Getting Started

```bash
npm install @botanu/sdk @opentelemetry/api
```

One install. Includes OTel SDK, OTLP exporter, and auto-instrumentation for
30+ libraries.

### Option 1: Zero-code (recommended for intermediate services)

No code changes. Add a CLI flag and set env vars:

```bash
BOTANU_API_KEY=btnu_live_... \
BOTANU_SERVICE_NAME=my-service \
node --require @botanu/sdk/register dist/server.js
```

Or in your Dockerfile:

```dockerfile
ENV BOTANU_API_KEY=btnu_live_...
ENV BOTANU_SERVICE_NAME=my-service
CMD ["node", "--require", "@botanu/sdk/register", "dist/server.js"]
```

Or in `package.json`:

```json
{
  "scripts": {
    "start": "node --require @botanu/sdk/register dist/server.js"
  }
}
```

### Option 2: YAML config

Create a `botanu.yaml` in your project root:

```yaml
service:
  name: my-service
  environment: production

otlp:
  endpoint: https://ingest.botanu.ai
  headers:
    Authorization: "Bearer ${BOTANU_API_KEY}"
```

Then use the zero-code register or call `enable()` in your code — config is
loaded automatically.

### Option 3: Code (for workflow entry points)

```typescript
import { enable, botanuWorkflow, emitOutcome } from '@botanu/sdk';

enable(); // reads config from env vars or botanu.yaml

const doWork = botanuWorkflow(
  { name: 'my-workflow', eventId: 'evt-001', customerId: 'cust-42' },
  async () => {
    const result = await doSomething();
    emitOutcome('success');
    return result;
  },
);
```

### When to use what

- **Workflow entry point** (the service that starts the workflow): Use Option 3
  with `botanuWorkflow()` decorator
- **Intermediate/downstream services** (just passing context through): Use
  Option 1 or 2 — zero code, context propagates automatically via W3C Baggage

See the [Quick Start](./docs/getting-started/quickstart.md) guide for a full walkthrough.

## Documentation

| Topic | Description |
|-------|-------------|
| [Installation](./docs/getting-started/installation.md) | Install and configure the SDK |
| [Quick Start](./docs/getting-started/quickstart.md) | Get up and running in 5 minutes |
| [Configuration](./docs/getting-started/configuration.md) | Environment variables and options |
| [Core Concepts](./docs/concepts/) | Events, runs, context propagation, architecture |
| [LLM Tracking](./docs/tracking/llm-tracking.md) | Track model calls and token usage |
| [Data Tracking](./docs/tracking/data-tracking.md) | Database, storage, and messaging |
| [Outcomes](./docs/tracking/outcomes.md) | Record business outcomes for ROI |
| [Auto-Instrumentation](./docs/integration/auto-instrumentation.md) | Supported libraries and frameworks |
| [Kubernetes](./docs/integration/kubernetes.md) | Zero-code instrumentation at scale |
| [API Reference](./docs/api/) | Decorators, tracking API, configuration |
| [Best Practices](./docs/patterns/best-practices.md) | Recommended patterns |

## Requirements

- Node.js 18+
- OpenTelemetry Collector (recommended for production)

## Contributing

We welcome contributions from the community. Please read our
[Contributing Guide](./CONTRIBUTING.md) before submitting a pull request.

This project requires [DCO sign-off](https://developercertificate.org/) on all
commits:

```bash
git commit -s -m "Your commit message"
```

Looking for a place to start? Check the
[good first issues](https://github.com/botanu-ai/botanu-sdk-typescript/labels/good%20first%20issue).

## Community

- [GitHub Discussions](https://github.com/botanu-ai/botanu-sdk-typescript/discussions) — questions, ideas, show & tell
- [GitHub Issues](https://github.com/botanu-ai/botanu-sdk-typescript/issues) — bug reports and feature requests

## Governance

See [GOVERNANCE.md](./GOVERNANCE.md) for details on roles, decision-making,
and the contributor ladder.

Current maintainers are listed in [MAINTAINERS.md](./MAINTAINERS.md).

## Security

To report a security vulnerability, please use
[GitHub Security Advisories](https://github.com/botanu-ai/botanu-sdk-typescript/security/advisories/new)
or see [SECURITY.md](./SECURITY.md) for full details. **Do not file a public issue.**

## Code of Conduct

This project follows the
[LF Projects Code of Conduct](https://lfprojects.org/policies/code-of-conduct/).
See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](./LICENSE)
