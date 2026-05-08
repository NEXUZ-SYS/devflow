<<<DEVFLOW_STACK_REF_START_69f54ec332972940>>>
TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff]
# Exclude a variety of commonly ignored directories.
exclude = [
    ".bzr",
    ".direnv",
    ".eggs",
    ".git",
    ".git-rewrite",
    ".hg",
    ".ipynb_checkpoints",
    ".mypy_cache",
    ".nox",
    ".pants.d",
    ".pyenv",
    ".pytest_cache",
    ".pytype",
    ".ruff_cache",
    ".svn",
    ".tox",
    ".venv",
    ".vscode",
    "__pypackages__",
    "_build",
    "buck-out",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "venv",
]

# Same as Black.
line-length = 88
indent-width = 4

# Assume Python 3.10
target-version = "py310"

[tool.ruff.lint]
# Enable Pyflakes (`F`) and a subset of the pycodestyle (`E`) codes by default.
# Unlike Flake8, Ruff doesn't enable pycodestyle warnings (`W`) or
# McCabe complexity (`C901`) by default.
select = ["E4", "E7", "E9", "F"]
ignore = []

# Allow fix for all enabled rules (when `--fix`) is provided.
fixable = ["ALL"]
unfixable = []

# Allow unused variables when underscore-prefixed.
dummy-variable-rgx = "^(_+|(_+[a-zA-Z0-9_]*[a-zA-Z0-9]+?))$"

[tool.ruff.format]
# Like Black, use double quotes for strings.
quote-style = "double"

# Like Black, indent with spaces, rather than tabs.
indent-style = "space"

# Like Black, respect magic trailing commas.
skip-magic-trailing-comma = false

# Like Black, automatically detect the appropriate line ending.
line-ending = "auto"

# Enable auto-formatting of code examples in docstrings. Markdown,
# reStructuredText code/literal blocks and doctests are all supported.
#
# This is currently disabled by default, but it is planned for this
# to be opt-out in the future.
docstring-code-format = false

# Set the line length limit used when formatting code snippets in
# docstrings.
#
# This only has an effect when the `docstring-code-format` setting is
# enabled.
docstring-code-line-length = "dynamic"
```

----------------------------------------

TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
# Exclude a variety of commonly ignored directories.
exclude = [
    ".bzr",
    ".direnv",
    ".eggs",
    ".git",
    ".git-rewrite",
    ".hg",
    ".ipynb_checkpoints",
    ".mypy_cache",
    ".nox",
    ".pants.d",
    ".pyenv",
    ".pytest_cache",
    ".pytype",
    ".ruff_cache",
    ".svn",
    ".tox",
    ".venv",
    ".vscode",
    "__pypackages__",
    "_build",
    "buck-out",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "venv",
]

# Same as Black.
line-length = 88
indent-width = 4

# Assume Python 3.10
target-version = "py310"

[lint]
# Enable Pyflakes (`F`) and a subset of the pycodestyle (`E`) codes by default.
# Unlike Flake8, Ruff doesn't enable pycodestyle warnings (`W`) or
# McCabe complexity (`C901`) by default.
select = ["E4", "E7", "E9", "F"]
ignore = []

# Allow fix for all enabled rules (when `--fix`) is provided.
fixable = ["ALL"]
unfixable = []

# Allow unused variables when underscore-prefixed.
dummy-variable-rgx = "^(_+|(_+[a-zA-Z0-9_]*[a-zA-Z0-9]+?))$"

[format]
# Like Black, use double quotes for strings.
quote-style = "double"

# Like Black, indent with spaces, rather than tabs.
indent-style = "space"

# Like Black, respect magic trailing commas.
skip-magic-trailing-comma = false

# Like Black, automatically detect the appropriate line ending.
line-ending = "auto"

# Enable auto-formatting of code examples in docstrings. Markdown,
# reStructuredText code/literal blocks and doctests are all supported.
#
# This is currently disabled by default, but it is planned for this
# to be opt-out in the future.
docstring-code-format = false

# Set the line length limit used when formatting code snippets in
# docstrings.
#
# This only has an effect when the `docstring-code-format` setting is
# enabled.
docstring-code-line-length = "dynamic"
```

----------------------------------------

TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.lint]
# 1. Enable flake8-bugbear (`B`) rules, in addition to the defaults.
select = ["E4", "E7", "E9", "F", "B"]

