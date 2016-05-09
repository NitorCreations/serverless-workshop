#!/bin/bash
set -x
rm ingestlambda.zip
zip -r ingestlambda.zip ingest.js node_modules
aws s3 cp ingestlambda.zip s3://nitor-serverless-workshop/ingestlambda/ingestlambda.zip
