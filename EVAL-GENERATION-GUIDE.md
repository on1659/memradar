# AI Role Evaluation Sample Generation Guide

## Overview

This guide explains how to generate the 109 synthetic evaluation samples for validating the Phase 1/2 AI role classification improvements.

## Files

- `scripts/generate-eval-samples.mts` — Generates samples using Haiku model
- `scripts/eval-role-samples.mts` — Evaluates samples against `analyzeUsageTopCategories`
- `docs/AI-ROLE-EVAL-SAMPLES-SPEC.md` — Full specification for sample generation
- `tests/fixtures/role-eval-samples/` — Output directory for generated samples

## Running Generation

### Prerequisites

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### Generate All Samples

```bash
npx tsx scripts/generate-eval-samples.mts
```

This will:
- Generate 72 pure samples (9 categories × 8 each)
- Generate 20 mixed samples (realistic feature combinations)
- Generate 8 ambiguous samples (multiple acceptable roles)
- Generate 9 consistency samples (3 scenarios × 3 reruns each)
- Total: **109 samples**
- Duration: ~10-20 minutes (109 Haiku API calls)
- Cost: ~$0.50-1.00 (estimated)

All samples are saved to `tests/fixtures/role-eval-samples/` in JSON format:
- Format: `sample-{id}-{intendedRole}.json`
- Example: `sample-001-feature.json`, `sample-consistency-pure-feature-scenario-run1.json`

## Running Evaluation

Once samples are generated:

```bash
npx tsx scripts/eval-role-samples.mts
```

This will:
1. Load all samples from `tests/fixtures/role-eval-samples/`
2. Run each sample through `analyzeUsageTopCategories`
3. Compute accuracy metrics
4. Generate confusion matrix
5. Save detailed results to `docs/AI-ROLE-EVAL-RESULTS.md`

## Output Metrics

The evaluation produces:

| Metric | Meaning |
|---|---|
| 정확도 (Accuracy) | % of samples where predicted role ∈ acceptableRoles |
| By Category | Accuracy broken down by pure/mixed/ambiguous |
| By Difficulty | Accuracy broken down by easy/normal/hard |
| 혼합 역할 정확도 | For mixed samples, % where prediction matches one of acceptable roles |
| Confusion Matrix | Which roles are confused with each other |

## Sample Generation Behavior

### Signal Distribution (by difficulty)

**Easy (25%)**
- Strong phrase signals appear 1-2 times
- Strong tokens appear 4-6 times
- Tools clearly aligned with category

**Normal (50%)**
- Phrase signals: 0-1 times
- Tokens mixed (strong + weak)
- Some tools off-category

**Hard (25%)**
- Intent revealed in 1-2 messages only
- Rest is general coding chat
- Negative keywords mixed in
- Tools often misaligned

### Talk Style

All samples mix 4 registers:
- 격식 (formal): "이 함수의 동작 방식을 설명해주시겠어요?"
- 평어체 (casual): "이 함수 뭐하는 건지 알려줘"
- 한 줄 지시 (one-liner): "고쳐"
- 생각 나열 (thinking): "아 이거 때문이네 그럼..."

### Message Constraints

- Length: 50-400 messages per sample
- Distribution: 25 short (50-100), 50 medium (100-250), 25 long (250-400)
- Max consecutive user messages: 3
- Max consecutive assistant messages: 2
- Tools per message: 0-5 (typically 1-2)

## Interpreting Results

### Good Indicators (>80% accuracy)

- Phase 1/2 scoring logic is sound
- Keyword dictionary is well-tuned
- Word boundary matching preventing false positives

### Areas to Investigate (40-70% accuracy)

- Check confusion matrix for systematic confusions
- Example: if feature ↔ review confusion high, review keywords might be too weak
- Difficulty breakdown shows where logic breaks down

### Red Flags (<40% accuracy)

- Dictionary needs major overhaul
- Keyword stuffing in samples (not Haiku's fault, spec issue)
- Tool hint weighting imbalanced

## Next Steps (After Generation)

1. **Tuning Phase 1/2**
   - If accuracy <80%, adjust signal weights in `CATEGORY_DATA`
   - Re-test with `eval-role-samples.mts`

2. **Phase 3 Analysis** (future)
   - Use consistency sub-batch to measure classification stability
   - Evaluate `analyzeUsageRoles()` mixed role detection

3. **Real Data Validation**
   - Compare synthetic vs. actual session distribution
   - Check if improvements hold on real user data

## Cost Estimate

- Haiku input: ~22k tokens (109 samples × ~200 msgs avg)
- Haiku output: ~15k tokens (JSON + conversations)
- Est. cost: $0.01 per 1M input tokens + $0.05 per 1M output tokens
- **Total: ~$0.30-0.50**

Samples are cached in `tests/fixtures/role-eval-samples/` and `.gitignore`d, so you only generate once.

## Troubleshooting

**"Authentication failed"**
- Ensure `ANTHROPIC_API_KEY` is set: `echo $ANTHROPIC_API_KEY`

**"Failed after 3 retries"**
- Haiku occasionally fails validation (JSON schema / role alternation)
- Script auto-retries; eventual 100% generation is normal (some samples may fail)

**Evaluation shows 0% accuracy**
- Check if samples are in the correct directory
- Verify sample JSON schema (must have `intendedRole`, `acceptableRoles`, `messages`)

## Files Generated

```
tests/fixtures/role-eval-samples/
  ├── sample-001-feature.json
  ├── sample-002-feature.json
  ├── ...
  ├── sample-100-test.json
  └── sample-consistency-*.json

docs/
  └── AI-ROLE-EVAL-RESULTS.md  (generated after eval)
```

---

For full spec details, see [AI-ROLE-EVAL-SAMPLES-SPEC.md](./docs/AI-ROLE-EVAL-SAMPLES-SPEC.md).
