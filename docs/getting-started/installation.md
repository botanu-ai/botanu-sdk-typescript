# Installation

## Requirements

- Node.js 18 or later
- OpenTelemetry Collector (recommended for production)

## Install

```bash
npm install @botanu/sdk @opentelemetry/api
```

One install gives you everything:

- **OTel SDK** + OTLP HTTP exporter
- **Auto-instrumentation** for 50+ libraries (HTTP, databases, messaging, GenAI, AWS, gRPC)

Instrumentation packages are lightweight shims that silently no-op when the target library is not installed. Zero bloat.

## Verify

```typescript
import { version } from '@botanu/sdk';
console.log(version);
```

## Package Managers

### npm / package.json

```json
{
  "dependencies": {
    "@botanu/sdk": "^0.1.0",
    "@opentelemetry/api": "^1.7.0"
  }
}
```

### yarn

```bash
yarn add @botanu/sdk @opentelemetry/api
```

### pnpm

```bash
pnpm add @botanu/sdk @opentelemetry/api
```

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "app.js"]
```

## Development

For running tests and linting:

```bash
npm install --save-dev @botanu/sdk
```

## Collector Setup

The SDK sends traces to an OpenTelemetry Collector via OTLP HTTP (port 4318). Configure the endpoint via environment variable:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Quick start with Docker:

```bash
docker run -p 4318:4318 otel/opentelemetry-collector:latest
```

See [Collector Configuration](../integration/collector.md) for production setup.

## Next Steps

- [Quickstart](quickstart.md) - Your first instrumented application
- [Configuration](configuration.md) - Environment variables and YAML config
