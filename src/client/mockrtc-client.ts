/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import gql from 'graphql-tag';
import * as PluggableAdmin from 'mockttp/pluggable-admin';

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
        this.adminClient = new PluggableAdmin.AdminClient(options);
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
                    steps: handlerSteps.map(step => PluggableAdmin.Serialization.serialize(step, adminStream))
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