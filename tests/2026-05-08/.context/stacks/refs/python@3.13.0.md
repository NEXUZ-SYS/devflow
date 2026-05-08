<<<DEVFLOW_STACK_REF_START_dc124a9bc22c932c>>>
TITLE: Improved error messages¶
DESCRIPTION: A common mistake is to write a script with the same name as a standard library module. When this results in errors, we now display a more helpful error message:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: pytb
CODE:
```pytb
$ python random.py
Traceback (most recent call last):
  File "/home/me/random.py", line 1, in <module>
    import random
  File "/home/me/random.py", line 3, in <module>
    print(random.randint(5))
          ^^^^^^^^^^^^^^
AttributeError: module 'random' has no attribute 'randint' (consider renaming '/home/me/random.py' since it has the same name as the standard library module named 'random' and prevents importing that standard library module)
```

----------------------------------------

TITLE: Improved error messages¶
DESCRIPTION: Similarly, if a script has the same name as a third-party module that it attempts to import and this results in errors, we also display a more helpful error message:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: pytb
CODE:
```pytb
$ python numpy.py
Traceback (most recent call last):
  File "/home/me/numpy.py", line 1, in <module>
    import numpy as np
  File "/home/me/numpy.py", line 3, in <module>
    np.array([1, 2, 3])
    ^^^^^^^^
AttributeError: module 'numpy' has no attribute 'array' (consider renaming '/home/me/numpy.py' if it has the same name as a library you intended to import)
```

----------------------------------------

TITLE: Improved error messages¶
DESCRIPTION: The error message now tries to suggest the correct keyword argument when an incorrect keyword argument is passed to a function.
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: pycon
CODE:
```pycon
>>> "Better error messages!".split(max_split=1)
Traceback (most recent call last):
  File "<python-input-0>", line 1, in <module>
    "Better error messages!".split(max_split=1)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^
TypeError: split() got an unexpected keyword argument 'max_split'. Did you mean 'maxsplit'?
```

----------------------------------------

TITLE: Other Language Changes¶
DESCRIPTION: The compiler now strips common leading whitespace from every line in a docstring. This reduces the size of the [bytecode cache](https://docs.python.org/3.13/glossary.html#term-bytecode) (such as `.pyc` files), with reductions in file size of around 5%, for example in `sqlalchemy.orm.session` from SQLAlchemy 2.0. This change affects tools that use docstrings, such as [`doctest`](https://docs.python.org/3.13/library/doctest.html#module-doctest).
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: pycon
CODE:
```pycon
>>> def spam():
...     """
...         This is a docstring with
...           leading whitespace.
...
...         It even has multiple paragraphs!
...     """
...
>>> spam.__doc__
'\nThis is a docstring with\n  leading whitespace.\n\nIt even has multiple paragraphs!\n'
```

----------------------------------------

TITLE: Other Language Changes¶
DESCRIPTION: [Annotation scopes](https://docs.python.org/3.13/reference/executionmodel.html#annotation-scopes) within class scopes can now contain lambdas and comprehensions. Comprehensions that are located within class scopes are not inlined into their parent scope.
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: python
CODE:
```python
class C[T]:
    type Alias = lambda: T
```

----------------------------------------

TITLE: ssl¶
DESCRIPTION: [`VERIFY_X509_STRICT`](https://docs.python.org/3.13/library/ssl.html#ssl.VERIFY_X509_STRICT) may reject pre-[**RFC 5280**](https://datatracker.ietf.org/doc/html/rfc5280.html) or malformed certificates that the underlying OpenSSL implementation might otherwise accept. Whilst disabling this is not recommended, you can do so using:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: python
CODE:
```python
import ssl

ctx = ssl.create_default_context()
ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
```

----------------------------------------

TITLE: PEP 594: Remove “dead batteries” from the standard library¶
DESCRIPTION: `cgi.parse_header()` can be replaced with the functionality in the [`email`](https://docs.python.org/3.13/library/email.html#module-email) package, which implements the same MIME RFCs. For example, with [`email.message.EmailMessage`](https://docs.python.org/3.13/library/email.message.html#email.message.EmailMessage):
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: python
CODE:
```python
from email.message import EmailMessage

msg = EmailMessage()
msg['content-type'] = 'application/json; charset="utf8"'
main, params = msg.get_content_type(), msg['content-type'].params
```

----------------------------------------

TITLE: Removed C APIs¶
DESCRIPTION: `PyObject_AsCharBuffer()`, `PyObject_AsReadBuffer()`: Use [`PyObject_GetBuffer()`](https://docs.python.org/3.13/c-api/buffer.html#c.PyObject_GetBuffer) and [`PyBuffer_Release()`](https://docs.python.org/3.13/c-api/buffer.html#c.PyBuffer_Release) instead:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: c
CODE:
```c
Py_buffer view;
if (PyObject_GetBuffer(obj, &view, PyBUF_SIMPLE) < 0) {
    return NULL;
}
// Use `view.buf` and `view.len` to read from the buffer.
// You may need to cast buf as `(const char*)view.buf`.
PyBuffer_Release(&view);
```

----------------------------------------

TITLE: Removed C APIs¶
DESCRIPTION: `PyObject_AsWriteBuffer()`: Use [`PyObject_GetBuffer()`](https://docs.python.org/3.13/c-api/buffer.html#c.PyObject_GetBuffer) and [`PyBuffer_Release()`](https://docs.python.org/3.13/c-api/buffer.html#c.PyBuffer_Release) instead:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: c
CODE:
```c
Py_buffer view;
if (PyObject_GetBuffer(obj, &view, PyBUF_WRITABLE) < 0) {
    return NULL;
}
// Use `view.buf` and `view.len` to write to the buffer.
PyBuffer_Release(&view);
```

----------------------------------------

TITLE: Changes in the C API¶
DESCRIPTION: A `tp_dealloc` function that has the old macros, such as:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: python3
CODE:
```python3
static void
mytype_dealloc(mytype *p)
{
    PyObject_GC_UnTrack(p);
    Py_TRASHCAN_SAFE_BEGIN(p);
    ...
    Py_TRASHCAN_SAFE_END
}
```

----------------------------------------

TITLE: Changes in the C API¶
DESCRIPTION: should migrate to the new macros as follows:
SOURCE: https://docs.python.org/3.13/whatsnew/3.13.html
LANGUAGE: python3
CODE:
```python3
static void
mytype_dealloc(mytype *p)
{
    PyObject_GC_UnTrack(p);
    Py_TRASHCAN_BEGIN(p, mytype_dealloc)
    ...
    Py_TRASHCAN_END
}
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
