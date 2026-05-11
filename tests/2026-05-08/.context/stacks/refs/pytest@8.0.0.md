<<<DEVFLOW_STACK_REF_START_4732333c5fab0d42>>>
TITLE: Install `pytest`¶
DESCRIPTION: Run the following command in your command line:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: bash
CODE:
```bash
pip install -U pytest
```

----------------------------------------

TITLE: Install `pytest`¶
DESCRIPTION: Check that you installed the correct version:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: bash
CODE:
```bash
$ pytest --version
pytest 9.0.3
```

----------------------------------------

TITLE: Create your first test¶
DESCRIPTION: Create a new file called `test_sample.py`, containing a function, and a test:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_sample.py
def func(x):
    return x + 1

def test_answer():
    assert func(3) == 5
```

----------------------------------------

TITLE: Create your first test¶
DESCRIPTION: The test
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: pytest
CODE:
```pytest
$ pytest
=========================== test session starts ============================
platform linux -- Python 3.x.y, pytest-9.x.y, pluggy-1.x.y
rootdir: /home/sweet/project
collected 1 item

test_sample.py F                                                     [100%]

================================= FAILURES =================================
_______________________________ test_answer ________________________________

    def test_answer():
>       assert func(3) == 5
E       assert 4 == 5
E        +  where 4 = func(3)

test_sample.py:6: AssertionError
========================= short test summary info ==========================
FAILED test_sample.py::test_answer - assert 4 == 5
============================ 1 failed in 0.12s =============================
```

----------------------------------------

TITLE: Assert that a certain exception is raised¶
DESCRIPTION: Use the [raises](https://docs.pytest.org/en/stable/how-to/assert.html#assertraises) helper to assert that some code raises an exception:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_sysexit.py
import pytest

def f():
    raise SystemExit(1)

def test_mytest():
    with pytest.raises(SystemExit):
        f()
```

----------------------------------------

TITLE: Assert that a certain exception is raised¶
DESCRIPTION: Execute the test function with “quiet” reporting mode:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: pytest
CODE:
```pytest
$ pytest -q test_sysexit.py
.                                                                    [100%]
1 passed in 0.12s
```

----------------------------------------

TITLE: Group multiple tests in a class¶
DESCRIPTION: Once you develop multiple tests, you may want to group them into a class. pytest makes it easy to create a class containing more than one test:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_class.py
class TestClass:
    def test_one(self):
        x = "this"
        assert "h" in x

    def test_two(self):
        x = "hello"
        assert hasattr(x, "check")
```

----------------------------------------

TITLE: Group multiple tests in a class¶
DESCRIPTION: `pytest` discovers all tests following its [Conventions for Python test discovery](https://docs.pytest.org/en/stable/explanation/goodpractices.html#test-discovery), so it finds both `test_` prefixed functions. There is no need to subclass anything, but make sure to prefix your class with `Test` otherwise the class will be skipped. We can simply run the module by passing its filename:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: pytest
CODE:
```pytest
$ pytest -q test_class.py
.F                                                                   [100%]
================================= FAILURES =================================
____________________________ TestClass.test_two ____________________________

self = <test_class.TestClass object at 0xdeadbeef0001>

    def test_two(self):
        x = "hello"
>       assert hasattr(x, "check")
E       AssertionError: assert False
E        +  where False = hasattr('hello', 'check')

test_class.py:8: AssertionError
========================= short test summary info ==========================
FAILED test_class.py::TestClass::test_two - AssertionError: assert False
1 failed, 1 passed in 0.12s
```

----------------------------------------

TITLE: Group multiple tests in a class¶
DESCRIPTION: Something to be aware of when grouping tests inside classes is that each test has a unique instance of the class. Having each test share the same class instance would be very detrimental to test isolation and would promote poor test practices. This is outlined below:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_class_demo.py
class TestClassDemoInstance:
    value = 0

    def test_one(self):
        self.value = 1
        assert self.value == 1

    def test_two(self):
        assert self.value == 1
```

----------------------------------------

TITLE: Group multiple tests in a class¶
DESCRIPTION: 
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: pytest
CODE:
```pytest
$ pytest -k TestClassDemoInstance -q
.F                                                                   [100%]
================================= FAILURES =================================
______________________ TestClassDemoInstance.test_two ______________________

self = <test_class_demo.TestClassDemoInstance object at 0xdeadbeef0002>

    def test_two(self):
>       assert self.value == 1
E       assert 0 == 1
E        +  where 0 = <test_class_demo.TestClassDemoInstance object at 0xdeadbeef0002>.value

test_class_demo.py:9: AssertionError
========================= short test summary info ==========================
FAILED test_class_demo.py::TestClassDemoInstance::test_two - assert 0 == 1
1 failed, 1 passed in 0.12s
```

----------------------------------------

TITLE: Compare floating-point values with pytest.approx¶
DESCRIPTION: `pytest` also provides a number of utilities to make writing tests easier. For example, you can use [`pytest.approx()`](https://docs.pytest.org/en/stable/reference/reference.html#pytest.approx) to compare floating-point values that may have small rounding errors:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_approx.py
import pytest

def test_sum():
    assert (0.1 + 0.2) == pytest.approx(0.3)
```

----------------------------------------

TITLE: Request a unique temporary directory for functional tests¶
DESCRIPTION: `pytest` provides [Builtin fixtures/function arguments](https://docs.pytest.org/en/stable/builtin.html) to request arbitrary resources, like a unique temporary directory:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: python
CODE:
```python
# content of test_tmp_path.py
def test_needsfiles(tmp_path):
    print(tmp_path)
    assert 0
```

----------------------------------------

TITLE: Request a unique temporary directory for functional tests¶
DESCRIPTION: List the name `tmp_path` in the test function signature and `pytest` will lookup and call a fixture factory to create the resource before performing the test function call. Before the test runs, `pytest` creates a unique-per-test-invocation temporary directory:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: pytest
CODE:
```pytest
$ pytest -q test_tmp_path.py
F                                                                    [100%]
================================= FAILURES =================================
_____________________________ test_needsfiles ______________________________

tmp_path = PosixPath('PYTEST_TMPDIR/test_needsfiles0')

    def test_needsfiles(tmp_path):
        print(tmp_path)
>       assert 0
E       assert 0

test_tmp_path.py:3: AssertionError
--------------------------- Captured stdout call ---------------------------
PYTEST_TMPDIR/test_needsfiles0
========================= short test summary info ==========================
FAILED test_tmp_path.py::test_needsfiles - assert 0
1 failed in 0.12s
```

----------------------------------------

TITLE: Request a unique temporary directory for functional tests¶
DESCRIPTION: Find out what kind of builtin [pytest fixtures](https://docs.pytest.org/en/stable/reference/fixtures.html#fixtures) exist with the command:
SOURCE: https://docs.pytest.org/en/stable/getting-started.html
LANGUAGE: bash
CODE:
```bash
pytest --fixtures   # shows builtin and custom fixtures
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
