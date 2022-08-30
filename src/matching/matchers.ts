import { RTCConnection } from "../webrtc/rtc-connection";
import {
    MatcherDefinition,
    MatcherDefinitionLookup,
    HasAudioTrackMatcherDefinition,
    HasDataChannelMatcherDefinition,
    HasMediaTrackMatcherDefinition,
    HasVideoTrackMatcherDefinition
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

export const MatcherLookup: typeof MatcherDefinitionLookup = {
    'has-data-channel': HasDataChannelMatcher,
    'has-video-track': HasVideoTrackMatcher,
    'has-audio-track': HasAudioTrackMatcher,
    'has-media-track': HasMediaTrackMatcher
};