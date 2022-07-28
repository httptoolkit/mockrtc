/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { gql } from 'graphql-tag';
import * as PluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';

import { MockRTCSessionDescription } from '../mockrtc';
import {
    MockRTCPeer,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams,
    MockRTCAnswerParams,
    MockRTCSession,
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
            transformResponse: ({ createOffer }) => {
                const session = this.getSession(createOffer.id);
                return {
                    offer: createOffer.description,
                    session,
                    setAnswer: session.completeOffer.bind(session)
                };
            }
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
            transformResponse: ({ createExternalOffer }) => {
                const session = this.getSession(createExternalOffer.id);
                return {
                    id: createExternalOffer.id,
                    offer: createExternalOffer.description,
                    session,
                    setAnswer: session.completeOffer.bind(session)
                };
            }
        });
    }

    async answerOffer(
        offer: MockRTCSessionDescription,
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
                session: this.getSession(answerOffer.id)
            })
        });
    }

    async answerExternalOffer(
        offer: MockRTCSessionDescription,
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
            transformResponse: ({ answerExternalOffer }) => {
                const session = this.getSession(answerExternalOffer.id);
                return {
                    id: answerExternalOffer.id,
                    answer: answerExternalOffer.description,
                    session
                }
            }
        });
    }

    getSession(sessionId: string): MockRTCSession {
        return new RemoteSessionApi(this.adminClient, this.peerId, sessionId);
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

class RemoteSessionApi implements MockRTCSession {
    constructor(
        private adminClient: PluggableAdmin.AdminClient<{}>,
        private peerId: string,
        public readonly sessionId: string
    ) {}

    createOffer(options?: OfferOptions): Promise<MockRTCSessionDescription> {
        return this.adminClient.sendQuery<
            { createOffer: SessionData },
            MockRTCSessionDescription
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

    completeOffer(answer: MockRTCSessionDescription): Promise<void> {
        return this.adminClient.sendQuery<void>({
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
        offer: MockRTCSessionDescription,
        options?: AnswerOptions
    ): Promise<MockRTCSessionDescription> {
        return this.adminClient.sendQuery<
            { answerOffer: SessionData },
            MockRTCSessionDescription
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