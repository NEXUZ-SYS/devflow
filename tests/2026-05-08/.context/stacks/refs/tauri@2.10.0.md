<<<DEVFLOW_STACK_REF_START_697fd6fc4c66f5d9>>>
TITLE: Basic Example
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn my_custom_command() {  println!("I was invoked from JavaScript!");}
```

----------------------------------------

TITLE: Basic Example
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .invoke_handler(tauri::generate_handler![my_custom_command])    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Basic Example
DESCRIPTION: Now, you can invoke the command from your JavaScript code:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
// When using the Tauri API npm package:import { invoke } from '@tauri-apps/api/core';
// When using the Tauri global script (if not using the npm package)// Be sure to set `app.withGlobalTauri` in `tauri.conf.json` to trueconst invoke = window.__TAURI__.core.invoke;
// Invoke the commandinvoke('my_custom_command');
```

----------------------------------------

TITLE: Defining Commands in a Separate Module
DESCRIPTION: src-tauri/src/commands.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]pub fn my_custom_command() {  println!("I was invoked from JavaScript!");}
```

----------------------------------------

TITLE: Defining Commands in a Separate Module
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
mod commands;
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .invoke_handler(tauri::generate_handler![commands::my_custom_command])    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: WASM
DESCRIPTION: When using a Rust frontend to call `invoke()` without arguments, you will need to adapt your frontend code as below. The reason is that Rust doesn’t support optional arguments.
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[wasm_bindgen]extern "C" {    // invoke without arguments    #[wasm_bindgen(js_namespace = ["window", "__TAURI__", "core"], js_name = invoke)]    async fn invoke_without_args(cmd: &str) -> JsValue;
    // invoke with arguments (default)    #[wasm_bindgen(js_namespace = ["window", "__TAURI__", "core"])]    async fn invoke(cmd: &str, args: JsValue) -> JsValue;
    // They need to have different names!}
```

----------------------------------------

TITLE: Passing Arguments
DESCRIPTION: Your command handlers can take arguments:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn my_custom_command(invoke_message: String) {  println!("I was invoked from JavaScript, with this message: {}", invoke_message);}
```

----------------------------------------

TITLE: Passing Arguments
DESCRIPTION: Arguments should be passed as a JSON object with camelCase keys:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
invoke('my_custom_command', { invokeMessage: 'Hello!' });
```

----------------------------------------

TITLE: Returning Data
DESCRIPTION: Command handlers can return data as well:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn my_custom_command() -> String {  "Hello from Rust!".into()}
```

----------------------------------------

TITLE: Returning Data
DESCRIPTION: The `invoke` function returns a promise that resolves with the returned value:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
invoke('my_custom_command').then((message) => console.log(message));
```

----------------------------------------

