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

export class HasDataChannelMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-data-channel';

    explain() {
        return `with a data channel`;
    }
}

export class HasVideoTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-video-track';

    explain() {
        return `with a video track`;
    }
}

export class HasAudioTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-audio-track';

    explain() {
        return `with an audio track`;
    }
}

export class HasMediaTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-rtc-media-track';

    explain() {
        return `with any media track`;
    }
}

export class HostnameMatcherDefinition extends Serializable implements MatcherDefinition {

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

export class UrlRegexMatcherDefinition extends Serializable implements MatcherDefinition {

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

export class UserAgentRegexMatcherDefinition  extends Serializable implements MatcherDefinition {

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
    'has-rtc-data-channel': HasDataChannelMatcherDefinition,
    'has-rtc-video-track': HasVideoTrackMatcherDefinition,
    'has-rtc-audio-track': HasAudioTrackMatcherDefinition,
    'has-rtc-media-track': HasMediaTrackMatcherDefinition,
    'rtc-page-hostname': HostnameMatcherDefinition,
    'rtc-page-regex': UrlRegexMatcherDefinition,
    'rtc-user-agent-regex': UserAgentRegexMatcherDefinition
};