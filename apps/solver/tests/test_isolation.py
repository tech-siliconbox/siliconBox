"""Hardening findings 1, 3 and 8, and the job sandbox's environment."""

import os
import time
import tomllib
import uuid
from pathlib import Path

import pytest

from app.process import run_bounded
from app.runners import job_environment
from app.workspace import UnsafePathError, job_folder, remove_inside

ROOT = Path(__file__).parent.parent


def _is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def test_kills_the_whole_process_group_on_timeout(tmp_path: Path) -> None:
    # Finding 3: sby starts yosys and a solver. A timeout must stop all of them, not just sby.
    script = "sleep 60 & echo $! ; wait"
    started = time.monotonic()
    outcome = run_bounded(
        ["/bin/sh", "-c", script], cwd=tmp_path, env={"PATH": "/bin:/usr/bin"}, timeout_seconds=1
    )
    assert outcome.timed_out
    assert time.monotonic() - started < 10
    child = int(outcome.stdout.split()[0])
    time.sleep(0.2)
    assert not _is_alive(child)


def test_kills_stray_children_after_a_normal_exit(tmp_path: Path) -> None:
    outcome = run_bounded(
        ["/bin/sh", "-c", "sleep 60 & echo $!"],
        cwd=tmp_path,
        env={"PATH": "/bin:/usr/bin"},
        timeout_seconds=5,
    )
    assert not outcome.timed_out
    time.sleep(0.2)
    assert not _is_alive(int(outcome.stdout.split()[0]))


def test_the_job_process_receives_no_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "leak")
    env = job_environment()
    assert set(env) == {"PATH", "SOLVER_WORK_ROOT", "LANG", "PYTHONDONTWRITEBYTECODE"}
    assert all("k" * 48 not in value and "redis" not in value for value in env.values())


def test_no_ai_or_rag_packages_in_the_solver() -> None:
    # Finding 8: the assertion generator lives in its own service.
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    banned = ("langchain", "chromadb", "tiktoken", "openai", "ollama", "pypdf", "anthropic")
    assert not [dep for dep in project["dependencies"] if dep.startswith(banned)]


def test_deletes_happen_only_in_the_workspace_module() -> None:
    # Finding 1: one function removes folders, after checking the path.
    for path in (ROOT / "app").rglob("*.py"):
        if path.name != "workspace.py":
            assert "rmtree" not in path.read_text(), path


def test_job_folders_are_uuids_inside_the_root_and_are_removed(tmp_path: Path) -> None:
    with job_folder(tmp_path) as folder:
        assert folder.parent == tmp_path.resolve()
        assert uuid.UUID(folder.name).version == 4
        (folder / "run.sby").write_text("x")
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("target", ["..", "../..", ".", "a/../.."])
def test_refuses_to_delete_outside_the_work_root(tmp_path: Path, target: str) -> None:
    root = tmp_path / "work"
    (root / "a").mkdir(parents=True)
    with pytest.raises(UnsafePathError):
        remove_inside(root / target, root)
    assert root.is_dir()


def test_refuses_to_follow_a_symlink_out_of_the_work_root(tmp_path: Path) -> None:
    root = tmp_path / "work"
    root.mkdir()
    outside = tmp_path / "precious"
    outside.mkdir()
    (root / "link").symlink_to(outside)
    with pytest.raises(UnsafePathError):
        remove_inside(root / "link", root)
    assert outside.is_dir()
