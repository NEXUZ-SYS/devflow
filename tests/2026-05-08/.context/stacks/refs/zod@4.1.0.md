<<<DEVFLOW_STACK_REF_START_d794ee7a84fb6a51>>>
TITLE: [Introduction](https://zod.dev/?id=introduction#introduction)
DESCRIPTION: Zod is a TypeScript-first validation library. Using Zod, you can define _schemas_ you can use to validate data, from a simple `string` to a complex nested object.
SOURCE: https://zod.dev/
LANGUAGE: text
CODE:
```text
import * as z from "zod";
 
const User = z.object({
  name: z.string(),
});
 
// some untrusted data...
const input = { /* stuff */ };
 
// the parsed result is validated and type safe!
const data = User.parse(input);
 
// so you can use it with confidence :)
console.log(data.name);
```

----------------------------------------

TITLE: [Installation](https://zod.dev/?id=installation#installation)
DESCRIPTION: [Installation](https://zod.dev/?id=installation#installation)
SOURCE: https://zod.dev/
LANGUAGE: text
CODE:
```text
npm install zod
```

----------------------------------------

TITLE: [`"strict"`](https://zod.dev/?id=strict#strict)
DESCRIPTION: You must enable `strict` mode in your `tsconfig.json`. This is a best practice for all TypeScript projects.
SOURCE: https://zod.dev/
LANGUAGE: text
CODE:
```text
// tsconfig.json
{
  // ...
  "compilerOptions": {
    // ...
    "strict": true
  }
}
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
