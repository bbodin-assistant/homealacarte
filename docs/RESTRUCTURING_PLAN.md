# Code restructuring plan

## Goal

Turn the current large, responsibility-heavy source files into feature-oriented modules without changing behavior, introducing a frontend framework, or requiring a big-bang rewrite.

The work should proceed as small, independently testable commits. At every point, `main` must remain buildable and releasable.

## Baseline hotspots

Generated output (`dist`, `pkg`, and `target`) is excluded from this inventory.

| File | Lines | Responsibilities currently mixed together |
| --- | ---: | --- |
| `www/app.js` | 4,688 | bootstrap, global state, worker messaging, rendering, forms, dialogs, event handlers, persistence, account UI |
| `src/engine.rs` | 1,873 | mutations, validation, snapshots, nutrition, groceries, exports |
| `www/style.css` | 1,347 | tokens, layout, components, every feature, responsive rules |
| `src/optimizer.rs` | 1,278 | requirements, rules, candidate selection, linear program construction, result assembly |
| `www/index.html` | 1,206 | application shell, every page, every dialog |
| `src/loader.rs` | 1,058 | wire formats, localization, normalization, document loading, dish flattening |
| `tests/domain.rs` | 1,006 | unrelated integration tests for most domain features |

Line count is not the only design signal. The first objective is to separate reasons to change and make dependencies explicit; smaller files should be the result, not the sole target.

## Progress

The restructuring is complete and validated:

- browser foundations live in `www/core/`, including DOM access/escaping, state, formatting, downloads, theme, searchable selects, nutrition presentation, bootstrap, and worker transport/response handling;
- feature-owned rendering, events, payload construction, and validation live in `www/features/`; controller construction and mounting moved to `www/app/feature-composition.js`, leaving `www/app.js` as the 213-line bootstrap and worker-wiring entrypoint;
- IndexedDB transactions and local reconciliation live in `www/storage/local-store.js`; Supabase sessions and remote CRUD live in `www/storage/remote-client.js`; the 400-line `www/storage.js` coordinates synchronization and conflicts;
- the former 1,347-line stylesheet is split into eleven explicitly ordered files under `www/styles/`: tokens, base, layout, components, family, menu, grocery, catalogue, data/account, dishes, and responsive overrides;
- `www/index.html` is a 105-line composition template; six page partials and one shared-dialog partial are assembled deterministically by `scripts/build.py`;
- the Rust facade is organized under `src/engine/` by family, menu, stock, catalogue, and export ownership; snapshot nutrition/views, loader inputs/localization/menu/dishes/prices, and optimizer requirements/rules/candidates/solver/result are separate modules;
- domain integration coverage lives under `tests/domain/` behind a small Cargo-discoverable `tests/domain.rs` harness, with focused loading, family, menu, stock, grocery, catalogue, dishes, and export modules;
- `scripts/check_source_boundaries.py` enforces entrypoint/source limits, rejects stale exceptions, and prevents `www/core/` from importing features; it runs in web and release checks.

Current coordinator sizes are `www/app.js` 213 lines, `www/storage.js`
400, `src/engine/mod.rs` 57, `src/snapshot/mod.rs` 4,
`src/loader/mod.rs` 361, and `src/optimizer/mod.rs` 118. The largest
remaining application source is the focused 609-line menu feature; no tracked
source exceeds 700 lines.

### Delivery status

All planned restructuring checkpoints are complete. There are no source-size
exceptions. Full Rust and web tests, the optimized Wasm build, the release scan,
and Chromium startup validation pass.

## Architectural rules

1. Keep the existing vanilla JavaScript, Web Worker, Rust/Wasm, and static build architecture.
2. Organize browser code by feature, not by technical fragments such as one file for all render functions and another for all event handlers.
3. A feature module owns its rendering, DOM events, payload construction, and feature-local validation.
4. Shared modules contain only genuinely shared, side-effect-free utilities or narrowly defined services.
5. Feature modules may depend on `core`; `core` must never import feature modules.
6. Rust domain calculations remain independent of Wasm and browser concerns.
7. Move code before redesigning it. Behavior changes and structural changes belong in separate commits.
8. Avoid re-export barrels until stable module boundaries exist; direct imports make dependencies easier to audit.

