import shutil
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("warn", [False, True], ids=["success", "warning"])
def test_backend_runner_isolates_run_artifacts(tmp_path, warn):
    target_script = tmp_path / "scripts" / "test_backend.py"
    target_script.parent.mkdir()
    source_script = Path(__file__).resolve().parents[1] / "scripts" / target_script.name
    shutil.copyfile(source_script, target_script)
    (tmp_path / "pyproject.toml").write_text("[tool.pytest.ini_options]\n")

    suite = tmp_path / "tests"
    suite.mkdir()
    test_source = (
        "import warnings\n\n"
        "def test_artifact(tmp_path):\n"
        "    (tmp_path / 'evidence.txt').write_text('test artifact')\n"
    )
    if warn:
        test_source += "    warnings.warn('synthetic warning', RuntimeWarning)\n"
    (suite / "test_synthetic.py").write_text(test_source)

    checks = tmp_path / ".local" / "checks"
    other_run = checks / "backend-earlier"
    other_run.mkdir(parents=True)
    sentinel = other_run / "keep.txt"
    sentinel.write_text("prior run")

    result = subprocess.run(
        [
            sys.executable,
            str(target_script),
            "-q",
            "--basetemp",
            str(other_run),
            "-o",
            f"cache_dir={other_run}",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == int(warn), result.stdout + result.stderr
    assert list(other_run.iterdir()) == [sentinel]
    assert sentinel.read_text() == "prior run"
    run_dirs = set(checks.iterdir()) - {other_run}
    if warn:
        (run,) = run_dirs
        assert f"Backend test artifacts retained at {run}" in result.stderr
        assert "RuntimeWarning: synthetic warning" in result.stdout
        (artifact,) = (run / "tmp").glob("test_artifact0/evidence.txt")
        assert artifact.read_text() == "test artifact"
    else:
        assert not run_dirs
