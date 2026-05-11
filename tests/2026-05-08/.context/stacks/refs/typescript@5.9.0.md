<<<DEVFLOW_STACK_REF_START_10d2c9722f344363>>>
TITLE: `any`
DESCRIPTION: When a value is of type `any`, you can access any properties of it (which will in turn be of type `any`), call it like a function, assign it to (or from) a value of any type, or pretty much anything else that’s syntactically legal:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tslet obj: any = { x: 0 };// None of the following lines of code will throw compiler errors.// Using `any` disables all further type checking, and it is assumed// you know the environment better than TypeScript.obj.foo();obj();obj.bar = 100;obj = "hello";const n: number = obj;Try
```

----------------------------------------

TITLE: Type Annotations on Variables
DESCRIPTION: When you declare a variable using `const`, `var`, or `let`, you can optionally add a type annotation to explicitly specify the type of the variable:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tslet myName: string = "Alice";Try
```

----------------------------------------

TITLE: Type Annotations on Variables
DESCRIPTION: In most cases, though, this isn’t needed. Wherever possible, TypeScript tries to automatically _infer_ the types in your code. For example, the type of a variable is inferred based on the type of its initializer:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// No type annotation needed -- 'myName' inferred as type 'string'let myName = "Alice";Try
```

----------------------------------------

TITLE: Parameter Type Annotations
DESCRIPTION: When you declare a function, you can add type annotations after each parameter to declare what types of parameters the function accepts. Parameter type annotations go after the parameter name:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// Parameter type annotationfunction greet(name: string) {  console.log("Hello, " + name.toUpperCase() + "!!");}Try
```

----------------------------------------

TITLE: Parameter Type Annotations
DESCRIPTION: When a parameter has a type annotation, arguments to that function will be checked:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// Would be a runtime error if executed!greet(42);Argument of type 'number' is not assignable to parameter of type 'string'.2345Argument of type 'number' is not assignable to parameter of type 'string'.Try
```

----------------------------------------

TITLE: Return Type Annotations
DESCRIPTION: You can also add return type annotations. Return type annotations appear after the parameter list:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction getFavoriteNumber(): number {  return 26;}Try
```

----------------------------------------

TITLE: Functions Which Return Promises
DESCRIPTION: If you want to annotate the return type of a function which returns a promise, you should use the `Promise` type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsasync function getFavoriteNumber(): Promise<number> {  return 26;}Try
```

----------------------------------------

TITLE: Anonymous Functions
DESCRIPTION: Here’s an example:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst names = ["Alice", "Bob", "Eve"]; // Contextual typing for function - parameter s inferred to have type stringnames.forEach(function (s) {  console.log(s.toUpperCase());}); // Contextual typing also applies to arrow functionsnames.forEach((s) => {  console.log(s.toUpperCase());});Try
```

----------------------------------------

TITLE: Object Types
DESCRIPTION: For example, here’s a function that takes a point-like object:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// The parameter's type annotation is an object typefunction printCoord(pt: { x: number; y: number }) {  console.log("The coordinate's x value is " + pt.x);  console.log("The coordinate's y value is " + pt.y);}printCoord({ x: 3, y: 7 });Try
```

----------------------------------------

TITLE: Optional Properties
DESCRIPTION: Object types can also specify that some or all of their properties are _optional_. To do this, add a `?` after the property name:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printName(obj: { first: string; last?: string }) {  // ...}// Both OKprintName({ first: "Bob" });printName({ first: "Alice", last: "Alisson" });Try
```

----------------------------------------

