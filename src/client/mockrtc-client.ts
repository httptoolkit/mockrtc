/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import gql from 'graphql-tag';

// Long-term, it'd be great to use the 'official' export path of mockttp/pluggable-admin, but
// if we do so, then TypeScript <4.7 doesn't understand it here or downstream, so we get errors.
// We don't want to use the main-exported version to avoid bundling all of Mockttp in browsers.
// For now we have to use the direct import. We can update once TS 4.7 is widely used.
import * as BrowserPluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';
import type { PluggableAdmin } from 'mockttp';

import { MockRTC, MockRTCOptions, MockRTCPeerBuilder } from "../mockrtc";

import type { MockRTCAdminPlugin } from "../server/mockrtc-admin-plugin";
import type { MockRTCPeer } from '../mockrtc-peer';
import { MockRTCRemotePeer } from './mockrtc-remote-peer';
import { MockRTCHandlerBuilder } from '../handling/handler-builder';
import { HandlerStepDefinition } from '../handling/handler-step-definitions';

export type MockRTCClientOptions =
    PluggableAdmin.AdminClientOptions &
    MockRTCOptions;

export class MockRTCClient implements MockRTC {

    private adminClient: PluggableAdmin.AdminClient<{ webrtc: MockRTCAdminPlugin }>;

    constructor(
        private options: MockRTCClientOptions = {}
    ) {
        this.adminClient = new BrowserPluggableAdmin.AdminClient(options);
    }

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    private buildPeerFromData = async (handlerSteps: HandlerStepDefinition[]): Promise<MockRTCPeer> => {
        const { adminStream } = this.adminClient;

        const peerData = await this.adminClient.sendQuery<
            { createPeer: { peerId: string } },
            { peerId: string }
        >({
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
        });

        const { peerId } = peerData;

        return new MockRTCRemotePeer(peerId, this.adminClient);
    }

    async start(): Promise<void> {
        await this.adminClient.start({
            webrtc: this.options
        });
    }

    async stop(): Promise<void> {
        await this.adminClient.stop();
    }
}