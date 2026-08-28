# Old PoC Readthrough Summary

Date: 2026-08-27
Scope: External PoC at Intelliegence Brief/poc/intelligence-brief-rsm
Purpose: Understand full legacy flow before designing clean rebuild.

## What the PoC is

A phase-driven intelligence brief pipeline with these main stages:

1. collect
2. analyze
3. prep
4. render

Core orchestration and file contracts are deterministic, while analysis and formatting steps rely on generated request files and human or LLM outputs.

## Strong parts worth reusing conceptually

1. Deterministic stage orchestration with explicit phase commands.
2. Manifest-first boundary before downstream processing.
3. Citation normalization and strict validation gates before render.
4. Transparency log generation for auditability.
5. Clear test intent around validator, renderer, and collectors.

## Complexity to avoid carrying over

1. Dual runtime pathways and legacy parallel dispatch patterns.
2. Prompt prose as hidden schema contract.
3. Heavy file handoff coupling between steps.
4. Brand or customer assumptions embedded in multiple layers.
5. Mixed mode behavior branching deep in pipeline.

## KISS interpretation for new app

Phase 1 should remain a minimal typed pipeline:

1. input record
2. deterministic route decision
3. ledger event
4. strict validation
5. one deterministic output artifact

No UI, no multi-provider orchestration, no notification subsystem, no legacy dispatcher parity in phase 1.

## Suggested migration order

1. Typed contracts and runtime validators.
2. Deterministic orchestrator CLI.
3. One source adapter.
4. Normalization and validation gates.
5. Renderer.
6. Transparency log derivation.

## Grill-me topics to decide

1. Which single phase-1 command is the source of truth for execution.
2. Which contracts are mandatory in phase 1 and which are deferred.
3. Which exact legacy behaviors are rejected by default.
4. What test gates block phase-2 expansion.
