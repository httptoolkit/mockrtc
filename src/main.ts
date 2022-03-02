import { MockRTC } from "./mockrtc";
import { MockRTCServer } from "./mockrtc-server";
import { MockRTCAdminServer } from "./mockrtc-admin-server";

export function getLocal(): MockRTC {
    return new MockRTCServer();
}

export function getAdminServer(): MockRTCAdminServer {
    return new MockRTCAdminServer();
}