TITLE: Optional Properties
DESCRIPTION: In JavaScript, if you access a property that doesn’t exist, you’ll get the value `undefined` rather than a runtime error. Because of this, when you _read_ from an optional property, you’ll have to check for `undefined` before using it.
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printName(obj: { first: string; last?: string }) {  // Error - might crash if 'obj.last' wasn't provided!  console.log(obj.last.toUpperCase());'obj.last' is possibly 'undefined'.18048'obj.last' is possibly 'undefined'.  if (obj.last !== undefined) {    // OK    console.log(obj.last.toUpperCase());  }   // A safe alternative using modern JavaScript syntax:  console.log(obj.last?.toUpperCase());}Try
```

----------------------------------------

TITLE: Defining a Union Type
DESCRIPTION: Let’s write a function that can operate on strings or numbers:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printId(id: number | string) {  console.log("Your ID is: " + id);}// OKprintId(101);// OKprintId("202");// ErrorprintId({ myID: 22342 });Argument of type '{ myID: number; }' is not assignable to parameter of type 'string | number'.2345Argument of type '{ myID: number; }' is not assignable to parameter of type 'string | number'.Try
```

----------------------------------------

TITLE: Defining a Union Type
DESCRIPTION: The separator of the union members is allowed before the first element, so you could also write this:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printTextOrNumberOrBool(  textOrNumberOrBool:    | string    | number    | boolean) {  console.log(textOrNumberOrBool);}Try
```

----------------------------------------

TITLE: Working with Union Types
DESCRIPTION: TypeScript will only allow an operation if it is valid for _every_ member of the union. For example, if you have the union `string | number`, you can’t use methods that are only available on `string`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printId(id: number | string) {  console.log(id.toUpperCase());Property 'toUpperCase' does not exist on type 'string | number'.
  Property 'toUpperCase' does not exist on type 'number'.2339Property 'toUpperCase' does not exist on type 'string | number'.
  Property 'toUpperCase' does not exist on type 'number'.}Try
```

----------------------------------------

TITLE: Working with Union Types
DESCRIPTION: For example, TypeScript knows that only a `string` value will have a `typeof` value `"string"`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printId(id: number | string) {  if (typeof id === "string") {    // In this branch, id is of type 'string'    console.log(id.toUpperCase());  } else {    // Here, id is of type 'number'    console.log(id);  }}Try
```

----------------------------------------

TITLE: Working with Union Types
DESCRIPTION: Another example is to use a function like `Array.isArray`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction welcomePeople(x: string[] | string) {  if (Array.isArray(x)) {    // Here: 'x' is 'string[]'    console.log("Hello, " + x.join(" and "));  } else {    // Here: 'x' is 'string'    console.log("Welcome lone traveler " + x);  }}Try
```

----------------------------------------

TITLE: Working with Union Types
DESCRIPTION: Sometimes you’ll have a union where all the members have something in common. For example, both arrays and strings have a `slice` method. If every member in a union has a property in common, you can use that property without narrowing:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// Return type is inferred as number[] | stringfunction getFirstThree(x: number[] | string) {  return x.slice(0, 3);}Try
```

----------------------------------------

TITLE: Type Aliases
DESCRIPTION: A _type alias_ is exactly that - a _name_ for any _type_. The syntax for a type alias is:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tstype Point = {  x: number;  y: number;}; // Exactly the same as the earlier examplefunction printCoord(pt: Point) {  console.log("The coordinate's x value is " + pt.x);  console.log("The coordinate's y value is " + pt.y);} printCoord({ x: 100, y: 100 });Try
```

----------------------------------------

TITLE: Type Aliases
DESCRIPTION: You can actually use a type alias to give a name to any type at all, not just an object type. For example, a type alias can name a union type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tstype ID = number | string;Try
```

----------------------------------------

TITLE: Type Aliases
DESCRIPTION: Note that aliases are _only_ aliases - you cannot use type aliases to create different/distinct “versions” of the same type. When you use the alias, it’s exactly as if you had written the aliased type. In other words, this code might _look_ illegal, but is OK according to TypeScript because both types are aliases for the same type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tstype UserInputSanitizedString = string; function sanitizeInput(str: string): UserInputSanitizedString {  return sanitize(str);} // Create a sanitized inputlet userInput = sanitizeInput(getInput()); // Can still be re-assigned with a string thoughuserInput = "new input";Try
```

----------------------------------------

TITLE: Interfaces
DESCRIPTION: An _interface declaration_ is another way to name an object type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsinterface Point {  x: number;  y: number;} function printCoord(pt: Point) {  console.log("The coordinate's x value is " + pt.x);  console.log("The coordinate's y value is " + pt.y);} printCoord({ x: 100, y: 100 });Try
```

----------------------------------------

TITLE: Type Assertions
DESCRIPTION: In this situation, you can use a _type assertion_ to specify a more specific type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst myCanvas = document.getElementById("main_canvas") as HTMLCanvasElement;Try
```

----------------------------------------

TITLE: Type Assertions
DESCRIPTION: You can also use the angle-bracket syntax (except if the code is in a `.tsx` file), which is equivalent:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst myCanvas = <HTMLCanvasElement>document.getElementById("main_canvas");Try
```

----------------------------------------

TITLE: Type Assertions
DESCRIPTION: TypeScript only allows type assertions which convert to a _more specific_ or _less specific_ version of a type. This rule prevents “impossible” coercions like:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst x = "hello" as number;Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.2352Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.Try
```

----------------------------------------

TITLE: Type Assertions
DESCRIPTION: Sometimes this rule can be too conservative and will disallow more complex coercions that might be valid. If this happens, you can use two assertions, first to `any` (or `unknown`, which we’ll introduce later), then to the desired type:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst a = expr as any as T;Try
```

----------------------------------------

TITLE: Literal Types
DESCRIPTION: One way to think about this is to consider how JavaScript comes with different ways to declare a variable. Both `var` and `let` allow for changing what is held inside the variable, and `const` does not. This is reflected in how TypeScript creates types for literals.
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tslet changingString = "Hello World";changingString = "Olá Mundo";// Because `changingString` can represent any possible string, that// is how TypeScript describes it in the type systemchangingString;      let changingString: string const constantString = "Hello World";// Because `constantString` can only represent 1 possible string, it// has a literal type representationconstantString;      const constantString: "Hello World"Try
```

----------------------------------------

TITLE: Literal Types
DESCRIPTION: By themselves, literal types aren’t very valuable:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tslet x: "hello" = "hello";// OKx = "hello";// ...x = "howdy";Type '"howdy"' is not assignable to type '"hello"'.2322Type '"howdy"' is not assignable to type '"hello"'.Try
```

----------------------------------------

TITLE: Literal Types
DESCRIPTION: But by _combining_ literals into unions, you can express a much more useful concept - for example, functions that only accept a certain set of known values:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction printText(s: string, alignment: "left" | "right" | "center") {  // ...}printText("Hello, world", "left");printText("G'day, mate", "centre");Argument of type '"centre"' is not assignable to parameter of type '"left" | "right" | "center"'.2345Argument of type '"centre"' is not assignable to parameter of type '"left" | "right" | "center"'.Try
```

----------------------------------------

TITLE: Literal Types
DESCRIPTION: Numeric literal types work the same way:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction compare(a: string, b: string): -1 | 0 | 1 {  return a === b ? 0 : a > b ? 1 : -1;}Try
```

----------------------------------------

TITLE: Literal Types
DESCRIPTION: Of course, you can combine these with non-literal types:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsinterface Options {  width: number;}function configure(x: Options | "auto") {  // ...}configure({ width: 100 });configure("auto");configure("automatic");Argument of type '"automatic"' is not assignable to parameter of type 'Options | "auto"'.2345Argument of type '"automatic"' is not assignable to parameter of type 'Options | "auto"'.Try
```

----------------------------------------

TITLE: Literal Inference
DESCRIPTION: When you initialize a variable with an object, TypeScript assumes that the properties of that object might change values later. For example, if you wrote code like this:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst obj = { counter: 0 };if (someCondition) {  obj.counter = 1;}Try
```

----------------------------------------

TITLE: Literal Inference
DESCRIPTION: The same applies to strings:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsdeclare function handleRequest(url: string, method: "GET" | "POST"): void; const req = { url: "https://example.com", method: "GET" };handleRequest(req.url, req.method);Argument of type 'string' is not assignable to parameter of type '"GET" | "POST"'.2345Argument of type 'string' is not assignable to parameter of type '"GET" | "POST"'.Try
```

----------------------------------------

TITLE: Literal Inference
DESCRIPTION: You can change the inference by adding a type assertion in either location:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// Change 1:const req = { url: "https://example.com", method: "GET" as "GET" };// Change 2handleRequest(req.url, req.method as "GET");Try
```

----------------------------------------

TITLE: Literal Inference
DESCRIPTION: You can use `as const` to convert the entire object to be type literals:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst req = { url: "https://example.com", method: "GET" } as const;handleRequest(req.url, req.method);Try
```

----------------------------------------

TITLE: `strictNullChecks` on
DESCRIPTION: With [`strictNullChecks`](https://www.typescriptlang.org/tsconfig#strictNullChecks) _on_, when a value is `null` or `undefined`, you will need to test for those values before using methods or properties on that value. Just like checking for `undefined` before using an optional property, we can use _narrowing_ to check for values that might be `null`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction doSomething(x: string | null) {  if (x === null) {    // do nothing  } else {    console.log("Hello, " + x.toUpperCase());  }}Try
```

----------------------------------------

TITLE: Non-null Assertion Operator (Postfix `!`)
DESCRIPTION: TypeScript also has a special syntax for removing `null` and `undefined` from a type without doing any explicit checking. Writing `!` after any expression is effectively a type assertion that the value isn’t `null` or `undefined`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsfunction liveDangerously(x?: number | null) {  // No error  console.log(x!.toFixed());}Try
```

----------------------------------------

TITLE: `bigint`
DESCRIPTION: From ES2020 onwards, there is a primitive in JavaScript used for very large integers, `BigInt`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
ts// Creating a bigint via the BigInt functionconst oneHundred: bigint = BigInt(100); // Creating a BigInt via the literal syntaxconst anotherHundred: bigint = 100n;Try
```

----------------------------------------

TITLE: `symbol`
DESCRIPTION: There is a primitive in JavaScript used to create a globally unique reference via the function `Symbol()`:
SOURCE: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
LANGUAGE: id
CODE:
```id
tsconst firstName = Symbol("name");const secondName = Symbol("name"); if (firstName === secondName) {This comparison appears to be unintentional because the types 'typeof firstName' and 'typeof secondName' have no overlap.2367This comparison appears to be unintentional because the types 'typeof firstName' and 'typeof secondName' have no overlap.  // Can't ever happen}Try
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
