import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event as SentryEvent, EventEnvelope, SpanEnvelope } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest.beforeEach(async ({ browserName, page }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.setViewportSize({ width: 800, height: 1200 });
});

function waitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function triggerAndWaitForLayoutShift(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('trigger-cls'));
    return new Promise(resolve => {
      window.addEventListener('cls-done', () => resolve());
    });
  });
}

function hidePage(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

sentryTest('captures a "GOOD" CLS vital with its source as a standalone span', async ({ getLocalTestPath, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(`${url}#0.05`);

  await waitForLayoutShift(page);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    segment_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.03);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.07);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      // no transaction, because span source is URL
    },
  });
});

sentryTest('captures a "MEH" CLS vital with its source as a standalone span', async ({ getLocalTestPath, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(`${url}#0.21`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    segment_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.18);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.23);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      // no transaction, because span source is URL
    },
  });
});

sentryTest('captures a "POOR" CLS vital with its source as a standalone span.', async ({ getLocalTestPath, page }) => {
  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(`${url}#0.35`);

  await waitForLayoutShift(page);

  // Page hide to trigger CLS emission
  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];

  const spanEnvelopeHeaders = spanEnvelope[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];

  expect(spanEnvelopeItem).toEqual({
    data: {
      'sentry.exclusive_time': 0,
      'sentry.op': 'ui.webvital.cls',
      'sentry.origin': 'auto.http.browser.cls',
      transaction: expect.stringContaining('index.html'),
      'user_agent.original': expect.stringContaining('Chrome'),
    },
    description: expect.stringContaining('body > div#content > p'),
    exclusive_time: 0,
    measurements: {
      cls: {
        unit: '',
        value: expect.any(Number), // better check below,
      },
    },
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    segment_id: expect.stringMatching(/[a-f0-9]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: spanEnvelopeItem.start_timestamp,
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.33);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.38);

  expect(spanEnvelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: spanEnvelopeItem.trace_id,
      // no transaction, because span source is URL
    },
  });
});

sentryTest(
  'captures CLS increases after the pageload span ended, when page is hidden',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

    expect(eventData.type).toBe('transaction');
    expect(eventData.contexts?.trace?.op).toBe('pageload');

    const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
      page,
      1,
      { envelopeType: 'span' },
      properFullEnvelopeRequestParser,
    );

    await triggerAndWaitForLayoutShift(page);

    await hidePage(page);

    const spanEnvelope = (await spanEnvelopePromise)[0];
    const spanEnvelopeItem = spanEnvelope[1][0][1];
    // Flakey value dependent on timings -> we check for a range
    expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.05);
    expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.15);
  },
);

sentryTest('sends CLS of the initial page when soft-navigating to a new page', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  // Flakey value dependent on timings -> we check for a range
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0.05);
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeLessThan(0.15);
});

sentryTest("doesn't send further CLS after the first navigation", async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await page.goto(`${url}#soft-navigation`);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0);

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});

sentryTest("doesn't send further CLS after the first page hide", async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<SentryEvent>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.contexts?.trace?.op).toBe('pageload');

  const spanEnvelopePromise = getMultipleSentryEnvelopeRequests<SpanEnvelope>(
    page,
    1,
    { envelopeType: 'span' },
    properFullEnvelopeRequestParser,
  );

  await triggerAndWaitForLayoutShift(page);

  await hidePage(page);

  const spanEnvelope = (await spanEnvelopePromise)[0];
  const spanEnvelopeItem = spanEnvelope[1][0][1];
  expect(spanEnvelopeItem.measurements?.cls?.value).toBeGreaterThan(0);

  getMultipleSentryEnvelopeRequests<SpanEnvelope>(page, 1, { envelopeType: 'span' }, () => {
    throw new Error('Unexpected span - This should not happen!');
  });

  const navigationTxnPromise = getMultipleSentryEnvelopeRequests<EventEnvelope>(
    page,
    1,
    { envelopeType: 'transaction' },
    properFullEnvelopeRequestParser,
  );

  // activate both CLS emission triggers:
  await page.goto(`${url}#soft-navigation-2`);
  await hidePage(page);

  // assumption: If we would send another CLS span on the 2nd navigation, it would be sent before the navigation
  // transaction ends. This isn't 100% safe to ensure we don't send something but otherwise we'd need to wait for
  // a timeout or something similar.
  await navigationTxnPromise;
});
