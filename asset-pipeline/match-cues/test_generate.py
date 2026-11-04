#!/usr/bin/env python3
"""Contract, determinism, revision and event-binding tests for the match cues."""

from __future__ import annotations

import array
import copy
import hashlib
import json
import math
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import generate

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
SCRIPT = HERE / "generate.py"
RECIPE_PATH = HERE / "recipe.json"
MANIFEST_PATH = HERE / "manifest.json"
README_PATH = HERE / "README.md"
CUE_FILES = {
    "weapon-switch": "weapon-switch.wav",
    "menu-confirm": "menu-confirm.wav",
    "round-win": "round-win.wav",
    "round-loss": "round-loss.wav",
}
DURATION_LIMITS = {
    "weapon-switch": 0.14,
    "menu-confirm": 0.10,
    "round-win": 0.50,
    "round-loss": 0.50,
}
RATE = 48000
FADE_SAMPLES = round(0.005 * RATE)
PEAK_CEILING_DBFS = -12.0


def read_wav(path: Path) -> tuple[int, int, int, array.array]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.getnframes()
        payload = handle.readframes(frames)
    samples = array.array("h")
    samples.frombytes(payload)
    return channels, width, rate, samples


def read_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def zero_crossings(samples: array.array) -> int:
    return sum(
        1
        for index in range(1, len(samples))
        if (samples[index - 1] < 0 <= samples[index])
        or (samples[index - 1] >= 0 > samples[index])
    )


def block_rms(samples: array.array, block: int) -> list[float]:
    values: list[float] = []
    for start in range(0, len(samples), block):
        window = samples[start : start + block]
        values.append(math.sqrt(sum(value * value for value in window) / len(window)))
    return values


def run_generator(*arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *arguments],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def recipe_with(mutate) -> dict:
    recipe = copy.deepcopy(generate.load_recipe(RECIPE_PATH))
    mutate(recipe)
    return recipe


