// Test suite for the Emitter class
import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../src/core/events.js';

describe('Emitter class', () => {
  let emitter;

  beforeEach(() => {
    emitter = new Emitter();
  });

  describe('constructor', () => {
    it('should initialize with empty handlers map', () => {
      expect(emitter._h).toBeInstanceOf(Map);
      expect(emitter._h.size).toBe(0);
    });
  });

  describe('on method', () => {
    it('should register a handler for an event type', () => {
      const handler = vi.fn();
      const off = emitter.on('test-event', handler);

      expect(emitter._h.has('test-event')).toBe(true);
      expect(emitter._h.get('test-event').has(handler)).toBe(true);

      // off should be a function
      expect(typeof off).toBe('function');
    });

    it('should create new set for event type if none exists', () => {
      const handler = vi.fn();
      emitter.on('new-event', handler);

      expect(emitter._h.get('new-event')).toBeInstanceOf(Set);
      expect(emitter._h.get('new-event').has(handler)).toBe(true);
    });

    it('should allow multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('multi-event', handler1);
      emitter.on('multi-event', handler2);

      const handlers = emitter._h.get('multi-event');
      expect(handlers.size).toBe(2);
      expect(handlers.has(handler1)).toBe(true);
      expect(handlers.has(handler2)).toBe(true);
    });
  });

  describe('once method', () => {
    it('should register a handler that automatically removes itself after first call', () => {
      const handler = vi.fn();
      const off = emitter.once('once-event', handler);

      // Handler should be registered
      expect(emitter._h.has('once-event')).toBe(true);

      // Emit event - handler should be called
      emitter.emit('once-event', { data: 'test' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'test' });

      // Handler should be removed after first call
      emitter.emit('once-event', { data: 'test 2' });
      expect(handler).toHaveBeenCalledTimes(1); // Still only called once

      // off should be a function
      expect(typeof off).toBe('function');
    });

    it('should work with multiple once handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.once('multi-once', handler1);
      emitter.once('multi-once', handler2);

      emitter.emit('multi-once', { test: true });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Second emission should not call either handler
      emitter.emit('multi-once', { test: true });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('off method', () => {
    it('should remove a specific handler from an event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('remove-event', handler1);
      emitter.on('remove-event', handler2);

      emitter.off('remove-event', handler1);

      const handlers = emitter._h.get('remove-event');
      expect(handlers.size).toBe(1);
      expect(handlers.has(handler1)).toBe(false);
      expect(handlers.has(handler2)).toBe(true);
    });

    it('should do nothing if event type has no handlers', () => {
      const handler = vi.fn();

      // This should not throw
      emitter.off('nonexistent-event', handler);

      expect(emitter._h.size).toBe(0);
    });

    it('should do nothing if handler is not registered for event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test-event', handler1);

      // Try to remove handler2 which was never registered
      emitter.off('test-event', handler2);

      const handlers = emitter._h.get('test-event');
      expect(handlers.size).toBe(1);
      expect(handlers.has(handler1)).toBe(true);
    });

    it('should leave event type in map when last handler is removed', () => {
      const handler = vi.fn();

      emitter.on('test-event', handler);
      emitter.off('test-event', handler);

      // Event type should still exist in map but with empty set
      expect(emitter._h.has('test-event')).toBe(true);
      expect(emitter._h.get('test-event').size).toBe(0);
    });
  });

  describe('emit method', () => {
    it('should call all handlers for an event type with payload', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const payload = { action: 'test', value: 42 };

      emitter.on('emit-test', handler1);
      emitter.on('emit-test', handler2);

      emitter.emit('emit-test', payload);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it('should not call handlers for event types with no listeners', () => {
      const handler = vi.fn();

      emitter.emit('no-listeners', { test: true });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle wildcard (*) listeners', () => {
      const wildcardHandler = vi.fn();
      const specificHandler = vi.fn();

      emitter.on('*', wildcardHandler);
      emitter.on('specific-event', specificHandler);

      // Emit specific event
      emitter.emit('specific-event', { data: 'payload' });

      // Both handlers should be called
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledWith('specific-event', { data: 'payload' });

      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(specificHandler).toHaveBeenCalledWith({ data: 'payload' });
    });

    it('should call wildcard handlers for all event types', () => {
      const wildcardHandler = vi.fn();

      emitter.on('*', wildcardHandler);

      emitter.emit('event1', { val: 1 });
      emitter.emit('event2', { val: 2 });
      emitter.emit('event3', { val: 3 });

      expect(wildcardHandler).toHaveBeenCalledTimes(3);
      expect(wildcardHandler).toHaveBeenNthCalledWith(1, 'event1', { val: 1 });
      expect(wildcardHandler).toHaveBeenNthCalledWith(2, 'event2', { val: 2 });
      expect(wildcardHandler).toHaveBeenNthCalledWith(3, 'event3', { val: 3 });
    });

    it('should call handlers in the order they were registered', () => {
      const callOrder = [];

      const handler1 = () => callOrder.push(1);
      const handler2 = () => callOrder.push(2);
      const handler3 = () => callOrder.push(3);

      emitter.on('order-test', handler1);
      emitter.on('order-test', handler2);
      emitter.on('order-test', handler3);

      emitter.emit('order-test', null);

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should not be affected by handlers removing themselves during emission', () => {
      const handler1 = vi.fn(() => {
        emitter.off('self-remove', handler2); // Remove handler2 during execution
      });
      const handler2 = vi.fn();

      emitter.on('self-remove', handler1);
      emitter.on('self-remove', handler2);

      emitter.emit('self-remove', { test: true });

      // handler1 should be called
      expect(handler1).toHaveBeenCalledTimes(1);
      // handler2 should still be called even though handler1 tried to remove it
      // (because we iterate over a copy of the set)
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should work with once handlers during emission', () => {
      const onceHandler = vi.fn();
      const regularHandler = vi.fn();

      emitter.once('mixed-event', onceHandler);
      emitter.on('mixed-event', regularHandler);

      emitter.emit('mixed-event', { mixed: true });

      expect(onceHandler).toHaveBeenCalledTimes(1);
      expect(regularHandler).toHaveBeenCalledTimes(1);

      // Second emission - once handler should not be called
      emitter.emit('mixed-event', { mixed: true });

      expect(onceHandler).toHaveBeenCalledTimes(1); // Still only 1
      expect(regularHandler).toHaveBeenCalledTimes(2); // Now 2
    });
  });

  describe('clear method', () => {
    it('should remove all event handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      emitter.on('event1', handler1);
      emitter.on('event2', handler2);
      emitter.on('*', handler3);

      expect(emitter._h.size).toBe(3);

      emitter.clear();

      expect(emitter._h.size).toBe(0);
    });

    it('should prevent any further emissions from triggering handlers', () => {
      const handler = vi.fn();

      emitter.on('clear-test', handler);
      emitter.clear();
      emitter.emit('clear-test', { after: 'clear' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should simulate typical event emitter usage pattern', () => {
      const actions = [];

      const actionHandler = (payload) => actions.push(`action: ${payload.type}`);
      const logHandler = (eventType, payload) => actions.push(`log: ${eventType} - ${payload.value}`);

      // Register handlers
      emitter.on('user-action', actionHandler);
      emitter.on('*', logHandler);

      // Emit events
      emitter.emit('user-action', { type: 'click', value: 10 });
      emitter.emit('system-update', { type: 'update', value: 20 });

      expect(actions).toContain('action: click');
      expect(actions).toContain('log: user-action - 10');
      expect(actions).toContain('log: system-update - 20');
      expect(actions.length).toBe(3);
    });

    it('should handle rapid fire events correctly', () => {
      const handler = vi.fn();
      const eventCount = 100;

      emitter.on('rapid-fire', handler);

      for (let i = 0; i < eventCount; i++) {
        emitter.emit('rapid-fire', { index: i });
      }

      expect(handler).toHaveBeenCalledTimes(eventCount);

      // Verify last call had correct payload
      expect(handler).toHaveBeenLastCalledWith({ index: eventCount - 1 });
    });

    it('should work with complex payload objects', () => {
      const handler = vi.fn();
      const complexPayload = {
        nested: {
          deep: {
            value: 42
          }
        },
        array: [1, 2, 3, { nested: true }],
        fn: () => 'test',
        undefinedProp: undefined,
        nullProp: null
      };

      emitter.on('complex-payload', handler);
      emitter.emit('complex-payload', complexPayload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(complexPayload);
    });
  });
});