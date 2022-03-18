import { randomUUID } from 'crypto';

import { MockRTCExternalAnswerParams, MockRTCExternalOfferParams, MockRTCOfferParams } from "./mockrtc";
import { MockRTCPeer, MockRTCPeerOptions } from './mockrtc-peer';
import { HandlerStep } from './handling/handler-steps';

import { RTCConnection } from './webrtc/rtc-connection';
import { MockRTCConnection } from './webrtc/mockrtc-connection';
import { DataChannelStream } from './webrtc/datachannel-stream';

export class MockRTCServerPeer implements MockRTCPeer {

    readonly id = randomUUID();

    private unassignedExternalConnections: { [id: string]: RTCConnection } = {};

    constructor(
        private handlerSteps: HandlerStep[],
        private options: MockRTCPeerOptions = {}
    ) {}

    private getExternalConnection = (id: string) => {
        const externalConn = this.unassignedExternalConnections[id];
        if (!externalConn) throw new Error(`Attempted to connect unknown external conn ${id}`);
        delete this.unassignedExternalConnections[id];
        return externalConn;
    }

    async createExternalOffer(): Promise<MockRTCExternalOfferParams> {
        const externalConn = new RTCConnection();
        const externalConnId = randomUUID();
        this.unassignedExternalConnections[externalConnId] = externalConn;

        return {
            id: externalConnId,
            offer: await externalConn.getLocalDescription(),
            setAnswer: async (answer: RTCSessionDescriptionInit) => {
                externalConn.setRemoteDescription(answer);
            }
        };
    }

    async answerExternalOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCExternalAnswerParams> {
        const externalConn = new RTCConnection();
        const externalConnId = randomUUID();
        this.unassignedExternalConnections[externalConnId] = externalConn;

        externalConn.setRemoteDescription(offer);

        return {
            id: externalConnId,
            answer: await externalConn.getLocalDescription()
        };
    }

    private createConnection() {
        const conn = new MockRTCConnection(this.getExternalConnection);

        this.handleConnection(conn).catch((error) => {
            console.error("Error handling WebRTC connection:", error);
            conn.close().catch(() => {});
        });

        if (this.options.recordMessages) {
            conn.on('channel-open', (channel: DataChannelStream) => {
                const channelLabel = channel.label;
                const messageLog = (this.messages[channelLabel] ??= []);

                channel.on('data', d => {
                    messageLog.push(d);
                });
            });
        }

        return conn;
    }

    async createOffer(): Promise<MockRTCOfferParams> {
        const conn = this.createConnection();
        const offer = await conn.getLocalDescription();

        return {
            offer: offer,
            setAnswer: async (answer: RTCSessionDescriptionInit) => {
                conn.setRemoteDescription(answer);
            }
        };
    }

    async answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        const conn = this.createConnection();

        // Setting the remote description ensures that we'll gather an 'answer'
        // localDescription, rather than an 'offer'.
        conn.setRemoteDescription(offer);

        return conn.getLocalDescription();
    }

    private async handleConnection(conn: MockRTCConnection) {
        for (const step of this.handlerSteps) {
            await step.handle(conn);
        }

        conn.close();
    }

    private messages: { [channelName: string]: Array<string | Buffer> } = {};

    async getAllMessages() {
        return Object.values(this.messages).flat();
    }

    async getMessagesOnChannel(channelName: string) {
        return this.messages[channelName].flat();
    }

}