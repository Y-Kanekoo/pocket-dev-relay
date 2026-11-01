# PTCGABC Strategy-Track Report — <Team Name>

> Submission template for the Strategy Category
> (`pokemon-tcg-ai-battle-challenge-strategy`). Scored on agent **stability**,
> **deck-design concept**, and **Simulation-track performance**. Keep it concrete
> and back claims with the harness's numbers (`leaderboard.json`, gauntlet runs).

## 1. Summary
- One paragraph: what the agent does and why it wins.
- Headline metrics: leaderboard rating, gauntlet win-rates, vs-random win-rate.

## 2. Deck design concept
- Deck list (60 cards) and the core game plan (aggro / control / combo).
- Type/weakness reasoning and energy curve.
- Why this deck suits an automated agent (consistency, low decision variance).

## 3. Agent architecture
- Policy: rule-based scoring + 1-ply value-based lookahead (see `agents/`).
- The decision model: how each `select` option is scored; key features
  (`features.board_value`: prize race, board presence, energy, active threat).
- Handling of imperfect information and randomness.

## 4. How it was tuned (autonomous improvement)
- The evolutionary loop (`orchestrator/improve.py`): population, generations,
  promotion margin, self-play protocol.
- Progress curve from `leaderboard.json` (paste the per-generation table).

## 5. Stability
- Illegal-action rate (target: 0 — enforced by submission validation).
- Per-decision time budget vs the 10-minute match cap.
- Variance of results across seeds / opponents.

## 6. Evaluation
- Gauntlet results vs the opponent panel.
- Ablations (greedy vs search; tuned vs default weights).

## 7. Limitations & future work
- Known weaknesses and what the next iteration would address.

## Appendix
- Reproduce: `python -m ptcgabc.cli improve ...`, seeds, config.
- Deck file and champion weights (`champion.json`).
