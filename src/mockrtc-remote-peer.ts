import { MockRTCConnectionParams } from "./mockrtc";
import type { MockRTCPeer } from "./mockrtc-peer";

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly id: string,
        private answerGetter: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>
    ) {}

    async getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams> {
        return {
            sessionDescription: await this.answerGetter(offer)
        };
    }

}