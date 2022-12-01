import { bufferCV, cvToHex, stringUtf8CV, tupleCV } from '@stacks/transactions';
import { BlockchainDbContractLog } from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { getContractLogMetadataUpdateNotification } from '../src/token-processor/util/sip-validation';

describe('SIP Validation', () => {
  test('validates SIP-019 notifications', () => {
    const tuple1 = tupleCV({
      notification: bufferCV(Buffer.from('token-metadata-update')),
      payload: tupleCV({
        'token-class': bufferCV(Buffer.from('ft')),
        'contract-id': bufferCV(
          Buffer.from('SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world')
        ),
      }),
    });
    const event1: BlockchainDbContractLog = {
      contract_identifier: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
      value: cvToHex(tuple1),
      // value:
      //   '0x0c000000020c6e6f74696669636174696f6e0d00000015746f6b656e2d6d657461646174612d757064617465077061796c6f61640c000000020b636f6e74726163742d69640616faa051721e9a12470ad03f6316a918fb4819c6ba1666696e652d6172742d65786869626974696f6e2d76310b746f6b656e2d636c6173730d000000036e6674',
    };
    const notification1 = getContractLogMetadataUpdateNotification(event1);
    expect(notification1).not.toBeUndefined();
  });
});
