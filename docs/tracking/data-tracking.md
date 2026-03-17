# Data Tracking

Track database, storage, and messaging operations for complete cost visibility.

## Overview

Data operations often contribute significantly to AI workflow costs. Botanu provides tracking for:

- **Databases** - SQL, NoSQL, data warehouses
- **Object Storage** - S3, GCS, Azure Blob
- **Messaging** - SQS, Kafka, Pub/Sub

## Database Tracking

### Basic Usage

```typescript
import { trackDbOperation } from '@botanu/sdk';

await trackDbOperation(
  { system: 'postgresql', operation: 'SELECT' },
  async (db) => {
    const result = await cursor.execute('SELECT * FROM users WHERE active = true');
    db.setResult({ rowsReturned: result.length });
  }
);
```

### DBTracker Methods

#### setResult()

Record query results:

```typescript
db.setResult({
  rowsReturned: 100,    // For SELECT queries
  rowsAffected: 5,      // For INSERT/UPDATE/DELETE
  bytesRead: 10240,     // Data read
  bytesWritten: 2048,   // Data written
});
```

#### setTable()

Record table information:

```typescript
db.setTable('users', 'public');
```

#### setQueryId()

For data warehouses with query IDs:

```typescript
db.setQueryId('01abc-def-...');
```

#### setBytesScanned()

For pay-per-query warehouses:

```typescript
db.setBytesScanned(1073741824); // 1 GB
```

#### setError()

Record errors (automatically called on exceptions):

```typescript
db.setError(error);
```

#### addMetadata()

Add custom attributes:

```typescript
db.addMetadata({
  queryType: 'aggregation',
  cacheHit: true,
});
```

### Database Operations

Use `DBOperation` constants:

```typescript
import { trackDbOperation, DBOperation } from '@botanu/sdk';

await trackDbOperation(
  { system: 'postgresql', operation: DBOperation.SELECT },
  async (db) => { /* ... */ }
);

await trackDbOperation(
  { system: 'postgresql', operation: DBOperation.INSERT },
  async (db) => { /* ... */ }
);
```

Available operations:

| Constant | Description |
|----------|-------------|
| `SELECT` | Read queries |
| `INSERT` | Insert data |
| `UPDATE` | Update data |
| `DELETE` | Delete data |
| `UPSERT` | Insert or update |
| `MERGE` | Merge operations |
| `CREATE` | Create tables/indexes |
| `DROP` | Drop objects |
| `ALTER` | Alter schema |
| `INDEX` | Index operations |
| `TRANSACTION` | Transaction control |
| `BATCH` | Batch operations |

### System Normalization

Database systems are automatically normalized:

| Input | Normalized |
|-------|------------|
| `postgresql`, `postgres`, `pg` | `postgresql` |
| `mysql` | `mysql` |
| `mongodb`, `mongo` | `mongodb` |
| `dynamodb` | `dynamodb` |
| `redis` | `redis` |
| `elasticsearch` | `elasticsearch` |
| `snowflake` | `snowflake` |
| `bigquery` | `bigquery` |
| `redshift` | `redshift` |

## Storage Tracking

### Basic Usage

```typescript
import { trackStorageOperation } from '@botanu/sdk';

await trackStorageOperation(
  { system: 's3', operation: 'PUT' },
  async (storage) => {
    await s3Client.putObject({ Bucket: 'my-bucket', Key: 'file.txt', Body: data });
    storage.setResult({ bytesWritten: data.length });
  }
);
```

### StorageTracker Methods

#### setResult()

Record operation results:

```typescript
storage.setResult({
  objectsCount: 10,      // Number of objects
  bytesRead: 1048576,    // Data downloaded
  bytesWritten: 2097152, // Data uploaded
});
```

#### setBucket()

Record bucket name:

```typescript
storage.setBucket('my-data-bucket');
```

#### setError()

Record errors:

```typescript
storage.setError(error);
```

#### addMetadata()

Add custom attributes:

```typescript
storage.addMetadata({
  storageClass: 'GLACIER',
  encryption: 'AES256',
});
```

### Storage Operations

| Constant | Description |
|----------|-------------|
| `GET` | Download object |
| `PUT` | Upload object |
| `DELETE` | Delete object |
| `LIST` | List objects |
| `HEAD` | Get metadata |
| `COPY` | Copy object |
| `MULTIPART_UPLOAD` | Multipart upload |

### System Normalization

| Input | Normalized |
|-------|------------|
| `s3`, `aws_s3` | `s3` |
| `gcs`, `google_cloud_storage` | `gcs` |
| `blob`, `azure_blob` | `azure_blob` |
| `minio` | `minio` |

## Messaging Tracking

### Basic Usage

```typescript
import { trackMessagingOperation } from '@botanu/sdk';

await trackMessagingOperation(
  { system: 'sqs', operation: 'publish', destination: 'my-queue' },
  async (msg) => {
    await sqsClient.sendMessage({ QueueUrl: queueUrl, MessageBody: message });
    msg.setResult({ messageCount: 1, bytesTransferred: message.length });
  }
);
```

### MessagingTracker Methods

#### setResult()

Record operation results:

```typescript
msg.setResult({
  messageCount: 10,
  bytesTransferred: 4096,
});
```

#### setError()

Record errors:

```typescript
msg.setError(error);
```

#### addMetadata()

Add custom attributes:

```typescript
msg.addMetadata({
  messageGroupId: 'group-1',
  deduplicationId: 'dedup-123',
});
```

