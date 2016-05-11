'use strict';

var lib = require('../lib');
var LineStream = require('byline').LineStream;
var stream = require('stream');
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();


module.exports.handler = function(event, context, cb) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  process.env["SERVERLESS_REGION"] = process.env.AWS_DEFAULT_REGION;
  process.env["SERVERLESS_PROJECT_NAME"] = "slss-workshop";
  ServerlessHelpers.CF.loadVars()
  .then(function() {
    lib.esDomain['endpoint'] = process.env.SERVERLESS_CF_ESDomainEndpoint;
    var lineStream = new LineStream();
    // A stream of log records, from parsing each log line
    var recordStream = new stream.Transform({objectMode: true});
    var first = true;
    var runData = {
      totLines: 0,
      numDocsAdded: 0,
      postsInProgress: 0
    };
    recordStream._transform = function(line, encoding, done) {
      if (!first) {
        var taxRecord = lib.parse(line.toString(), runData);
        var serializedRecord = JSON.stringify(taxRecord);
        this.push(serializedRecord);
      } else {
        first = false;
      }
      done();
    };

    event.Records.forEach(function(record) {
      var bucket = record.s3.bucket.name;
      var objKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      lib.s3LinesToES(bucket, objKey, context, lineStream, recordStream, runData);
    });

  })
  .catch(function(err) {
    return context.done(err, null);
  });

};