## Implemented structure

```text
www/
  app.js                         # bootstrap, worker wiring, top-level status/errors
  app/
    feature-composition.js       # feature construction, mounting, shared callbacks
  core/
    app-state.js
    bootstrap.js
    dom.js
    downloads.js
    format.js
    nutrition.js
    searchable-select.js
    theme.js
    worker-client.js
    worker-responses.js
  features/
    shell.js
    family.js
    menu.js
    auto-menu.js
    dishes.js
    dish-editor.js
    catalogue.js
    item-details.js
    grocery.js
    stock.js
    extra-needs.js
    data-account.js
  storage/
    local-store.js
    remote-client.js
  styles/
    tokens.css
    base.css
    layout.css
    components.css
    family.css
    menu.css
    grocery.css
    catalogue.css
    data-account.css
    dishes.css
    responsive.css
  views/
    family.html
    menu.html
    grocery.html
    dishes.html
    catalogue.html
    data.html
    dialogs.html

src/
  engine/
    mod.rs
    family.rs
    menu.rs
    stock.rs
    catalogue.rs
    export.rs
  snapshot/
    mod.rs
    nutrition.rs
    views.rs
  loader/
    mod.rs
    inputs.rs
    localization.rs
    menu.rs
    dishes.rs
    prices.rs
  optimizer/
    mod.rs
    requirements.rs
    rules.rs
    candidates.rs
    solver.rs
    result.rs
    tests.rs
  grocery.rs
  menu_math.rs
  model.rs
  price_history.rs

tests/
  domain.rs                      # Cargo integration-test harness
  domain/
    support.rs
    loading.rs
    family.rs
    menu.rs
    stock.rs
    grocery.rs
    catalogue.rs
    dishes.rs
    export.rs
```

The extra composition, shell, dish-editor, nutrition, optimizer-test, and
dish-style files make ownership explicit beyond the original sketch; they do
not change the dependency direction described below.

## Delivery phases

### Phase 0: Lock down behavior

- Add characterization tests around Web Worker request/response handling and state replacement.
- Ensure each major browser feature has at least one focused DOM-independent test for payload/calculation logic.
- Keep `make test`, `make test-web`, and `make test-browser-startup` green.
- Capture desktop and mobile reference screenshots for manual comparison during HTML/CSS movement.

Exit condition: the application has enough coverage to distinguish a move from a behavior regression.

### Phase 1: Extract frontend foundations

Move the lowest-coupled code from `app.js` first:

1. formatting and category helpers;
2. download and ZIP helpers;
3. searchable-select behavior;
4. worker request/response client;
5. state construction and preference loading.

Pass dependencies into modules instead of importing mutable global state. For example, a feature controller should receive `{ state, send, t, formatMoney }` and expose a `mount()` method plus the few render methods the application coordinator needs.

Exit condition: `app.js` is the composition root and no longer implements general utilities or transport mechanics.

### Phase 2: Extract browser features

Extract one vertical feature per commit in this order:

1. stock and extra needs;
2. grocery list and item details;
3. dishes and dish editor;
4. catalogue and price history;
5. family and food rules;
6. menu and automatic menu;
7. data, account, privacy, import and export.

Each extraction moves its markup generation, payload builders, validation, and event registration together. Do not create a second global event-handler file.

Exit condition: `www/app.js` contains startup, top-level navigation, controller construction, the top-level render call, and little else. Target: under 350 lines.

### Phase 3: Split the Rust engine by domain

Keep `Engine` as the public facade and move its inherent `impl Engine` methods into domain modules:

