import * as fs from 'node:fs';
import type { StackFrame } from '@sentry/types';
import { parseStackFrames } from '@sentry/utils';

import {
  _contextLinesIntegration,
  resetFileContentCache,
} from '../../src/integrations/contextlines';
import { defaultStackParser } from '../../src/sdk/api';
import { getError } from '../helpers/error';

describe('ContextLines', () => {
  let contextLines: ReturnType<typeof _contextLinesIntegration>;

  async function addContext(frames: StackFrame[]): Promise<void> {
    await contextLines.processEvent({ exception: { values: [{ stacktrace: { frames } }] } });
  }

  beforeEach(() => {
    contextLines = _contextLinesIntegration();
    resetFileContentCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lru file cache', () => {
    test('parseStack with same file', async () => {
      expect.assertions(1);

      const frames = parseStackFrames(defaultStackParser, new Error('test'));
      const readStreamSpy = jest.spyOn(fs, 'createReadStream');

      await addContext(frames);

      const numCalls = readStreamSpy.mock.calls.length;
      await addContext(frames);

      // Calls to `readFile` shouldn't increase if there isn't a new error to
      // parse whose stacktrace contains a file we haven't yet seen
      expect(readStreamSpy).toHaveBeenCalledTimes(numCalls * 2);
    });

    test('parseStack with ESM module names', async () => {
      expect.assertions(1);

      const readStreamSpy = jest.spyOn(fs, 'createReadStream');
      const framesWithFilePath: StackFrame[] = [
        {
          colno: 1,
          filename: 'file:///var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
      ];

      await addContext(framesWithFilePath);
      expect(readStreamSpy).toHaveBeenCalledTimes(1);
    });

    test('parseStack with adding different file', async () => {
      expect.assertions(1);
      const frames = parseStackFrames(defaultStackParser, new Error('test'));
      const readStreamSpy = jest.spyOn(fs, 'createReadStream');

      await addContext(frames);

      const numCalls = readStreamSpy.mock.calls.length;
      const parsedFrames = parseStackFrames(defaultStackParser, getError());
      await addContext(parsedFrames);

      const newErrorCalls = readStreamSpy.mock.calls.length;
      expect(newErrorCalls).toBeGreaterThan(numCalls);
    });

    test('parseStack with overlapping errors', async () => {
      function inner() {
        return new Error('inner');
      }
      function outer() {
        return inner();
      }

      const overlappingContextWithFirstError = parseStackFrames(defaultStackParser, outer());

      await addContext(overlappingContextWithFirstError);

      const innerFrame = overlappingContextWithFirstError[overlappingContextWithFirstError.length - 1];
      const outerFrame = overlappingContextWithFirstError[overlappingContextWithFirstError.length - 2];

      expect(innerFrame.context_line).toBe("        return new Error('inner');");
      expect(innerFrame.pre_context).toHaveLength(7)
      expect(innerFrame.post_context).toHaveLength(7)

      expect(outerFrame.context_line).toBe('        return inner();');
      expect(outerFrame.pre_context).toHaveLength(7)
      expect(outerFrame.post_context).toHaveLength(7)
    });

    test('parseStack with error on first line errors', async () => {
      const overlappingContextWithFirstError = parseStackFrames(defaultStackParser, getError());

      await addContext(overlappingContextWithFirstError);

      const errorFrame = overlappingContextWithFirstError[overlappingContextWithFirstError.length - 1];
      console.log(errorFrame)

      expect(errorFrame.context_line).toBe("  return new Error('mock error');");
      expect(errorFrame.pre_context).toHaveLength(7)
      expect(errorFrame.post_context).toHaveLength(7)
    });

    test('parseStack with duplicate files', async () => {
      expect.assertions(1);
      const readStreamSpy = jest.spyOn(fs, 'createReadStream');
      const framesWithDuplicateFiles: StackFrame[] = [
        {
          colno: 1,
          filename: '/var/task/index.js',
          lineno: 1,
          function: 'fxn1',
        },
        {
          colno: 2,
          filename: '/var/task/index.js',
          lineno: 2,
          function: 'fxn2',
        },
        {
          colno: 3,
          filename: '/var/task/index.js',
          lineno: 3,
          function: 'fxn3',
        },
      ];

      await addContext(framesWithDuplicateFiles);
      expect(readStreamSpy).toHaveBeenCalledTimes(1);
    });

    test('stack errors without lineno', async () => {
      expect.assertions(1);
      const readStreamSpy = jest.spyOn(fs, 'createReadStream');
      const framesWithDuplicateFiles: StackFrame[] = [
        {
          colno: 1,
          filename: '/var/task/index.js',
          lineno: undefined,
          function: 'fxn1',
        },
      ];

      await addContext(framesWithDuplicateFiles);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });

    test('parseStack with no context', async () => {
      expect.assertions(1);
      contextLines = _contextLinesIntegration({ frameContextLines: 0 });
      const readStreamSpy = jest.spyOn(fs, 'createReadStream');

      const frames = parseStackFrames(defaultStackParser, new Error('test'));

      await addContext(frames);
      expect(readStreamSpy).not.toHaveBeenCalled();
    });
  });
});
