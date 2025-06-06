/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as PluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';

export type Serializable = PluggableAdmin.Serialization.Serializable;
export const { Serializable } = PluggableAdmin.Serialization;

export interface MatcherDefinition extends Serializable {
    readonly type: keyof typeof MatcherDefinitionLookup;
}

export class HasDataChannelMatcher extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-data-channel';

    explain() {
        return `with a data channel`;
    }
}

export class HasVideoTrackMatcher extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-video-track';

    explain() {
        return `with a video track`;
    }
}

export class HasAudioTrackMatcher extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-audio-track';

    explain() {
        return `with an audio track`;
    }
}

export class HasMediaTrackMatcher extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-media-track';

    explain() {
        return `with any media track`;
    }
}

export class HostnameMatcher extends Serializable implements MatcherDefinition {

    readonly type = 'rtc-page-hostname';

    constructor(
        public readonly hostname: string
    ) {
        super();
    }

    explain() {
        return `from a page on ${this.hostname}`;
    }

}

export class UrlRegexMatcher extends Serializable implements MatcherDefinition {

    readonly type = 'rtc-page-regex';

    readonly regexSource: string;
    readonly regexFlags: string;

    constructor(regex: RegExp) {
        super();
        this.regexSource = regex.source;
        this.regexFlags = regex.flags;
    }

    explain() {
        return `from a page with URL matching /${this.regexSource}/${this.regexFlags}`;
    }

}

export class UserAgentRegexMatcher  extends Serializable implements MatcherDefinition {

    readonly type = 'rtc-user-agent-regex';

    readonly regexSource: string;
    readonly regexFlags: string;

    constructor(regex: RegExp) {
        super();
        this.regexSource = regex.source;
        this.regexFlags = regex.flags;
    }

    explain() {
        return `from a user agent matching /${this.regexSource}/${this.regexFlags}`;
    }

}

export const MatcherDefinitionLookup = {
    'has-rtc-data-channel': HasDataChannelMatcher,
    'has-rtc-video-track': HasVideoTrackMatcher,
    'has-rtc-audio-track': HasAudioTrackMatcher,
    'has-rtc-media-track': HasMediaTrackMatcher,
    'rtc-page-hostname': HostnameMatcher,
    'rtc-page-regex': UrlRegexMatcher,
    'rtc-user-agent-regex': UserAgentRegexMatcher
};