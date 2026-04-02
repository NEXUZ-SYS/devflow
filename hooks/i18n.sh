#!/usr/bin/env bash
# DevFlow i18n — Shared language detection and string loading
# Sources the correct locale messages based on user preference.
#
# Usage in hooks:
#   source "${SCRIPT_DIR}/i18n.sh"
#   load_i18n
#   # Now all MSG_* variables are available from the selected locale
#
# Language resolution order:
#   1. Project-level: .devflow-language in project root
#   2. User-level: ~/.devflow-language
#   3. System locale: $LANG / $LANGUAGE
#   4. Default: en-US

set -euo pipefail

DEVFLOW_LOCALES_DIR="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/locales"

# Detect language preference
detect_language() {
  local lang=""

  # 1. Project-level preference
  local project_root="${PWD}"
  if [ -f "${project_root}/.devflow-language" ]; then
    lang=$(cat "${project_root}/.devflow-language" 2>/dev/null | tr -d '[:space:]')
  fi

  # 2. User-level preference
  if [ -z "$lang" ] && [ -f "${HOME}/.devflow-language" ]; then
    lang=$(cat "${HOME}/.devflow-language" 2>/dev/null | tr -d '[:space:]')
  fi

  # 3. System locale
  if [ -z "$lang" ]; then
    local sys_lang="${LANGUAGE:-${LANG:-}}"
    case "$sys_lang" in
      pt_BR*|pt_br*|pt.*)  lang="pt-BR" ;;
      es_ES*|es_es*|es_*|es.*) lang="es-ES" ;;
      en_US*|en_us*|en_GB*|en.*|C|POSIX) lang="en-US" ;;
      *) lang="" ;;
    esac
  fi

  # 4. Default
  if [ -z "$lang" ]; then
    lang="en-US"
  fi

  # Validate — fallback to en-US if locale dir doesn't exist
  if [ ! -d "${DEVFLOW_LOCALES_DIR}/${lang}" ]; then
    lang="en-US"
  fi

  printf '%s' "$lang"
}

# Get human-readable language name
get_lang_name() {
  local lang="${1:-en-US}"
  case "$lang" in
    en-US) printf '%s' "English" ;;
    pt-BR) printf '%s' "Português (Brasil)" ;;
    es-ES) printf '%s' "Español" ;;
    *) printf '%s' "$lang" ;;
  esac
}

# Load locale messages into current shell
load_i18n() {
  local lang
  lang=$(detect_language)
  export DEVFLOW_LANGUAGE="$lang"
  export DEVFLOW_LANGUAGE_NAME
  DEVFLOW_LANGUAGE_NAME=$(get_lang_name "$lang")

  local locale_file="${DEVFLOW_LOCALES_DIR}/${lang}/messages.sh"
  if [ -f "$locale_file" ]; then
    # shellcheck disable=SC1090
    source "$locale_file"
  else
    # Fallback to English
    # shellcheck disable=SC1090
    source "${DEVFLOW_LOCALES_DIR}/en-US/messages.sh"
  fi
}

# Replace template variables in a message string
# Usage: msg=$(render_msg "$MSG_BLOCKED_HEADER" branch="main" file_path="/foo.js")
render_msg() {
  local msg="$1"
  shift
  while [ $# -gt 0 ]; do
    local key="${1%%=*}"
    local val="${1#*=}"
    msg="${msg//\{$key\}/$val}"
    shift
  done
  # Replace language placeholders
  msg="${msg//\{lang\}/$DEVFLOW_LANGUAGE}"
  msg="${msg//\{lang_name\}/$DEVFLOW_LANGUAGE_NAME}"
  printf '%s' "$msg"
}

# Build the language instruction for LLM context injection
build_language_context() {
  local lang
  lang=$(detect_language)

  if [ -f "${PWD}/.devflow-language" ] || [ -f "${HOME}/.devflow-language" ]; then
    render_msg "$MSG_LANGUAGE_INSTRUCTION"
  else
    printf '%s' "$MSG_LANGUAGE_NOT_SET_INSTRUCTION"
  fi
}
