type LogSink = Pick<Console, 'log' | 'warn' | 'error'>;

let sink: LogSink = console;

export function setLogSink(c: LogSink): void {
  sink = c;
}

export function resetLogSink(): void {
  sink = console;
}

export class Logger {
  constructor(private readonly tag: string) {}

  info(msg: string): void {
    sink.log(`[${this.tag}] ${msg}`);
  }

  warn(msg: string): void {
    sink.warn(`[${this.tag}] ${msg}`);
  }

  error(msg: string, err?: unknown): void {
    if (err === undefined) sink.error(`[${this.tag}] ${msg}`);
    else sink.error(`[${this.tag}] ${msg}`, err);
  }
}
