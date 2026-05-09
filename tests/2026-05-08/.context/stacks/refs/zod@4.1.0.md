<<<DEVFLOW_STACK_REF_START_369030148bb9c329>>>
TITLE: [Defining a schema](https://zod.dev/basics?id=defining-a-schema#defining-a-schema)
DESCRIPTION: Before you can do anything else, you need to define a schema. For the purposes of this guide, we'll use a simple object schema.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
import * as z from "zod"; 
 
const Player = z.object({ 
  username: z.string(),
  xp: z.number()
});
```

----------------------------------------

TITLE: [Parsing data](https://zod.dev/basics?id=parsing-data#parsing-data)
DESCRIPTION: Given any Zod schema, use `.parse` to validate an input. If it's valid, Zod returns a strongly-typed _deep clone_ of the input.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
Player.parse({ username: "billie", xp: 100 }); 
// => returns { username: "billie", xp: 100 }
```

----------------------------------------

TITLE: [Parsing data](https://zod.dev/basics?id=parsing-data#parsing-data)
DESCRIPTION: **Note** — If your schema uses certain asynchronous APIs like `async` [refinements](https://zod.dev/api#refinements) or [transforms](https://zod.dev/api#transforms), you'll need to use the `.parseAsync()` method instead.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
await Player.parseAsync({ username: "billie", xp: 100 });
```

----------------------------------------

TITLE: [Handling errors](https://zod.dev/basics?id=handling-errors#handling-errors)
DESCRIPTION: When validation fails, the `.parse()` method will throw a `ZodError` instance with granular information about the validation issues.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
try {
  Player.parse({ username: 42, xp: "100" });
} catch(error){
  if(error instanceof z.ZodError){
    error.issues; 
    /* [
      {
        expected: 'string',
        code: 'invalid_type',
        path: [ 'username' ],
        message: 'Invalid input: expected string'
      },
      {
        expected: 'number',
        code: 'invalid_type',
        path: [ 'xp' ],
        message: 'Invalid input: expected number'
      }
    ] */
  }
}
```

----------------------------------------

TITLE: [Handling errors](https://zod.dev/basics?id=handling-errors#handling-errors)
DESCRIPTION: To avoid a `try/catch` block, you can use the `.safeParse()` method to get back a plain result object containing either the successfully parsed data or a `ZodError`. The result type is a [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), so you can handle both cases conveniently.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
const result = Player.safeParse({ username: 42, xp: "100" });
if (!result.success) {
  result.error;   // ZodError instance
} else {
  result.data;    // { username: string; xp: number }
}
```

----------------------------------------

TITLE: [Handling errors](https://zod.dev/basics?id=handling-errors#handling-errors)
DESCRIPTION: **Note** — If your schema uses certain asynchronous APIs like `async` [refinements](https://zod.dev/api#refinements) or [transforms](https://zod.dev/api#transforms), you'll need to use the `.safeParseAsync()` method instead.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
await schema.safeParseAsync("hello");
```

----------------------------------------

TITLE: [Inferring types](https://zod.dev/basics?id=inferring-types#inferring-types)
DESCRIPTION: Zod infers a static type from your schema definitions. You can extract this type with the `z.infer<>` utility and use it however you like.
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
const Player = z.object({ 
  username: z.string(),
  xp: z.number()
});
 
// extract the inferred type
type Player = z.infer<typeof Player>;
 
// use it in your code
const player: Player = { username: "billie", xp: 100 };
```

----------------------------------------

TITLE: [Inferring types](https://zod.dev/basics?id=inferring-types#inferring-types)
DESCRIPTION: In some cases, the input & output types of a schema can diverge. For instance, the `.transform()` API can convert the input from one type to another. In these cases, you can extract the input and output types independently:
SOURCE: https://zod.dev/basics
LANGUAGE: text
CODE:
```text
const mySchema = z.string().transform((val) => val.length);
 
type MySchemaIn = z.input<typeof mySchema>;
// => string
 
type MySchemaOut = z.output<typeof mySchema>; // equivalent to z.infer<typeof mySchema>
// number
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
