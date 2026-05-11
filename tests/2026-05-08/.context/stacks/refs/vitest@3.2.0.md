<<<DEVFLOW_STACK_REF_START_330df00c3c556856>>>
TITLE: Adding Vitest to Your Project ​
DESCRIPTION: bash
SOURCE: https://vitest.dev/guide/
LANGUAGE: bash
CODE:
```bash
npm install -D vitest
```

----------------------------------------

TITLE: Adding Vitest to Your Project ​
DESCRIPTION: bash
SOURCE: https://vitest.dev/guide/
LANGUAGE: bash
CODE:
```bash
yarn add -D vitest
```

----------------------------------------

TITLE: Adding Vitest to Your Project ​
DESCRIPTION: bash
SOURCE: https://vitest.dev/guide/
LANGUAGE: bash
CODE:
```bash
pnpm add -D vitest
```

----------------------------------------

TITLE: Adding Vitest to Your Project ​
DESCRIPTION: bash
SOURCE: https://vitest.dev/guide/
LANGUAGE: bash
CODE:
```bash
bun add -D vitest
```

----------------------------------------

TITLE: Writing Tests ​
DESCRIPTION: sum.js
SOURCE: https://vitest.dev/guide/
LANGUAGE: text
CODE:
```text
export function sum(a, b) {
  return a + b
}
```

----------------------------------------

TITLE: Writing Tests ​
DESCRIPTION: sum.test.js
SOURCE: https://vitest.dev/guide/
LANGUAGE: text
CODE:
```text
import { expect, test } from 'vitest'
import { sum } from './sum.js'

test('adds 1 + 2 to equal 3', () => {
  expect(sum(1, 2)).toBe(3)
})
```

----------------------------------------

TITLE: Writing Tests ​
DESCRIPTION: json
SOURCE: https://vitest.dev/guide/
LANGUAGE: json
CODE:
```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

----------------------------------------

TITLE: Writing Tests ​
DESCRIPTION: txt
SOURCE: https://vitest.dev/guide/
LANGUAGE: txt
CODE:
```txt
✓ sum.test.js (1)
  ✓ adds 1 + 2 to equal 3

Test Files  1 passed (1)
     Tests  1 passed (1)
  Start at  02:15:44
  Duration  311ms
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
