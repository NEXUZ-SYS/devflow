<<<DEVFLOW_STACK_REF_START_c7c7dc83f4c2db64>>>
TITLE: First Steps[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#first-steps)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: First Steps[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#first-steps)
DESCRIPTION: Run the live server:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
<font color="#4E9A06">fastapi</font> devfast →fastapi dev
   FastAPI   Starting development server 🚀

             Searching for package file structure from directories
             with __init__.py files
             Importing from /home/user/code/awesomeapp

    module   🐍 main.py

      code   Importing the FastAPI app object from the module with
             the following code:

             from main import app

       app   Using import string: main:app

    server   Server started at http://127.0.0.1:8000
    server   Documentation at http://127.0.0.1:8000/docs

       tip   Running in development mode, for production use:
             fastapi run

             Logs:

      INFO   Will watch for changes in these directories:
             ['/home/user/code/awesomeapp']
      INFO   Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C
             to quit)
      INFO   Started reloader process [383138] using WatchFiles
      INFO   Started server process [383153]
      INFO   Waiting for application startup.
      INFO   Application startup complete.

restart ↻
```

----------------------------------------

TITLE: First Steps[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#first-steps)
DESCRIPTION: In the output, there's a line with something like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

----------------------------------------

TITLE: Check it[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#check-it)
DESCRIPTION: You will see the JSON response as:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
{"message": "Hello World"}
```

----------------------------------------

TITLE: Check the `openapi.json`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#check-the-openapi-json)
DESCRIPTION: It will show a JSON starting with something like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
{
    "openapi": "3.1.0",
    "info": {
        "title": "FastAPI",
        "version": "0.1.0"
    },
    "paths": {
        "/items/": {
            "get": {
                "responses": {
                    "200": {
                        "description": "Successful Response",
                        "content": {
                            "application/json": {

...
```

----------------------------------------

TITLE: Configure the app `entrypoint` in `pyproject.toml`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#configure-the-app-entrypoint-in-pyproject-toml)
DESCRIPTION: You can configure where your app is located in a `pyproject.toml` file like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
[tool.fastapi]
entrypoint = "main:app"
```

----------------------------------------

TITLE: Configure the app `entrypoint` in `pyproject.toml`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#configure-the-app-entrypoint-in-pyproject-toml)
DESCRIPTION: That `entrypoint` will tell the `fastapi` command that it should import the app like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from main import app
```

----------------------------------------

TITLE: Configure the app `entrypoint` in `pyproject.toml`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#configure-the-app-entrypoint-in-pyproject-toml)
DESCRIPTION: If your code was structured like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
.
├── backend
│   ├── main.py
│   ├── __init__.py
```

----------------------------------------

TITLE: Configure the app `entrypoint` in `pyproject.toml`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#configure-the-app-entrypoint-in-pyproject-toml)
DESCRIPTION: Then you would set the `entrypoint` as:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
[tool.fastapi]
entrypoint = "backend.main:app"
```

----------------------------------------

TITLE: Configure the app `entrypoint` in `pyproject.toml`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#configure-the-app-entrypoint-in-pyproject-toml)
DESCRIPTION: which would be equivalent to:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from backend.main import app
```

----------------------------------------

TITLE: `fastapi dev` with path[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#fastapi-dev-with-path)
DESCRIPTION: You can also pass the file path to the `fastapi dev` command, and it will guess the FastAPI app object to use:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
$ fastapi dev main.py
```

----------------------------------------

TITLE: Deploy your app (optional)[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#deploy-your-app-optional)
DESCRIPTION: Before deploying, make sure you are logged in:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
fastapi loginfast →fastapi login
You are logged in to FastAPI Cloud 🚀

restart ↻
```

----------------------------------------

TITLE: Deploy your app (optional)[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#deploy-your-app-optional)
DESCRIPTION: Then deploy your app:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
fastapi deployfast →fastapi deploy
Deploying to FastAPI Cloud...

✅ Deployment successful!

🐔 Ready the chicken! Your app is ready at https://myapp.fastapicloud.dev

restart ↻
```

----------------------------------------

TITLE: Step 1: import `FastAPI`[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#step-1-import-fastapi)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: Step 2: create a `FastAPI` "instance"[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#step-2-create-a-fastapi-instance)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: Path[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#path)
DESCRIPTION: So, in a URL like:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
https://example.com/items/foo
```

----------------------------------------

TITLE: Path[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#path)
DESCRIPTION: ...the path would be:
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
/items/foo
```

----------------------------------------

TITLE: Define a _path operation decorator_[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#define-a-path-operation-decorator)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: Step 4: define the **path operation function**[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#step-4-define-the-path-operation-function)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: Step 4: define the **path operation function**[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#step-4-define-the-path-operation-function)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello World"}
```

----------------------------------------

TITLE: Step 5: return the content[¶](https://fastapi.tiangolo.com/tutorial/first-steps/#step-5-return-the-content)
DESCRIPTION: Python 3.10+
SOURCE: https://fastapi.tiangolo.com/tutorial/first-steps/
LANGUAGE: text
CODE:
```text
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
