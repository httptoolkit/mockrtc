/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash';
import * as stream from 'stream';
import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';
import type { IResolvers } from "@graphql-tools/utils";
import { PubSub } from "graphql-subscriptions";

import { StepLookup } from '../handling/handler-steps';
import { MockRTCOptions, MockRTCSessionDescription } from '../mockrtc';
import { MockRTCServer } from './mockrtc-server';
import { AnswerOptions, OfferOptions } from '../mockrtc-peer';
import { MatcherDefinition } from '../matching/matcher-definitions';
import { MatcherLookup } from '../matching/matchers';
import { HandlerStepDefinition } from '../handling/handler-step-definitions';

const { deserialize } = PluggableAdmin.Serialization;
type SerializedValue<T> = PluggableAdmin.Serialization.SerializedValue<T>;

export interface SessionData {
    id: string;
    description: MockRTCSessionDescription
}

const EVENTS = [
    'peer-connected',
    'peer-disconnected',
    'external-peer-attached',
    'data-channel-opened',
    'data-channel-message-sent',
    'data-channel-message-received',
    'data-channel-closed',
    'media-track-opened',
    'media-track-stats',
    'media-track-closed'
] as const;

export class MockRTCAdminPlugin implements PluggableAdmin.AdminPlugin<MockRTCOptions, {}> {

    private mockRTCServer!: MockRTCServer;

    start(options: MockRTCOptions) {
        this.mockRTCServer = new MockRTCServer(options);
        return this.mockRTCServer.start();
    }

    reset() {
        this.mockRTCServer.reset();
    }

    stop() {
        return this.mockRTCServer.stop();
    }

    schema = gql`
        extend type Mutation {
            createPeer(data: RTCHandlerData!): MockedPeer!
            addRTCRule(data: RTCRuleData!): Void
            setRTCRules(data: [RTCRuleData!]!): Void

            createOffer(peerId: ID!, sessionId: ID, options: Raw): Session!
            createExternalOffer(peerId: ID!, options: Raw): Session!
            completeOffer(peerId: ID!, sessionId: ID!, answer: SessionDescriptionInput!): Void

            answerOffer(peerId: ID!, sessionId: ID, offer: SessionDescriptionInput!, options: Raw): Session!
            answerExternalOffer(peerId: ID!, offer: SessionDescriptionInput!, options: Raw): Session!
        }

        input RTCHandlerData {
            steps: [Raw!]!
        }

        input RTCRuleData {
            matchers: [Raw!]!
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

        extend type Subscription {
            peerConnected: RTCPeerConnectionEvent!
            peerDisconnected: RTCPeerDisconnectionEvent!
            externalPeerAttached: RTCAttachmentEvent!

            dataChannelOpened: DataChannelOpenEvent!
            dataChannelMessageSent: DataChannelMessageEvent!
            dataChannelMessageReceived: DataChannelMessageEvent!
            dataChannelClosed: DataChannelCloseEvent!

            mediaTrackOpened: MediaTrackOpenEvent!
            mediaTrackStats: MediaTrackStatsEvent!
            mediaTrackClosed: MediaTrackCloseEvent!
        }

        type RTCPeerConnectionEvent {
            peerId: ID!
            sessionId: ID!

            metadata: Raw!
            timingEvents: Raw!

            localSessionDescription: SessionDescriptionResult!
            remoteSessionDescription: SessionDescriptionResult!
            selectedLocalCandidate: RTCSelectedCandidate!
            selectedRemoteCandidate: RTCSelectedCandidate!
        }

        type RTCSelectedCandidate {
            address: String!
            port: Int!
            protocol: String!
            type: String!
        }

        type RTCPeerDisconnectionEvent {
            peerId: ID!
            sessionId: ID!
            timingEvents: Raw!
        }

        type RTCAttachmentEvent {
            peerId: ID!
            sessionId: ID!
            externalConnection: RTCExternalPeerConnectionEvent!
            timingEvents: Raw!
        }

        type RTCExternalPeerConnectionEvent {
            sessionId: ID!
            localSessionDescription: SessionDescriptionResult!
            remoteSessionDescription: SessionDescriptionResult!
            selectedLocalCandidate: RTCSelectedCandidate!
            selectedRemoteCandidate: RTCSelectedCandidate!
        }

        type DataChannelOpenEvent {
            peerId: ID!
            sessionId: ID!
            channelId: Int!
            channelLabel: String!
            channelProtocol: String!

            eventTimestamp: Float!
            timingEvents: Raw!
        }

        type DataChannelMessageEvent {
            peerId: ID!
            sessionId: ID!
            channelId: Int!
            direction: String!
            content: Buffer!
            isBinary: Boolean!

            eventTimestamp: Float!
            timingEvents: Raw!
        }

        type DataChannelCloseEvent {
            peerId: ID!
            sessionId: ID!
            channelId: Int!

            eventTimestamp: Float!
            timingEvents: Raw!
        }

        type MediaTrackOpenEvent {
            peerId: ID!
            sessionId: ID!
            trackMid: ID!
            trackType: String!
            trackDirection: String!

            eventTimestamp: Float!
            timingEvents: Raw!
        }

        type MediaTrackStatsEvent {
            peerId: ID!
            sessionId: ID!
            trackMid: ID!

            totalBytesSent: Int!
            totalBytesReceived: Int!

            eventTimestamp: Float!
            timingEvents: Raw!
        }

        type MediaTrackCloseEvent {
            peerId: ID!
            sessionId: ID!
            trackMid: ID!

            eventTimestamp: Float!
            timingEvents: Raw!
        }
    `;

