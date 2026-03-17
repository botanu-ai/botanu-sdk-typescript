import { describe, it, expect } from 'vitest';
import {
  DBTracker,
  StorageTracker,
  MessagingTracker,
  DB_SYSTEMS,
  STORAGE_SYSTEMS,
  MESSAGING_SYSTEMS,
  DBOperation,
  StorageOperation,
  MessagingOperation,
} from '../../src/tracking/data.js';

describe('DB_SYSTEMS', () => {
  it('should normalize database system names', () => {
    expect(DB_SYSTEMS['postgresql']).toBe('postgresql');
    expect(DB_SYSTEMS['postgres']).toBe('postgresql');
    expect(DB_SYSTEMS['pg']).toBe('postgresql');
    expect(DB_SYSTEMS['mysql']).toBe('mysql');
    expect(DB_SYSTEMS['mongodb']).toBe('mongodb');
    expect(DB_SYSTEMS['mongo']).toBe('mongodb');
    expect(DB_SYSTEMS['redis']).toBe('redis');
    expect(DB_SYSTEMS['sqlite']).toBe('sqlite');
    expect(DB_SYSTEMS['dynamodb']).toBe('dynamodb');
    expect(DB_SYSTEMS['elasticsearch']).toBe('elasticsearch');
    expect(DB_SYSTEMS['snowflake']).toBe('snowflake');
    expect(DB_SYSTEMS['bigquery']).toBe('bigquery');
    expect(DB_SYSTEMS['neo4j']).toBe('neo4j');
    expect(DB_SYSTEMS['mssql']).toBe('mssql');
    expect(DB_SYSTEMS['sqlserver']).toBe('mssql');
  });
});

describe('STORAGE_SYSTEMS', () => {
  it('should normalize storage system names', () => {
    expect(STORAGE_SYSTEMS['s3']).toBe('s3');
    expect(STORAGE_SYSTEMS['aws_s3']).toBe('s3');
    expect(STORAGE_SYSTEMS['gcs']).toBe('gcs');
    expect(STORAGE_SYSTEMS['google_cloud_storage']).toBe('gcs');
    expect(STORAGE_SYSTEMS['blob']).toBe('azure_blob');
    expect(STORAGE_SYSTEMS['azure_blob']).toBe('azure_blob');
    expect(STORAGE_SYSTEMS['minio']).toBe('minio');
  });
});

describe('MESSAGING_SYSTEMS', () => {
  it('should normalize messaging system names', () => {
    expect(MESSAGING_SYSTEMS['sqs']).toBe('sqs');
    expect(MESSAGING_SYSTEMS['aws_sqs']).toBe('sqs');
    expect(MESSAGING_SYSTEMS['kafka']).toBe('kafka');
    expect(MESSAGING_SYSTEMS['rabbitmq']).toBe('rabbitmq');
    expect(MESSAGING_SYSTEMS['pubsub']).toBe('pubsub');
    expect(MESSAGING_SYSTEMS['google_pubsub']).toBe('pubsub');
    expect(MESSAGING_SYSTEMS['sns']).toBe('sns');
    expect(MESSAGING_SYSTEMS['kinesis']).toBe('kinesis');
    expect(MESSAGING_SYSTEMS['nats']).toBe('nats');
    expect(MESSAGING_SYSTEMS['celery']).toBe('celery');
  });
});

describe('Operation Constants', () => {
  it('should have all DB operations', () => {
    expect(DBOperation.SELECT).toBe('SELECT');
    expect(DBOperation.INSERT).toBe('INSERT');
    expect(DBOperation.UPDATE).toBe('UPDATE');
    expect(DBOperation.DELETE).toBe('DELETE');
    expect(DBOperation.UPSERT).toBe('UPSERT');
    expect(DBOperation.BATCH).toBe('BATCH');
  });

  it('should have all storage operations', () => {
    expect(StorageOperation.GET).toBe('GET');
    expect(StorageOperation.PUT).toBe('PUT');
    expect(StorageOperation.DELETE).toBe('DELETE');
    expect(StorageOperation.LIST).toBe('LIST');
    expect(StorageOperation.HEAD).toBe('HEAD');
    expect(StorageOperation.COPY).toBe('COPY');
  });

  it('should have all messaging operations', () => {
    expect(MessagingOperation.PUBLISH).toBe('publish');
    expect(MessagingOperation.CONSUME).toBe('consume');
    expect(MessagingOperation.RECEIVE).toBe('receive');
    expect(MessagingOperation.SEND).toBe('send');
    expect(MessagingOperation.SUBSCRIBE).toBe('subscribe');
  });
});

describe('DBTracker', () => {
  it('should create with system and operation', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');

    expect(tracker.system).toBe('postgresql');
    expect(tracker.operation).toBe('SELECT');
    expect(tracker.rowsReturned).toBe(0);
    expect(tracker.rowsAffected).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    tracker.setResult({ rowsReturned: 42, bytesRead: 1024 });

    expect(tracker.rowsReturned).toBe(42);
    expect(tracker.bytesRead).toBe(1024);
  });

  it('should set error', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    // Without span, should not throw
    tracker.setError(new Error('Connection refused'));
  });

  it('should chain methods fluently', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    const result = tracker
      .setResult({ rowsReturned: 10 })
      .setTable('users', 'public');

    expect(result).toBe(tracker);
    expect(tracker.rowsReturned).toBe(10);
  });
});

describe('StorageTracker', () => {
  it('should create with system and operation', () => {
    const tracker = new StorageTracker('s3', 'GET');

    expect(tracker.system).toBe('s3');
    expect(tracker.operation).toBe('GET');
    expect(tracker.objectsCount).toBe(0);
    expect(tracker.bytesRead).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new StorageTracker('s3', 'PUT');
    tracker.setResult({ objectsCount: 1, bytesWritten: 2048 });

    expect(tracker.objectsCount).toBe(1);
    expect(tracker.bytesWritten).toBe(2048);
  });

  it('should chain methods', () => {
    const tracker = new StorageTracker('s3', 'GET');
    const result = tracker
      .setResult({ bytesRead: 512 })
      .setBucket('my-bucket');

    expect(result).toBe(tracker);
  });
});

describe('MessagingTracker', () => {
  it('should create with system, operation, and destination', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'events-topic');

    expect(tracker.system).toBe('kafka');
    expect(tracker.operation).toBe('publish');
    expect(tracker.destination).toBe('events-topic');
    expect(tracker.messageCount).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new MessagingTracker('sqs', 'send', 'my-queue');
    tracker.setResult({ messageCount: 5, bytesTransferred: 4096 });

    expect(tracker.messageCount).toBe(5);
    expect(tracker.bytesTransferred).toBe(4096);
  });

  it('should set error', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'topic');
    tracker.setError(new Error('Broker unavailable'));
  });

  it('should chain methods', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'topic');
    const result = tracker.setResult({ messageCount: 3 });
    expect(result).toBe(tracker);
  });
});
