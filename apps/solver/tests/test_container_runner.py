"""The per-job container: its flags, and attacks run inside a real one (needs Docker and the image).

Build the image first: `docker build -t siliconbox-solver:dev apps/solver`. CI sets
SOLVER_TEST_IMAGE after building it; locally the tests run when the image exists.
"""

import json
import os
import shutil
import subprocess
import time

import pytest

from app import runners
from app.limits import RUNNER_PIDS
from app.runners import ContainerRunner, container_command
from tests.conftest import counter_spec

IMAGE = os.environ.get("SOLVER_TEST_IMAGE", "siliconbox-solver:dev")


def _image_available() -> bool:
    if shutil.which("docker") is None:
        return False
    inspect = subprocess.run(  # noqa: S603
        ["docker", "image", "inspect", IMAGE],  # noqa: S607
        capture_output=True,
        check=False,
    )
    return inspect.returncode == 0


if os.environ.get("SOLVER_REQUIRE_IMAGE") == "1" and not _image_available():
    raise RuntimeError(f"SOLVER_REQUIRE_IMAGE is set but {IMAGE} is not available")
needs_image = pytest.mark.skipif(not _image_available(), reason=f"Docker image {IMAGE} not built")


def test_every_isolation_flag_is_set() -> None:
    command = container_command("job-1", "img", runtime=None)
    joined = " ".join(command)
    for flag in (
        "--network none",
        "--read-only",
        "--cap-drop ALL",
        "--security-opt no-new-privileges",
        "--user 65534:65534",
        f"--pids-limit {RUNNER_PIDS}",
        "--memory 1g --memory-swap 1g",
        "--rm",
    ):
        assert flag in joined
    assert command[-4:] == ["img", "python", "-m", "app.job_runner"]
    assert "--runtime" not in command
    assert "--runtime runsc" in " ".join(container_command("job-1", "img", runtime="runsc"))


def test_the_job_container_gets_no_secrets_from_the_worker() -> None:
    command = container_command("job-1", "img", runtime=None)
    env_values = [command[i + 1] for i, part in enumerate(command) if part == "--env"]
    assert env_values == ["SOLVER_WORK_ROOT=/work"]


def _attack(code: str) -> subprocess.CompletedProcess[str]:
    """Runs Python inside a job container with exactly the job's flags."""
    command = container_command(f"siliconbox-test-{time.time_ns()}", IMAGE, runtime=None)
    command = [*command[:-3], "python", "-c", code]
    return subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)  # noqa: S603


@needs_image
def test_reference_passes_and_bug_fails_in_a_container() -> None:
    runner = ContainerRunner(IMAGE)
    assert runner.run(counter_spec()).status == "PASS"
    failing = runner.run(counter_spec("counter_bug.sv"))
    assert failing.status == "FAIL"
    assert failing.failed_check == "ap_stays_in_range"


@needs_image
def test_container_has_no_network() -> None:
    result = _attack(
        "import socket\n"
        "try:\n"
        "    socket.create_connection(('1.1.1.1', 53), timeout=3)\n"
        "    print('connected')\n"
        "except OSError as e:\n"
        "    print('blocked', e)\n"
    )
    assert "blocked" in result.stdout, result.stderr


@needs_image
def test_container_root_is_read_only_and_runs_as_nobody() -> None:
    result = _attack(
        "import os, json\n"
        "out = {'uid': os.getuid(), 'writes': []}\n"
        "for p in ('/app/x', '/etc/x', '/opt/oss-cad-suite/x', '/x'):\n"
        "    try:\n"
        "        open(p, 'w').write('x'); out['writes'].append(p)\n"
        "    except OSError:\n"
        "        pass\n"
        "open('/work/ok', 'w').write('x')\n"
        "print(json.dumps(out))\n"
    )
    seen = json.loads(result.stdout)
    assert seen == {"uid": 65534, "writes": []}


@needs_image
def test_container_environment_holds_no_secrets() -> None:
    result = _attack("import os, json; print(json.dumps(sorted(os.environ)))")
    names = set(json.loads(result.stdout))
    assert not names & {"REDIS_URL", "SOLVER_SIGNING_KEY", "MONGODB_URI", "AWS_SECRET_ACCESS_KEY"}


@needs_image
def test_a_fork_bomb_hits_the_process_limit() -> None:
    result = _attack(
        "import subprocess\n"
        "procs = []\n"
        "try:\n"
        f"    for _ in range({RUNNER_PIDS * 2}):\n"
        "        procs.append(subprocess.Popen(['sleep', '30']))\n"
        "    print('unlimited')\n"
        "except OSError:\n"
        "    print('limited', len(procs))\n"
    )
    assert result.stdout.startswith("limited"), result.stdout + result.stderr


@needs_image
def test_a_memory_hog_is_stopped() -> None:
    result = _attack("x = bytearray(3 * 1024 ** 3); print('allocated')")
    assert "allocated" not in result.stdout
    assert result.returncode != 0


@needs_image
def test_an_endless_job_is_killed_and_its_container_removed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(runners, "RUNNER_GRACE_SECONDS", 0)
    monkeypatch.setattr(runners, "CONTAINER_GRACE_SECONDS", 2)

    def endless(name: str, image: str, runtime: str | None) -> list[str]:
        return [*container_command(name, image, runtime)[:-3], "sleep", "600"]

    monkeypatch.setattr(runners, "container_command", endless)
    started = time.monotonic()
    result = ContainerRunner(IMAGE).run(counter_spec(timeoutSeconds=1))
    assert result.status == "TIMEOUT"
    assert time.monotonic() - started < 30
    left = subprocess.run(
        ["docker", "ps", "-aq", "--filter", "name=siliconbox-job-"],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )
    assert left.stdout.strip() == ""
