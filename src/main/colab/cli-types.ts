/** Shape of a CLI invocation result (kept dependency-free for tests). */

export interface CliOutput {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function outputOk(output: CliOutput): boolean {
  return !output.timedOut && output.code === 0;
}
