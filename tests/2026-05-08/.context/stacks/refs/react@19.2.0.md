<<<DEVFLOW_STACK_REF_START_e7674c0cb226adf2>>>
TITLE: Creating and nesting components
DESCRIPTION: React components are JavaScript functions that return markup:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton() {
  return (
    <button>I'm a button</button>
  );
}
```

----------------------------------------

TITLE: Creating and nesting components
DESCRIPTION: Now that you’ve declared `MyButton`, you can nest it into another component:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
export default function MyApp() {
  return (
    <div>
      <h1>Welcome to my app</h1>
      <MyButton />
    </div>
  );
}
```

----------------------------------------

TITLE: Creating and nesting components
DESCRIPTION: Have a look at the result:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton() {
  return (
    <button>
      I'm a button
    </button>
  );
}

export default function MyApp() {
  return (
    <div>
      <h1>Welcome to my app</h1>
      <MyButton />
    </div>
  );
}
```

----------------------------------------

TITLE: Writing markup with JSX
DESCRIPTION: JSX is stricter than HTML. You have to close tags like `<br />`. Your component also can’t return multiple JSX tags. You have to wrap them into a shared parent, like a `<div>...</div>` or an empty `<>...</>` wrapper:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <p>Hello there.<br />How do you do?</p>
    </>
  );
}
```

----------------------------------------

TITLE: Adding styles
DESCRIPTION: In React, you specify a CSS class with `className`. It works the same way as the HTML [`class`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/class) attribute:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
<img className="avatar" />
```

----------------------------------------

TITLE: Adding styles
DESCRIPTION: Then you write the CSS rules for it in a separate CSS file:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
/* In your CSS */
.avatar {
  border-radius: 50%;
}
```

----------------------------------------

TITLE: Displaying data
DESCRIPTION: JSX lets you put markup into JavaScript. Curly braces let you “escape back” into JavaScript so that you can embed some variable from your code and display it to the user. For example, this will display `user.name`:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
return (
  <h1>
    {user.name}
  </h1>
);
```

----------------------------------------

TITLE: Displaying data
DESCRIPTION: You can also “escape into JavaScript” from JSX attributes, but you have to use curly braces _instead of_ quotes. For example, `className="avatar"` passes the `"avatar"` string as the CSS class, but `src={user.imageUrl}` reads the JavaScript `user.imageUrl` variable value, and then passes that value as the `src` attribute:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
return (
  <img
    className="avatar"
    src={user.imageUrl}
  />
);
```

----------------------------------------