- people and profiles to `engine/family.rs`;
- menu replacement and scheduling to `engine/menu.rs`;
- stock and extra needs to `engine/stock.rs`;
- ingredient, household item, and dish mutations to `engine/catalogue.rs`;
- JSON/folder export to `engine/export.rs`.

Then move pure calculations:

- snapshot view construction to `snapshot/views.rs`;
- nutrient and Nutri-Score calculations to `snapshot/nutrition.rs`;
- grocery aggregation, stock application, and exclusions to `grocery.rs`.

The Wasm facade in `lib.rs` must continue calling the same public `Engine` API, so no browser protocol change is required.

Exit condition: `engine/mod.rs` is a small coordinator, pure calculations can be tested without constructing the Wasm wrapper, and public behavior is unchanged.

### Phase 4: Split loader and optimizer internals

For `loader.rs`, first move data-only input structs, then localization/menu normalization, then dish resolution. Leave `load_dataset` as visible orchestration until the extracted pieces are stable.

For `optimizer.rs`, extract requirements, food-rule checks, and candidate shortlisting before touching the linear solver. Keep construction of the linear program and interpretation of its solution close together until dedicated characterization tests cover infeasible, timeout, decomposed, and optimal results.

Exit condition: input parsing, domain normalization, and optimization are independently testable and no module mixes all three.

### Phase 5: Split CSS and HTML

Split CSS first because multiple stylesheets work without a new bundler. Preserve stylesheet order explicitly in `index.html`: tokens, base, layout, shared components, features, responsive overrides.

Split HTML only after extending `scripts/build.py` with a minimal, deterministic partial-composition step. Source partials should be assembled into `dist/index.html`; tests that inspect markup should inspect the composed output or the owning partial. Direct development should use the documented build/serve path.

Do not migrate markup into JavaScript merely to reduce `index.html` line count.

Exit condition: each page/dialog has one obvious owning source file and visual comparison shows no desktop or mobile regression.

### Phase 6: Split integration tests and enforce boundaries

- Move `tests/domain.rs` cases into feature-oriented integration test files.
- Add a lightweight source-size check to CI after the refactor is complete.
- Suggested limits: 700 lines for a feature source file, 400 for an entrypoint, and 500 for a test file.
- Treat limits as an architectural alarm, not permission to compress code or create meaningless fragments.
- Document intentional exceptions beside the check rather than silently weakening it.

Exit condition: new oversized files fail CI, and test ownership mirrors source ownership.

## Commit and review policy

Every restructuring commit should:

- move one cohesive responsibility;
- avoid user-visible behavior changes;
- preserve public Rust and Worker message contracts unless a separate migration is approved;
- add or relocate tests with the extracted code;
- pass `make test`, `make test-web`, and the relevant focused tests;
- pass `make test-browser-startup` for browser-facing movement;
- pass a full `make build` at the end of each phase.

Use file moves where practical so history remains readable. Avoid combining formatting of unrelated code with an extraction.

## First implementation slice

Start with the stock feature because it now has isolated calculation coverage and a clear UI boundary:

1. create `www/features/stock.js`;
2. move `stockPayload`, `addStockQuantity`, `renderStock`, `updateStockValue`, `setStockAddUnit`, stock scheduling calls, and stock DOM listeners together;
3. inject state, worker sending, translation, formatting, and searchable-select dependencies;
4. expand `tests/stock_availability.mjs` or add `tests/stock_feature.mjs` for payload and controller behavior;
5. run all web and browser-startup checks;
6. follow with `extra-needs.js`, then `grocery.js`.

This slice establishes the feature-controller pattern on a bounded area before applying it to menu, catalogue, or account code.

## Definition of done

- No application entrypoint exceeds 400 lines.
- No source file exceeds 700 lines without a documented exception.
- Features own their DOM behavior from rendering through event handling.
- Rust domain calculations do not depend on the Wasm facade.
- Worker message and persisted-data formats remain backward compatible, or have explicit migrations and tests.
- Full Rust, web, browser-startup, build, and release checks pass.
- Desktop and mobile behavior match the pre-refactor references.