# 2. Avoid enforcing line-length violations (`E501`)
ignore = ["E501"]

# 3. Avoid trying to fix flake8-bugbear (`B`) violations.
unfixable = ["B"]

# 4. Ignore `E402` (import violations) in all `__init__.py` files, and in selected subdirectories.
[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["E402"]
"**/{tests,docs,tools}/*" = ["E402"]

[tool.ruff.format]
# 5. Use single quotes in `ruff format`.
quote-style = "single"
```

----------------------------------------

TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[lint]
# 1. Enable flake8-bugbear (`B`) rules, in addition to the defaults.
select = ["E4", "E7", "E9", "F", "B"]

# 2. Avoid enforcing line-length violations (`E501`)
ignore = ["E501"]

# 3. Avoid trying to fix flake8-bugbear (`B`) violations.
unfixable = ["B"]

# 4. Ignore `E402` (import violations) in all `__init__.py` files, and in selected subdirectories.
[lint.per-file-ignores]
"__init__.py" = ["E402"]
"**/{tests,docs,tools}/*" = ["E402"]

[format]
# 5. Use single quotes in `ruff format`.
quote-style = "single"
```

----------------------------------------

TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.lint]
# Add "Q" to the list of enabled codes.
select = ["E4", "E7", "E9", "F", "Q"]

[tool.ruff.lint.flake8-quotes]
docstring-quotes = "double"
```

----------------------------------------

TITLE: [Configuring Ruff](https://docs.astral.sh/ruff/configuration/#configuring-ruff)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[lint]
# Add "Q" to the list of enabled codes.
select = ["E4", "E7", "E9", "F", "Q"]

[lint.flake8-quotes]
docstring-quotes = "double"
```

----------------------------------------