TITLE: Displaying data
DESCRIPTION: You can put more complex expressions inside the JSX curly braces too, for example, [string concatenation](https://javascript.info/operators#string-concatenation-with-binary):
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
const user = {
  name: 'Hedy Lamarr',
  imageUrl: 'https://react.dev/images/docs/scientists/yXOvdOSs.jpg',
  imageSize: 90,
};

export default function Profile() {
  return (
    <>
      <h1>{user.name}</h1>
      <img
        className="avatar"
        src={user.imageUrl}
        alt={'Photo of ' + user.name}
        style={{
          width: user.imageSize,
          height: user.imageSize
        }}
      />
    </>
  );
}
```

----------------------------------------

TITLE: Conditional rendering
DESCRIPTION: In React, there is no special syntax for writing conditions. Instead, you’ll use the same techniques as you use when writing regular JavaScript code. For example, you can use an [`if`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else) statement to conditionally include JSX:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
let content;
if (isLoggedIn) {
  content = <AdminPanel />;
} else {
  content = <LoginForm />;
}
return (
  <div>
    {content}
  </div>
);
```

----------------------------------------

TITLE: Conditional rendering
DESCRIPTION: If you prefer more compact code, you can use the [conditional `?` operator.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_Operator) Unlike `if`, it works inside JSX:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
<div>
  {isLoggedIn ? (
    <AdminPanel />
  ) : (
    <LoginForm />
  )}
</div>
```

----------------------------------------

TITLE: Conditional rendering
DESCRIPTION: When you don’t need the `else` branch, you can also use a shorter [logical `&&` syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND#short-circuit_evaluation):
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
<div>
  {isLoggedIn && <AdminPanel />}
</div>
```

----------------------------------------

TITLE: Rendering lists
DESCRIPTION: For example, let’s say you have an array of products:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
const products = [
  { title: 'Cabbage', id: 1 },
  { title: 'Garlic', id: 2 },
  { title: 'Apple', id: 3 },
];
```

----------------------------------------

TITLE: Rendering lists
DESCRIPTION: Inside your component, use the `map()` function to transform an array of products into an array of `<li>` items:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
const listItems = products.map(product =>
  <li key={product.id}>
    {product.title}
  </li>
);

return (
  <ul>{listItems}</ul>
);
```

----------------------------------------

TITLE: Rendering lists
DESCRIPTION: Notice how `<li>` has a `key` attribute. For each item in a list, you should pass a string or a number that uniquely identifies that item among its siblings. Usually, a key should be coming from your data, such as a database ID. React uses your keys to know what happened if you later insert, delete, or reorder the items.
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
const products = [
  { title: 'Cabbage', isFruit: false, id: 1 },
  { title: 'Garlic', isFruit: false, id: 2 },
  { title: 'Apple', isFruit: true, id: 3 },
];

export default function ShoppingList() {
  const listItems = products.map(product =>
    <li
      key={product.id}
      style={{
        color: product.isFruit ? 'magenta' : 'darkgreen'
      }}
    >
      {product.title}
    </li>
  );

  return (
    <ul>{listItems}</ul>
  );
}
```

----------------------------------------

TITLE: Responding to events
DESCRIPTION: You can respond to events by declaring _event handler_ functions inside your components:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton() {
  function handleClick() {
    alert('You clicked me!');
  }

  return (
    <button onClick={handleClick}>
      Click me
    </button>
  );
}
```

----------------------------------------

TITLE: Updating the screen
DESCRIPTION: First, import [`useState`](https://react.dev/reference/react/useState) from React:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
import { useState } from 'react';
```

----------------------------------------

TITLE: Updating the screen
DESCRIPTION: Now you can declare a _state variable_ inside your component:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton() {
  const [count, setCount] = useState(0);
  // ...
```

----------------------------------------

TITLE: Updating the screen
DESCRIPTION: The first time the button is displayed, `count` will be `0` because you passed `0` to `useState()`. When you want to change state, call `setCount()` and pass the new value to it. Clicking this button will increment the counter:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <button onClick={handleClick}>
      Clicked {count} times
    </button>
  );
}
```

----------------------------------------

TITLE: Updating the screen
DESCRIPTION: If you render the same component multiple times, each will get its own state. Click each button separately:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
import { useState } from 'react';

export default function MyApp() {
  return (
    <div>
      <h1>Counters that update separately</h1>
      <MyButton />
      <MyButton />
    </div>
  );
}

function MyButton() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <button onClick={handleClick}>
      Clicked {count} times
    </button>
  );
}
```

----------------------------------------

TITLE: Sharing data between components
DESCRIPTION: First, _move the state up_ from `MyButton` into `MyApp`:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
export default function MyApp() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <div>
      <h1>Counters that update separately</h1>
      <MyButton />
      <MyButton />
    </div>
  );
}

function MyButton() {
  // ... we're moving code from here ...
}
```

----------------------------------------

TITLE: Sharing data between components
DESCRIPTION: Then, _pass the state down_ from `MyApp` to each `MyButton`, together with the shared click handler. You can pass information to `MyButton` using the JSX curly braces, just like you previously did with built-in tags like `<img>`:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
export default function MyApp() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <div>
      <h1>Counters that update together</h1>
      <MyButton count={count} onClick={handleClick} />
      <MyButton count={count} onClick={handleClick} />
    </div>
  );
}
```

----------------------------------------

TITLE: Sharing data between components
DESCRIPTION: Finally, change `MyButton` to _read_ the props you have passed from its parent component:
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
function MyButton({ count, onClick }) {
  return (
    <button onClick={onClick}>
      Clicked {count} times
    </button>
  );
}
```

----------------------------------------

TITLE: Sharing data between components
DESCRIPTION: When you click the button, the `onClick` handler fires. Each button’s `onClick` prop was set to the `handleClick` function inside `MyApp`, so the code inside of it runs. That code calls `setCount(count + 1)`, incrementing the `count` state variable. The new `count` value is passed as a prop to each button, so they all show the new value. This is called “lifting state up”. By moving state up, you’ve shared it between components.
SOURCE: https://react.dev/learn
LANGUAGE: text
CODE:
```text
import { useState } from 'react';

export default function MyApp() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <div>
      <h1>Counters that update together</h1>
      <MyButton count={count} onClick={handleClick} />
      <MyButton count={count} onClick={handleClick} />
    </div>
  );
}

function MyButton({ count, onClick }) {
  return (
    <button onClick={onClick}>
      Clicked {count} times
    </button>
  );
}
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
