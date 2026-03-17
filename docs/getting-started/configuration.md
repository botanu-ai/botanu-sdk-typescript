# Configuration

Botanu SDK can be configured through code, environment variables, or YAML files.

## Configuration Precedence

1. **Code arguments** (explicit values passed to `BotanuConfig`)
2. **Environment variables** (`BOTANU_*`, `OTEL_*`)
3. **YAML config file** (`botanu.yaml` or specified path)
4. **Built-in defaults**

## Quick Configuration

### Code-Based

```typescript
import { enable } from '@botanu/sdk';

enable({
  serviceName: 'my-service',
  otlpEndpoint: 'http://collector:4318/v1/traces',
});
```

### Environment Variables

```bash
export OTEL_SERVICE_NAME=my-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
export BOTANU_ENVIRONMENT=production
```

### YAML File

```yaml
# botanu.yaml
service:
  name: my-service
  version: 1.0.0
  environment: production

otlp:
  endpoint: http://collector:4318/v1/traces

propagation:
  mode: lean
```

Load with:

```typescript
import { BotanuConfig } from '@botanu/sdk';

const config = BotanuConfig.fromYaml('botanu.yaml');
```

## Full Configuration Reference

### BotanuConfig Fields

```typescript
interface BotanuConfig {
  // Service identification
  serviceName?: string;           // OTEL_SERVICE_NAME
  serviceVersion?: string;        // OTEL_SERVICE_VERSION
  serviceNamespace?: string;      // OTEL_SERVICE_NAMESPACE
  deploymentEnvironment?: string; // OTEL_DEPLOYMENT_ENVIRONMENT

  // Resource detection
  autoDetectResources?: boolean;  // BOTANU_AUTO_DETECT_RESOURCES

  // OTLP exporter
  otlpEndpoint?: string;          // OTEL_EXPORTER_OTLP_ENDPOINT
  otlpHeaders?: Record<string, string>; // Custom headers for auth

  // Span export
  maxExportBatchSize?: number;    // default: 512
  maxQueueSize?: number;          // default: 65536
  scheduleDelayMillis?: number;   // default: 5000
  exportTimeoutMillis?: number;   // default: 30000

  // Propagation mode
  propagationMode?: string;       // BOTANU_PROPAGATION_MODE

  // Auto-instrumentation
  autoInstrumentPackages?: string[];
}
```

## Environment Variables

### OpenTelemetry Standard Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `unknown_service` |
| `OTEL_SERVICE_VERSION` | Service version | None |
| `OTEL_SERVICE_NAMESPACE` | Service namespace | None |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | Environment name | `production` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector base URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | OTLP traces endpoint (full URL) | None |

### Botanu-Specific Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOTANU_ENVIRONMENT` | Fallback for environment | `production` |
| `BOTANU_PROPAGATION_MODE` | `lean` or `full` | `lean` |
| `BOTANU_AUTO_DETECT_RESOURCES` | Auto-detect cloud resources | `true` |
| `BOTANU_CONFIG_FILE` | Path to YAML config | None |

## YAML Configuration

### Full Example

```yaml
# botanu.yaml - Full configuration example
service:
  name: ${OTEL_SERVICE_NAME:-my-service}
  version: ${APP_VERSION:-1.0.0}
  namespace: production
  environment: ${ENVIRONMENT:-production}

resource:
  auto_detect: true

otlp:
  endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4318}/v1/traces
  headers:
    Authorization: Bearer ${OTLP_AUTH_TOKEN}

export:
  batch_size: 512
  queue_size: 2048
  delay_ms: 5000

propagation:
  mode: lean

auto_instrument_packages:
  - http
  - undici
  - express
  - pg
  - openai
```

### Environment Variable Interpolation

The YAML loader supports two interpolation patterns:

```yaml
# Simple interpolation
endpoint: ${COLLECTOR_URL}

# With default value
endpoint: ${COLLECTOR_URL:-http://localhost:4318}
```

### Loading Configuration

```typescript
import { BotanuConfig } from '@botanu/sdk';

// Explicit path
const config = BotanuConfig.fromYaml('config/botanu.yaml');

// Auto-discover (searches botanu.yaml, config/botanu.yaml)
const config = BotanuConfig.fromFileOrEnv();

// Environment only
const config = new BotanuConfig();
```

## Propagation Modes

### Lean Mode (Default)

Propagates only essential fields to minimize header size:

- `botanu.run_id`
- `botanu.workflow`
- `botanu.event_id`
- `botanu.customer_id`

Best for high-traffic systems where header size matters.

### Full Mode

Propagates all context fields:

- `botanu.run_id`
- `botanu.workflow`
- `botanu.event_id`
- `botanu.customer_id`
- `botanu.environment`
- `botanu.tenant_id`
- `botanu.parent_run_id`

Enable with:

```bash
export BOTANU_PROPAGATION_MODE=full
```

## Auto-Instrumentation

### Default Packages

By default, Botanu enables instrumentation for:

```typescript
[
  // HTTP clients
  'http', 'undici',
  // Web frameworks
  'express', 'fastify', 'koa', 'hapi', 'nestjs',
  // Databases
  'pg', 'mongodb', 'redis', 'mysql', 'mysql2', 'ioredis',
  'knex', 'typeorm', 'sequelize', 'prisma',
  // Caching
  'memcached',
  // Messaging
  'amqplib', 'kafkajs', 'bullmq',
  // AWS
  'aws-sdk',
  // gRPC
  'grpc',
  // GenAI
  'openai', 'anthropic', 'vertexai', 'cohere', 'bedrock',
  'azure-openai', 'langchain',
  // Runtime
  'runtime-node', 'dns', 'net', 'fs',
]
```

### Customizing Packages

Override the default list via `BotanuConfig`:

```typescript
import { enable, BotanuConfig } from '@botanu/sdk';

const config = new BotanuConfig({
  autoInstrumentPackages: ['http', 'express', 'openai'],
});
enable({ config });
```

### Disabling Auto-Instrumentation

```typescript
enable({ autoInstrumentation: false });
```

## Exporting Configuration

```typescript
const config = new BotanuConfig({
  serviceName: 'my-service',
  deploymentEnvironment: 'production',
});

// Export as object
console.log(config.toDict());
```

## See Also

- [Architecture](../concepts/architecture.md) - SDK design principles
- [Collector Configuration](../integration/collector.md) - Collector setup
- [Existing OTel Setup](../integration/existing-otel.md) - Integration with existing OTel
