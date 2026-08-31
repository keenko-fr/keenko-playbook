from pathlib import Path

patch = Path(".github/scripts/fix-second-review.py")
text = patch.read_text()
old = '    if (rollbackErrors.length) console.error(`Rollback encountered cleanup errors:\\n${rollbackErrors.join("\\n")}`);'
new = '    if (rollbackErrors.length) console.error(`Rollback encountered cleanup errors: ${rollbackErrors.join("; ")}`);'
if old not in text:
    raise SystemExit("missing rollback logging patch anchor")
patch.write_text(text.replace(old, new, 1))
exec(compile(patch.read_text(), str(patch), "exec"))
Path(".github/scripts/run-second-review-fix.py").unlink()
