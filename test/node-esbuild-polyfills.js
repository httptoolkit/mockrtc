// A fork of https://www.npmjs.com/package/@esbuild-plugins/node-modules-polyfill, but using
// the modern polyfills from https://www.npmjs.com/package/node-stdlib-browser.

const escapeStringRegexp = require('escape-string-regexp')
const fs = require('fs')
const path = require('path')

const EMPTY_PATH = require.resolve(
    'rollup-plugin-node-polyfills/polyfills/empty.js',
)

function builtinsPolyfills() {
    const libs = new Map()

    libs.set(
        'process',
        require.resolve('rollup-plugin-node-polyfills/polyfills/process-es6'),
    )
    libs.set(
        'buffer',
        require.resolve('rollup-plugin-node-polyfills/polyfills/buffer-es6'),
    )
    libs.set(
        'util',
        require.resolve('util/util.js'),
    )
    libs.set('sys', libs.get('util'))
    libs.set(
        'events',
        require.resolve('rollup-plugin-node-polyfills/polyfills/events'),
    )
    libs.set(
        'stream',
        require.resolve('rollup-plugin-node-polyfills/polyfills/stream'),
    )
    libs.set(
        'path',
        require.resolve('rollup-plugin-node-polyfills/polyfills/path'),
    )
    libs.set(
        'querystring',
        require.resolve('rollup-plugin-node-polyfills/polyfills/qs'),
    )
    libs.set(
        'punycode',
        require.resolve('rollup-plugin-node-polyfills/polyfills/punycode'),
    )
    libs.set(
        'url',
        require.resolve('rollup-plugin-node-polyfills/polyfills/url'),
    )
    libs.set(
        'string_decoder',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/string-decoder',
        ),
    )
    libs.set(
        'http',
        require.resolve('rollup-plugin-node-polyfills/polyfills/http'),
    )
    libs.set(
        'https',
        require.resolve('rollup-plugin-node-polyfills/polyfills/http'),
    )
    libs.set('os', require.resolve('rollup-plugin-node-polyfills/polyfills/os'))
    libs.set(
        'assert',
        require.resolve('rollup-plugin-node-polyfills/polyfills/assert'),
    )
    libs.set(
        'constants',
        require.resolve('rollup-plugin-node-polyfills/polyfills/constants'),
    )
    libs.set(
        '_stream_duplex',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/readable-stream/duplex',
        ),
    )
    libs.set(
        '_stream_passthrough',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough',
        ),
    )
    libs.set(
        '_stream_readable',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/readable-stream/readable',
        ),
    )
    libs.set(
        '_stream_writable',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/readable-stream/writable',
        ),
    )
    libs.set(
        '_stream_transform',
        require.resolve(
            'rollup-plugin-node-polyfills/polyfills/readable-stream/transform',
        ),
    )
    libs.set(
        'timers',
        require.resolve('rollup-plugin-node-polyfills/polyfills/timers'),
    )
    libs.set(
        'console',
        require.resolve('rollup-plugin-node-polyfills/polyfills/console'),
    )
    libs.set('vm', require.resolve('rollup-plugin-node-polyfills/polyfills/vm'))
    libs.set(
        'zlib',
        require.resolve('rollup-plugin-node-polyfills/polyfills/zlib'),
    )
    libs.set(
        'tty',
        require.resolve('rollup-plugin-node-polyfills/polyfills/tty'),
    )
    libs.set(
        'domain',
        require.resolve('rollup-plugin-node-polyfills/polyfills/domain'),
    )

    // not shimmed
    libs.set('dns', EMPTY_PATH)
    libs.set('dgram', EMPTY_PATH)
    libs.set('child_process', EMPTY_PATH)
    libs.set('cluster', EMPTY_PATH)
    libs.set('module', EMPTY_PATH)
    libs.set('net', EMPTY_PATH)
    libs.set('readline', EMPTY_PATH)
    libs.set('repl', EMPTY_PATH)
    libs.set('tls', EMPTY_PATH)
    libs.set('fs', EMPTY_PATH)
    libs.set('crypto', EMPTY_PATH)

    // libs.set(
    //     'fs',
    //     require.resolve('rollup-plugin-node-polyfills/polyfills/browserify-fs'),
    // )

    // TODO enable crypto and fs https://github.com/ionic-team/rollup-plugin-node-polyfills/issues/20
    // libs.set(
    //     'crypto',
    //     require.resolve(
    //         'rollup-plugin-node-polyfills/polyfills/crypto-browserify',
    //     ),
    // )

    return libs
}

