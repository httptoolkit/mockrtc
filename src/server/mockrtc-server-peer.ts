/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';

import {
    MockRTCPeer,
    MockRTCPeerOptions,
    MockRTCSession,
    MockRTCAnswerParams,
    MockRTCOfferParams,
    MockRTCExternalAnswerParams,
    MockRTCExternalOfferParams,
    OfferOptions,
    AnswerOptions
} from "../mockrtc-peer";
import { HandlerStep } from '../handling/handler-steps';

import { RTCConnection } from '../webrtc/rtc-connection';
import { MockRTCConnection } from '../webrtc/mockrtc-connection';
import { DataChannelStream } from '../webrtc/datachannel-stream';

export class MockRTCServerPeer implements MockRTCPeer {

    readonly peerId = randomUUID();

    // A list of all currently open connections managed by this peer
    private readonly connections: { [id: string]: RTCConnection } = {};

    // A subset of the connections: external connections with no assigned internal connection
    private readonly unassignedExternalConnections: { [id: string]: RTCConnection } = {};

    constructor(
        private handlerSteps: HandlerStep[],
        private options: MockRTCPeerOptions = {}
    ) {}

    private trackConnection(conn: RTCConnection) {
        this.connections[conn.id] = conn;
        conn.once('connection-closed', () => {
            delete this.connections[conn.id];
        });
    }

    private getExternalConnection = (id: string) => {
        const externalConn = this.unassignedExternalConnections[id];
        if (!externalConn) throw new Error(`Attempted to connect unknown external conn ${id}`);
        delete this.unassignedExternalConnections[id];
        return externalConn;
    }

    async createExternalOffer(options: OfferOptions = {}): Promise<MockRTCExternalOfferParams> {
        const externalConn = new RTCConnection();
        this.unassignedExternalConnections[externalConn.id] = externalConn;
        this.trackConnection(externalConn);

        return {
            id: externalConn.id,
            offer: await externalConn.sessionApi.createOffer(options),
            session: externalConn.sessionApi,
            setAnswer: async (answer: RTCSessionDescriptionInit) => {
                externalConn.sessionApi.completeOffer(answer);
            }
        };
    }

    async answerExternalOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCExternalAnswerParams> {
        const externalConn = new RTCConnection();
        this.unassignedExternalConnections[externalConn.id] = externalConn;
        this.trackConnection(externalConn);

        return {
            id: externalConn.id,
            answer: await externalConn.sessionApi.answerOffer(offer, options),
            session: externalConn.sessionApi
        };
    }

    private createConnection() {
        const conn = new MockRTCConnection(this.getExternalConnection);
        this.trackConnection(conn);

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

    async createOffer(options: OfferOptions = {}): Promise<MockRTCOfferParams> {
        const conn = this.createConnection();

        return {
            offer: await conn.sessionApi.createOffer(options),
            session: conn.sessionApi,
            setAnswer: async (answer) => {
                conn.sessionApi.completeOffer(answer);
            }
        }
    }

    async answerOffer(offer: RTCSessionDescriptionInit, options: AnswerOptions = {}): Promise<MockRTCAnswerParams> {
        const conn = this.createConnection();
        return {
            answer: await conn.sessionApi.answerOffer(offer, options),
            session: conn.sessionApi
        };
    }

    getSession(id: string): MockRTCSession {
        return this.connections[id].sessionApi;
    }

    private async handleConnection(conn: MockRTCConnection) {
        await conn.waitUntilConnected();

        for (const step of this.handlerSteps) {
            await step.handle(conn);
        }

        await conn.close();
    }

    async close() {
        await Promise.all(
            Object.values(this.connections).map(c =>
                c.close()
            )
        );
    }

    private messages: { [channelName: string]: Array<string | Buffer> } = {};

    async getAllMessages() {
        return Object.values(this.messages).flat();
    }

    async getMessagesOnChannel(channelName: string) {
        return this.messages[channelName].flat();
    }

}