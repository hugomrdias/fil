# Changelog

## [0.2.0](https://github.com/hugomrdias/fil/compare/fil-app-v0.1.0...fil-app-v0.2.0) (2026-10-08)


### Features

* add the fil agent plugin for Claude Code, Codex, and Agent Plugins clients ([#60](https://github.com/hugomrdias/fil/issues/60)) ([0305871](https://github.com/hugomrdias/fil/commit/0305871530a9639d0bf6d488b19d3c5e69538e89)), closes [#59](https://github.com/hugomrdias/fil/issues/59)
* **fil-app:** rename the Agent setup page to Agents ([#57](https://github.com/hugomrdias/fil/issues/57)) ([b7b3edf](https://github.com/hugomrdias/fil/commit/b7b3edfbeee2f48ada5da92863a71f339eae3c14))
* **fil-app:** rename the API docs page to API and MCP ([#62](https://github.com/hugomrdias/fil/issues/62)) ([896b758](https://github.com/hugomrdias/fil/commit/896b75863010cf411521b143c8b274dd4c6632e9))

## 0.1.0 (2026-10-08)


### Features

* approve fil login keys and funding on a fil-app setup page ([#35](https://github.com/hugomrdias/fil/issues/35)) ([4422657](https://github.com/hugomrdias/fil/commit/442265799a2f36b2861824c286ce722e09a3348d))
* **fil-app:** add explorer and wallet dashboard SPA ([#15](https://github.com/hugomrdias/fil/issues/15)) ([58af6e4](https://github.com/hugomrdias/fil/commit/58af6e4f5669eed3cd0a998de7635b45d715714e))
* **fil-app:** add read-only WebMCP tools for the account and storage ([#38](https://github.com/hugomrdias/fil/issues/38)) ([46c55bd](https://github.com/hugomrdias/fil/commit/46c55bdb5175a92d4e4e12617ecd91c318f0da50)), closes [#34](https://github.com/hugomrdias/fil/issues/34)
* **fil-app:** add the website, docs, and agent setup pages ([#43](https://github.com/hugomrdias/fil/issues/43)) ([7bd4f4f](https://github.com/hugomrdias/fil/commit/7bd4f4f6caf43bf0072385a131e5346d432a34d7))
* **fil-app:** improve the is-agentic.com score and say "Filecoin" in prose ([#45](https://github.com/hugomrdias/fil/issues/45)) ([17a7330](https://github.com/hugomrdias/fil/commit/17a7330f23e282c8b353c8138b9a409acc754ae0))
* **fil-app:** open pieces through fil-api's /get/{cid} retrieval route ([#23](https://github.com/hugomrdias/fil/issues/23)) ([26c83ca](https://github.com/hugomrdias/fil/commit/26c83caf4715d5a1755980622114f2b84070d30b))
* **fil-app:** render the app with TanStack Start on Workers ([#42](https://github.com/hugomrdias/fil/issues/42)) ([3600a45](https://github.com/hugomrdias/fil/commit/3600a459ac7b2c6f2be8bfe33e430037bb23d27f))
* **fil-app:** summarize the project in llms.txt and list the overview ([#44](https://github.com/hugomrdias/fil/issues/44)) ([af4c54c](https://github.com/hugomrdias/fil/commit/af4c54c977de650aae74f5011e3c1e93bd232880))
* give each kind of agent one way in to fil, with progressive discovery ([#53](https://github.com/hugomrdias/fil/issues/53)) ([0f1fb2b](https://github.com/hugomrdias/fil/commit/0f1fb2b75dac91751e05b67a0d2ec8effb553438))
* publish agent skills from one root skills directory ([#52](https://github.com/hugomrdias/fil/issues/52)) ([8bbe993](https://github.com/hugomrdias/fil/commit/8bbe99326d68afb56a25f1ce93b559d261c2054d))
* version packages and release them to npm with release-please ([#54](https://github.com/hugomrdias/fil/issues/54)) ([4bb7dce](https://github.com/hugomrdias/fil/commit/4bb7dce5c592efd11d6cc4036547215267afc7a3))


### Bug Fixes

* **fil-app:** offer get_setup_status before the wallet connects ([#36](https://github.com/hugomrdias/fil/issues/36)) ([5b8b254](https://github.com/hugomrdias/fil/commit/5b8b254001727ec3b7f43aa0218e71872bdc08e6)), closes [#34](https://github.com/hugomrdias/fil/issues/34)
* **fil-app:** polish responsive layouts and guard oversized expiries ([#16](https://github.com/hugomrdias/fil/issues/16)) ([09d6dd7](https://github.com/hugomrdias/fil/commit/09d6dd77375f0a6412c03da5839c96a8bdba2f05))
* **fil-app:** spell the ID pattern with [0-9] so agents read it correctly ([#39](https://github.com/hugomrdias/fil/issues/39)) ([b2e8664](https://github.com/hugomrdias/fil/commit/b2e866459698f32be9d2327caf1967d7a486012a)), closes [#34](https://github.com/hugomrdias/fil/issues/34)
* **fil-app:** vertically center select item content ([#17](https://github.com/hugomrdias/fil/issues/17)) ([be1e3fe](https://github.com/hugomrdias/fil/commit/be1e3fe3148d09810035e92bb6dc3c4db2a1f10a))
* report indexer lag against the chain head and serve fresh fil-api reads ([#48](https://github.com/hugomrdias/fil/issues/48)) ([4636540](https://github.com/hugomrdias/fil/commit/4636540f7db1af09fc090884acd27e0ff762a69d))
* validate PieceCID v2 in fil-api's piece filter and the explorer search ([#40](https://github.com/hugomrdias/fil/issues/40)) ([7df40c6](https://github.com/hugomrdias/fil/commit/7df40c6621085cf8a89aa36629c83c509d9ab495)), closes [#37](https://github.com/hugomrdias/fil/issues/37)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @hugomrdias/vite-plugin-agent-skills bumped to 0.1.0
