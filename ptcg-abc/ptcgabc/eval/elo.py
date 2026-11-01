"""Minimal Elo, mirroring the spirit of Kaggle's leaderboard rating.

Kaggle's simulation leaderboard uses a TrueSkill-like rating updated from live
matches; locally we use plain Elo as a cheap, monotonic proxy to rank agent
variants during the improvement loop.
"""

from __future__ import annotations

from typing import Dict, Iterable, Tuple


def expected(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((r_b - r_a) / 400.0))


def elo_update(r_a: float, r_b: float, score_a: float, k: float = 24.0) -> Tuple[float, float]:
    e_a = expected(r_a, r_b)
    r_a2 = r_a + k * (score_a - e_a)
    r_b2 = r_b + k * ((1.0 - score_a) - (1.0 - e_a))
    return r_a2, r_b2


def ratings_from_results(
    results: Iterable[Tuple[str, str, float]],
    base: float = 1000.0,
    k: float = 24.0,
) -> Dict[str, float]:
    """results: iterable of (name_a, name_b, score_a in {0,0.5,1})."""
    ratings: Dict[str, float] = {}
    for a, b, s in results:
        ra = ratings.setdefault(a, base)
        rb = ratings.setdefault(b, base)
        ratings[a], ratings[b] = elo_update(ra, rb, s, k)
    return ratings
