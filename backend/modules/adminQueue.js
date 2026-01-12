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

module.exports = {
  endpointGetQueue,
};
