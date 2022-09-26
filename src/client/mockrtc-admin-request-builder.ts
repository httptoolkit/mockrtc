/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import gql from 'graphql-tag';
import * as stream from 'stream';

// Long-term, it'd be great to use the 'official' export path of mockttp/pluggable-admin, but
// if we do so, then TypeScript <4.7 doesn't understand it here or downstream, so we get errors.
// We don't want to use the main-exported version to avoid bundling all of Mockttp in browsers.
// For now we have to use the direct import. We can update once TS 4.7 is widely used.
import * as BrowserPluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';
import { AdminQuery } from 'mockttp/dist/client/admin-query';

import { MockRTCEvent, MockRTCEventData } from '../mockrtc';
import { HandlerStepDefinition } from '../handling/handler-step-definitions';
import { MatcherDefinition } from '../matching/matcher-definitions';

/**
 * This is part of Mockttp's experimental 'pluggable admin' API. This may change
 * unpredictably, even in minor releases.
 *
 * @internal
 */
export class MockRTCAdminRequestBuilder {

    buildCreatePeerQuery(
        handlerSteps: Array<HandlerStepDefinition>,
        adminStream: stream.Duplex
    ): AdminQuery<
        { createPeer: { peerId: string } },
        { peerId: string }
    > {
        return {
            query: gql`
                mutation CreatePeer($peerData: RTCHandlerData!) {
                    createPeer(data: $peerData) {
                        peerId
                    }
                }
            `,
            variables: {
                peerData: {
                    steps: handlerSteps.map(step =>
                        BrowserPluggableAdmin.Serialization.serialize(step, adminStream)
                    )
                }
            },
            transformResponse: ({ createPeer }) => createPeer
        };
    }

    buildAddRuleQuery(
        matchers: Array<MatcherDefinition>,
        handlerSteps: Array<HandlerStepDefinition>,
        adminStream: stream.Duplex
    ): AdminQuery<void> {
        return {
            query: gql`
                mutation AddRTCRule($ruleData: RTCRuleData!) {
                    addRTCRule(data: $ruleData)
                }
            `,
            variables: {
                ruleData: {
                    matchers: matchers.map(matcher =>
                        BrowserPluggableAdmin.Serialization.serialize(matcher, adminStream)
                    ),
                    steps: handlerSteps.map(step =>
                        BrowserPluggableAdmin.Serialization.serialize(step, adminStream)
                    )
                }
            }
        };
    }

    buildSetRulesQuery(
        rules: Array<{ matchers: MatcherDefinition[], steps: HandlerStepDefinition[] }>,
        adminStream: stream.Duplex
    ): AdminQuery<void> {
        return {
            query: gql`
                mutation SetRTCRules($ruleData: [RTCRuleData!]!) {
                    setRTCRules(data: $ruleData)
                }
            `,
            variables: {
                ruleData: rules.map(({ matchers, steps }) => ({
                    matchers: matchers.map(matcher =>
                        BrowserPluggableAdmin.Serialization.serialize(matcher, adminStream)
                    ),
                    steps: steps.map(step =>
                        BrowserPluggableAdmin.Serialization.serialize(step, adminStream)
                    )
                }))
            }
        };
    }

    buildSubscriptionRequest<E extends MockRTCEvent>(event: E): AdminQuery<MockRTCEventData[E]> | undefined {
        const query = {
            'peer-connected': gql`subscription OnPeerConnected {
                peerConnected {
                    peerId
                    sessionId

                    metadata
                    timingEvents

                    localSessionDescription { type, sdp }
                    remoteSessionDescription { type, sdp }
                    selectedLocalCandidate { address, port, protocol, type }
                    selectedRemoteCandidate { address, port, protocol, type }
                }
            }`,
            'peer-disconnected': gql`subscription OnPeerDisconnected {
                peerDisconnected {
                    peerId
                    sessionId
                    timingEvents
                }
            }`,
            'external-peer-attached': gql`subscription OnExternalPeerAttached {
                externalPeerAttached {
                    peerId
                    sessionId
                    timingEvents
                    externalConnection {
                        sessionId
                        localSessionDescription { type, sdp }
                        remoteSessionDescription { type, sdp }
                        selectedLocalCandidate { address, port, protocol, type }
                        selectedRemoteCandidate { address, port, protocol, type }
                    }
                }
            }`,
            'data-channel-opened': gql`subscription OnDataChannelOpen {
                dataChannelOpened {
                    peerId
                    sessionId
                    channelId
                    channelLabel
                    channelProtocol

                    eventTimestamp
                    timingEvents
                }
            }`,
            'data-channel-message-sent': gql`subscription OnDataChannelMessageSent {
                dataChannelMessageSent {
                    peerId
                    sessionId
                    channelId
                    direction
                    content
                    isBinary

                    eventTimestamp
                    timingEvents
                }
            }`,
            'data-channel-message-received': gql`subscription OnDataChannelMessageReceived {
                dataChannelMessageReceived {
                    peerId
                    sessionId
                    channelId
                    direction
                    content
                    isBinary

                    eventTimestamp
                    timingEvents
                }
            }`,
            'data-channel-closed': gql`subscription OnDataChannelClose {
                dataChannelClosed {
                    peerId
                    sessionId
                    channelId

                    eventTimestamp
                    timingEvents
                }
            }`,
            'media-track-opened': gql`subscription OnDataChannelClose {
                mediaTrackOpened {
                    peerId
                    sessionId
                    trackMid
                    trackType
                    trackDirection

                    eventTimestamp
                    timingEvents
                }
            }`,
            'media-track-stats': gql`subscription OnDataChannelClose {
                mediaTrackStats {
                    peerId
                    sessionId
                    trackMid
                    totalBytesSent
                    totalBytesReceived

                    eventTimestamp
                    timingEvents
                }
            }`,
            'media-track-closed': gql`subscription OnDataChannelClose {
                mediaTrackClosed {
                    peerId
                    sessionId
                    trackMid

                    eventTimestamp
                    timingEvents
                }
            }`
        }[event];

        if (!query) return; // Unrecognized event, we can't subscribe to this.

        return {
            query,
            transformResponse: (result: any) => {
                if (result.content) result.content = Buffer.from(result.content, 'base64');
                return result;
            }
        };
    }
}