class WavContractTests(unittest.TestCase):
    def test_exact_cue_set_and_bare_filenames(self) -> None:
        manifest = read_manifest()
        ids = [cue["id"] for cue in manifest["cues"]]
        self.assertEqual(ids, list(CUE_FILES))
        for cue in manifest["cues"]:
            self.assertEqual(cue["file"], CUE_FILES[cue["id"]])
            self.assertEqual(Path(cue["file"]).name, cue["file"])
            self.assertTrue((HERE / cue["file"]).is_file())
            self.assertEqual(cue["sampleRate"], RATE)
            self.assertEqual(cue["channels"], 1)
            self.assertEqual(cue["sampleFormat"], "PCM16")

    def test_wav_format_duration_peak_and_edges(self) -> None:
        for cue_id, file_name in CUE_FILES.items():
            with self.subTest(cue=cue_id):
                path = HERE / file_name
                header = path.read_bytes()[:12]
                self.assertEqual(header[:4], b"RIFF")
                self.assertEqual(header[8:12], b"WAVE")
                channels, width, rate, samples = read_wav(path)
                self.assertEqual(channels, 1)
                self.assertEqual(width, 2)
                self.assertEqual(rate, RATE)
                duration = len(samples) / rate
                self.assertLessEqual(duration, DURATION_LIMITS[cue_id] + 1e-9)
                peak = max(abs(value) for value in samples)
                peak_dbfs = 20.0 * math.log10(peak / 32767)
                self.assertLessEqual(peak_dbfs, PEAK_CEILING_DBFS)
                self.assertLess(peak, 32767, "PCM16 full-scale clipping")
                self.assertEqual(samples[0], 0, "first sample must start from silence")
                self.assertEqual(samples[-1], 0, "last sample must return to silence")
                tail_peak = max(abs(value) for value in samples[-FADE_SAMPLES:])
                self.assertLessEqual(
                    tail_peak,
                    peak * 0.2,
                    "the 5 ms release must not cut a loud tail",
                )

    def test_edge_envelope_is_exactly_five_ms(self) -> None:
        for cue_id, file_name in CUE_FILES.items():
            with self.subTest(cue=cue_id):
                _, _, rate, samples = read_wav(HERE / file_name)
                envelope = generate._edge_envelope(len(samples), round(0.005 * rate))
                self.assertEqual(envelope[0], 0.0)
                self.assertEqual(envelope[-1], 0.0)
                self.assertEqual(envelope[round(0.005 * rate) - 1], 1.0)
                self.assertTrue(
                    all(
                        envelope[index] <= envelope[index + 1] + 1e-12
                        for index in range(round(0.005 * rate) - 1)
                    )
                )
                self.assertTrue(
                    all(
                        envelope[index] >= envelope[index + 1] - 1e-12
                        for index in range(len(envelope) - round(0.005 * rate), len(envelope) - 1)
                    )
                )

    def test_switch_is_low_energy_and_has_a_second_latch(self) -> None:
        _, _, rate, switch = read_wav(HERE / CUE_FILES["weapon-switch"])
        _, _, _, menu = read_wav(HERE / CUE_FILES["menu-confirm"])
        _, _, _, win = read_wav(HERE / CUE_FILES["round-win"])
        _, _, _, loss = read_wav(HERE / CUE_FILES["round-loss"])

        def rms(samples: array.array) -> float:
            return math.sqrt(sum(value * value for value in samples) / len(samples))

        self.assertLess(rms(switch), rms(menu))
        self.assertLess(rms(switch), rms(win))
        self.assertLess(rms(switch), rms(loss))
        self.assertLessEqual(len(switch) / rate, 0.14)

        # One small latch around 55 ms after the initial click: a fresh attack,
        # not a longer tail of the same transient.
        blocks = block_rms(switch, round(0.005 * rate))
        self.assertGreater(blocks[11], blocks[10] * 2.0)

    def test_menu_is_a_single_decaying_pulse(self) -> None:
        _, _, rate, menu = read_wav(HERE / CUE_FILES["menu-confirm"])
        self.assertLessEqual(len(menu) / rate, 0.10)
        blocks = block_rms(menu, round(0.01 * rate))
        for index in range(1, len(blocks)):
            self.assertLessEqual(
                blocks[index],
                blocks[index - 1] * 1.02,
                "menu cue must not contain a second attack",
            )

    def test_win_ascends_and_loss_descends(self) -> None:
        _, _, rate, win = read_wav(HERE / CUE_FILES["round-win"])
        _, _, _, loss = read_wav(HERE / CUE_FILES["round-loss"])
        window = int(0.10 * rate)
        late_start = int(0.15 * rate)
        late_end = late_start + window
        win_early = zero_crossings(win[:window])
        win_late = zero_crossings(win[late_start:late_end])
        loss_early = zero_crossings(loss[:window])
        loss_late = zero_crossings(loss[late_start:late_end])
        self.assertGreater(win_late, win_early * 1.2)
        self.assertLess(loss_late, loss_early * 0.85)

    def test_manifest_hashes_and_limits(self) -> None:
        manifest = read_manifest()
        self.assertEqual(manifest["batchId"], "B-FPS-MATCH-CUES-20261104")
        self.assertEqual(manifest["baseRef"], "36fde4bb6a2e8f9652528fdea648d0a90190db79")
        self.assertEqual(manifest["format"]["edgeEnvelopeSeconds"], 0.005)
        self.assertEqual(manifest["levels"]["peakCeilingDbfs"], -12.0)
        self.assertEqual(manifest["levels"]["appliedGainDb"], -3.0)
        self.assertEqual(manifest["levels"]["revision"]["appliedGainDb"], -3.0)
        self.assertIs(manifest["runtimeWired"], False)
        for cue in manifest["cues"]:
            path = HERE / cue["file"]
            self.assertEqual(cue["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(cue["samples"], len(read_wav(path)[3]))
            self.assertLessEqual(cue["durationSeconds"], DURATION_LIMITS[cue["id"]])
            self.assertLessEqual(cue["peakDbfs"], PEAK_CEILING_DBFS)
            self.assertIsNotNone(cue.get("seed"))
        self.assertEqual(
            manifest["generator"]["sha256"], hashlib.sha256(SCRIPT.read_bytes()).hexdigest()
        )
        self.assertEqual(
            manifest["recipe"]["sha256"], hashlib.sha256(RECIPE_PATH.read_bytes()).hexdigest()
        )

    def test_manifest_is_public_material(self) -> None:
        text = MANIFEST_PATH.read_text(encoding="utf-8")
        self.assertNotIn("C:\\", text)
        self.assertNotIn("C:/", text)
        self.assertNotIn("file://", text)
        self.assertNotIn("/home/", text)
        self.assertNotIn("/Users/", text)


class PriorityAndBindingTests(unittest.TestCase):
    def test_priority_keeps_gunfire_and_threats_first(self) -> None:
        manifest = read_manifest()
        protected = manifest["priorityIntent"]["gunfireAndThreatPriority"]
        self.assertIn("shot", protected)
        for threat in ("reload", "step", "plant", "bomb-warning", "explosion", "damage"):
            self.assertIn(threat, protected)
        self.assertIn("must not duck", manifest["priorityIntent"]["policy"])
        for cue in manifest["cues"]:
            future = cue["futurePriority"]
            self.assertIs(future["duckCombat"], False)
            self.assertIn("shot", future["below"])
            self.assertEqual(future["maxVoices"], 1)

    def test_every_binding_path_and_line_is_real(self) -> None:
        manifest = read_manifest()
        for cue in manifest["cues"]:
            self.assertTrue(cue["event"]["trigger"])
            self.assertTrue(cue["event"]["bindings"])
            for binding in cue["event"]["bindings"]:
                with self.subTest(cue=cue["id"], path=binding["repoPath"]):
                    path = REPO_ROOT / binding["repoPath"]
                    self.assertTrue(path.is_file(), f"missing binding path {path}")
                    lines = path.read_text(encoding="utf-8").splitlines()
                    self.assertLessEqual(binding["line"], len(lines))
                    source_line = lines[binding["line"] - 1]
                    symbol = binding["symbol"]
                    if "switch branch" in symbol:
                        self.assertIn("switch", source_line)
                    if "onclick" in symbol:
                        self.assertIn("onclick", source_line)
                    if symbol == "Game.finish":
                        self.assertIn("finish", source_line)
                    if "result assignment" in symbol:
                        self.assertIn("this.current.result", source_line)
                    if "won field" in symbol:
                        self.assertIn("state.result.team", source_line)
                    if symbol == "resume()":
                        self.assertIn("function resume", source_line)
                    if symbol == "next()":
                        self.assertIn("function next", source_line)
                    if symbol == "restart()":
                        self.assertIn("function restart", source_line)

    def test_menu_confirm_has_one_hook_point_per_route(self) -> None:
        manifest = read_manifest()
        cue = next(row for row in manifest["cues"] if row["id"] == "menu-confirm")
        hooks = [b for b in cue["event"]["bindings"] if b.get("hookPoint") is True]
        self.assertEqual(
            [b["repoPath"] for b in hooks],
            ["src/ui/hud.ts", "src/candidates/offline-training-v1/ui/hud.ts"],
        )
        for hook in hooks:
            self.assertIn("onclick", hook["symbol"])
            self.assertIn("settings.canPlay()", hook["role"])
        downstream = [b for b in cue["event"]["bindings"] if b.get("hookPoint") is False]
        self.assertEqual(len(downstream), 6)
        for binding in downstream:
            self.assertTrue(
                binding["role"].startswith("Downstream handler"),
                f"{binding['repoPath']}:{binding['line']} must not be a hook point",
            )
        for binding in cue["event"]["bindings"]:
            self.assertIsInstance(binding.get("hookPoint"), bool)
        # No client.ts fallback wiring: the training next() transfers to
        # restart() after the match summary completes, so a client-level
        # "next->next, restart->restart" mapping would still double the cue.
        trigger = cue["event"]["trigger"]
        self.assertNotIn("If wiring must live", trigger)
        self.assertIn("match.summary.complete", trigger)
        training_next = next(
            binding
            for binding in downstream
            if binding["repoPath"] == "src/candidates/offline-training-v1/client.ts"
            and binding["symbol"] == "next()"
        )
        self.assertIn("restart()", training_next["role"])
        self.assertIn("match.summary.complete", training_next["role"])
        readme = README_PATH.read_text(encoding="utf-8")
        self.assertNotIn("If wiring must live", readme)
        self.assertIn("match.summary.complete", readme)

    def test_round_result_comes_from_simulation_not_ui_copy(self) -> None:
        manifest = read_manifest()
        for cue_id in ("round-win", "round-loss"):
            cue = next(row for row in manifest["cues"] if row["id"] == cue_id)
            event = cue["event"]
            self.assertIn("state.result.team", event["condition"])
            positive = json.dumps(event["bindings"])
            self.assertNotIn("menu-title", positive)
            self.assertNotIn("menu-description", positive)
            forbidden = " ".join(event["forbiddenSources"])
            self.assertIn("menu-title", forbidden)
            self.assertIn("menu-description", forbidden)
        win = next(row for row in manifest["cues"] if row["id"] == "round-win")
        loss = next(row for row in manifest["cues"] if row["id"] == "round-loss")
        self.assertIn("state.result.team === localPlayer.team", win["event"]["condition"])
        self.assertIn("state.result.team !== localPlayer.team", loss["event"]["condition"])


class DeterminismAndRevisionTests(unittest.TestCase):
    def test_default_build_reproduces_committed_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            result = run_generator("--out", temp)
            self.assertEqual(result.returncode, 0, result.stderr)
            for file_name in [*CUE_FILES.values(), "manifest.json"]:
                self.assertEqual(
                    (Path(temp) / file_name).read_bytes(),
                    (HERE / file_name).read_bytes(),
                    f"{file_name} is not reproducible",
                )

    def test_manifest_uses_lf_newlines(self) -> None:
        # The repository normalizes JSON to LF, so a Windows build must emit LF
        # too or the committed-file reproducibility test fails on a clean checkout.
        self.assertNotIn(b"\r\n", MANIFEST_PATH.read_bytes())
        with tempfile.TemporaryDirectory() as temp:
            result = run_generator("--out", temp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(b"\r\n", (Path(temp) / "manifest.json").read_bytes())

    def test_two_runs_are_byte_identical(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            for out in (first, second):
                result = run_generator("--out", out)
                self.assertEqual(result.returncode, 0, result.stderr)
            for file_name in [*CUE_FILES.values(), "manifest.json"]:
                self.assertEqual(
                    (Path(first) / file_name).read_bytes(),
                    (Path(second) / file_name).read_bytes(),
                )

    def test_minus_three_db_revision_changes_amplitude_only(self) -> None:
        with tempfile.TemporaryDirectory() as base_dir, tempfile.TemporaryDirectory() as revised_dir:
            base_run = run_generator("--out", base_dir, "--gain-db", "0")
            revised_run = run_generator("--out", revised_dir)
            self.assertEqual(base_run.returncode, 0, base_run.stderr)
            self.assertEqual(revised_run.returncode, 0, revised_run.stderr)

            base_manifest = json.loads((Path(base_dir) / "manifest.json").read_text())
            revised_manifest = json.loads((Path(revised_dir) / "manifest.json").read_text())
            self.assertEqual(base_manifest["levels"]["appliedGainDb"], 0.0)
            self.assertEqual(revised_manifest["levels"]["appliedGainDb"], -3.0)
            scale = generate.amp_from_db(-3.0)

            for cue_id, file_name in CUE_FILES.items():
                with self.subTest(cue=cue_id):
                    base = read_wav(Path(base_dir) / file_name)[3]
                    revised = read_wav(Path(revised_dir) / file_name)[3]
                    self.assertEqual(len(base), len(revised), "duration samples changed")
                    base_peak = max(abs(value) for value in base)
                    revised_peak = max(abs(value) for value in revised)
                    self.assertGreater(20.0 * math.log10(base_peak / 32767), -12.0)
                    self.assertLessEqual(20.0 * math.log10(revised_peak / 32767), -12.0)
                    self.assertLess(revised_peak, 32767)
                    for index, (before, after) in enumerate(zip(base, revised)):
                        expected = round(before * scale)
                        self.assertLessEqual(
                            abs(after - expected),
                            2,
                            f"{cue_id} sample {index} changed shape, not only gain",
                        )
                    self.assertLessEqual(
                        abs(zero_crossings(base) - zero_crossings(revised)),
                        5,
                        "quantization noise flipped more than a few near-zero samples",
                    )
                    base_energy = math.sqrt(sum(value * value for value in base))
                    revised_energy = math.sqrt(sum(value * value for value in revised))
                    correlation = sum(
                        before * after for before, after in zip(base, revised)
                    ) / (base_energy * revised_energy)
                    self.assertGreater(
                        correlation, 0.9999, "waveform shape changed beyond gain quantization"
                    )
                    base_cue = next(row for row in base_manifest["cues"] if row["id"] == cue_id)
                    revised_cue = next(
                        row for row in revised_manifest["cues"] if row["id"] == cue_id
                    )
                    self.assertEqual(base_cue["seed"], revised_cue["seed"])
                    self.assertEqual(base_cue["samples"], revised_cue["samples"])
                    self.assertEqual(base_cue["synthesisKind"], revised_cue["synthesisKind"])
                    self.assertEqual(base_cue["event"], revised_cue["event"])
                    self.assertEqual(base_cue["id"], revised_cue["id"])


class InvalidInputTests(unittest.TestCase):
    def assert_recipe_rejected(self, mutate) -> None:
        with self.assertRaises(generate.RecipeError):
            generate.validate_recipe(recipe_with(mutate))

    def test_rejects_missing_and_illegal_parameters(self) -> None:
        cases = {
            "missing sample rate": lambda r: r["format"].pop("sampleRate"),
            "wrong sample rate": lambda r: r["format"].__setitem__("sampleRate", 44100),
            "wrong sample format": lambda r: r["format"].__setitem__("sampleFormat", "PCM24"),
            "wrong edge envelope": lambda r: r["format"].__setitem__("edgeEnvelopeSeconds", 0.01),
            "missing seed": lambda r: r["cues"][0].pop("seed"),
            "zero seed": lambda r: r["cues"][0].__setitem__("seed", 0),
            "switch too long": lambda r: r["cues"][0].__setitem__("durationSeconds", 0.15),
            "menu too long": lambda r: r["cues"][1].__setitem__("durationSeconds", 0.11),
            "win too long": lambda r: r["cues"][2].__setitem__("durationSeconds", 0.51),
            "unsafe file name": lambda r: r["cues"][0].__setitem__("file", "../escape.wav"),
            "unsafe binding path": lambda r: r["cues"][0]["event"]["bindings"][0].__setitem__(
                "repoPath", "../src/input/controls.ts"
            ),
            "missing event binding": lambda r: r["cues"][0]["event"].__setitem__("bindings", []),
            "illegal frequency": lambda r: r["cues"][2]["synthesis"]["notes"][0].__setitem__(
                "frequencyHz", 30000.0
            ),
            "nan frequency": lambda r: r["cues"][2]["synthesis"]["notes"][0].__setitem__(
                "frequencyHz", float("nan")
            ),
            "win not ascending": lambda r: r["cues"][2]["synthesis"]["notes"][0].__setitem__(
                "frequencyHz", 900.0
            ),
            "loss not descending": lambda r: r["cues"][3]["synthesis"]["notes"][0].__setitem__(
                "frequencyHz", 200.0
            ),
            "wrong revision gain": lambda r: r["revision"].__setitem__("appliedGainDb", -2.0),
            "ceiling too high": lambda r: r["levels"].__setitem__("peakCeilingDbfs", -9.0),
            "missing priority protection": lambda r: r["priorityIntent"].__setitem__(
                "gunfireAndThreatPriority", ["reload"]
            ),
            "duping combat audio": lambda r: r["cues"][1]["futurePriority"].__setitem__(
                "duckCombat", True
            ),
            "duplicate cue id": lambda r: r["cues"][1].__setitem__("id", "weapon-switch"),
            "round condition reads UI": lambda r: r["cues"][2]["event"].__setitem__(
                "condition", "menu-title says won"
            ),
        }
        for name, mutate in cases.items():
            with self.subTest(case=name):
                self.assert_recipe_rejected(mutate)

    def test_missing_recipe_file_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(generate.RecipeError):
                generate.load_recipe(Path(temp) / "missing.json")

    def test_invalid_json_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "broken.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(generate.RecipeError):
                generate.load_recipe(path)

    def test_cli_rejects_bad_gain_and_bad_recipe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            for gain in ("1", "nan", "-61"):
                with self.subTest(gain=gain):
                    result = run_generator("--out", temp, "--gain-db", gain)
                    self.assertEqual(result.returncode, 2)
                    self.assertIn("error:", result.stderr)
            missing = Path(temp) / "missing.json"
            result = run_generator("--recipe", str(missing), "--out", temp)
            self.assertEqual(result.returncode, 2)
            self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
