# Changelog

## 0.1.0 (2026-10-08)


### Features

* **fil-api:** add Cloudflare Worker API and MCP server for Filecoin onchain data ([2fb6b04](https://github.com/hugomrdias/fil/commit/2fb6b04976255409b3b30003c35977cfa73178ca))
* **fil-api:** redirect PieceCIDs and IPFS CIDs to providers via /get/{cid} ([#22](https://github.com/hugomrdias/fil/issues/22)) ([d8f6ab2](https://github.com/hugomrdias/fil/commit/d8f6ab278ae887c622e3f19852f66d26c3bf5561))
* **fil-api:** run the Worker in Frankfurt next to the Hyperdrive pool ([#50](https://github.com/hugomrdias/fil/issues/50)) ([cf568dc](https://github.com/hugomrdias/fil/commit/cf568dc8f9fc74a61c2d7165d07aef5b3b3cfa6b))
* **fil-api:** trace requests with Ray IDs and custom spans, and tighten network routes ([#19](https://github.com/hugomrdias/fil/issues/19)) ([10d9637](https://github.com/hugomrdias/fil/commit/10d96376a9de8731646b6d91ea171a252178e751))
* **fil-app:** improve the is-agentic.com score and say "Filecoin" in prose ([#45](https://github.com/hugomrdias/fil/issues/45)) ([17a7330](https://github.com/hugomrdias/fil/commit/17a7330f23e282c8b353c8138b9a409acc754ae0))


### Bug Fixes

* **fil-api:** address review findings ([3594d1a](https://github.com/hugomrdias/fil/commit/3594d1a4251a8dc12fb6eaf892befebfb1f81d62))
* report indexer lag against the chain head and serve fresh fil-api reads ([#48](https://github.com/hugomrdias/fil/issues/48)) ([4636540](https://github.com/hugomrdias/fil/commit/4636540f7db1af09fc090884acd27e0ff762a69d))
* validate PieceCID v2 in fil-api's piece filter and the explorer search ([#40](https://github.com/hugomrdias/fil/issues/40)) ([7df40c6](https://github.com/hugomrdias/fil/commit/7df40c6621085cf8a89aa36629c83c509d9ab495)), closes [#37](https://github.com/hugomrdias/fil/issues/37)


### Performance Improvements

* **fil-api:** avoid planner traps in rail and owner piece queries, and compose SQL with a typed tag ([#20](https://github.com/hugomrdias/fil/issues/20)) ([7bee9a2](https://github.com/hugomrdias/fil/commit/7bee9a2ad0b141ee1ea6643325864a94574152cf))