    buildResolvers(adminStream: stream.Duplex, ruleParams: {}): IResolvers {
        const pubsub = new PubSub();

        EVENTS.forEach((eventName) => {
            this.mockRTCServer.on(eventName, (peer) => {
                pubsub.publish(eventName, { [_.camelCase(eventName)]: peer });
            });
        });

        return {
            Mutation: {
                createPeer: (__: any, { data: { steps } }: { data: {
                    steps: Array<SerializedValue<HandlerStepDefinition>>
                } }) => {
                    return this.mockRTCServer.buildPeerFromDefinition(
                        steps.map((stepData) =>
                            deserialize(stepData, adminStream, ruleParams, StepLookup)
                        )
                    );
                },
                addRTCRule: (__: any, { data: { steps, matchers } }: { data: {
                    matchers: Array<SerializedValue<MatcherDefinition>>
                    steps: Array<SerializedValue<HandlerStepDefinition>>
                } }) => {
                    return this.mockRTCServer.addRuleFromDefinition(
                        matchers.map((matcherData) =>
                            deserialize(matcherData, adminStream, ruleParams, MatcherLookup)
                        ),
                        steps.map((stepData) =>
                            deserialize(stepData, adminStream, ruleParams, StepLookup)
                        )
                    );
                },
                setRTCRules: (__: any, { data: rules }: { data: Array<{
                    matchers: Array<SerializedValue<MatcherDefinition>>
                    steps: Array<SerializedValue<HandlerStepDefinition>>
                }> }) => {
                    return this.mockRTCServer.setRulesFromDefinitions(
                        rules.map(({ matchers, steps }) => ({
                            matchers: matchers.map((matcherData) =>
                                deserialize(matcherData, adminStream, ruleParams, MatcherLookup)
                            ),
                            steps: steps.map((stepData) =>
                                deserialize(stepData, adminStream, ruleParams, StepLookup)
                            )
                        }))
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
                    answer: MockRTCSessionDescription
                }): Promise<void> => {
                    const session = this.mockRTCServer.getPeer(peerId).getSession(sessionId);
                    await session.completeOffer(answer);
                },
                answerOffer: async (__: any, { peerId, sessionId, offer, options } : {
                    peerId: string,
                    sessionId?: string,
                    offer: MockRTCSessionDescription,
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
                    offer: MockRTCSessionDescription,
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
            },
            Subscription: {
                ...(EVENTS.reduce((acc, eventName) => ({
                    ...acc,
                    [_.camelCase(eventName)]: {
                        subscribe: () => pubsub.asyncIterator(eventName)
                    }
                }), {}))
            }
        };
    }
}