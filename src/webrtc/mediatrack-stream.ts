/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import * as NodeDataChannel from 'node-datachannel';

const { Direction } = NodeDataChannel;

/**
 * Turns a node-datachannel media track into a real Node.js stream, complete with
 * buffering, backpressure (up to a point - if the buffer fills up, messages are dropped),
 * and support for piping data elsewhere.
 */
export class MediaTrackStream extends stream.Duplex {

    constructor(
        private rawTrack: NodeDataChannel.Track,
        streamOptions: {
            // These are the only Duplex options supported:
            readableHighWaterMark?: number | undefined;
            writableHighWaterMark?: number | undefined;
            allowHalfOpen?: boolean;
        } = {}
    ) {
        super({
            allowHalfOpen: false, // Default to autoclose on end().
            ...streamOptions,
        });

        rawTrack.onMessage((msg) => {
            if (!this._readActive) return; // If the buffer is full, drop messages.

            // If the push is rejected, we pause reading until the next call to _read().
            this._readActive = this.push(msg);
        });

        // When the DataChannel closes, the readable & writable ends close
        rawTrack.onClosed(() => {
            this.push(null);
            this.destroy();
        });

        rawTrack.onError((errMsg) => {
            this.destroy(new Error(`Media track error: ${errMsg}`));
        });

        // Buffer all writes until the DataChannel opens
        if (!rawTrack.isOpen()) {
            this.cork();
            rawTrack.onOpen(() => this.uncork());
        }
    }

    private _readActive = true;
    _read() {
        // Stop dropping messages, if the buffer filling up meant we were doing so before.
        this._readActive = true;
    }

    _write(chunk: Buffer, _encoding: string, callback: (error: Error | null) => void) {
        let sentOk: boolean;

        try {
            sentOk = this.rawTrack.sendMessageBinary(chunk);
        } catch (err: any) {
            return callback(err);
        }

        if (sentOk) {
            callback(null);
        } else {
            callback(new Error("Failed to write to media track"));
        }
    }

    _final(callback: (error: Error | null) => void) {
        if (!this.allowHalfOpen) this.destroy();
        callback(null);
    }

    _destroy(maybeErr: Error | null, callback: (error: Error | null) => void) {
        // When the stream is destroyed, we close the DataChannel.
        this.rawTrack.close();
        callback(maybeErr);
    }

    get direction() {
        return this.rawTrack.direction();
    }

    get mid() {
        return this.rawTrack.mid();
    }

    get type() {
        return this.rawTrack.type();
    }

}