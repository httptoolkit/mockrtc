/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from "events";
import now = require("performance-now");

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
import { TimingEvents } from '../mockrtc';

export class MockRTCServerPeer implements MockRTCPeer {

    readonly peerId = randomUUID();

    private debug: boolean = false;

    // A list of all currently open connections managed by this peer
    private readonly connections: { [id: string]: RTCConnection } = {};

    // A subset of the connections: external connections with no assigned internal connection
    private readonly unassignedExternalConnections: { [id: string]: RTCConnection } = {};

    constructor(
        private getHandlerSteps: (conn: RTCConnection) =>
            (HandlerStep[] | Promise<HandlerStep[]>),
        private options: MockRTCPeerOptions & { peerId?: string } = {},
        private eventEmitter: EventEmitter
    ) {
        this.debug = !!options.debug;
        if (options.peerId) this.peerId = options.peerId;
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
                const timingEvents: TimingEvents = {
                    startTime: Date.now(),
                    connectTimestamp: now()
                }

                const connectionEventParams = {
                    peerId: this.peerId,
                    sessionId: conn.id,
                    timingEvents
                };

                const selectedCandidates = conn.getSelectedCandidates()!;

                this.eventEmitter.emit('peer-connected', {
                    ...connectionEventParams,

                    localSessionDescription: conn.getLocalDescription(),
                    remoteSessionDescription: conn.getRemoteDescription(),
                    metadata: conn.metadata,

                    selectedLocalCandidate: selectedCandidates.local,
                    selectedRemoteCandidate: selectedCandidates.remote
                });

                conn.once('external-connection-attached', (externalConn: RTCConnection) => {
                    timingEvents.externalAttachTimestamp = now();

                    const selectedExternalCandidates = externalConn.getSelectedCandidates()!;

                    this.eventEmitter.emit('external-peer-attached', {
                        ...connectionEventParams,
                        externalConnection: {
                            sessionId: externalConn.id,
                            localSessionDescription: externalConn.getLocalDescription(),
                            remoteSessionDescription: externalConn.getRemoteDescription(),

                            selectedLocalCandidate: selectedExternalCandidates.local,
                            selectedRemoteCandidate: selectedExternalCandidates.remote
                        }
                    });
                });

                const emitChannelEvents = (channelStream: DataChannelStream) => {
                    const channelEventParams = {
                        ...connectionEventParams,
                        channelId: channelStream.id,
                    };

                    const announceOpen = () => {
                        this.eventEmitter.emit('data-channel-opened', {
                            ...channelEventParams,
                            channelLabel: channelStream.label,
                            channelProtocol: channelStream.protocol,
                            eventTimestamp: now()
                        });
                    };
                    if (channelStream.isOpen) announceOpen();
                    else channelStream.on('channel-open', announceOpen);

                    const emitMessage = (direction: 'sent' | 'received') => (data: Buffer | string) => {
                        const isBinary = Buffer.isBuffer(data);

                        const content: Buffer = isBinary
                            ? data
                            : Buffer.from(data, 'utf8');

                        this.eventEmitter.emit(`data-channel-message-${direction}`, {
                            ...channelEventParams,
                            direction,
                            content,
                            isBinary,
                            eventTimestamp: now()
                        });
                    };

                    channelStream.on('read-data', emitMessage('received'));
                    channelStream.on('wrote-data', emitMessage('sent'));

                    channelStream.on('close', () => this.eventEmitter.emit('data-channel-closed', {
                        ...channelEventParams,
                        eventTimestamp: now()
                    }));
                }

                conn.on('channel-created', emitChannelEvents);
                // Due to race conditions somewhere (?) presumably in node-datachannel, channels can
                // be created before the 'connected' event fires, so we need to handle already
                // existing channels here too:
                conn.channels.forEach(emitChannelEvents);

                const emitTrackEvents = (mediaTrack: MediaTrackStream) => {
                    const trackEventParams = {
                        ...connectionEventParams,
                        trackMid: mediaTrack.mid
                    };

                    const announceOpen = () => {
                        this.eventEmitter.emit('media-track-opened', {
                            ...trackEventParams,
                            trackType: mediaTrack.type,
                            trackDirection: mediaTrack.direction,
                            eventTimestamp: now()
                        });
                    };

                    if (mediaTrack.isOpen) announceOpen();
                    else mediaTrack.on('track-open', announceOpen);

                    let previousBytesSent = 0;
                    let previousBytesReceived = 0;

                    const statsInterval = setInterval(() => {
                        if (
                            previousBytesSent === mediaTrack.totalBytesSent &&
                            previousBytesReceived === mediaTrack.totalBytesReceived
                        ) return; // Skip zero-change events to limit traffic noise

                        this.eventEmitter.emit('media-track-stats', {
                            ...trackEventParams,
                            totalBytesSent: mediaTrack.totalBytesSent,
                            totalBytesReceived: mediaTrack.totalBytesReceived,
                            eventTimestamp: now()
                        });

                        previousBytesSent = mediaTrack.totalBytesSent;
                        previousBytesReceived = mediaTrack.totalBytesReceived;
                    }, 1000);

                    mediaTrack.on('close', () => {
                        clearInterval(statsInterval);
                        this.eventEmitter.emit('media-track-closed', {
                            ...trackEventParams,
                            eventTimestamp: now()
                        });
                    });
                }

                conn.on('track-created', emitTrackEvents);
                // Due to race conditions somewhere (?) presumably in node-datachannel, tracks can
                // be created before the 'connected' event fires, so we need to handle already
                // existing tracks here too:
                conn.mediaTracks.forEach(emitTrackEvents);

                conn.once('connection-closed', () => {
                    timingEvents.disconnectTimestamp = now();
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
            const logChannelMessages = (channel: DataChannelStream) => {
                const channelLabel = channel.label;
                const messageLog = (this.messages[channelLabel] ??= []);

                channel.on('read-data', d => {
                    messageLog.push(d);
                });
            };

            conn.channels.forEach(logChannelMessages);
            conn.on('channel-created', logChannelMessages);
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

        const handlerSteps = await this.getHandlerSteps(conn);

        for (const step of handlerSteps) {
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
        if (!this.options.recordMessages) {
            throw new Error("Can't query messages, as recordMessages was not enabled");
        }

        return Object.values(this.messages).flat();
    }

    async getMessagesOnChannel(channelName: string) {
        if (!this.options.recordMessages) {
            throw new Error("Can't query messages, as recordMessages was not enabled");
        }

        return this.messages[channelName].flat();
    }

}