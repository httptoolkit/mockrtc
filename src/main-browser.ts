import { MockRTC } from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./mockrtc-client";

export type { MockRTCPeer } from './mockrtc-peer';

export { MOCKRTC_CONTROL_CHANNEL } from './control-channel';

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}