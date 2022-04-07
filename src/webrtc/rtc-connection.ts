/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import * as SDP from 'sdp-transform';
import * as NodeDataChannel from 'node-datachannel';

import { MockRTCSessionAPI, OfferOptions } from '../mockrtc-peer';

import { DataChannelStream } from './datachannel-stream';
import { MediaTrackStream } from './mediatrack-stream';

/**
 * An RTC connection is a single connection. This base class defines the raw connection management and
 * tracking logic for a generic connection. The MockRTCConnection subclass extends this and adds
 * logic to support control channels, proxying and other MockRTC-specific additions.
 */
export class RTCConnection extends EventEmitter {

    readonly id = randomUUID();

    // Set to null when the connection is closed, as otherwise calling any method (including checking
    // the connection state) will segfault the process.
    private rawConn: NodeDataChannel.PeerConnection | null
        = new NodeDataChannel.PeerConnection("MockRTCConnection", { iceServers: [] });

    private readonly trackedChannels: Array<{ stream: DataChannelStream, isLocal: boolean }> = [];

    get channels(): ReadonlyArray<DataChannelStream> {
        return this.trackedChannels
            .map(channel => channel.stream);
    }

    get localChannels(): ReadonlyArray<DataChannelStream> {
        return this.trackedChannels
            .filter(channel => channel.isLocal)
            .map(channel => channel.stream);
    }

    get remoteChannels(): ReadonlyArray<DataChannelStream> {
        return this.trackedChannels
            .filter(channel => !channel.isLocal)
            .map(channel => channel.stream);
    }

    private readonly trackedMediaTracks: Array<{ stream: MediaTrackStream, isLocal: boolean }> = [];

    get mediaTracks(): ReadonlyArray<MediaTrackStream> {
        return this.trackedMediaTracks
            .map(track => track.stream);
    }

    get localMediaTracks(): ReadonlyArray<MediaTrackStream> {
        return this.trackedMediaTracks
            .filter(track => track.isLocal)
            .map(track => track.stream);
    }

    get remoteMediaTracks(): ReadonlyArray<MediaTrackStream> {
        return this.trackedMediaTracks
            .filter(track => !track.isLocal)
            .map(track => track.stream);
    }

    constructor() {
        super();

        this.rawConn!.onDataChannel((channel) => {
            this.trackNewChannel(channel, { isLocal: false });
        });

        (this.rawConn! as any).onTrack((track: NodeDataChannel.Track) => { // Issue with node-dc types
            this.trackNewMediaTrack(track, { isLocal: false });
        });

        // Important to remember that only node-dc only allows one listener per event. To handle that,
        // we reemit important events here to use normal node event methods instead:
        this.rawConn!.onStateChange((state) => {
            this.emit('connection-state-changed', state);
        });

        this.on('connection-state-changed', (state) => {
            if (state === 'closed') this.emit('connection-closed');
        });
    }

    createDataChannel(label: string) {
        if (!this.rawConn) throw new Error("Can't create data channel after connection is closed");
        const channel = this.rawConn.createDataChannel(label);
        return this.trackNewChannel(channel, { isLocal: true });
    }

    protected trackNewChannel(channel: NodeDataChannel.DataChannel, options: { isLocal: boolean }) {
        const channelStream = new DataChannelStream(channel);
        this.trackedChannels.push({ stream: channelStream, isLocal: options.isLocal });

        channelStream.on('close', () => {
            const channelIndex = this.trackedChannels.findIndex(c => c.stream === channelStream);
            if (channelIndex !== -1) {
                this.trackedChannels.splice(channelIndex, 1);
            }
        });

        channelStream.on('error', (error) => {
            console.error('Channel error:', error);
        });

        this.emit('channel-open', channelStream);
        if (options.isLocal) {
            this.emit('local-channel-open', channelStream);
        } else {
            this.emit('remote-channel-open', channelStream);
        }

        return channelStream;
    }