### Messaging Operations

| Constant | Description |
|----------|-------------|
| `publish` | Send message |
| `consume` | Receive and process message |
| `receive` | Receive message |
| `send` | Send message (alias for publish) |
| `subscribe` | Subscribe to topic |

### System Normalization

| Input | Normalized |
|-------|------------|
| `sqs`, `aws_sqs` | `sqs` |
| `sns` | `sns` |
| `kinesis` | `kinesis` |
| `pubsub`, `google_pubsub` | `pubsub` |
| `kafka` | `kafka` |
| `rabbitmq` | `rabbitmq` |
| `bullmq` | `bullmq` |

## Standalone Helpers

### setDataMetrics()

Set data metrics on the current span:

```typescript
import { setDataMetrics } from '@botanu/sdk';

setDataMetrics({
  rowsReturned: 100,
  rowsAffected: 5,
  bytesRead: 10240,
  bytesWritten: 2048,
  objectsCount: 10,
});
```

### setWarehouseMetrics()

For data warehouse queries:

```typescript
import { setWarehouseMetrics } from '@botanu/sdk';

setWarehouseMetrics({
  queryId: '01abc-def-...',
  bytesScanned: 1073741824,
  rowsReturned: 1000,
  partitionsScanned: 5,
});
```

## Example: Complete Data Pipeline

```typescript
import { botanuWorkflow, emitOutcome } from '@botanu/sdk';
import {
  trackDbOperation,
  trackStorageOperation,
  trackMessagingOperation,
  DBOperation,
} from '@botanu/sdk';
import { trackLlmCall } from '@botanu/sdk';

async function processBatch(batchId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'etl-pipeline', eventId: batchId, customerId },
    async () => {
      // 1. Read from data warehouse
      const rows = await trackDbOperation(
        { system: 'snowflake', operation: DBOperation.SELECT },
        async (db) => {
          db.setQueryId(batchId);
          const rows = await snowflakeClient.execute(
            'SELECT * FROM raw_data WHERE batch_id = ?',
            [batchId]
          );
          db.setResult({ rowsReturned: rows.length });
          db.setBytesScanned(rows.bytesScanned);
          return rows;
        }
      );

      // 2. Process with LLM
      const processed: any[] = [];
      for (const row of rows) {
        await trackLlmCall(
          { vendor: 'openai', model: 'gpt-4' },
          async (llm) => {
            const result = await analyzeRow(row);
            llm.setTokens({ inputTokens: result.inputTokens, outputTokens: result.outputTokens });
            processed.push(result);
          }
        );
      }

      // 3. Write to storage
      await trackStorageOperation(
        { system: 's3', operation: 'PUT' },
        async (storage) => {
          storage.setBucket('processed-data');
          const body = JSON.stringify(processed);
          await s3Client.putObject({
            Bucket: 'processed-data',
            Key: `batch/${batchId}.json`,
            Body: body,
          });
          storage.setResult({ bytesWritten: body.length });
        }
      );

      // 4. Write to database
      await trackDbOperation(
        { system: 'postgresql', operation: DBOperation.INSERT },
        async (db) => {
          await pgClient.query(
            'INSERT INTO processed_data VALUES ($1, $2, $3)',
            processed.map((r) => [r.id, r.result, r.score])
          );
          db.setResult({ rowsAffected: processed.length });
        }
      );

      // 5. Publish completion event
      await trackMessagingOperation(
        { system: 'sqs', operation: 'publish', destination: 'batch-complete' },
        async (msg) => {
          await sqsClient.sendMessage({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({ batchId, count: processed.length }),
          });
          msg.setResult({ messageCount: 1 });
        }
      );

      emitOutcome('success', { valueType: 'batches_processed', valueAmount: 1 });
      return processed;
    }
  );
}
```

## Span Attributes

### Database Spans

| Attribute | Description |
|-----------|-------------|
| `db.system` | Database system (normalized) |
| `db.operation` | Operation type |
| `db.name` | Database name |
| `db.collection.name` | Table/collection name |
| `botanu.vendor` | Vendor for cost attribution |
| `botanu.data.rows_returned` | Rows returned |
| `botanu.data.rows_affected` | Rows modified |
| `botanu.data.bytes_read` | Bytes read |
| `botanu.data.bytes_written` | Bytes written |
| `botanu.warehouse.query_id` | Warehouse query ID |
| `botanu.warehouse.bytes_scanned` | Bytes scanned |

### Storage Spans

| Attribute | Description |
|-----------|-------------|
| `botanu.storage.system` | Storage system |
| `botanu.storage.operation` | Operation type |
| `botanu.storage.bucket` | Bucket name |
| `botanu.vendor` | Vendor for cost attribution |
| `botanu.data.objects_count` | Objects processed |
| `botanu.data.bytes_read` | Bytes downloaded |
| `botanu.data.bytes_written` | Bytes uploaded |

### Messaging Spans

| Attribute | Description |
|-----------|-------------|
| `messaging.system` | Messaging system |
| `messaging.operation` | Operation type |
| `messaging.destination.name` | Queue/topic name |
| `botanu.vendor` | Vendor for cost attribution |
| `botanu.messaging.message_count` | Messages processed |
| `botanu.messaging.bytes_transferred` | Bytes transferred |

## See Also

- [LLM Tracking](llm-tracking.md) - AI model tracking
- [Outcomes](outcomes.md) - Recording business outcomes
- [Best Practices](../patterns/best-practices.md) - Tracking best practices
