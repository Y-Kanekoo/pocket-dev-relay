"""Tunable rule-based heuristic agent -- the primary, submittable policy.

It scores every available Option with a weighted linear evaluation and picks the
best (random tie-break). The weights are the genome that the evolutionary
orchestrator mutates and selects on. Because it depends only on the normalized
observation, the very same policy is what gets packaged for submission.
"""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass, fields
from typing import Dict, List

from ..schema import (
    ATTACH_ENERGY,
    ATTACK,
    CHOOSE_ACTIVE,
    END_TURN,
    PLAY_BASIC,
    RETREAT,
    Action,
    Observation,
)
from . import features
from .base import Agent, argmax_indices


@dataclass
class Weights:
    # attack
    attack_base: float = 10.0
    attack_damage: float = 1.0
    attack_ko: float = 40.0
    # attach energy
    attach_base: float = 4.0
    attach_enable_gain: float = 1.2     # per point of damage newly enabled
    attach_active_bonus: float = 3.0
    attach_bench_bonus: float = 0.5
    attach_overflow_penalty: float = 2.0  # attaching when active already maxed
    # develop
    play_basic_base: float = 3.0
    play_basic_empty_bench: float = 8.0
    # retreat
    retreat_base: float = -6.0
    retreat_when_stuck: float = 14.0    # active can't attack & has no energy path
    # tempo
    end_turn_base: float = 0.0
    # choose active (setup / promotion)
    choose_hp: float = 0.1
    choose_attack: float = 0.5
    choose_energy: float = 5.0

    def to_dict(self) -> Dict[str, float]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, float]) -> "Weights":
        known = {f.name for f in fields(cls)}
        return cls(**{k: float(v) for k, v in d.items() if k in known})


class HeuristicAgent(Agent):
    name = "heuristic"

    def __init__(self, weights: Weights = None, seed: int = 0):
        self.w = weights or Weights()
        self.rng = random.Random(seed)

    # -- scoring -----------------------------------------------------------
    def score(self, option: dict, current: dict) -> float:
        w = self.w
        you = current["you"]
        opp = current["opponent"]
        active = you["active"]
        verb = option["action"]

        if verb == END_TURN:
            return w.end_turn_base

        if verb == ATTACK:
            defender = opp["active"]
            eff = features.effective_damage(active, option["damage"], defender)
            ko = bool(defender) and eff >= defender["hp"]
            return w.attack_base + w.attack_damage * eff + (w.attack_ko if ko else 0.0)

        if verb == ATTACH_ENERGY:
            target_active = option["target"] == "active"
            if target_active and active:
                now = features.best_affordable_attack(active)
                after = features.best_attack_if_energy(active, 1)
                now_d = now["damage"] if now else 0
                after_d = after["damage"] if after else 0
                gain = max(0, after_d - now_d)
                maxed = after is not None and after_d == max(a["damage"] for a in active["attacks"])
                s = w.attach_base + w.attach_active_bonus + w.attach_enable_gain * gain
                if gain == 0 and maxed:
                    s -= w.attach_overflow_penalty
                return s
            return w.attach_base + w.attach_bench_bonus

        if verb == PLAY_BASIC:
            empty = len(you["bench"]) == 0
            return w.play_basic_base + (w.play_basic_empty_bench if empty else 0.0)

        if verb == RETREAT:
            stuck = bool(active) and features.best_affordable_attack(active) is None and active["energy"] == 0
            return w.retreat_base + (w.retreat_when_stuck if stuck else 0.0)

        if verb == CHOOSE_ACTIVE:
            return (w.choose_hp * option.get("hp", 0)
                    + w.choose_attack * option.get("max_attack", 0)
                    + w.choose_energy * option.get("energy", 0))

        return 0.0

    def act(self, observation: Observation, configuration: dict) -> Action:
        sel = observation["select"]
        opts = sel["option"]
        current = observation["current"]
        scores = [self.score(o, current) for o in opts]
        idx = argmax_indices(scores, self.rng)
        return [idx]
