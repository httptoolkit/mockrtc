/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from "events";

import { MockRTC, MockRTCEvent, MockRTCOptions } from "../mockrtc";
import { MockRTCBase } from "../mockrtc-base";
import { MockRTCServerPeer } from "./mockrtc-server-peer";
import { MockRTCPeer } from "../mockrtc-peer";
import { RTCConnection } from "../webrtc/rtc-connection";

import type { MatcherDefinition } from "../matching/matcher-definitions";
import { Matcher, MatcherLookup } from "../matching/matchers";
import type { HandlerStepDefinition } from "../handling/handler-step-definitions";
import { DynamicProxyStep, HandlerStep, StepLookup } from "../handling/handler-steps";

const MATCHING_PEER_ID = 'matching-peer';

export class MockRTCServer extends MockRTCBase implements MockRTC {

    private debug: boolean = false;

    constructor(
        private options: MockRTCOptions = {}
    ) {
        super();
        this.debug = !!options.debug;
    }

    private eventEmitter = new EventEmitter();

    async start(): Promise<void> {
        if (this.debug) console.log("Starting MockRTC mock session");

        this.matchingPeer = this._activePeers[MATCHING_PEER_ID] = new MockRTCServerPeer(
            this.matchConnection.bind(this),
            { ...this.options, peerId: MATCHING_PEER_ID },
            this.eventEmitter
        );
    }

    async stop(): Promise<void> {
        if (this.debug) console.log("Stopping MockRTC mock session");
        await this.reset();
    }

    async reset() {
        await Promise.all(
            this.activePeers.map(peer =>
                peer.close()
            )
        );

        this._activePeers = {};
        this.matchingPeer = undefined;
        this.rules = [];

        this.eventEmitter.removeAllListeners();
    }

    private _activePeers: { [id: string]: MockRTCServerPeer } = {};
    get activePeers(): Readonly<MockRTCServerPeer[]> {
        return Object.values(this._activePeers);
    }

    getPeer(id: string): MockRTCServerPeer {
        return this._activePeers[id];
    }

    async on(event: MockRTCEvent, callback: (...args: any) => void) {
        this.eventEmitter.on(event, callback);
    }

    // Matching API:

    private matchingPeer: MockRTCServerPeer | undefined;

    getMatchingPeer(): MockRTCPeer {
        if (!this.matchingPeer) {
            throw new Error('Cannot get matching peer as the mock session is not started');
        }

        return this.matchingPeer;
    }

    private rules: Array<{
        matchers: Matcher[],
        handlerSteps: HandlerStep[]
    }> = [];

    async setRulesFromDefinitions(
        rules: Array<{
            matchers: MatcherDefinition[],
            steps: HandlerStepDefinition[]
        }>
    ) {
        this.rules = [];
        await Promise.all(rules.map(({ matchers, steps }) =>
            this.addRuleFromDefinition(matchers, steps)
        ));
    }

    async addRuleFromDefinition(
        matcherDefinitions: MatcherDefinition[],
        handlerStepDefinitions: HandlerStepDefinition[]
    ) {
        const matchers = matcherDefinitions.map((definition): Matcher => {
            return Object.assign(
                Object.create(MatcherLookup[definition.type].prototype),
                definition
            );
        });

        const handlerSteps = handlerStepDefinitions.map((definition): HandlerStep => {
            return Object.assign(
                Object.create(StepLookup[definition.type].prototype),
                definition
            );
        });

        this.rules.push({ matchers, handlerSteps });
    }

    private async matchConnection(connection: RTCConnection) {
        if (this.debug) console.log('Matching incoming RTC connection...');
        await connection.waitUntilConnected();

        for (const rule of this.rules) {
            const matches = rule.matchers.every(matcher => matcher.matches(connection));

            if (matches) {
                if (this.debug) console.log(`Matched incoming RTC connection, running steps: ${
                    rule.handlerSteps.map(s => s.type).join(', ')
                }`);

                return rule.handlerSteps;
            }
        }

        if (this.debug) console.log('RTC connection did not match any rules');

        // Unmatched connections are proxied dynamically. In practice, that means they're accepted
        // and ignored initially, unless an external peer also connects and is attached:
        return [new DynamicProxyStep()];
    }

    // Peer definition API:

    async buildPeerFromDefinition(handlerStepDefinitions: HandlerStepDefinition[]): Promise<MockRTCServerPeer> {
        const handlerSteps = handlerStepDefinitions.map((definition): HandlerStep => {
            return Object.assign(
                Object.create(StepLookup[definition.type].prototype),
                definition
            );
        });
        const peer = new MockRTCServerPeer(
            () => handlerSteps, // Always runs a fixed set of steps
            this.options,
            this.eventEmitter
        );
        this._activePeers[peer.peerId] = peer;
        if (this.debug) console.log(
            `Built MockRTC peer ${peer.peerId} with steps: ${handlerStepDefinitions.map(d => d.type).join(', ')}`
        );
        return peer;
    }

}