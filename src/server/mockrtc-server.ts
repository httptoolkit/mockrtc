/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTC, MockRTCOptions, MockRTCPeerBuilder } from "../mockrtc";
import { MockRTCPeer } from "../mockrtc-peer";
import { MockRTCServerPeer } from "./mockrtc-server-peer";
import { MockRTCHandlerBuilder } from "../handling/handler-builder";
import { HandlerStepDefinition } from "../handling/handler-step-definitions";
import { StepLookup } from "../handling/handler-steps";

export class MockRTCServer implements MockRTC {

    constructor(
        private options: MockRTCOptions = {}
    ) {}

    async start(): Promise<void> {}
    async stop(): Promise<void> {
        await Promise.all(
            this._activePeers.map(peer =>
                peer.close()
            )
        );
    }

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    buildPeerFromData = async (handlerStepDefinitions: HandlerStepDefinition[]): Promise<MockRTCServerPeer> => {
        const handlerSteps = handlerStepDefinitions.map((definition) => {
            return Object.assign(
                Object.create(StepLookup[definition.type].prototype),
                definition
            );
        });
        const peer = new MockRTCServerPeer(handlerSteps, this.options);
        this._activePeers.push(peer);
        return peer;
    }

    private _activePeers: MockRTCServerPeer[] = [];
    get activePeers(): Readonly<MockRTCPeer[]> {
        return [...this._activePeers];
    }

}