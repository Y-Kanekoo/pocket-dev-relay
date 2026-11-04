import os

from ptcgabc import deck as deckmod
from ptcgabc.agents.heuristic import HeuristicAgent
from ptcgabc.agents.random_agent import RandomAgent
from ptcgabc.agents.search import SearchAgent
from ptcgabc.engine.mock import MockCabtEngine
from ptcgabc.eval.arena import evaluate

DECK = deckmod.load_deck(os.path.join(os.path.dirname(__file__), "..", "decks", "starter.csv"))
ENGINE = MockCabtEngine()


def test_heuristic_beats_random():
    stats = evaluate(ENGINE, HeuristicAgent(seed=1), RandomAgent(seed=2), [DECK, DECK], games=60)
    assert stats.winrate_a > 0.65, stats


def test_search_beats_random():
    stats = evaluate(ENGINE, SearchAgent(seed=1), RandomAgent(seed=2), [DECK, DECK], games=60)
    assert stats.winrate_a > 0.65, stats


def test_search_is_competitive_with_heuristic():
    # The search agent should at least hold its own against the default greedy.
    stats = evaluate(ENGINE, SearchAgent(seed=1), HeuristicAgent(seed=2), [DECK, DECK], games=60)
    assert stats.winrate_a >= 0.40, stats
