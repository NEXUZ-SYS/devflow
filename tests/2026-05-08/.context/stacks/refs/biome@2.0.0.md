<<<DEVFLOW_STACK_REF_START_6e878c28594516da>>>
TITLE: Getting Started
DESCRIPTION: yarn
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1npm i -D -E @biomejs/biome
```

----------------------------------------

TITLE: Getting Started
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1pnpm add -D -E @biomejs/biome
```

----------------------------------------

TITLE: Getting Started
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1bun add -D -E @biomejs/biome
```

----------------------------------------

TITLE: Getting Started
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1deno add -D npm:@biomejs/biome
```

----------------------------------------

TITLE: Getting Started
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1yarn add -D -E @biomejs/biome
```

----------------------------------------

TITLE: Configuration
DESCRIPTION: yarn
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1npx @biomejs/biome init
```

----------------------------------------

TITLE: Configuration
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1pnpx @biomejs/biome init
```

----------------------------------------

TITLE: Configuration
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1bunx --bun @biomejs/biome init
```

----------------------------------------

TITLE: Configuration
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1deno run -A npm:@biomejs/biome init
```

----------------------------------------

TITLE: Configuration
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1yarn exec biome -- init
```

----------------------------------------

TITLE: Command-line interface
DESCRIPTION: yarn
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1# Format all files2npx @biomejs/biome format --write3
4# Format specific files5npx @biomejs/biome format --write <files>6
7# Lint files and apply safe fixes to all files8npx @biomejs/biome lint --write9
10# Lint files and apply safe fixes to specific files11npx @biomejs/biome lint --write <files>12
13# Format, lint, and organize imports of all files14npx @biomejs/biome check --write15
16# Format, lint, and organize imports of specific files17npx @biomejs/biome check --write <files>
```

----------------------------------------

TITLE: Command-line interface
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1# Format all files2pnpx @biomejs/biome format --write3
4# Format specific files5pnpx @biomejs/biome format --write <files>6
7# Lint and apply safe fixes to all files8pnpx @biomejs/biome lint --write9
10# Lint files and apply safe fixes to specific files11pnpx @biomejs/biome lint --write <files>12
13# Format, lint, and organize imports of all files14pnpx @biomejs/biome check --write15
16# Format, lint, and organize imports of specific files17pnpx @biomejs/biome check --write <files>
```

----------------------------------------

TITLE: Command-line interface
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1# Format all files2bunx --bun @biomejs/biome format --write3
4# Format specific files5bunx --bun @biomejs/biome format --write <files>6
7# Lint and apply safe fixes to all files8bunx --bun @biomejs/biome lint --write9
10# Lint files and apply safe fixes to specific files11bunx --bun @biomejs/biome lint --write <files>12
13# Format, lint, and organize imports of all files14bunx --bun @biomejs/biome check --write15
16# Format, lint, and organize imports of specific files17bunx --bun @biomejs/biome check --write <files>
```

----------------------------------------

TITLE: Command-line interface
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1# Format specific files2deno run -A npm:@biomejs/biome format --write <files>3
4# Format all files5deno run -A npm:@biomejs/biome format --write6
7# Lint files and apply safe fixes to all files8deno run -A npm:@biomejs/biome lint --write9
10# Lint files and apply safe fixes to specific files11deno run -A npm:@biomejs/biome lint --write <files>12
13# Format, lint, and organize imports of all files14deno run -A npm:@biomejs/biome check --write15
16# Format, lint, and organize imports of specific files17deno run -A npm:@biomejs/biome check --write <files>
```

----------------------------------------

TITLE: Command-line interface
DESCRIPTION: 
SOURCE: https://biomejs.dev/guides/getting-started/
LANGUAGE: bash
CODE:
```bash
1# Format all files2yarn exec biome format --write3
4# Format specific files5yarn exec biome format --write <files>6
7# Lint files and apply safe fixes to all files8yarn exec biome lint --write9
10# Lint files and apply safe fixes to specific files11yarn exec biome lint --write <files>12
13# Format, lint, and organize imports of all files14yarn exec biome check --write15
16# Format, lint, and organize imports of specific files17yarn exec biome check --write <files>
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