    protected trackNewMediaTrack(track: NodeDataChannel.Track, options: { isLocal: boolean }) {
        const trackStream = new MediaTrackStream(track);
        this.trackedMediaTracks.push({ stream: trackStream, isLocal: options.isLocal });

        trackStream.on('close', () => {
            const trackIndex = this.trackedMediaTracks.findIndex(c => c.stream === trackStream);
            if (trackIndex !== -1) {
                this.trackedChannels.splice(trackIndex, 1);
            }
        });

        trackStream.on('error', (error) => {
            console.error('Media track error:', error);
        });

        this.emit('track-open', trackStream);
        if (options.isLocal) {
            this.emit('local-track-open', trackStream);
        } else {
            this.emit('remote-track-open', trackStream);
        }

        return trackStream;
    }

    setRemoteDescription(description: RTCSessionDescriptionInit) {
        if (!this.rawConn) throw new Error("Can't set remote description after connection is closed");

        const { type: offerType, sdp: offerSdp } = description;
        if (!offerSdp) throw new Error("Cannot set MockRTC peer description without providing an SDP");
        this.rawConn.setRemoteDescription(offerSdp, offerType[0].toUpperCase() + offerType.slice(1) as any);
    }

    /**
     * Gets the local description for this connection, waiting until gathering is complete to provide a
     * full result. Because this waits for gathering, it will not resolve if no DataChannel, other
     * tracks or remote description have been provided beforehand.
     */
    async getLocalDescription(): Promise<RTCSessionDescriptionInit> {
        if (!this.rawConn) throw new Error("Can't get local description after connection is closed");

        let setupChannel: NodeDataChannel.DataChannel | undefined;
        if (this.rawConn.gatheringState() === 'new') {
            // We can't create an offer until we have something to negotiate, but we don't want to
            // negotiate ourselves when we don't really know what's being negotiated here. To work
            // around that, we create a channel to trigger gathering & get an offer, and then we
            // remove it before the offer is delivered, so it's never visible remotely.
            setupChannel = this.rawConn.createDataChannel('mockrtc.setup-channel');
        }

        await new Promise<void>((resolve) => {
            this.rawConn!.onGatheringStateChange((state) => {
                if (state === 'complete') resolve();
            });

            // Handle race conditions where gathering has already completed
            if (this.rawConn!.gatheringState() === 'complete') resolve();
        });

        if (!this.rawConn) throw new Error("Connection was closed while building local description");

        const sessionDescription = this.rawConn.localDescription() as RTCSessionDescriptionInit;
        setupChannel?.close(); // Close the temporary setup channel, if we created one
        return sessionDescription;
    }

