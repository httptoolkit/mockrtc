import { randomUUID } from 'crypto';

import { MockRTCConnectionParams } from "./mockrtc";
import { MockRTCPeer, MockRTCPeerOptions } from './mockrtc-peer';
import { HandlerStep } from './handling/handler-steps';

import { MockRTCPeerConnection } from './webrtc/peer-connection';
import { DataChannelStream } from './webrtc/datachannel-stream';

export class MockRTCServerPeer implements MockRTCPeer {

    readonly id = randomUUID();

    constructor(
        private handlerSteps: HandlerStep[],
        private options: MockRTCPeerOptions = {}
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

        if (this.options.recordMessages) {
            peerConn.on('channel-open', (channel: DataChannelStream) => {
                const channelLabel = channel.label;
                const messageLog = (this.messages[channelLabel] ??= []);

                channel.on('data', d => {
                    messageLog.push(d);
                });
            });
        }

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

    private messages: { [channelName: string]: Array<string | Buffer> } = {};

    async getAllMessages() {
        return Object.values(this.messages).flat();
    }

    async getMessagesOnChannel(channelName: string) {
        return this.messages[channelName].flat();
    }

}