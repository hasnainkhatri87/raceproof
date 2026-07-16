import { runCli } from './cli';

export { CLI_EXIT, CLI_HELP, parseCliArguments, runCli } from './cli';

void runCli().then((exitCode) => {
  process.exitCode = exitCode;
});
