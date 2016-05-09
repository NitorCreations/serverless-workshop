'use strict';

var lib = require('../lib');
var LineStream = require('byline').LineStream;
var stream = require('stream');
var first = true;

module.exports.handler = function(event, context, cb) {
  console.log('Received event: ', JSON.stringify(event, null, 2));

  var lineStream = new LineStream();
  // A stream of log records, from parsing each log line
  var recordStream = new stream.Transform({objectMode: true})
  recordStream._transform = function(line, encoding, done) {
    if (!first) {
      var taxRecord = lib.parse(line.toString());
      var serializedRecord = JSON.stringify(taxRecord);
      this.push(serializedRecord);
    } else {
      first = false;
    }
    done();
  }

  event.Records.forEach(function(record) {
    var bucket = record.s3.bucket.name;
    var objKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    lib.s3LinesToES(bucket, objKey, context, lineStream, recordStream);
  });
};
