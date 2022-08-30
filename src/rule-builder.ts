/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTCHandlerBuilder } from "./handling/handler-builder";
import { HandlerStepDefinition } from "./handling/handler-step-definitions";
import {
    MatcherDefinition,
    HostnameMatcherDefinition,
    UrlRegexMatcherDefinition,
    UserAgentRegexMatcherDefinition,
    HasAudioTrackMatcherDefinition,
    HasVideoTrackMatcherDefinition,
    HasMediaTrackMatcherDefinition,
    HasDataChannelMatcherDefinition
} from "./matching/matcher-definitions";

export type RuleHandlerBuilder = MockRTCHandlerBuilder<void>;

/**
 * Rule builders allow you to combine sets of matchers, progressively
 * building a set of matching conditions, before defining the resulting
 * behaviour that will be applied to matching traffic.
 */
export class MockRTCRuleBuilder implements Omit<RuleHandlerBuilder, 'handlerSteps' | 'buildCallback'> {

    constructor(
        private addRuleCallback: (
            matcherDefinitions: MatcherDefinition[],
            handlerStepDefinitions: HandlerStepDefinition[]
        ) => Promise<void>
    ) {}

    private matchers: MatcherDefinition[] = [];

    /**
     * Match RTC connections whose initial negotiation includes a data channel.
     */
    withDataChannels() {
        this.matchers.push(new HasDataChannelMatcherDefinition());
        return this;
    }

    /**
     * Match RTC connections whose initial negotiation includes either an audio or video
     * media track.
     */
    withMedia() {
        this.matchers.push(new HasMediaTrackMatcherDefinition());
        return this;
    }

    /**
     * Match RTC connections whose initial negotiation includes a video media track
     */
    withVideo() {
        this.matchers.push(new HasVideoTrackMatcherDefinition());
        return this;
    }

    /**
     * Match RTC connections whose initial negotiation includes an audio media track
     */
    withAudio() {
        this.matchers.push(new HasAudioTrackMatcherDefinition());
        return this;
    }

    /**
     * Match RTC connections made from hooked JavaScript running on a given hostname.
     *
     * This only matches connections with explicit `sourceURL` metadata, which must be
     * either added automatically (by using the `hookAllWebRTC` or `hookWebRTCConnection`
     * methods) or manually (by providing `metadata: { sourceURL: '...' }` options
     * during mock connection setup).
     *
     * @category Matcher
     */
    fromPageHostname(hostname: string): this {
        this.matchers.push(new HostnameMatcherDefinition(hostname));
        return this;
    }

    /**
     * Match RTC connections made from hooked JavaScript running on a matching URL.
     *
     * This only matches connections with explicit `sourceURL` metadata, which must be
     * either added automatically (by using the `hookAllWebRTC` or `hookWebRTCConnection`
     * methods) or manually (by providing `metadata: { sourceURL: '...' }` options
     * during mock connection setup).
     *
     * @category Matcher
     */
    fromPageUrlMatching(urlRegex: RegExp): this {
        this.matchers.push(new UrlRegexMatcherDefinition(urlRegex));
        return this;
    }

    /**
     * Match RTC connections made by hooked JavaScript running within a browser with a
     * matching user agent string.
     *
     * This only matches connections with explicit `userAgent` metadata, which must be
     * either added automatically (by using the `hookAllWebRTC` or `hookWebRTCConnection`
     * methods) or manually (by providing `metadata: { userAgent: '...' }` options
     * during mock connection setup).
     *
     * @category Matcher
     */
    fromUserAgentMatching(userAgentRegEx: RegExp): this {
        this.matchers.push(new UserAgentRegexMatcherDefinition(userAgentRegEx));
        return this;
    }

    // For all handler methods, return a handler builder - i.e. once you start calling
    // any of these step-definition methods, you can't keep calling matcher methods:
    private buildDefinitionMethod = <K extends keyof RuleHandlerBuilder>(
        methodName: K
    ) => ((...args: any[]) => {
        const handlerBuilder = new MockRTCHandlerBuilder(
            (steps) => this.addRuleCallback(this.matchers, steps)
        );

        return (handlerBuilder as any)[methodName](...args);
    }) as RuleHandlerBuilder[K];

    sleep = this.buildDefinitionMethod('sleep');
    waitForChannel = this.buildDefinitionMethod('waitForChannel');
    waitForTrack = this.buildDefinitionMethod('waitForTrack');
    waitForNextMessage = this.buildDefinitionMethod('waitForNextMessage');
    waitForNextMedia = this.buildDefinitionMethod('waitForNextMedia');
    waitForNextMessageOnChannel = this.buildDefinitionMethod('waitForNextMessageOnChannel');
    createDataChannel = this.buildDefinitionMethod('createDataChannel');
    send = this.buildDefinitionMethod('send');
    thenClose = this.buildDefinitionMethod('thenClose');
    thenSend = this.buildDefinitionMethod('thenSend');
    thenEcho = this.buildDefinitionMethod('thenEcho');
    thenForwardTo = this.buildDefinitionMethod('thenForwardTo');
    thenPassThrough = this.buildDefinitionMethod('thenPassThrough');

}