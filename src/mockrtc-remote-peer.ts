import { MockRTCConnectionParams } from "./mockrtc";
import type { MockRTCPeer } from "./mockrtc-peer";

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly id: string,
        private answerGetter: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>,
        private messageGetter: (channelName?: string) => Promise<Array<string | Buffer>>
    ) {}

    async getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams> {
        return {
            sessionDescription: await this.answerGetter(offer)
        };
    }

    getAllMessages() {
        return this.messageGetter();
    }

    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>> {
        return this.messageGetter(channelName);
    }

}