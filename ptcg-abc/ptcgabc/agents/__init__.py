from .base import Agent
from .random_agent import RandomAgent
from .heuristic import HeuristicAgent, Weights
from .search import SearchAgent

AGENTS = {
    "random": RandomAgent,
    "heuristic": HeuristicAgent,
    "search": SearchAgent,
}

__all__ = ["Agent", "RandomAgent", "HeuristicAgent", "SearchAgent", "Weights", "AGENTS"]
