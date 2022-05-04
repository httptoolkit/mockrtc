/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';
import type { IResolvers } from "@graphql-tools/utils";

import { HandlerStep, StepLookup } from '../handling/handler-steps';
import { MockRTCOptions } from '../mockrtc';
import { MockRTCServer } from './mockrtc-server';
import { AnswerOptions, OfferOptions } from '../mockrtc-peer';

const { deserialize } = PluggableAdmin.Serialization;
type SerializedValue<T> = PluggableAdmin.Serialization.SerializedValue<T>;

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

            createOffer(peerId: ID!, sessionId: ID, options: Raw): Session!
            createExternalOffer(peerId: ID!, options: Raw): Session!
            completeOffer(peerId: ID!, sessionId: ID!, answer: SessionDescriptionInput!): Void

            answerOffer(peerId: ID!, sessionId: ID, offer: SessionDescriptionInput!, options: Raw): Session!
            answerExternalOffer(peerId: ID!, offer: SessionDescriptionInput!, options: Raw): Session!
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

    buildResolvers(adminStream: stream.Duplex, ruleParams: {}): IResolvers {
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
                createOffer: async (__: any, { peerId, sessionId, options }: {
                    peerId: string,
                    sessionId?: string,
                    options?: OfferOptions
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    if (sessionId) {
                        const session = peer.getSession(sessionId);
                        return {
                            id: sessionId,
                            description: await session.createOffer(options)
                        };
                    } else {
                        const offerParams = await peer.createOffer(options);
                        return {
                            id: offerParams.session.sessionId,
                            description: offerParams.offer
                        };
                    }
                },
                createExternalOffer: async (__: any, { peerId, options }: {
                    peerId: string,
                    options?: OfferOptions
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const offerParams = await peer.createExternalOffer(options);
                    return {
                        id: offerParams.id,
                        description: offerParams.offer
                    };
                },
                completeOffer: async (__: any, { peerId, sessionId, answer } : {
                    peerId: string,
                    sessionId: string,
                    answer: RTCSessionDescriptionInit
                }): Promise<void> => {
                    const session = this.mockRTCServer.getPeer(peerId).getSession(sessionId);
                    await session.completeOffer(answer);
                },
                answerOffer: async (__: any, { peerId, sessionId, offer, options } : {
                    peerId: string,
                    sessionId?: string,
                    offer: RTCSessionDescriptionInit,
                    options?: AnswerOptions
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    if (sessionId) {
                        const session = peer.getSession(sessionId);
                        const answer = await session.answerOffer(offer, options);
                        return { id: sessionId, description: answer };
                    } else {
                        const answerParams = await peer.answerOffer(offer, options);
                        return {
                            id: answerParams.session.sessionId,
                            description: answerParams.answer
                        };
                    }
                },
                answerExternalOffer: async (__: any, { peerId, offer, options } : {
                    peerId: string,
                    offer: RTCSessionDescriptionInit,
                    options?: AnswerOptions
                }): Promise<SessionData> => {
                    const peer = this.mockRTCServer.getPeer(peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const answerParams = await peer.answerExternalOffer(offer, options);
                    return {
                        id: answerParams.id,
                        description: answerParams.answer
                    };
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