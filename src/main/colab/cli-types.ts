/** Shape of a CLI invocation result (kept dependency-free for tests). */

export interface CliOutput {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
