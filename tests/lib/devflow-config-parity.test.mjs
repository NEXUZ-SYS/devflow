// tests/lib/devflow-config-parity.test.mjs
// ADR-011: a lib classifica IGUAL à semântica autoritativa (Python-com-PyYAML)
// do hook pré-migração — para autoFinish (escalar E granular) e versioning.
// Golden não-circular (literais). Cross-check ao vivo com python3+yaml quando disponível.
// A lib é PyYAML-independente por construção → o caso "sem PyYAML" tem saída idêntica.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readAutoFinish, readVersioning } from "../../scripts/lib/devflow-config.mjs";

// Normaliza qualquer resultado (lib ou Python) a uma forma comparável (classificação, não bytes).
function canon(v) {
  if (v === "disabled" || v === "all") return v;
  if (v && typeof v === "object") {
    return {
      bump: !!v.bump, commit: !!v.commit, push: !!v.push, merge: !!v.merge,
    };
  }
  return "disabled";
}

// Semântica autoritativa Python (parse_auto_finish com PyYAML), replicada como referência.
const PY_AUTOFINISH = `
import sys, json, yaml
d = yaml.safe_load(sys.stdin.read()) or {}
af = (d.get('git') or {}).get('autoFinish')
if af is True: print('all')
elif af is False or af is None: print('disabled')
elif isinstance(af, dict): print(json.dumps(af))
else: print('disabled')
`;

let pythonYamlOK = false;
try {
  execFileSync("python3", ["-c", "import yaml"], { stdio: "ignore" });
  pythonYamlOK = true;
} catch { pythonYamlOK = false; }

function pythonAF(yamlText) {
  const out = execFileSync("python3", ["-c", PY_AUTOFINISH], { input: yamlText }).toString().trim();
  return out === "all" || out === "disabled" ? out : JSON.parse(out);
}

const CASES = [
  { name: "escalar true", yaml: "git:\n  autoFinish: true\n", golden: "all" },
  { name: "escalar false", yaml: "git:\n  autoFinish: false\n", golden: "disabled" },
  { name: "ausente", yaml: "git:\n  prCli: gh\n", golden: "disabled" },
  { name: "granular {bump:true, merge:false}", yaml: "git:\n  autoFinish:\n    bump: true\n    merge: false\n",
    golden: { bump: true, commit: false, push: false, merge: false } },
  { name: "granular {merge:true}", yaml: "git:\n  autoFinish:\n    merge: true\n",
    golden: { bump: false, commit: false, push: false, merge: true } },
];

for (const c of CASES) {
  test(`paridade autoFinish: ${c.name}`, () => {
    // 1) lib == golden (contrato não-circular)
    assert.deepEqual(canon(readAutoFinish(c.yaml)), canon(c.golden), "lib diverge do golden");
    // 2) cross-check ao vivo: lib == Python-com-PyYAML (mesma classificação)
    if (pythonYamlOK) {
      assert.deepEqual(canon(readAutoFinish(c.yaml)), canon(pythonAF(c.yaml)), "lib diverge do Python-com-PyYAML");
    }
  });
}

test("versioning: paridade de classificação", () => {
  assert.equal(readVersioning("git:\n  versioning: pipeline\n"), "pipeline");
  assert.equal(readVersioning("git:\n  versioning: none\n"), "none");
  assert.equal(readVersioning("git:\n  prCli: gh\n"), "local");
});

test(`ambiente: python3+yaml ${pythonYamlOK ? "presente (cross-check ativo)" : "ausente (só golden; lib é PyYAML-independente)"}`, () => {
  assert.ok(true);
});
