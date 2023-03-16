## @hirosystems/token-metadata-api-client@1.0.0

This is a client library for the [Token Metadata API](https://github.com/hirosystems/token-metadata-api).

### Installation

```
npm install @hirosystems/token-metadata-api-client
```

### Example

```typescript
import { Configuration, TokensApi } from "@hirosystems/token-metadata-api-client";

const config: Configuration = {}
const api = new TokensApi(config);
const result = await api.getFtMetadata('SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2');
```