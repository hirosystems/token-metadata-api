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
