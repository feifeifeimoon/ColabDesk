import type { CreateSessionOptions } from "./api";

/**
 * The argv `colab new` runs with — in one place because two sides need it.
 *
 * The main process runs it, and the setup surface prints it above the log:
 * "here is the command" has to be the command. `--gpu` and `--tpu` are
 * mutually exclusive and a GPU wins, which is what the picker defaults to.
 */
export function createSessionArgs(options: CreateSessionOptions): string[] {
  const args = ["new"];
  const name = options.name?.trim();
  if (name) args.push("-s", name);
  if (options.gpu) args.push("--gpu", options.gpu);
  else if (options.tpu) args.push("--tpu", options.tpu);
  if (options.highMem) args.push("--high-mem");
  return args;
}
