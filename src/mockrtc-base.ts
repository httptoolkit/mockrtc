/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    MockRTCEventData,
    MockRTCPeerBuilder,
    MockRTCRuleDefinition
} from "./mockrtc";
import { MockRTCPeer } from "./mockrtc-peer";
import { MockRTCHandlerBuilder } from "./handling/handler-builder";
import { HandlerStepDefinition } from "./handling/handler-step-definitions";
import { MatcherDefinition } from "./matching/matcher-definitions";
import { MockRTCRuleBuilder } from "./rule-builder";

export abstract class MockRTCBase implements MockRTC {

    abstract getMatchingPeer(): MockRTCPeer;
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract on<E extends keyof MockRTCEventData>(
        event: E,
        callback: (param: MockRTCEventData[E]) => void
    ): Promise<void>;

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromDefinition.bind(this));
    }

    abstract buildPeerFromDefinition(
        handlerStepDefinitions: HandlerStepDefinition[]
    ): Promise<MockRTCPeer>;

    forConnections(): MockRTCRuleBuilder {
        return new MockRTCRuleBuilder(this.addRuleFromDefinition.bind(this));
    }

    abstract addRuleFromDefinition(
        matcherDefinitions: MatcherDefinition[],
        handlerStepDefinitions: HandlerStepDefinition[]
    ): Promise<void>;

    abstract setRulesFromDefinitions(
        ruleDefinitions: Array<MockRTCRuleDefinition>
    ): Promise<void>;

}