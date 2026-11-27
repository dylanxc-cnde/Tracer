"""Run backend regression with repository-local temporary data."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    checks = root / ".local" / "checks"
    if not checks.resolve().is_relative_to(root):
        raise RuntimeError("Test artifacts must stay inside the repository")
    checks.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix="backend-", dir=checks))
    env = os.environ.copy()
    env.update(
        PYTHONPATH=os.pathsep.join((str(root / "src"), str(root))),
        PYTHONDONTWRITEBYTECODE="1",
        TMPDIR=str(run),
    )
    print(f"Test artifacts: {run}", flush=True)
    return subprocess.call(
        [
            sys.executable, "-m", "pytest",
            "-c", str(root / "pyproject.toml"), str(root / "tests"),
            "--basetemp", str(run / "tmp"),
            "-o", f"cache_dir={run / 'cache'}",
            "-W", "error", *sys.argv[1:],
        ],
        cwd=run,
        env=env,
    )


if __name__ == "__main__":
    raise SystemExit(main())
