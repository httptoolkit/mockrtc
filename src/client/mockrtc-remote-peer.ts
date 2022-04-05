/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import {
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
} from "../mockrtc";
import type { MockRTCPeer } from "../mockrtc-peer";

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly id: string,
        private adminClient: PluggableAdmin.AdminClient<{}>
    ) {}

    createOffer(): Promise<MockRTCOfferParams> {
        return this.adminClient.sendQuery<
            { createOffer: RTCSessionDescriptionInit },
            MockRTCOfferParams
        >({
            query: gql`
                mutation GetPeerRTCOffer($id: ID!) {
                    createOffer(peerId: $id) {
                        type
                        sdp
                    }
                }
            `,
            variables: { id: this.id },
            transformResponse: ({ createOffer }) => ({
                offer: createOffer,
                setAnswer: (answer) => this.adminClient.sendQuery({
                    query: gql`
                        mutation GetPeerRTCOffer($originalOffer: SessionDescriptionInput!, $answer: SessionDescriptionInput!) {
                            completeOffer(originalOffer: $originalOffer, answer: $answer)
                        }
                    `,
                    variables: { originalOffer: createOffer, answer: answer }
                })
            })
        });
    }

    createExternalOffer(): Promise<MockRTCExternalOfferParams> {
        return this.adminClient.sendQuery<
            { createExternalOffer: { id: string, description: RTCSessionDescriptionInit } },
            MockRTCExternalOfferParams
        >({
            query: gql`
                mutation GetPeerRTCExternalOffer($id: ID!) {
                    createExternalOffer(peerId: $id) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { id: this.id },
            transformResponse: ({ createExternalOffer }) => ({
                id: createExternalOffer.id,
                offer: createExternalOffer.description,
                setAnswer: (answer) => this.adminClient.sendQuery({
                    query: gql`
                        mutation GetPeerRTCOffer($originalOffer: SessionDescriptionInput!, $answer: SessionDescriptionInput!) {
                            completeOffer(originalOffer: $originalOffer, answer: $answer)
                        }
                    `,
                    variables: {
                        originalOffer: createExternalOffer.description,
                        answer: answer
                    }
                })
            })
        });
    }

    async answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { answerOffer: RTCSessionDescriptionInit },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCAnswer($id: ID!, $offer: SessionDescriptionInput!) {
                    answerOffer(peerId: $id, offer: $offer) {
                        type
                        sdp
                    }
                }
            `,
            variables: { id: this.id, offer },
            transformResponse: ({ answerOffer }) => answerOffer
        });
    }

    async answerExternalOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCExternalAnswerParams> {
        return this.adminClient.sendQuery<
            { answerExternalOffer: { id: string, description: RTCSessionDescriptionInit } },
            MockRTCExternalAnswerParams
        >({
            query: gql`
                mutation GetPeerRTCExternalAnswer($id: ID!, $offer: SessionDescriptionInput!) {
                    answerExternalOffer(peerId: $id, offer: $offer) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { id: this.id, offer },
            transformResponse: ({ answerExternalOffer }) => ({
                id: answerExternalOffer.id,
                answer: answerExternalOffer.description
            })
        });
    }

    getAllMessages() {
        return this.adminClient.sendQuery<
            { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
            Array<string | Buffer>
        >({
            query: gql`
                query GetPeerSeenMessages($id: ID!) {
                    getSeenMessages(peerId: $id)
                }
            `,
            variables: { id: this.id },
            transformResponse: ({ getSeenMessages }) => {
                return getSeenMessages.map((message) => {
                    if (typeof message === 'string') {
                        return message;
                    } else if (message.type === 'buffer') {
                        return Buffer.from(message.value, 'base64');
                    } else {
                        throw new Error(`Unparseable message data: ${JSON.stringify(message)}`);
                    }
                });
            }
        });
    }

    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>> {
        return this.adminClient.sendQuery<
            { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
            Array<string | Buffer>
        >({
            query: gql`
                query GetPeerSeenMessages($id: ID!, $channelName: String) {
                    getSeenMessages(peerId: $id, channelName: $channelName)
                }
            `,
            variables: { id: this.id, channelName },
            transformResponse: ({ getSeenMessages }) => {
                return getSeenMessages.map((message) => {
                    if (typeof message === 'string') {
                        return message;
                    } else if (message.type === 'buffer') {
                        return Buffer.from(message.value, 'base64');
                    } else {
                        throw new Error(`Unparseable message data: ${JSON.stringify(message)}`);
                    }
                });
            }
        });
    }

}