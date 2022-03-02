import { MockRTC } from "./mockrtc";
import { MockRTCClient } from "./mockrtc-client";

export function getRemote(): MockRTC {
    return new MockRTCClient();
}