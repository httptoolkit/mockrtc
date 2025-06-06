/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { RTCConnection } from "../webrtc/rtc-connection";
import {
    MatcherDefinition,
    MatcherDefinitionLookup,
    HasAudioTrackMatcher,
    HasDataChannelMatcher,
    HasMediaTrackMatcher,
    HasVideoTrackMatcher,
    HostnameMatcher,
    UrlRegexMatcher,
    UserAgentRegexMatcher
} from "./matcher-definitions";

export interface MatcherImpl extends MatcherDefinition {
    matches(connection: RTCConnection): boolean;
}

export class HasDataChannelMatcherImpl extends HasDataChannelMatcher {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'application');
    }

}

export class HasVideoTrackMatcherImpl extends HasVideoTrackMatcher {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'video');
    }

}

export class HasAudioTrackMatcherImpl extends HasAudioTrackMatcher {

    matches(connection: RTCConnection): boolean {
        return [
            ...connection.getLocalDescription()!.parsedSdp.media,
            ...connection.getRemoteDescription()!.parsedSdp.media
        ].some(media => media.type === 'audio');
    }

}

export class HasMediaTrackMatcherImpl extends HasMediaTrackMatcher {

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

export class HostnameMatcherImpl extends HostnameMatcher {

    matches(connection: RTCConnection): boolean {
        const url = getConnectionSourceURL(connection);
        return url?.hostname === this.hostname;
    }

}

export class UrlRegexMatcherImpl extends UrlRegexMatcher {

    matches(connection: RTCConnection): boolean {
        const url = getConnectionSourceURL(connection);
        return !!url?.toString().match(
            new RegExp(this.regexSource, this.regexFlags)
        );
    }

}

export class UserAgentRegexMatcherImpl extends UserAgentRegexMatcher {

    matches(connection: RTCConnection): boolean {
        const userAgent = connection.metadata.userAgent;
        return !!userAgent?.match(
            new RegExp(this.regexSource, this.regexFlags)
        );
    }

}

export const MatcherLookup: typeof MatcherDefinitionLookup = {
    'has-rtc-data-channel': HasDataChannelMatcherImpl,
    'has-rtc-video-track': HasVideoTrackMatcherImpl,
    'has-rtc-audio-track': HasAudioTrackMatcherImpl,
    'has-rtc-media-track': HasMediaTrackMatcherImpl,
    'rtc-page-hostname': HostnameMatcherImpl,
    'rtc-page-regex': UrlRegexMatcherImpl,
    'rtc-user-agent-regex': UserAgentRegexMatcherImpl
};