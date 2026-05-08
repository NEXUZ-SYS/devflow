<<<DEVFLOW_STACK_REF_START_f21566a386d3bee0>>>
TITLE: Repository files navigation
DESCRIPTION: You can try a live [demo](https://zustand-demo.pmnd.rs/) and read the [docs](https://zustand.docs.pmnd.rs/).
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: shell
CODE:
```shell
npm install zustand
```

----------------------------------------

TITLE: First create a store
DESCRIPTION: Your store is a hook! You can put anything in it: primitives, objects, functions. State has to be updated immutably and the `set` function [merges state](https://github.com/pmndrs/zustand/blob/main/docs/guides/immutable-state-and-merging.md) to help it.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { create } from 'zustand'

const useBearStore = create((set) => ({
  bears: 0,
  increasePopulation: () => set((state) => ({ bears: state.bears + 1 })),
  removeAllBears: () => set({ bears: 0 }),
}))
```

----------------------------------------

TITLE: Then bind your components, and that's it!
DESCRIPTION: Use the hook anywhere, no providers are needed. Select your state and the component will re-render on changes.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
function BearCounter() {
  const bears = useBearStore((state) => state.bears)
  return <h1>{bears} around here ...</h1>
}

function Controls() {
  const increasePopulation = useBearStore((state) => state.increasePopulation)
  return <button onClick={increasePopulation}>one up</button>
}
```

----------------------------------------

TITLE: Fetching everything
DESCRIPTION: You can, but bear in mind that it will cause the component to update on every state change!
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const state = useBearStore()
```

----------------------------------------

TITLE: Selecting multiple state slices
DESCRIPTION: It detects changes with strict-equality (old === new) by default, this is efficient for atomic state picks.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const nuts = useBearStore((state) => state.nuts)
const honey = useBearStore((state) => state.honey)
```

----------------------------------------

TITLE: Selecting multiple state slices
DESCRIPTION: If you want to construct a single object with multiple state-picks inside, similar to redux's mapStateToProps, you can use [useShallow](https://github.com/pmndrs/zustand/blob/main/docs/guides/prevent-rerenders-with-use-shallow.md) to prevent unnecessary rerenders when the selector output does not change according to shallow equal.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

const useBearStore = create((set) => ({
  nuts: 0,
  honey: 0,
  treats: {},
  // ...
}))

// Object pick, re-renders the component when either state.nuts or state.honey change
const { nuts, honey } = useBearStore(
  useShallow((state) => ({ nuts: state.nuts, honey: state.honey })),
)

// Array pick, re-renders the component when either state.nuts or state.honey change
const [nuts, honey] = useBearStore(
  useShallow((state) => [state.nuts, state.honey]),
)

// Mapped picks, re-renders the component when state.treats changes in order, count or keys
const treats = useBearStore(useShallow((state) => Object.keys(state.treats)))
```

----------------------------------------

TITLE: Selecting multiple state slices
DESCRIPTION: For more control over re-rendering, you may provide any custom equality function (this example requires the use of [`createWithEqualityFn`](https://github.com/pmndrs/zustand/blob/main/docs/migrations/migrating-to-v5.md#using-custom-equality-functions-such-as-shallow)).
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const treats = useBearStore(
  (state) => state.treats,
  (oldTreats, newTreats) => compare(oldTreats, newTreats),
)
```

----------------------------------------

TITLE: Overwriting state
DESCRIPTION: The `set` function has a second argument, `false` by default. Instead of merging, it will replace the state model. Be careful not to wipe out parts you rely on, like actions.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useFishStore = create((set) => ({
  salmon: 1,
  tuna: 2,
  deleteEverything: () => set({}, true), // clears the entire store, actions included
  deleteTuna: () => set(({ tuna, ...rest }) => rest, true),
}))
```

----------------------------------------

TITLE: Async actions
DESCRIPTION: Just call `set` when you're ready, zustand doesn't care if your actions are async or not.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useFishStore = create((set) => ({
  fishies: {},
  fetch: async (pond) => {
    const response = await fetch(pond)
    set({ fishies: await response.json() })
  },
}))
```

----------------------------------------

TITLE: Read from state in actions
DESCRIPTION: `set` allows fn-updates `set(state => result)`, but you still have access to state outside of it through `get`.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useSoundStore = create((set, get) => ({
  sound: 'grunt',
  action: () => {
    const sound = get().sound
    ...
```

----------------------------------------

TITLE: Reading/writing state and reacting to changes outside of components
DESCRIPTION: ⚠️ This technique is not recommended for adding state in [React Server Components](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md) (typically in Next.js 13 and above). It can lead to unexpected bugs and privacy issues for your users. For more details, see [#2200](https://github.com/pmndrs/zustand/discussions/2200).
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useDogStore = create(() => ({ paw: true, snout: true, fur: true }))

// Getting non-reactive fresh state
const paw = useDogStore.getState().paw
// Listening to all changes, fires synchronously on every change
const unsub1 = useDogStore.subscribe(console.log)
// Updating state, will trigger listeners
useDogStore.setState({ paw: false })
// Unsubscribe listeners
unsub1()

// You can of course use the hook as you always would
function Component() {
  const paw = useDogStore((state) => state.paw)
  ...
```

----------------------------------------

TITLE: Using subscribe with selector
DESCRIPTION: With this middleware `subscribe` accepts an additional signature:
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: ts
CODE:
```ts
subscribe(selector, callback, options?: { equalityFn, fireImmediately }): Unsubscribe
```

----------------------------------------

TITLE: Using subscribe with selector
DESCRIPTION: 
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { subscribeWithSelector } from 'zustand/middleware'
const useDogStore = create(
  subscribeWithSelector(() => ({ paw: true, snout: true, fur: true })),
)

// Listening to selected changes, in this case when "paw" changes
const unsub2 = useDogStore.subscribe((state) => state.paw, console.log)
// Subscribe also exposes the previous value
const unsub3 = useDogStore.subscribe(
  (state) => state.paw,
  (paw, previousPaw) => console.log(paw, previousPaw),
)
// Subscribe also supports an optional equality function
const unsub4 = useDogStore.subscribe(
  (state) => [state.paw, state.fur],
  console.log,
  { equalityFn: shallow },
)
// Subscribe and fire immediately
const unsub5 = useDogStore.subscribe((state) => state.paw, console.log, {
  fireImmediately: true,
})
```

----------------------------------------

TITLE: Using zustand without React
DESCRIPTION: Zustand core can be imported and used without the React dependency. The only difference is that the create function does not return a hook, but the API utilities.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { createStore } from 'zustand/vanilla'

const store = createStore((set) => ...)
const { getState, setState, subscribe, getInitialState } = store

export default store
```

----------------------------------------

TITLE: Using zustand without React
DESCRIPTION: You can use a vanilla store with `useStore` hook available since v4.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { useStore } from 'zustand'
import { vanillaStore } from './vanillaStore'

const useBoundStore = (selector) => useStore(vanillaStore, selector)
```

----------------------------------------

TITLE: Transient updates (for often occurring state-changes)
DESCRIPTION: The subscribe function allows components to bind to a state-portion without forcing re-render on changes. Best combine it with useEffect for automatic unsubscribe on unmount. This can make a [drastic](https://codesandbox.io/s/peaceful-johnson-txtws) performance impact when you are allowed to mutate the view directly.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useScratchStore = create((set) => ({ scratches: 0, ... }))

const Component = () => {
  // Fetch initial state
  const scratchRef = useRef(useScratchStore.getState().scratches)
  // Connect to the store on mount, disconnect on unmount, catch state-changes in a reference
  useEffect(() => useScratchStore.subscribe(
    state => (scratchRef.current = state.scratches)
  ), [])
  ...
```

----------------------------------------

TITLE: Sick of reducers and changing nested states? Use Immer!
DESCRIPTION: Reducing nested structures is tiresome. Have you tried [immer](https://github.com/mweststrate/immer)?
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { produce } from 'immer'

const useLushStore = create((set) => ({
  lush: { forest: { contains: { a: 'bear' } } },
  clearForest: () =>
    set(
      produce((state) => {
        state.lush.forest.contains = null
      }),
    ),
}))

const clearForest = useLushStore((state) => state.clearForest)
clearForest()
```

----------------------------------------

TITLE: Persist middleware
DESCRIPTION: You can persist your store's data using any kind of storage.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useFishStore = create(
  persist(
    (set, get) => ({
      fishes: 0,
      addAFish: () => set({ fishes: get().fishes + 1 }),
    }),
    {
      name: 'food-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    },
  ),
)
```

----------------------------------------

TITLE: Immer middleware
DESCRIPTION: Immer is available as middleware too.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

const useBeeStore = create(
  immer((set) => ({
    bees: 0,
    addBees: (by) =>
      set((state) => {
        state.bees += by
      }),
  })),
)
```

----------------------------------------

TITLE: Can't live without redux-like reducers and action types?
DESCRIPTION: Can't live without redux-like reducers and action types?
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const types = { increase: 'INCREASE', decrease: 'DECREASE' }

const reducer = (state, { type, by = 1 }) => {
  switch (type) {
    case types.increase:
      return { grumpiness: state.grumpiness + by }
    case types.decrease:
      return { grumpiness: state.grumpiness - by }
  }
}

const useGrumpyStore = create((set) => ({
  grumpiness: 0,
  dispatch: (args) => set((state) => reducer(state, args)),
}))

const dispatch = useGrumpyStore((state) => state.dispatch)
dispatch({ type: types.increase, by: 2 })
```

----------------------------------------

TITLE: Can't live without redux-like reducers and action types?
DESCRIPTION: Or, just use our redux-middleware. It wires up your main-reducer, sets the initial state, and adds a dispatch function to the state itself and the vanilla API.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { redux } from 'zustand/middleware'

const useGrumpyStore = create(redux(reducer, initialState))
```

----------------------------------------

TITLE: Redux devtools
DESCRIPTION: Install the [Redux DevTools Chrome extension](https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd) to use the devtools middleware.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { devtools } from 'zustand/middleware'

// Usage with a plain action store, it will log actions as "setState"
const usePlainStore = create(devtools((set) => ...))
// Usage with a redux store, it will log full action types
const useReduxStore = create(devtools(redux(reducer, initialState)))
```

----------------------------------------

TITLE: Redux devtools
DESCRIPTION: One redux devtools connection for multiple stores
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { devtools } from 'zustand/middleware'

// Usage with a plain action store, it will log actions as "setState"
const usePlainStore1 = create(devtools((set) => ..., { name, store: storeName1 }))
const usePlainStore2 = create(devtools((set) => ..., { name, store: storeName2 }))
// Usage with a redux store, it will log full action types
const useReduxStore1 = create(devtools(redux(reducer, initialState)), { name, store: storeName3 })
const useReduxStore2 = create(devtools(redux(reducer, initialState)), { name, store: storeName4 })
```

----------------------------------------

TITLE: Logging Actions
DESCRIPTION: You can log a specific action type for each `set` function by passing a third parameter:
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
const useBearStore = create(devtools((set) => ({
  ...
  eatFish: () => set(
    (prev) => ({ fishes: prev.fishes > 1 ? prev.fishes - 1 : 0 }),
    undefined,
    'bear/eatFish'
  ),
  ...
```

----------------------------------------

TITLE: Logging Actions
DESCRIPTION: You can also log the action's type along with its payload:
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
...
  addFishes: (count) => set(
    (prev) => ({ fishes: prev.fishes + count }),
    undefined,
    { type: 'bear/addFishes', count, }
  ),
  ...
```

----------------------------------------

TITLE: Logging Actions
DESCRIPTION: If an action type is not provided, it is defaulted to "anonymous". You can customize this default value by providing an `anonymousActionType` parameter:
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
devtools(..., { anonymousActionType: 'unknown', ... })
```

----------------------------------------

TITLE: Logging Actions
DESCRIPTION: If you wish to disable devtools (on production for instance). You can customize this setting by providing the `enabled` parameter:
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
devtools(..., { enabled: false, ... })
```

----------------------------------------

TITLE: React context
DESCRIPTION: The recommended method available since v4 is to use the vanilla store.
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: js
CODE:
```js
import { createContext, useContext } from 'react'
import { createStore, useStore } from 'zustand'

const store = createStore(...) // vanilla store without hooks

const StoreContext = createContext()

const App = () => (
  <StoreContext.Provider value={store}>
    ...
  </StoreContext.Provider>
)

const Component = () => {
  const store = useContext(StoreContext)
  const slice = useStore(store, selector)
  ...
```

----------------------------------------

TITLE: TypeScript Usage
DESCRIPTION: Basic typescript usage doesn't require anything special except for writing `create<State>()(...)` instead of `create(...)`...
SOURCE: https://github.com/pmndrs/zustand
LANGUAGE: ts
CODE:
```ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type {} from '@redux-devtools/extension' // required for devtools typing

interface BearState {
  bears: number
  increase: (by: number) => void
}

const useBearStore = create<BearState>()(
  devtools(
    persist(
      (set) => ({
        bears: 0,
        increase: (by) => set((state) => ({ bears: state.bears + by })),
      }),
      {
        name: 'bear-storage',
      },
    ),
  ),
)
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