    async getMirroredLocalOffer(
        sdpToMirror: string
    ): Promise<RTCSessionDescriptionInit> {
        if (!this.rawConn) throw new Error("Can't get local description after connection is closed");

        const offerToMirror = SDP.parse(sdpToMirror);

        const mediaStreamsToMirror = offerToMirror.media.filter(media => media.type !== 'application');
        const shouldMirrorDataStream = offerToMirror.media.some(media => media.type === 'application');

        mediaStreamsToMirror.forEach((mediaToMirror) => {
            // Skip media tracks that we already have
            if (this.mediaTracks.find(({ mid }) => mid === mediaToMirror.mid!)) return;

            const mid = mediaToMirror.mid!.toString();
            const direction = sdpDirectionToNDCDirection(mediaToMirror.direction);

            const media = mediaToMirror.type === 'video'
                ? new NodeDataChannel.Video(mid, direction)
                : new NodeDataChannel.Audio(mid, direction)

            // Copy SSRC data (awkward translation between per-attr and full-value structures)
            mediaToMirror.ssrcs?.forEach((ssrc) => {
                media.addSSRC(
                    parseInt(ssrc.id.toString(), 10),
                    mediaToMirror.ssrcs!.find(attr => attr.attribute === 'cname')?.value,
                    mediaToMirror.ssrcs!.find(attr => attr.attribute === 'msid')?.value
                );
            });

            this.rawConn!.addTrack(media);
        });

        let setupChannel: NodeDataChannel.DataChannel | undefined;
        const channelRequiredForDescription = this.rawConn.gatheringState() === 'new' &&
            !mediaStreamsToMirror.length;
        if (shouldMirrorDataStream || channelRequiredForDescription) {
            // See getLocalDescription() above: if we want a description and we have no media, we
            // need to make a stub channel to allow us to negotiate _something_.
            // In addition, we might actually have data channels to mirror. In that case, we need
            // to create a temporary data channel to force that negotiation (which will be closed again
            // shortly, so that it never actually gets created).
            setupChannel = this.rawConn.createDataChannel('mockrtc.setup-channel');
        }
        this.rawConn.setLocalDescription(NodeDataChannel.DescriptionType.Offer);
        await new Promise<void>((resolve) => {
            this.rawConn!.onGatheringStateChange((state) => {
                if (state === 'complete') resolve();
            });

            // Handle race conditions where gathering has already completed
            if (this.rawConn!.gatheringState() === 'complete') resolve();
        });

        if (!this.rawConn) throw new Error("Connection was closed while building local description");

        const sessionDescription = this.rawConn.localDescription();
        setupChannel?.close(); // Close the temporary setup channel, if we created one

        // There's a few additional changes we have to make, which require mutating the SDP manually:
        const createdSDP = SDP.parse(sessionDescription.sdp!);
        createdSDP.msidSemantic = offerToMirror.msidSemantic;

        const createdMediaStreams = createdSDP.media.filter(m => m.type !== 'application');
        createdMediaStreams.forEach((media) => {
            const mediaToMirror = offerToMirror.media
                .find((offeredMedia) => offeredMedia.mid === media.mid);
            if (!mediaToMirror) {
                throw new Error(`Unexpected mid ${media.mid} in external offer`);
            }

            if (media.type !== mediaToMirror.type) {
                throw new Error(`Unexpected ${media.type} stream with mid ${media.mid} - can't mirror`);
            }

            // Copy all the semantic parameters of the RTP & RTCP streams themselves,
            // but don't copy the fingerprint or similar:
            media.msid = mediaToMirror.msid;
            media.protocol = mediaToMirror.protocol;
            media.ext = mediaToMirror.ext;
            media.payloads = mediaToMirror.payloads;
            media.rtp = mediaToMirror.rtp;
            media.fmtp = mediaToMirror.fmtp;
            media.rtcp = mediaToMirror.rtcp;
            media.rtcpFb = mediaToMirror.rtcpFb;
            media.ssrcGroups = mediaToMirror.ssrcGroups;

            // Although we do set the SSRC info in libdatachannel, as it's used internally, it doesn't
            // support all the attributes that may be included, we copy the raw SDP across here too:
            media.ssrcs = mediaToMirror.ssrcs;
        });

        sessionDescription.sdp = SDP.write(createdSDP);
        return sessionDescription as RTCSessionDescriptionInit;
    }

    waitUntilConnected() {
        return new Promise<void>((resolve, reject) => {
            if (!this.rawConn) throw new Error("Connection closed while/before waiting until connected");

            this.on('connection-state-changed', (state) => {
                if (state === 'connected') resolve();
                if (state === 'failed') {
                    reject(new Error("Connection failed while waiting for connection"));
                }
            });

            if (this.rawConn.state() === 'connected') resolve();
            if (this.rawConn.state() === 'failed') {
                reject(new Error("Connection failed while waiting for connection"));
            }
        });
    }

    readonly sessionApi: MockRTCSessionAPI = {
        createOffer: async (options: OfferOptions = {}): Promise<RTCSessionDescriptionInit> => {
            if (options.mirrorSdp) {
                return this.getMirroredLocalOffer(options.mirrorSdp);
            } else {
                return this.getLocalDescription();
            }
        },

        completeOffer: async (answer: RTCSessionDescriptionInit): Promise<void> => {
            this.setRemoteDescription(answer);
        },

        answerOffer: (offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> => {
            this.setRemoteDescription(offer);
            return this.getLocalDescription();
        }
    };

    async close() {
        if (!this.rawConn) return; // Already closed

        const { rawConn } = this;
        this.rawConn = null; // Drop the reference, so nothing tries to use it after close

        if (rawConn.state() === 'closed') return;
        rawConn.close();
        this.emit('connection-closed');
    }

}

const sdpDirectionToNDCDirection = (direction: SDP.SharedAttributes['direction']): NodeDataChannel.Direction => {
    if (direction === 'inactive') return NodeDataChannel.Direction.Inactive;
    else if (direction?.length === 8) {
        return direction[0].toUpperCase() +
            direction.slice(1, 4) +
            direction[4].toUpperCase() +
            direction.slice(5) as NodeDataChannel.Direction;
    } else {
        return NodeDataChannel.Direction.Unknown;
    }
};