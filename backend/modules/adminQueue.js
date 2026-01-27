// admin Queue module.
'use strict';

const apiQueue = require('./apiQueue');

// endpointGetQueue returns the current API queue status.
async function endpointGetQueue(request, response, next) {
  try {
    const status = await apiQueue.getStatus();
    return response.status(200).send(status);
  } catch (error) {
    next(error);
  }
}

// endpointDeleteQueueJob removes a queued job by id.
async function endpointDeleteQueueJob(request, response, next) {
  try {
    const { id } = request.params;
    const result = await apiQueue.removeJob(id);
    if (!result?.deletedCount) {
      return response.status(404).send({ error: 'Queue job not found' });
    }
    return response.status(200).send({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  endpointGetQueue,
  endpointDeleteQueueJob,
};