// import { NodeResolvePlugin } from '@esbuild-plugins/node-resolve'
const NAME = 'node-modules-polyfills'
const NAMESPACE = NAME

function removeEndingSlash(importee) {
    if (importee && importee.slice(-1) === '/') {
        importee = importee.slice(0, -1)
    }
    return importee
}

exports.NodeModulesPolyfillPlugin = function NodeModulesPolyfillPlugin(options = {}) {
    const { namespace = NAMESPACE, name = NAME } = options
    if (namespace.endsWith('commonjs')) {
        throw new Error(`namespace ${namespace} must not end with commonjs`)
    }
    // this namespace is needed to make ES modules expose their default export to require: require('assert') will give you import('assert').default
    const commonjsNamespace = namespace + '-commonjs'
    const polyfilledBuiltins = builtinsPolyfills()
    const polyfilledBuiltinsNames = [...polyfilledBuiltins.keys()]

    return {
        name,
        setup: function setup({ onLoad, onResolve, initialOptions }) {
            // polyfills contain global keyword, it must be defined
            if (initialOptions?.define && !initialOptions.define?.global) {
                initialOptions.define['global'] = 'globalThis'
            } else if (!initialOptions?.define) {
                initialOptions.define = { global: 'globalThis' }
            }

            // TODO these polyfill module cannot import anything, is that ok?
            async function loader(args) {
                try {
                    const isCommonjs = args.namespace.endsWith('commonjs')

                    const resolved = polyfilledBuiltins.get(
                        removeEndingSlash(args.path),
                    )
                    const contents = await (
                        await fs.promises.readFile(resolved)
                    ).toString()
                    let resolveDir = path.dirname(resolved)

                    if (isCommonjs) {
                        return {
                            loader: 'js',
                            contents: commonJsTemplate({
                                importPath: args.path,
                            }),
                            resolveDir,
                        }
                    }
                    return {
                        loader: 'js',
                        contents,
                        resolveDir,
                    }
                } catch (e) {
                    console.error('node-modules-polyfill', e)
                    return {
                        contents: `export {}`,
                        loader: 'js',
                    }
                }
            }
            onLoad({ filter: /.*/, namespace }, loader)
            onLoad({ filter: /.*/, namespace: commonjsNamespace }, loader)
            const filter = new RegExp(
                polyfilledBuiltinsNames.map(escapeStringRegexp).join('|'), // TODO builtins could end with slash, keep in mind in regex
            )
            async function resolver(args) {
                const ignoreRequire = args.namespace === commonjsNamespace

                if (!polyfilledBuiltins.has(args.path)) {
                    return
                }

                const isCommonjs =
                    !ignoreRequire && args.kind === 'require-call'

                return {
                    namespace: isCommonjs ? commonjsNamespace : namespace,
                    path: args.path,
                }
            }
            onResolve({ filter }, resolver)
            // onResolve({ filter: /.*/, namespace }, resolver)
        },
    }
}

function commonJsTemplate({ importPath }) {
    return `
const polyfill = require('${importPath}')
if (polyfill && polyfill.default) {
    module.exports = polyfill.default
    for (let k in polyfill) {
        module.exports[k] = polyfill[k]
    }
} else if (polyfill)  {
    module.exports = polyfill
}
`
}