/**
 * The MCP Streamable HTTP transport runs on @hono/node-server, which arms a
 * `forceClose` timer that calls `socket.destroySoon()`. Fastify's `inject`
 * (light-my-request) hands the transport a mock socket that does not implement
 * that method, so the timer throws an uncaught `TypeError` — sometimes after
 * the test that triggered it has already passed, which makes vitest exit
 * non-zero on an otherwise green run.
 *
 * Any test file that exercises `POST /mcp` should call this once at module
 * scope. It swallows only this specific error and forwards everything else to
 * the listeners that were already installed, so genuine uncaught exceptions
 * still fail the run.
 */
export const ignoreHonoSocketDestroySoonNoise = (): void => {
  const originalListeners = process.listeners("uncaughtException");
  process.removeAllListeners("uncaughtException");
  process.on("uncaughtException", (err) => {
    if (err instanceof TypeError && err.message.includes("socket.destroySoon is not a function")) {
      return;
    }
    originalListeners.forEach((fn) => fn(err));
  });
};
