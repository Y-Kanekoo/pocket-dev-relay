"""Autonomous self-improvement loop (the orchestrator).

Each generation:
  1. spawn a population of mutant genomes from the current champion;
  2. evaluate every mutant head-to-head vs the champion (self-play, seats
     alternated) over a batch of games;
  3. promote the best mutant if it beats the champion by a significant margin;
  4. measure the champion against a fixed gauntlet (random / search) for an
     absolute progress signal and persist everything to the registry.

It runs fully offline against the mock engine and uses no external API -- the
entire loop is deterministic given a seed, so a run is reproducible and can be
left to grind autonomously within a normal session. Swap ``engine`` for the
real cabt adapter and the same loop tunes against real matches.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from ..agents.heuristic import HeuristicAgent, Weights
from ..agents.random_agent import RandomAgent
from ..agents.search import SearchAgent
from ..engine.base import EngineAdapter
from ..eval.arena import evaluate
from ..eval.gauntlet import run_gauntlet
from .mutate import mutate
from .registry import Registry


@dataclass
class ImproveConfig:
    generations: int = 10
    population: int = 6
    games_vs_champion: int = 40
    gauntlet_games: int = 30
    promote_threshold: float = 0.53   # winrate vs champion needed to promote
    mutation_scale: float = 0.25
    max_turns: int = 200
    seed: int = 12345


def _gauntlet_panel() -> Dict[str, Callable]:
    return {
        "random": lambda: RandomAgent(seed=7),
        "search": lambda: SearchAgent(seed=7),
    }


def improve(
    engine: EngineAdapter,
    decks: List[List[int]],
    config: ImproveConfig = None,
    registry_path: str = "leaderboard.json",
    start: Optional[Weights] = None,
    log: Callable[[str], None] = print,
) -> Tuple[Weights, Registry]:
    config = config or ImproveConfig()
    rng = random.Random(config.seed)
    reg = Registry(registry_path)

    champion = start or (Weights.from_dict(reg.champion) if reg.champion else Weights())
    panel = _gauntlet_panel()

    def measure(champ: Weights, base_seed: int):
        return run_gauntlet(engine, HeuristicAgent(champ, seed=1), panel, decks,
                            games=config.gauntlet_games, base_seed=base_seed,
                            max_turns=config.max_turns)

    g0 = measure(champion, base_seed=900000)
    reg.set_champion(champion.to_dict(), g0.winrates)
    log(f"[gen 0] champion {g0}")

    for gen in range(1, config.generations + 1):
        best_cand: Optional[Weights] = None
        best_wr = -1.0
        for _ in range(config.population):
            cand = mutate(champion, rng, scale=config.mutation_scale)
            stats = evaluate(
                engine, HeuristicAgent(cand, seed=2), HeuristicAgent(champion, seed=3),
                decks, games=config.games_vs_champion,
                base_seed=10000 + gen * 1000, max_turns=config.max_turns,
            )
            if stats.winrate_a > best_wr:
                best_wr, best_cand = stats.winrate_a, cand

        promoted = best_wr >= config.promote_threshold
        if promoted:
            champion = best_cand

        gaunt = measure(champion, base_seed=900000 + gen * 777)
        reg.set_champion(champion.to_dict(), gaunt.winrates)
        reg.log_generation({
            "gen": gen,
            "best_winrate_vs_champion": round(best_wr, 4),
            "promoted": promoted,
            "gauntlet": {k: round(v, 4) for k, v in gaunt.winrates.items()},
            "gauntlet_mean": round(gaunt.mean_winrate, 4),
        })
        reg.save()
        flag = "PROMOTE" if promoted else "  keep "
        log(f"[gen {gen}] {flag} best_vs_champ={best_wr:.3f} | {gaunt}")

    reg.save()
    return champion, reg
