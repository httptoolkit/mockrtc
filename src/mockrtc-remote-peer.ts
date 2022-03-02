import { MockRTCConnectionParams } from "./mockrtc";

export class MockRTCRemotePeer {

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