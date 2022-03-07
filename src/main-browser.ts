import { MockRTC } from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./mockrtc-client";

export function getRemote(options: MockRTCClientOptions): MockRTC {
    return new MockRTCClient(options);
}