#!/usr/bin/env bash
# Check that the fixtures shared by the backend and frontend tests are identical copies.
set -euo pipefail

repository_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_dir"

# backend copy (the source) : frontend copy
pairs=(
    "backend/product/intake/tests/module_cases.json:frontend/src/features/emr/intake/moduleCases.json"
)

status=0
for pair in "${pairs[@]}"; do
    source_file="${pair%%:*}"
    copy_file="${pair#*:}"
    if [[ ! -f "$source_file" ]]; then
        echo "Missing $source_file" >&2
        status=1
    elif [[ ! -f "$copy_file" ]]; then
        echo "Missing $copy_file: copy it from $source_file" >&2
        status=1
    elif ! diff <(tr -d '\r' < "$source_file") <(tr -d '\r' < "$copy_file") > /dev/null; then
        echo "$copy_file differs from $source_file: copy it again" >&2
        diff <(tr -d '\r' < "$source_file") <(tr -d '\r' < "$copy_file") >&2 || true
        status=1
    fi
done
# The catalogue fixture must equal what the backend catalogue serves (same command as logic.test.ts).
catalogue_copy="frontend/src/features/emr/intake/catalogue.fixture.json"
python_bin="$(command -v python3 || command -v python || true)"
if [[ -z "$python_bin" ]]; then
    echo "Python is not available: cannot compare $catalogue_copy with backend/product/intake/catalogue.py" >&2
    status=1
elif [[ ! -f "$catalogue_copy" ]]; then
    echo "Missing $catalogue_copy: regenerate it (command at the top of frontend/src/features/emr/intake/logic.test.ts)" >&2
    status=1
else
    fresh="$("$python_bin" -I -c "import runpy,json,sys; ns=runpy.run_path(sys.argv[1]); print(json.dumps({'version': ns['CATALOGUE_VERSION'], 'sections': ns['SECTIONS']}, indent=1, ensure_ascii=True))" backend/product/intake/catalogue.py | tr -d '')"
    if [[ "$fresh" != "$(tr -d '' < "$catalogue_copy")" ]]; then
        echo "$catalogue_copy is stale: regenerate it (command at the top of frontend/src/features/emr/intake/logic.test.ts)" >&2
        status=1
    fi
fi
if [[ $status -eq 0 ]]; then
    echo "Shared fixtures match."
fi
exit $status
