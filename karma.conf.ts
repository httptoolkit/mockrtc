/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

const CONTINUOUS = process.env.CONTINUOUS_TEST === 'true';
const HEADFUL = process.env.HEADFUL_TEST === 'true';

import * as ChildProcess from 'child_process';

import { NodeModulesPolyfillPlugin } from './test/node-esbuild-polyfills';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

if (CONTINUOUS) {
    const adminProc = ChildProcess.spawn(
        "./node_modules/.bin/node-dev",
        [
            '--notify=false',
            './test/start-test-admin-server.ts'
        ],
        { stdio: 'inherit' }
    );

    process.on('exit', () => adminProc.kill());

    adminProc.on('exit', (code) => {
        process.exit(code ?? 0); // Signalled = null = we killed it
    });
} else {
    require('./test/start-test-admin-server');
}

module.exports = function(config: any) {
    config.set({
        frameworks: ['mocha', 'chai'],
        files: [
            'test/**/*.spec.ts'
        ],
        preprocessors: {
            'src/**/*.ts': ['esbuild'],
            'test/**/*.ts': ['esbuild']
        },
        esbuild: {
            format: 'esm',
            target: 'esnext',
            external: ['brotli-wasm'],
            plugins: [
                NodeModulesPolyfillPlugin(),
                NodeGlobalsPolyfillPlugin({
                    process: true,
                    buffer: true
                })
            ]
        },
        plugins: [
            'karma-chrome-launcher',
            'karma-chai',
            'karma-mocha',
            'karma-spec-reporter',
            'karma-esbuild'
        ],
        reporters: ['spec'],
        port: 9876,
        logLevel: config.LOG_INFO,

        browsers: HEADFUL
            ? ['Chrome']
            : ['ChromeHeadless'],

        autoWatch: CONTINUOUS,
        singleRun: !CONTINUOUS,
        concurrency: Infinity
    });
};