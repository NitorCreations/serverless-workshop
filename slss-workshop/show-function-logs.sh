#!/bin/bash

usage() {
  if [ "$1" ]; then
    echo "$1"
  fi
  echo "usage: $0 <function-name> "
  exit 1
}

if [ "$1" ]; then
  FUNCTION="$1"
else
  usage
fi

PROJECT=$(for i in _meta/variables/s-variables-*.json; do jq -r '.|select(.project != null)|.project' < $i; done)
STAGE=$(for i in _meta/variables/s-variables-*.json; do jq -r '.|select(.stage != null)|.stage' < $i; done)
VERSION=$(aws lambda get-alias --function-name $PROJECT-$FUNCTION --name $STAGE  | jq -r '.FunctionVersion')

if STREAMS=$(aws logs describe-log-streams --log-group-name "/aws/lambda/$PROJECT-$FUNCTION" | jq -r ".logStreams[].logStreamName" | grep "$(date +%Y/%m/%d/)\[$VERSION\]"); then
  for STREAM in $STREAMS; do aws logs get-log-events --log-group-name "/aws/lambda/$PROJECT-$FUNCTION" --log-stream-name $STREAM | jq -r '.events[].message' | grep -v "^$"; done
else
  echo "No stream found"
  exit 1
fi
