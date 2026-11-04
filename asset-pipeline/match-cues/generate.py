#!/usr/bin/env python3
"""Build the four editable match-cue sources for the training match.

Deterministic, standard-library-only synthesis. No samples, recordings, model
output, network, clock, random module, audio device, browser or GPU are used.
The WAV files and manifest are derived from recipe.json and this script.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import wave
from pathlib import Path
from typing import Any, Sequence

HERE = Path(__file__).resolve().parent
DEFAULT_RECIPE = HERE / "recipe.json"

REQUIRED_CUE_IDS = (
    "weapon-switch",
    "menu-confirm",
    "round-win",
    "round-loss",
)
DURATION_LIMITS = {
    "weapon-switch": 0.14,
    "menu-confirm": 0.10,
    "round-win": 0.50,
    "round-loss": 0.50,
}
EXPECTED_SAMPLE_RATE = 48000
EXPECTED_EDGE_SECONDS = 0.005
EXPECTED_PEAK_CEILING_DBFS = -12.0
EXPECTED_REVISION_GAIN_DB = -3.0
INT16_MAX = 32767


class RecipeError(ValueError):
    """The recipe is missing a parameter, illegal, or outside the batch contract."""


def amp_from_db(value: float) -> float:
    return 10.0 ** (value / 20.0)


def dbfs_from_peak(peak: int) -> float:
    return 20.0 * math.log10(max(peak, 1) / INT16_MAX)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RecipeError(message)


def _finite_number(value: Any, path: str) -> float:
    _require(
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value)),
        f"{path} must be a finite number",
    )
    return float(value)


def _number(
    mapping: dict[str, Any],
    key: str,
    path: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    _require(isinstance(mapping, dict), f"{path} must be an object")
    _require(key in mapping, f"{path}.{key} is required")
    value = _finite_number(mapping[key], f"{path}.{key}")
    if minimum is not None:
        _require(value >= minimum, f"{path}.{key} must be >= {minimum}")
    if maximum is not None:
        _require(value <= maximum, f"{path}.{key} must be <= {maximum}")
    return value


def _walk_numbers(value: Any, path: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            _walk_numbers(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_numbers(child, f"{path}[{index}]")
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        _require(math.isfinite(float(value)), f"{path} must not be NaN or infinite")


def _validate_bindings(event: Any, path: str) -> None:
    _require(isinstance(event, dict), f"{path} must be an object")
    trigger = event.get("trigger")
    _require(isinstance(trigger, str) and trigger.strip(), f"{path}.trigger is required")
    bindings = event.get("bindings")
    _require(isinstance(bindings, list) and bindings, f"{path}.bindings must be non-empty")
    for index, binding in enumerate(bindings):
        binding_path = f"{path}.bindings[{index}]"
        _require(isinstance(binding, dict), f"{binding_path} must be an object")
        repo_path = binding.get("repoPath")
        _require(isinstance(repo_path, str) and repo_path, f"{binding_path}.repoPath is required")
        candidate = Path(repo_path)
        _require(
            not candidate.is_absolute()
            and ".." not in candidate.parts
            and repo_path.replace("\\", "/").startswith("src/"),
            f"{binding_path}.repoPath must be a relative src/ path",
        )
        line = binding.get("line")
        _require(
            isinstance(line, int) and not isinstance(line, bool) and line > 0,
            f"{binding_path}.line must be a positive integer",
        )
        for field in ("symbol", "role"):
            text = binding.get(field)
            _require(
                isinstance(text, str) and text.strip(),
                f"{binding_path}.{field} is required",
            )
        if "hookPoint" in binding:
            _require(
                isinstance(binding["hookPoint"], bool),
                f"{binding_path}.hookPoint must be a boolean",
            )
    forbidden = event.get("forbiddenSources")
    _require(
        isinstance(forbidden, list) and all(isinstance(item, str) for item in forbidden),
        f"{path}.forbiddenSources must be a string list",
    )


def _validate_switch_synthesis(synthesis: dict[str, Any], path: str) -> None:
    _require(synthesis.get("kind") == "mechanical-switch", f"{path}.kind is unknown")
    _number(synthesis, "clickDecaySeconds", path, 0.0001, 0.05)
    _number(synthesis, "clickGain", path, 0.0, 1.0)
    _number(synthesis, "bodyStartHz", path, 20.0, EXPECTED_SAMPLE_RATE / 2)
    _number(synthesis, "bodySweepHzPerSecond", path)
    _number(synthesis, "bodyDecaySeconds", path, 0.0001, 0.2)
    _number(synthesis, "bodyGain", path, 0.0, 1.0)
    _number(synthesis, "latchStartSeconds", path, 0.0, 0.13)
    _number(synthesis, "latchDecaySeconds", path, 0.0001, 0.05)
    _number(synthesis, "latchGain", path, 0.0, 1.0)
    _number(synthesis, "latchToneHz", path, 20.0, EXPECTED_SAMPLE_RATE / 2)
    _number(synthesis, "latchToneDecaySeconds", path, 0.0001, 0.1)
    _number(synthesis, "latchToneGain", path, 0.0, 1.0)
    _number(synthesis, "springDecaySeconds", path, 0.0001, 0.2)
    _number(synthesis, "springGain", path, 0.0, 1.0)


def _validate_menu_synthesis(synthesis: dict[str, Any], path: str) -> None:
    _require(synthesis.get("kind") == "menu-pulse", f"{path}.kind is unknown")
    _number(synthesis, "pulseHz", path, 20.0, EXPECTED_SAMPLE_RATE / 2)
    _number(synthesis, "pulseDecaySeconds", path, 0.0001, 0.2)
    _number(synthesis, "pulseGain", path, 0.0, 1.0)
    _number(synthesis, "harmonicRatio", path, 1.0, 8.0)
    _number(synthesis, "harmonicGain", path, 0.0, 1.0)


def _validate_two_tone_synthesis(
    synthesis: dict[str, Any], path: str, duration: float, cue_id: str
) -> None:
    _require(synthesis.get("kind") == "two-tone", f"{path}.kind is unknown")
    notes = synthesis.get("notes")
    _require(isinstance(notes, list) and len(notes) == 2, f"{path}.notes must contain two tones")
    frequencies: list[float] = []
    for index, note in enumerate(notes):
        note_path = f"{path}.notes[{index}]"
        _require(isinstance(note, dict), f"{note_path} must be an object")
        start = _number(note, "startSeconds", note_path, 0.0, duration)
        length = _number(note, "lengthSeconds", note_path, 0.001, duration)
        _require(start + length <= duration + 1e-9, f"{note_path} exceeds the cue duration")
        frequency = _number(note, "frequencyHz", note_path, 20.0, EXPECTED_SAMPLE_RATE / 2)
        frequencies.append(frequency)
        _number(note, "decaySeconds", note_path, 0.0001, 0.5)
        _number(note, "gain", note_path, 0.0, 1.0)
        _number(note, "harmonicRatio", note_path, 1.0, 8.0)
        _number(note, "harmonicGain", note_path, 0.0, 1.0)
    if cue_id == "round-win":
        _require(frequencies[0] < frequencies[1], f"{path} must ascend for round-win")
    elif cue_id == "round-loss":
        _require(frequencies[0] > frequencies[1], f"{path} must descend for round-loss")


def validate_recipe(recipe: Any) -> dict[str, Any]:
    """Return the recipe after checking the fixed batch contract.

    Missing keys, illegal frequencies, wrong sample formats, durations outside
    the cue limits, duplicate IDs and unsafe file names are all rejected.
    """
    _require(isinstance(recipe, dict), "recipe must be a JSON object")
    _walk_numbers(recipe, "recipe")
    _require(recipe.get("schemaVersion") == 1, "recipe.schemaVersion must be 1")

    fmt = recipe.get("format")
    _require(isinstance(fmt, dict), "recipe.format is required")
    _require(fmt.get("sampleRate") == EXPECTED_SAMPLE_RATE, "format.sampleRate must be 48000")
    _require(fmt.get("channels") == 1, "format.channels must be 1")
    _require(fmt.get("sampleFormat") == "PCM16", "format.sampleFormat must be PCM16")
    edge = _finite_number(fmt.get("edgeEnvelopeSeconds"), "format.edgeEnvelopeSeconds")
    _require(abs(edge - EXPECTED_EDGE_SECONDS) < 1e-12, "format.edgeEnvelopeSeconds must be 0.005")

    levels = recipe.get("levels")
    _require(isinstance(levels, dict), "recipe.levels is required")
    first_peak = _number(levels, "firstPassPeakDbfs", "levels")
    ceiling = _number(levels, "peakCeilingDbfs", "levels")
    revision_gain = _number(levels, "revisionGainDb", "levels")
    _require(ceiling == EXPECTED_PEAK_CEILING_DBFS, "levels.peakCeilingDbfs must be -12")
    _require(
        abs(revision_gain - EXPECTED_REVISION_GAIN_DB) < 1e-9,
        "levels.revisionGainDb must be -3",
    )
    _require(
        first_peak > ceiling,
        "levels.firstPassPeakDbfs must sit above the final ceiling before revision",
    )

    revision = recipe.get("revision")
    _require(isinstance(revision, dict), "recipe.revision is required")
    applied = _number(revision, "appliedGainDb", "revision")
    _require(
        abs(applied - EXPECTED_REVISION_GAIN_DB) < 1e-9,
        "revision.appliedGainDb must be -3",
    )
    _require(revision.get("kind") == "amplitude-only", "revision.kind must be amplitude-only")
    preserves = revision.get("preserves")
    _require(
        isinstance(preserves, list)
        and {"eventId", "durationSamples", "seed", "waveformShape"} <= set(preserves),
        "revision.preserves must keep eventId, durationSamples, seed and waveformShape",
    )

    priority = recipe.get("priorityIntent")
    _require(isinstance(priority, dict), "recipe.priorityIntent is required")
    protected = priority.get("gunfireAndThreatPriority")
    _require(
        isinstance(protected, list)
        and "shot" in protected
        and any(item in protected for item in ("reload", "step", "plant")),
        "priorityIntent.gunfireAndThreatPriority must protect gunfire and threats",
    )

    cues = recipe.get("cues")
    _require(isinstance(cues, list), "recipe.cues must be a list")
    ids = [cue.get("id") for cue in cues if isinstance(cue, dict)]
    _require(len(cues) == len(REQUIRED_CUE_IDS), "recipe.cues must contain exactly four cues")
    _require(set(ids) == set(REQUIRED_CUE_IDS), "recipe.cues must use the four fixed IDs")
    _require(len(ids) == len(set(ids)), "recipe.cues must not repeat an ID")

    for index, cue in enumerate(cues):
        path = f"cues[{index}]"
        _require(isinstance(cue, dict), f"{path} must be an object")
        cue_id = cue.get("id")
        _require(cue_id in REQUIRED_CUE_IDS, f"{path}.id is not a fixed cue ID")
        file_name = cue.get("file")
        _require(
            isinstance(file_name, str)
            and Path(file_name).name == file_name
            and file_name == f"{cue_id}.wav",
            f"{path}.file must be the bare name {cue_id}.wav",
        )
        duration = _number(cue, "durationSeconds", path, 0.001, None)
        _require(
            duration <= DURATION_LIMITS[cue_id],
            f"{path}.durationSeconds exceeds the {cue_id} limit",
        )
        requested_max = _number(cue, "maxDurationSeconds", path, 0.001, None)
        _require(
            requested_max <= DURATION_LIMITS[cue_id],
            f"{path}.maxDurationSeconds exceeds the {cue_id} limit",
        )
        _require(duration <= requested_max, f"{path}.durationSeconds exceeds maxDurationSeconds")
        seed = cue.get("seed")
        _require(
            isinstance(seed, int) and not isinstance(seed, bool) and 0 < seed < 2**32,
            f"{path}.seed must be a 32-bit nonzero integer",
        )
        character = cue.get("character")
        _require(isinstance(character, str) and character.strip(), f"{path}.character is required")
        synthesis = cue.get("synthesis")
        _require(isinstance(synthesis, dict), f"{path}.synthesis is required")
        kind = synthesis.get("kind")
        if kind == "mechanical-switch":
            _validate_switch_synthesis(synthesis, f"{path}.synthesis")
        elif kind == "menu-pulse":
            _validate_menu_synthesis(synthesis, f"{path}.synthesis")
        elif kind == "two-tone":
            _validate_two_tone_synthesis(synthesis, f"{path}.synthesis", duration, cue_id)
        else:
            raise RecipeError(f"{path}.synthesis.kind is unknown")
        _validate_bindings(cue.get("event"), f"{path}.event")
        priority_intent = cue.get("futurePriority")
        _require(isinstance(priority_intent, dict), f"{path}.futurePriority is required")
        _require(
            priority_intent.get("duckCombat") is False,
            f"{path}.futurePriority must not duck combat audio",
        )
        _require(
            "shot" in (priority_intent.get("below") or []),
            f"{path}.futurePriority.below must rank below gunfire",
        )
        condition = cue["event"].get("condition")
        if cue_id in ("round-win", "round-loss"):
            _require(
                isinstance(condition, str) and "state.result.team" in condition,
                f"{path}.event.condition must read state.result.team",
            )
    return recipe


def load_recipe(path: Path) -> dict[str, Any]:
    _require(path.is_file(), f"recipe file not found: {path}")
    try:
        recipe = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RecipeError(f"recipe is not valid JSON: {error}") from error
    return validate_recipe(recipe)


def _xorshift32(count: int, seed: int) -> list[float]:
    state = seed & 0xFFFFFFFF or 0x9E3779B9
    values: list[float] = []
    for _ in range(count):
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        values.append((state / 0xFFFFFFFF) * 2.0 - 1.0)
    return values


def _one_pole(values: Sequence[float], coefficient: float) -> list[float]:
    low = 0.0
    output: list[float] = []
    for value in values:
        low += coefficient * (value - low)
        output.append(low)
    return output


def _edge_envelope(count: int, fade_samples: int) -> list[float]:
    _require(fade_samples * 2 < count, "cue is too short for a 5 ms attack and release")
    envelope = [1.0] * count
    for index in range(fade_samples):
        ramp = index / (fade_samples - 1) if fade_samples > 1 else 1.0
        envelope[index] = min(envelope[index], ramp)
        mirror = count - 1 - index
        envelope[mirror] = min(envelope[mirror], ramp)
    return envelope


def _mechanical_switch(
    count: int, seed: int, synthesis: dict[str, Any], rate: int
) -> list[float]:
    noise = _xorshift32(count, seed)
    fast = _one_pole(noise, 0.18)
    slow = _one_pole(noise, 0.02)
    click_decay = _number(synthesis, "clickDecaySeconds", "synthesis")
    click_gain = _number(synthesis, "clickGain", "synthesis")
    body_hz = _number(synthesis, "bodyStartHz", "synthesis")
    body_sweep = _number(synthesis, "bodySweepHzPerSecond", "synthesis")
    body_decay = _number(synthesis, "bodyDecaySeconds", "synthesis")
    body_gain = _number(synthesis, "bodyGain", "synthesis")
    latch_start = _number(synthesis, "latchStartSeconds", "synthesis")
    latch_decay = _number(synthesis, "latchDecaySeconds", "synthesis")
    latch_gain = _number(synthesis, "latchGain", "synthesis")
    latch_tone_hz = _number(synthesis, "latchToneHz", "synthesis")
    latch_tone_decay = _number(synthesis, "latchToneDecaySeconds", "synthesis")
    latch_tone_gain = _number(synthesis, "latchToneGain", "synthesis")
    spring_decay = _number(synthesis, "springDecaySeconds", "synthesis")
    spring_gain = _number(synthesis, "springGain", "synthesis")

    output: list[float] = []
    for index in range(count):
        time = index / rate
        high = noise[index] - fast[index]
        band = fast[index] - slow[index]
        click = high * math.exp(-time / click_decay) * click_gain
        body_phase = 2.0 * math.pi * (body_hz * time + 0.5 * body_sweep * time * time)
        body = math.sin(body_phase) * math.exp(-time / body_decay) * body_gain
        latch = 0.0
        latch_time = time - latch_start
        if latch_time > 0.0:
            latch_attack = min(1.0, latch_time / EXPECTED_EDGE_SECONDS)
            latch = (
                band * math.exp(-latch_time / latch_decay) * latch_gain
                + math.sin(2.0 * math.pi * latch_tone_hz * latch_time)
                * math.exp(-latch_time / latch_tone_decay)
                * latch_tone_gain
            ) * latch_attack
        spring = fast[index] * math.exp(-time / spring_decay) * spring_gain
        output.append(click + body + latch + spring)
    return output


def _menu_pulse(
    count: int, seed: int, synthesis: dict[str, Any], rate: int
) -> list[float]:
    del seed  # The single pulse has no noise; the seed stays for batch identity.
    pulse_hz = _number(synthesis, "pulseHz", "synthesis")
    decay = _number(synthesis, "pulseDecaySeconds", "synthesis")
    gain = _number(synthesis, "pulseGain", "synthesis")
    harmonic_ratio = _number(synthesis, "harmonicRatio", "synthesis")
    harmonic_gain = _number(synthesis, "harmonicGain", "synthesis")
    output: list[float] = []
    for index in range(count):
        time = index / rate
        envelope = math.exp(-time / decay)
        value = (
            math.sin(2.0 * math.pi * pulse_hz * time)
            + harmonic_gain * math.sin(2.0 * math.pi * pulse_hz * harmonic_ratio * time)
        ) * envelope
        output.append(value * gain)
    return output


def _two_tone(count: int, synthesis: dict[str, Any], rate: int) -> list[float]:
    notes = synthesis.get("notes")
    _require(isinstance(notes, list), "two-tone notes are required")
    output = [0.0] * count
    for note in notes:
        start_sample = round(_number(note, "startSeconds", "note") * rate)
        length_samples = round(_number(note, "lengthSeconds", "note") * rate)
        frequency = _number(note, "frequencyHz", "note")
        decay = _number(note, "decaySeconds", "note")
        gain = _number(note, "gain", "note")
        harmonic_ratio = _number(note, "harmonicRatio", "note")
        harmonic_gain = _number(note, "harmonicGain", "note")
        _require(length_samples > 1, "note length must contain at least two samples")
        for offset in range(length_samples):
            index = start_sample + offset
            if index >= count:
                break
            time = offset / rate
            attack = min(1.0, time / EXPECTED_EDGE_SECONDS)
            release = min(1.0, (length_samples - offset) / (EXPECTED_EDGE_SECONDS * rate))
            envelope = attack * release * math.exp(-time / decay)
            value = (
                math.sin(2.0 * math.pi * frequency * time)
                + harmonic_gain
                * math.sin(2.0 * math.pi * frequency * harmonic_ratio * time)
            )
            output[index] += value * envelope * gain
    return output


def synthesize_cue(spec: dict[str, Any], rate: int) -> list[float]:
    count = round(float(spec["durationSeconds"]) * rate)
    seed = int(spec["seed"])
    synthesis = spec["synthesis"]
    kind = synthesis["kind"]
    if kind == "mechanical-switch":
        samples = _mechanical_switch(count, seed, synthesis, rate)
    elif kind == "menu-pulse":
        samples = _menu_pulse(count, seed, synthesis, rate)
    elif kind == "two-tone":
        samples = _two_tone(count, synthesis, rate)
    else:  # pragma: no cover - validate_recipe rejects unknown kinds first
        raise RecipeError(f"unknown synthesis kind: {kind}")
    envelope = _edge_envelope(count, round(EXPECTED_EDGE_SECONDS * rate))
    return [sample * envelope[index] for index, sample in enumerate(samples)]


def _normalize_peak(samples: Sequence[float], peak_dbfs: float) -> list[float]:
    peak = max(abs(sample) for sample in samples)
    _require(peak > 0.0, "synthesis produced silence")
    target = amp_from_db(peak_dbfs)
    return [sample * target / peak for sample in samples]


def _quantize(samples: Sequence[float], target_peak_dbfs: float) -> list[int]:
    ceiling = max(1, math.floor(INT16_MAX * amp_from_db(target_peak_dbfs)))
    integers = [
        max(-INT16_MAX, min(INT16_MAX, round(sample * INT16_MAX))) for sample in samples
    ]
    peak = max(abs(value) for value in integers)
    if peak > ceiling:
        scale = ceiling / peak
        integers = [
            max(-ceiling, min(ceiling, round(value * scale))) for value in integers
        ]
    return integers


def _write_wav(path: Path, samples: Sequence[int], rate: int) -> bytes:
    payload = struct.pack(f"<{len(samples)}h", *samples)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        handle.writeframes(payload)
    return path.read_bytes()


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _relative_generator_path() -> str:
    return f"asset-pipeline/{HERE.name}/generate.py"


def _relative_recipe_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(HERE.parent.parent).as_posix()
    except ValueError:
        return f"asset-pipeline/{HERE.name}/{path.name}"


def build(recipe: dict[str, Any], out_dir: Path, gain_db: float, recipe_path: Path) -> dict[str, Any]:
    _require(math.isfinite(gain_db), "--gain-db must be finite")
    _require(-60.0 <= gain_db <= 0.0, "--gain-db must be in [-60, 0] dB")
    fmt = recipe["format"]
    levels = recipe["levels"]
    rate = int(fmt["sampleRate"])
    first_peak = float(levels["firstPassPeakDbfs"])
    target_peak = first_peak + gain_db
    out_dir.mkdir(parents=True, exist_ok=True)

    cue_rows: list[dict[str, Any]] = []
    for spec in recipe["cues"]:
        cue_id = spec["id"]
        duration = float(spec["durationSeconds"])
        samples = _normalize_peak(synthesize_cue(spec, rate), first_peak)
        samples = [sample * amp_from_db(gain_db) for sample in samples]
        integers = _quantize(samples, target_peak)
        peak = max(abs(value) for value in integers)
        rms = math.sqrt(sum(value * value for value in integers) / len(integers))
        wav_path = out_dir / spec["file"]
        _write_wav(wav_path, integers, rate)
        cue_rows.append(
            {
                "id": cue_id,
                "file": spec["file"],
                "sha256": _sha256(wav_path),
                "samples": len(integers),
                "durationSeconds": round(len(integers) / rate, 6),
                "sampleRate": rate,
                "channels": 1,
                "sampleFormat": "PCM16",
                "peakDbfs": round(dbfs_from_peak(peak), 4),
                "rmsDbfs": round(20.0 * math.log10(max(rms, 1.0) / INT16_MAX), 4),
                "seed": spec["seed"],
                "synthesisKind": spec["synthesis"]["kind"],
                "character": spec["character"],
                "event": spec["event"],
                "futurePriority": spec["futurePriority"],
            }
        )

    manifest = {
        "schemaVersion": 1,
        "batchId": recipe["batchId"],
        "baseRef": recipe["baseRef"],
        "license": recipe["license"],
        "origin": recipe["origin"],
        "scope": (
            "Source-only listening candidates. Nothing in this directory is wired "
            "to the game runtime, audio graph, HUD, simulation or build."
        ),
        "generator": {
            "path": _relative_generator_path(),
            "sha256": _sha256(Path(__file__).resolve()),
        },
        "recipe": {
            "path": _relative_recipe_path(recipe_path),
            "sha256": _sha256(recipe_path),
        },
        "format": {
            "sampleRate": rate,
            "channels": 1,
            "sampleFormat": "PCM16",
            "edgeEnvelopeSeconds": EXPECTED_EDGE_SECONDS,
        },
        "levels": {
            "firstPassPeakDbfs": first_peak,
            "appliedGainDb": gain_db,
            "nominalFinalPeakDbfs": round(first_peak + gain_db, 4),
            "peakCeilingDbfs": EXPECTED_PEAK_CEILING_DBFS,
            "revision": recipe["revision"],
        },
        "runtimeWired": False,
        "priorityIntent": recipe["priorityIntent"],
        "cues": cue_rows,
    }
    manifest_path = out_dir / "manifest.json"
    # Pin the newline so a Windows checkout produces the same LF bytes as the
    # committed file (the repository normalizes JSON to LF), keeping the
    # default-build reproducibility test valid on every platform.
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the four deterministic match-cue WAV sources and manifest."
    )
    parser.add_argument("--recipe", type=Path, default=DEFAULT_RECIPE)
    parser.add_argument("--out", type=Path, default=HERE)
    parser.add_argument(
        "--gain-db",
        type=float,
        default=None,
        help="Whole-batch gain override for revision checks; default comes from recipe.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        recipe = load_recipe(args.recipe)
        gain_db = (
            float(recipe["revision"]["appliedGainDb"])
            if args.gain_db is None
            else args.gain_db
        )
        manifest = build(recipe, args.out, gain_db, args.recipe)
    except RecipeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "manifest": "manifest.json",
                "cues": [row["id"] for row in manifest["cues"]],
                "appliedGainDb": manifest["levels"]["appliedGainDb"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
