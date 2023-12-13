/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream';
import type * as NodeDataChannel from 'node-datachannel';

/**
 * Turns a node-datachannel DataChannel into a real Node.js stream, complete with
 * buffering, backpressure (up to a point - if the buffer fills up, messages are dropped),
 * and support for piping data elsewhere.
 *
 * Read & written data may be either UTF-8 strings or Buffers - this difference exists at
 * the protocol level, and is preserved here throughout.
 */
export class DataChannelStream extends stream.Duplex {

    constructor(
        private rawChannel: NodeDataChannel.DataChannel,
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
            objectMode: true // Preserve the string/buffer distinction (WebRTC treats them differently)
        });

        rawChannel.onMessage((msg) => {
            // Independently of the stream and it's normal events, we also fire our own
            // read/wrote-data events, used for MockRTC event subscriptions. These aren't
            // buffered, and this ensures that those events do not consume data that will
            // separately be processed by handler steps.
            this.emit('read-data', msg);

            if (!this._readActive) return; // If the buffer is full, drop messages.

            // If the push is rejected, we pause reading until the next call to _read().
            this._readActive = this.push(msg);
        });

        // When the DataChannel closes, the readable & writable ends close
        rawChannel.onClosed(() => {
            this.push(null);
            this.destroy();
        });

        rawChannel.onError((errMsg) => {
            this.destroy(new Error(`DataChannel error: ${errMsg}`));
        });

        // Buffer all writes until the DataChannel opens
        if (!rawChannel.isOpen()) {
            this.cork();
            rawChannel.onOpen(() => {
                this.uncork();
                this._isOpen = true;
                this.emit('channel-open');
            });
        } else {
            setImmediate(() => {
                this._isOpen = true;
                this.emit('channel-open');
            });
        }
    }

    private _isOpen = false;
    get isOpen() {
        return this._isOpen;
    }

    private _readActive = true;
    _read() {
        // Stop dropping messages, if the buffer filling up meant we were doing so before.
        this._readActive = true;
    }

    _write(chunk: string | Buffer | unknown, encoding: string, callback: (error: Error | null) => void) {
        let sentOk: boolean;

        try {
            if (Buffer.isBuffer(chunk)) {
                sentOk = this.rawChannel.sendMessageBinary(chunk);
            } else if (typeof chunk === 'string') {
                sentOk = this.rawChannel.sendMessage(chunk);
            } else {
                const typeName = (chunk as object).constructor.name || typeof chunk;
                throw new Error(`Cannot write ${typeName} to DataChannel stream`);
            }

            this.emit('wrote-data', chunk);
        } catch (err: any) {
            return callback(err);
        }

        if (sentOk) {
            callback(null);
        } else {
            callback(new Error("Failed to write to DataChannel"));
        }
    }

    _final(callback: (error: Error | null) => void) {
        if (!this.allowHalfOpen) this.destroy();
        callback(null);
    }

    _destroy(maybeErr: Error | null, callback: (error: Error | null) => void) {
        // When the stream is destroyed, we close the DataChannel.
        this.rawChannel.close();
        callback(maybeErr);
    }

    get id() {
        return this.rawChannel.getId();
    }

    get label() {
        return this.rawChannel.getLabel();
    }

    get protocol() {
        return this.rawChannel.getProtocol();
    }

}