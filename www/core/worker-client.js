export function shouldHandleWorkerMessage(data, latestRequest) {
  return data.type === "status" || data.requestId >= latestRequest;
}

export function createWorkerClient({
  worker,
  state,
  setBusy,
  handleMessage,
  handleError,
}) {
  function send(type, payload = {}) {
    const requestId = ++state.requestId;
    state.latestRequest = requestId;
    worker.postMessage({ requestId, type, ...payload });
    setBusy(true);
    return requestId;
  }

  worker.onmessage = ({ data }) => {
    if (!shouldHandleWorkerMessage(data, state.latestRequest)) {
      state.nonPersistingRequestIds?.delete(data.requestId);
      return undefined;
    }
    return handleMessage(data);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    handleError(event.message, "worker_error");
  };
  worker.onmessageerror = () => {
    handleError("", "worker_error");
  };

  return { send };
}
