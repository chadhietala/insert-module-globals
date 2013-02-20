var parseScope = require('lexical-scope');
var browserResolve = require('browser-resolve');
var commondir = require('commondir');
var through = require('through');
var mdeps = require('module-deps');

var path = require('path');
var processModulePath = require.resolve('process/browser.js');

module.exports = function (files, opts) {
    if (!opts) opts = {};
    var resolver = opts.resolve || browserResolve;
    
    var basedir = files.length
        ? commondir(files.map(path.dirname))
        : '/'
    ;
    var resolvedProcess = false;
    
    return through(function (row) {
        var tr = this;
        if (!/\bprocess\b/.test(row.source)
            && !/\bglobal\b/.test(row.source)
            && !/\b__filename\b/.test(row.source)
            && !/\b__dirname\b/.test(row.source)
        ) return tr.queue(row);
        
        var scope = parseScope(row.source);
        var globals = {};
        
        if (scope.globals.implicit.indexOf('process') >= 0) {
            if (!resolvedProcess) {
                tr.pause();
                
                var d = mdeps(processModulePath, { resolve: resolver });
                d.on('data', function (r) {
                    r.entry = false;
                    tr.emit('data', r);
                });
                d.on('end', function () { tr.resume() });
            }
            
            resolvedProcess = true;
            row.deps.__browser_process = processModulePath;
            globals.process = 'require("__browser_process")';
        }
        if (scope.globals.implicit.indexOf('global') >= 0) {
            globals.global = 'window';
        }
        if (scope.globals.implicit.indexOf('__filename') >= 0) {
            var file = '/' + path.relative(basedir, row.id);
            globals.__filename = JSON.stringify(file);
        }
        if (scope.globals.implicit.indexOf('__dirname') >= 0) {
            var dir = path.dirname('/' + path.relative(basedir, row.id));
            globals.__dirname = JSON.stringify(dir);
        }
        
        var keys = Object.keys(globals);
        row.source = '(function(' + keys + '){' + row.source + '\n})('
            + keys.map(function (key) { return globals[key] }).join(',') + ')'
        ;
        
        tr.queue(row);
    });
};