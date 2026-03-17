import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRetryAttempt,
  setRetryAttempt,
  resetRetryAttempt,
  botanuRetryOptions,
  botanuBefore,
  botanuAfterAll,
} from '../../src/integrations/retry.js';

describe('retry integration', () => {
  beforeEach(() => {
    resetRetryAttempt();
  });

  describe('getRetryAttempt / setRetryAttempt', () => {
    it('should default to 0', () => {
      expect(getRetryAttempt()).toBe(0);
    });

    it('should set and get attempt number', () => {
      setRetryAttempt(3);
      expect(getRetryAttempt()).toBe(3);
    });

    it('should reset to 0', () => {
      setRetryAttempt(5);
      resetRetryAttempt();
      expect(getRetryAttempt()).toBe(0);
    });
  });

  describe('botanuBefore', () => {
    it('should set attempt from attemptNumber', () => {
      botanuBefore({ attemptNumber: 2 });
      expect(getRetryAttempt()).toBe(2);
    });

    it('should set attempt from attempt', () => {
      botanuBefore({ attempt: 3 });
      expect(getRetryAttempt()).toBe(3);
    });

    it('should default to 1', () => {
      botanuBefore({});
      expect(getRetryAttempt()).toBe(1);
    });
  });

  describe('botanuAfterAll', () => {
    it('should reset attempt counter', () => {
      setRetryAttempt(5);
      botanuAfterAll();
      expect(getRetryAttempt()).toBe(0);
    });
  });

  describe('botanuRetryOptions', () => {
    it('should return options with onFailedAttempt', () => {
      const opts = botanuRetryOptions({ retries: 3 });

      expect(opts.retries).toBe(3);
      expect(typeof opts.onFailedAttempt).toBe('function');
    });

    it('should update attempt on failed attempt', () => {
      const opts = botanuRetryOptions();
      opts.onFailedAttempt({ attemptNumber: 1 });

      expect(getRetryAttempt()).toBe(2);
    });

    it('should pass through base options', () => {
      const opts = botanuRetryOptions({
        retries: 5,
        minTimeout: 1000,
        maxTimeout: 10000,
        factor: 2,
      });

      expect(opts.retries).toBe(5);
      expect(opts.minTimeout).toBe(1000);
      expect(opts.maxTimeout).toBe(10000);
      expect(opts.factor).toBe(2);
    });
  });
});
