import {
    MockRTC,
    MockRTCOptions,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
} from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./mockrtc-client";

export {
    MockRTC,
    MockRTCOptions,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
};

export type { MockRTCPeer } from './mockrtc-peer';

export { MOCKRTC_CONTROL_CHANNEL } from './control-channel';

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}