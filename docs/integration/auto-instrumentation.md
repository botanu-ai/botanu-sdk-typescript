# Auto-Instrumentation

Botanu automatically instruments 50+ libraries with zero code changes.

## How It Works

When you call `enable()`, the SDK detects which libraries are installed in your environment and instruments them automatically. Libraries that aren't installed are silently skipped.

```typescript
import { enable } from '@botanu/sdk';

enable(); // auto-instruments everything that's installed
```

No configuration needed. No import order requirements. Just call `enable()` at startup.

### Zero-Code Mode

For applications where you cannot modify source code, use the `--require` flag:

```bash
node --require @botanu/sdk/register app.js
```

This registers all instrumentation before your application code loads.

## Supported Libraries

### LLM Providers

| Provider | Instrumentation Package |
|----------|------------------------|
| OpenAI | `@opentelemetry/instrumentation-openai` (official OTel) |
| Anthropic | `@traceloop/instrumentation-anthropic` |
| Vertex AI | `@traceloop/instrumentation-vertexai` |
| Cohere | `@traceloop/instrumentation-cohere` |
| Bedrock | `@traceloop/instrumentation-bedrock` |
| Azure OpenAI | `@traceloop/instrumentation-azure-openai` |
| LangChain | `@traceloop/instrumentation-langchain` |

### Web Frameworks

| Framework | Instrumentation Package |
|-----------|------------------------|
| Express | `@opentelemetry/instrumentation-express` |
| Fastify | `@opentelemetry/instrumentation-fastify` |
| Koa | `@opentelemetry/instrumentation-koa` |
| Hapi | `@opentelemetry/instrumentation-hapi` |
| NestJS | `@opentelemetry/instrumentation-nestjs-core` |

### HTTP Clients

| Library | Instrumentation Package |
|---------|------------------------|
| http/https | `@opentelemetry/instrumentation-http` |
| undici (fetch) | `@opentelemetry/instrumentation-undici` |

### Databases

| Database | Instrumentation Package |
|----------|------------------------|
| pg (PostgreSQL) | `@opentelemetry/instrumentation-pg` |
| mongodb | `@opentelemetry/instrumentation-mongodb` |
| redis | `@opentelemetry/instrumentation-redis-4` |
| ioredis | `@opentelemetry/instrumentation-ioredis` |
| mysql | `@opentelemetry/instrumentation-mysql` |
| mysql2 | `@opentelemetry/instrumentation-mysql2` |
| knex | `@opentelemetry/instrumentation-knex` |
| typeorm | `@opentelemetry/instrumentation-typeorm` |
| sequelize | `@opentelemetry/instrumentation-sequelize` |
| prisma | `@prisma/instrumentation` |
| memcached | `@opentelemetry/instrumentation-memcached` |

### Messaging & Task Queues

| System | Instrumentation Package |
|--------|------------------------|
| amqplib (RabbitMQ) | `@opentelemetry/instrumentation-amqplib` |
| kafkajs | `@opentelemetry/instrumentation-kafkajs` |
| bullmq | `@opentelemetry/instrumentation-bullmq` |

### AWS

| Service | Instrumentation Package |
|---------|------------------------|
| aws-sdk (v2 + v3) | `@opentelemetry/instrumentation-aws-sdk` |

### gRPC

| Component | Instrumentation Package |
|-----------|------------------------|
| @grpc/grpc-js | `@opentelemetry/instrumentation-grpc` |

### Runtime

| Library | Instrumentation Package |
|---------|------------------------|
| runtime-node | `@opentelemetry/instrumentation-runtime-node` |
| dns | `@opentelemetry/instrumentation-dns` |
| net | `@opentelemetry/instrumentation-net` |
| fs | `@opentelemetry/instrumentation-fs` |

## Context Propagation

HTTP clients automatically propagate `run_id` via W3C Baggage headers:

```
traceparent: 00-{trace_id}-{span_id}-01
baggage: botanu.run_id=019abc12...
```

## Span Attributes

OpenAI calls produce:

```
gen_ai.operation.name: chat
gen_ai.provider.name: openai
gen_ai.request.model: gpt-4
gen_ai.usage.input_tokens: 10
gen_ai.usage.output_tokens: 25
```

Database calls produce:

```
db.system: postgresql
db.operation: SELECT
db.statement: SELECT * FROM orders WHERE id = $1
```

## See Also

- [Kubernetes Deployment](kubernetes.md) - Zero-code instrumentation at scale
- [Collector Configuration](collector.md) - Collector setup
