"use strict";
// Minimal compatibility shim exposing just the two `unzipper` entry points
// electron-builder's app-builder-lib actually calls (Open.file, Parse),
// backed by yauzl - a maintained, actively-patched zip reader (used by
// VS Code and Electron itself) with no open CVEs against the pinned
// version, instead of a personal fork of an unmaintained package.
const yauzl = require("yauzl");
const { Duplex, Readable } = require("stream");

function isDirectoryName(name) {
    return /[/\\]$/.test(name);
}

const Open = {
    file(file) {
        return new Promise((resolve, reject) => {
            yauzl.open(file, {
                lazyEntries: false,
                // Reject truncated entries instead of exposing attacker
                // controlled decompression output to downstream consumers.
                validateEntrySizes: true,
            }, (err, zipfile) => {
                if (err) return reject(err);
                const files = [];
                zipfile.on("entry", (entry) => {
                    files.push({
                        path: entry.fileName,
                        externalFileAttributes: entry.externalFileAttributes,
                    });
                });
                zipfile.on("end", () => resolve({ files }));
                zipfile.on("error", reject);
            });
        });
    },
};

function decorateEntry(stream, path, type) {
    stream.path = path;
    stream.type = type;
    stream.autodrain = function () {
        // Draining an already-ended/empty stream, or one nobody reads from,
        // is a no-op; resume() ensures a real unread stream doesn't block.
        if (typeof stream.resume === "function") stream.resume();
        return stream;
    };
    stream.buffer = function () {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on("data", (c) => chunks.push(c));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
        });
    };
    return stream;
}

function Parse() {
    const chunks = [];
    const duplex = new Duplex({
        objectMode: true,
        write(chunk, encoding, cb) {
            chunks.push(chunk);
            cb();
        },
        read() {
            // Pulling is driven entirely by the async pump started in _final;
            // nothing to do here.
        },
    });

    duplex._final = function (cb) {
        const buffer = Buffer.concat(chunks);
        yauzl.fromBuffer(buffer, {
            lazyEntries: true,
            validateEntrySizes: true,
        }, (err, zipfile) => {
            if (err) {
                duplex.destroy(err);
                return cb(err);
            }
            zipfile.on("error", (e) => duplex.destroy(e));
            zipfile.on("end", () => {
                duplex.push(null);
                cb();
            });
            zipfile.on("entry", (entry) => {
                const path = entry.fileName;
                if (isDirectoryName(path)) {
                    const empty = Readable.from([]);
                    duplex.push(decorateEntry(empty, path, "Directory"));
                    zipfile.readEntry();
                    return;
                }
                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr) {
                        duplex.destroy(streamErr);
                        return;
                    }
                    duplex.push(decorateEntry(readStream, path, "File"));
                    readStream.on("end", () => zipfile.readEntry());
                    readStream.on("error", () => zipfile.readEntry());
                    // If the consumer only calls .buffer() (symlink targets),
                    // "end" above still fires once buffering finishes reading
                    // to completion, so readEntry() is always eventually
                    // called. If the consumer pipes the stream and pipeline()
                    // hasn't started reading yet, "end" still only fires
                    // after the pipe drains it. Either way we advance once.
                });
            });
            zipfile.readEntry();
        });
    };

    return duplex;
}

module.exports = { Open, Parse };
