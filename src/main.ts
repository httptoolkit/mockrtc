import { MockRTC } from "./mockrtc";
import { MockRTCServer } from "./mockrtc-server";
import { MockRTCAdminServer } from "./mockrtc-admin-server";

export type { MockRTCPeer } from './mockrtc-peer';

export {
    MOCKRTC_CONTROL_CHANNEL,
    type MockRTCControLMessage
} from './control-channel';

export function getLocal(): MockRTC {
    return new MockRTCServer();
}

export function getAdminServer(): MockRTCAdminServer {
    return new MockRTCAdminServer();
}