TITLE: Returning Array Buffers
DESCRIPTION: Return values that implements [`serde::Serialize`](https://docs.serde.rs/serde/trait.Serialize.html) are serialized to JSON when the response is sent to the frontend. This can slow down your application if you try to return a large data such as a file or a download HTTP response. To return array buffers in an optimized way, use [`tauri::ipc::Response`](https://docs.rs/tauri/2.0.0/tauri/ipc/struct.Response.html):
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
use tauri::ipc::Response;#[tauri::command]fn read_file() -> Response {  let data = std::fs::read("/path/to/file").unwrap();  tauri::ipc::Response::new(data)}
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: If your handler could fail and needs to be able to return an error, have the function return a `Result`:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn login(user: String, password: String) -> Result<String, String> {  if user == "tauri" && password == "tauri" {    // resolve    Ok("logged_in".to_string())  } else {    // reject    Err("invalid credentials".to_string())  }}
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: If the command returns an error, the promise will reject, otherwise, it resolves:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
invoke('login', { user: 'tauri', password: '0j4rijw8=' })  .then((message) => console.log(message))  .catch((error) => console.error(error));
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: As mentioned above, everything returned from commands must implement [`serde::Serialize`](https://docs.serde.rs/serde/trait.Serialize.html), including errors. This can be problematic if you’re working with error types from Rust’s std library or external crates as most error types do not implement it. In simple scenarios you can use `map_err` to convert these errors to `String`:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn my_custom_command() -> Result<(), String> {  std::fs::File::open("path/to/file").map_err(|err| err.to_string())?;  // Return `null` on success  Ok(())}
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: Since this is not very idiomatic you may want to create your own error type which implements `serde::Serialize`. In the following example, we use the [`thiserror`](https://github.com/dtolnay/thiserror) crate to help create the error type. It allows you to turn enums into error types by deriving the `thiserror::Error` trait. You can consult its documentation for more details.
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
// create the error type that represents all errors possible in our program#[derive(Debug, thiserror::Error)]enum Error {  #[error(transparent)]  Io(#[from] std::io::Error)}
// we must manually implement serde::Serializeimpl serde::Serialize for Error {  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>  where    S: serde::ser::Serializer,  {    serializer.serialize_str(self.to_string().as_ref())  }}
#[tauri::command]fn my_custom_command() -> Result<(), Error> {  // This will return an error  std::fs::File::open("path/that/does/not/exist")?;  // Return `null` on success  Ok(())}
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: A custom error type has the advantage of making all possible errors explicit so readers can quickly identify what errors can happen. This saves other people (and yourself) enormous amounts of time when reviewing and refactoring code later.  
It also gives you full control over the way your error type gets serialized. In the above example, we simply returned the error message as a string, but you could assign each error a code so you could more easily map it to a similar looking TypeScript error enum for example:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[derive(Debug, thiserror::Error)]enum Error {  #[error(transparent)]  Io(#[from] std::io::Error),  #[error("failed to parse as string: {0}")]  Utf8(#[from] std::str::Utf8Error),}
#[derive(serde::Serialize)]#[serde(tag = "kind", content = "message")]#[serde(rename_all = "camelCase")]enum ErrorKind {  Io(String),  Utf8(String),}
impl serde::Serialize for Error {  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>  where    S: serde::ser::Serializer,  {    let error_message = self.to_string();    let error_kind = match self {      Self::Io(_) => ErrorKind::Io(error_message),      Self::Utf8(_) => ErrorKind::Utf8(error_message),    };    error_kind.serialize(serializer)  }}
#[tauri::command]fn read() -> Result<Vec<u8>, Error> {  let data = std::fs::read("/path/to/file")?;  Ok(data)}
```

----------------------------------------

TITLE: Error Handling
DESCRIPTION: In your frontend you now get a `{ kind: 'io' | 'utf8', message: string }` error object:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: ts
CODE:
```ts
type ErrorKind = {  kind: 'io' | 'utf8';  message: string;};
invoke('read').catch((e: ErrorKind) => {});
```

----------------------------------------

TITLE: Async Commands
DESCRIPTION: _Example:_
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
// Declare the async function using String instead of &str, as &str is borrowed and thus unsupported#[tauri::command]async fn my_custom_command(value: String) -> String {  // Call another async function and wait for it to finish  some_async_function().await;  value}
```

----------------------------------------

TITLE: Async Commands
DESCRIPTION: _Example:_
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
// Return a Result<String, ()> to bypass the borrowing issue#[tauri::command]async fn my_custom_command(value: &str) -> Result<String, ()> {  // Call another async function and wait for it to finish  some_async_function().await;  // Note that the return value must be wrapped in `Ok()` now.  Ok(format!(value))}
```

----------------------------------------

TITLE: Invoking from JavaScript
DESCRIPTION: Since invoking the command from JavaScript already returns a promise, it works just like any other command:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
invoke('my_custom_command', { value: 'Hello, Async!' }).then(() =>  console.log('Completed!'));
```

----------------------------------------

TITLE: Channels
DESCRIPTION: The Tauri channel is the recommended mechanism for streaming data such as streamed HTTP responses to the frontend. The following example reads a file and notifies the frontend of the progress in chunks of 4096 bytes:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
use tokio::io::AsyncReadExt;
#[tauri::command]async fn load_image(path: std::path::PathBuf, reader: tauri::ipc::Channel<&[u8]>) {  // for simplicity this example does not include error handling  let mut file = tokio::fs::File::open(path).await.unwrap();
  let mut chunk = vec![0; 4096];
  loop {    let len = file.read(&mut chunk).await.unwrap();    if len == 0 {      // Length of zero means end of file.      break;    }    reader.send(&chunk).unwrap();  }}
```

----------------------------------------

TITLE: Accessing the WebviewWindow in Commands
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]async fn my_custom_command(webview_window: tauri::WebviewWindow) {  println!("WebviewWindow: {}", webview_window.label());}
```

----------------------------------------

TITLE: Accessing an AppHandle in Commands
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]async fn my_custom_command(app_handle: tauri::AppHandle) {  let app_dir = app_handle.path().app_dir();  use tauri::GlobalShortcutManager;  app_handle.global_shortcut_manager().register("CTRL + U", move || {});}
```

----------------------------------------

TITLE: Accessing Managed State
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
struct MyState(String);
#[tauri::command]fn my_custom_command(state: tauri::State<MyState>) {  assert_eq!(state.0 == "some state value", true);}
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .manage(MyState("some state value".into()))    .invoke_handler(tauri::generate_handler![my_custom_command])    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Accessing Raw Request
DESCRIPTION: Tauri commands can also access the full [`tauri::ipc::Request`](https://docs.rs/tauri/2.0.0/tauri/ipc/struct.Request.html) object which includes the raw body payload and the request headers.
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[derive(Debug, thiserror::Error)]enum Error {  #[error("unexpected request body")]  RequestBodyMustBeRaw,  #[error("missing `{0}` header")]  MissingHeader(&'static str),}
impl serde::Serialize for Error {  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>  where    S: serde::ser::Serializer,  {    serializer.serialize_str(self.to_string().as_ref())  }}
#[tauri::command]fn upload(request: tauri::ipc::Request) -> Result<(), Error> {  let tauri::ipc::InvokeBody::Raw(upload_data) = request.body() else {    return Err(Error::RequestBodyMustBeRaw);  };  let Some(authorization_header) = request.headers().get("Authorization") else {    return Err(Error::MissingHeader("Authorization"));  };
  // upload...
  Ok(())}
```

----------------------------------------

TITLE: Accessing Raw Request
DESCRIPTION: In the frontend you can call invoke() sending a raw request body by providing an ArrayBuffer or Uint8Array on the payload argument, and include request headers in the third argument:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: js
CODE:
```js
const data = new Uint8Array([1, 2, 3]);await __TAURI__.core.invoke('upload', data, {  headers: {    Authorization: 'apikey',  },});
```

----------------------------------------

TITLE: Creating Multiple Commands
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
#[tauri::command]fn cmd_a() -> String {  "Command a"}#[tauri::command]fn cmd_b() -> String {  "Command b"}
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .invoke_handler(tauri::generate_handler![cmd_a, cmd_b])    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Complete Example
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
struct Database;
#[derive(serde::Serialize)]struct CustomResponse {  message: String,  other_val: usize,}
async fn some_other_function() -> Option<String> {  Some("response".into())}
#[tauri::command]async fn my_custom_command(  window: tauri::Window,  number: usize,  database: tauri::State<'_, Database>,) -> Result<CustomResponse, String> {  println!("Called from {}", window.label());  let result: Option<String> = some_other_function().await;  if let Some(message) = result {    Ok(CustomResponse {      message,      other_val: 42 + number,    })  } else {    Err("No result".into())  }}
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .manage(Database {})    .invoke_handler(tauri::generate_handler![my_custom_command])    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Complete Example
DESCRIPTION: 
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: javascript
CODE:
```javascript
import { invoke } from '@tauri-apps/api/core';
// Invocation from JavaScriptinvoke('my_custom_command', {  number: 42,})  .then((res) =>    console.log(`Message: ${res.message}, Other Val: ${res.other_val}`)  )  .catch((e) => console.error(e));
```

----------------------------------------

TITLE: Global Events
DESCRIPTION: To trigger a global event you can use the [event.emit](https://v2.tauri.app/reference/javascript/api/namespaceevent/#emit) or the [WebviewWindow#emit](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/#emit) functions:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: js
CODE:
```js
import { emit } from '@tauri-apps/api/event';import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
// emit(eventName, payload)emit('file-selected', '/path/to/file');
const appWebview = getCurrentWebviewWindow();appWebview.emit('route-changed', { url: window.location.href });
```

----------------------------------------

TITLE: Webview Event
DESCRIPTION: To trigger an event to a listener registered by a specific webview you can use the [event.emitTo](https://v2.tauri.app/reference/javascript/api/namespaceevent/#emitto) or the [WebviewWindow#emitTo](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/#emitto) functions:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: js
CODE:
```js
import { emitTo } from '@tauri-apps/api/event';import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
// emitTo(webviewLabel, eventName, payload)emitTo('settings', 'settings-update-requested', {  key: 'notification',  value: 'all',});
const appWebview = getCurrentWebviewWindow();appWebview.emitTo('editor', 'file-changed', {  path: '/path/to/file',  contents: 'file contents',});
```

----------------------------------------

TITLE: Listening to Events
DESCRIPTION: Listening to global events
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: ts
CODE:
```ts
import { listen } from '@tauri-apps/api/event';
type DownloadStarted = {  url: string;  downloadId: number;  contentLength: number;};
listen<DownloadStarted>('download-started', (event) => {  console.log(    `downloading ${event.payload.contentLength} bytes from ${event.payload.url}`  );});
```

----------------------------------------

TITLE: Listening to Events
DESCRIPTION: Listening to webview-specific events
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: ts
CODE:
```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
const appWebview = getCurrentWebviewWindow();appWebview.listen<string>('logged-in', (event) => {  localStorage.setItem('session-token', event.payload);});
```

----------------------------------------

TITLE: Listening to Events
DESCRIPTION: The `listen` function keeps the event listener registered for the entire lifetime of the application. To stop listening on an event you can use the `unlisten` function which is returned by the `listen` function:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: js
CODE:
```js
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen('download-started', (event) => {});unlisten();
```

----------------------------------------

TITLE: Listening to Events
DESCRIPTION: Additionally Tauri provides a utility function for listening to an event exactly once:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: js
CODE:
```js
import { once } from '@tauri-apps/api/event';import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
once('ready', (event) => {});
const appWebview = getCurrentWebviewWindow();appWebview.once('ready', () => {});
```

----------------------------------------

TITLE: Listening to Events on Rust
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
use tauri::Listener;
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .setup(|app| {      app.listen("download-started", |event| {        if let Ok(payload) = serde_json::from_str::<DownloadStarted>(&event.payload()) {          println!("downloading {}", payload.url);        }      });      Ok(())    })    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Listening to Events on Rust
DESCRIPTION: src-tauri/src/lib.rs
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
use tauri::{Listener, Manager};
#[cfg_attr(mobile, tauri::mobile_entry_point)]pub fn run() {  tauri::Builder::default()    .setup(|app| {      let webview = app.get_webview_window("main").unwrap();      webview.listen("logged-in", |event| {        let session_token = event.data;        // save token..      });      Ok(())    })    .run(tauri::generate_context!())    .expect("error while running tauri application");}
```

----------------------------------------

TITLE: Listening to Events on Rust
DESCRIPTION: The `listen` function keeps the event listener registered for the entire lifetime of the application. To stop listening on an event you can use the `unlisten` function:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
// unlisten outside of the event handler scope:let event_id = app.listen("download-started", |event| {});app.unlisten(event_id);
// unlisten when some event criteria is matchedlet handle = app.handle().clone();app.listen("status-changed", |event| {  if event.data == "ready" {    handle.unlisten(event.id);  }});
```

----------------------------------------

TITLE: Listening to Events on Rust
DESCRIPTION: Additionally Tauri provides a utility function for listening to an event exactly once:
SOURCE: https://v2.tauri.app/develop/calling-rust/
LANGUAGE: rust
CODE:
```rust
app.once("ready", |event| {  println!("app is ready");});
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