TITLE: [Config file discovery](https://docs.astral.sh/ruff/configuration/#config-file-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff]
# Extend the `pyproject.toml` file in the parent directory...
extend = "../pyproject.toml"

# ...but use a different line length.
line-length = 100
```

----------------------------------------

TITLE: [Config file discovery](https://docs.astral.sh/ruff/configuration/#config-file-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
# Extend the `ruff.toml` file in the parent directory...
extend = "../ruff.toml"

# ...but use a different line length.
line-length = 100
```

----------------------------------------

TITLE: [Python file discovery](https://docs.astral.sh/ruff/configuration/#python-file-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.format]
exclude = ["*.pyi"]
```

----------------------------------------

TITLE: [Python file discovery](https://docs.astral.sh/ruff/configuration/#python-file-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[format]
exclude = ["*.pyi"]
```

----------------------------------------

TITLE: [Default inclusions](https://docs.astral.sh/ruff/configuration/#default-inclusions)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff]
include = ["pyproject.toml", "src/**/*.py", "scripts/**/*.py"]
```

----------------------------------------

TITLE: [Default inclusions](https://docs.astral.sh/ruff/configuration/#default-inclusions)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
include = ["pyproject.toml", "src/**/*.py", "scripts/**/*.py"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.format]
exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[format]
exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.lint]
exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[lint]
exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff]
extend-exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
extend-exclude = ["*.ipynb"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: pyproject.tomlruff.toml
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[tool.ruff.lint.per-file-ignores]
"*.ipynb" = ["T20"]
```

----------------------------------------

TITLE: [Jupyter Notebook discovery](https://docs.astral.sh/ruff/configuration/#jupyter-notebook-discovery)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
[lint.per-file-ignores]
"*.ipynb" = ["T20"]
```

----------------------------------------

TITLE: [Command-line interface](https://docs.astral.sh/ruff/configuration/#command-line-interface)
DESCRIPTION: Some configuration options can be provided or overridden via dedicated flags on the command line. This includes those related to rule enablement and disablement, file discovery, logging level, and more:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
$ ruff check path/to/code/ --select F401 --select F403 --quiet
```

----------------------------------------

TITLE: [The `--config` CLI flag](https://docs.astral.sh/ruff/configuration/#the-config-cli-flag)
DESCRIPTION: The `--config` flag has two uses. It is most often used to point to the configuration file that you would like Ruff to use, for example:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
$ ruff check path/to/directory --config path/to/ruff.toml
```

----------------------------------------

TITLE: [The `--config` CLI flag](https://docs.astral.sh/ruff/configuration/#the-config-cli-flag)
DESCRIPTION: In the below example, the `--config` flag is the only way of overriding the `dummy-variable-rgx` configuration setting from the command line, since this setting has no dedicated CLI flag. The `per-file-ignores` setting could also have been overridden via the `--per-file-ignores` dedicated flag, but using `--config` to override the setting is also fine:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
$ ruff check path/to/file --config path/to/ruff.toml --config "lint.dummy-variable-rgx = '__.*'" --config "lint.per-file-ignores = {'some_file.py' = ['F841']}"
```

----------------------------------------

TITLE: [The `--config` CLI flag](https://docs.astral.sh/ruff/configuration/#the-config-cli-flag)
DESCRIPTION: If a specific configuration option is simultaneously overridden by a dedicated flag and by the `--config` flag, the dedicated flag takes priority. In this example, the maximum permitted line length will be set to 90, not 100:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
$ ruff format path/to/file --line-length=90 --config "line-length=100"
```

----------------------------------------

TITLE: [Full command-line interface](https://docs.astral.sh/ruff/configuration/#full-command-line-interface)
DESCRIPTION: See `ruff help` for the full list of Ruff's top-level commands:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
Ruff: An extremely fast Python linter and code formatter.

Usage: ruff [OPTIONS] <COMMAND>

Commands:
  check    Run Ruff on the given files or directories
  rule     Explain a rule (or all rules)
  config   List or describe the available configuration options
  linter   List all supported upstream linters
  clean    Clear any caches in the current directory and any subdirectories
  format   Run the Ruff formatter on the given files or directories
  server   Run the language server
  analyze  Run analysis over Python source code
  version  Display Ruff's version
  help     Print this message or the help of the given subcommand(s)

Options:
  -h, --help     Print help (see more with '--help')
  -V, --version  Print version

Log levels:
  -v, --verbose  Enable verbose logging
  -q, --quiet    Print diagnostics, but nothing else
  -s, --silent   Disable all logging (but still exit with status code "1" upon
                 detecting diagnostics)

Global options:
      --config <CONFIG_OPTION>
          Either a path to a TOML configuration file (`pyproject.toml` or
          `ruff.toml`), or a TOML `<KEY> = <VALUE>` pair (such as you might
          find in a `ruff.toml` configuration file) overriding a specific
          configuration option. Overrides of individual settings using this
          option always take precedence over all configuration files, including
          configuration files that were also specified using `--config`
      --isolated
          Ignore all configuration files
      --color <WHEN>
          Control when colored output is used [possible values: auto, always,
          never]

For help with a specific command, see: `ruff help <command>`.
```

----------------------------------------

TITLE: [Full command-line interface](https://docs.astral.sh/ruff/configuration/#full-command-line-interface)
DESCRIPTION: Or `ruff help check` for more on the linting command:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
Run Ruff on the given files or directories

Usage: ruff check [OPTIONS] [FILES]...

Arguments:
  [FILES]...  List of files or directories to check, or `-` to read from stdin
              [default: .]

Options:
      --fix
          Apply fixes to resolve lint violations. Use `--no-fix` to disable or
          `--unsafe-fixes` to include unsafe fixes
      --unsafe-fixes
          Include fixes that may not retain the original intent of the code.
          Use `--no-unsafe-fixes` to disable
      --show-fixes
          Show an enumeration of all fixed lint violations. Use
          `--no-show-fixes` to disable
      --diff
          Avoid writing any fixed files back; instead, output a diff for each
          changed file to stdout, and exit 0 if there are no diffs. Implies
          `--fix-only`
  -w, --watch
          Run in watch mode by re-running whenever files change
      --fix-only
          Apply fixes to resolve lint violations, but don't report on, or exit
          non-zero for, leftover violations. Implies `--fix`. Use
          `--no-fix-only` to disable or `--unsafe-fixes` to include unsafe
          fixes
      --ignore-noqa
          Ignore any `# noqa` comments
      --output-format <OUTPUT_FORMAT>
          Output serialization format for violations. The default serialization
          format is "full" [env: RUFF_OUTPUT_FORMAT=] [possible values:
          concise, full, json, json-lines, junit, grouped, github, gitlab,
          pylint, rdjson, azure, sarif]
  -o, --output-file <OUTPUT_FILE>
          Specify file to write the linter output to (default: stdout) [env:
          RUFF_OUTPUT_FILE=]
      --target-version <TARGET_VERSION>
          The minimum Python version that should be supported [possible values:
          py37, py38, py39, py310, py311, py312, py313, py314, py315]
      --preview
          Enable preview mode; checks will include unstable rules and fixes.
          Use `--no-preview` to disable
      --extension <EXTENSION>
          List of mappings from file extension to language (one of `python`,
          `ipynb`, `pyi`). For example, to treat `.ipy` files as IPython
          notebooks, use `--extension ipy:ipynb`
      --statistics
          Show counts for every rule with at least one violation
      --add-noqa[=<REASON>]
          Enable automatic additions of `noqa` directives to failing lines.
          Optionally provide a reason to append after the codes
      --show-files
          See the files Ruff will be run against with the current settings
      --show-settings
          See the settings Ruff will use to lint a given Python file
  -h, --help
          Print help (see more with '--help')

Rule selection:
      --select <RULE_CODE>
          Comma-separated list of rule codes to enable (or ALL, to enable all
          rules)
      --ignore <RULE_CODE>
          Comma-separated list of rule codes to disable
      --extend-select <RULE_CODE>
          Like --select, but adds additional rule codes on top of those already
          specified
      --per-file-ignores <PER_FILE_IGNORES>
          List of mappings from file pattern to code to exclude
      --extend-per-file-ignores <EXTEND_PER_FILE_IGNORES>
          Like `--per-file-ignores`, but adds additional ignores on top of
          those already specified
      --fixable <RULE_CODE>
          List of rule codes to treat as eligible for fix. Only applicable when
          fix itself is enabled (e.g., via `--fix`)
      --unfixable <RULE_CODE>
          List of rule codes to treat as ineligible for fix. Only applicable
          when fix itself is enabled (e.g., via `--fix`)
      --extend-fixable <RULE_CODE>
          Like --fixable, but adds additional rule codes on top of those
          already specified

File selection:
      --exclude <FILE_PATTERN>
          List of paths, used to omit files and/or directories from analysis
      --extend-exclude <FILE_PATTERN>
          Like --exclude, but adds additional files and directories on top of
          those already excluded
      --respect-gitignore
          Respect file exclusions via `.gitignore` and other standard ignore
          files. Use `--no-respect-gitignore` to disable
      --force-exclude
          Enforce exclusions, even for paths passed to Ruff directly on the
          command-line. Use `--no-force-exclude` to disable

Miscellaneous:
  -n, --no-cache
          Disable cache reads [env: RUFF_NO_CACHE=]
      --cache-dir <CACHE_DIR>
          Path to the cache directory [env: RUFF_CACHE_DIR=]
      --stdin-filename <STDIN_FILENAME>
          The name of the file when passing it through stdin
  -e, --exit-zero
          Exit with status code "0", even upon detecting lint violations
      --exit-non-zero-on-fix
          Exit with a non-zero status code if any files were modified via fix,
          even if no lint violations remain

Log levels:
  -v, --verbose  Enable verbose logging
  -q, --quiet    Print diagnostics, but nothing else
  -s, --silent   Disable all logging (but still exit with status code "1" upon
                 detecting diagnostics)

Global options:
      --config <CONFIG_OPTION>
          Either a path to a TOML configuration file (`pyproject.toml` or
          `ruff.toml`), or a TOML `<KEY> = <VALUE>` pair (such as you might
          find in a `ruff.toml` configuration file) overriding a specific
          configuration option. Overrides of individual settings using this
          option always take precedence over all configuration files, including
          configuration files that were also specified using `--config`
      --isolated
          Ignore all configuration files
      --color <WHEN>
          Control when colored output is used [possible values: auto, always,
          never]
```

----------------------------------------

TITLE: [Full command-line interface](https://docs.astral.sh/ruff/configuration/#full-command-line-interface)
DESCRIPTION: Or `ruff help format` for more on the formatting command:
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
Run the Ruff formatter on the given files or directories

Usage: ruff format [OPTIONS] [FILES]...

Arguments:
  [FILES]...  List of files or directories to format, or `-` to read from stdin
              [default: .]

Options:
      --check
          Avoid writing any formatted files back; instead, exit with a non-zero
          status code if any files would have been modified, and zero otherwise
      --diff
          Avoid writing any formatted files back; instead, exit with a non-zero
          status code and the difference between the current file and how the
          formatted file would look like
      --extension <EXTENSION>
          List of mappings from file extension to language (one of `python`,
          `ipynb`, `pyi`). For example, to treat `.ipy` files as IPython
          notebooks, use `--extension ipy:ipynb`
      --target-version <TARGET_VERSION>
          The minimum Python version that should be supported [possible values:
          py37, py38, py39, py310, py311, py312, py313, py314, py315]
      --preview
          Enable preview mode; enables unstable formatting. Use `--no-preview`
          to disable
      --output-format <OUTPUT_FORMAT>
          Output serialization format for violations, when used with `--check`.
          The default serialization format is "full" [env: RUFF_OUTPUT_FORMAT=]
          [possible values: concise, full, json, json-lines, junit, grouped,
          github, gitlab, pylint, rdjson, azure, sarif]
  -h, --help
          Print help (see more with '--help')

Miscellaneous:
  -n, --no-cache
          Disable cache reads [env: RUFF_NO_CACHE=]
      --cache-dir <CACHE_DIR>
          Path to the cache directory [env: RUFF_CACHE_DIR=]
      --stdin-filename <STDIN_FILENAME>
          The name of the file when passing it through stdin
      --exit-non-zero-on-format
          Exit with a non-zero status code if any files were modified via
          format, even if all files were formatted successfully

File selection:
      --respect-gitignore
          Respect file exclusions via `.gitignore` and other standard ignore
          files. Use `--no-respect-gitignore` to disable
      --exclude <FILE_PATTERN>
          List of paths, used to omit files and/or directories from analysis
      --force-exclude
          Enforce exclusions, even for paths passed to Ruff directly on the
          command-line. Use `--no-force-exclude` to disable

Format configuration:
      --line-length <LINE_LENGTH>  Set the line-length

Editor options:
      --range <RANGE>  When specified, Ruff will try to only format the code in
                       the given range.
                       It might be necessary to extend the start backwards or
                       the end forwards, to fully enclose a logical line.
                       The `<RANGE>` uses the format
                       `<start_line>:<start_column>-<end_line>:<end_column>`.

Log levels:
  -v, --verbose  Enable verbose logging
  -q, --quiet    Print diagnostics, but nothing else
  -s, --silent   Disable all logging (but still exit with status code "1" upon
                 detecting diagnostics)

Global options:
      --config <CONFIG_OPTION>
          Either a path to a TOML configuration file (`pyproject.toml` or
          `ruff.toml`), or a TOML `<KEY> = <VALUE>` pair (such as you might
          find in a `ruff.toml` configuration file) overriding a specific
          configuration option. Overrides of individual settings using this
          option always take precedence over all configuration files, including
          configuration files that were also specified using `--config`
      --isolated
          Ignore all configuration files
      --color <WHEN>
          Control when colored output is used [possible values: auto, always,
          never]
```

----------------------------------------

TITLE: [Shell autocompletion](https://docs.astral.sh/ruff/configuration/#shell-autocompletion)
DESCRIPTION: BashZshfishElvishPowerShell / pwsh
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
echo 'eval "$(ruff generate-shell-completion bash)"' >> ~/.bashrc
```

----------------------------------------

TITLE: [Shell autocompletion](https://docs.astral.sh/ruff/configuration/#shell-autocompletion)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
echo 'eval "$(ruff generate-shell-completion zsh)"' >> ~/.zshrc
```

----------------------------------------

TITLE: [Shell autocompletion](https://docs.astral.sh/ruff/configuration/#shell-autocompletion)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
echo 'ruff generate-shell-completion fish | source' > ~/.config/fish/completions/ruff.fish
```

----------------------------------------

TITLE: [Shell autocompletion](https://docs.astral.sh/ruff/configuration/#shell-autocompletion)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
echo 'eval (ruff generate-shell-completion elvish | slurp)' >> ~/.elvish/rc.elv
```

----------------------------------------

TITLE: [Shell autocompletion](https://docs.astral.sh/ruff/configuration/#shell-autocompletion)
DESCRIPTION: 
SOURCE: https://docs.astral.sh/ruff/configuration/
LANGUAGE: text
CODE:
```text
if (!(Test-Path -Path $PROFILE)) {
  New-Item -ItemType File -Path $PROFILE -Force
}
Add-Content -Path $PROFILE -Value '(& ruff generate-shell-completion powershell) | Out-String | Invoke-Expression'
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
