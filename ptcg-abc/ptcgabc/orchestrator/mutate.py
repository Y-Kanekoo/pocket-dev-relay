"""Genetic operators over the heuristic Weights genome."""

from __future__ import annotations

import random
from dataclasses import fields

from ..agents.heuristic import Weights


def mutate(parent: Weights, rng: random.Random, scale: float = 0.25,
           prob: float = 0.5) -> Weights:
    """Gaussian perturbation of a random subset of weights.

    ``scale`` is relative to the magnitude of each weight (plus a small floor so
    weights near zero can still move). ``prob`` is the per-gene mutation chance.
    """
    d = parent.to_dict()
    for f in fields(Weights):
        if rng.random() < prob:
            base = abs(d[f.name])
            sigma = scale * base + 0.5
            d[f.name] = d[f.name] + rng.gauss(0.0, sigma)
    return Weights.from_dict(d)


def crossover(a: Weights, b: Weights, rng: random.Random) -> Weights:
    """Uniform crossover of two genomes."""
    da, db = a.to_dict(), b.to_dict()
    child = {k: (da[k] if rng.random() < 0.5 else db[k]) for k in da}
    return Weights.from_dict(child)
