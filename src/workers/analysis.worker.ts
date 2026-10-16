import { createTaskRuntime } from "./runtime";

const run = createTaskRuntime();
// Deliberately no DOM, shell, storage, or network access in this worker.
self.onmessage = (event: MessageEvent<unknown>) => self.postMessage(run(event.data));
