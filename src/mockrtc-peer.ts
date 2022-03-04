import { randomUUID } from 'crypto';

import { MockRTCConnectionParams } from "./mockrtc";
import { HandlerStep } from './handling/handler-steps';
import { MockRTCPeerConnection } from './webrtc/peer-connection';

export interface MockRTCPeer {
    readonly id: string;
    getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams>;
}

export class MockRTCServerPeer {

    readonly id = randomUUID();

    constructor(
        private handlerSteps: HandlerStep[]
    ) {}

    async getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams> {
        const peerConn = new MockRTCPeerConnection();

        // Setting the remote description immediately ensures that we'll gather an 'answer'
        // localDescription, rather than an 'offer'.
        peerConn.setRemoteDescription(offer);

        this.handleConnection(peerConn).catch((error) => {
            console.error("Error handling WebRTC connection:", error);
            peerConn.close().catch(() => {});
        });

        return {
            sessionDescription: await peerConn.getLocalDescription()
        };
    }

    private async handleConnection(peerConn: MockRTCPeerConnection) {
        for (const step of this.handlerSteps) {
            await step.handle(peerConn);
        }

        peerConn.close();
    }

}