/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';
import { deserialize, SerializedValue } from 'mockttp/dist/util/serialization';

import { HandlerStep, StepLookup } from '../handling/handler-steps';
import { MockRTCOfferParams, MockRTCOptions } from '../mockrtc';
import { MockRTCServer } from './mockrtc-server';

interface ExternalRTCSessionDescriptionInit {
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

            createOffer(peerId: ID!): SessionDescriptionResult!
            createExternalOffer(peerId: ID!): ExternalSessionDescriptionResult!
            completeOffer(originalOffer: SessionDescriptionInput!, answer: SessionDescriptionInput!): Void

            answerOffer(peerId: ID!, offer: SessionDescriptionInput!): SessionDescriptionResult!
            answerExternalOffer(peerId: ID!, offer: SessionDescriptionInput!): ExternalSessionDescriptionResult!
        }

        input RTCHandlerData {
            steps: [Raw!]!
        }

        type MockedPeer {
            id: ID!
        }

        input SessionDescriptionInput {
            type: String!
            sdp: String!
        }

        type SessionDescriptionResult {
            type: String!
            sdp: String!
        }

        type ExternalSessionDescriptionResult {
            id: ID!
            description: SessionDescriptionResult
        }

        extend type Query {
            getSeenMessages(peerId: ID!, channelName: String): [Raw!]
        }

        scalar HandlerStep
    `;

    buildResolvers(adminStream: stream.Duplex, ruleParams: {}) {
        const pendingOffers: MockRTCOfferParams[] = [];

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
                createOffer: async (__: any, { peerId }: { peerId: string }): Promise<RTCSessionDescriptionInit> => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const offerParams = await peer.createOffer();
                    pendingOffers.push(offerParams);
                    return offerParams.offer;
                },
                completeOffer: async (__: any, { originalOffer, answer } : {
                    originalOffer: RTCSessionDescriptionInit,
                    answer: RTCSessionDescriptionInit
                }): Promise<void> => {
                    const pendingOfferIndex = pendingOffers.findIndex(({ offer }) => offer.sdp === originalOffer.sdp);
                    if (pendingOfferIndex === -1) throw new Error("Offer matches no pending offer");

                    const pendingOffer = pendingOffers[pendingOfferIndex];
                    pendingOffers.splice(pendingOfferIndex, 1);

                    await pendingOffer.setAnswer(answer);
                },
                createExternalOffer: async (__: any, { peerId }: {
                    peerId: string
                }): Promise<ExternalRTCSessionDescriptionInit> => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const offerParams = await peer.createExternalOffer();
                    pendingOffers.push(offerParams);
                    return { id: offerParams.id, description: offerParams.offer };
                },
                answerOffer: async (__: any, { peerId, offer } : {
                    peerId: string,
                    offer: RTCSessionDescriptionInit
                }): Promise<RTCSessionDescriptionInit> => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    return peer.answerOffer(offer);
                },
                answerExternalOffer: async (__: any, { peerId, offer } : {
                    peerId: string,
                    offer: RTCSessionDescriptionInit
                }): Promise<ExternalRTCSessionDescriptionInit> => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
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
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
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

function deserializeStepData(
    data: { type: keyof typeof StepLookup }
) {
    const type = StepLookup[data.type];
    return Object.assign(Object.create(type.prototype), data);
}