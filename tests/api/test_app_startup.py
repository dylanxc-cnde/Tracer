import os
from pathlib import Path
import subprocess
import sys
import textwrap


def run_python(source, cwd):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[2] / "src")
    return subprocess.run(
        [sys.executable, "-W", "error", "-c", textwrap.dedent(source)],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_importing_app_factory_does_not_initialize_default_database(tmp_path):
    result = run_python("from tracer.api.app import create_app", tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert not (tmp_path / ".local").exists()


def test_uvicorn_factory_starts_the_application(tmp_path):
    result = run_python(
        """
        from fastapi.testclient import TestClient
        from uvicorn import Config

        config = Config("tracer.api.app:create_app", factory=True)
        config.load()
        with TestClient(config.loaded_app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}
        """,
        tmp_path,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / ".local" / "tracer.sqlite3").is_file()
