/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from "events";

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
import { MediaTrackStream } from '../webrtc/mediatrack-stream';

export class MockRTCServerPeer implements MockRTCPeer {

    readonly peerId = randomUUID();

    private debug: boolean = false;

    // A list of all currently open connections managed by this peer
    private readonly connections: { [id: string]: RTCConnection } = {};

    // A subset of the connections: external connections with no assigned internal connection
    private readonly unassignedExternalConnections: { [id: string]: RTCConnection } = {};

    constructor(
        private handlerSteps: HandlerStep[],
        private options: MockRTCPeerOptions = {},
        private eventEmitter: EventEmitter
    ) {
        this.debug = !!options.debug;
    }

    private trackConnection(conn: RTCConnection) {
        this.connections[conn.id] = conn;
        conn.once('connection-closed', () => {
            delete this.connections[conn.id];
        });

        if (conn instanceof MockRTCConnection) {
            // Here we listen to the various internal connection events, and convert them into
            // their corresponding public-API events.
            conn.once('connection-connected', () => {
                const connectionEventParams = {
                    peerId: this.peerId,
                    sessionId: conn.id
                };

                this.eventEmitter.emit('peer-connected', {
                    ...connectionEventParams,
                    localSdp: conn.getLocalDescription(),
                    remoteSdp: conn.getRemoteDescription()
                });

                conn.once('external-connection-attached', (externalConn) => {
                    this.eventEmitter.emit('external-peer-attached', {
                        ...connectionEventParams,
                        externalConnection: {
                            sessionId: externalConn.id,
                            localSdp: externalConn.getLocalDescription(),
                            remoteSdp: externalConn.getRemoteDescription()
                        }
                    });
                });

                const emitChannelEvents = (channelStream: DataChannelStream) => {
                    const channelEventParams = {
                        ...connectionEventParams,
                        channelId: channelStream.id,
                    };

                    this.eventEmitter.emit('data-channel-opened', {
                        ...channelEventParams,
                        channelLabel: channelStream.label
                    });

                    const emitMessage = (direction: 'sent' | 'received') => (data: Buffer | string) => {
                        const isBinary = Buffer.isBuffer(data);

                        const content: Buffer = isBinary
                            ? data
                            : Buffer.from(data, 'utf8');

                        this.eventEmitter.emit(`data-channel-message-${direction}`, {
                            ...channelEventParams,
                            direction,
                            content,
                            isBinary
                        });
                    };

                    channelStream.on('read-data', emitMessage('received'));
                    channelStream.on('wrote-data', emitMessage('sent'));

                    channelStream.on('close', () =>
                        this.eventEmitter.emit('data-channel-closed', { ...channelEventParams })
                    );
                }

                conn.on('channel-open', emitChannelEvents);
                // Due to race conditions somewhere (?) presumably in node-datachannel, channels can
                // be created before the 'connected' event fires, so we need to handle already
                // existing channels here too:
                conn.channels.forEach(emitChannelEvents);

                const emitTrackEvents = (mediaTrack: MediaTrackStream) => {
                    const trackEventParams = {
                        ...connectionEventParams,
                        trackMid: mediaTrack.mid
                    };

                    this.eventEmitter.emit('media-track-opened', {
                        ...trackEventParams,
                        trackType: mediaTrack.type,
                        trackDirection: mediaTrack.direction
                    });

                    const statsInterval = setInterval(() => {
                        this.eventEmitter.emit('media-track-stats', {
                            ...trackEventParams,
                            totalBytesSent: mediaTrack.totalBytesSent,
                            totalBytesReceived: mediaTrack.totalBytesReceived
                        });
                    }, 1000);

                    mediaTrack.on('close', () => {
                        clearInterval(statsInterval);
                        this.eventEmitter.emit('media-track-closed', { ...trackEventParams })
                });
                }

                conn.on('track-open', emitTrackEvents);
                // Due to race conditions somewhere (?) presumably in node-datachannel, tracks can
                // be created before the 'connected' event fires, so we need to handle already
                // existing tracks here too:
                conn.mediaTracks.forEach(emitTrackEvents);

                conn.once('connection-closed', () => {
                    this.eventEmitter.emit('peer-disconnected', { ...connectionEventParams });
                });
            });
        }
    }

    private getExternalConnection = (id: string) => {
        const externalConn = this.unassignedExternalConnections[id];
        if (!externalConn) throw new Error(`Attempted to connect unknown external conn ${id}`);
        delete this.unassignedExternalConnections[id];
        return externalConn;
    }

    async createExternalOffer(options: OfferOptions = {}): Promise<MockRTCExternalOfferParams> {
        if (this.debug) console.log(`Creating external peer offer for ${this.peerId}`);

        const externalConn = new RTCConnection();
        this.unassignedExternalConnections[externalConn.id] = externalConn;
        this.trackConnection(externalConn);

        return {
            id: externalConn.id,
            offer: await externalConn.sessionApi.createOffer(options),
            session: externalConn.sessionApi,
            setAnswer: async (answer: RTCSessionDescriptionInit) => {
                if (this.debug) console.log(`Accepting answer for external peer offer for ${this.peerId}`);
                externalConn.sessionApi.completeOffer(answer);
            }
        };
    }

    async answerExternalOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCExternalAnswerParams> {
        if (this.debug) console.log(`Answering offer with external peer for ${this.peerId}`);

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
        if (this.debug) console.log(`Creating mock offer for ${this.peerId}`);

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
        if (this.debug) console.log(`Answering offer for mocking for ${this.peerId}`);

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