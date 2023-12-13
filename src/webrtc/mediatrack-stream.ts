/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import type * as NodeDataChannel from 'node-datachannel';

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
            this._totalBytesReceived += msg.byteLength;

            if (!this._readActive) return; // If the buffer is full, drop messages.

            // If the push is rejected, we pause reading until the next call to _read().
            this._readActive = this.push(msg);
        });

        // When the DataChannel closes, the readable & writable ends close
        rawTrack.onClosed(() => this.close());

        rawTrack.onError((errMsg) => {
            this.destroy(new Error(`Media track error: ${errMsg}`));
        });

        // Buffer all writes until the DataChannel opens
        if (!rawTrack.isOpen()) {
            this.cork();
            rawTrack.onOpen(() => {
                this.uncork();
                this._isOpen = true;
                this.emit('track-open');
            });
        } else {
            setImmediate(() => {
                this._isOpen = true;
                this.emit('track-open');
            });
        }
    }

    private _isOpen = false;
    get isOpen() {
        return this._isOpen;
    }

    private _totalBytesSent = 0;
    get totalBytesSent() {
        return this._totalBytesSent;
    }

    private _totalBytesReceived = 0;
    get totalBytesReceived() {
        return this._totalBytesReceived;
    }

    private close() {
        this.push(null);
        this.destroy();
    }

    private _readActive = true;
    _read() {
        // Stop dropping messages, if the buffer filling up meant we were doing so before.
        this._readActive = true;
    }

    _write(chunk: Buffer, _encoding: string, callback: (error: Error | null) => void) {
        let sentOk: boolean;

        if (this.rawTrack.isClosed()) {
            // isClosed becomes true and writes start failing just before onClosed() fires, so here we
            // drop pending writes as soon as we notice.
            this.close();
            return;
        }

        try {
            sentOk = this.rawTrack.sendMessageBinary(chunk);
            this._totalBytesSent += chunk.byteLength;
        } catch (err: any) {
            return callback(err);
        }

        if (sentOk) {
            callback(null);
        } else {
            callback(new Error("Failed to write to media track"));
        }
    }

    _writev(chunks: Array<{ chunk: any; encoding: BufferEncoding; }>, callback: (error?: Error | null) => void) {
        let sentOk: boolean;

        if (this.rawTrack.isClosed()) {
            // isClosed becomes true and writes start failing just before onClosed() fires, so here we
            // drop pending writes as soon as we notice.
            this.close();
            return;
        }

        try {
            const combinedChunks = Buffer.concat(chunks.map(c => c.chunk));
            sentOk = this.rawTrack.sendMessageBinary(combinedChunks);
            this._totalBytesSent += combinedChunks.byteLength;
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