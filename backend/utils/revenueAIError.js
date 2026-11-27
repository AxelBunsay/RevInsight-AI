const { randomUUID } = require('node:crypto');

const failureTypes = {
  AI_TIMEOUT: { statusCode: 504, message: 'AI service timed out. Please try again.' },
  AI_QUOTA_EXCEEDED: { statusCode: 503, message: 'AI service quota is currently unavailable. Please try again later.' },
  AI_PROVIDER_UNAVAILABLE: { statusCode: 503, message: 'AI service is currently unavailable. Please try again later.' },
  AI_INVALID_RESPONSE: { statusCode: 502, message: 'AI service returned an invalid response. Please try again.' }
};

function classifyRevenueAIError(error) {
  const providerStatus = Number.isInteger(error?.status) ? error.status : null;
  const timeout = error?.name === 'AbortError' || /request aborted|operation was aborted|timed out/i.test(error?.message || '');
  const code = timeout ? 'AI_TIMEOUT'
    : providerStatus === 429 ? 'AI_QUOTA_EXCEEDED'
      : (error?.code === 'AI_INVALID_RESPONSE' || error?.name === 'SyntaxError') ? 'AI_INVALID_RESPONSE' : 'AI_PROVIDER_UNAVAILABLE';
  return { code, providerStatus, ...failureTypes[code] };
}

function logRevenueAIFailure(error, { requestId, operation, model, startedAt }) {
  const failure = classifyRevenueAIError(error);
  // Only approved diagnostic fields: never log SDK URLs, keys, prompts or customer records.
  console.info('[revenueAI] ' + JSON.stringify({
    requestId, operation, model, elapsedMs: Date.now() - startedAt,
    code: failure.code, providerStatus: failure.providerStatus
  }));
  return failure;
}

function revenueAIError(failure, requestId) {
  return Object.assign(new Error(failure.message), failure, { revenueAI: true, requestId });
}

module.exports = { classifyRevenueAIError, logRevenueAIFailure, revenueAIError, newRevenueAIRequestId: randomUUID };
