import { readFile } from 'node:fs/promises';
import { graphql } from '../src/apis/warcraftlogs/index.js';

interface Args {
  query?: string;
  file?: string;
  variables?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') {
      const next = argv[++i];
      if (!next) {
        console.error('--file requires a path');
        process.exit(1);
      }
      args.file = next;
    } else if (arg === '--variables') {
      const next = argv[++i];
      if (!next) {
        console.error('--variables requires a JSON string');
        process.exit(1);
      }
      args.variables = next;
    } else if (arg && !arg.startsWith('--') && !args.query) {
      args.query = arg;
    } else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  let query: string;
  if (args.file) {
    query = await readFile(args.file, 'utf-8');
  } else if (args.query) {
    query = args.query;
  } else {
    console.error(
      'Usage:\n' +
        '  npm run debug:wcl -- "<inline GraphQL query>"\n' +
        '  npm run debug:wcl -- --file path/to/query.graphql\n' +
        '  npm run debug:wcl -- --file q.graphql --variables \'{"zoneId":1234}\'',
    );
    process.exit(1);
  }

  let variables: Record<string, unknown> = {};
  if (args.variables) {
    try {
      variables = JSON.parse(args.variables) as Record<string, unknown>;
    } catch (err) {
      console.error(
        `--variables must be valid JSON: ${(err as Error).message}`,
      );
      process.exit(1);
    }
  }

  const data = await graphql<unknown>(query, variables);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('debug-wcl-fetch failed:', err);
  process.exit(1);
});
