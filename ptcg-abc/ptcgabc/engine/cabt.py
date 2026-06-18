"""Adapter for the real cabt engine (drop-in for the mock engine).

This is the seam where you plug the official engine once you've accepted the
Kaggle competition rules and downloaded the cabt package + card list. It is NOT
exercised in the offline sandbox (cabt is not on PyPI and Kaggle is unreachable),
so it imports lazily and fails with a clear message if cabt is absent.

Two things must be completed when you have cabt:

1. ``_normalize_observation`` -- translate cabt's native observation into the
   normalized schema (schema.py). The agents are written against the normalized
   schema, so this translation is the ONLY engine-specific code they need.
2. ``_denormalize_action`` -- usually the identity (cabt actions are already a
   list of option indices), kept explicit for symmetry.

Reference usage from the cabt docs:

    from kaggle_environments import make
    env = make("cabt", configuration={"decks": [deck, deck]})
    env.run([agent, agent])
    env.render(mode="html")
"""

from __future__ import annotations

from typing import List

from ..schema import Observation
from .base import Agent, MatchResult


class CabtAdapter:
    name = "cabt"

    def __init__(self):
        try:
            from kaggle_environments import make  # noqa: F401
        except Exception as exc:  # pragma: no cover - depends on external pkg
            raise RuntimeError(
                "kaggle-environments / cabt is not available in this environment. "
                "Install it from the Kaggle competition dataset, then use "
                "engine='cabt'. The offline harness uses engine='mock'."
            ) from exc

    # -- translation layer (complete when you have the real card schema) ----
    @staticmethod
    def _normalize_observation(raw: dict) -> Observation:  # pragma: no cover
        """Map cabt's native observation onto schema.py.

        cabt exposes ``raw["current"]`` (board state) and ``raw["select"]`` with
        ``option`` / ``maxCount``. Fill in the per-card decoding so options carry
        the same keys the agents expect (action verb, damage, cost, target...).
        """
        raise NotImplementedError(
            "Implement cabt -> normalized observation translation using the "
            "official card list once it is available."
        )

    @staticmethod
    def _denormalize_action(action: List[int]) -> List[int]:  # pragma: no cover
        return action

    def _wrap(self, agent: Agent):  # pragma: no cover
        def cabt_agent(observation, configuration):
            obs = self._normalize_observation(observation)
            return self._denormalize_action(agent(obs, configuration))
        return cabt_agent

    def play_match(self, agents, decks, seed: int = 0, max_turns: int = 200) -> MatchResult:  # pragma: no cover
        from kaggle_environments import make

        env = make("cabt", configuration={"decks": decks})
        wrapped = [self._wrap(a) for a in agents]
        env.run(wrapped)
        return self._read_result(env)

    @staticmethod
    def _read_result(env) -> MatchResult:  # pragma: no cover
        rewards = [s.reward for s in env.state]
        if rewards[0] == rewards[1]:
            winner = -1
        else:
            winner = 0 if rewards[0] > rewards[1] else 1
        return MatchResult(winner=winner, turns=len(env.steps), reason="cabt")
