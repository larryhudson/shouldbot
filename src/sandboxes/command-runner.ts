import { spawn } from 'node:child_process';

export interface CommandRequest {
  command: string;
  args: string[];
  input?: Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CommandResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitCode: number;
}

export interface CommandRunner {
  run(request: CommandRequest): Promise<CommandResult>;
}

export const processCommandRunner: CommandRunner = {
  run(request) {
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: request.signal,
        timeout: request.timeoutMs,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.once('error', reject);
      child.once('close', (code, signal) => {
        resolve({
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          exitCode: code ?? (signal ? 128 : 1),
        });
      });

      if (request.input) child.stdin.end(request.input);
      else child.stdin.end();
    });
  },
};
