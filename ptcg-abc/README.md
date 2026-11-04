# PTCGABC Harness — Pokémon TCG AI Battle Challenge

An orchestrated, **self-improving** agent harness for the
[Pokémon Trading Card Game AI Battle Challenge](https://ptcg-abc.pokemon.co.jp/)
(ポケカ ABC / PTCGABC), the Kaggle contest run by The Pokémon Company with the
Matsuo Institute and HEROZ.

The contest has two linked tracks on Kaggle:

| Track | Kaggle slug | What you submit | Window (2026) |
|-------|-------------|-----------------|----------------|
| **Simulation** | [`pokemon-tcg-ai-battle`](https://www.kaggle.com/competitions/pokemon-tcg-ai-battle) | an agent that plays automated matches; ranked by a live rating leaderboard (≤5 submissions/day) | Jun 16 – Aug 17 |
| **Strategy** | [`pokemon-tcg-ai-battle-challenge-strategy`](https://www.kaggle.com/competitions/pokemon-tcg-ai-battle-challenge-strategy) | a report on the agent's strategy; scored on stability, deck design & sim performance (1 submission) | Jun 16 – Sep 14 |

Top 8 of the Strategy track advance to the in-person final in Tokyo (prizes
$30,000 each). Matches run on the **cabt engine**, a Pokémon-TCG simulator built
on `kaggle-environments`. An agent is the cabt signature:

```python
def agent(observation, configuration):
    sel = observation["select"]      # {"option": [...], "maxCount": N}
    return [chosen_index]            # indices into sel["option"]
```

## Why this harness is built the way it is

The real cabt engine and the official ~2,000-card list are gated behind Kaggle
(accept the rules, download the dataset) and can't be fetched from a sandbox. So
the harness is **engine-agnostic**: agents read a single normalized observation
schema, and engines plug in behind an adapter.

```
agents ──▶ normalized schema (schema.py) ◀── engine adapter
                                              ├─ MockCabtEngine   (bundled, offline, no deps)
                                              └─ CabtAdapter      (real engine; drop in on Kaggle)
```

- **`MockCabtEngine`** is a small, deterministic, imperfect-information card game
  with the *same* observation/action interface as cabt. It lets the whole
  pipeline — agents, evaluation, the self-improvement loop, submission packaging
  — run and be tested with **zero network and zero Kaggle access**.
- **`CabtAdapter`** (`engine/cabt.py`) is the seam for the real engine. When you
  have cabt, complete `_normalize_observation` (translate cabt's obs → the
  schema) and the agents/orchestrator work unchanged.

## Layout

```
ptcgabc/
  schema.py            normalized observation/action contract
  cards.py             mock card DB (types, HP, attacks, weakness)
  deck.py              deck load + validation (60 cards, cabt-style rules)
  engine/
    base.py            EngineAdapter protocol + MatchResult
    mock.py            MockCabtEngine — offline simulator
    cabt.py            real cabt adapter (drop-in; translation stubs)
  agents/
    random_agent.py    random baseline (= official sample)
    heuristic.py       tunable rule-based policy  ← the genome evolution tunes
    search.py          1-ply value-based lookahead (stronger; observation-only)
    features.py        shared board-evaluation helpers
  eval/
    arena.py           A-vs-B over N games, seats alternated
    elo.py             Elo proxy for the Kaggle rating
    gauntlet.py        candidate vs a fixed opponent panel
  orchestrator/
    mutate.py          genetic operators on the Weights genome
    improve.py         the autonomous self-improvement loop
    registry.py        leaderboard.json persistence
  submission/
    package.py         emit a self-contained Kaggle agent.py + validate it
  cli.py               command-line entry point
decks/                 starter.csv, aggro.csv (60-card card-ID lists)
config/improve.yaml    default loop settings
reports/               Strategy-track report template
tests/                 pytest suite (engine, agents, loop, submission)
```

## Quick start (offline, no dependencies beyond pytest)

```bash
cd ptcg-abc
python -m pytest                                  # 13 tests, all offline

# inspect / validate a deck
python -m ptcgabc.cli deck decks/starter.csv

# measure agents
python -m ptcgabc.cli eval heuristic random --games 200
python -m ptcgabc.cli eval search heuristic --games 200

# run the autonomous improvement loop → leaderboard.json + champion.json
python -m ptcgabc.cli improve --generations 20 --population 8 --games 60

# package the tuned champion as a Kaggle submission and validate it
python -m ptcgabc.cli submit --weights champion.json --out submission
```

Representative numbers on the mock engine (100 games):

| matchup | winrate |
|---------|---------|
| heuristic vs random | ~0.98 |
| search vs random | ~0.98 |
| search vs heuristic | ~0.73 |

## The autonomous improvement loop

`ptcgabc.cli improve` runs a fully offline, deterministic (seeded) evolutionary
loop — no external API, so it completes within a normal session and can be left
to grind:

1. spawn a population of mutant genomes from the current champion;
2. play each mutant head-to-head vs the champion (seats alternated);
3. promote the best mutant if it beats the champion past a margin;
4. score the champion against a fixed gauntlet (random / search) for an absolute
   progress signal, then persist everything to `leaderboard.json`.

Resume anytime: the loop reloads the champion from the registry.

## Taking it to the real competition

1. On Kaggle, accept the rules and pull cabt + the official card list.
2. Complete `engine/cabt.py::_normalize_observation` (cabt obs → schema) and
   `submission/package.py::normalize` (the same translation, inlined).
3. Replace `cards.py` lookups / `decks/*.csv` with real card IDs.
4. `--engine cabt` everywhere; tune with `improve`; submit the packaged agent.

## Roadmap

- Parameterize `features.board_value` by the `Weights` genome so the loop tunes
  the **search** policy, not just the greedy heuristic.
- Package the search policy as a submission (it is already observation-only, so
  it is portable as-is).
- Deck co-evolution: mutate deck lists alongside agent weights.
- Richer mock rules (status, evolutions, trainers) to harden policies before the
  real engine.
```
