"""Run backend regression with repository-local temporary data."""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


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
    exit_code = None
    try:
        exit_code = subprocess.call(
            [
                sys.executable,
                "-m",
                "pytest",
                str(root / "tests"),
                *sys.argv[1:],
                "-c",
                str(root / "pyproject.toml"),
                "--basetemp",
                str(run / "tmp"),
                "-o",
                f"cache_dir={run / 'cache'}",
                "-W",
                "error",
            ],
            cwd=run,
            env=env,
        )
    finally:
        if exit_code == 0:
            shutil.rmtree(run)
        else:
            print(f"Backend test artifacts retained at {run}", file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
