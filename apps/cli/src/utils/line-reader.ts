import * as readline from "readline";

// Queue-backed line reader that works for both TTY and piped (non-TTY) stdin.
// Node's built-in `rl.question` drops queued lines after the first call in
// non-TTY mode, which makes piping inputs into a wizard hang silently. We
// drive the line stream ourselves to make CLI flows scriptable.

type LineWaiter = {
  resolve: (line: string) => void;
  reject: (err: Error) => void;
};

type LineQueue = {
  pending: string[];
  waiters: LineWaiter[];
  closed: boolean;
};

const queues = new WeakMap<readline.Interface, LineQueue>();

const ensureQueue = (rl: readline.Interface): LineQueue => {
  const existing = queues.get(rl);
  if (existing) return existing;
  const q: LineQueue = { pending: [], waiters: [], closed: false };
  rl.on("line", (line: string) => {
    const next = q.waiters.shift();
    if (next) {
      next.resolve(line);
    } else {
      q.pending.push(line);
    }
  });
  rl.on("close", () => {
    q.closed = true;
    while (q.waiters.length > 0) {
      const w = q.waiters.shift()!;
      w.reject(new Error("unexpected end of input"));
    }
  });
  queues.set(rl, q);
  return q;
};

export const createReadline = (): readline.Interface =>
  readline.createInterface({ input: process.stdin, output: process.stdout });

export const ask = (rl: readline.Interface, prompt: string): Promise<string> => {
  const q = ensureQueue(rl);
  if (prompt) process.stdout.write(prompt);
  return new Promise<string>((resolve, reject) => {
    const buffered = q.pending.shift();
    if (buffered !== undefined) {
      resolve(buffered);
      return;
    }
    if (q.closed) {
      reject(new Error("unexpected end of input"));
      return;
    }
    q.waiters.push({ resolve, reject });
  });
};
