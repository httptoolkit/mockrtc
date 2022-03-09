import { randomUUID } from 'crypto';

import { MockRTCOfferParams } from "./mockrtc";
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

    private createConnection() {
        const peerConn = new MockRTCPeerConnection();

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

        return peerConn;
    }

    async createOffer(): Promise<MockRTCOfferParams> {
        const peerConn = this.createConnection();
        const offer = await peerConn.getLocalDescription();

        return {
            offer: offer,
            setAnswer: async (answer: RTCSessionDescriptionInit) => {
                peerConn.setRemoteDescription(answer);
            }
        };
    }

    async answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        const peerConn = this.createConnection();

        // Setting the remote description ensures that we'll gather an 'answer'
        // localDescription, rather than an 'offer'.
        peerConn.setRemoteDescription(offer);

        return peerConn.getLocalDescription();
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