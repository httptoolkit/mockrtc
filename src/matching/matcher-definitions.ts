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
    readonly type = 'has-data-channel';
}

export class HasVideoTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-video-track';
}

export class HasAudioTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-audio-track';
}

export class HasMediaTrackMatcherDefinition extends Serializable implements MatcherDefinition {
    readonly type = 'has-media-track';
}

export class HostnameMatcherDefinition extends Serializable implements MatcherDefinition {

    readonly type = 'hostname';

    constructor(
        public readonly hostname: string
    ) {
        super();
    }
}

export class UrlRegexMatcherDefinition extends Serializable implements MatcherDefinition {

    readonly type = 'url-regex';

    readonly regexSource: string;
    readonly regexFlags: string;

    constructor(regex: RegExp) {
        super();
        this.regexSource = regex.source;
        this.regexFlags = regex.flags;
    }
}

export class UserAgentRegexMatcherDefinition  extends Serializable implements MatcherDefinition {

    readonly type = 'user-agent-regex';

    readonly regexSource: string;
    readonly regexFlags: string;

    constructor(regex: RegExp) {
        super();
        this.regexSource = regex.source;
        this.regexFlags = regex.flags;
    }
}

export const MatcherDefinitionLookup = {
    'has-data-channel': HasDataChannelMatcherDefinition,
    'has-video-track': HasVideoTrackMatcherDefinition,
    'has-audio-track': HasAudioTrackMatcherDefinition,
    'has-media-track': HasMediaTrackMatcherDefinition,
    'hostname': HostnameMatcherDefinition,
    'url-regex': UrlRegexMatcherDefinition,
    'user-agent-regex': UserAgentRegexMatcherDefinition
};