/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';
import { deserialize, SerializedValue } from 'mockttp/dist/util/serialization';

import { HandlerStep, StepLookup } from '../handling/handler-steps';
import { MockRTCOptions } from '../mockrtc';
import { MockRTCServer } from './mockrtc-server';

export interface SessionData {
    id: string;
    description: RTCSessionDescriptionInit
}

export class MockRTCAdminPlugin implements PluggableAdmin.AdminPlugin<MockRTCOptions, {}> {

    private mockRTCServer!: MockRTCServer;

    start(options: MockRTCOptions) {
        this.mockRTCServer = new MockRTCServer(options);
        return this.mockRTCServer.start();
    }

    reset() {}

    stop() {
        return this.mockRTCServer.stop();
    }

    schema = gql`
        extend type Mutation {
            createPeer(data: RTCHandlerData!): MockedPeer!

            createOffer(peerId: ID!, sessionId: ID): Session!
            createExternalOffer(peerId: ID!): Session!
            completeOffer(peerId: ID!, sessionId: ID!, answer: SessionDescriptionInput!): Void

            answerOffer(peerId: ID!, sessionId: ID, offer: SessionDescriptionInput!): Session!
            answerExternalOffer(peerId: ID!, offer: SessionDescriptionInput!): Session!
            answerRenegotiationOffer(sessionId: ID!, offer: SessionDescriptionInput!): Session!
        }

        input RTCHandlerData {
            steps: [Raw!]!
        }

        type MockedPeer {
            peerId: ID!
        }

        input SessionDescriptionInput {
            type: String!
            sdp: String!
        }

        type SessionDescriptionResult {
            type: String!
            sdp: String!
        }

        type Session {
            id: ID!
            description: SessionDescriptionResult
        }

        extend type Query {
            getSeenMessages(peerId: ID!, channelName: String): [Raw!]
        }

        scalar HandlerStep
    `;

    buildResolvers(adminStream: stream.Duplex, ruleParams: {}) {
        return {
            Mutation: {
                createPeer: (__: any, { data: { steps } }: { data: {
                    steps: Array<SerializedValue<HandlerStep>>
                } }) => {
                    return this.mockRTCServer.buildPeerFromData(
                        steps.map((stepData) =>
                            deserialize(stepData, adminStream, ruleParams, StepLookup)
                        )
                    );
                },
                createOffer: async (__: any, { peerId, sessionId }: {
                    peerId: string,
                    sessionId?: string
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    if (sessionId) {
                        const session = peer.getSessionApi(sessionId);
                        return {
                            id: sessionId,
                            description: await session.createOffer()
                        };
                    } else {
                        const offerParams = await peer.createOffer();
                        return { id: offerParams._sessionId, description: offerParams.offer };
                    }
                },
                createExternalOffer: async (__: any, { peerId }: {
                    peerId: string
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const offerParams = await peer.createExternalOffer();
                    return { id: offerParams.id, description: offerParams.offer };
                },
                completeOffer: async (__: any, { peerId, sessionId, answer } : {
                    peerId: string,
                    sessionId: string,
                    answer: RTCSessionDescriptionInit
                }): Promise<void> => {
                    const session = this.mockRTCServer.getPeer(peerId).getSessionApi(sessionId);
                    await session.completeOffer(answer);
                },
                answerOffer: async (__: any, { peerId, sessionId, offer } : {
                    peerId: string,
                    sessionId?: string,
                    offer: RTCSessionDescriptionInit
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    if (sessionId) {
                        const session = peer.getSessionApi(sessionId);
                        const answer = await session.answerOffer(offer);
                        return { id: sessionId, description: answer };
                    } else {
                        const answerParams = await peer.answerOffer(offer);
                        return { id: answerParams._sessionId, description: answerParams.answer };
                    }
                },
                answerExternalOffer: async (__: any, { peerId, offer } : {
                    peerId: string,
                    offer: RTCSessionDescriptionInit
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const answerParams = await peer.answerExternalOffer(offer);
                    return { id: answerParams.id, description: answerParams.answer };
                }
            },
            Query: {
                getSeenMessages: async (__: any, { peerId, channelName }: {
                    peerId: string,
                    channelName?: string
                }) => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const messages = await (channelName != undefined
                        ? peer.getMessagesOnChannel(channelName)
                        : peer.getAllMessages()
                    );

                    return messages.map((message) => {
                        if (Buffer.isBuffer(message)) {
                            return { type: 'buffer', value: message.toString('base64') };
                        } else {
                            return message;
                        }
                    });
                }
            }
        };
    }
}