import os

from ptcgabc import deck as deckmod
from ptcgabc.agents.heuristic import HeuristicAgent, Weights
from ptcgabc.agents.random_agent import RandomAgent
from ptcgabc.engine.mock import MockCabtEngine
from ptcgabc.eval.arena import evaluate
from ptcgabc.eval.elo import ratings_from_results
from ptcgabc.orchestrator.improve import ImproveConfig, improve
from ptcgabc.orchestrator.mutate import mutate
from ptcgabc.submission.package import build_submission, validate_submission_file

DECK = deckmod.load_deck(os.path.join(os.path.dirname(__file__), "..", "decks", "starter.csv"))
ENGINE = MockCabtEngine()


def test_mutate_changes_genome_but_stays_valid():
    import random
    w = Weights()
    m = mutate(w, random.Random(0), scale=0.3)
    assert m.to_dict().keys() == w.to_dict().keys()
    assert m.to_dict() != w.to_dict()


def test_elo_orders_stronger_agent_higher():
    results = [("A", "B", 1.0)] * 8 + [("A", "B", 0.0)] * 2  # A wins 80%
    r = ratings_from_results(results)
    assert r["A"] > r["B"]


def test_improve_loop_runs_and_persists(tmp_path):
    out = tmp_path / "leaderboard.json"
    cfg = ImproveConfig(generations=3, population=4, games_vs_champion=20,
                        gauntlet_games=16, seed=1)
    champ, reg = improve(ENGINE, [DECK, DECK], cfg, registry_path=str(out),
                         log=lambda *_: None)
    assert out.exists()
    assert len(reg.generations) == 3
    assert reg.champion is not None
    # champion should still crush random
    stats = evaluate(ENGINE, HeuristicAgent(champ, seed=1), RandomAgent(seed=2), [DECK, DECK], games=40)
    assert stats.winrate_a > 0.6, stats


def test_build_and_validate_submission(tmp_path):
    agent_path = build_submission(Weights(), str(tmp_path), deck=DECK)
    assert os.path.exists(agent_path)
    assert os.path.exists(os.path.join(str(tmp_path), "deck.csv"))
    report = validate_submission_file(agent_path, [DECK, DECK], games=20)
    assert report["legal"]
    assert report["winrate_vs_random"] > 0.6, report
