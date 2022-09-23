/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { RTCConnection } from "../webrtc/rtc-connection";
import {
    MatcherDefinition,
    MatcherDefinitionLookup,
    HasAudioTrackMatcherDefinition,
    HasDataChannelMatcherDefinition,
    HasMediaTrackMatcherDefinition,
    HasVideoTrackMatcherDefinition,
    HostnameMatcherDefinition,
    UrlRegexMatcherDefinition,
    UserAgentRegexMatcherDefinition
} from "./matcher-definitions";

export interface Matcher extends MatcherDefinition {
    matches(connection: RTCConnection): boolean;
}

export class HasDataChannelMatcher extends HasDataChannelMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'application');
    }

}

export class HasVideoTrackMatcher extends HasVideoTrackMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'video');
    }

}

export class HasAudioTrackMatcher extends HasAudioTrackMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'audio');
    }

}

export class HasMediaTrackMatcher extends HasMediaTrackMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'video' || media.type === 'audio');
    }

}

const getConnectionSourceURL = (connection: RTCConnection): URL | undefined => {
    const { sourceURL } = connection.metadata;
    if (!sourceURL) return;

    try {
        return new URL(sourceURL);
    } catch (e) {
        console.warn('Unparseable RTC source URL:', e);
        return;
    }
};

export class HostnameMatcher extends HostnameMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        const url = getConnectionSourceURL(connection);
        return url?.hostname === this.hostname;
    }

}

export class UrlRegexMatcher extends UrlRegexMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        const url = getConnectionSourceURL(connection);
        return !!url?.toString().match(
            new RegExp(this.regexSource, this.regexFlags)
        );
    }

}

export class UserAgentRegexMatcher extends UserAgentRegexMatcherDefinition {

    matches(connection: RTCConnection): boolean {
        const userAgent = connection.metadata.userAgent;
        return !!userAgent?.match(
            new RegExp(this.regexSource, this.regexFlags)
        );
    }

}

export const MatcherLookup: typeof MatcherDefinitionLookup = {
    'has-rtc-data-channel': HasDataChannelMatcher,
    'has-rtc-video-track': HasVideoTrackMatcher,
    'has-rtc-audio-track': HasAudioTrackMatcher,
    'has-rtc-media-track': HasMediaTrackMatcher,
    'rtc-page-hostname': HostnameMatcher,
    'rtc-page-regex': UrlRegexMatcher,
    'rtc-user-agent-regex': UserAgentRegexMatcher
};