import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import test from "node:test";
import { approveMemoScope } from "../modules/research/memo-scope.js";
import { approveResearchQuestion } from "../modules/research/research-question.js";
import { approveRequirements } from "../modules/assurance/requirements.js";
import { loadJsonArtifact } from "./assurance-io.js";
import { runPipeline, readPipelineStatus } from "./run-pipeline.js";
import { approveAndPublishMemo } from "./review-memo.js";
import { validateQuestionRelevanceRequest } from "../modules/relevance/question-relevance.js";
import { validateSynthesisBuildRequest } from "../modules/synthesis/request.js";
import { validateChallengeRequest } from "../modules/synthesis/challenge.js";

const allFiles = async (path: string): Promise<string[]> =>
  (
    await Promise.all(
      (await readdir(path, { withFileTypes: true })).map((entry) =>
        entry.isDirectory() ? allFiles(resolve(path, entry.name)) : [resolve(path, entry.name)]
      )
    )
  ).flat();

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

test("runPipeline executes the full automated pipeline from Gate 1 approval to ready-for-review and 1-click publication", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "run-pipeline-e2e-"));
  try {
    const runId = "analysis-2026-99";
    const runDir = resolve(root, runId);
    const approvedAt = "2026-03-15T09:00:00.000Z";
    const analystId = "FDIHR";
    const thesis = "Assess whether Russian-linked actors are escalating hybrid sabotage threats against Polish rail logistics.";

    // Gate 1a: Approved Memo Scope
    const scope = approveMemoScope(
      {
        id: "scope-99",
        runId,
        version: 1,
        status: "proposed",
        purpose: { value: "Assess hybrid sabotage indicators in Poland.", origin: "human" },
        researchThesis: { value: thesis, origin: "human" },
        threatTopic: { value: "Hybrid sabotage", origin: "human" },
        audience: { value: "Security Operations Leadership", origin: "human" },
        geographies: { value: ["Poland", "Russia"], origin: "human" },
        timeWindow: {
          value: { from: "2026-03-01T00:00:00.000Z", to: "2026-03-20T23:59:59.999Z" },
          origin: "human"
        },
        requestedOutput: { value: "memo", origin: "human" }
      },
      analystId,
      approvedAt
    );
    assert.ok(scope.ok);
    const scopePath = resolve(runDir, "memo-scopes", "scope-99", "v1", "approved-memo-scope.json");
    await mkdir(dirname(scopePath), { recursive: true });
    await writeFile(scopePath, `${JSON.stringify(scope.value, null, 2)}\n`, "utf8");
    const scopeArtifact = await loadJsonArtifact(scopePath);

    // Gate 1b: Approved Research Question
    const question = approveResearchQuestion(
      {
        id: "rq-99",
        runId,
        scopeVersion: 1,
        researchThesis: thesis,
        status: "proposed",
        question: "What credible evidence indicates Russian-linked hybrid sabotage threats against Polish rail infrastructure in March 2026?",
        rationale: "Focus on verified alerts and corroborated reporting.",
        geographies: ["Poland", "Russia"],
        timeWindow: scope.value.timeWindow.value
      },
      { ...scope.value, ...scopeArtifact.binding },
      analystId,
      approvedAt
    );
    assert.ok(question.ok);
    const questionPath = resolve(runDir, "research-questions", "rq-99", "approved-research-question.json");
    await mkdir(dirname(questionPath), { recursive: true });
    await writeFile(questionPath, `${JSON.stringify(question.value, null, 2)}\n`, "utf8");
    const questionArtifact = await loadJsonArtifact(questionPath);

    // Gate 1c: Approved Information Requirements
    const proposalPath = resolve(runDir, "requirements", "proposal-99.json");
    await mkdir(dirname(proposalPath), { recursive: true });
    const proposal = {
      proposalId: "req-prop-99",
      questionId: question.value.id,
      runId,
      requirements: [
        { irId: "ir-01", text: "Have Polish or allied authorities issued sabotage readiness alerts?" },
        { irId: "ir-02", text: "Have confirmed physical rail attacks been attributed?" }
      ]
    };
    await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    const proposalArtifact = await loadJsonArtifact(proposalPath);
    const approvedReq = approveRequirements({
      proposalValue: proposal,
      proposalArtifactRef: proposalArtifact.binding.artifactRef,
      proposalArtifactSha256: proposalArtifact.binding.artifactSha256,
      researchQuestionValue: { ...question.value, ...questionArtifact.binding },
      reviewerId: analystId,
      approvedAt
    });
    assert.ok(approvedReq.ok, approvedReq.ok ? "" : approvedReq.error);
    const reqPath = resolve(runDir, "requirements", approvedReq.value.proposalId, "approved-requirements.json");
    await mkdir(dirname(reqPath), { recursive: true });
    await writeFile(reqPath, `${JSON.stringify(approvedReq.value, null, 2)}\n`, "utf8");

    // Gate 1d: Proposed Seerist Discovery Plan (searching both analysis and news)
    const discoveryPlanPath = resolve(runDir, "proposals", `${runId}-dp-01.json`);
    await mkdir(dirname(discoveryPlanPath), { recursive: true });
    await writeFile(
      discoveryPlanPath,
      `${JSON.stringify(
        {
          id: `${runId}-dp-01`,
          runId,
          researchQuestionId: question.value.id,
          provider: "seerist",
          endpoint: "/v1/wod",
          queries: [
            { id: "sabotage-analysis", search: "Poland rail sabotage", sources: "analysis" },
            { id: "sabotage-news", search: "Poland rail sabotage", sources: "news" }
          ],
          rankingTerms: ["Poland", "rail", "sabotage", "Russian", "patrols"],
          pageSize: 20,
          maxPagesPerQuery: 1,
          maxApiCalls: 2,
          maxResults: 20,
          minimumScore: 1
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    // Stage models config
    await writeFile(
      resolve(root, ".copilot-settings.json"),
      `${JSON.stringify(
        {
          model: "model-default",
          stages: {
            relevance: { provider: "github-copilot-sdk", model: "model-relevance" },
            extract: { provider: "github-copilot-sdk", model: "model-extract" },
            build: { provider: "github-copilot-sdk", model: "model-build" },
            challenge: { provider: "github-copilot-sdk", model: "model-challenge" },
            "key-judgements": { provider: "github-copilot-sdk", model: "model-selection" },
            "memo-writer": { provider: "github-copilot-sdk", model: "model-writer" }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const seeristAnalysisText =
      "Polish security services raised rail infrastructure readiness after intelligence warnings of Russian hybrid sabotage probes.\n\nNo confirmed derailment or physical attack has been reported during the alert window.";
    const reutersUrl = "https://www.reuters.com/world/europe/poland-rail-alert-2026-03-12";
    const paywallUrl = "https://www.ft.com/content/paywalled-sabotage-brief";
    const borderlineUrl = "https://www.bbc.com/news/europe-general-rail-budget";

    const mockSeeristFetch: typeof fetch = async () =>
      Response.json({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              id: "seerist-ana-101",
              source: "analysis",
              "@timestamp": "2026-03-11T10:00:00.000Z",
              title: "Poland raises rail sabotage readiness following hybrid threat warnings",
              summary: "Polish security services increased rail protection.",
              body: seeristAnalysisText
            }
          },
          {
            type: "Feature",
            properties: {
              id: "seerist-news-201",
              source: "news",
              "@timestamp": "2026-03-12T14:00:00.000Z",
              title: "Reuters: Polish police deploy extra patrols along eastern rail logistics hubs",
              summary: "Polish authorities warned of Russian sabotage risks to rail hubs.",
              link: reutersUrl
            }
          },
          {
            type: "Feature",
            properties: {
              id: "seerist-news-202",
              source: "news",
              "@timestamp": "2026-03-12T15:00:00.000Z",
              title: "FT: Hybrid threat briefing in Warsaw",
              summary: "Briefing on Russian sabotage posture in Poland.",
              link: paywallUrl
            }
          },
          {
            type: "Feature",
            properties: {
              id: "seerist-news-203",
              source: "news",
              "@timestamp": "2026-03-13T08:00:00.000Z",
              title: "BBC: Polish rail maintenance budget discussion in Warsaw",
              summary: "General rail infrastructure commentary in Poland.",
              link: borderlineUrl
            }
          }
        ]
      });

    const mockArticleFetch = async (url: string, requestedAt: string) => {
      const receivedAt = new Date().toISOString();
      if (url === paywallUrl) {
        return {
          raw: Buffer.from("<html><body>Subscribe to read</body></html>", "utf8"),
          response: {
            requestedAt,
            receivedAt,
            finalUrl: url,
            redirects: [],
            httpStatus: 403,
            mediaType: "text/html",
            etag: null,
            lastModified: null
          }
        };
      }
      if (url === reutersUrl) {
        const html = `<!doctype html><html><head>
          <title>Polish police deploy extra patrols along eastern rail hubs</title>
          <meta property="article:published_time" content="2026-03-12T14:00:00.000Z" />
        </head><body><article>
          <h1>Polish police deploy extra patrols along eastern rail hubs</h1>
          <p>Polish police deployed heightened patrols around rail logistics hubs on March 12 after warnings of Russian-linked sabotage plots targeting cross-border transport infrastructure in eastern regions.</p>
          <p>Officials stated that no physical rail attack had been confirmed as of Thursday, while counterintelligence services continued coordinating protective inspections across switching yards, freight depots, and signalling substations.</p>
          <p>Interior Ministry representatives emphasized that elevated patrol posture across eastern rail corridors would remain active throughout the March readiness window while allied intelligence sharing continues.</p>
        </article></body></html>`;
        return {
          raw: Buffer.from(html, "utf8"),
          response: {
            requestedAt,
            receivedAt,
            finalUrl: url,
            redirects: [],
            httpStatus: 200,
            mediaType: "text/html",
            etag: null,
            lastModified: null
          }
        };
      }
      const html = `<!doctype html><html><head>
        <title>Polish rail maintenance budget discussion</title>
        <meta property="article:published_time" content="2026-03-13T08:00:00.000Z" />
      </head><body><article>
        <h1>Polish rail maintenance budget discussion</h1>
        <p>Lawmakers debated annual rail maintenance allocations for eastern corridors without citing specific sabotage incidents during Thursday's parliamentary infrastructure committee hearing in Warsaw.</p>
        <p>Transport planners reviewed multi-year track renewal schedules, regional commuter rolling stock upgrades, and freight terminal electrification targets scheduled through late 2027 across eastern provinces.</p>
        <p>Committee members deferred final capital expenditure votes until municipal engineering cost estimates and regional rail operator procurement plans are submitted next quarter.</p>
      </article></body></html>`;
      return {
        raw: Buffer.from(html, "utf8"),
        response: {
          requestedAt,
          receivedAt,
          finalUrl: url,
          redirects: [],
          httpStatus: 200,
          mediaType: "text/html",
          etag: null,
          lastModified: null
        }
      };
    };

    let firstSourceExtractAttempt = 0;

    const runModel = async (input: unknown) => {
      assert.ok(typeof input === "object" && input !== null && "action" in input);
      const call = input as { action: string; model?: string; prompt?: unknown };
      if (call.action === "models") {
        return {
          models: [
            { id: "model-default" },
            { id: "model-relevance" },
            { id: "model-extract" },
            { id: "model-build" },
            { id: "model-challenge" },
            { id: "model-selection" },
            { id: "model-writer" }
          ]
        };
      }

      const startedAt = new Date().toISOString();
      const completedAt = new Date(Date.now() + 5).toISOString();
      const files = await allFiles(runDir);

      if (call.model === "model-relevance") {
        const reqFiles = files.filter((f) => basename(f) === "question-relevance-request.json");
        const loaded = await Promise.all(reqFiles.map(readJson));
        const match = loaded
          .sort((a, b) => Date.parse(b.preparedAt) - Date.parse(a.preparedAt))
          .find((r) => validateQuestionRelevanceRequest(r).ok);
        assert.ok(match, "Expected persisted relevance request");
        const text = String(match.sourceDocument.normalizedText);
        const isBorderline = text.includes("annual rail maintenance allocations");
        const seg =
          match.sourceDocument.segments.find((s: { kind: string }) => s.kind === "paragraph") ??
          match.sourceDocument.segments[0];
        const quote = String(seg.text).slice(0, Math.min(48, String(seg.text).length));
        const proposal = {
          verdict: isBorderline ? "partially-relevant" : "relevant",
          rationale: isBorderline
            ? "Discusses rail corridors generally without addressing sabotage indicators."
            : "Directly reports Polish readiness measures for Russian-linked rail sabotage warnings.",
          support: [
            {
              segment: seg.id,
              quote,
              relationToQuestion: "Addresses Polish rail readiness."
            }
          ],
          limitations: ["Automated relevance screening requires downstream extraction verification."]
        };
        return {
          invocationId: `rel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify(proposal)
        };
      }

      if (call.model === "model-extract") {
        const reqFiles = files.filter((f) => basename(f) === "extract-request.json");
        const loaded = await Promise.all(reqFiles.map(readJson));
        const match = loaded.find((r) => JSON.stringify(r.prompt) === JSON.stringify(call.prompt));
        assert.ok(match, "Expected persisted extract request");
        firstSourceExtractAttempt += 1;
        // Intentionally fail byte-anchor check on very first attempt to prove automatic 2-attempt self-repair!
        if (firstSourceExtractAttempt === 1) {
          return {
            invocationId: "ext-bad-1",
            provider: "github-copilot-sdk",
            model: call.model,
            startedAt,
            completedAt,
            freshSession: true,
            content: JSON.stringify({
              observations: [
                {
                  segment: "01",
                  quote: "Non-existent paraphrased quote that fails byte check.",
                  text: "Paraphrased statement.",
                  claimKind: "event",
                  attribution: { kind: "direct" },
                  irIds: ["ir-01"]
                }
              ],
              dispositions: [
                { irId: "ir-01", disposition: "covered" },
                { irId: "ir-02", disposition: "silent" }
              ]
            })
          };
        }

        const sourceDoc = await readJson(resolve(match.lineage.sourceDocument.artifactRef));
        const paragraphs = sourceDoc.segments.filter((s: { kind: string }) => s.kind === "paragraph");
        const seg1 = paragraphs[0] ?? sourceDoc.segments[0];
        const seg2 = paragraphs[1];
        const q1 = String(seg1.text).slice(0, Math.min(140, String(seg1.text).length)).trim();
        const q2 = seg2 ? String(seg2.text).slice(0, Math.min(140, String(seg2.text).length)).trim() : "";
        const observations = [
          {
            segment: String(seg1.ordinal + 1).padStart(2, "0"),
            quote: q1,
            text: q1,
            claimKind: "event",
            attribution: { kind: "direct" },
            irIds: ["ir-01"]
          },
          ...(seg2 && q2.length >= 20
            ? [
                {
                  segment: String(seg2.ordinal + 1).padStart(2, "0"),
                  quote: q2,
                  text: q2,
                  claimKind: "statement",
                  attribution: { kind: "attributed", attributedTo: "Polish officials" },
                  irIds: ["ir-02"]
                }
              ]
            : [])
        ];
        const hasIr2 = observations.some((o) => o.irIds.includes("ir-02"));
        return {
          invocationId: `ext-ok-${firstSourceExtractAttempt}`,
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify({
            observations,
            dispositions: [
              { irId: "ir-01", disposition: "covered" },
              { irId: "ir-02", disposition: hasIr2 ? "covered" : "silent" }
            ]
          })
        };
      }

      if (call.model === "model-build") {
        const reqFiles = files.filter((f) => f.endsWith("build-request.json"));
        const loaded = await Promise.all(reqFiles.map(readJson));
        const match = loaded.find((r) => JSON.stringify(r.prompt) === JSON.stringify(call.prompt));
        const parsed = validateSynthesisBuildRequest(match);
        assert.ok(parsed.ok);
        const eventAliases = parsed.value.observations
          .filter((o) => o.claimKind === "event")
          .map((o) => o.alias);
        const stmtAliases = parsed.value.observations
          .filter((o) => o.claimKind === "statement")
          .map((o) => o.alias);
        const proposal = {
          claims: [
            {
              statement:
                "Polish security forces and police increased rail infrastructure patrols and readiness following warnings of Russian-linked sabotage plots.",
              kind: "reported-fact",
              supportAliases: eventAliases,
              confidence: {
                level: "low",
                rationale: "Corroborated across Seerist analysis and Reuters reporting; source credibility is unassessed."
              }
            },
            {
              statement: "Polish officials stated that no physical rail attack has been confirmed during the current alert window.",
              kind: "statement",
              attributedTo: "Polish officials",
              supportAliases: stmtAliases.length ? stmtAliases : [eventAliases[0]!],
              confidence: {
                level: "low",
                rationale: "Attributed official statement within an active alert window."
              }
            }
          ]
        };
        return {
          invocationId: "synth-build-1",
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify(proposal)
        };
      }

      if (call.model === "model-challenge") {
        const reqFiles = files.filter((f) => f.endsWith("challenge-request.json"));
        const loaded = await Promise.all(reqFiles.map(readJson));
        const match = loaded.find((r) => JSON.stringify(r.prompt) === JSON.stringify(call.prompt));
        const parsed = validateChallengeRequest(match);
        assert.ok(parsed.ok);
        // Raise a real adversarial challenge on the second claim to verify contested claims surface without blocking!
        const proposal = {
          claims: parsed.value.claims.map((claim, claimIdx) => ({
            claim: claim.claimAlias,
            checks: parsed.value.checklist.map((check, checkIdx) =>
              claimIdx === 1 && checkIdx === 0
                ? {
                    item: check.check,
                    result: "challenge",
                    rationale: "Absence of public confirmation may reflect operational security during ongoing patrols.",
                    aliases: [claim.citedObservations[0]!.alias]
                  }
                : { item: check.check, result: "none" }
            )
          }))
        };
        return {
          invocationId: "synth-challenge-1",
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify(proposal)
        };
      }

      if (call.model === "model-selection") {
        const reqFiles = files.filter((f) => basename(f) === "key-judgement-request.json");
        const loaded = await Promise.all(reqFiles.map(readJson));
        const match = loaded.find((r) => JSON.stringify(r.prompt) === JSON.stringify(call.prompt));
        assert.ok(match);
        const selections = Object.entries(match.eligibility.eligibleAliasesByRequirement)
          .filter(([, aliases]) => Array.isArray(aliases) && aliases.length > 0)
          .map(([requirementId, aliases], idx) => ({
            requirementId,
            claim: (aliases as string[])[idx % (aliases as string[]).length]!,
            judgementText:
              idx === 0
                ? "Polish authorities elevated rail protection posture in response to Russian-linked sabotage warnings."
                : "No physical rail sabotage incident has been publicly confirmed during the current alert window."
          }));
        return {
          invocationId: "memo-selection-1",
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify({ selections, omissions: [] })
        };
      }

      if (call.model === "model-writer") {
        return {
          invocationId: "memo-writer-1",
          provider: "github-copilot-sdk",
          model: call.model,
          startedAt,
          completedAt,
          freshSession: true,
          content: JSON.stringify({ statements: [] })
        };
      }

      throw new Error(`Unexpected model call: ${String(call.model)}`);
    };

    const status = await runPipeline(root, runId, {
      analystId,
      maxExternalArticles: 6,
      effects: {
        seeristApiKey: "test-seerist-key",
        fetchSeerist: mockSeeristFetch,
        fetchArticle: mockArticleFetch,
        runModel: runModel as never
      }
    });

    assert.equal(status.state, "memo-review", status.error ?? "expected memo-review");
    assert.equal(status.currentStage, "complete");
    assert.ok(status.memoId, "Memo ID should be populated");
    assert.equal(status.counts.seeristAnalysisFound, 1);
    assert.equal(status.counts.externalArticlesCaptured, 2); // Reuters + BBC captured; FT 403 skipped
    assert.equal(status.counts.sourcesAdmitted, 2); // Seerist analysis + Reuters relevant; BBC gap-logged
    assert.equal(status.counts.sourcesAssured, 2);
    assert.ok(status.counts.observationsExtracted >= 3);
    assert.equal(status.counts.claimsBuilt, 2);
    assert.equal(status.counts.contestedClaims, 1);
    assert.ok(firstSourceExtractAttempt >= 3, "First source retried after intentional Attempt 1 anchor failure");

    // Verify source statuses in live status payload
    const statuses = status.sources.map((s) => s.status);
    assert.equal(statuses.filter((s) => s === "assured").length, 2);
    assert.ok(statuses.includes("fetch-skipped"));
    assert.ok(statuses.includes("gap-logged"));

    const persisted = await readPipelineStatus(root, runId);
    assert.equal(persisted?.state, "memo-review");

    // Gate 2: One-click human review & publish (no 5-quote quiz, contested caveat preserved!)
    const published = await approveAndPublishMemo(root, runId, status.memoId!, analystId);
    assert.equal(published.publishedBy, analystId);
    const pubRecord = await readJson(resolve(published.path));
    assert.equal(pubRecord.publicationStatus, "published");
    assert.equal(pubRecord.publishedBy, analystId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
