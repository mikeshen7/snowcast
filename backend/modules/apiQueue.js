// api Queue module.
'use strict';

const axios = require('axios');
const apiQueueDb = require('../models/apiQueueDb');
const appConfig = require('./appConfig');
const { logAdminEvent } = require('./adminLogs');

let isProcessing = false;
let nextAllowedAt = 0;
let pollTimer = null;
let cleanupTimer = null;
const waiters = new Map();
const CLEANUP_MAX_AGE_DAYS = 7;

// get Interval Ms helper.
function getIntervalMs() {
  const callsPerMinute = Number(appConfig.values().WEATHER_API_CALLS_PER_MINUTE);
  if (!Number.isFinite(callsPerMinute) || callsPerMinute <= 0) {
    return 0;
  }
  return Math.ceil(60000 / callsPerMinute);
}

// schedule Process helper.
function scheduleProcess(delayMs = 0) {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollTimer = setTimeout(() => {
    pollTimer = null;
    processNext();
  }, delayMs);
}

// resolve Waiter helper.
function resolveWaiter(jobId, value, error) {
  const waiter = waiters.get(String(jobId));
  if (!waiter) return;
  waiters.delete(String(jobId));
  if (error) {
    waiter.reject(error);
  } else {
    waiter.resolve(value);
  }
}

// process Next runs one queued job.
async function processNext() {
  if (isProcessing) return;
  const now = Date.now();
  if (nextAllowedAt && now < nextAllowedAt) {
    scheduleProcess(nextAllowedAt - now);
    return;
  }
  isProcessing = true;
  let job = null;
  try {
    job = await apiQueueDb.findOneAndUpdate(
      {
        status: 'pending',
        nextRunAt: { $lte: new Date() },
      },
      {
        $set: { status: 'active', startedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!job) {
      isProcessing = false;
      return;
    }
    const intervalMs = getIntervalMs();
    nextAllowedAt = intervalMs > 0 ? Date.now() + intervalMs : 0;
    const response = await axios.get(job.url, { timeout: job.timeoutMs || 10000 });
    await apiQueueDb.updateOne(
      { _id: job._id },
      { $set: { status: 'done', finishedAt: new Date(), lastError: null } }
    );
    resolveWaiter(job._id, response, null);
  } catch (error) {
    if (!job) {
      isProcessing = false;
      scheduleProcess(1000);
      return;
    }
    const retryDelayMs = Math.max(getIntervalMs(), 1000);
    const shouldRetry = job.attempts < 2;
    if (shouldRetry) {
      await apiQueueDb.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            nextRunAt: new Date(Date.now() + retryDelayMs),
            lastError: error.message || 'Queue job failed',
          },
        }
      );
    } else {
      await apiQueueDb.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'error',
            finishedAt: new Date(),
            lastError: error.message || 'Queue job failed',
          },
        }
      );
      logAdminEvent({
        type: 'queue_error',
        message: error.message || 'Queue job failed',
        meta: {
          attempts: job.attempts,
          jobId: String(job._id),
          ...(job.meta || {}),
        },
      });
    }
    resolveWaiter(job._id, null, error);
  } finally {
    isProcessing = false;
    scheduleProcess(0);
  }
}

// enqueue Http adds a job and returns a promise for completion.
async function enqueueHttp({ url, timeoutMs = 10000, meta = {} }) {
  const job = await apiQueueDb.create({
    status: 'pending',
    kind: 'http',
    url,
    timeoutMs,
    meta,
    nextRunAt: new Date(),
  });
  const promise = new Promise((resolve, reject) => {
    waiters.set(String(job._id), { resolve, reject });
  });
  scheduleProcess(0);
  return promise;
}

// get Status returns queue diagnostics for the admin UI.
async function getStatus() {
  const callsPerMinute = Number(appConfig.values().WEATHER_API_CALLS_PER_MINUTE);
  const activeJob = await apiQueueDb.findOne({ status: 'active' }).sort({ startedAt: 1 }).lean();
  const queue = await apiQueueDb
    .find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(1000)
    .lean();
  const pendingCount = await apiQueueDb.countDocuments({ status: 'pending' });
  const activeCount = await apiQueueDb.countDocuments({ status: 'active' });
  return {
    callsPerMinute,
    intervalMs: getIntervalMs(),
    pendingCount,
    activeCount,
    activeJob: activeJob
      ? {
        id: activeJob._id,
        createdAt: activeJob.createdAt,
        startedAt: activeJob.startedAt,
        attempts: activeJob.attempts,
        meta: activeJob.meta,
      }
      : null,
    queue: queue.map((job) => ({
      id: job._id,
      createdAt: job.createdAt,
      attempts: job.attempts,
      meta: job.meta,
    })),
    nextAllowedAt: nextAllowedAt || null,
  };
}

// cleanup Old Jobs removes completed/error jobs past retention.
async function cleanupOldJobs() {
  const cutoff = new Date(Date.now() - CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const result = await apiQueueDb.deleteMany({
    status: { $in: ['done', 'error'] },
    finishedAt: { $lt: cutoff },
  });
  if (result?.deletedCount) {
    logAdminEvent({
      type: 'queue_cleanup',
      message: 'Queue cleanup removed old jobs',
      meta: {
        deleted: result.deletedCount,
        cutoff: cutoff.toISOString(),
      },
    });
  }
}

// remove Job deletes a queued job by id.
async function removeJob(id) {
  if (!id) return { deletedCount: 0 };
  return apiQueueDb.deleteOne({ _id: id });
}

// start begins background queue processing.
function start() {
  scheduleProcess(0);
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  cleanupOldJobs().catch(() => {});
  cleanupTimer = setInterval(() => {
    cleanupOldJobs().catch(() => {});
  }, 24 * 60 * 60 * 1000);
}

module.exports = {
  enqueueHttp,
  getStatus,
  removeJob,
  start,
};
