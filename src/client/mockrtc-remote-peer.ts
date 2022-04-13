/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import {
    MockRTCPeer,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams,
    MockRTCAnswerParams,
    MockRTCSessionAPI,
    OfferOptions,
    AnswerOptions
} from "../mockrtc-peer";
import type { SessionData } from '../server/mockrtc-admin-plugin';

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly peerId: string,
        private adminClient: PluggableAdmin.AdminClient<{}>
    ) {}

    createOffer(options?: OfferOptions): Promise<MockRTCOfferParams> {
        return this.adminClient.sendQuery<
            { createOffer: SessionData },
            MockRTCOfferParams
        >({
            query: gql`
                mutation GetPeerRTCOffer($peerId: ID!, $options: Raw) {
                    createOffer(peerId: $peerId, options: $options) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, options },
            transformResponse: ({ createOffer }) => ({
                offer: createOffer.description,
                setAnswer: (answer) => this.completeOffer(createOffer.id, answer)
            })
        });
    }

    createExternalOffer(options?: OfferOptions): Promise<MockRTCExternalOfferParams> {
        return this.adminClient.sendQuery<
            { createExternalOffer: SessionData },
            MockRTCExternalOfferParams
        >({
            query: gql`
                mutation GetPeerRTCExternalOffer($peerId: ID!, $options: Raw) {
                    createExternalOffer(peerId: $peerId, options: $options) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, options },
            transformResponse: ({ createExternalOffer }) => ({
                id: createExternalOffer.id,
                offer: createExternalOffer.description,
                setAnswer: (answer) => this.completeOffer(createExternalOffer.id, answer)
            })
        });
    }

    private completeOffer = async (sessionId: string, answer: RTCSessionDescriptionInit) => {
        await this.adminClient.sendQuery<void>({
            query: gql`
                mutation CompletePeerRTCOffer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $answer: SessionDescriptionInput!
                ) {
                    completeOffer(peerId: $peerId, sessionId: $sessionId, answer: $answer)
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId,
                answer: answer
            }
        });

        return new RemoteSessionApi(this.adminClient, this.peerId, sessionId);
    }

    async answerOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCAnswerParams> {
        return this.adminClient.sendQuery<
            { answerOffer: SessionData },
            MockRTCAnswerParams
        >({
            query: gql`
                mutation GetPeerRTCAnswer(
                    $peerId: ID!,
                    $offer: SessionDescriptionInput!,
                    $options: Raw
                ) {
                    answerOffer(peerId: $peerId, offer: $offer, options: $options) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, offer, options },
            transformResponse: ({ answerOffer }) => ({
                answer: answerOffer.description,
                session: new RemoteSessionApi(this.adminClient, this.peerId, answerOffer.id)
            })
        });
    }

    async answerExternalOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCExternalAnswerParams> {
        return this.adminClient.sendQuery<
            { answerExternalOffer: SessionData },
            MockRTCExternalAnswerParams
        >({
            query: gql`
                mutation GetPeerRTCExternalAnswer(
                    $peerId: ID!,
                    $offer: SessionDescriptionInput!,
                    $options: Raw
                ) {
                    answerExternalOffer(peerId: $peerId, offer: $offer, options: $options) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, offer, options },
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
                query GetPeerSeenMessages($peerId: ID!) {
                    getSeenMessages(peerId: $peerId)
                }
            `,
            variables: { peerId: this.peerId },
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
                query GetPeerSeenMessages($peerId: ID!, $channelName: String) {
                    getSeenMessages(peerId: $peerId, channelName: $channelName)
                }
            `,
            variables: { peerId: this.peerId, channelName },
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

class RemoteSessionApi implements MockRTCSessionAPI {
    constructor(
        private adminClient: PluggableAdmin.AdminClient<{}>,
        private peerId: string,
        private sessionId: string
    ) {}

    createOffer(options?: OfferOptions): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { createOffer: SessionData },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCSessionOffer($peerId: ID!, $sessionId: ID!, $options: Raw) {
                    createOffer(peerId: $peerId, sessionId: $sessionId, options: $options) {
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, sessionId: this.sessionId, options },
            transformResponse: ({ createOffer }) => createOffer.description
        });
    }

    async completeOffer(answer: RTCSessionDescriptionInit): Promise<void> {
        await this.adminClient.sendQuery<void>({
            query: gql`
                mutation CompletePeerRTCOffer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $answer: SessionDescriptionInput!
                ) {
                    completeOffer(peerId: $peerId, sessionId: $sessionId, answer: $answer)
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId: this.sessionId,
                answer: answer
            }
        });
    }

    answerOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { answerOffer: SessionData },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCAnswer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $offer: SessionDescriptionInput!,
                    $options: Raw
                ) {
                    answerOffer(peerId: $peerId, sessionId: $sessionId, offer: $offer, options: $options) {
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId: this.sessionId,
                offer,
                options
            },
            transformResponse: ({ answerOffer }) => answerOffer.description
        });
    }

}