# Regola: Analisi Fallimenti Test in CI — Sempre Log + Artefatti Completi

## Identificativo
`TEST-CI-001`

## Ambito
Tutti i test (Playwright E2E, PHPUnit Feature/Unit, Pest, qualsiasi suite) che falliscono **in CI (GitHub Actions, GitLab CI, qualunque runner remoto) oppure in locale**. Vale per Claude Code, Copilot, Gemini e ogni agente AI che debba diagnosticare un test rosso.

---

## Regola Fondamentale (INVIOLABILE)

**MAI proporre un fix per un test fallito basandosi solo sul log "summary" del job.** Prima di formulare ipotesi e prima di toccare codice, l'AI DEVE:

1. **Leggere il log del job fallito per intero** (non solo l'estratto di errore).
2. **Scaricare e ispezionare TUTTI gli artefatti** prodotti dal job (zip artifacts: trace, screenshot, video, HTML report, `claude-report.json`, `flakiness-history.jsonl`).
3. **Scaricare e ispezionare i log applicativi**: `storage/logs/laravel.log`, `storage/logs/horizon.log`, eventuali log di Mix/Vite/Webpack, log di Playwright (`test-results/`).
4. **Correlare** errore frontend (test) con errore backend (Laravel log) **e** silent failures (console/pageerror/requestfailed nel claude-report).
5. Solo dopo questa analisi formulare la diagnosi (`test_bug` / `app_bug` / `environment_bug` / `flaky`) e proporre un fix **preciso**.

Niente diagnosi "a vista" sul nome del test o sul messaggio dell'asserzione. Niente fix speculativi. Niente "riprova in CI a vedere se passa".

---

## Cosa Scaricare e Quando

### Quando il job CI è rosso (qualunque test suite)

Comando standard via `gh` CLI:

```bash
# 1. Identifica il run rosso
gh run list --workflow=playwright.yml --limit 5
# oppure per la PR corrente:
gh pr checks <PR-NUMBER> --watch=false

# 2. Scarica tutti gli artefatti del run
gh run download <RUN-ID> --dir ./_ci-debug/<RUN-ID>/

# 3. Salva il log COMPLETO del run (obbligatorio per TEST-CI-001 — non solo gli step falliti)
gh run view <RUN-ID> --log > ./_ci-debug/<RUN-ID>/job-full.log
# Facoltativo, per triage rapido sugli step rossi:
gh run view <RUN-ID> --log-failed > ./_ci-debug/<RUN-ID>/job-failed.log
```

`./_ci-debug/` è la cartella **gitignored** dove l'AI scarica gli artefatti per ispezione locale. Aggiungerla a `.gitignore` se mancante.

`gh run view --log-failed` è solo l'estratto degli step falliti. La regola richiede il log COMPLETO del run perché spesso la causa di un fail è in uno step precedente passato (setup DB, cache warmup, migrazione) o in warning/notice ignorabili in apparenza ma rilevanti.

### Cosa cercare negli artefatti Playwright

| File | Scopo | Cosa estrarre |
|------|-------|---------------|
| `claude-report.json` | Reporter strutturato della skill | `failures[].classification`, `silentErrors`, `perfBudgetViolations`, `frontendContractFindings`, `appliedPlaybook` |
| `playwright-report/index.html` | HTML report Playwright | Apri via `npx playwright show-report ./_ci-debug/.../playwright-report/` per vedere step + screenshot inline |
| `test-results/<test>-trace.zip` | Trace Playwright | `npx playwright show-trace <file>` — timeline DOM/network/console del test |
| `test-results/<test>-screenshot.png` | Screenshot al fallimento | Confronta con baseline atteso |
| `test-results/<test>-video.webm` | Video del test (se abilitato) | Visione runtime del fallimento |
| `flakiness-history.jsonl` | Storico flakiness | Verificare se il test è **già noto come flaky** prima di toccarlo |

### Cosa cercare nei log Laravel (sempre, quando il test tocca il backend)

L'errore frontend è spesso il sintomo, la causa è in `storage/logs/laravel.log`.

**Convenzione naming artefatto** (richiesta dalla regola):
- Job singolo (no matrix): artifact `laravel-logs`
- Job sharded (matrix): artifact `laravel-logs-shard-<N>` per ogni shard
- Pattern di download generico: `laravel-logs*`

`gh run download` crea una sottocartella per ogni artefatto e preserva la struttura interna delle path. Quindi i file Laravel finiscono in `<dir>/<artifact-name>/storage/logs/laravel.log`.

```bash
# Scarica TUTTI gli artefatti laravel-logs* (sia singolo job che sharded matrix)
gh run download <RUN-ID> --pattern "laravel-logs*" --dir ./_ci-debug/<RUN-ID>/laravel/

# Cerca exception/error nei log Laravel scaricati (qualunque path interno)
find ./_ci-debug/<RUN-ID>/laravel -type f -name 'laravel.log' -print0 \
  | xargs -0 grep -B 3 -A 30 "Exception\|ERROR\|CRITICAL"

# Filtra per finestra temporale del fallimento (oggi UTC)
find ./_ci-debug/<RUN-ID>/laravel -type f -name 'laravel.log' -print0 \
  | xargs -0 grep -B 5 -A 20 "$(date -u +%Y-%m-%d)"
```

Pattern frequenti:
- HTTP 500 sul frontend → quasi sempre stack trace PHP nel laravel.log
- Asserzione "elemento non visibile" → potrebbe essere causata da exception nel controller che fa abort
- Test "flaky" → spesso causato da race condition Horizon job (cercare in `horizon.log`)
- Login failure in test auth → controllare query `users` / `clienti` o middleware auth nel laravel.log

### Cosa cercare negli artefatti PHPUnit / Pest

| File | Scopo |
|------|-------|
| `tests/_output/` (Codeception) o `tests/Browser/screenshots/` (Dusk) | Screenshot di failure |
| `phpunit-junit.xml` / `phpunit.xml` | XML risultato — utile per estrazione automatica failure list |
| `coverage/` | Coverage HTML — utile a verificare se il test sta esercitando il codice giusto |
| `storage/logs/laravel.log` (testing) | Log dell'ambiente di test |

### Quando il test fallisce in LOCALE (no CI)

La regola vale anche per i test eseguiti in locale (Playwright, PHPUnit, Pest). Niente `gh run download`: gli artefatti sono **già sul filesystem**. Stesso principio: leggere log + tutti gli artefatti, non solo l'output del comando.

**Posizioni standard locali:**

| Cosa | Path locale |
|------|-------------|
| Log completo Playwright | output del comando `npx playwright test` (catturarlo con `> playwright.log 2>&1`) |
| HTML report Playwright | `playwright-report/` (apri con `npx playwright show-report`) |
| Trace + screenshot + video | `test-results/<test>/...` |
| `claude-report.json` | `test-results/claude-report.json` |
| `flakiness-history.jsonl` | `test-results/flakiness-history.jsonl` |
| Log Laravel | `storage/logs/laravel.log` (e `horizon.log` se Horizon in esecuzione) |
| JUnit XML PHPUnit/Pest | come configurato in `phpunit.xml` (tipicamente `tests/_output/` o `phpunit-junit.xml`) |

```bash
# Esempio Playwright in locale: cattura log completo + lascia gli artefatti dove sono
npx playwright test --grep="@critical" 2>&1 | tee ./_ci-debug/local/playwright.log

# Stesso check su laravel.log
grep -B 3 -A 30 "Exception\|ERROR\|CRITICAL" storage/logs/laravel.log
```

L'AI DEVE comunque leggere full log + claude-report + trace + laravel.log + correlazione, esattamente come per CI. Solo lo step "scarica artefatti" è sostituito da "leggi i file dal filesystem".

---

## Procedura Operativa Completa

Quando un test fallisce in CI o l'utente segnala "il test X è rosso":

### Step 1 — Identifica il run rosso

```bash
# Per PR corrente
gh pr checks <PR>
# oppure last run su un workflow
gh run list --workflow=playwright.yml --status=failure --limit 1
```

### Step 2 — Scarica TUTTI gli artefatti

```bash
mkdir -p ./_ci-debug/<RUN-ID>
gh run download <RUN-ID> --dir ./_ci-debug/<RUN-ID>/
gh run view <RUN-ID> --log > ./_ci-debug/<RUN-ID>/full-job.log
gh run view <RUN-ID> --log-failed > ./_ci-debug/<RUN-ID>/failed-steps.log
```

Se gli artefatti pesano troppo (>500MB), scaricare selettivamente per nome esatto o per pattern:

```bash
gh run download <RUN-ID> --name playwright-artifacts-shard-1
gh run download <RUN-ID> --pattern "laravel-logs*"   # cattura sia singolo job che sharded matrix
```

### Step 3 — Lettura strutturata

In ordine:

1. **`full-job.log`** → log completo del run, OBBLIGATORIO (TEST-CI-001 vieta di basarsi solo sul summary)
2. **`failed-steps.log`** → estratto degli step rossi per triage rapido
3. **`claude-report.json`** (Playwright) → classificazione e silentErrors
4. **HTML report** → step Playwright + screenshot inline
5. **Trace zip** → timeline DOM/network/console del test fallito
6. **`laravel-logs*/storage/logs/laravel.log`** → eccezioni backend nella finestra temporale del fallimento (path estratto: `gh` preserva la struttura interna dell'artefatto)
7. **`laravel-logs*/storage/logs/horizon.log`** se il test dispatcha jobs

### Step 4 — Correlazione (DEVE essere esplicita nel report)

Esempio di output corretto:

```
✓ Letto full-job.log + failed-steps.log (riga 1240): asserzione `expect(page.getByRole('button', {name: 'Procedi'})).toBeVisible()` fallita
✓ Letto claude-report.json: classification=test_bug? → ma silentErrors contiene 1 pageerror "Cannot read property 'cart' of undefined"
✓ Letto laravel-logs-shard-1/storage/logs/laravel.log (15:42:18): NoCartFoundException in CartController@show, stack trace su CartService:142
✓ Reclassification: app_bug, NON test_bug
✓ Causa root: il service throw quando session_id mancante; il test gira con cookie vuoti
✓ Fix preciso: gestire null session in CartService:142 (early return con cart vuoto)
```

### Step 5 — Solo ora, proporre il fix

Il fix DEVE indicare:
- File e riga esatta da modificare (con `file:line` per navigazione IDE)
- Snippet del codice corretto
- Eventuale aggiornamento del test (se test_bug)
- Se serve modifica app code in modalità Playwright → governance double-confirm (`fix-app-code=true`)

### Step 6 — Pulizia

Dopo aver applicato e validato il fix, ripulire `_ci-debug/`:

```bash
rm -rf ./_ci-debug/<RUN-ID>
```

Mantenere solo cartelle relative a run ancora aperti / in indagine.

---

## Anti-Pattern Vietati

| Anti-pattern | Perché è vietato | Cosa fare invece |
|--------------|------------------|------------------|
| Fix basato solo su nome test + messaggio errore | Diagnosi superficiale, fix probabilmente sbagliato | Step 1-5 sopra |
| "Riprova il workflow, magari era flaky" senza analisi | Brucia minuti CI e maschera bug reali | Scaricare artefatti, controllare `flakiness-history.jsonl` |
| Modificare il test per farlo passare senza capire la root cause | Trasforma `app_bug` in `test_bug` falso, peggiora la qualità | Classificare prima, fixare il livello giusto |
| Ignorare `silentErrors` nel claude-report | Console error / pageerror sono spesso la vera causa | Sempre includerli nella correlazione |
| Non scaricare il laravel.log | L'errore HTTP frontend è quasi sempre causato da una eccezione PHP | Sempre scaricarlo se il test tocca il backend |
| Lasciare `_ci-debug/` committato per errore | Inquina il repo con MB di artefatti | Verificare `.gitignore`, ripulire dopo l'uso |
| `--no-verify` su commit di fix CI | Skippa Pint/test pre-commit, lascia entrare codice non conforme | Mai usare; risolvere gli errori dei hook |

---

## Pre-Requisiti Workflow CI

Perché questa regola sia applicabile, i workflow CI devono caricare gli artefatti necessari. Se mancano, è una **gap del workflow** da correggere.

Checklist per ogni workflow di test:

- [ ] Upload artefatti Playwright (`playwright-report/`, `test-results/`) con `if: always()`
- [ ] Upload `test-results/claude-report.json` esplicito (anche se è dentro `test-results/`, esporlo facilita download)
- [ ] Upload `storage/logs/laravel.log` come artifact dedicato con `if: always()`. Naming: `laravel-logs` (job singolo) o `laravel-logs-shard-<N>` (matrix). Il prefisso `laravel-logs` è obbligatorio per consentire `gh run download --pattern "laravel-logs*"`.
- [ ] Upload `storage/logs/horizon.log` se il job avvia Horizon (incluso nello stesso artefatto `laravel-logs*`)
- [ ] Retention >= 14 giorni per debug a posteriori
- [ ] Nome artifact include shard / browser / project per non collidere

Template pronto: `.claude/skills/playwright-enterprise-tester/references/ci-github-actions-template.md`. Estendere il template per includere `laravel-logs` come artefatto separato.

---

## `.gitignore` Richiesto

Aggiungere (una volta) al `.gitignore` del repo:

```
# CI debug artifacts scaricati localmente per analisi fallimenti
_ci-debug/
```

In questo modo l'AI può scaricare zip pesanti senza rischiare di committarli.

---

## Integrazione con Skill Esistenti

- **`playwright-enterprise-tester`** — al fix loop (max 3 tentativi) DEVE aver letto artefatti + laravel.log al primo tentativo. Skip allowed solo se `dry-run=true` o test passa al primo retry locale.
- **`create-test`** — quando un test PHPUnit/Pest fallisce in CI, applicare la stessa procedura: scaricare junit XML + laravel.log testing + coverage se rilevante.
- **`review-pr-comments`** — se Copilot o un reviewer commenta su un test rosso, leggere prima gli artefatti del run CI di quella PR (`gh pr checks`, `gh run download`) prima di rispondere.

---

## Comandi Rapidi

```bash
# Ultimo run rosso del workflow corrente
RUN=$(gh run list --status=failure --limit 1 --json databaseId -q '.[0].databaseId')

# Scarica tutto + log COMPLETO del run (TEST-CI-001 mandatorio) + estratto step falliti
mkdir -p ./_ci-debug/$RUN && gh run download $RUN --dir ./_ci-debug/$RUN
gh run view $RUN --log        > ./_ci-debug/$RUN/full.log
gh run view $RUN --log-failed > ./_ci-debug/$RUN/failed.log

# Apri HTML report Playwright (cerca la sotto-cartella più probabile)
npx playwright show-report "$(find ./_ci-debug/$RUN -type d -name 'playwright-report' | head -1)"

# Apri trace di un test specifico
npx playwright show-trace "$(find ./_ci-debug/$RUN -name 'trace.zip' | head -1)"

# Exception nel laravel.log — gh preserva la struttura interna dell'artefatto laravel-logs*
find ./_ci-debug/$RUN -path '*laravel-logs*' -name 'laravel.log' -print0 \
  | xargs -0 grep -B 3 -A 30 "Exception\|ERROR\b" | head -200
```

---

## Checklist Prima di Proporre un Fix

- [ ] Letto job log fallito completo (non solo summary)
- [ ] Scaricato zip artefatti del run
- [ ] Letto `claude-report.json` (Playwright) o `phpunit-junit.xml` (PHPUnit)
- [ ] Aperto HTML report e/o trace zip per il test fallito
- [ ] Scaricato e letto `storage/logs/laravel.log` finestra temporale del fail
- [ ] Verificato se il test è già noto flaky (`flakiness-history.jsonl`)
- [ ] Correlato errore frontend ↔ eccezione backend ↔ silent errors
- [ ] Classificato: `test_bug` / `app_bug` / `environment_bug` / `flaky`
- [ ] Identificato file e riga precisi del fix
- [ ] Pulito `_ci-debug/<RUN>/` dopo validazione

---

## Riferimenti Incrociati

- `TEST-E2E-001` — Playwright Enterprise Tester (skill principale)
- `CHAIN-FE-TEST-001` — Chain `/pagespeed-review` dopo test FE
- `GIT-PR-001` — PR workflow (mai `--no-verify`, mai fix speculativo per chiudere review)
- `SEC-LOG-001` — Logging & data masking (PII nei log scaricati va trattata con cautela; mai pubblicarla in commenti PR)
- `SYNC-AI-001` — Questa regola è sincronizzata su Copilot (`.github/instructions/ci-test-failure-analysis.instructions.md`) e Gemini (sezione `TEST-CI-001` in `.gemini/gemini.md`).
