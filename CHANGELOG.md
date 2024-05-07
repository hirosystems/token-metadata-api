## [0.6.2](https://github.com/hirosystems/token-metadata-api/compare/v0.6.1...v0.6.2) (2024-05-07)


### Bug Fixes

* handle missing image uris ([#207](https://github.com/hirosystems/token-metadata-api/issues/207)) ([a540ae0](https://github.com/hirosystems/token-metadata-api/commit/a540ae033c52161c5a5040304b8b992d31a4077c))

## [0.6.1](https://github.com/hirosystems/token-metadata-api/compare/v0.6.0...v0.6.1) (2024-02-27)


### Bug Fixes

* accept FTs with incorrect return type for get-token-supply ([#197](https://github.com/hirosystems/token-metadata-api/issues/197)) ([116248c](https://github.com/hirosystems/token-metadata-api/commit/116248c7af09a6658b5542a4c900159a10c38b47))

## [0.6.0](https://github.com/hirosystems/token-metadata-api/compare/v0.5.0...v0.6.0) (2023-12-20)


### Features

* make FT search on name and symbol case insensitive ([#187](https://github.com/hirosystems/token-metadata-api/issues/187)) ([5187e59](https://github.com/hirosystems/token-metadata-api/commit/5187e598e40a3b53400e9c1f63942257192222d5))


### Bug Fixes

* run tests in band ([#190](https://github.com/hirosystems/token-metadata-api/issues/190)) ([989575e](https://github.com/hirosystems/token-metadata-api/commit/989575ef8b53a513b77f5b0f509ed538591104f7))
* semantic release ([#191](https://github.com/hirosystems/token-metadata-api/issues/191)) ([0a81fdb](https://github.com/hirosystems/token-metadata-api/commit/0a81fdb080d962d7390de374327aa2b3d59b28c8))
* skip migrations during readonly mode ([#183](https://github.com/hirosystems/token-metadata-api/issues/183)) ([f658e0d](https://github.com/hirosystems/token-metadata-api/commit/f658e0d7e9fb4d52a63f936d5e2f55c3e11a3c8a))

## [0.5.0](https://github.com/hirosystems/token-metadata-api/compare/v0.4.0...v0.5.0) (2023-08-02)


### Features

* add contract principal to ft index responses ([#180](https://github.com/hirosystems/token-metadata-api/issues/180)) ([57d0468](https://github.com/hirosystems/token-metadata-api/commit/57d04683ce7d72d15484d8cbf8ab36253261bf30))

## [0.4.0](https://github.com/hirosystems/token-metadata-api/compare/v0.3.1...v0.4.0) (2023-06-30)


### Features

* add endpoint to list all FTs ([#167](https://github.com/hirosystems/token-metadata-api/issues/167)) ([af1e886](https://github.com/hirosystems/token-metadata-api/commit/af1e88661e344d407fcc96451ceb64cb224d2939))

## [0.3.1](https://github.com/hirosystems/token-metadata-api/compare/v0.3.0...v0.3.1) (2023-06-15)


### Bug Fixes

* only warn when sip-019 contract is not found ([#162](https://github.com/hirosystems/token-metadata-api/issues/162)) ([55dcde1](https://github.com/hirosystems/token-metadata-api/commit/55dcde1a472f068cc2928125cd1e122d2d6d9c84))
* run prometheus on port 9153 ([#165](https://github.com/hirosystems/token-metadata-api/issues/165)) ([2fa0d93](https://github.com/hirosystems/token-metadata-api/commit/2fa0d93c11764da7dff2a39b94606938ecafbcd7))

## [0.3.0](https://github.com/hirosystems/token-metadata-api/compare/v0.2.1...v0.3.0) (2023-04-03)


### Features

* add `invalid` job status to mark invalid contracts or tokens ([#148](https://github.com/hirosystems/token-metadata-api/issues/148)) ([5d6ef41](https://github.com/hirosystems/token-metadata-api/commit/5d6ef419a594bbe01c54d2905707a4bc6a2a8e2f))


### Bug Fixes

* support FTs with missing metadata but correct token data ([#150](https://github.com/hirosystems/token-metadata-api/issues/150)) ([0a5558e](https://github.com/hirosystems/token-metadata-api/commit/0a5558e4c184aa6989b48361ae3ed3fc1b363ee7))

## [0.2.1](https://github.com/hirosystems/token-metadata-api/compare/v0.2.0...v0.2.1) (2023-03-17)


### Bug Fixes

* do not retry incorrect clarity values ([#143](https://github.com/hirosystems/token-metadata-api/issues/143)) ([272064a](https://github.com/hirosystems/token-metadata-api/commit/272064aaf39b80cefe16418ac80d8d1c0ca08674))

## [0.2.0](https://github.com/hirosystems/token-metadata-api/compare/v0.1.1...v0.2.0) (2023-03-17)


### Features

* add admin RPC interface ([#136](https://github.com/hirosystems/token-metadata-api/issues/136)) ([1f4b4aa](https://github.com/hirosystems/token-metadata-api/commit/1f4b4aabb37fe8c4805314f7e8eb268c6de749b6))

## [0.1.1](https://github.com/hirosystems/token-metadata-api/compare/v0.1.0...v0.1.1) (2023-03-14)


### Bug Fixes

* return FT metadata in a backwards compatible way ([#130](https://github.com/hirosystems/token-metadata-api/issues/130)) ([3ca57a0](https://github.com/hirosystems/token-metadata-api/commit/3ca57a06bb14423a374cd7ceac368c1a6fbf0f57))

## [0.1.0](https://github.com/hirosystems/token-metadata-service/compare/v0.0.1...v0.1.0) (2023-02-22)


### Features

* add server version to status endpoint and rendered docs ([#76](https://github.com/hirosystems/token-metadata-service/issues/76)) ([ba2f7de](https://github.com/hirosystems/token-metadata-service/commit/ba2f7de52996fe57c89298b98a7fd33e3db186f1))
* enable run modes ([#116](https://github.com/hirosystems/token-metadata-service/issues/116)) ([c7a9c55](https://github.com/hirosystems/token-metadata-service/commit/c7a9c553217f5dcc9c1f30db3d8d29200504e930))
* import sip-019 notifications during boot ([#81](https://github.com/hirosystems/token-metadata-service/issues/81)) ([6c28037](https://github.com/hirosystems/token-metadata-service/commit/6c2803703560fa42d5b15b25a83e877ad879f20b))
* refresh dynamic metadata tokens periodically ([#64](https://github.com/hirosystems/token-metadata-service/issues/64)) ([e1c0882](https://github.com/hirosystems/token-metadata-service/commit/e1c08825e5148ee0c99a9d0e240bf386934a9c4b))
* throttle requests to rate limited domains ([#97](https://github.com/hirosystems/token-metadata-service/issues/97)) ([5b75060](https://github.com/hirosystems/token-metadata-service/commit/5b75060157f9e8ec170176a8ba76c73eb7423cd3))


### Bug Fixes

* add `/metadata/v1` prefix to all routes ([#100](https://github.com/hirosystems/token-metadata-service/issues/100)) ([a11d4be](https://github.com/hirosystems/token-metadata-service/commit/a11d4be8abeb08ce192ea4e3f01d1da6db960733))
* add cache-control, remove cache for error responses ([#114](https://github.com/hirosystems/token-metadata-service/issues/114)) ([e03caf8](https://github.com/hirosystems/token-metadata-service/commit/e03caf8e488bb0ad5911a40d68319391ef1cdca6))
* contract log queries ([4bd2812](https://github.com/hirosystems/token-metadata-service/commit/4bd2812e135ea1ccb242b0b26f7a0ab62ea65048))
* display cached image in metadata responses ([#104](https://github.com/hirosystems/token-metadata-service/issues/104)) ([156e9e2](https://github.com/hirosystems/token-metadata-service/commit/156e9e2e5b886cf1bd8fe7065cbf0f073e98b832))
* dockerfile CMD path ([#91](https://github.com/hirosystems/token-metadata-service/issues/91)) ([de60556](https://github.com/hirosystems/token-metadata-service/commit/de605568415582f2b8c8451b02864827099d5b66))
* enclose response etag in double quotes ([#113](https://github.com/hirosystems/token-metadata-service/issues/113)) ([2b77cfe](https://github.com/hirosystems/token-metadata-service/commit/2b77cfec24c1d1cba6857525fd9321628c7f3b9a))
* etag cache calculation with url prefix ([#111](https://github.com/hirosystems/token-metadata-service/issues/111)) ([f872f93](https://github.com/hirosystems/token-metadata-service/commit/f872f9365e2d95ec051cfb4838881eb01e5c3df6))
* follow redirects when fetching metadata ([#109](https://github.com/hirosystems/token-metadata-service/issues/109)) ([0ab2fbb](https://github.com/hirosystems/token-metadata-service/commit/0ab2fbb8eabf59b5ccaa4eef7d6c4b65d979f40e))
* generate git info on docker build ([#93](https://github.com/hirosystems/token-metadata-service/issues/93)) ([9808b47](https://github.com/hirosystems/token-metadata-service/commit/9808b47d37d8a7ce2c720a96ddcd5e0db2e7ff5a))
* handle pg disconnections and transaction management ([#92](https://github.com/hirosystems/token-metadata-service/issues/92)) ([201d813](https://github.com/hirosystems/token-metadata-service/commit/201d813241731bb634951e9534ad40f84842c6f9))
* ignore invalid ssl certs for metadata fetch ([#107](https://github.com/hirosystems/token-metadata-service/issues/107)) ([46e184c](https://github.com/hirosystems/token-metadata-service/commit/46e184c9d773fc520ae95a9f93c2c35893b0e53b))
* ignore ts type maps when migrating ([#95](https://github.com/hirosystems/token-metadata-service/issues/95)) ([b92b9d8](https://github.com/hirosystems/token-metadata-service/commit/b92b9d80f8ebe5b7e0d15b22a55900d389ee20b1))
* improve SIGINT handling for queued jobs ([e16fcd5](https://github.com/hirosystems/token-metadata-service/commit/e16fcd5a5aba053620961538c6b3757cdc5523c5))
* jsonb type interpretation on endpoints ([5985c80](https://github.com/hirosystems/token-metadata-service/commit/5985c8075c244c4414e5b73460a7267dc535a13f))
* jsonb value insertions ([8dff8a6](https://github.com/hirosystems/token-metadata-service/commit/8dff8a601e78652961ab9f1a1c7b36e65a658c8c))
* make importer wait for API height to catch up if it's behind ([#101](https://github.com/hirosystems/token-metadata-service/issues/101)) ([930cce3](https://github.com/hirosystems/token-metadata-service/commit/930cce3c6660bdc98181d5c5bced94c0bd46699c))
* manage additional timeout errors on metadata fetch ([e658e1d](https://github.com/hirosystems/token-metadata-service/commit/e658e1ddd7d8580180e8baed8045b09be274e67c))
* move from fetch to request to fix ENOBUFS ([9b26439](https://github.com/hirosystems/token-metadata-service/commit/9b2643948e9ec7b8d8fe102e47a062c26ff147db))
* persist http agent for metadata fetches ([a30641a](https://github.com/hirosystems/token-metadata-service/commit/a30641ab14839978caef0feb78345fb92a39ece2))
* retry 429 and gateway timeouts ([08cdce6](https://github.com/hirosystems/token-metadata-service/commit/08cdce64157800d28635ffc67c27ca3e08eaae2a))
* sft_mint detection ([53673b2](https://github.com/hirosystems/token-metadata-service/commit/53673b22f6238b062ec17f34ba9faa4fcaa76e01))
* shut down queue at the end of sequence ([e268c79](https://github.com/hirosystems/token-metadata-service/commit/e268c79177e6f0a52556a14174f1b57a828af3ee))
* support JSON5 metadata strings ([#106](https://github.com/hirosystems/token-metadata-service/issues/106)) ([d19634f](https://github.com/hirosystems/token-metadata-service/commit/d19634f5dae83f769e14956edc842b382f08c763))
* uintcv creation ([780b160](https://github.com/hirosystems/token-metadata-service/commit/780b1607497d089e454389c6180abb7a3cdb733d))
* update_at jobs on status or retry change ([c16025f](https://github.com/hirosystems/token-metadata-service/commit/c16025fa1e86fa7d74c5ac24ab439b1d3a56084b))

## [0.1.0-beta.12](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.11...v0.1.0-beta.12) (2023-02-21)


### Features

* enable run modes ([#116](https://github.com/hirosystems/token-metadata-service/issues/116)) ([c7a9c55](https://github.com/hirosystems/token-metadata-service/commit/c7a9c553217f5dcc9c1f30db3d8d29200504e930))

## [0.1.0-beta.11](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.10...v0.1.0-beta.11) (2023-02-09)


### Bug Fixes

* add cache-control, remove cache for error responses ([#114](https://github.com/hirosystems/token-metadata-service/issues/114)) ([e03caf8](https://github.com/hirosystems/token-metadata-service/commit/e03caf8e488bb0ad5911a40d68319391ef1cdca6))

## [0.1.0-beta.10](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.9...v0.1.0-beta.10) (2023-02-09)


### Bug Fixes

* enclose response etag in double quotes ([#113](https://github.com/hirosystems/token-metadata-service/issues/113)) ([2b77cfe](https://github.com/hirosystems/token-metadata-service/commit/2b77cfec24c1d1cba6857525fd9321628c7f3b9a))

## [0.1.0-beta.9](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.8...v0.1.0-beta.9) (2023-02-09)


### Bug Fixes

* etag cache calculation with url prefix ([#111](https://github.com/hirosystems/token-metadata-service/issues/111)) ([f872f93](https://github.com/hirosystems/token-metadata-service/commit/f872f9365e2d95ec051cfb4838881eb01e5c3df6))

## [0.1.0-beta.8](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.7...v0.1.0-beta.8) (2023-02-09)


### Bug Fixes

* display cached image in metadata responses ([#104](https://github.com/hirosystems/token-metadata-service/issues/104)) ([156e9e2](https://github.com/hirosystems/token-metadata-service/commit/156e9e2e5b886cf1bd8fe7065cbf0f073e98b832))
* follow redirects when fetching metadata ([#109](https://github.com/hirosystems/token-metadata-service/issues/109)) ([0ab2fbb](https://github.com/hirosystems/token-metadata-service/commit/0ab2fbb8eabf59b5ccaa4eef7d6c4b65d979f40e))
* ignore invalid ssl certs for metadata fetch ([#107](https://github.com/hirosystems/token-metadata-service/issues/107)) ([46e184c](https://github.com/hirosystems/token-metadata-service/commit/46e184c9d773fc520ae95a9f93c2c35893b0e53b))
* make importer wait for API height to catch up if it's behind ([#101](https://github.com/hirosystems/token-metadata-service/issues/101)) ([930cce3](https://github.com/hirosystems/token-metadata-service/commit/930cce3c6660bdc98181d5c5bced94c0bd46699c))
* support JSON5 metadata strings ([#106](https://github.com/hirosystems/token-metadata-service/issues/106)) ([d19634f](https://github.com/hirosystems/token-metadata-service/commit/d19634f5dae83f769e14956edc842b382f08c763))

## [0.1.0-beta.7](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.6...v0.1.0-beta.7) (2023-02-07)


### Bug Fixes

* add `/metadata/v1` prefix to all routes ([#100](https://github.com/hirosystems/token-metadata-service/issues/100)) ([a11d4be](https://github.com/hirosystems/token-metadata-service/commit/a11d4be8abeb08ce192ea4e3f01d1da6db960733))

## [0.1.0-beta.6](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.5...v0.1.0-beta.6) (2023-02-06)


### Features

* throttle requests to rate limited domains ([#97](https://github.com/hirosystems/token-metadata-service/issues/97)) ([5b75060](https://github.com/hirosystems/token-metadata-service/commit/5b75060157f9e8ec170176a8ba76c73eb7423cd3))

## [0.1.0-beta.5](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.4...v0.1.0-beta.5) (2023-02-02)


### Bug Fixes

* handle pg disconnections and transaction management ([#92](https://github.com/hirosystems/token-metadata-service/issues/92)) ([201d813](https://github.com/hirosystems/token-metadata-service/commit/201d813241731bb634951e9534ad40f84842c6f9))

## [0.1.0-beta.4](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.3...v0.1.0-beta.4) (2023-02-01)


### Bug Fixes

* ignore ts type maps when migrating ([#95](https://github.com/hirosystems/token-metadata-service/issues/95)) ([b92b9d8](https://github.com/hirosystems/token-metadata-service/commit/b92b9d80f8ebe5b7e0d15b22a55900d389ee20b1))

## [0.1.0-beta.3](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.2...v0.1.0-beta.3) (2023-02-01)


### Bug Fixes

* generate git info on docker build ([#93](https://github.com/hirosystems/token-metadata-service/issues/93)) ([9808b47](https://github.com/hirosystems/token-metadata-service/commit/9808b47d37d8a7ce2c720a96ddcd5e0db2e7ff5a))

## [0.1.0-beta.2](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.1...v0.1.0-beta.2) (2023-02-01)


### Bug Fixes

* dockerfile CMD path ([#91](https://github.com/hirosystems/token-metadata-service/issues/91)) ([de60556](https://github.com/hirosystems/token-metadata-service/commit/de605568415582f2b8c8451b02864827099d5b66))

## [0.1.0-beta.1](https://github.com/hirosystems/token-metadata-service/compare/v0.0.1...v0.1.0-beta.1) (2023-01-26)


### Features

* add server version to status endpoint and rendered docs ([#76](https://github.com/hirosystems/token-metadata-service/issues/76)) ([ba2f7de](https://github.com/hirosystems/token-metadata-service/commit/ba2f7de52996fe57c89298b98a7fd33e3db186f1))
* import sip-019 notifications during boot ([#81](https://github.com/hirosystems/token-metadata-service/issues/81)) ([6c28037](https://github.com/hirosystems/token-metadata-service/commit/6c2803703560fa42d5b15b25a83e877ad879f20b))
* refresh dynamic metadata tokens periodically ([#64](https://github.com/hirosystems/token-metadata-service/issues/64)) ([e1c0882](https://github.com/hirosystems/token-metadata-service/commit/e1c08825e5148ee0c99a9d0e240bf386934a9c4b))


### Bug Fixes

* contract log queries ([4bd2812](https://github.com/hirosystems/token-metadata-service/commit/4bd2812e135ea1ccb242b0b26f7a0ab62ea65048))
* improve SIGINT handling for queued jobs ([e16fcd5](https://github.com/hirosystems/token-metadata-service/commit/e16fcd5a5aba053620961538c6b3757cdc5523c5))
* jsonb type interpretation on endpoints ([5985c80](https://github.com/hirosystems/token-metadata-service/commit/5985c8075c244c4414e5b73460a7267dc535a13f))
* jsonb value insertions ([8dff8a6](https://github.com/hirosystems/token-metadata-service/commit/8dff8a601e78652961ab9f1a1c7b36e65a658c8c))
* manage additional timeout errors on metadata fetch ([e658e1d](https://github.com/hirosystems/token-metadata-service/commit/e658e1ddd7d8580180e8baed8045b09be274e67c))
* move from fetch to request to fix ENOBUFS ([9b26439](https://github.com/hirosystems/token-metadata-service/commit/9b2643948e9ec7b8d8fe102e47a062c26ff147db))
* persist http agent for metadata fetches ([a30641a](https://github.com/hirosystems/token-metadata-service/commit/a30641ab14839978caef0feb78345fb92a39ece2))
* retry 429 and gateway timeouts ([08cdce6](https://github.com/hirosystems/token-metadata-service/commit/08cdce64157800d28635ffc67c27ca3e08eaae2a))
* sft_mint detection ([53673b2](https://github.com/hirosystems/token-metadata-service/commit/53673b22f6238b062ec17f34ba9faa4fcaa76e01))
* shut down queue at the end of sequence ([e268c79](https://github.com/hirosystems/token-metadata-service/commit/e268c79177e6f0a52556a14174f1b57a828af3ee))
* uintcv creation ([780b160](https://github.com/hirosystems/token-metadata-service/commit/780b1607497d089e454389c6180abb7a3cdb733d))
* update_at jobs on status or retry change ([c16025f](https://github.com/hirosystems/token-metadata-service/commit/c16025fa1e86fa7d74c5ac24ab439b1d3a56084b))
